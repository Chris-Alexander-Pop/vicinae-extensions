import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { cleanEnv, ensureSudo } from "./sudo";
import { canResumeRun, getHistoryRun, restoreRunCheckpoint, upsertHistory, writeProgressPatch } from "./history";
import { findScanPid, progressToRun, readPidFile, readProgress, STATE_DIR } from "./status";

const AV_SCAN = "/usr/local/bin/av-scan";
const AV_UPDATE = "/usr/local/bin/av-update";
const RKHUNTER = "/usr/local/bin/rkhunter";
const SUDO = "/usr/bin/sudo";

export type ScanKind = "full" | "quick" | "path";

function ensureState(): void {
  mkdirSync(STATE_DIR, { recursive: true });
}

function spawnEnv(): NodeJS.ProcessEnv {
  return {
    ...cleanEnv(),
    HOME: homedir(),
    XDG_STATE_HOME: process.env.XDG_STATE_HOME || join(homedir(), ".local/state"),
  };
}

function spawnAvScan(args: string[]): void {
  if (!existsSync(AV_SCAN)) throw new Error(`${AV_SCAN} missing — copy antivirus/scripts/av-scan there`);
  const child = spawn(AV_SCAN, args, {
    detached: true,
    stdio: "ignore",
    env: spawnEnv(),
  });
  child.unref();
  if (!child.pid) throw new Error("Failed to start av-scan");
}

export async function assertIdle(): Promise<void> {
  if (await findScanPid()) {
    throw new Error("A ClamAV scan is already running");
  }
}

function preserveOpenScan(): void {
  const p = readProgress();
  if (!p) return;
  if (p.state === "done" || p.state === "cancelled") return;
  if (p.state === "counting" || p.state === "scanning") {
    writeProgressPatch({
      state: "interrupted",
      endedAt: new Date().toISOString().slice(0, 19),
      message: "Interrupted — a new scan started",
      pid: null,
    });
  }
  const next = readProgress();
  if (next) upsertHistory(progressToRun(next));
}

export async function startScan(kind: ScanKind, targets: string[] = []): Promise<void> {
  await assertIdle();
  ensureState();
  preserveOpenScan();
  if (kind === "quick") {
    spawnAvScan(["--kind", "quick"]);
    return;
  }
  if (kind === "path") {
    if (!targets.length) throw new Error("Pick a file or folder to scan");
    spawnAvScan(["--kind", "path", ...targets]);
    return;
  }
  spawnAvScan(["--kind", "full", homedir()]);
}

export async function resumeScan(runId?: string): Promise<void> {
  await assertIdle();
  ensureState();
  if (runId) {
    const run = getHistoryRun(runId);
    if (!run) throw new Error("Scan not in history");
    if (!canResumeRun(run)) {
      throw new Error("This scan cannot be resumed (finished or file list gone)");
    }
    restoreRunCheckpoint(run);
  }
  spawnAvScan(["--resume"]);
}

export async function startHomeScan(): Promise<void> {
  await startScan("full");
}

export async function stopScan(): Promise<void> {
  const pid = readPidFile() ?? (await findScanPid());
  if (!pid) throw new Error("No scan is running");
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    process.kill(pid, "SIGTERM");
  }
}

function appendLog(path: string, chunk: string): void {
  appendFileSync(path, chunk.endsWith("\n") ? chunk : `${chunk}\n`);
}

export async function startSignatureUpdate(): Promise<string> {
  if (!existsSync(AV_UPDATE)) {
    throw new Error(`${AV_UPDATE} missing`);
  }
  await ensureSudo();
  ensureState();
  const logPath = join(STATE_DIR, "update-last.log");
  writeFileSync(logPath, `# av-update ${new Date().toISOString()}\n\n`);

  const child = spawn(AV_UPDATE, [], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: cleanEnv(),
  });
  if (!child.pid) throw new Error("Failed to start av-update");
  const onChunk = (buf: Buffer) => appendLog(logPath, buf.toString());
  child.stdout?.on("data", onChunk);
  child.stderr?.on("data", onChunk);
  child.unref();
  return logPath;
}

export async function startRkhunter(): Promise<string> {
  if (!existsSync(RKHUNTER)) {
    throw new Error(`${RKHUNTER} missing`);
  }
  await ensureSudo();
  ensureState();
  const logPath = join(STATE_DIR, "rkhunter-last.log");
  writeFileSync(logPath, `# rkhunter --check ${new Date().toISOString()}\n\n`);

  const child = spawn(
    SUDO,
    ["-n", RKHUNTER, "--check", "--sk", "--nocolors"],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: cleanEnv(),
    },
  );
  if (!child.pid) throw new Error("Failed to start rkhunter");
  const onChunk = (buf: Buffer) => appendLog(logPath, buf.toString());
  child.stdout?.on("data", onChunk);
  child.stderr?.on("data", onChunk);
  child.unref();
  return logPath;
}
