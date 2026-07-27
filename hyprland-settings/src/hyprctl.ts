import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Absolute path — extension workers may not inherit a full login PATH
const HYPRCTL = "/usr/bin/hyprctl";

export type HyprOptionValue =
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: number }
  | { kind: "float"; value: number }
  | { kind: "string"; value: string };

type GetOptionJson = {
  option?: string;
  bool?: boolean;
  int?: number;
  float?: number;
  str?: string;
  data?: string;
  set?: boolean;
};

function assertOk(stdout: string, stderr: string, context: string) {
  const out = `${stdout}\n${stderr}`.trim();
  if (/unknown request|can't work with non-legacy|error:/i.test(out)) {
    throw new Error(`${context}: ${out || "hyprctl failed"}`);
  }
}

export async function hyprctl(
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync(HYPRCTL, args, {
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`hyprctl ${args.join(" ")} failed: ${message}`);
  }
}

export async function getOption(option: string): Promise<HyprOptionValue> {
  const { stdout, stderr } = await hyprctl(["-j", "getoption", option]);
  assertOk(stdout, stderr, `getoption ${option}`);

  let parsed: GetOptionJson;
  try {
    parsed = JSON.parse(stdout) as GetOptionJson;
  } catch {
    throw new Error(`Could not parse getoption JSON for ${option}: ${stdout}`);
  }

  if (typeof parsed.bool === "boolean") {
    return { kind: "bool", value: parsed.bool };
  }
  if (typeof parsed.int === "number") {
    return { kind: "int", value: parsed.int };
  }
  if (typeof parsed.float === "number") {
    return { kind: "float", value: parsed.float };
  }
  if (typeof parsed.str === "string") {
    return { kind: "string", value: parsed.str };
  }
  if (typeof parsed.data === "string") {
    return { kind: "string", value: parsed.data };
  }

  throw new Error(`Unsupported option shape for ${option}: ${stdout.trim()}`);
}

/** Build `hl.config({ a = { b = { c = value } } })` from a dotted option path. */
export function luaConfigAssignment(
  option: string,
  luaValue: string,
): string {
  const parts = option.split(":").filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid option path: ${option}`);
  }

  let body = luaValue;
  for (let i = parts.length - 1; i >= 0; i--) {
    const key = parts[i]!;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid option segment "${key}" in ${option}`);
    }
    body = `{ ${key} = ${body} }`;
  }

  return `hl.config(${body})`;
}

export async function evalLua(code: string): Promise<void> {
  const { stdout, stderr } = await hyprctl(["eval", code]);
  assertOk(stdout, stderr, `eval ${code}`);
  const out = stdout.trim();
  if (out && out !== "ok") {
    // Some builds print "ok"; others may print nothing on success.
    if (/error/i.test(out)) {
      throw new Error(`eval failed: ${out}`);
    }
  }
}

export async function setBoolOption(
  option: string,
  value: boolean,
): Promise<void> {
  await evalLua(luaConfigAssignment(option, value ? "true" : "false"));
}

export async function setIntOption(
  option: string,
  value: number,
): Promise<void> {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`Expected integer for ${option}, got ${value}`);
  }
  await evalLua(luaConfigAssignment(option, String(value)));
}

export async function setDeviceEnabled(
  name: string,
  enabled: boolean,
): Promise<void> {
  const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  await evalLua(
    `hl.device({ name = "${escaped}", enabled = ${enabled ? "true" : "false"} })`,
  );
}
