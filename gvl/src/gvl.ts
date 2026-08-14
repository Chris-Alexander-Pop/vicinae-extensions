import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { getPreferenceValues } from "@vicinae/api";
import {
  parseConfigShow,
  parseStatus,
  type DiscoveredDevice,
  type GvlConfig,
  type LightStatus,
  type ScheduleEntry,
} from "./status";

const execFileAsync = promisify(execFile);

export type GvlPreferences = {
  gvlPath?: string;
  stepPercent?: string;
  directLan?: boolean;
};

export class GvlError extends Error {
  constructor(
    message: string,
    readonly stderr?: string,
  ) {
    super(message);
    this.name = "GvlError";
  }
}

export function getPrefs(): GvlPreferences {
  return getPreferenceValues<GvlPreferences>();
}

function resolveGvl(): string {
  const pref = getPrefs().gvlPath?.trim();
  if (pref) return pref;
  const home = homedir();
  for (const candidate of [`${home}/go/bin/gvl`, `${home}/.local/bin/gvl`]) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }
  return "gvl";
}

function isDirectLan(): boolean {
  const v = getPrefs().directLan as unknown;
  return v === true || v === "true";
}

function extraFlags(): string[] {
  const flags: string[] = [];
  if (isDirectLan()) flags.push("--url", "local");
  return flags;
}

type ExecErr = Error & {
  stdout?: string;
  stderr?: string;
  killed?: boolean;
  code?: string | number | null;
};

function formatExecError(err: unknown): GvlError {
  const e = err as ExecErr;
  if (e.killed) return new GvlError("gvl timed out");
  if (e.code === "ENOENT") {
    return new GvlError(
      "gvl not found — install it or set the gvl path preference",
    );
  }
  const stderr = (e.stderr ?? "").trim();
  const stdout = (e.stdout ?? "").trim();
  const msg = stderr || stdout || e.message || "gvl failed";
  return new GvlError(msg.split("\n")[0] ?? msg, stderr);
}

export async function gvl(
  args: string[],
  opts?: { timeoutMs?: number; json?: boolean },
): Promise<string> {
  const json = opts?.json !== false;
  const argv = [...(json ? ["--json"] : []), ...extraFlags(), ...args];
  try {
    const { stdout } = await execFileAsync(resolveGvl(), argv, {
      timeout: opts?.timeoutMs ?? 15_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return (stdout ?? "").trim();
  } catch (err) {
    throw formatExecError(err);
  }
}

export async function gvlJson<T>(
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<T> {
  const out = await gvl(args, { ...opts, json: true });
  if (!out) throw new GvlError("gvl produced no JSON");
  const start = Math.min(
    ...["{", "["]
      .map((c) => {
        const i = out.indexOf(c);
        return i < 0 ? Number.POSITIVE_INFINITY : i;
      }),
  );
  const slice = Number.isFinite(start) ? out.slice(start) : out;
  try {
    return JSON.parse(slice) as T;
  } catch {
    throw new GvlError(`failed to parse gvl JSON: ${out.slice(0, 180)}`);
  }
}

export async function gvlStatus(args: string[]): Promise<LightStatus> {
  return parseStatus(await gvlJson<unknown>(args));
}

export async function getStatus(timeoutMs = 15_000): Promise<LightStatus> {
  return parseStatus(await gvlJson<unknown>(["status"], { timeoutMs }));
}

export async function getConfig(): Promise<GvlConfig> {
  const text = await gvl(["config", "show"], { json: false, timeoutMs: 5000 });
  const cfg = parseConfigShow(text);
  // config show masks the token as *** when set
  const tokenLine = text
    .split("\n")
    .find((l) => l.trimStart().startsWith("token:"));
  const tokenVal = tokenLine?.slice(tokenLine.indexOf(":") + 1).trim() ?? "";
  cfg.tokenSet = tokenVal !== "" && tokenVal !== "(empty)";
  return cfg;
}

export function hasDaemon(config: GvlConfig | null): boolean {
  if (isDirectLan()) return false;
  return Boolean(config?.url?.trim());
}

export async function listSchedules(): Promise<ScheduleEntry[]> {
  const raw = await gvlJson<ScheduleEntry[] | null>(["schedule", "list"]);
  return Array.isArray(raw) ? raw : [];
}

export async function listDevices(): Promise<DiscoveredDevice[]> {
  const raw = await gvlJson<DiscoveredDevice[]>(["discover"], {
    timeoutMs: 20_000,
  });
  return Array.isArray(raw) ? raw : [];
}

export async function crawlDevices(save: boolean): Promise<DiscoveredDevice[]> {
  const args = save ? ["crawl", "--save"] : ["crawl"];
  const raw = await gvlJson<{ devices?: DiscoveredDevice[] }>(args, {
    timeoutMs: 90_000,
  });
  return Array.isArray(raw.devices) ? raw.devices : [];
}
