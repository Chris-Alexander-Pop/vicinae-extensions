import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const NO_TURBO_PATH = "/sys/devices/system/cpu/intel_pstate/no_turbo";
const FAN_PATH = "/proc/acpi/ibm/fan";
const FAN_CONTROL_PATH = "/sys/module/thinkpad_acpi/parameters/fan_control";
const THERMAL_CONF = "/etc/thermald/thermal-conf.xml";
const THERMAL_ZONES = "/sys/class/thermal";
const HELPER = "/usr/local/bin/vicinae-thermal";

export const TARGET_MIN_C = 55;
export const TARGET_MAX_C = 95;
export const TARGET_DEFAULT_C = 75;

export type TurboState = "on" | "off";
export type FanMode = "auto" | "max" | "other";

export type HardwareStatus = {
  turbo: TurboState | "unavailable";
  fan: FanMode | "unavailable";
  fanLevel: string | null;
  fanControl: boolean;
};

export type ThermaldService = "active" | "inactive" | "missing";

export type ThermalTarget = {
  targetC: number | null;
  service: ThermaldService;
  packageC: number | null;
};

export function parseTurbo(raw: string): TurboState | null {
  const value = raw.trim();
  if (value === "0") return "on";
  if (value === "1") return "off";
  return null;
}

export function parseFanLevel(
  raw: string,
): { mode: FanMode; level: string } | null {
  const match = raw.match(/^level:\s*(\S+)/m);
  if (!match?.[1]) return null;
  const level = match[1];
  const key = level.toLowerCase();
  if (key === "auto") return { mode: "auto", level };
  if (key === "disengaged" || key === "full-speed") {
    return { mode: "max", level };
  }
  return { mode: "other", level };
}

export function parseFanControlEnabled(raw: string): boolean {
  const value = raw.trim().toUpperCase();
  return value === "Y" || value === "1";
}

export function isAllowedTarget(celsius: number): boolean {
  return (
    Number.isInteger(celsius) &&
    celsius >= TARGET_MIN_C &&
    celsius <= TARGET_MAX_C
  );
}

export function parseTargetCelsius(xml: string): number | null {
  const match = xml.match(/<Temperature>\s*(\d+)\s*<\/Temperature>/i);
  if (!match?.[1]) return null;
  const milli = Number(match[1]);
  if (!Number.isInteger(milli) || milli % 1000 !== 0) return null;
  const celsius = milli / 1000;
  return isAllowedTarget(celsius) ? celsius : null;
}

export function parsePackageMilli(raw: string): number | null {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 0 || value > 150000) return null;
  return value;
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function getHardwareStatus(): Promise<HardwareStatus> {
  const [turboRaw, fanRaw, fanControlRaw] = await Promise.all([
    readText(NO_TURBO_PATH),
    readText(FAN_PATH),
    readText(FAN_CONTROL_PATH),
  ]);

  const turbo = turboRaw === null ? "unavailable" : parseTurbo(turboRaw);
  const fan = fanRaw === null ? null : parseFanLevel(fanRaw);

  return {
    turbo: turbo ?? "unavailable",
    fan: fan?.mode ?? "unavailable",
    fanLevel: fan?.level ?? null,
    fanControl: fanControlRaw !== null && parseFanControlEnabled(fanControlRaw),
  };
}

function commandError(err: unknown): string {
  if (err && typeof err === "object" && "stderr" in err) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? "").trim();
    if (stderr) return stderr;
  }
  return err instanceof Error ? err.message : String(err);
}

async function runHelper(args: string[]): Promise<void> {
  try {
    await execFileAsync("sudo", ["-n", HELPER, ...args]);
  } catch (err) {
    const message = commandError(err);
    if (
      message.includes("password is required") ||
      message.includes("a password is required") ||
      message.includes("ENOENT") ||
      message.includes("No such file") ||
      message.includes("command not found")
    ) {
      throw new Error(
        "Needs /usr/local/bin/vicinae-thermal with passwordless sudo. " +
          "Run: sudo bash power/private/install-thermal-permissions.sh",
      );
    }
    throw new Error(message);
  }
}

export async function setTurbo(state: TurboState): Promise<void> {
  await runHelper(["turbo", state]);
}

export async function setFan(mode: "auto" | "max"): Promise<void> {
  await runHelper(["fan", mode]);
}

async function readPackageCelsius(): Promise<number | null> {
  let names: string[];
  try {
    names = await readdir(THERMAL_ZONES);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.startsWith("thermal_zone")) continue;
    const type = await readText(`${THERMAL_ZONES}/${name}/type`);
    if (type?.trim() !== "x86_pkg_temp") continue;
    const raw = await readText(`${THERMAL_ZONES}/${name}/temp`);
    if (raw === null) return null;
    const milli = parsePackageMilli(raw);
    return milli === null ? null : Math.round(milli / 1000);
  }
  return null;
}

async function readThermaldService(): Promise<ThermaldService> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", "thermald"]);
    return stdout.trim() === "active" ? "active" : "inactive";
  } catch (err) {
    const stdout =
      err && typeof err === "object" && "stdout" in err
        ? String((err as { stdout?: unknown }).stdout ?? "").trim()
        : "";
    const message = commandError(err);
    if (stdout === "active") return "active";
    if (
      message.includes("not-found") ||
      message.includes("could not be found") ||
      stdout === "not-found"
    ) {
      return "missing";
    }
    return "inactive";
  }
}

export async function getThermalTarget(): Promise<ThermalTarget> {
  const [xml, service, packageC] = await Promise.all([
    readText(THERMAL_CONF),
    readThermaldService(),
    readPackageCelsius(),
  ]);
  return {
    targetC: xml === null ? null : parseTargetCelsius(xml),
    service,
    packageC,
  };
}

export async function setThermald(enabled: boolean): Promise<void> {
  await runHelper(["thermald", enabled ? "on" : "off"]);
}

export async function setTarget(celsius: number): Promise<void> {
  if (!isAllowedTarget(celsius)) {
    throw new Error(
      `Target must be a whole number from ${TARGET_MIN_C} to ${TARGET_MAX_C}`,
    );
  }
  await runHelper(["target", String(celsius)]);
}
