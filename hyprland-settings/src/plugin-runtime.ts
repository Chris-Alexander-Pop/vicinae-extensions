import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evalLua,
  getOption,
  listInstances,
  listPlugins,
  loadPlugin,
  reloadConfig,
  unloadPlugin,
  type LoadedPlugin,
} from "./hyprctl";
import { applyDarkWindowRules } from "./darkwindow-runtime";
import {
  dropPluginValues,
  ensurePluginSwitchHook,
  installPersistHook,
  mergePluginValues,
  readPersistState,
  writeDisabledPlugins,
  writeGeneratedConf,
  writeGeneratedLua,
  type PersistState,
  type PluginPersistValue,
} from "./persist";
import {
  isSafePluginPath,
  matchPluginPaths,
  pidFromLock,
  soPathsFromMaps,
} from "./plugin-switch";
import {
  PLUGIN_CATALOG,
  formatPluginValue,
  groupLoaded,
  liveToPersist,
  pluginFieldLua,
  samePluginValue,
  type KnownLoaded,
  type PluginCatalog,
  type PluginField,
} from "./plugins";
import { hyprlangFromState, luaFromState } from "./settings";

export type PluginFieldRow = {
  field: PluginField;
  current: PluginPersistValue;
  saved: boolean;
};

export type PluginSwitch = {
  id: string;
  title: string;
  summary: string;
  name: string;
  path: string | null;
  enabled: boolean;
  description: string;
  author: string;
  version: string;
  catalogId: string | null;
};

export type KnownPluginPanel = KnownLoaded & {
  rows: PluginFieldRow[];
  unreadable: string[];
  pluginSwitch: PluginSwitch;
};

export type UnknownPluginRow = LoadedPlugin & {
  pluginSwitch: PluginSwitch;
};

export type PluginView = {
  known: KnownPluginPanel[];
  unknown: UnknownPluginRow[];
  disabled: PluginSwitch[];
  pathNote: string | null;
  error: string | null;
};

function emptyPluginView(error: string | null): PluginView {
  return { known: [], unknown: [], disabled: [], pathNote: null, error };
}

function publish(state: PersistState): void {
  writeGeneratedLua(luaFromState(state));
  writeGeneratedConf(hyprlangFromState(state));
  installPersistHook();
}

async function applyValue(
  field: PluginField,
  value: PluginPersistValue,
): Promise<void> {
  await evalLua(pluginFieldLua(field, value));
}

async function assertApplied(
  field: PluginField,
  value: PluginPersistValue,
): Promise<void> {
  const live = liveToPersist(field, await getOption(field.option));
  if (!samePluginValue(live, value)) {
    throw new Error(
      `${field.title} is still ${formatPluginValue(field, live)}`,
    );
  }
}

async function reloadIfNeeded(fields: PluginField[]): Promise<boolean> {
  if (!fields.some((field) => field.needsReload)) return false;
  await reloadConfig();
  return true;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        const item = items[index];
        if (item === undefined) return;
        out[index] = await fn(item);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

async function applySaved(known: KnownLoaded[]): Promise<void> {
  const state = readPersistState();
  const fields = known.flatMap((entry) =>
    entry.catalog.fields.filter((field) => {
      const saved = state.plugins[field.option];
      return saved !== undefined && saved.kind === field.kind;
    }),
  );
  const stale: PluginField[] = [];
  await mapPool(fields, 4, async (field) => {
    const saved = state.plugins[field.option];
    if (!saved) return;
    try {
      if (field.hypr3d) {
        await applyValue(field, saved);
        return;
      }
      const live = liveToPersist(field, await getOption(field.option));
      if (!samePluginValue(live, saved)) {
        await applyValue(field, saved);
        if (field.needsReload) stale.push(field);
      }
    } catch {
      // The row still shows whatever getoption returns next.
    }
  });
  if (stale.length > 0) await reloadConfig();
  try {
    await applyDarkWindowRules();
  } catch {
    // The saved shade is still in the persist file.
  }
}

async function readPanel(
  entry: KnownLoaded,
): Promise<Omit<KnownPluginPanel, "pluginSwitch">> {
  const state = readPersistState();
  const read = await mapPool(entry.catalog.fields, 4, async (field) => {
    if (field.hypr3d) {
      const savedValue = state.plugins[field.option];
      const saved = savedValue !== undefined && savedValue.kind === field.kind;
      const row: PluginFieldRow = {
        field,
        current: saved && savedValue ? savedValue : field.fallback,
        saved,
      };
      return { row, missing: null as string | null };
    }
    try {
      const current = liveToPersist(field, await getOption(field.option));
      const savedValue = state.plugins[field.option];
      const row: PluginFieldRow = {
        field,
        current,
        saved: savedValue !== undefined && savedValue.kind === field.kind,
      };
      return { row, missing: null as string | null };
    } catch {
      return { row: null, missing: field.title };
    }
  });
  return {
    ...entry,
    rows: read.flatMap((item) => (item.row ? [item.row] : [])),
    unreadable: read.flatMap((item) => (item.missing ? [item.missing] : [])),
  };
}

function catalogForName(name: string): PluginCatalog | undefined {
  const lower = name.toLowerCase();
  return PLUGIN_CATALOG.find((catalog) =>
    catalog.names.some((item) => item.toLowerCase() === lower),
  );
}

function switchFromLoaded(
  plugin: LoadedPlugin,
  path: string | null,
  catalog: PluginCatalog | undefined,
): PluginSwitch {
  return {
    id: catalog ? `on:${catalog.id}` : `on:${plugin.name}`,
    title: catalog?.title ?? plugin.name,
    summary:
      catalog?.summary ?? (plugin.description || plugin.author || "Loaded"),
    name: plugin.name,
    path,
    enabled: true,
    description: plugin.description,
    author: plugin.author,
    version: plugin.version,
    catalogId: catalog?.id ?? null,
  };
}

function runtimeHyprDir(): string | null {
  const runtime = process.env.XDG_RUNTIME_DIR?.trim();
  if (!runtime || !runtime.startsWith("/") || runtime.includes("\0")) {
    return null;
  }
  return join(runtime, "hypr");
}

function isHyprlandPid(pid: number): boolean {
  try {
    return readFileSync(`/proc/${pid}/comm`, "utf8").trim() === "Hyprland";
  } catch {
    return false;
  }
}

function pidFromLockFile(path: string): number | null {
  try {
    const pid = pidFromLock(readFileSync(path, "utf8"));
    if (!pid || !isHyprlandPid(pid)) return null;
    return pid;
  } catch {
    return null;
  }
}

async function resolveHyprlandPid(): Promise<number | null> {
  const root = runtimeHyprDir();
  const signature = process.env.HYPRLAND_INSTANCE_SIGNATURE?.trim();
  if (
    root &&
    signature &&
    !signature.includes("/") &&
    !signature.includes("..")
  ) {
    const fromSignature = pidFromLockFile(
      join(root, signature, "hyprland.lock"),
    );
    if (fromSignature) return fromSignature;
  }

  if (root) {
    try {
      const pids = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          pidFromLockFile(join(root, entry.name, "hyprland.lock")),
        )
        .filter((pid): pid is number => pid !== null);
      const unique = [...new Set(pids)];
      if (unique.length === 1 && unique[0]) return unique[0];
    } catch {
      // hyprctl instances is the fallback.
    }
  }

  try {
    const alive = (await listInstances()).filter((row) =>
      isHyprlandPid(row.pid),
    );
    const tagged = signature
      ? alive.filter((row) => row.instance === signature)
      : [];
    return tagged[0]?.pid ?? (alive.length === 1 ? alive[0]?.pid : null) ?? null;
  } catch {
    return null;
  }
}

async function discoverSoPaths(): Promise<{
  paths: string[];
  note: string | null;
}> {
  try {
    const pid = await resolveHyprlandPid();
    if (!pid) {
      return { paths: [], note: "Couldn't find the Hyprland process" };
    }
    return { paths: soPathsFromMaps(readFileSync(`/proc/${pid}/maps`, "utf8")), note: null };
  } catch (err) {
    return {
      paths: [],
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

function disabledSwitches(loaded: LoadedPlugin[]): PluginSwitch[] {
  const loadedNames = new Set(loaded.map((plugin) => plugin.name.toLowerCase()));
  const saved = readPersistState().disabledPlugins ?? {};
  return Object.values(saved)
    .filter((row) => !loadedNames.has(row.name.toLowerCase()))
    .map((row) => {
      const catalog = catalogForName(row.name);
      const sw: PluginSwitch = {
        id: `off:${row.path}`,
        title: catalog?.title ?? row.name,
        summary: catalog?.summary ?? (row.description || "Turned off"),
        name: row.name,
        path: row.path,
        enabled: false,
        description: row.description,
        author: row.author,
        version: row.version,
        catalogId: catalog?.id ?? null,
      };
      return sw;
    })
    .sort((a, b) => a.title.localeCompare(b.title) || a.name.localeCompare(b.name));
}

export async function readPluginView(): Promise<PluginView> {
  let loaded: LoadedPlugin[];
  try {
    loaded = await listPlugins();
  } catch (err) {
    return emptyPluginView(err instanceof Error ? err.message : String(err));
  }

  const grouped = groupLoaded(loaded);
  const discoveredPromise = discoverSoPaths();
  try {
    await applySaved(grouped.known);
  } catch {
    // Listing still works if a saved override cannot be applied.
  }

  const [panels, discovered] = await Promise.all([
    Promise.all(grouped.known.map((entry) => readPanel(entry))),
    discoveredPromise,
  ]);
  const paths = matchPluginPaths(
    loaded.map((plugin) => plugin.name),
    discovered.paths,
  );
  const known = panels.map((panel) => ({
    ...panel,
    pluginSwitch: switchFromLoaded(
      panel.loaded,
      paths[panel.loaded.name] ?? null,
      panel.catalog,
    ),
  }));
  const unknown = grouped.unknown.map((plugin) => ({
    ...plugin,
    pluginSwitch: switchFromLoaded(
      plugin,
      paths[plugin.name] ?? null,
      undefined,
    ),
  }));
  return {
    known,
    unknown,
    disabled: disabledSwitches(loaded),
    pathNote: discovered.note,
    error: null,
  };
}

async function pluginIsLoaded(name: string): Promise<boolean> {
  const loaded = await listPlugins();
  return loaded.some((plugin) => plugin.name === name);
}

async function waitForPlugin(name: string, enabled: boolean): Promise<void> {
  let hits = 0;
  for (let i = 0; i < 4; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const has = await pluginIsLoaded(name);
    if (has === enabled) {
      hits += 1;
      if (hits >= 2) return;
    } else {
      hits = 0;
    }
  }
  throw new Error(
    enabled ? `${name} did not stay loaded` : `${name} is still loaded`,
  );
}

export async function setPluginEnabled(input: {
  name: string;
  path: string;
  enabled: boolean;
  description: string;
  author: string;
  version: string;
}): Promise<void> {
  if (!isSafePluginPath(input.path)) {
    throw new Error("That plugin path can't be passed to hyprctl");
  }

  const before = { ...(readPersistState().disabledPlugins ?? {}) };
  const disabled = { ...before };
  if (input.enabled) {
    delete disabled[input.path];
  } else {
    disabled[input.path] = {
      name: input.name,
      path: input.path,
      description: input.description,
      author: input.author,
      version: input.version,
    };
  }

  const revert = () => {
    writeDisabledPlugins(before);
  };

  try {
    writeDisabledPlugins(disabled);
    ensurePluginSwitchHook();
    if (input.enabled) {
      // Reload first so a config hl.plugin.load runs with the skip removed.
      await reloadConfig();
      if (!(await pluginIsLoaded(input.name))) {
        await loadPlugin(input.path);
        await reloadConfig();
      }
    } else {
      // A config hl.plugin.load is skipped, and reload drops that plugin.
      // Unload covers one that was loaded by path and is not in the config.
      await reloadConfig();
      if (await pluginIsLoaded(input.name)) {
        await unloadPlugin(input.path);
        await reloadConfig();
      }
    }
    await waitForPlugin(input.name, input.enabled);
  } catch (err) {
    try {
      revert();
    } catch {
      // Keep the original failure.
    }
    throw err;
  }
}

export async function setPluginField(
  field: PluginField,
  value: PluginPersistValue,
): Promise<void> {
  await applyValue(field, value);
  if (!field.hypr3d) await assertApplied(field, value);
  publish(mergePluginValues({ [field.option]: value }));
  if (await reloadIfNeeded([field])) {
    // Reload re-reads vicinae-settings.lua, including a clientside shape rule.
    await assertApplied(field, value);
  }
}

export async function rememberPlugin(catalog: PluginCatalog): Promise<string[]> {
  const readable = catalog.fields.filter((field) => !field.hypr3d);
  if (readable.length === 0) {
    throw new Error(
      `${catalog.title} has no hyprctl options. Each change is saved as you set it`,
    );
  }
  const patch: Record<string, PluginPersistValue> = {};
  const read = await mapPool(readable, 4, async (field) => {
    try {
      return {
        option: field.option,
        value: liveToPersist(field, await getOption(field.option)),
      };
    } catch {
      return null;
    }
  });
  for (const row of read) {
    if (row) patch[row.option] = row.value;
  }
  const saved = Object.keys(patch);
  if (saved.length === 0) {
    throw new Error(`No readable options for ${catalog.title}`);
  }
  const state = mergePluginValues(patch);
  publish(state);
  const applied = catalog.fields.filter((field) => saved.includes(field.option));
  await reloadIfNeeded(applied);
  return saved;
}

export async function forgetPlugin(catalog: PluginCatalog): Promise<void> {
  publish(dropPluginValues(catalog.fields.map((field) => field.option)));
  await reloadIfNeeded(catalog.fields);
}
