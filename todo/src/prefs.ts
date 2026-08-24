import { getPreferenceValues } from "@vicinae/api";
import {
  isPriority,
  isReminderMode,
  parseHm,
  type Priority,
  type ReminderMode,
} from "./priority";

export type TodoPrefs = {
  notificationsEnabled: boolean;
  bootGraceSeconds: number;
  sessionGapMinutes: number;
  nagMinutes: number;
  minPriority: Priority;
  defaultPriority: Priority;
  defaultReminderMode: ReminderMode;
  defaultReminderTime: string;
};

type RawPrefs = {
  notificationsEnabled?: boolean;
  bootGraceSeconds?: string;
  sessionGapMinutes?: string;
  nagMinutes?: string;
  minPriority?: string;
  defaultPriority?: string;
  defaultReminderMode?: string;
  defaultReminderTime?: string;
};

function parseIntPref(raw: string | undefined, fallback: number, min: number): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

export function getTodoPrefs(): TodoPrefs {
  const raw = getPreferenceValues<RawPrefs>();
  return {
    notificationsEnabled: raw.notificationsEnabled !== false,
    bootGraceSeconds: parseIntPref(raw.bootGraceSeconds, 60, 0),
    sessionGapMinutes: parseIntPref(raw.sessionGapMinutes, 5, 1),
    nagMinutes: parseIntPref(raw.nagMinutes, 0, 0),
    minPriority: isPriority(raw.minPriority) ? raw.minPriority : "none",
    defaultPriority: isPriority(raw.defaultPriority)
      ? raw.defaultPriority
      : "none",
    defaultReminderMode: isReminderMode(raw.defaultReminderMode)
      ? raw.defaultReminderMode
      : "off",
    defaultReminderTime:
      parseHm(raw.defaultReminderTime) ?? "09:00",
  };
}
