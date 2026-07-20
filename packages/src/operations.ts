import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SUDO = "/usr/bin/sudo";
const YAY = "/usr/bin/yay";

export type OpKind = "update" | "uninstall" | "install";
export type OpState = "idle" | "running" | "succeeded" | "failed" | "cancelled";

export type OperationStatus = {
  state: OpState;
  kind: OpKind | null;
  packageName: string | null;
  command: string | null;
  pid: number | null;
  startedAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  error: string | null;
  logPath: string | null;
};

function runtimeDir(): string {
  const base =
    process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`;
  return join(base, "vicinae-packages");
}

export function statusPath(): string {
  return join(runtimeDir(), "status.json");
}

export function logPath(): string {
  return join(runtimeDir(), "log.txt");
}

function ensureRuntime(): void {
  mkdirSync(runtimeDir(), { recursive: true });
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.SUDO_ASKPASS;
  delete env.SSH_ASKPASS;
  delete env.CURSOR_ASKPASS_SOCKET;
  delete env.CURSOR_ASKPASS_SECRET;
  delete env.VICINAE_SUDO_PASS;
  return env;
}

function idleStatus(): OperationStatus {
  return {
    state: "idle",
    kind: null,
    packageName: null,
    command: null,
    pid: null,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    error: null,
    logPath: logPath(),
  };
}

export function writeStatus(status: OperationStatus): void {
  ensureRuntime();
  writeFileSync(statusPath(), JSON.stringify(status, null, 2));
}

export function readStatus(): OperationStatus {
  const path = statusPath();
  if (!existsSync(path)) return idleStatus();
  try {
    return JSON.parse(readFileSync(path, "utf8")) as OperationStatus;
  } catch {
    return idleStatus();
  }
}

export function readLogLines(maxLines = 500): string[] {
  const path = logPath();
  if (!existsSync(path)) return [];
  try {
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.slice(Math.max(0, lines.length - maxLines));
  } catch {
    return [];
  }
}

function appendLog(line: string): void {
  ensureRuntime();
  appendFileSync(logPath(), line.endsWith("\n") ? line : `${line}\n`);
}

function pidAlive(pid: number | null | undefined): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function sudoCached(): Promise<boolean> {
  try {
    await execFileAsync(SUDO, ["-n", "-v"], { env: cleanEnv() });
    return true;
  } catch {
    return false;
  }
}

export function spawnPasswordPromptDetached(): number {
  const helper = join(homedir(), ".local/bin/vicinae-sudo-prompt");
  if (!existsSync(helper)) {
    throw new Error(
      `Password prompt missing at ${helper}. Install Topgrade helpers: bash topgrade/scripts/install-runner.sh`,
    );
  }

  try {
    spawnSync("/usr/bin/pkill", ["-f", `python3 ${helper}`], {
      stdio: "ignore",
      timeout: 2000,
    });
  } catch {
    // none running
  }

  const child = spawn(helper, [], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      SUDO_ASKPASS: "",
      SSH_ASKPASS: "",
      VICINAE_SUDO_PASS: "",
    },
  });
  child.unref();

  if (!child.pid) {
    throw new Error("Failed to start password dialog");
  }
  return child.pid;
}

export async function waitForPasswordPrompt(
  pid: number,
  timeoutMs = 180_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  const alive = (): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  await new Promise((r) => setTimeout(r, 800));

  let sawAlive = alive();
  while (Date.now() < deadline) {
    if (await sudoCached()) return true;
    const isAlive = alive();
    if (isAlive) sawAlive = true;
    if (!isAlive && sawAlive) return false;
    if (!isAlive && Date.now() > deadline - timeoutMs + 3000) return false;
    await new Promise((r) => setTimeout(r, 400));
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // gone
  }
  return false;
}

/** Warm sudo via fingerprint (pam_fprintd). */
export async function cacheSudoFingerprint(
  timeoutMs = 60_000,
): Promise<void> {
  try {
    await execFileAsync(SUDO, ["-K"], { env: cleanEnv() });
  } catch {
    // ignore
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(SUDO, ["-v"], {
      env: cleanEnv(),
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Fingerprint auth timed out"));
    }, timeoutMs);

    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error(stderr.trim() || `sudo -v failed (exit ${code})`),
        );
    });
    child.stdin?.end();
  });
}

export async function ensureSudo(mode: "password" | "fingerprint" = "password"): Promise<void> {
  if (await sudoCached()) return;

  if (mode === "fingerprint") {
    await cacheSudoFingerprint();
  } else {
    const pid = spawnPasswordPromptDetached();
    const ok = await waitForPasswordPrompt(pid);
    if (!ok) {
      throw new Error("Password dialog closed without authorizing");
    }
  }

  if (!(await sudoCached())) {
    throw new Error("sudo is still not authorized after authentication");
  }
}

export function isOperationRunning(): boolean {
  const status = readStatus();
  return status.state === "running" && pidAlive(status.pid);
}

function buildCommand(kind: OpKind, packageName: string): {
  bin: string;
  args: string[];
  display: string;
} {
  if (kind === "uninstall") {
    const args = ["-Rns", "--noconfirm", packageName];
    return {
      bin: YAY,
      args,
      display: `yay ${args.join(" ")}`,
    };
  }

  // install + update: -Sy refreshes sync DBs first (checkupdates uses a temp copy,
  // so plain -S --needed can falsely report "up to date" when local sync is stale).
  const args = [
    "-Sy",
    "--noconfirm",
    "--needed",
    "--answerclean",
    "None",
    "--answerdiff",
    "None",
    packageName,
  ];
  return {
    bin: YAY,
    args,
    display: `yay ${args.join(" ")}`,
  };
}

/**
 * Start update/uninstall in the background. Streams output to the runtime log.
 * Caller should already have confirmed uninstall and warmed sudo.
 */
export function startOperation(kind: OpKind, packageName: string): OperationStatus {
  if (isOperationRunning()) {
    throw new Error("Another package operation is already running");
  }
  if (!existsSync(YAY)) {
    throw new Error("yay not found at /usr/bin/yay");
  }

  ensureRuntime();
  writeFileSync(logPath(), "");

  const { bin, args, display } = buildCommand(kind, packageName);
  const startedAt = new Date().toISOString();

  appendLog(`$ ${display}`);
  appendLog(`# started ${startedAt}`);
  appendLog("");

  const child = spawn(bin, args, {
    env: cleanEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  if (!child.pid) {
    throw new Error("Failed to spawn yay");
  }

  const status: OperationStatus = {
    state: "running",
    kind,
    packageName,
    command: display,
    pid: child.pid,
    startedAt,
    endedAt: null,
    exitCode: null,
    error: null,
    logPath: logPath(),
  };
  writeStatus(status);

  const onChunk = (chunk: Buffer) => {
    appendLog(chunk.toString());
  };
  child.stdout?.on("data", onChunk);
  child.stderr?.on("data", onChunk);

  child.on("error", (err) => {
    appendLog(`\n# spawn error: ${err.message}`);
    writeStatus({
      ...readStatus(),
      state: "failed",
      endedAt: new Date().toISOString(),
      exitCode: 1,
      error: err.message,
    });
  });

  child.on("close", (code) => {
    const exitCode = code ?? 1;
    const ok = exitCode === 0;
    appendLog("");
    appendLog(`# exit ${exitCode} · ${ok ? "success" : "failed"}`);
    writeStatus({
      ...readStatus(),
      state: ok ? "succeeded" : "failed",
      endedAt: new Date().toISOString(),
      exitCode,
      error: ok ? null : `Command exited with code ${exitCode}`,
    });
  });

  child.unref();
  return status;
}

export function cancelOperation(): void {
  const status = readStatus();
  if (status.pid && pidAlive(status.pid)) {
    try {
      process.kill(-status.pid, "SIGTERM");
    } catch {
      try {
        process.kill(status.pid, "SIGTERM");
      } catch {
        // already dead
      }
    }
  }
  appendLog("\n# cancel requested");
  writeStatus({
    ...status,
    state: "cancelled",
    endedAt: new Date().toISOString(),
    error: "Cancelled",
  });
}
