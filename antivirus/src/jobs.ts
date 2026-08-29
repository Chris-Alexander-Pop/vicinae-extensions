import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cleanEnv, ensureSudo } from "./sudo";
import { findScanPid, readPidFile, STATE_DIR } from "./status";

const AV_SCAN = "/usr/local/bin/av-scan";
const AV_UPDATE = "/usr/local/bin/av-update";
const RKHUNTER = "/usr/local/bin/rkhunter";
const SUDO = "/usr/bin/sudo";

function ensureState(): void {
  mkdirSync(STATE_DIR, { recursive: true });
}

function appendLog(path: string, chunk: string): void {
  appendFileSync(path, chunk.endsWith("\n") ? chunk : `${chunk}\n`);
}

export async function startHomeScan(): Promise<void> {
  if (await findScanPid()) {
    throw new Error("A ClamAV scan is already running");
  }
  if (!existsSync(AV_SCAN)) {
    throw new Error(`${AV_SCAN} missing`);
  }
  ensureState();

  const child = spawn(AV_SCAN, [homedir()], {
    detached: true,
    stdio: "ignore",
    env: {
      ...cleanEnv(),
      HOME: homedir(),
      XDG_STATE_HOME:
        process.env.XDG_STATE_HOME || join(homedir(), ".local/state"),
    },
  });
  child.unref();
  if (!child.pid) throw new Error("Failed to start av-scan");
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
