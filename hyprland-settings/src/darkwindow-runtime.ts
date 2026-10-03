import {
  darkWindowLuaChunk,
  normalizeDarkWindow,
  parseClients,
  shadeShaderLoaded,
  type DarkWindowConfig,
  type HyprWindow,
} from "./darkwindow";
import { evalLua, hyprctl, listPlugins, reloadConfig } from "./hyprctl";
import {
  detectEntrypoint,
  installPersistHook,
  readPersistState,
  writeDarkWindows,
  writeGeneratedConf,
  writeGeneratedLua,
} from "./persist";
import { hyprlangFromState, luaFromState } from "./settings";
import type { PersistState } from "./persist";

export type ShadeApply = "reloaded" | "live" | "stored";

function publish(state: PersistState): void {
  writeGeneratedLua(luaFromState(state));
  writeGeneratedConf(hyprlangFromState(state));
  installPersistHook();
}

function savedShades(): DarkWindowConfig[] {
  return Object.values(readPersistState().darkWindows);
}

export async function listWindows(): Promise<HyprWindow[]> {
  const { stdout, stderr } = await hyprctl(["-j", "clients"]);
  const out = `${stdout}\n${stderr}`;
  if (/unknown request|can't work with non-legacy|error:/i.test(out)) {
    throw new Error(`clients: ${out.trim() || "hyprctl failed"}`);
  }
  return parseClients(stdout);
}

export async function darkWindowLoaded(): Promise<boolean> {
  const loaded = await listPlugins();
  return loaded.some((plugin) => {
    const name = plugin.name.toLowerCase();
    return name === "hypr-darkwindow" || name === "darkwindow";
  });
}

/** Push saved shades into the running compositor. No-op when nothing is saved. */
export async function applyDarkWindowRules(): Promise<void> {
  const chunk = darkWindowLuaChunk(savedShades());
  if (!chunk) return;
  await evalLua(chunk);
}

async function applySavedShades(): Promise<ShadeApply> {
  if (!(await darkWindowLoaded())) return "stored";
  if (detectEntrypoint().kind === "lua") {
    await reloadConfig();
    return "reloaded";
  }
  await applyDarkWindowRules();
  return "live";
}

export async function saveDarkWindow(
  input: unknown,
): Promise<{ config: DarkWindowConfig; apply: ShadeApply }> {
  const config = normalizeDarkWindow(input);
  const state = readPersistState();
  const loadShaders = state.plugins["plugin:darkwindow:load_shaders"];
  if (
    loadShaders?.kind === "string" &&
    !shadeShaderLoaded(config.shader, loadShaders.value)
  ) {
    throw new Error(
      `Shaders to load is "${loadShaders.value || "empty"}", which does not include ${config.shader}`,
    );
  }
  const darkWindows = { ...state.darkWindows, [config.id]: config };
  publish(writeDarkWindows(darkWindows));
  const apply = await applySavedShades();
  return { config, apply };
}

export async function deleteDarkWindow(id: string): Promise<ShadeApply> {
  const state = readPersistState();
  if (!state.darkWindows[id]) throw new Error("That shade is not saved");
  const darkWindows = { ...state.darkWindows };
  delete darkWindows[id];
  publish(writeDarkWindows(darkWindows));
  return applySavedShades();
}
