import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import {
  isPriority,
  isReminderMode,
  parseHm,
  priorityRank,
  type Priority,
  type ReminderMode,
} from "./priority";

export type TodoItem = {
  id: string;
  title: string;
  done: boolean;
  order: number;
  priority: Priority;
  reminderTime: string | null;
  reminderMode: ReminderMode;
  lastNotifiedAt: string | null;
};

export type ItemInput = {
  title: string;
  priority: Priority;
  reminderTime: string | null;
  reminderMode: ReminderMode;
};

export type TodosFile = {
  version: 1;
  items: TodoItem[];
  lastPollAt?: string;
  sessionStartedAt?: string;
};

const EMPTY: TodosFile = { version: 1, items: [] };

function configDir(): string {
  const home = process.env.HOME?.trim() || homedir();
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return join(xdg || join(home, ".config"), "vicinae", "todo");
}

export function todosPath(): string {
  return join(configDir(), "todos.json");
}

function byQueue(a: TodoItem, b: TodoItem): number {
  const rank = priorityRank(b.priority) - priorityRank(a.priority);
  if (rank !== 0) return rank;
  return a.order - b.order || a.id.localeCompare(b.id);
}

function byDoneOrder(a: TodoItem, b: TodoItem): number {
  return a.order - b.order || a.id.localeCompare(b.id);
}

export function queueItems(items: TodoItem[]): TodoItem[] {
  return items.filter((item) => !item.done).sort(byQueue);
}

export function doneItems(items: TodoItem[]): TodoItem[] {
  return items.filter((item) => item.done).sort(byDoneOrder);
}

function normalizeItem(raw: unknown): TodoItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<TodoItem>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!id || !title) return null;
  const last =
    typeof o.lastNotifiedAt === "string" &&
    Number.isFinite(Date.parse(o.lastNotifiedAt))
      ? o.lastNotifiedAt
      : null;
  return {
    id,
    title,
    done: Boolean(o.done),
    order: typeof o.order === "number" && Number.isFinite(o.order) ? o.order : 0,
    priority: isPriority(o.priority) ? o.priority : "none",
    reminderTime: parseHm(o.reminderTime),
    reminderMode: isReminderMode(o.reminderMode) ? o.reminderMode : "off",
    lastNotifiedAt: last,
  };
}

export async function readStore(): Promise<TodosFile> {
  try {
    const raw = await readFile(todosPath(), "utf8");
    const parsed = JSON.parse(raw) as TodosFile;
    if (!parsed || !Array.isArray(parsed.items)) return { ...EMPTY };
    return {
      version: 1,
      items: parsed.items
        .map(normalizeItem)
        .filter((item): item is TodoItem => item !== null),
      lastPollAt:
        typeof parsed.lastPollAt === "string" ? parsed.lastPollAt : undefined,
      sessionStartedAt:
        typeof parsed.sessionStartedAt === "string"
          ? parsed.sessionStartedAt
          : undefined,
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeStore(file: TodosFile): Promise<void> {
  const path = todosPath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const body = JSON.stringify(
    {
      version: 1,
      items: file.items
        .map(normalizeItem)
        .filter((item): item is TodoItem => item !== null),
      lastPollAt: file.lastPollAt,
      sessionStartedAt: file.sessionStartedAt,
    },
    null,
    2,
  );
  await writeFile(tmp, `${body}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

function nextOrder(
  items: TodoItem[],
  done: boolean,
  priority?: Priority,
): number {
  const section = items.filter(
    (item) =>
      item.done === done &&
      (done || priority === undefined || item.priority === priority),
  );
  return section.reduce((max, item) => Math.max(max, item.order), -1) + 1;
}

export async function addItem(input: ItemInput): Promise<TodoItem> {
  const store = await readStore();
  const item: TodoItem = {
    id: randomUUID(),
    title: input.title.trim(),
    done: false,
    order: nextOrder(store.items, false, input.priority),
    priority: input.priority,
    reminderTime: input.reminderTime,
    reminderMode: input.reminderMode,
    lastNotifiedAt: null,
  };
  store.items.push(item);
  await writeStore(store);
  return item;
}

export async function updateItem(
  id: string,
  input: ItemInput,
): Promise<TodoItem | null> {
  const store = await readStore();
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return null;
  const reminderChanged =
    item.reminderTime !== input.reminderTime ||
    item.reminderMode !== input.reminderMode;
  if (!item.done && item.priority !== input.priority) {
    item.order = nextOrder(
      store.items.filter((entry) => entry.id !== id),
      false,
      input.priority,
    );
  }
  item.title = input.title.trim();
  item.priority = input.priority;
  item.reminderTime = input.reminderTime;
  item.reminderMode = input.reminderMode;
  if (reminderChanged) item.lastNotifiedAt = null;
  await writeStore(store);
  return item;
}

export async function toggleDone(id: string): Promise<TodoItem | null> {
  const store = await readStore();
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return null;
  const nextDone = !item.done;
  item.done = nextDone;
  item.order = nextOrder(
    store.items.filter((entry) => entry.id !== id),
    nextDone,
    nextDone ? undefined : item.priority,
  );
  await writeStore(store);
  return item;
}

export async function moveItem(id: string, delta: -1 | 1): Promise<boolean> {
  const store = await readStore();
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return false;
  const section = store.items
    .filter(
      (entry) =>
        entry.done === item.done &&
        (item.done || entry.priority === item.priority),
    )
    .sort(item.done ? byDoneOrder : byQueue);
  const idx = section.findIndex((entry) => entry.id === id);
  const next = idx + delta;
  if (idx < 0 || next < 0 || next >= section.length) return false;
  const [moved] = section.splice(idx, 1);
  section.splice(next, 0, moved);
  for (let i = 0; i < section.length; i++) {
    section[i].order = i;
  }
  await writeStore(store);
  return true;
}

export async function removeItem(id: string): Promise<void> {
  const store = await readStore();
  store.items = store.items.filter((item) => item.id !== id);
  await writeStore(store);
}

export async function clearDone(): Promise<number> {
  const store = await readStore();
  const before = store.items.length;
  store.items = store.items.filter((item) => !item.done);
  const removed = before - store.items.length;
  if (removed > 0) await writeStore(store);
  return removed;
}

export async function markNotified(
  ids: string[],
  at: Date,
): Promise<void> {
  if (ids.length === 0) return;
  const store = await readStore();
  const iso = at.toISOString();
  let changed = false;
  for (const id of ids) {
    const item = store.items.find((entry) => entry.id === id);
    if (!item) continue;
    item.lastNotifiedAt = iso;
    changed = true;
  }
  if (changed) await writeStore(store);
}

export type PollSession = {
  sessionStartedAt: Date;
  inBootGrace: boolean;
};

export async function touchPollSession(
  sessionGapMinutes: number,
  bootGraceSeconds: number,
): Promise<PollSession> {
  const store = await readStore();
  const now = Date.now();
  const last = store.lastPollAt ? Date.parse(store.lastPollAt) : Number.NaN;
  const gapMs = sessionGapMinutes * 60_000;
  const isNewSession = !Number.isFinite(last) || now - last > gapMs;
  const sessionStart = isNewSession
    ? now
    : store.sessionStartedAt
      ? Date.parse(store.sessionStartedAt)
      : now;
  const sessionStartedAt = Number.isFinite(sessionStart) ? sessionStart : now;
  store.lastPollAt = new Date(now).toISOString();
  store.sessionStartedAt = new Date(sessionStartedAt).toISOString();
  await writeStore(store);
  return {
    sessionStartedAt: new Date(sessionStartedAt),
    inBootGrace: now - sessionStartedAt < bootGraceSeconds * 1000,
  };
}
