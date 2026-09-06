import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type BrightnessInfo = {
  device: string;
  className: string;
  current: number;
  percent: number;
  max: number;
};

function deviceArgs(device?: string): string[] {
  return device?.trim() ? ["-d", device.trim()] : [];
}

export function parseBrightnessctlInfo(stdout: string): BrightnessInfo {
  // device,class,current,percent%,max
  const [name, className, current, percentRaw, max] = stdout.trim().split(",");
  return {
    device: name ?? "",
    className: className ?? "",
    current: Number(current),
    percent: Number((percentRaw ?? "").replace("%", "")),
    max: Number(max),
  };
}

export function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export async function getBrightness(device?: string): Promise<BrightnessInfo> {
  const { stdout } = await execFileAsync("brightnessctl", [
    ...deviceArgs(device),
    "-m",
    "info",
  ]);
  return parseBrightnessctlInfo(stdout);
}

export async function setBrightnessPercent(
  percent: number,
  device?: string,
): Promise<BrightnessInfo> {
  const clamped = clampPercent(percent);
  await execFileAsync("brightnessctl", [
    ...deviceArgs(device),
    "-q",
    "set",
    `${clamped}%`,
  ]);
  return getBrightness(device);
}

export async function adjustBrightnessPercent(
  delta: number,
  device?: string,
): Promise<BrightnessInfo> {
  // Prefer absolute set: brightnessctl treats leading "-" as a flag
  // (so "-5%" fails; "5%-" works). Absolute keeps ±step consistent.
  const current = await getBrightness(device);
  return setBrightnessPercent(current.percent + delta, device);
}

export function parseStepPercent(raw: string | undefined, fallback = 5): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(50, Math.round(n));
}
