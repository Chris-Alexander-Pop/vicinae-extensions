import {
  parseHm,
  priorityRank,
  remindAtOn,
  sameLocalDay,
  type Priority,
} from "./priority";
import type { TodoPrefs } from "./prefs";
import type { TodoItem } from "./store";

export type NotifyDecision = "skip" | "wait-boot" | "notify";
export type ReminderUrgency = "Low" | "Normal" | "High";

export function reminderUrgency(priority: Priority): ReminderUrgency {
  if (priority === "urgent" || priority === "high") return "High";
  if (priority === "low" || priority === "none") return "Low";
  return "Normal";
}

export function shouldNotify(
  item: TodoItem,
  now: Date,
  opts: {
    enabled: boolean;
    minPriority: Priority;
    nagMinutes: number;
    inBootGrace: boolean;
    sessionStartedAt: Date;
  },
): NotifyDecision {
  if (!opts.enabled) return "skip";
  if (item.done) return "skip";
  if (item.reminderMode === "off") return "skip";
  if (!item.reminderTime || !parseHm(item.reminderTime)) return "skip";
  if (priorityRank(item.priority) < priorityRank(opts.minPriority)) {
    return "skip";
  }

  const dueAt = remindAtOn(now, item.reminderTime);
  if (!dueAt || now < dueAt) return "skip";

  const last = item.lastNotifiedAt ? new Date(item.lastNotifiedAt) : null;
  const lastValid = last && Number.isFinite(last.getTime()) ? last : null;

  if (item.reminderMode === "once" && lastValid) return "skip";

  if (lastValid && sameLocalDay(lastValid, now)) {
    if (opts.nagMinutes <= 0) return "skip";
    const elapsedMs = now.getTime() - lastValid.getTime();
    if (elapsedMs < opts.nagMinutes * 60_000) return "skip";
    return "notify";
  }

  const missedBeforeSession = dueAt.getTime() <= opts.sessionStartedAt.getTime();
  if (opts.inBootGrace && missedBeforeSession) return "wait-boot";
  return "notify";
}

export function dueItems(
  items: TodoItem[],
  now: Date,
  prefs: TodoPrefs,
  session: { inBootGrace: boolean; sessionStartedAt: Date },
): TodoItem[] {
  return items.filter(
    (item) =>
      shouldNotify(item, now, {
        enabled: prefs.notificationsEnabled,
        minPriority: prefs.minPriority,
        nagMinutes: prefs.nagMinutes,
        inBootGrace: session.inBootGrace,
        sessionStartedAt: session.sessionStartedAt,
      }) === "notify",
  );
}

export function nextReminder(
  items: TodoItem[],
  now: Date,
): { item: TodoItem; at: Date } | null {
  let best: { item: TodoItem; at: Date } | null = null;
  for (const item of items) {
    if (item.done || item.reminderMode === "off" || !item.reminderTime) {
      continue;
    }
    const at = remindAtOn(now, item.reminderTime);
    if (!at || at <= now) continue;
    if (item.reminderMode === "once" && item.lastNotifiedAt) continue;
    if (!best || at < best.at) best = { item, at };
  }
  return best;
}

export function reminderSubtitle(item: TodoItem, now: Date): string | undefined {
  if (item.reminderMode === "off" || !item.reminderTime) return undefined;
  const dueAt = remindAtOn(now, item.reminderTime);
  if (!dueAt) return undefined;
  if (item.done) return `${item.reminderTime}`;
  if (now >= dueAt) return `overdue ${item.reminderTime}`;
  return item.reminderTime;
}
