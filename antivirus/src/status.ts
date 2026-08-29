import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

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
  state: "counting" | "scanning" | "done" | "cancelled" | "error" | string;
  startedAt: string | null;
  updatedAt: string | null;
  elapsedSec: number;
  total: number | null;
  done: number;
  percent: number | null;
  etaSec: number | null;
  infected: number;
  current: string | null;
  log: string | null;
  message: string | null;
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
  progress: ScanProgress | null;
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
      startedAt: raw.startedAt ?? null,
      updatedAt: raw.updatedAt ?? null,
      elapsedSec: Number(raw.elapsedSec ?? 0),
      total: raw.total == null ? null : Number(raw.total),
      done: Number(raw.done ?? 0),
      percent: raw.percent == null ? null : Number(raw.percent),
      etaSec: raw.etaSec == null ? null : Number(raw.etaSec),
      infected: Number(raw.infected ?? 0),
      current: raw.current ?? null,
      log: raw.log ?? null,
      message: raw.message ?? null,
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
  const [active, signatures] = await Promise.all([clamdActive(), signatureCount()]);
  const progress = readProgress();
  const running = scanPid !== null;
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
    progress,
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
