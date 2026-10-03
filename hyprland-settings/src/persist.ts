import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseDarkWindowConfig, type DarkWindowConfig } from "./darkwindow";
import { isKnownPluginOption } from "./plugins";
import {
  isSafePluginPath,
  renderDisabledPluginsLua,
  withPluginSwitchHook,
  type DisabledPlugin,
} from "./plugin-switch";

export type { DisabledPlugin };

export type PersistedSetting = {
  enabled: boolean;
  deviceName?: string;
};

/** One plugin option saved by Hyprland Settings. `option` keys live on the parent map. */
export type PluginPersistValue =
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: number }
  | { kind: "float"; value: number }
  | { kind: "string"; value: string }
  | { kind: "color"; value: string };

export type PersistState = {
  version: 1;
  settings: Record<string, PersistedSetting>;
  plugins: Record<string, PluginPersistValue>;
  /** Absolute .so paths that `hl.plugin.load` must skip. Keyed by path. */
  disabledPlugins: Record<string, DisabledPlugin>;
  /** Dark Window shades keyed by id. */
  darkWindows: Record<string, DarkWindowConfig>;
};

export const HOOK_MARKER = "vicinae-hyprland-settings";

function emptyState(): PersistState {
  return {
    version: 1,
    settings: {},
    plugins: {},
    disabledPlugins: {},
    darkWindows: {},
  };
}

export type PersistPaths = {
  statePath: string;
  luaPath: string;
  confPath: string;
  hyprlandLuaPath: string;
  hyprlandConfPath: string;
  pluginsLuaPath: string;
};

export type EntrypointKind = "lua" | "conf" | "none";

export type SetupStatus = {
  ready: boolean;
  entrypoint: EntrypointKind;
  entrypointPath: string | null;
  hookInstalled: boolean;
  generatedPath: string | null;
  savedCount: number;
  title: string;
  subtitle: string;
};

export type HookInstallResult = {
  kind: EntrypointKind;
  path: string | null;
  changed: boolean;
  alreadyInstalled: boolean;
  message: string;
};

export function persistPaths(
  env: NodeJS.ProcessEnv = process.env,
): PersistPaths {
  const home = env.HOME?.trim() || homedir();
  const xdg = env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  const hypr = join(xdg, "hypr");
  return {
    statePath: join(xdg, "vicinae", "hyprland-settings", "state.json"),
    luaPath: join(hypr, "vicinae-settings.lua"),
    confPath: join(hypr, "vicinae-settings.conf"),
    hyprlandLuaPath: join(hypr, "hyprland.lua"),
    hyprlandConfPath: join(hypr, "hyprland.conf"),
    pluginsLuaPath: join(hypr, "vicinae-plugins.lua"),
  };
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, body, "utf8");
  renameSync(tmp, path);
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function parsePluginValue(value: unknown): PluginPersistValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as { kind?: unknown; value?: unknown };
  if (row.kind === "bool" && typeof row.value === "boolean") {
    return { kind: "bool", value: row.value };
  }
  if (
    row.kind === "int" &&
    typeof row.value === "number" &&
    Number.isInteger(row.value)
  ) {
    return { kind: "int", value: row.value };
  }
  if (
    row.kind === "float" &&
    typeof row.value === "number" &&
    Number.isFinite(row.value)
  ) {
    return { kind: "float", value: row.value };
  }
  if (row.kind === "string" && typeof row.value === "string") {
    return { kind: "string", value: row.value };
  }
  if (
    row.kind === "color" &&
    typeof row.value === "string" &&
    /^0x[0-9a-f]{8}$/.test(row.value)
  ) {
    return { kind: "color", value: row.value };
  }
  return undefined;
}

export function parsePersistState(raw: unknown): PersistState {
  if (!raw || typeof raw !== "object") return emptyState();
  const o = raw as {
    version?: unknown;
    settings?: unknown;
    plugins?: unknown;
    disabledPlugins?: unknown;
    darkWindows?: unknown;
  };
  const settings: Record<string, PersistedSetting> = {};
  if (o.settings && typeof o.settings === "object") {
    for (const [id, value] of Object.entries(
      o.settings as Record<string, unknown>,
    )) {
      if (!id.trim() || !value || typeof value !== "object") continue;
      const row = value as { enabled?: unknown; deviceName?: unknown };
      if (typeof row.enabled !== "boolean") continue;
      const deviceName =
        typeof row.deviceName === "string" && row.deviceName.trim()
          ? row.deviceName.trim()
          : undefined;
      settings[id] = deviceName
        ? { enabled: row.enabled, deviceName }
        : { enabled: row.enabled };
    }
  }
  const plugins: Record<string, PluginPersistValue> = {};
  if (o.plugins && typeof o.plugins === "object") {
    for (const [option, value] of Object.entries(
      o.plugins as Record<string, unknown>,
    )) {
      if (!isKnownPluginOption(option)) continue;
      const parsed = parsePluginValue(value);
      if (parsed) plugins[option] = parsed;
    }
  }
  return {
    version: 1,
    settings,
    plugins,
    disabledPlugins: parseDisabled(o),
    darkWindows: parseDarkWindows(o.darkWindows),
  };
}

function cleanLine(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\0]/g, " ").trim();
}

function parseDisabled(raw: {
  disabledPlugins?: unknown;
}): Record<string, DisabledPlugin> {
  const out: Record<string, DisabledPlugin> = {};
  const source = raw.disabledPlugins;
  if (!source || typeof source !== "object") return out;
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const path = typeof row.path === "string" ? row.path : key;
    const name = cleanLine(row.name);
    if (path !== key || !isSafePluginPath(path) || !name) continue;
    out[path] = {
      name,
      path,
      description: cleanLine(row.description),
      author: cleanLine(row.author),
      version: cleanLine(row.version),
    };
  }
  return out;
}

function parseDarkWindows(raw: unknown): Record<string, DarkWindowConfig> {
  const out: Record<string, DarkWindowConfig> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseDarkWindowConfig(value);
    if (!parsed || parsed.id !== key) continue;
    out[key] = parsed;
  }
  return out;
}

function nextState(
  state: PersistState,
  patch: Partial<
    Pick<PersistState, "settings" | "plugins" | "disabledPlugins" | "darkWindows">
  >,
): PersistState {
  return {
    version: 1,
    settings: patch.settings ?? state.settings,
    plugins: patch.plugins ?? state.plugins,
    disabledPlugins: patch.disabledPlugins ?? state.disabledPlugins ?? {},
    darkWindows: patch.darkWindows ?? state.darkWindows ?? {},
  };
}

export function readPersistState(
  env: NodeJS.ProcessEnv = process.env,
): PersistState {
  try {
    const raw = readFileSync(persistPaths(env).statePath, "utf8");
    return parsePersistState(JSON.parse(raw) as unknown);
  } catch {
    return emptyState();
  }
}

export function writePersistState(
  state: PersistState,
  env: NodeJS.ProcessEnv = process.env,
): void {
  atomicWrite(
    persistPaths(env).statePath,
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

export function upsertPersistedSetting(
  id: string,
  patch: PersistedSetting,
  env: NodeJS.ProcessEnv = process.env,
): PersistState {
  const state = readPersistState(env);
  const next = nextState(state, {
    settings: { ...state.settings, [id]: patch },
  });
  writePersistState(next, env);
  return next;
}

export function mergePluginValues(
  patch: Record<string, PluginPersistValue>,
  env: NodeJS.ProcessEnv = process.env,
): PersistState {
  const state = readPersistState(env);
  const plugins = { ...state.plugins };
  for (const [option, value] of Object.entries(patch)) {
    if (!isKnownPluginOption(option)) continue;
    plugins[option] = value;
  }
  const next = nextState(state, { plugins });
  writePersistState(next, env);
  return next;
}

export function dropPluginValues(
  options: string[],
  env: NodeJS.ProcessEnv = process.env,
): PersistState {
  const state = readPersistState(env);
  const plugins = { ...state.plugins };
  for (const option of options) delete plugins[option];
  const next = nextState(state, { plugins });
  writePersistState(next, env);
  return next;
}

export function writeDarkWindows(
  darkWindows: Record<string, DarkWindowConfig>,
  env: NodeJS.ProcessEnv = process.env,
): PersistState {
  const next = nextState(readPersistState(env), { darkWindows });
  writePersistState(next, env);
  return next;
}

export function writeDisabledPlugins(
  disabled: Record<string, DisabledPlugin>,
  env: NodeJS.ProcessEnv = process.env,
): PersistState {
  const next = nextState(readPersistState(env), { disabledPlugins: disabled });
  writePersistState(next, env);
  atomicWrite(persistPaths(env).pluginsLuaPath, renderDisabledPluginsLua(disabled));
  return next;
}

/** Prepend the load-skip hook. Throws when hyprland.lua is missing. */
export function ensurePluginSwitchHook(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const path = persistPaths(env).hyprlandLuaPath;
  if (!existsSync(path)) {
    throw new Error(
      "No hyprland.lua. Turning a plugin off needs that file so the next reload skips it.",
    );
  }
  return patchFile(path, withPluginSwitchHook);
}

export function renderLuaFile(codes: string[]): string {
  const header = [
    "-- Generated by Vicinae Hyprland Settings. Do not edit.",
    "-- Last-toggled values; sourced from hyprland.lua so they survive reload and logout.",
  ];
  if (codes.length === 0) {
    return `${[...header, "-- No overrides yet."].join("\n")}\n`;
  }
  return `${[...header, "", ...codes].join("\n")}\n`;
}

export function renderConfFile(blocks: string[]): string {
  const header = [
    "# Generated by Vicinae Hyprland Settings. Do not edit.",
    "# Last-toggled values; sourced from hyprland.conf so they survive reload and logout.",
  ];
  if (blocks.length === 0) {
    return `${[...header, "# No overrides yet."].join("\n")}\n`;
  }
  return `${[...header, "", ...blocks].join("\n\n")}\n`;
}

export function writeGeneratedLua(
  contents: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  atomicWrite(persistPaths(env).luaPath, contents);
}

export function writeGeneratedConf(
  contents: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  atomicWrite(persistPaths(env).confPath, contents);
}

export function hookBlock(): string {
  return [
    `-- ${HOOK_MARKER}: persist launcher toggles across reload/restart`,
    "do",
    `  local xdg = os.getenv("XDG_CONFIG_HOME") or ((os.getenv("HOME") or "/home/user") .. "/.config")`,
    `  pcall(dofile, xdg .. "/hypr/vicinae-settings.lua")`,
    "end",
  ].join("\n");
}

export function confHookBlock(confAbsPath: string): string {
  return [
    `# ${HOOK_MARKER}: persist launcher toggles across reload/restart`,
    `source = ${confAbsPath}`,
  ].join("\n");
}

export function withHyprlandHook(existing: string): string {
  if (existing.includes(HOOK_MARKER)) return existing;
  const trimmed = existing.replace(/\s*$/, "");
  return `${trimmed}\n\n${hookBlock()}\n`;
}

export function withHyprlandConfHook(
  existing: string,
  confAbsPath: string,
): string {
  if (existing.includes(HOOK_MARKER)) return existing;
  const trimmed = existing.replace(/\s*$/, "");
  return `${trimmed}\n\n${confHookBlock(confAbsPath)}\n`;
}

function patchFile(
  path: string,
  nextBody: (existing: string) => string,
): boolean {
  if (!existsSync(path)) return false;
  const existing = readText(path);
  if (existing === undefined) return false;
  const next = nextBody(existing);
  if (next === existing) return false;
  atomicWrite(path, next);
  return true;
}

/** Append the dofile hook to an existing hyprland.lua. No-op if missing. */
export function ensureHyprlandHook(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return patchFile(persistPaths(env).hyprlandLuaPath, withHyprlandHook);
}

export function ensureHyprlandConfHook(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const paths = persistPaths(env);
  return patchFile(paths.hyprlandConfPath, (existing) =>
    withHyprlandConfHook(existing, paths.confPath),
  );
}

export function detectEntrypoint(
  env: NodeJS.ProcessEnv = process.env,
): { kind: EntrypointKind; path: string | null } {
  const paths = persistPaths(env);
  if (existsSync(paths.hyprlandLuaPath)) {
    return { kind: "lua", path: paths.hyprlandLuaPath };
  }
  if (existsSync(paths.hyprlandConfPath)) {
    return { kind: "conf", path: paths.hyprlandConfPath };
  }
  return { kind: "none", path: null };
}

export function installPersistHook(
  env: NodeJS.ProcessEnv = process.env,
): HookInstallResult {
  const paths = persistPaths(env);
  const entry = detectEntrypoint(env);
  if (entry.kind === "lua" && entry.path) {
    const already = (readText(entry.path) ?? "").includes(HOOK_MARKER);
    const changed = ensureHyprlandHook(env);
    return {
      kind: "lua",
      path: entry.path,
      changed,
      alreadyInstalled: already,
      message: already
        ? `Already hooked in ${entry.path}`
        : `Hooked ${entry.path}`,
    };
  }
  if (entry.kind === "conf" && entry.path) {
    const already = (readText(entry.path) ?? "").includes(HOOK_MARKER);
    const changed = ensureHyprlandConfHook(env);
    return {
      kind: "conf",
      path: entry.path,
      changed,
      alreadyInstalled: already,
      message: already
        ? `Already hooked in ${entry.path}`
        : `Hooked ${entry.path}`,
    };
  }
  return {
    kind: "none",
    path: null,
    changed: false,
    alreadyInstalled: false,
    message: `No hyprland.lua or hyprland.conf in ${dirname(paths.hyprlandLuaPath)}`,
  };
}

export function readSetupStatus(
  env: NodeJS.ProcessEnv = process.env,
): SetupStatus {
  const paths = persistPaths(env);
  const savedCount = Object.keys(readPersistState(env).settings).length;
  const entry = detectEntrypoint(env);

  if (entry.kind === "lua" && entry.path) {
    const hookInstalled = (readText(entry.path) ?? "").includes(HOOK_MARKER);
    const generated = existsSync(paths.luaPath);
    return {
      ready: hookInstalled && generated,
      entrypoint: "lua",
      entrypointPath: entry.path,
      hookInstalled,
      generatedPath: paths.luaPath,
      savedCount,
      title: hookInstalled
        ? "Persist across restarts"
        : "Install persist across restarts",
      subtitle: hookInstalled
        ? `Hooked in hyprland.lua · ${savedCount} saved`
        : "Adds a load hook to hyprland.lua so toggles survive reload and login",
    };
  }

  if (entry.kind === "conf" && entry.path) {
    const hookInstalled = (readText(entry.path) ?? "").includes(HOOK_MARKER);
    const generated = existsSync(paths.confPath);
    return {
      ready: hookInstalled && generated,
      entrypoint: "conf",
      entrypointPath: entry.path,
      hookInstalled,
      generatedPath: paths.confPath,
      savedCount,
      title: hookInstalled
        ? "Persist across restarts"
        : "Install persist across restarts",
      subtitle: hookInstalled
        ? `Hooked in hyprland.conf · ${savedCount} saved`
        : "Adds a source line to hyprland.conf so toggles survive reload and login",
    };
  }

  return {
    ready: false,
    entrypoint: "none",
    entrypointPath: null,
    hookInstalled: false,
    generatedPath: null,
    savedCount,
    title: "Can't install persist hook",
    subtitle: `No hyprland.lua or hyprland.conf in ${dirname(paths.hyprlandLuaPath)}`,
  };
}
