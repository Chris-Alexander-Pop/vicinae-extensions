import { randomBytes } from "node:crypto";

export type Vec3 = [number, number, number];

export type DarkWindowShader = "invert" | "tint" | "chromakey";

/** A saved shade. `className` is the window class. Empty `title` matches every title of that class. */
export type DarkWindowConfig = {
  id: string;
  name: string;
  className: string;
  title: string;
  shader: DarkWindowShader;
  tintStrength: number;
  tintColor: Vec3;
  bkg: Vec3;
  similarity: number;
  amount: number;
  targetOpacity: number;
};

export type HyprWindow = {
  address: string;
  className: string;
  title: string;
  workspace: string;
};

const ID_RE = /^dw[a-f0-9]{12}$/;

export const DARK_WINDOW_DEFAULTS = {
  tintStrength: 0.1,
  tintColor: [1, 0, 0] as Vec3,
  bkg: [0, 0, 0] as Vec3,
  similarity: 0.1,
  amount: 1.4,
  targetOpacity: 0.83,
};

export function newDarkWindowId(): string {
  return `dw${randomBytes(6).toString("hex")}`;
}

export function shaderLabel(shader: DarkWindowShader): string {
  if (shader === "invert") return "Invert";
  if (shader === "tint") return "Tint";
  return "Chromakey";
}

export function blankShade(): DarkWindowConfig {
  return {
    id: newDarkWindowId(),
    name: "New shade",
    className: "",
    title: "",
    shader: "invert",
    ...DARK_WINDOW_DEFAULTS,
  };
}

/** New shade for one open window. `onlyTitle` keeps it off other windows of the same class. */
export function draftFromWindow(
  win: HyprWindow,
  base: DarkWindowConfig | undefined,
  onlyTitle: boolean,
): DarkWindowConfig {
  const fresh = base
    ? { ...base, id: newDarkWindowId() }
    : blankShade();
  const label = onlyTitle
    ? win.title || win.className || "Window"
    : win.className || win.title || "Window";
  return {
    ...fresh,
    name: clip(label, 80),
    className: win.className,
    title: onlyTitle ? win.title : "",
  };
}

/**
 * The shade Hyprland will use: rules are applied class-wide first, then by title,
 * and the last matching rule wins.
 */
export function shadeForWindow(
  configs: readonly DarkWindowConfig[],
  win: Pick<HyprWindow, "className" | "title">,
): DarkWindowConfig | undefined {
  let best: DarkWindowConfig | undefined;
  let titleMatch = false;
  for (const config of orderedShades(configs)) {
    if (config.className !== win.className) continue;
    if (config.title) {
      if (config.title !== win.title) continue;
      best = config;
      titleMatch = true;
      continue;
    }
    if (!titleMatch) best = config;
  }
  return best;
}

export function shadeSummary(config: DarkWindowConfig): string {
  const who = config.title
    ? `${config.className} / ${config.title}`
    : config.className || "No class";
  return `${who} · ${shaderLabel(config.shader)}`;
}

export function formatNum(n: number): string {
  const rounded = Math.round(n * 10000) / 10000;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

export function formatVec(rgb: Vec3): string {
  return rgb.map((n) => formatNum(n)).join(" ");
}

/** `#rrggbb` or three numbers from 0 to 1. */
export function parseColor(raw: string): Vec3 {
  const text = raw.trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(text)) {
    const hex = text.replace("#", "");
    return roundVec([
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ]);
  }
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 3) {
    throw new Error("Color needs #rrggbb or three numbers from 0 to 1");
  }
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) {
    throw new Error("Color channels must be from 0 to 1");
  }
  return roundVec([nums[0]!, nums[1]!, nums[2]!]);
}

export function normalizeDarkWindow(value: unknown): DarkWindowConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Shade is empty");
  }
  const row = value as Record<string, unknown>;
  const id = clean(row.id, 32);
  if (!ID_RE.test(id)) throw new Error("That shade id is not valid");
  const name = clean(row.name, 80);
  if (!name) throw new Error("Name this shade");
  const className = clean(row.className, 200);
  if (!className) throw new Error("Enter the window class this shade matches");
  const title = clean(row.title, 300);
  const shader = row.shader;
  if (shader !== "invert" && shader !== "tint" && shader !== "chromakey") {
    throw new Error("Shader must be invert, tint, or chromakey");
  }
  return {
    id,
    name,
    className,
    title,
    shader,
    tintStrength: parseUnit(row.tintStrength, "Tint strength", 0, 1),
    tintColor: vec3(row.tintColor, "Tint color"),
    bkg: vec3(row.bkg, "Background"),
    similarity: parseUnit(row.similarity, "Similarity", 0, 1),
    amount: parseUnit(row.amount, "Amount", 0, 5),
    targetOpacity: parseUnit(row.targetOpacity, "Target opacity", 0, 1),
  };
}

export function parseDarkWindowConfig(value: unknown): DarkWindowConfig | undefined {
  try {
    return normalizeDarkWindow(value);
  } catch {
    return undefined;
  }
}

/** True when `load_shaders` will have this built-in. Missing means the plugin default, which is all. */
export function shadeShaderLoaded(
  shader: DarkWindowShader,
  loadShaders: string | undefined,
): boolean {
  if (loadShaders === undefined) return true;
  const raw = loadShaders.trim();
  if (raw === "all") return true;
  const names = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return names.includes(shader);
}

export function shaderSpec(config: DarkWindowConfig): string {
  if (config.shader === "invert") return "invert";
  if (config.shader === "tint") {
    return `tint tintColor=[${formatVec(config.tintColor)}] tintStrength=${formatNum(config.tintStrength)}`;
  }
  return `chromakey bkg=[${formatVec(config.bkg)}] similarity=${formatNum(config.similarity)} amount=${formatNum(config.amount)} targetOpacity=${formatNum(config.targetOpacity)}`;
}

export function darkWindowRuleName(id: string): string {
  if (!ID_RE.test(id)) throw new Error("That shade id is not valid");
  return `vicinae-darkwindow-${id}`;
}

/** Class-wide rules first, so a title rule registered later wins on that window. */
export function orderedShades(
  configs: readonly DarkWindowConfig[],
): DarkWindowConfig[] {
  return [...configs].sort((a, b) => {
    const rank = (config: DarkWindowConfig) => (config.title ? 1 : 0);
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (a.className !== b.className) {
      return a.className < b.className ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function windowRuleLua(config: DarkWindowConfig): string {
  const match = [`class = ${luaString(exactRegex(config.className))}`];
  if (config.title) match.push(`title = ${luaString(exactRegex(config.title))}`);
  return `hl.window_rule({ name = ${luaString(darkWindowRuleName(config.id))}, match = { ${match.join(", ")} }, ["darkwindow:shade"] = ${luaString(shaderSpec(config))} })`;
}

export function darkWindowLuaChunk(
  configs: readonly DarkWindowConfig[],
): string | undefined {
  const usable = orderedShades(configs).filter((config) => config.className);
  if (usable.length === 0) return undefined;
  const lines = usable.map((config) => `  ${windowRuleLua(config)}`);
  return ["if hl.plugin.darkwindow then", ...lines, "end"].join("\n");
}

export function parseClients(stdout: string): HyprWindow[] {
  const trimmed = stdout.trim();
  if (!trimmed || trimmed === "no open windows") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`Could not parse clients: ${trimmed.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Could not parse clients");
  }
  const out: HyprWindow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const address = typeof row.address === "string" ? row.address.trim() : "";
    if (!address) continue;
    const className = typeof row.class === "string" ? row.class : "";
    const title = typeof row.title === "string" ? row.title : "";
    let workspace = "";
    if (row.workspace && typeof row.workspace === "object") {
      const name = (row.workspace as { name?: unknown }).name;
      if (typeof name === "string") workspace = name;
    }
    out.push({ address, className, title, workspace });
  }
  out.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.title.localeCompare(b.title) ||
      a.address.localeCompare(b.address),
  );
  return out;
}

export function exactRegex(value: string): string {
  return `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}

export function luaString(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}"`;
}

function clip(value: string, max: number): string {
  const text = value.replace(/[\r\n\0]/g, " ").trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return clip(value, max);
}

function parseUnit(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  if (value < min || value > max) {
    throw new Error(`${label} must be from ${min} to ${max}`);
  }
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vec3(value: unknown, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} needs three numbers from 0 to 1`);
  }
  const nums = value.map((item) => {
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1) {
      throw new Error(`${label} needs three numbers from 0 to 1`);
    }
    return item;
  });
  return roundVec([nums[0]!, nums[1]!, nums[2]!]);
}

function roundVec(rgb: Vec3): Vec3 {
  return [
    parseUnit(rgb[0], "Color", 0, 1),
    parseUnit(rgb[1], "Color", 0, 1),
    parseUnit(rgb[2], "Color", 0, 1),
  ];
}
