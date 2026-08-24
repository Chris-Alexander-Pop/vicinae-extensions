export const PRIORITIES = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const;

export type Priority = (typeof PRIORITIES)[number];

export const REMINDER_MODES = ["off", "once", "daily"] as const;
export type ReminderMode = (typeof REMINDER_MODES)[number];

const PRIORITY_RANK: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export function isPriority(value: unknown): value is Priority {
  return (
    typeof value === "string" &&
    (PRIORITIES as readonly string[]).includes(value)
  );
}

export function isReminderMode(value: unknown): value is ReminderMode {
  return (
    typeof value === "string" &&
    (REMINDER_MODES as readonly string[]).includes(value)
  );
}

export function priorityRank(priority: Priority): number {
  return PRIORITY_RANK[priority];
}

export function priorityLabel(priority: Priority): string {
  switch (priority) {
    case "urgent":
      return "Urgent";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "none":
      return "None";
  }
}

export function reminderModeLabel(mode: ReminderMode): string {
  switch (mode) {
    case "off":
      return "Off";
    case "once":
      return "Once (today)";
    case "daily":
      return "Daily until done";
  }
}

/** Accepts `H:MM` or `HH:MM`, returns zero-padded `HH:MM` or null. */
export function parseHm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function remindAtOn(day: Date, hm: string): Date | null {
  const parsed = parseHm(hm);
  if (!parsed) return null;
  const [hours, minutes] = parsed.split(":").map(Number);
  const next = new Date(day);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
