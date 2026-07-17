import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const TLP_PROFILES = ["performance", "balanced", "power-saver"] as const;
export type TlpProfile = (typeof TLP_PROFILES)[number];

export type TlpStatus = {
  active: TlpProfile;
  powerSource: string;
  rawProfile: string;
};

const PROFILE_ALIASES: Record<string, TlpProfile> = {
  performance: "performance",
  ac: "performance",
  balanced: "balanced",
  bat: "balanced",
  "power-saver": "power-saver",
  powersaver: "power-saver",
};

export function normalizeProfile(raw: string): TlpProfile | null {
  const key = raw.trim().toLowerCase().split("/")[0] ?? "";
  return PROFILE_ALIASES[key] ?? null;
}

export function isTlpProfile(value: string): value is TlpProfile {
  return (TLP_PROFILES as readonly string[]).includes(value);
}

export async function getTlpStatus(): Promise<TlpStatus> {
  const { stdout } = await execFileAsync("tlp-stat", ["-s"]);
  const profileMatch = stdout.match(/TLP profile\s*=\s*(.+)/i);
  const sourceMatch = stdout.match(/Power source\s*=\s*(.+)/i);

  if (!profileMatch?.[1]) {
    throw new Error("Could not parse TLP profile from tlp-stat -s");
  }

  const rawProfile = profileMatch[1].trim();
  const active = normalizeProfile(rawProfile);
  if (!active) {
    throw new Error(`Unknown TLP profile: ${rawProfile}`);
  }

  return {
    active,
    powerSource: sourceMatch?.[1]?.trim() ?? "unknown",
    rawProfile,
  };
}

export async function setTlpProfile(profile: TlpProfile): Promise<TlpStatus> {
  try {
    await execFileAsync("sudo", ["-n", "tlp", profile]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to set TLP profile (need passwordless sudo for tlp): ${message}`,
    );
  }
  return getTlpStatus();
}

export function profileLabel(profile: TlpProfile): string {
  switch (profile) {
    case "performance":
      return "Performance";
    case "balanced":
      return "Balanced";
    case "power-saver":
      return "Power saver";
  }
}

export function profileDescription(profile: TlpProfile): string {
  switch (profile) {
    case "performance":
      return "Max performance (tlp performance / ac)";
    case "balanced":
      return "Balanced (tlp balanced / bat)";
    case "power-saver":
      return "Power saver (tlp power-saver)";
  }
}
