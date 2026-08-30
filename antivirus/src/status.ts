import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  canResumeRun,
  upsertHistory,
  writeProgressPatch,
} from "./history";

const execFileAsync = promisify(execFile);

export const STATE_DIR = join(
  process.env.XDG_STATE_HOME || join(homedir(), ".local/state"),
  "clamav",
);

export const PROGRESS_PATH = join(STATE_DIR, "progress.json");
export const SCAN_PID_PATH = join(STATE_DIR, "scan.pid");

const OFFICIAL = new Set([
  "main.cvd",
  "main.cld",
  "daily.cvd",
  "daily.cld",
  "bytecode.cvd",
  "bytecode.cld",
  "freshclam.dat",
]);

export type ScanSummary = {
  infected: number | null;
  scannedFiles: number | null;
  found: string[];
  time: string | null;
};

export type ScanProgress = {
  state: "counting" | "scanning" | "done" | "cancelled" | "interrupted" | "error" | string;
  phase?: string;
  id?: string;
  kind?: string;
  targets?: string[];
  startedAt: string | null;
  updatedAt: string | null;
  endedAt?: string | null;
  elapsedSec: number;
  scanElapsedSec?: number;
  total: number | null;
  done: number;
  percent: number | null;
  etaSec: number | null;
  infected: number;
  current: string | null;
  log: string | null;
  message: string | null;
  hits?: { path: string; signature: string }[];
  filelist?: string | null;
  applyExcludes?: boolean;
};

export type RkhunterSummary = {
  filesChecked: number | null;
  suspectFiles: number | null;
  rootkits: number | null;
  warnings: boolean | null;
  took: string | null;
};

export type SigAge = {
  officialHours: number | null;
  officialLabel: string;
  unofficialHours: number | null;
  unofficialLabel: string;
};

export type AvStatus = {
  clamdActive: boolean;
  signatures: number | null;
  unofficialCount: number;
  unofficialNames: string[];
  scanRunning: boolean;
  scanPid: number | null;
  lastLog: string | null;
  lastSummary: ScanSummary | null;
  rkhunterLog: string | null;
  rkhunter: RkhunterSummary | null;
  progress: ScanProgress | null;
  resumable: boolean;
  sigAge: SigAge;
};

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readPidFile(): number | null {
  if (!existsSync(SCAN_PID_PATH)) return null;
  try {
    const pid = Number.parseInt(readFileSync(SCAN_PID_PATH, "utf8").trim(), 10);
    return Number.isFinite(pid) && pidAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function findScanPid(): Promise<number | null> {
  const fromFile = readPidFile();
  if (fromFile) return fromFile;
  const uid = String(process.getuid?.() ?? 1000);
  for (const name of ["av-scan", "clamdscan", "clamscan"]) {
    try {
      const { stdout } = await execFileAsync("/usr/bin/pgrep", ["-n", "-u", uid, name]);
      const pid = Number.parseInt(stdout.trim(), 10);
      if (Number.isFinite(pid) && pidAlive(pid)) return pid;
    } catch {
      // none
    }
  }
  return null;
}

export function readProgress(): ScanProgress | null {
  if (!existsSync(PROGRESS_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(PROGRESS_PATH, "utf8")) as Partial<ScanProgress>;
    return {
      state: String(raw.state ?? "unknown"),
      phase: raw.phase,
      id: raw.id,
      kind: raw.kind,
      targets: raw.targets,
      startedAt: raw.startedAt ?? null,
      updatedAt: raw.updatedAt ?? null,
      endedAt: raw.endedAt,
      elapsedSec: Number(raw.elapsedSec ?? 0),
      scanElapsedSec: raw.scanElapsedSec,
      total: raw.total == null ? null : Number(raw.total),
      done: Number(raw.done ?? 0),
      percent: raw.percent == null ? null : Number(raw.percent),
      etaSec: raw.etaSec == null ? null : Number(raw.etaSec),
      infected: Number(raw.infected ?? 0),
      current: raw.current ?? null,
      log: raw.log ?? null,
      message: raw.message ?? null,
      hits: raw.hits,
      filelist: raw.filelist,
      applyExcludes: raw.applyExcludes,
    };
  } catch {
    return null;
  }
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "…";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

export function renderBar(percent: number, width = 22): string {
  const p = Math.min(100, Math.max(0, percent));
  const filled = Math.round((p / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

export function progressMarkdown(progress: ScanProgress): string {
  const lines: string[] = ["## Scan progress", ""];
  if (progress.percent != null) {
    lines.push(`\`${renderBar(progress.percent)} ${progress.percent}%\``, "");
  } else {
    lines.push("_Counting files to scan…_", "");
  }
  if (progress.message) lines.push(progress.message, "");
  lines.push(
    `- **Elapsed:** ${formatDuration(progress.elapsedSec)}`,
    `- **ETA:** ${progress.etaSec == null ? "calculating…" : formatDuration(progress.etaSec)}`,
    `- **Files:** ${progress.done.toLocaleString()}${progress.total != null ? ` / ${progress.total.toLocaleString()}` : ""}`,
    `- **Infected:** ${progress.infected}`,
  );
  if (progress.current) {
    lines.push(`- **Current:** \`${progress.current}\``);
  }
  return lines.join("\n");
}

export function latestScanLog(): string | null {
  if (!existsSync(STATE_DIR)) return null;
  const latest = join(STATE_DIR, "latest.log");
  if (existsSync(latest)) {
    try {
      return readFileSync(latest, "utf8").includes("SCAN SUMMARY")
        ? latest
        : newestScanLog() ?? latest;
    } catch {
      // fall through
    }
  }
  return newestScanLog();
}

function newestScanLog(): string | null {
  if (!existsSync(STATE_DIR)) return null;
  const files = readdirSync(STATE_DIR)
    .filter((n) => n.startsWith("scan-") && n.endsWith(".log"))
    .map((n) => join(STATE_DIR, n));
  if (!files.length) return null;
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

export function parseScanSummary(text: string): ScanSummary {
  const infectedMatch = text.match(/Infected files:\s+(\d+)/);
  const scannedMatch = text.match(/Scanned files:\s+(\d+)/);
  const timeMatch = text.match(/^Time:\s+(.+)$/m);
  const found = [...text.matchAll(/^(?!.*SCAN SUMMARY).*:\s+(.+)\s+FOUND\s*$/gm)]
    .map((m) => m[0].trim())
    .slice(0, 20);
  return {
    infected: infectedMatch ? Number.parseInt(infectedMatch[1], 10) : null,
    scannedFiles: scannedMatch ? Number.parseInt(scannedMatch[1], 10) : null,
    found,
    time: timeMatch?.[1]?.trim() ?? null,
  };
}

function ageHours(mtime: Date): number {
  return (Date.now() - mtime.getTime()) / 3_600_000;
}

function ageLabel(mtime: Date | null): { hours: number | null; label: string } {
  if (!mtime) return { hours: null, label: "unknown" };
  const hours = ageHours(mtime);
  if (hours < 1) return { hours, label: `${Math.max(1, Math.round(hours * 60))}m ago` };
  if (hours < 48) return { hours, label: `${Math.round(hours)}h ago` };
  return { hours, label: `${Math.round(hours / 24)}d ago` };
}

function officialMtime(): Date | null {
  for (const name of ["daily.cld", "daily.cvd"]) {
    const p = join("/var/lib/clamav", name);
    if (!existsSync(p)) continue;
    try {
      return statSync(p).mtime;
    } catch {
      continue;
    }
  }
  return null;
}

function unofficialMtime(): Date | null {
  const dir = "/var/lib/clamav";
  if (!existsSync(dir)) return null;
  let newest: Date | null = null;
  for (const name of readdirSync(dir)) {
    if (OFFICIAL.has(name) || name.endsWith(".sign") || name.startsWith(".")) continue;
    if (!/\.(ndb|ldb|hdb|hsb|cdb|ign2|ftm|yar|yara|db)$/i.test(name)) continue;
    try {
      const m = statSync(join(dir, name)).mtime;
      if (!newest || m > newest) newest = m;
    } catch {
      // skip
    }
  }
  return newest;
}

export function parseRkhunter(text: string): RkhunterSummary {
  const files = text.match(/Files checked:\s+(\d+)/);
  const suspect = text.match(/Suspect files:\s+(\d+)/);
  const kits = text.match(/Possible rootkits:\s+(\d+)/);
  const took = text.match(/The system checks took:\s+(.+)/);
  let warnings: boolean | null = null;
  if (/No warnings were found/i.test(text)) warnings = false;
  if (/One or more warnings have been found/i.test(text)) warnings = true;
  return {
    filesChecked: files ? Number.parseInt(files[1], 10) : null,
    suspectFiles: suspect ? Number.parseInt(suspect[1], 10) : null,
    rootkits: kits ? Number.parseInt(kits[1], 10) : null,
    warnings,
    took: took?.[1]?.trim() ?? null,
  };
}

export function progressToRun(p: ScanProgress): import("./history").ScanRun {
  return {
    id: p.id || p.startedAt || "unknown",
    kind: (p.kind as import("./history").ScanKind) || "full",
    targets: p.targets ?? [],
    state: p.state,
    phase: p.phase,
    startedAt: p.startedAt,
    endedAt: p.endedAt ?? null,
    elapsedSec: p.elapsedSec,
    scanElapsedSec: p.scanElapsedSec,
    total: p.total,
    done: p.done,
    percent: p.percent,
    infected: p.infected,
    hits: p.hits ?? [],
    log: p.log,
    filelist: p.filelist,
    applyExcludes: p.applyExcludes,
  };
}

function unofficialDbs(): string[] {
  const dir = "/var/lib/clamav";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => !n.endsWith(".sign") && !OFFICIAL.has(n) && !n.startsWith("."))
    .filter((n) => /\.(ndb|ldb|hdb|hsb|cdb|idb|fp|ign2|ftm|yar|yara|db)$/i.test(n))
    .sort();
}

async function clamdActive(): Promise<boolean> {
  try {
    await execFileAsync("/usr/bin/systemctl", ["is-active", "--quiet", "clamav-daemon"]);
    return true;
  } catch {
    return false;
  }
}

async function signatureCount(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/clamconf", [], {
      timeout: 8000,
    });
    const m = stdout.match(/Total number of signatures:\s+(\d+)/i);
    if (m) return Number.parseInt(m[1], 10);
    const loaded = stdout.match(/Loaded\s+(\d+)\s+signatures/i);
    if (loaded) return Number.parseInt(loaded[1], 10);
    // Sum per-database sigs if present
    let total = 0;
    let any = false;
    for (const row of stdout.matchAll(/sigs:\s+(\d+)/g)) {
      total += Number.parseInt(row[1], 10);
      any = true;
    }
    return any ? total : null;
  } catch {
    return null;
  }
}

export async function getAvStatus(): Promise<AvStatus> {
  const unofficialNames = unofficialDbs();
  const scanPid = await findScanPid();
  const lastLog = latestScanLog();
  let lastSummary: ScanSummary | null = null;
  if (lastLog) {
    try {
      lastSummary = parseScanSummary(readFileSync(lastLog, "utf8"));
    } catch {
      lastSummary = null;
    }
  }
  const rkhunterLog = join(STATE_DIR, "rkhunter-last.log");
  let rkhunter: RkhunterSummary | null = null;
  if (existsSync(rkhunterLog)) {
    try {
      rkhunter = parseRkhunter(readFileSync(rkhunterLog, "utf8"));
    } catch {
      rkhunter = null;
    }
  }
  const [active, signatures] = await Promise.all([clamdActive(), signatureCount()]);
  let progress = readProgress();
  const running = scanPid !== null;
  if (
    !running &&
    progress &&
    (progress.state === "counting" || progress.state === "scanning")
  ) {
    writeProgressPatch({
      state: "interrupted",
      endedAt: new Date().toISOString().slice(0, 19),
      message: `Interrupted at ${(progress.done ?? 0).toLocaleString()} files — resume from Antivirus`,
      pid: null,
    });
    progress = readProgress();
    if (progress) upsertHistory(progressToRun(progress));
  }
  const off = officialMtime();
  const unoff = unofficialMtime();
  const offAge = ageLabel(off);
  const unAge = ageLabel(unoff);
  return {
    clamdActive: active,
    signatures,
    unofficialCount: unofficialNames.length,
    unofficialNames,
    scanRunning: running,
    scanPid,
    lastLog: progress?.log && existsSync(progress.log) ? progress.log : lastLog,
    lastSummary,
    rkhunterLog: existsSync(rkhunterLog) ? rkhunterLog : null,
    rkhunter,
    progress,
    resumable: !running && canResumeRun(progress ? progressToRun(progress) : null),
    sigAge: {
      officialHours: offAge.hours,
      officialLabel: offAge.label,
      unofficialHours: unAge.hours,
      unofficialLabel: unAge.label,
    },
  };
}

export function formatSubtitle(status: AvStatus): string {
  const p = status.progress;
  if (status.scanRunning) {
    if (p?.state === "counting") {
      return p.done ? `Counting ${p.done.toLocaleString()}…` : "Counting files…";
    }
    if (p?.percent != null) {
      const eta = p.etaSec == null ? "" : ` · ETA ${formatDuration(p.etaSec)}`;
      return `${p.percent}%${eta}`;
    }
    return "Scanning…";
  }
  if (status.resumable) {
    const pct = p?.percent != null ? `${p.percent}%` : "scan";
    return `Resume ${pct}`;
  }
  const infected = p?.state === "done" ? p.infected : status.lastSummary?.infected;
  if (infected === null || infected === undefined) return status.clamdActive ? "Ready" : "Daemon off";
  if (infected > 0) return `${infected} infected`;
  return "Clean";
}

export function readLogTail(path: string | null, maxLines = 80): string {
  if (!path || !existsSync(path)) return "_No log yet._";
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    const slice = lines.slice(Math.max(0, lines.length - maxLines));
    return "```\n" + slice.join("\n") + "\n```";
  } catch (err) {
    return `Failed to read log: ${err instanceof Error ? err.message : String(err)}`;
  }
}
