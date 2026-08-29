import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SUDO = "/usr/bin/sudo";

export function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.SUDO_ASKPASS;
  delete env.SSH_ASKPASS;
  delete env.CURSOR_ASKPASS_SOCKET;
  delete env.CURSOR_ASKPASS_SECRET;
  delete env.VICINAE_SUDO_PASS;
  return env;
}

export async function sudoCached(): Promise<boolean> {
  try {
    await execFileAsync(SUDO, ["-n", "-v"], { env: cleanEnv() });
    return true;
  } catch {
    return false;
  }
}

function spawnPasswordPromptDetached(): number {
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
  if (!child.pid) throw new Error("Failed to start password dialog");
  return child.pid;
}

async function waitForPasswordPrompt(
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

async function cacheSudoFingerprint(timeoutMs = 60_000): Promise<void> {
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
      else reject(new Error(stderr.trim() || `sudo -v failed (exit ${code})`));
    });
    child.stdin?.end();
  });
}

export async function ensureSudo(): Promise<void> {
  if (await sudoCached()) return;
  try {
    await cacheSudoFingerprint();
  } catch {
    const pid = spawnPasswordPromptDetached();
    const ok = await waitForPasswordPrompt(pid);
    if (!ok) throw new Error("Password dialog closed without authorizing");
  }
  if (!(await sudoCached())) {
    throw new Error("sudo is still not authorized after authentication");
  }
}
