import { DEFAULT_DND, type DndPrefs } from "./types";

export function parseHm(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59 || Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

function toMinutes({ h, m }: { h: number; m: number }): number {
  return h * 60 + m;
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

export function isWithinScheduledQuietHours(
  prefs: DndPrefs,
  now = new Date(),
): boolean {
  if (!prefs.schedule_enabled) return false;
  if (prefs.weekdays_only && !isWeekday(now)) return false;

  const start = parseHm(prefs.start_time);
  const end = parseHm(prefs.end_time);
  if (!start || !end) return false;

  const cur = toMinutes({ h: now.getHours(), m: now.getMinutes() });
  const sm = toMinutes(start);
  const em = toMinutes(end);

  if (sm === em) return false;
  if (sm < em) return cur >= sm && cur < em;
  return cur >= sm || cur < em;
}

export function dndBlocksNow(prefs: DndPrefs, now = new Date()): boolean {
  return prefs.enabled || isWithinScheduledQuietHours(prefs, now);
}

export function formatDndStatus(prefs: DndPrefs, now = new Date()): string {
  if (prefs.enabled) return "DND On";
  if (isWithinScheduledQuietHours(prefs, now)) return "Quiet Hours";
  return "DND Off";
}

export function formatDndDetail(prefs: DndPrefs, now = new Date()): string {
  const window = `${prefs.start_time} to ${prefs.end_time}${
    prefs.weekdays_only ? ", weekdays" : ""
  }`;
  if (prefs.enabled) return "Manual do not disturb";
  if (!prefs.schedule_enabled) return "Notifications allowed";
  if (isWithinScheduledQuietHours(prefs, now)) return `Inside window, ${window}`;
  return `Schedule ${window}`;
}

export function withToggledManual(prefs: DndPrefs): DndPrefs {
  return { ...prefs, enabled: !prefs.enabled };
}

export function withToggledSchedule(prefs: DndPrefs): DndPrefs {
  return { ...prefs, schedule_enabled: !prefs.schedule_enabled };
}

export function withToggledWeekdays(prefs: DndPrefs): DndPrefs {
  return { ...prefs, weekdays_only: !prefs.weekdays_only };
}

export function mergeSchedule(
  prefs: DndPrefs,
  patch: Partial<Pick<DndPrefs, "start_time" | "end_time" | "weekdays_only" | "schedule_enabled">>,
): DndPrefs {
  const next = { ...prefs, ...patch };
  if (patch.start_time !== undefined && !parseHm(patch.start_time)) {
    next.start_time = prefs.start_time || DEFAULT_DND.start_time;
  }
  if (patch.end_time !== undefined && !parseHm(patch.end_time)) {
    next.end_time = prefs.end_time || DEFAULT_DND.end_time;
  }
  return next;
}

export function addMutedApp(muted: string[], app: string): string[] {
  const name = app.trim();
  if (!name) return muted;
  if (muted.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
    return muted;
  }
  return [...muted, name];
}

export function removeMutedApp(muted: string[], app: string): string[] {
  const name = app.trim().toLowerCase();
  return muted.filter((entry) => entry.toLowerCase() !== name);
}

export function formatNotificationTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function urgencyLabel(urgency: number): string | undefined {
  if (urgency >= 2) return "critical";
  if (urgency <= 0) return "low";
  return undefined;
}
