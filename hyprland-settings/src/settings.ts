import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  getOption,
  setBoolOption,
  setDeviceEnabled,
  setIntOption,
  type HyprOptionValue,
} from "./hyprctl";

export type SettingKind = "bool" | "int-as-bool" | "device-bool";

export type SettingDef = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  kind: SettingKind;
  /** Dotted hypr option path, e.g. animations:enabled */
  option?: string;
  /** Device name for hl.device({ name = ... }) */
  deviceName?: string;
  /** When kind is int-as-bool, which non-zero value to write when enabling */
  intOnValue?: number;
};

export type SettingState = SettingDef & {
  enabled: boolean;
  raw?: HyprOptionValue;
};

export const SETTINGS: SettingDef[] = [
  {
    id: "animations",
    title: "Animations",
    description: "Window / workspace / layer animations",
    keywords: ["anim", "motion", "smooth", "performance"],
    kind: "bool",
    option: "animations:enabled",
  },
  {
    id: "touchscreen",
    title: "Touchscreen",
    description: "Finger touch input (input:touchdevice:enabled)",
    keywords: ["touch", "touchscreen", "finger", "tablet", "wacom"],
    kind: "bool",
    option: "input:touchdevice:enabled",
  },
  {
    id: "blur",
    title: "Blur",
    description: "Kawase window background blur",
    keywords: ["blur", "decoration", "glass", "performance"],
    kind: "bool",
    option: "decoration:blur:enabled",
  },
  {
    id: "shadows",
    title: "Shadows",
    description: "Drop shadows on windows",
    keywords: ["shadow", "decoration", "drop"],
    kind: "bool",
    option: "decoration:shadow:enabled",
  },
  {
    id: "software-cursors",
    title: "Software Cursors",
    description: "Disable hardware cursors (helps some NVIDIA flicker)",
    keywords: ["cursor", "pointer", "nvidia", "hardware"],
    kind: "int-as-bool",
    option: "cursor:no_hardware_cursors",
    intOnValue: 1,
  },
  {
    id: "trackpoint",
    title: "TrackPoint",
    description: "ThinkPad red-dot pointer (tpps/2-elan-trackpoint)",
    keywords: ["trackpoint", "nipple", "stick", "pointer", "mouse"],
    kind: "device-bool",
    deviceName: "tpps/2-elan-trackpoint",
  },
];

/** Device enabled can't be queried via getoption — persist for the session. */
function deviceStatePath(id: string): string {
  const base =
    process.env.XDG_RUNTIME_DIR?.trim() ||
    `/run/user/${typeof process.getuid === "function" ? process.getuid() : 1000}`;
  return join(base, "vicinae-hyprland-settings", `${id}.enabled`);
}

function defaultDeviceEnabled(id: string): boolean {
  // Match hypr-user.conf: TrackPoint starts disabled.
  if (id === "trackpoint") return false;
  return true;
}

function readDeviceEnabled(id: string): boolean {
  try {
    const raw = readFileSync(deviceStatePath(id), "utf8").trim().toLowerCase();
    if (raw === "true" || raw === "1" || raw === "on") return true;
    if (raw === "false" || raw === "0" || raw === "off") return false;
  } catch {
    // missing / unreadable
  }
  return defaultDeviceEnabled(id);
}

function writeDeviceEnabled(id: string, enabled: boolean): void {
  const path = deviceStatePath(id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, enabled ? "true\n" : "false\n", "utf8");
}

function asEnabled(value: HyprOptionValue): boolean {
  switch (value.kind) {
    case "bool":
      return value.value;
    case "int":
    case "float":
      return value.value !== 0;
    case "string": {
      const s = value.value.trim().toLowerCase();
      return s === "true" || s === "yes" || s === "1" || s === "on";
    }
  }
}

export async function readSetting(def: SettingDef): Promise<SettingState> {
  if (def.kind === "device-bool") {
    if (!def.deviceName) {
      throw new Error(`Setting ${def.id} missing deviceName`);
    }
    return { ...def, enabled: readDeviceEnabled(def.id) };
  }

  if (!def.option) {
    throw new Error(`Setting ${def.id} missing option`);
  }

  const raw = await getOption(def.option);
  return { ...def, enabled: asEnabled(raw), raw };
}

export async function readAllSettings(): Promise<SettingState[]> {
  return Promise.all(SETTINGS.map((def) => readSetting(def)));
}

export async function setSettingEnabled(
  def: SettingDef,
  enabled: boolean,
): Promise<SettingState> {
  switch (def.kind) {
    case "bool": {
      if (!def.option) throw new Error(`Setting ${def.id} missing option`);
      await setBoolOption(def.option, enabled);
      break;
    }
    case "int-as-bool": {
      if (!def.option) throw new Error(`Setting ${def.id} missing option`);
      const on = def.intOnValue ?? 1;
      await setIntOption(def.option, enabled ? on : 0);
      break;
    }
    case "device-bool": {
      if (!def.deviceName) {
        throw new Error(`Setting ${def.id} missing deviceName`);
      }
      await setDeviceEnabled(def.deviceName, enabled);
      writeDeviceEnabled(def.id, enabled);
      break;
    }
  }

  return readSetting(def);
}

export function statusLabel(enabled: boolean): string {
  return enabled ? "On" : "Off";
}
