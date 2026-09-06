import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildRetryPlan, canRetry, collectFailedSteps, type RetryPlan } from "./retry";

export {
  buildRetryPlan,
  canRetry,
  collectFailedSteps,
  type RetryPlan,
} from "./retry";

const execFileAsync = promisify(execFile);
const SUDO = "/usr/bin/sudo";
const HISTORY_MAX = 8;

export type RunState =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type StepStatus = "pending" | "running" | "ok" | "failed";

export type TopgradeStep = {
  name: string;
  status: StepStatus;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type TopgradeStatus = {
  state: RunState;
  pid: number | null;
  startedAt: string | null;
  currentStep: string | null;
  activity?: string | null;
  steps: TopgradeStep[];
  exitCode: number | null;
  error: string | null;
  logPath: string | null;
};

export type HistoryEntry = {
  id: string;
  state: RunState;
  startedAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  failedSteps: string[];
  okCount: number;
  failedCount: number;
  stepCount: number;
  dir: string;
};

export type HistoryRun = HistoryEntry & {
  steps: TopgradeStep[];
  logPath: string;
  status: TopgradeStatus | null;
};

function runtimeDir(): string {
  const base =
    process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`;
  return join(base, "vicinae-topgrade");
}

function dataDir(): string {
  const base =
    process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
  return join(base, "vicinae-topgrade");
}

export function historyDir(): string {
  return join(dataDir(), "history");
}

export function historyIndexPath(): string {
  return join(historyDir(), "index.json");
}

export function statusPath(): string {
  return join(runtimeDir(), "status.json");
}

export function logPath(): string {
  return join(runtimeDir(), "log.txt");
}

export function retryPlanPath(): string {
  return join(runtimeDir(), "retry.json");
}

function askpassPath(): string {
  return join(homedir(), ".local/bin/vicinae-sudo-askpass");
}

export function readStatus(): TopgradeStatus | null {
  const path = statusPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as TopgradeStatus;
  } catch {
    return null;
  }
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

export async function isServiceActive(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("systemctl", [
      "--user",
      "is-active",
      "vicinae-topgrade.service",
    ]);
    return stdout.trim() === "active";
  } catch {
    return false;
  }
}

export async function isRunInProgress(): Promise<boolean> {
  if (await isServiceActive()) return true;
  const status = readStatus();
  if (status?.state === "running" && pidAlive(status.pid)) return true;
  return false;
}

function scrapeFailedFromLog(text: string): string[] {
  const failed: string[] = [];
  for (const match of text.matchAll(/^(.+?): FAILED\s*$/gm)) {
    const name = match[1]?.trim();
    if (name && !failed.includes(name)) failed.push(name);
  }
  return failed;
}

function ensureHistoryDir(): void {
  mkdirSync(historyDir(), { recursive: true });
}

export function readHistoryIndex(): HistoryEntry[] {
  const path = historyIndexPath();
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is HistoryEntry =>
        !!e && typeof e === "object" && typeof e.id === "string",
    );
  } catch {
    return [];
  }
}

function writeHistoryIndex(entries: HistoryEntry[]): void {
  ensureHistoryDir();
  const path = historyIndexPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(entries.slice(0, HISTORY_MAX), null, 2)}\n`);
  renameSync(tmp, path);
}

export function readHistoryRun(id: string): HistoryRun | null {
  const entry = readHistoryIndex().find((e) => e.id === id);
  if (!entry) return null;
  const dir = entry.dir || join(historyDir(), id);
  let meta: Partial<HistoryRun> = {};
  const metaPath = join(dir, "meta.json");
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf8")) as Partial<HistoryRun>;
    } catch {
      meta = {};
    }
  }
  let status: TopgradeStatus | null = null;
  const statusFile = join(dir, "status.json");
  if (existsSync(statusFile)) {
    try {
      status = JSON.parse(readFileSync(statusFile, "utf8")) as TopgradeStatus;
    } catch {
      status = null;
    }
  }
  const logFile = join(dir, "log.txt");
  return {
    id: entry.id,
    state: (meta.state as RunState) || entry.state,
    startedAt: meta.startedAt ?? entry.startedAt,
    endedAt: meta.endedAt ?? entry.endedAt,
    exitCode: meta.exitCode ?? entry.exitCode,
    failedSteps: meta.failedSteps ?? entry.failedSteps ?? [],
    okCount: meta.okCount ?? entry.okCount ?? 0,
    failedCount: meta.failedCount ?? entry.failedCount ?? 0,
    stepCount: meta.stepCount ?? entry.stepCount ?? 0,
    dir,
    steps: meta.steps ?? status?.steps ?? [],
    logPath: existsSync(logFile) ? logFile : logPath(),
    status,
  };
}

export function readHistoryLogLines(id: string, maxLines = 500): string[] {
  const run = readHistoryRun(id);
  if (!run) return [];
  if (!existsSync(run.logPath)) return [];
  try {
    const text = readFileSync(run.logPath, "utf8");
    const lines = text.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.slice(Math.max(0, lines.length - maxLines));
  } catch {
    return [];
  }
}

/**
 * If status.json says "running" but nothing is alive, rewrite it as failed
 * and archive into history so the start screen can show the last result.
 */
export async function reconcileStaleStatus(): Promise<TopgradeStatus | null> {
  const status = readStatus();
  if (!status) return null;
  if (status.state !== "running") return status;
  if (await isRunInProgress()) return status;

  const logText = existsSync(logPath())
    ? readFileSync(logPath(), "utf8")
    : "";
  const failedFromLog = scrapeFailedFromLog(logText);
  const failedNorms = new Set(
    failedFromLog.map((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "")),
  );
  const matchesFailed = (name: string) => {
    const n = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (failedNorms.has(n)) return true;
    return failedFromLog.some(
      (label) =>
        name.toLowerCase().includes(label.toLowerCase()) ||
        label.toLowerCase().includes(name.toLowerCase()),
    );
  };

  const steps = (status.steps ?? []).map((s) => {
    let next = s.status;
    if (s.status === "running") {
      // Don't blame the last active step when Topgrade already listed failures.
      next = failedFromLog.length > 0 ? "ok" : "failed";
    }
    if (matchesFailed(s.name)) next = "failed";
    return next === s.status
      ? s
      : { ...s, status: next as StepStatus, endedAt: s.endedAt ?? new Date().toISOString() };
  });
  const failedSteps = [
    ...new Set([
      ...failedFromLog,
      ...steps.filter((s) => s.status === "failed").map((s) => s.name),
    ]),
  ];

  const fixed: TopgradeStatus = {
    ...status,
    state: "failed",
    pid: null,
    steps,
    exitCode: status.exitCode ?? 1,
    error:
      status.error ||
      (failedSteps.length
        ? `Failed: ${failedSteps.join(", ")}`
        : "Run ended unexpectedly"),
  };

  try {
    writeFileSync(statusPath(), `${JSON.stringify(fixed)}\n`);
  } catch {
    return fixed;
  }

  // Archive if this startedAt is not already in history
  const index = readHistoryIndex();
  const already = index.some(
    (e) => e.startedAt && status.startedAt && e.startedAt === status.startedAt,
  );
  if (!already) {
    try {
      ensureHistoryDir();
      const started = status.startedAt || new Date().toISOString();
      const safe =
        started.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "") ||
        String(Date.now());
      let runId = safe;
      let dir = join(historyDir(), runId);
      let n = 1;
      while (existsSync(dir)) {
        n += 1;
        runId = `${safe}-${n}`;
        dir = join(historyDir(), runId);
      }
      mkdirSync(dir, { recursive: true });
      const endedAt = new Date().toISOString();
      const meta = {
        id: runId,
        state: "failed" as const,
        startedAt: started,
        endedAt,
        exitCode: fixed.exitCode,
        error: fixed.error,
        currentStep: fixed.currentStep,
        failedSteps,
        okCount: steps.filter((s) => s.status === "ok").length,
        failedCount: failedSteps.length,
        stepCount: steps.length,
        steps,
        logPath: join(dir, "log.txt"),
      };
      writeFileSync(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
      writeFileSync(join(dir, "status.json"), `${JSON.stringify(fixed)}\n`);
      if (existsSync(logPath())) {
        writeFileSync(join(dir, "log.txt"), readFileSync(logPath()));
      } else {
        writeFileSync(join(dir, "log.txt"), "");
      }
      writeHistoryIndex([
        {
          id: runId,
          state: "failed",
          startedAt: started,
          endedAt,
          exitCode: fixed.exitCode,
          failedSteps,
          okCount: meta.okCount,
          failedCount: meta.failedCount,
          stepCount: meta.stepCount,
          dir,
        },
        ...index,
      ]);
    } catch {
      // history is best-effort
    }
  }

  return fixed;
}

export function readLogTail(maxLines = 80): string {
  return readLogLines(maxLines).join("\n");
}

export function readLogLines(maxLines = 500): string[] {
  const path = logPath();
  if (!existsSync(path)) return [];
  try {
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    // drop trailing empty from final newline
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.slice(Math.max(0, lines.length - maxLines));
  } catch {
    return [];
  }
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

function runSudo(
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    stdin?: string;
    timeoutMs: number;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(SUDO, args, {
      env: options.env ?? cleanEnv(),
      stdio: ["pipe", "ignore", "pipe"],
    });

    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          "Authentication timed out. Touch the fingerprint reader, or try password again.",
        ),
      );
    }, options.timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
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
          new Error(
            stderr.trim() ||
              `sudo failed (exit ${code}). Try fingerprint or check password.`,
          ),
        );
    });

    if (options.stdin != null) {
      child.stdin?.write(options.stdin);
    }
    child.stdin?.end();
  });
}

/**
 * Open the Adwaita password dialog. The dialog warms sudo itself.
 * Returns true if sudo is authorized afterward.
 */
/**
 * Start the password dialog immediately (sync spawn) so it outlives
 * closeMainWindow / extension unload. Returns the dialog PID.
 */
export function spawnPasswordPromptDetached(): number {
  const helper = join(homedir(), ".local/bin/vicinae-sudo-prompt");
  if (!existsSync(helper)) {
    throw new Error(
      `Password prompt missing at ${helper}. Re-run: bash topgrade/scripts/install-runner.sh`,
    );
  }

  // Kill stale prompts synchronously FIRST — an async pkill was racing and
  // murdering the dialog we spawn on the next line.
  try {
    spawnSync("/usr/bin/pkill", ["-f", `python3 ${helper}`], {
      stdio: "ignore",
      timeout: 2000,
    });
  } catch {
    // none running is fine
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

/** Poll until sudo is warm or the dialog process exits. */
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

  // Give the dialog time to clear sudo + map a window before treating exit as cancel.
  await new Promise((r) => setTimeout(r, 800));

  let sawAlive = alive();
  while (Date.now() < deadline) {
    if (await sudoCached()) return true;
    const isAlive = alive();
    if (isAlive) sawAlive = true;
    // Only treat death as cancel after we've observed the process at least once,
    // or after the startup grace above.
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

/** Convenience: spawn + wait (only safe if the extension stays alive). */
export async function promptAndWarmSudoPassword(): Promise<boolean> {
  const pid = spawnPasswordPromptDetached();
  return waitForPasswordPrompt(pid);
}

/** @deprecated use promptAndWarmSudoPassword */
export async function promptSudoPassword(): Promise<string | null> {
  const ok = await promptAndWarmSudoPassword();
  return ok ? "__warmed__" : null;
}

/** Invalidate any cached sudo timestamp so the next auth must succeed. */
export async function clearSudoCache(): Promise<void> {
  try {
    await execFileAsync(SUDO, ["-K"], { env: cleanEnv() });
  } catch {
    try {
      await execFileAsync(SUDO, ["-k"], { env: cleanEnv() });
    } catch {
      // ignore
    }
  }
}

/** Warm sudo via fingerprint (pam_fprintd). No password on stdin. */
export async function cacheSudoFingerprint(
  timeoutMs = 60_000,
): Promise<void> {
  await clearSudoCache();
  await runSudo(["-v"], { timeoutMs, stdin: "" });
}

/**
 * Warm sudo via password helper:
 * unix_chkpwd verify → claim fprintd (skip 30s wait) → sudo -S -v.
 */
export async function cacheSudoPassword(
  password: string,
  timeoutMs = 30_000,
): Promise<void> {
  if (!password) {
    throw new Error("Password is empty");
  }

  const helper = join(homedir(), ".local/bin/vicinae-sudo-password-warm");
  if (!existsSync(helper)) {
    throw new Error(
      `Password helper missing at ${helper}. Re-run: bash topgrade/scripts/install-runner.sh`,
    );
  }

  await clearSudoCache();

  // Prefer stdin over env so the password cannot be dropped by env filtering.
  const env = cleanEnv();

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(helper, [], {
        env,
        stdio: ["pipe", "ignore", "pipe"],
      });
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(
          new Error(
            "Password auth timed out. Try Start with Fingerprint, or run again.",
          ),
        );
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
        const msg = stderr.trim();
        if (code === 0) {
          resolve();
          return;
        }
        if (/incorrect password/i.test(msg)) {
          reject(new Error("Incorrect password"));
          return;
        }
        reject(
          new Error(
            msg ||
              `Password authentication failed (exit ${code}). Try fingerprint instead.`,
          ),
        );
      });

      child.stdin?.write(password);
      child.stdin?.write("\n");
      child.stdin?.end();
    });
  } finally {
    // no-op; password never stored on env
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

/**
 * Require a successful sudo auth, then start the Topgrade service.
 * Never starts without verifying sudo works afterward.
 */
export async function authenticateAndStart(
  mode: "fingerprint" | "password",
  password?: string,
  options?: { retryFailed?: string[] },
): Promise<void> {
  if (mode === "fingerprint") {
    await cacheSudoFingerprint();
  } else {
    await cacheSudoPassword(password ?? "");
  }

  if (!(await sudoCached())) {
    throw new Error(
      "sudo is still not authorized after authentication. Try again.",
    );
  }

  await startTopgradeService(options);
}

function writeRetryPlanFile(plan: RetryPlan): void {
  mkdirSync(runtimeDir(), { recursive: true });
  const path = retryPlanPath();
  const tmp = `${path}.tmp`;
  writeFileSync(
    tmp,
    `${JSON.stringify(
      {
        only: plan.only,
        shell: plan.shell.map((s) => ({
          name: s.name,
          command: s.command,
        })),
        summary: plan.summary,
      },
      null,
      2,
    )}\n`,
  );
  renameSync(tmp, path);
}

export function clearRetryPlan(): void {
  try {
    unlinkSync(retryPlanPath());
  } catch {
    // none
  }
}

/**
 * Prepare a retry-only run from failed step labels, then start the service.
 */
export async function startRetryFailed(
  failedSteps: string[],
): Promise<RetryPlan> {
  const plan = buildRetryPlan(failedSteps);
  if (plan.only.length === 0 && plan.shell.length === 0) {
    throw new Error(
      plan.unmatched.length
        ? `Cannot retry: unmapped steps (${plan.unmatched.join(", ")})`
        : "No failed steps to retry",
    );
  }
  writeRetryPlanFile(plan);
  try {
    await startTopgradeService();
  } catch (err) {
    clearRetryPlan();
    throw err;
  }
  return plan;
}

export async function startTopgradeService(options?: {
  retryFailed?: string[];
}): Promise<void> {
  const helper = join(homedir(), ".local/bin/vicinae-topgrade-run");
  if (!existsSync(helper)) {
    throw new Error(
      "Runner not installed. From this extension directory run: bash scripts/install-runner.sh",
    );
  }
  if (await isRunInProgress()) {
    throw new Error("A Topgrade run is already in progress");
  }

  if (options?.retryFailed?.length) {
    const plan = buildRetryPlan(options.retryFailed);
    if (plan.only.length === 0 && plan.shell.length === 0) {
      throw new Error(
        plan.unmatched.length
          ? `Cannot retry: unmapped steps (${plan.unmatched.join(", ")})`
          : "No failed steps to retry",
      );
    }
    writeRetryPlanFile(plan);
  } else if (!existsSync(retryPlanPath())) {
    // full run — ensure no stale retry plan
    clearRetryPlan();
  }

  try {
    await execFileAsync("systemctl", [
      "--user",
      "start",
      "vicinae-topgrade.service",
    ]);
  } catch (err) {
    clearRetryPlan();
    throw err;
  }
}

export async function cancelTopgrade(): Promise<void> {
  const status = readStatus();
  const pid = status?.pid;

  try {
    await execFileAsync("systemctl", [
      "--user",
      "stop",
      "vicinae-topgrade.service",
    ]);
  } catch {
    // fall through to direct signals
  }

  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already dead
      }
    }
  }

  // Also kill any lingering topgrade for this user
  try {
    await execFileAsync("pkill", ["-u", String(process.getuid?.() ?? ""), "-x", "topgrade"]);
  } catch {
    // none running
  }
}

export function runnerInstalled(): boolean {
  return (
    existsSync(join(homedir(), ".local/bin/vicinae-topgrade-run")) &&
    existsSync(askpassPath())
  );
}
