import { namedColorFor, namedTempFor, rgbHex, type Rgb } from "./presets";

export type LightStatus = {
  onOff: number;
  brightness: number;
  color: Rgb;
  colorTemInKelvin: number;
};

export type GvlConfig = {
  path: string;
  url: string;
  tokenSet: boolean;
  address: string;
};

export type ScheduleLook = {
  color?: Rgb;
  temp?: number;
  brightness: number;
};

export type SchedulePatch = {
  date: string;
  skip?: boolean;
  at?: string;
  next_day?: boolean;
  duration_min?: number;
  from?: ScheduleLook;
  to?: ScheduleLook;
  end_off?: boolean;
};

export type ScheduleEntry = {
  id: string;
  enabled: boolean;
  kind: "wake" | "sleep" | "mode" | string;
  days?: string[];
  at: string;
  timezone: string;
  duration_min: number;
  from: ScheduleLook;
  to: ScheduleLook;
  end_off?: boolean;
  split_pct?: number;
  mode?: string;
  last_fired?: string;
  next?: SchedulePatch[];
  upcoming?: string;
  upcoming_note?: string;
};

export type DiscoveredDevice = {
  ip: string;
  sku?: string;
  device?: string;
  how?: string;
  status?: LightStatus;
};

export function parseStatus(raw: unknown): LightStatus {
  const o = (raw ?? {}) as {
    onOff?: unknown;
    brightness?: unknown;
    color?: { r?: unknown; g?: unknown; b?: unknown };
    colorTemInKelvin?: unknown;
  };
  return {
    onOff: Number(o.onOff) || 0,
    brightness: Number(o.brightness) || 0,
    color: {
      r: Number(o.color?.r) || 0,
      g: Number(o.color?.g) || 0,
      b: Number(o.color?.b) || 0,
    },
    colorTemInKelvin: Number(o.colorTemInKelvin) || 0,
  };
}

export function isOn(status: LightStatus): boolean {
  return status.onOff !== 0;
}

export function formatColor(status: LightStatus): string {
  if (status.colorTemInKelvin > 0) {
    const name = namedTempFor(status.colorTemInKelvin);
    return name
      ? `${name} (${status.colorTemInKelvin}K)`
      : `${status.colorTemInKelvin}K`;
  }
  return namedColorFor(status.color) ?? rgbHex(status.color);
}

export function formatStatusLine(status: LightStatus): string {
  const power = isOn(status) ? "On" : "Off";
  return `${power} · ${status.brightness}% · ${formatColor(status)}`;
}

export function formatLook(look: ScheduleLook | undefined): string {
  if (!look) return "—";
  const pct = `${look.brightness}%`;
  if (look.temp && look.temp > 0) {
    const name = namedTempFor(look.temp);
    return name ? `${name} (${look.temp}K) @ ${pct}` : `${look.temp}K @ ${pct}`;
  }
  if (look.color) {
    const name = namedColorFor(look.color);
    return `${name ?? rgbHex(look.color)} @ ${pct}`;
  }
  return pct;
}

export function formatUpcoming(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]} ${hh}:${mm}`;
}

export function formatPatch(p: SchedulePatch): string {
  if (p.skip) return `${p.date} skip`;
  const bits = [p.date];
  if (p.at) bits.push(p.next_day ? `${p.at} next day` : p.at);
  if (p.duration_min) bits.push(`${p.duration_min}m`);
  return bits.join(" · ");
}

export function formatDays(days: string[] | undefined): string {
  if (!days || days.length === 0) return "everyday";
  const joined = days.join(",");
  if (joined === "mon,tue,wed,thu,fri") return "weekdays";
  if (joined === "sat,sun") return "weekend";
  return joined;
}

export function daysPreset(days: string[] | undefined): "weekdays" | "weekend" | "everyday" | "custom" {
  if (!days || days.length === 0) return "everyday";
  const joined = days.join(",");
  if (joined === "mon,tue,wed,thu,fri") return "weekdays";
  if (joined === "sat,sun") return "weekend";
  return "custom";
}

export function parseConfigShow(text: string): GvlConfig {
  const pick = (key: string) => {
    const line = text.split("\n").find((l) => l.trimStart().startsWith(key));
    if (!line) return "";
    const idx = line.indexOf(":");
    return idx >= 0 ? line.slice(idx + 1).trim() : "";
  };
  const token = pick("token:");
  return {
    path: pick("path:"),
    url: pick("url:"),
    tokenSet: token !== "" && token !== "(empty)" && token !== "***",
    address: pick("address:"),
  };
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
