import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

export const STATE_DIR = join(
  process.env.XDG_STATE_HOME || join(homedir(), ".local/state"),
  "clamav",
);

export const HISTORY_PATH = join(STATE_DIR, "history.json");
export const IGNORE_PATH = join(STATE_DIR, "ignore.json");
export const QUARANTINE_DIR = join(STATE_DIR, "quarantine");
export const FILELIST_PATH = join(STATE_DIR, "filelist.nul");
const NOTIFY_STAMP = join(STATE_DIR, "notified.json");
const MAX_HISTORY = 80;

export type Hit = {
  path: string;
  signature: string;
};

export type ScanKind = "full" | "quick" | "path";

export type ScanRun = {
  id: string;
  kind: ScanKind;
  targets: string[];
  state: string;
  phase?: string;
  startedAt: string | null;
  endedAt: string | null;
  elapsedSec: number;
  scanElapsedSec?: number;
  total: number | null;
  done: number;
  percent: number | null;
  infected: number;
  hits: Hit[];
  log: string | null;
  filelist?: string | null;
  applyExcludes?: boolean;
};

export type IgnoreList = {
  paths: string[];
  signatures: string[];
};

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function readHistory(): ScanRun[] {
  const items = readJson<ScanRun[]>(HISTORY_PATH, []);
  return Array.isArray(items) ? items : [];
}

export function upsertHistory(run: ScanRun): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const items = readHistory().filter((r) => r.id !== run.id);
  items.unshift(run);
  writeFileSync(HISTORY_PATH, JSON.stringify(items.slice(0, MAX_HISTORY), null, 2) + "\n");
}

export function getHistoryRun(id: string): ScanRun | null {
  return readHistory().find((r) => r.id === id) ?? null;
}

export function readIgnore(): IgnoreList {
  const raw = readJson<Partial<IgnoreList>>(IGNORE_PATH, {});
  return {
    paths: Array.isArray(raw.paths) ? raw.paths : [],
    signatures: Array.isArray(raw.signatures) ? raw.signatures : [],
  };
}

export function writeIgnore(list: IgnoreList): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(IGNORE_PATH, JSON.stringify(list, null, 2) + "\n");
}

export function isIgnored(hit: Hit, list: IgnoreList = readIgnore()): boolean {
  return list.paths.includes(hit.path) || list.signatures.includes(hit.signature);
}

export function ignoreHit(hit: Hit, by: "path" | "signature"): IgnoreList {
  const list = readIgnore();
  if (by === "path" && !list.paths.includes(hit.path)) list.paths.push(hit.path);
  if (by === "signature" && !list.signatures.includes(hit.signature)) {
    list.signatures.push(hit.signature);
  }
  writeIgnore(list);
  return list;
}

export function visibleHits(hits: Hit[]): Hit[] {
  const list = readIgnore();
  return hits.filter((h) => !isIgnored(h, list));
}

export function quarantineFile(path: string): string {
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  mkdirSync(QUARANTINE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(QUARANTINE_DIR, `${stamp}__${basename(path)}`);
  try {
    renameSync(path, dest);
  } catch {
    copyFileSync(path, dest);
    unlinkSync(path);
  }
  const manifest = join(QUARANTINE_DIR, "manifest.json");
  const rows = readJson<{ original: string; quarantined: string; at: string }[]>(
    manifest,
    [],
  );
  rows.unshift({
    original: path,
    quarantined: dest,
    at: new Date().toISOString(),
  });
  writeFileSync(manifest, JSON.stringify(rows, null, 2) + "\n");
  return dest;
}

export function parentDir(path: string): string {
  return dirname(path) || homedir();
}

export function canResumeRun(run: ScanRun | null): boolean {
  if (!run) return false;
  if (run.state === "done" || run.state === "cancelled") return false;
  return (
    run.state === "counting" ||
    run.state === "scanning" ||
    run.state === "interrupted" ||
    run.phase === "counting" ||
    run.phase === "scanning"
  );
}

export function notifiedKey(): string | null {
  const raw = readJson<{ key?: string }>(NOTIFY_STAMP, {});
  return raw.key ?? null;
}

export function setNotifiedKey(key: string): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(NOTIFY_STAMP, JSON.stringify({ key }, null, 2) + "\n");
}

export function restoreRunCheckpoint(run: ScanRun): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const payload = {
    ...run,
    pid: null,
    updatedAt: new Date().toISOString().slice(0, 19),
  };
  writeFileSync(join(STATE_DIR, "progress.json"), JSON.stringify(payload, null, 2) + "\n");
}

export function writeProgressPatch(patch: Record<string, unknown>): void {
  const path = join(STATE_DIR, "progress.json");
  const cur = readJson<Record<string, unknown>>(path, {});
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString().slice(0, 19) };
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
}

export function kindLabel(kind: string | undefined): string {
  if (kind === "quick") return "Quick";
  if (kind === "path") return "Path";
  return "Full";
}
