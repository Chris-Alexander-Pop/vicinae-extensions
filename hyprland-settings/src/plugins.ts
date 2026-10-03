import type { HyprOptionValue } from "./hyprctl";
import { hyprlangConfigAssignment, luaConfigAssignment } from "./hyprctl";
import type { PluginPersistValue } from "./persist";
import type { LoadedPlugin } from "./hyprctl";

export type Choice = {
  value: string;
  label: string;
};

export type PluginField = {
  title: string;
  description: string;
  /** Dotted hypr option, e.g. plugin:dynamic_cursors:mode */
  option: string;
  kind: PluginPersistValue["kind"];
  fallback: PluginPersistValue;
  choices?: Choice[];
  /** When set, a typed value may differ from `choices`. */
  allowCustom?: boolean;
  min?: number;
  max?: number;
  step?: number;
  keywords?: string[];
  /** Typed strings longer than 120 characters. Paths use this. */
  maxLength?: number;
  /**
   * The running plugin only reads this on a Hyprland config reload.
   * Setting it reloads the compositor after the value is saved.
   */
  needsReload?: boolean;
  /**
   * Hypr3D keeps settings inside the plugin and applies them with
   * `hl.plugin.hypr3d.config`. There is no `hyprctl getoption` for these.
   */
  hypr3d?: { section: "world" | "windows" | "player" | "map"; key: string };
};

export type PluginCatalog = {
  id: string;
  /** `hyprctl plugin list` name, compared case-insensitively. */
  names: string[];
  title: string;
  summary: string;
  /** `hl.plugin.<luaName>` guard in the generated snippet. */
  luaName: string;
  keywords: string[];
  fields: PluginField[];
};

const ACTIVATION: Choice[] = [
  { value: "linear", label: "Linear" },
  { value: "quadratic", label: "Quadratic" },
  { value: "negative_quadratic", label: "Negative quadratic" },
];

const CURSOR_MODES: Choice[] = [
  { value: "tilt", label: "Tilt" },
  { value: "rotate", label: "Rotate" },
  { value: "stretch", label: "Stretch" },
  { value: "none", label: "None" },
];

const NEAREST: Choice[] = [
  { value: "0", label: "Never pixelated" },
  { value: "1", label: "Pixelated if no high-res" },
  { value: "2", label: "Always pixelated" },
];

function boolOpt(
  option: string,
  title: string,
  description: string,
  fallback: boolean,
  keywords?: string[],
  needsReload?: boolean,
): PluginField {
  return {
    option,
    title,
    description,
    kind: "bool",
    fallback: { kind: "bool", value: fallback },
    keywords,
    needsReload,
  };
}

function intOpt(
  option: string,
  title: string,
  description: string,
  fallback: number,
  range: {
    min?: number;
    max?: number;
    step?: number;
    choices?: Choice[];
    needsReload?: boolean;
  },
  keywords?: string[],
): PluginField {
  return {
    option,
    title,
    description,
    kind: "int",
    fallback: { kind: "int", value: fallback },
    min: range.min,
    max: range.max,
    step: range.step,
    choices: range.choices,
    keywords,
    needsReload: range.needsReload,
  };
}

function floatOpt(
  option: string,
  title: string,
  description: string,
  fallback: number,
  range: { min?: number; max?: number; step?: number; needsReload?: boolean },
  keywords?: string[],
): PluginField {
  return {
    option,
    title,
    description,
    kind: "float",
    fallback: { kind: "float", value: fallback },
    min: range.min,
    max: range.max,
    step: range.step,
    keywords,
    needsReload: range.needsReload,
  };
}

function stringOpt(
  option: string,
  title: string,
  description: string,
  fallback: string,
  extra?: {
    choices?: Choice[];
    allowCustom?: boolean;
    keywords?: string[];
    needsReload?: boolean;
    maxLength?: number;
  },
): PluginField {
  return {
    option,
    title,
    description,
    kind: "string",
    fallback: { kind: "string", value: fallback },
    choices: extra?.choices,
    allowCustom: extra?.allowCustom,
    keywords: extra?.keywords,
    needsReload: extra?.needsReload,
    maxLength: extra?.maxLength,
  };
}

function colorOpt(
  option: string,
  title: string,
  description: string,
  fallback: string,
): PluginField {
  return {
    option,
    title,
    description,
    kind: "color",
    fallback: { kind: "color", value: fallback },
    keywords: ["color", "tint", "hex"],
  };
}

export const PLUGIN_CATALOG: PluginCatalog[] = [
  {
    id: "dynamic-cursors",
    names: ["dynamic-cursors", "hypr-dynamic-cursors"],
    title: "Dynamic cursors",
    summary: "Cursor stretch, tilt, and shake-to-find",
    luaName: "dynamic_cursors",
    keywords: ["hypr-dynamic-cursors.so", "cursor", "shake", "tilt", "stretch"],
    fields: [
      boolOpt(
        "plugin:dynamic_cursors:enabled",
        "Enabled",
        "Master switch for cursor simulation and shake",
        true,
      ),
      stringOpt(
        "plugin:dynamic_cursors:mode",
        "Mode",
        "Tilt, rotate, stretch, or none. Also applied to clientside cursors",
        "tilt",
        {
          choices: CURSOR_MODES,
          keywords: ["tilt", "rotate", "stretch"],
          needsReload: true,
        },
      ),
      intOpt(
        "plugin:dynamic_cursors:threshold",
        "Angle threshold",
        "Minimum angle change in degrees before the shape updates",
        2,
        { min: 0, max: 90, step: 1 },
      ),
      boolOpt(
        "plugin:dynamic_cursors:shake:enabled",
        "Shake to find",
        "Magnify the cursor while it is shaken",
        true,
        ["shake", "magnify"],
      ),
      floatOpt(
        "plugin:dynamic_cursors:shake:threshold",
        "Shake threshold",
        "How soon a shake counts. Lower starts sooner",
        6,
        { min: 0.5, max: 30, step: 0.5 },
        ["shake"],
      ),
      floatOpt(
        "plugin:dynamic_cursors:shake:base",
        "Shake size",
        "Magnification right after a shake starts",
        4,
        { min: 1, max: 20, step: 0.5 },
        ["shake", "zoom"],
      ),
      floatOpt(
        "plugin:dynamic_cursors:shake:speed",
        "Shake growth",
        "Extra magnification per second while the shake continues",
        4,
        { min: 0, max: 20, step: 0.5 },
        ["shake"],
      ),
      floatOpt(
        "plugin:dynamic_cursors:shake:limit",
        "Shake limit",
        "Maximum magnification. 0 means no cap",
        0,
        { min: 0, max: 20, step: 0.5 },
        ["shake"],
      ),
      intOpt(
        "plugin:dynamic_cursors:shake:timeout",
        "Shake timeout",
        "Milliseconds the cursor stays large after the shake ends",
        2000,
        { min: 0, max: 10000, step: 100 },
        ["shake"],
      ),
      boolOpt(
        "plugin:dynamic_cursors:shake:effects",
        "Effects while shaking",
        "Keep tilt, rotate, or stretch during a shake",
        false,
        ["shake"],
      ),
      boolOpt(
        "plugin:dynamic_cursors:shake:ipc",
        "Shake IPC",
        "Emit shake events on the Hyprland socket",
        false,
        ["shake", "ipc"],
      ),
      intOpt(
        "plugin:dynamic_cursors:tilt:limit",
        "Tilt speed",
        "Speed in px/s where the cursor reaches full tilt. Lower tilts harder",
        5000,
        { min: 100, max: 20000, step: 100, needsReload: true },
        ["tilt"],
      ),
      stringOpt(
        "plugin:dynamic_cursors:tilt:activation",
        "Tilt curve",
        "How speed maps to tilt",
        "negative_quadratic",
        { choices: ACTIVATION, keywords: ["tilt"], needsReload: true },
      ),
      intOpt(
        "plugin:dynamic_cursors:tilt:window",
        "Tilt window",
        "Milliseconds of motion used to measure tilt speed",
        100,
        { min: 1, max: 1000, step: 10, needsReload: true },
        ["tilt"],
      ),
      intOpt(
        "plugin:dynamic_cursors:tilt:full",
        "Tilt angle",
        "Full tilt to each side, in degrees",
        60,
        { min: 0, max: 180, step: 1, needsReload: true },
        ["tilt"],
      ),
      intOpt(
        "plugin:dynamic_cursors:stretch:limit",
        "Stretch speed",
        "Speed in px/s where the cursor is fully stretched",
        3000,
        { min: 100, max: 20000, step: 100, needsReload: true },
        ["stretch"],
      ),
      stringOpt(
        "plugin:dynamic_cursors:stretch:activation",
        "Stretch curve",
        "How speed maps to stretch",
        "negative_quadratic",
        { choices: ACTIVATION, keywords: ["stretch"], needsReload: true },
      ),
      intOpt(
        "plugin:dynamic_cursors:stretch:window",
        "Stretch window",
        "Milliseconds of motion used to measure stretch speed",
        100,
        { min: 1, max: 1000, step: 10, needsReload: true },
        ["stretch"],
      ),
      intOpt(
        "plugin:dynamic_cursors:rotate:length",
        "Rotate length",
        "Length in px of the stick used to rotate the cursor",
        20,
        { min: 1, max: 256, step: 1, needsReload: true },
        ["rotate"],
      ),
      floatOpt(
        "plugin:dynamic_cursors:rotate:offset",
        "Rotate offset",
        "Clockwise angle offset in degrees, applied to every shape",
        0,
        { min: -180, max: 180, step: 5, needsReload: true },
        ["rotate"],
      ),
      boolOpt(
        "plugin:dynamic_cursors:hyprcursor:enabled",
        "Hyprcursor",
        "Load a higher-resolution shape while the cursor is magnified",
        true,
        ["hyprcursor"],
      ),
      intOpt(
        "plugin:dynamic_cursors:hyprcursor:nearest",
        "Pixelated scaling",
        "When to use nearest-neighbour scaling past the texture size",
        1,
        { min: 0, max: 2, step: 1, choices: NEAREST },
        ["hyprcursor", "pixel"],
      ),
      stringOpt(
        "plugin:dynamic_cursors:hyprcursor:fallback",
        "Clientside fallback",
        "Shape used when a clientside cursor is magnified",
        "clientside",
        { allowCustom: true, keywords: ["hyprcursor", "fallback"] },
      ),
      intOpt(
        "plugin:dynamic_cursors:hyprcursor:resolution",
        "Hyprcursor resolution",
        "Pixels to preload magnified shapes at. -1 follows shake size",
        -1,
        { min: -1, max: 512, step: 16 },
        ["hyprcursor"],
      ),
      boolOpt(
        "plugin:dynamic_cursors:ignore_warps",
        "Ignore warps",
        "Skip cursor jumps. Turn off inside a nested compositor",
        true,
        ["warp"],
      ),
    ],
  },
  {
    id: "hyprgrass",
    names: ["hyprgrass"],
    title: "Hyprgrass",
    summary: "Touchscreen gestures",
    luaName: "hyprgrass",
    keywords: ["hyprgrass.so", "touch", "gesture", "swipe"],
    fields: [
      floatOpt(
        "plugin:hyprgrass:sensitivity",
        "Sensitivity",
        "Higher makes swipes and taps trigger sooner. Tablets often want 4",
        1,
        { min: 0.1, max: 20, step: 0.5 },
        ["sensitivity", "touch"],
      ),
      intOpt(
        "plugin:hyprgrass:long_press_delay",
        "Long-press delay",
        "Milliseconds before a long-press counts",
        400,
        { min: 50, max: 2000, step: 50 },
        ["longpress", "delay"],
      ),
      intOpt(
        "plugin:hyprgrass:edge_margin",
        "Edge margin",
        "Pixels from the screen edge that count as an edge swipe",
        10,
        { min: 0, max: 200, step: 1 },
        ["edge"],
      ),
      boolOpt(
        "plugin:hyprgrass:resize_on_border_long_press",
        "Resize on border",
        "Long-press a window border or gap to resize it",
        true,
        ["resize", "border"],
      ),
    ],
  },
  {
    id: "darkwindow",
    names: ["Hypr-DarkWindow", "darkwindow"],
    title: "Dark Window",
    summary: "Per-window color shaders",
    luaName: "darkwindow",
    keywords: ["Hypr-DarkWindow.so", "shader", "invert", "tint"],
    fields: [
      stringOpt(
        "plugin:darkwindow:load_shaders",
        "Shaders to load",
        "Built-ins to register. Empty loads none. All covers invert, tint, and chromakey",
        "all",
        {
          allowCustom: true,
          choices: [
            { value: "all", label: "All built-ins" },
            { value: "invert", label: "Invert" },
            { value: "tint", label: "Tint" },
            { value: "chromakey", label: "Chromakey" },
            { value: "invert,tint", label: "Invert and tint" },
            { value: "", label: "None" },
          ],
          keywords: ["shader", "invert", "chromakey"],
          needsReload: true,
        },
      ),
    ],
  },
  {
    id: "hyprglass",
    names: ["hyprglass"],
    title: "Hyprglass",
    summary: "Liquid-glass window effect",
    luaName: "hyprglass",
    keywords: ["hyprglass.so", "glass", "blur", "refraction"],
    fields: [
      boolOpt(
        "plugin:hyprglass:enabled",
        "Enabled",
        "Master switch. Per-window tags can still override it",
        true,
      ),
      stringOpt(
        "plugin:hyprglass:default_theme",
        "Theme",
        "Dark or light glass",
        "dark",
        {
          choices: [
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ],
        },
      ),
      stringOpt(
        "plugin:hyprglass:default_preset",
        "Preset",
        "Built-in look. Custom preset names from your config work too",
        "default",
        {
          allowCustom: true,
          choices: [
            { value: "default", label: "Default" },
            { value: "clear", label: "Clear" },
            { value: "subtle", label: "Subtle" },
            { value: "glass", label: "Glass" },
            { value: "high_contrast", label: "High contrast" },
            { value: "pomme", label: "Pomme" },
          ],
          keywords: ["preset", "theme"],
        },
      ),
      boolOpt(
        "plugin:hyprglass:manage_window_blur",
        "Replace window blur",
        "Mark glassed windows noblur so Hyprland blur does not hide the effect",
        true,
        ["blur"],
      ),
      boolOpt(
        "plugin:hyprglass:skip_opaque_windows",
        "Skip opaque windows",
        "Do not glass a window that sits under an opaque one",
        true,
      ),
      boolOpt(
        "plugin:hyprglass:blur_fold",
        "Fold blur passes",
        "Fewer blur passes with the same look",
        true,
        ["blur"],
      ),
      floatOpt(
        "plugin:hyprglass:blur_strength",
        "Blur strength",
        "Blur radius scale. The shader multiplies this by 12px",
        2,
        { min: 0, max: 8, step: 0.1 },
        ["blur"],
      ),
      intOpt(
        "plugin:hyprglass:blur_iterations",
        "Blur passes",
        "Gaussian passes, from 1 to 5",
        3,
        { min: 1, max: 5, step: 1 },
        ["blur"],
      ),
      floatOpt(
        "plugin:hyprglass:refraction_strength",
        "Refraction",
        "How hard edges bend the background",
        0.6,
        { min: 0, max: 1, step: 0.05 },
      ),
      floatOpt(
        "plugin:hyprglass:refraction_flow",
        "Refraction flow",
        "0 pulls toward the center, 1 runs along the edges",
        0,
        { min: 0, max: 1, step: 0.05 },
      ),
      floatOpt(
        "plugin:hyprglass:refraction_spread",
        "Refraction spread",
        "1 covers the window, 0 stays on the rim",
        1,
        { min: 0, max: 1, step: 0.05 },
      ),
      floatOpt(
        "plugin:hyprglass:chromatic_aberration",
        "Chromatic aberration",
        "Color fringing at the edges",
        0.5,
        { min: 0, max: 1, step: 0.05 },
      ),
      floatOpt(
        "plugin:hyprglass:fresnel_strength",
        "Fresnel",
        "Edge glow strength",
        0.6,
        { min: 0, max: 1, step: 0.05 },
      ),
      floatOpt(
        "plugin:hyprglass:specular_strength",
        "Specular",
        "Highlight brightness",
        0.8,
        { min: 0, max: 1, step: 0.05 },
      ),
      floatOpt(
        "plugin:hyprglass:glass_opacity",
        "Opacity",
        "Overall glass opacity",
        1,
        { min: 0, max: 1, step: 0.05 },
      ),
      floatOpt(
        "plugin:hyprglass:edge_thickness",
        "Edge thickness",
        "Bezel width as a fraction of the shorter side",
        0.06,
        { min: 0, max: 0.15, step: 0.01 },
      ),
      colorOpt(
        "plugin:hyprglass:tint_color",
        "Tint",
        "RRGGBBAA. Alpha is how strong the tint is",
        "0x8899aa22",
      ),
      floatOpt(
        "plugin:hyprglass:lens_distortion",
        "Lens distortion",
        "Center dome magnification",
        0.5,
        { min: 0, max: 1, step: 0.05 },
      ),
      floatOpt(
        "plugin:hyprglass:self_sample",
        "Self sample",
        "Mix the window's own pixels into its glass. Windows only",
        0,
        { min: 0, max: 1, step: 0.05 },
      ),
      boolOpt(
        "plugin:hyprglass:layers:enabled",
        "Glass on layers",
        "Also glass layer surfaces such as bars. Off until you turn it on",
        false,
        ["layers", "waybar"],
      ),
    ],
  },
  {
    id: "hyprwinwrap",
    names: ["hyprwinwrap"],
    title: "Hyprwinwrap",
    summary: "Use a window as the wallpaper",
    luaName: "hyprwinwrap",
    keywords: ["wallpaper", "background", "kitty"],
    fields: [
      stringOpt(
        "plugin:hyprwinwrap:class",
        "Window class",
        "Class of the window drawn as the background",
        "kitty-bg",
        { allowCustom: true, keywords: ["class"] },
      ),
      stringOpt(
        "plugin:hyprwinwrap:title",
        "Window title",
        "Title match. Empty matches on class only",
        "",
        { allowCustom: true, keywords: ["title"] },
      ),
      stringOpt(
        "plugin:hyprwinwrap:size_x",
        "Width",
        "Background width as a percentage, from 1 to 100",
        "100",
        { allowCustom: true },
      ),
      stringOpt(
        "plugin:hyprwinwrap:size_y",
        "Height",
        "Background height as a percentage, from 1 to 100",
        "100",
        { allowCustom: true },
      ),
      stringOpt(
        "plugin:hyprwinwrap:pos_x",
        "Horizontal offset",
        "Offset from the left as a percentage, from 0 to 100",
        "0",
        { allowCustom: true },
      ),
      stringOpt(
        "plugin:hyprwinwrap:pos_y",
        "Vertical offset",
        "Offset from the top as a percentage, from 0 to 100",
        "0",
        { allowCustom: true },
      ),
    ],
  },
  {
    id: "virtual-desktops",
    names: ["virtual-desktops"],
    title: "Virtual desktops",
    summary: "Desktop-style workspaces",
    luaName: "virtual_desktops",
    keywords: ["vdesk", "workspace", "monitor"],
    fields: [
      stringOpt(
        "plugin:virtual_desktops:names",
        "Names",
        "Map a desktop id to a name. unset leaves the default",
        "unset",
        { allowCustom: true, keywords: ["name"] },
      ),
      boolOpt(
        "plugin:virtual_desktops:cycleworkspaces",
        "Cycle desktops",
        "Cycle between virtual desktops instead of stopping at the end",
        true,
        ["cycle"],
      ),
      boolOpt(
        "plugin:virtual_desktops:cycle_populated_only",
        "Skip empty desktops",
        "Cycle commands skip desktops with no windows",
        false,
        ["cycle", "empty"],
      ),
      stringOpt(
        "plugin:virtual_desktops:rememberlayout",
        "Remember layout",
        "Match a saved layout by monitor count, by monitor names, or not at all",
        "size",
        {
          choices: [
            { value: "size", label: "By monitor count" },
            { value: "monitors", label: "By monitor names" },
            { value: "none", label: "Don't remember" },
          ],
          keywords: ["layout", "monitor"],
        },
      ),
      boolOpt(
        "plugin:virtual_desktops:notifyinit",
        "Startup notification",
        "Show a notification when the plugin starts",
        true,
      ),
      stringOpt(
        "plugin:virtual_desktops:monitor_order",
        "Monitor order",
        "Comma-separated monitor names. unset leaves Hyprland's order",
        "unset",
        { allowCustom: true, keywords: ["monitor"] },
      ),
    ],
  },
  {
    id: "hyprcapture",
    names: ["HyprCapture", "hyprcapture"],
    title: "HyprCapture",
    summary: "Screenshots and screen recording",
    luaName: "hyprcapture",
    keywords: ["screenshot", "record", "capture"],
    fields: [
      stringOpt(
        "plugin:hyprcapture:default_mode",
        "Default mode",
        "What a normal capture starts in",
        "region",
        {
          allowCustom: true,
          choices: [
            { value: "region", label: "Region" },
            { value: "window", label: "Window" },
            { value: "fullscreen", label: "Fullscreen" },
          ],
        },
      ),
      stringOpt(
        "plugin:hyprcapture:fullscreen_scope",
        "Fullscreen scope",
        "Which monitors a fullscreen capture includes",
        "all",
        {
          choices: [
            { value: "all", label: "All monitors" },
            { value: "focus", label: "Focused" },
            { value: "fix", label: "Fixed" },
          ],
        },
      ),
      boolOpt(
        "plugin:hyprcapture:save",
        "Save to disk",
        "Write captures to the save directory",
        true,
      ),
      boolOpt(
        "plugin:hyprcapture:clipboard",
        "Clipboard",
        "Also copy captures to the clipboard",
        true,
      ),
      boolOpt(
        "plugin:hyprcapture:include_cursor",
        "Include cursor",
        "Draw the cursor into the capture",
        false,
      ),
      boolOpt(
        "plugin:hyprcapture:screenshot_notification",
        "Screenshot notification",
        "Notify after a successful screenshot",
        true,
      ),
      boolOpt(
        "plugin:hyprcapture:fusion_mode",
        "Fusion mode",
        "Region and window selection in one overlay",
        false,
      ),
      boolOpt(
        "plugin:hyprcapture:confirm_before_capture",
        "Confirm before capture",
        "Ask for a confirmation after the target is selected",
        false,
      ),
      stringOpt(
        "plugin:hyprcapture:save_dir",
        "Screenshot folder",
        "Directory for saved screenshots",
        "$XDG_PICTURES_DIR/Screenshots",
        { allowCustom: true, maxLength: 240, keywords: ["path", "directory"] },
      ),
      stringOpt(
        "plugin:hyprcapture:filename_template",
        "Screenshot name",
        "strftime template for screenshot files",
        "Screenshot-%Y-%m-%d-%H%M%S.png",
        { allowCustom: true, maxLength: 180 },
      ),
      intOpt(
        "plugin:hyprcapture:record_fps",
        "Recording FPS",
        "Frames per second for a recording",
        30,
        { min: 1, max: 240, step: 1 },
        ["record", "video"],
      ),
      stringOpt(
        "plugin:hyprcapture:record_audio",
        "Recording audio",
        "What a recording hears",
        "off",
        {
          choices: [
            { value: "off", label: "Off" },
            { value: "system", label: "System" },
            { value: "microphone", label: "Microphone" },
            { value: "mix", label: "System and microphone" },
          ],
          keywords: ["record", "audio"],
        },
      ),
      stringOpt(
        "plugin:hyprcapture:record_format",
        "Recording format",
        "Container for a normal recording",
        "mp4",
        {
          allowCustom: true,
          choices: [
            { value: "mp4", label: "MP4" },
            { value: "webm", label: "WebM" },
            { value: "mkv", label: "MKV" },
          ],
        },
      ),
      intOpt(
        "plugin:hyprcapture:record_countdown_seconds",
        "Countdown",
        "Seconds to wait before a recording starts. 0 starts immediately",
        0,
        { min: 0, max: 30, step: 1 },
        ["record"],
      ),
    ],
  },
  {
    id: "hyprexpo",
    names: ["hyprexpo"],
    title: "Hyprexpo",
    summary: "Workspace overview grid",
    luaName: "hyprexpo",
    keywords: ["expo", "overview", "workspace"],
    fields: [
      intOpt(
        "plugin:hyprexpo:columns",
        "Columns",
        "Grid columns",
        3,
        { min: 1, max: 7, step: 1 },
      ),
      intOpt(
        "plugin:hyprexpo:rows",
        "Rows",
        "Fixed rows. 0 follows the column count",
        0,
        { min: 0, max: 7, step: 1 },
      ),
      intOpt(
        "plugin:hyprexpo:gaps_in",
        "Inner gaps",
        "Pixels between tiles",
        5,
        { min: 0, max: 200, step: 1 },
      ),
      intOpt(
        "plugin:hyprexpo:gaps_out",
        "Outer gaps",
        "Pixels around the grid",
        0,
        { min: 0, max: 400, step: 1 },
      ),
      colorOpt(
        "plugin:hyprexpo:bg_col",
        "Background",
        "Color behind the tiles",
        "0xff111111",
      ),
      stringOpt(
        "plugin:hyprexpo:workspace_method",
        "Workspace method",
        "Where the grid starts. Example: center current, or DP-1 first 1",
        "center current",
        { allowCustom: true, keywords: ["monitor", "workspace"] },
      ),
      stringOpt(
        "plugin:hyprexpo:overview_mode",
        "Overview mode",
        "auto uses scrolling overview when the layout is scrolling",
        "auto",
        {
          choices: [
            { value: "auto", label: "Auto" },
            { value: "grid", label: "Grid" },
          ],
        },
      ),
      boolOpt(
        "plugin:hyprexpo:skip_empty",
        "Skip empty",
        "Leave empty workspaces out of the grid",
        false,
      ),
      intOpt(
        "plugin:hyprexpo:max_workspace",
        "Max workspace",
        "Highest sequential workspace to show. 0 means no cap",
        0,
        { min: 0, max: 100, step: 1 },
      ),
      boolOpt(
        "plugin:hyprexpo:show_cursor",
        "Show cursor",
        "Keep the cursor visible during the overview",
        true,
      ),
      boolOpt(
        "plugin:hyprexpo:show_pinned_windows",
        "Show pinned windows",
        "Include pinned windows in the previews",
        false,
      ),
      boolOpt(
        "plugin:hyprexpo:drag_drop_enable",
        "Drag and drop",
        "Drag a window onto another workspace",
        true,
      ),
      boolOpt(
        "plugin:hyprexpo:keynav_enable",
        "Keyboard navigation",
        "Move the selection with the keyboard",
        true,
      ),
      boolOpt(
        "plugin:hyprexpo:label_enable",
        "Labels",
        "Draw workspace labels on the tiles",
        true,
      ),
      intOpt(
        "plugin:hyprexpo:border_width",
        "Border width",
        "Tile border thickness in pixels",
        2,
        { min: 0, max: 32, step: 1 },
      ),
      intOpt(
        "plugin:hyprexpo:gesture_fingers",
        "Gesture fingers",
        "Fingers for the swipe that opens the overview. 0 disables it",
        0,
        { min: 0, max: 9, step: 1 },
      ),
      intOpt(
        "plugin:hyprexpo:gesture_distance",
        "Gesture distance",
        "Swipe distance that opens the overview",
        200,
        { min: 1, max: 2000, step: 10 },
      ),
      stringOpt(
        "plugin:hyprexpo:gesture_direction",
        "Gesture direction",
        "Swipe direction that opens the overview",
        "up",
        {
          choices: [
            { value: "up", label: "Up" },
            { value: "down", label: "Down" },
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
          ],
        },
      ),
    ],
  },
  {
    id: "hypr3d",
    names: ["hypr3d", "Hypr3D"],
    title: "Hypr3D",
    summary: "Walk around windows in a 3D room",
    luaName: "hypr3d",
    keywords: ["3d", "panorama", "room"],
    fields: [
      stringOpt(
        "plugin:hypr3d:world_panorama",
        "Panorama",
        "360-degree room image. Empty clears it. Applied with hl.plugin.hypr3d.config",
        "",
        { allowCustom: true, maxLength: 400, keywords: ["image", "background"] },
      ),
      boolOpt(
        "plugin:hypr3d:world_grid",
        "Grid platform",
        "Show the floor grid at world zero",
        true,
      ),
      floatOpt(
        "plugin:hypr3d:window_scale",
        "Window scale",
        "How large windows are in the room",
        0.5,
        { min: 0.1, max: 8, step: 0.1 },
      ),
      floatOpt(
        "plugin:hypr3d:spawn_distance",
        "Spawn distance",
        "How far in front of the camera a new window appears",
        5,
        { min: 1, max: 100, step: 0.5 },
      ),
      floatOpt(
        "plugin:hypr3d:look_sensitivity",
        "Look sensitivity",
        "Radians of look per pointer count",
        0.0025,
        { min: 0.0001, max: 0.05, step: 0.0001 },
      ),
      floatOpt(
        "plugin:hypr3d:look_inertia",
        "Look inertia",
        "Seconds of look glide. 0 is off",
        0.03,
        { min: 0, max: 1, step: 0.01 },
      ),
      floatOpt(
        "plugin:hypr3d:move_inertia",
        "Move inertia",
        "Seconds of walk glide. 0 is off",
        0.05,
        { min: 0, max: 1, step: 0.01 },
      ),
      floatOpt(
        "plugin:hypr3d:move_speed",
        "Move speed",
        "World units per second",
        4,
        { min: 0.5, max: 50, step: 0.5 },
      ),
      boolOpt(
        "plugin:hypr3d:flying",
        "Flying",
        "Off uses gravity. Space jumps, Shift does nothing",
        true,
      ),
      stringOpt(
        "plugin:hypr3d:map_path",
        "Map file",
        "glTF map. Empty unloads it",
        "",
        { allowCustom: true, maxLength: 400, keywords: ["glb", "map"] },
      ),
      floatOpt(
        "plugin:hypr3d:emissive_scale",
        "Map brightness",
        "Scale on the map's emissive output",
        1,
        { min: 0, max: 8, step: 0.1 },
      ),
      boolOpt(
        "plugin:hypr3d:map_flat",
        "Flat map",
        "Baked lighting, no dynamic light on the map",
        true,
      ),
      boolOpt(
        "plugin:hypr3d:map_collision",
        "Map collision",
        "Walk into the map instead of through it",
        true,
      ),
    ],
  },
  {
    id: "hyprspace",
    names: ["Hyprspace", "hyprspace"],
    title: "Hyprspace",
    summary: "Workspace overview bar",
    luaName: "overview",
    keywords: ["overview", "workspace", "panel"],
    fields: [
      intOpt(
        "plugin:overview:panelHeight",
        "Panel height",
        "Overview bar height in pixels",
        250,
        { min: 40, max: 2000, step: 10 },
      ),
      intOpt(
        "plugin:overview:panelBorderWidth",
        "Panel border",
        "Border width of the overview bar",
        2,
        { min: 0, max: 32, step: 1 },
      ),
      intOpt(
        "plugin:overview:workspaceMargin",
        "Workspace margin",
        "Pixels between workspace cards",
        12,
        { min: 0, max: 200, step: 1 },
      ),
      intOpt(
        "plugin:overview:workspaceBorderSize",
        "Card border",
        "Workspace card border width",
        1,
        { min: 0, max: 32, step: 1 },
      ),
      boolOpt(
        "plugin:overview:centerAligned",
        "Center cards",
        "Center the workspace cards in the bar",
        true,
      ),
      boolOpt(
        "plugin:overview:drawActiveWorkspace",
        "Draw active workspace",
        "Include the workspace you are on",
        true,
      ),
      boolOpt(
        "plugin:overview:showEmptyWorkspace",
        "Show empty workspaces",
        "Keep empty workspaces in the bar",
        true,
      ),
      boolOpt(
        "plugin:overview:showNewWorkspace",
        "Show new workspace",
        "Show a card that creates a workspace",
        true,
      ),
      boolOpt(
        "plugin:overview:showSpecialWorkspace",
        "Show special workspace",
        "Include the special workspace",
        false,
      ),
      boolOpt(
        "plugin:overview:exitOnClick",
        "Exit on click",
        "Close the overview when a workspace is chosen",
        true,
      ),
      boolOpt(
        "plugin:overview:exitOnSwitch",
        "Exit on switch",
        "Close the overview when the workspace changes",
        false,
      ),
      boolOpt(
        "plugin:overview:switchOnDrop",
        "Follow dropped windows",
        "Switch to a workspace when a window is dropped on it",
        false,
      ),
      boolOpt(
        "plugin:overview:autoDrag",
        "Auto drag",
        "Drag windows inside the overview",
        true,
      ),
      boolOpt(
        "plugin:overview:autoScroll",
        "Auto scroll",
        "Scroll the bar when the pointer is at the edge",
        true,
      ),
      boolOpt(
        "plugin:overview:disableGestures",
        "Disable gestures",
        "Ignore the overview swipe gesture",
        true,
      ),
      boolOpt(
        "plugin:overview:reverseSwipe",
        "Reverse swipe",
        "Swap the swipe direction",
        false,
      ),
      boolOpt(
        "plugin:overview:disableBlur",
        "Disable blur",
        "Don't blur the overview background",
        false,
      ),
      boolOpt(
        "plugin:overview:hideTopLayers",
        "Hide top layers",
        "Hide top-layer surfaces while the overview is open",
        false,
      ),
      boolOpt(
        "plugin:overview:hideOverlayLayers",
        "Hide overlay layers",
        "Hide overlay surfaces while the overview is open",
        false,
      ),
      floatOpt(
        "plugin:overview:dragAlpha",
        "Drag opacity",
        "Opacity of a window while it is dragged",
        0.2,
        { min: 0, max: 1, step: 0.05 },
      ),
      stringOpt(
        "plugin:overview:exitKey",
        "Exit key",
        "Key that closes the overview",
        "Escape",
        { allowCustom: true, keywords: ["key", "escape"] },
      ),
      colorOpt(
        "plugin:overview:panelColor",
        "Panel color",
        "Overview bar fill",
        "0x00000000",
      ),
      colorOpt(
        "plugin:overview:workspaceActiveBackground",
        "Active card",
        "Fill of the current workspace card",
        "0x3f000000",
      ),
      colorOpt(
        "plugin:overview:workspaceInactiveBackground",
        "Inactive card",
        "Fill of the other workspace cards",
        "0x7f000000",
      ),
      colorOpt(
        "plugin:overview:workspaceActiveBorder",
        "Active border",
        "Border of the current workspace card",
        "0x3fffffff",
      ),
    ],
  },
  {
    id: "hymission",
    names: ["hymission"],
    title: "Hymission",
    summary: "Mission Control overview",
    luaName: "hymission",
    keywords: ["mission", "overview", "expose"],
    fields: [
      stringOpt(
        "plugin:hymission:layout_engine",
        "Layout",
        "How windows are arranged in the overview",
        "grid",
        {
          choices: [
            { value: "grid", label: "Grid" },
            { value: "natural", label: "Natural" },
            { value: "thumbnail", label: "Thumbnails" },
          ],
        },
      ),
      intOpt(
        "plugin:hymission:outer_padding",
        "Outer padding",
        "Pixels between the overview and the screen edge",
        32,
        { min: 0, max: 400, step: 4 },
      ),
      intOpt(
        "plugin:hymission:row_spacing",
        "Row spacing",
        "Pixels between rows",
        32,
        { min: 0, max: 400, step: 4 },
      ),
      intOpt(
        "plugin:hymission:column_spacing",
        "Column spacing",
        "Pixels between columns",
        32,
        { min: 0, max: 400, step: 4 },
      ),
      boolOpt(
        "plugin:hymission:only_active_workspace",
        "Current workspace only",
        "Show windows from the active workspace",
        false,
      ),
      boolOpt(
        "plugin:hymission:only_active_monitor",
        "Current monitor only",
        "Show windows from the active monitor",
        false,
      ),
      boolOpt(
        "plugin:hymission:show_special",
        "Show special workspace",
        "Include the special workspace",
        false,
      ),
      boolOpt(
        "plugin:hymission:stage_enabled",
        "Stage",
        "Show the workspace stage strip",
        false,
      ),
      stringOpt(
        "plugin:hymission:workspace_strip_anchor",
        "Strip edge",
        "Which screen edge the workspace strip uses",
        "left",
        {
          choices: [
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
            { value: "top", label: "Top" },
            { value: "bottom", label: "Bottom" },
          ],
        },
      ),
      intOpt(
        "plugin:hymission:workspace_strip_thickness",
        "Strip thickness",
        "Strip size in pixels",
        160,
        { min: 40, max: 800, step: 10 },
      ),
      boolOpt(
        "plugin:hymission:overview_focus_follows_mouse",
        "Focus follows mouse",
        "The hovered window becomes the keyboard selection",
        true,
      ),
      boolOpt(
        "plugin:hymission:vim_keys",
        "Vim keys",
        "hjkl moves the selection",
        false,
      ),
      boolOpt(
        "plugin:hymission:pick_labels_enabled",
        "Pick labels",
        "Show keys you can press to choose a window",
        false,
      ),
      boolOpt(
        "plugin:hymission:backdrop_blur",
        "Backdrop blur",
        "Blur the desktop behind the overview",
        false,
      ),
      colorOpt(
        "plugin:hymission:backdrop_color",
        "Backdrop color",
        "Tint over the desktop",
        "0x00000000",
      ),
      boolOpt(
        "plugin:hymission:hide_bar_when_strip",
        "Hide bar",
        "Hide the bar while the workspace strip is open",
        true,
      ),
      boolOpt(
        "plugin:hymission:gesture_invert_vertical",
        "Invert vertical gesture",
        "Swap up and down for the overview gesture",
        false,
      ),
    ],
  },
  {
    id: "gloview",
    names: ["GloView", "gloview"],
    title: "GloView",
    summary: "Mission Control-style overview",
    luaName: "gloview",
    keywords: ["overview", "expo", "mission"],
    fields: [
      stringOpt(
        "plugin:gloview:layout",
        "Layout",
        "How window tiles are arranged",
        "rows",
        {
          choices: [
            { value: "rows", label: "Rows" },
            { value: "grid", label: "Grid" },
            { value: "natural", label: "Natural" },
          ],
        },
      ),
      intOpt(
        "plugin:gloview:gap",
        "Gap",
        "Minimum pixels between tiles",
        34,
        { min: 0, max: 200, step: 2 },
      ),
      intOpt(
        "plugin:gloview:padding",
        "Side padding",
        "Left and right margin in pixels",
        80,
        { min: 0, max: 400, step: 4 },
      ),
      intOpt(
        "plugin:gloview:duration",
        "Animation",
        "Open and close animation in milliseconds",
        360,
        { min: 0, max: 2000, step: 20 },
      ),
      floatOpt(
        "plugin:gloview:blur",
        "Blur",
        "Backdrop blur from 0 to 1. 0 is off",
        1,
        { min: 0, max: 1, step: 0.05 },
      ),
      stringOpt(
        "plugin:gloview:anchor",
        "Strip edge",
        "Which edge the workspace strip attaches to. Empty uses the bar position",
        "",
        {
          allowCustom: true,
          choices: [
            { value: "", label: "Follow the bar" },
            { value: "top", label: "Top" },
            { value: "bottom", label: "Bottom" },
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
          ],
        },
      ),
      intOpt(
        "plugin:gloview:strip_height",
        "Strip thickness",
        "Workspace strip size in pixels",
        150,
        { min: 40, max: 600, step: 10 },
      ),
      boolOpt(
        "plugin:gloview:focus_follows_mouse",
        "Focus follows mouse",
        "Keyboard selection tracks the hovered tile",
        true,
      ),
      boolOpt(
        "plugin:gloview:exit_on_click",
        "Exit on empty click",
        "Clicking empty space closes the overview",
        true,
      ),
      boolOpt(
        "plugin:gloview:show_all_workspaces",
        "All workspaces",
        "Show every window on the monitor, not just the displayed workspace",
        false,
      ),
      boolOpt(
        "plugin:gloview:show_empty",
        "Show empty workspaces",
        "Keep empty workspaces as strip cards",
        true,
      ),
      boolOpt(
        "plugin:gloview:show_special",
        "Show special workspace",
        "Include the special workspace as a strip card",
        false,
      ),
      boolOpt(
        "plugin:gloview:dynamic_workspaces",
        "Dynamic workspaces",
        "Add and remove workspace cards as workspaces come and go",
        true,
      ),
      boolOpt(
        "plugin:gloview:autodelete_empty",
        "Delete empty",
        "Remove an empty workspace card",
        true,
      ),
      boolOpt(
        "plugin:gloview:show_workspace_labels",
        "Workspace labels",
        "Names above the strip cards",
        true,
      ),
      boolOpt(
        "plugin:gloview:show_window_labels",
        "Window labels",
        "Title under a hovered or selected preview",
        true,
      ),
      colorOpt(
        "plugin:gloview:backdrop_color",
        "Backdrop",
        "Dim color behind the overview",
        "0x73070a10",
      ),
    ],
  },
];

const HYPR3D_CALL: Record<
  string,
  NonNullable<PluginField["hypr3d"]>
> = {
  "plugin:hypr3d:world_panorama": { section: "world", key: "panorama" },
  "plugin:hypr3d:world_grid": { section: "world", key: "grid" },
  "plugin:hypr3d:window_scale": { section: "windows", key: "window_scale" },
  "plugin:hypr3d:spawn_distance": { section: "windows", key: "spawn_distance" },
  "plugin:hypr3d:look_sensitivity": { section: "player", key: "look_sensitivity" },
  "plugin:hypr3d:look_inertia": { section: "player", key: "look_inertia" },
  "plugin:hypr3d:move_inertia": { section: "player", key: "move_inertia" },
  "plugin:hypr3d:move_speed": { section: "player", key: "move_speed" },
  "plugin:hypr3d:flying": { section: "player", key: "flying" },
  "plugin:hypr3d:map_path": { section: "map", key: "path" },
  "plugin:hypr3d:emissive_scale": { section: "map", key: "emissive_scale" },
  "plugin:hypr3d:map_flat": { section: "map", key: "flat" },
  "plugin:hypr3d:map_collision": { section: "map", key: "collision" },
};

for (const catalog of PLUGIN_CATALOG) {
  if (catalog.id !== "hypr3d") continue;
  for (const field of catalog.fields) {
    const call = HYPR3D_CALL[field.option];
    if (!call) throw new Error(`missing hypr3d call for ${field.option}`);
    field.hypr3d = call;
  }
}

type Indexed = { catalog: PluginCatalog; field: PluginField };

function indexCatalog(catalogs: PluginCatalog[]): Map<string, Indexed> {
  const map = new Map<string, Indexed>();
  for (const catalog of catalogs) {
    for (const field of catalog.fields) {
      if (map.has(field.option)) {
        throw new Error(`duplicate plugin option ${field.option}`);
      }
      map.set(field.option, { catalog, field });
    }
  }
  return map;
}

const FIELD_BY_OPTION = indexCatalog(PLUGIN_CATALOG);

export function isKnownPluginOption(option: string): boolean {
  return FIELD_BY_OPTION.has(option);
}

export function fieldForOption(option: string): PluginField | undefined {
  return FIELD_BY_OPTION.get(option)?.field;
}

export type KnownLoaded = {
  catalog: PluginCatalog;
  loaded: LoadedPlugin;
};

export function groupLoaded(loaded: LoadedPlugin[]): {
  known: KnownLoaded[];
  unknown: LoadedPlugin[];
} {
  const used = new Set<number>();
  const known: KnownLoaded[] = [];
  for (const catalog of PLUGIN_CATALOG) {
    const idx = loaded.findIndex((plugin) =>
      catalog.names.some(
        (name) => name.toLowerCase() === plugin.name.toLowerCase(),
      ),
    );
    if (idx < 0) continue;
    used.add(idx);
    const plugin = loaded[idx];
    if (!plugin) continue;
    known.push({ catalog, loaded: plugin });
  }
  return {
    known,
    unknown: loaded.filter((_, index) => !used.has(index)),
  };
}

function asNumber(raw: HyprOptionValue): number {
  switch (raw.kind) {
    case "int":
    case "float":
      return raw.value;
    case "bool":
      return raw.value ? 1 : 0;
    case "string": {
      const n = Number(raw.value);
      if (!Number.isFinite(n)) {
        throw new Error(`not a number: ${raw.value}`);
      }
      return n;
    }
  }
}

function asBool(raw: HyprOptionValue): boolean {
  switch (raw.kind) {
    case "bool":
      return raw.value;
    case "int":
    case "float":
      return raw.value !== 0;
    case "string": {
      const s = raw.value.trim().toLowerCase();
      return s === "true" || s === "yes" || s === "1" || s === "on";
    }
  }
}

function asText(raw: HyprOptionValue): string {
  switch (raw.kind) {
    case "string":
      return raw.value;
    case "bool":
      return raw.value ? "true" : "false";
    case "int":
    case "float":
      return String(raw.value);
  }
}

export function normalizeColor(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/^#/, "");
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-f]{8}$/.test(hex)) {
    throw new Error("Color must be 8 hex digits, RRGGBBAA");
  }
  return `0x${hex}`;
}

function colorFromNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error("bad color");
  const truncated = Math.trunc(n);
  if (truncated > 0xffffffff || truncated < -0x80000000) {
    throw new Error("color out of range");
  }
  return `0x${(truncated >>> 0).toString(16).padStart(8, "0")}`;
}

export function liveToPersist(
  field: PluginField,
  raw: HyprOptionValue,
): PluginPersistValue {
  switch (field.kind) {
    case "bool":
      return { kind: "bool", value: asBool(raw) };
    case "int":
      return { kind: "int", value: Math.trunc(asNumber(raw)) };
    case "float":
      return { kind: "float", value: asNumber(raw) };
    case "string":
      return { kind: "string", value: asText(raw) };
    case "color": {
      if (raw.kind === "int" || raw.kind === "float") {
        return { kind: "color", value: colorFromNumber(raw.value) };
      }
      if (raw.kind === "string") {
        return { kind: "color", value: normalizeColor(raw.value) };
      }
      throw new Error(`${field.title} was not a color`);
    }
  }
}

export function samePluginValue(
  a: PluginPersistValue,
  b: PluginPersistValue,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "float" && b.kind === "float") {
    return Math.abs(a.value - b.value) < 0.0001;
  }
  return a.value === b.value;
}

function decimalPlaces(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function stepped(
  field: PluginField,
  current: PluginPersistValue,
  direction: 1 | -1,
): PluginPersistValue {
  if (current.kind !== "int" && current.kind !== "float") {
    throw new Error(`${field.title} is not numeric`);
  }
  if (field.kind !== current.kind) {
    throw new Error(`${field.title} kind mismatch`);
  }
  const step = field.step ?? (field.kind === "float" ? 0.1 : 1);
  let next = current.value + direction * step;
  const places = decimalPlaces(step);
  next = places > 0 ? Number(next.toFixed(places)) : Math.trunc(next);
  if (field.min !== undefined) next = Math.max(field.min, next);
  if (field.max !== undefined) next = Math.min(field.max, next);
  if (field.kind === "int") return { kind: "int", value: next };
  return { kind: "float", value: next };
}

function assertRange(field: PluginField, n: number): void {
  if (field.min !== undefined && n < field.min) {
    throw new Error(`${field.title} minimum is ${field.min}`);
  }
  if (field.max !== undefined && n > field.max) {
    throw new Error(`${field.title} maximum is ${field.max}`);
  }
}

function choiceOk(field: PluginField, value: string): boolean {
  if (!field.choices || field.allowCustom) return true;
  return field.choices.some((choice) => choice.value === value);
}

export function parseFieldInput(
  field: PluginField,
  raw: string,
): PluginPersistValue {
  const text = raw.trim();
  switch (field.kind) {
    case "bool": {
      const s = text.toLowerCase();
      if (s === "true" || s === "1" || s === "on") {
        return { kind: "bool", value: true };
      }
      if (s === "false" || s === "0" || s === "off") {
        return { kind: "bool", value: false };
      }
      throw new Error(`${field.title} needs on or off`);
    }
    case "int": {
      const n = Number(text);
      if (!Number.isInteger(n)) {
        throw new Error(`${field.title} needs a whole number`);
      }
      assertRange(field, n);
      if (!choiceOk(field, String(n))) {
        throw new Error(`${field.title} is not one of the listed values`);
      }
      return { kind: "int", value: n };
    }
    case "float": {
      const n = Number(text);
      if (!Number.isFinite(n)) {
        throw new Error(`${field.title} needs a number`);
      }
      assertRange(field, n);
      return { kind: "float", value: n };
    }
    case "string": {
      const maxLength = field.maxLength ?? 120;
      if (/[\n\r\0]/.test(text) || text.length > maxLength) {
        throw new Error(`${field.title} is too long or has a newline`);
      }
      if (!choiceOk(field, text)) {
        throw new Error(`${field.title} is not one of the listed values`);
      }
      return { kind: "string", value: text };
    }
    case "color":
      return { kind: "color", value: normalizeColor(text) };
  }
}

export function formatPluginValue(
  field: PluginField,
  value: PluginPersistValue,
): string {
  if (value.kind === "bool") return value.value ? "On" : "Off";
  if (value.kind === "string" || value.kind === "int") {
    const key = String(value.value);
    const choice = field.choices?.find((item) => item.value === key);
    if (choice) return choice.label;
  }
  if (value.kind === "string" && value.value === "") return "None";
  return String(value.value);
}

export function draftValue(value: PluginPersistValue): string {
  if (value.kind === "bool") return value.value ? "true" : "false";
  return String(value.value);
}

function quoteLua(value: string): string {
  if (/[\n\r\0]/.test(value)) {
    throw new Error("value cannot contain newlines");
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function luaLiteral(saved: PluginPersistValue): string {
  switch (saved.kind) {
    case "bool":
      return saved.value ? "true" : "false";
    case "int":
    case "float":
      return String(saved.value);
    case "string":
      return quoteLua(saved.value);
    case "color":
      return saved.value;
  }
}

export function hyprlangLiteral(saved: PluginPersistValue): string {
  if (saved.kind === "string") return quoteLua(saved.value);
  return luaLiteral(saved);
}

/** Lua that applies one saved plugin field. */
export function pluginFieldLua(
  field: PluginField,
  saved: PluginPersistValue,
): string {
  if (field.hypr3d) {
    const { section, key } = field.hypr3d;
    return `hl.plugin.hypr3d.config({ ${section} = { ${key} = ${luaLiteral(saved)} } })`;
  }
  return luaConfigAssignment(field.option, luaLiteral(saved));
}

const CURSOR_MODES_VALUES = new Set(["tilt", "rotate", "stretch", "none"]);

/** dynamic-cursors shape rules override `mode` for clientside cursors. */
function clientsideModeRule(
  field: PluginField,
  saved: PluginPersistValue,
): string | undefined {
  if (field.option !== "plugin:dynamic_cursors:mode") return undefined;
  if (saved.kind !== "string" || !CURSOR_MODES_VALUES.has(saved.value)) {
    return undefined;
  }
  return `  hl.plugin.dynamic_cursors.shape_rule({ shape = "clientside", mode = ${luaLiteral(saved)} })`;
}

function savedForField(
  plugins: Record<string, PluginPersistValue> | undefined,
  field: PluginField,
): PluginPersistValue | undefined {
  const saved = plugins?.[field.option];
  if (!saved || saved.kind !== field.kind) return undefined;
  return saved;
}

/** `if hl.plugin.<name> then ... end` blocks for saved plugin options. */
export function pluginLuaChunks(
  plugins: Record<string, PluginPersistValue> | undefined,
): string[] {
  const chunks: string[] = [];
  for (const catalog of PLUGIN_CATALOG) {
    const lines: string[] = [];
    for (const field of catalog.fields) {
      const saved = savedForField(plugins, field);
      if (!saved) continue;
      lines.push(`  ${pluginFieldLua(field, saved)}`);
      const shapeRule = clientsideModeRule(field, saved);
      if (shapeRule) lines.push(shapeRule);
    }
    if (lines.length === 0) continue;
    chunks.push(
      [`if hl.plugin.${catalog.luaName} then`, ...lines, "end"].join("\n"),
    );
  }
  return chunks;
}

export function pluginHyprlangChunks(
  plugins: Record<string, PluginPersistValue> | undefined,
): string[] {
  const blocks: string[] = [];
  for (const catalog of PLUGIN_CATALOG) {
    for (const field of catalog.fields) {
      if (field.hypr3d) continue;
      const saved = savedForField(plugins, field);
      if (!saved) continue;
      blocks.push(
        hyprlangConfigAssignment(field.option, hyprlangLiteral(saved)),
      );
    }
  }
  return blocks;
}
