import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  getOption,
  hyprlangConfigAssignment,
  hyprlangDeviceEnabled,
  luaConfigAssignment,
  luaDeviceEnabled,
  resolveTrackpointDevice,
  setBoolOption,
  setDeviceEnabled,
  setIntOption,
  type HyprOptionValue,
} from "./hyprctl";
import {
  installPersistHook,
  readPersistState,
  readSetupStatus,
  renderConfFile,
  renderLuaFile,
  upsertPersistedSetting,
  writeGeneratedConf,
  writeGeneratedLua,
  writePersistState,
  type PersistState,
  type PersistedSetting,
  type SetupStatus,
} from "./persist";
import { darkWindowLuaChunk } from "./darkwindow";
import { pluginHyprlangChunks, pluginLuaChunks } from "./plugins";

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
    description: "Red-dot pointer",
    keywords: ["trackpoint", "nipple", "stick", "pointer", "mouse"],
    kind: "device-bool",
  },
];

async function resolvedDeviceName(
  def: SettingDef,
): Promise<string | undefined> {
  if (def.deviceName) return def.deviceName;
  if (def.id === "trackpoint") return resolveTrackpointDevice();
  return undefined;
}

/** Legacy session-only path (pre-persist). Migrated into state.json when found. */
function legacyDeviceStatePath(id: string): string {
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

function parseEnabledFlag(raw: string): boolean | undefined {
  const s = raw.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "on") return true;
  if (s === "false" || s === "0" || s === "off") return false;
  return undefined;
}

function readLegacyDeviceEnabled(id: string): boolean | undefined {
  try {
    return parseEnabledFlag(readFileSync(legacyDeviceStatePath(id), "utf8"));
  } catch {
    return undefined;
  }
}

function forgetLegacyDeviceEnabled(id: string): void {
  try {
    unlinkSync(legacyDeviceStatePath(id));
  } catch {
    // missing / unreadable
  }
}

export function luaForPersisted(
  def: SettingDef,
  saved: PersistedSetting,
): string | undefined {
  switch (def.kind) {
    case "bool": {
      if (!def.option) return undefined;
      return luaConfigAssignment(def.option, saved.enabled ? "true" : "false");
    }
    case "int-as-bool": {
      if (!def.option) return undefined;
      const on = def.intOnValue ?? 1;
      return luaConfigAssignment(def.option, String(saved.enabled ? on : 0));
    }
    case "device-bool": {
      const name = saved.deviceName ?? def.deviceName;
      if (!name) return undefined;
      return luaDeviceEnabled(name, saved.enabled);
    }
  }
}

export function luaFromState(state: PersistState): string {
  const codes: string[] = [];
  for (const def of SETTINGS) {
    const saved = state.settings[def.id];
    if (!saved) continue;
    const code = luaForPersisted(def, saved);
    if (code) codes.push(code);
  }
  codes.push(...pluginLuaChunks(state.plugins));
  const shades = darkWindowLuaChunk(Object.values(state.darkWindows ?? {}));
  if (shades) codes.push(shades);
  return renderLuaFile(codes);
}

export function hyprlangForPersisted(
  def: SettingDef,
  saved: PersistedSetting,
): string | undefined {
  switch (def.kind) {
    case "bool": {
      if (!def.option) return undefined;
      return hyprlangConfigAssignment(
        def.option,
        saved.enabled ? "true" : "false",
      );
    }
    case "int-as-bool": {
      if (!def.option) return undefined;
      const on = def.intOnValue ?? 1;
      return hyprlangConfigAssignment(
        def.option,
        String(saved.enabled ? on : 0),
      );
    }
    case "device-bool": {
      const name = saved.deviceName ?? def.deviceName;
      if (!name) return undefined;
      return hyprlangDeviceEnabled(name, saved.enabled);
    }
  }
}

export function hyprlangFromState(state: PersistState): string {
  const blocks: string[] = [];
  for (const def of SETTINGS) {
    const saved = state.settings[def.id];
    if (!saved) continue;
    const block = hyprlangForPersisted(def, saved);
    if (block) blocks.push(block);
  }
  blocks.push(...pluginHyprlangChunks(state.plugins));
  return renderConfFile(blocks);
}

function writeGeneratedConfig(state: PersistState): void {
  writeGeneratedLua(luaFromState(state));
  writeGeneratedConf(hyprlangFromState(state));
}

function persistOverride(id: string, patch: PersistedSetting): PersistState {
  const state = upsertPersistedSetting(id, patch);
  writeGeneratedConfig(state);
  installPersistHook();
  return state;
}

export function stateFromLive(live: SettingState[]): PersistState {
  const settings: Record<string, PersistedSetting> = {};
  for (const item of live) {
    settings[item.id] =
      item.kind === "device-bool" && item.deviceName
        ? { enabled: item.enabled, deviceName: item.deviceName }
        : { enabled: item.enabled };
  }
  return {
    version: 1,
    settings,
    plugins: {},
    disabledPlugins: {},
    darkWindows: {},
  };
}

function seedPersistFromLive(live: SettingState[]): void {
  if (live.length === 0) return;
  const existing = readPersistState();
  if (Object.keys(existing.settings).length > 0) return;
  const state: PersistState = {
    ...stateFromLive(live),
    plugins: existing.plugins,
    disabledPlugins: existing.disabledPlugins,
    darkWindows: existing.darkWindows,
  };
  writePersistState(state);
  writeGeneratedConfig(state);
}

function readDeviceEnabled(id: string): boolean {
  const saved = readPersistState().settings[id];
  if (saved) return saved.enabled;
  const legacy = readLegacyDeviceEnabled(id);
  if (legacy !== undefined) return legacy;
  return defaultDeviceEnabled(id);
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

async function applySetting(def: SettingDef, enabled: boolean): Promise<void> {
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
      const deviceName = await resolvedDeviceName(def);
      if (!deviceName) {
        throw new Error(`Setting ${def.id} missing deviceName`);
      }
      await setDeviceEnabled(deviceName, enabled);
      break;
    }
  }
}

async function applyPersistedSettings(): Promise<void> {
  const state = readPersistState();
  await Promise.all(
    SETTINGS.map(async (def) => {
      const saved = state.settings[def.id];
      if (!saved) return;
      const withDevice = saved.deviceName
        ? { ...def, deviceName: saved.deviceName }
        : def;
      try {
        if (def.kind === "device-bool") {
          await applySetting(withDevice, saved.enabled);
          return;
        }
        const live = await readSetting(withDevice);
        if (live.enabled !== saved.enabled) {
          await applySetting(withDevice, saved.enabled);
        }
      } catch {
        // Still show whatever hyprctl reports.
      }
    }),
  );
}

export function ensurePersistence(): void {
  writeGeneratedConfig(readPersistState());
}

async function loadLiveSettings(): Promise<SettingState[]> {
  const defs: SettingDef[] = [];
  for (const def of SETTINGS) {
    if (def.kind === "device-bool" && !def.deviceName) {
      const deviceName = await resolvedDeviceName(def);
      if (!deviceName) continue;
      defs.push({ ...def, deviceName });
      continue;
    }
    defs.push(def);
  }
  return Promise.all(defs.map((def) => readSetting(def)));
}

/** Snapshot current toggles and append a load hook to hyprland.lua or hyprland.conf. */
export async function installPersistence(): Promise<SetupStatus> {
  const live = await loadLiveSettings();
  seedPersistFromLive(live);
  writeGeneratedConfig(readPersistState());
  const hook = installPersistHook();
  if (hook.kind === "none") {
    throw new Error(hook.message);
  }
  return readSetupStatus();
}

export { readSetupStatus };
export type { SetupStatus };

export async function readSetting(def: SettingDef): Promise<SettingState> {
  if (def.kind === "device-bool") {
    const deviceName = await resolvedDeviceName(def);
    if (!deviceName) {
      throw new Error(`Setting ${def.id} missing deviceName`);
    }
    const saved = readPersistState().settings[def.id];
    const legacy = saved ? undefined : readLegacyDeviceEnabled(def.id);
    if (!saved && legacy !== undefined) {
      persistOverride(def.id, { enabled: legacy, deviceName });
      forgetLegacyDeviceEnabled(def.id);
    }
    return {
      ...def,
      deviceName,
      description: `${def.description} (${deviceName})`,
      enabled: readDeviceEnabled(def.id),
    };
  }

  if (!def.option) {
    throw new Error(`Setting ${def.id} missing option`);
  }

  const raw = await getOption(def.option);
  return { ...def, enabled: asEnabled(raw), raw };
}

export async function readAllSettings(): Promise<SettingState[]> {
  ensurePersistence();
  await applyPersistedSettings();
  const live = await loadLiveSettings();
  seedPersistFromLive(live);
  return live;
}

export async function setSettingEnabled(
  def: SettingDef,
  enabled: boolean,
): Promise<SettingState> {
  await applySetting(def, enabled);
  const deviceName =
    def.kind === "device-bool" ? await resolvedDeviceName(def) : undefined;
  persistOverride(
    def.id,
    deviceName ? { enabled, deviceName } : { enabled },
  );
  forgetLegacyDeviceEnabled(def.id);
  return readSetting(def);
}

export function statusLabel(enabled: boolean): string {
  return enabled ? "On" : "Off";
}

