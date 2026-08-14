export type Rgb = { r: number; g: number; b: number };

export const NAMED_COLORS: { name: string; rgb: Rgb }[] = [
  { name: "red", rgb: { r: 255, g: 0, b: 0 } },
  { name: "orange", rgb: { r: 255, g: 100, b: 0 } },
  { name: "amber", rgb: { r: 255, g: 191, b: 0 } },
  { name: "yellow", rgb: { r: 255, g: 255, b: 0 } },
  { name: "lime", rgb: { r: 128, g: 255, b: 0 } },
  { name: "green", rgb: { r: 0, g: 255, b: 0 } },
  { name: "teal", rgb: { r: 0, g: 200, b: 170 } },
  { name: "cyan", rgb: { r: 0, g: 255, b: 255 } },
  { name: "blue", rgb: { r: 0, g: 80, b: 255 } },
  { name: "indigo", rgb: { r: 75, g: 0, b: 130 } },
  { name: "purple", rgb: { r: 160, g: 32, b: 240 } },
  { name: "pink", rgb: { r: 255, g: 105, b: 180 } },
  { name: "magenta", rgb: { r: 255, g: 0, b: 255 } },
  { name: "white", rgb: { r: 255, g: 255, b: 255 } },
  { name: "warm-white", rgb: { r: 255, g: 214, b: 170 } },
  { name: "cool-white", rgb: { r: 214, g: 233, b: 255 } },
];

export const TEMP_PRESETS: { name: string; kelvin: number }[] = [
  { name: "candle", kelvin: 1800 },
  { name: "warm", kelvin: 2700 },
  { name: "soft", kelvin: 3000 },
  { name: "neutral", kelvin: 4000 },
  { name: "daylight", kelvin: 5000 },
  { name: "cool", kelvin: 6500 },
  { name: "overcast", kelvin: 7000 },
];

export type ModeDef = {
  name: string;
  help: string;
  needsForm: boolean;
};

export const MODES: ModeDef[] = [
  { name: "rainbow", help: "smooth continuous hue cycle", needsForm: false },
  { name: "cycle", help: "smoothly cycle through the named color palette", needsForm: false },
  { name: "aurora", help: "slow drift through teal / purple / pink tones", needsForm: false },
  { name: "fire", help: "warm orange-red flicker", needsForm: false },
  { name: "candle", help: "soft warm-white flicker like a candle", needsForm: false },
  { name: "fade", help: "breathe between two colors", needsForm: true },
  { name: "breathe", help: "pulse brightness on a fixed color", needsForm: true },
  { name: "pulse", help: "brightness pulse with a slow hue drift", needsForm: true },
  { name: "temp-fade", help: "breathe between two color temperatures", needsForm: true },
  { name: "temp-cycle", help: "smooth sine sweep across a temperature range", needsForm: true },
  { name: "blend", help: "crossfade between a color and a temperature", needsForm: true },
];

export const BRIGHTNESS_PRESETS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 1];

export function rgbHex(rgb: Rgb): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

export function colorsEqual(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export function namedColorFor(rgb: Rgb): string | undefined {
  return NAMED_COLORS.find((c) => colorsEqual(c.rgb, rgb))?.name;
}

export function namedTempFor(kelvin: number): string | undefined {
  return TEMP_PRESETS.find((t) => t.kelvin === kelvin)?.name;
}

export function nearestPreset(percent: number): number {
  return BRIGHTNESS_PRESETS.reduce((best, p) =>
    Math.abs(p - percent) < Math.abs(best - percent) ? p : best,
  );
}

export function parseStepPercent(raw: string | undefined, fallback = 5): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(50, Math.round(n));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
