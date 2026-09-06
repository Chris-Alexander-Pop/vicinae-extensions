import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dueItems,
  reminderSubtitle,
  reminderUrgency,
  shouldNotify,
} from "../src/notify";
import {
  parseHm,
  priorityLabel,
  priorityRank,
  remindAtOn,
  sameLocalDay,
} from "../src/priority";
import { doneItems, queueItems, type TodoItem } from "../src/store";

function item(partial: Partial<TodoItem> & Pick<TodoItem, "id" | "title">): TodoItem {
  return {
    done: false,
    order: 0,
    priority: "none",
    reminderTime: null,
    reminderMode: "off",
    lastNotifiedAt: null,
    ...partial,
  };
}

describe("parseHm", () => {
  it("zero-pads valid times", () => {
    assert.equal(parseHm("9:05"), "09:05");
    assert.equal(parseHm("23:59"), "23:59");
  });

  it("rejects malformed input", () => {
    assert.equal(parseHm("24:00"), null);
    assert.equal(parseHm("9:5"), null);
    assert.equal(parseHm("noon"), null);
    assert.equal(parseHm(12), null);
  });
});

describe("priority", () => {
  it("ranks urgent above none", () => {
    assert.ok(priorityRank("urgent") > priorityRank("high"));
    assert.ok(priorityRank("high") > priorityRank("none"));
    assert.equal(priorityLabel("medium"), "Medium");
  });
});

describe("shouldNotify", () => {
  const sessionStartedAt = new Date("2026-09-06T08:00:00");
  const now = new Date("2026-09-06T10:00:00");
  const baseOpts = {
    enabled: true,
    minPriority: "none" as const,
    nagMinutes: 0,
    inBootGrace: false,
    sessionStartedAt,
  };

  it("skips done, off, and disabled notifications", () => {
    assert.equal(
      shouldNotify(item({ id: "1", title: "a", reminderMode: "once", reminderTime: "09:00", done: true }), now, baseOpts),
      "skip",
    );
    assert.equal(
      shouldNotify(item({ id: "2", title: "b", reminderMode: "off", reminderTime: "09:00" }), now, baseOpts),
      "skip",
    );
    assert.equal(
      shouldNotify(item({ id: "3", title: "c", reminderMode: "once", reminderTime: "09:00" }), now, { ...baseOpts, enabled: false }),
      "skip",
    );
  });

  it("notifies a due once reminder and skips after it was pinged", () => {
    const due = item({ id: "4", title: "due", reminderMode: "once", reminderTime: "09:00" });
    assert.equal(shouldNotify(due, now, baseOpts), "notify");
    assert.equal(
      shouldNotify({ ...due, lastNotifiedAt: now.toISOString() }, now, baseOpts),
      "skip",
    );
  });

  it("waits through boot grace for reminders that were already due", () => {
    const due = item({ id: "5", title: "old", reminderMode: "daily", reminderTime: "07:00" });
    assert.equal(
      shouldNotify(due, now, { ...baseOpts, inBootGrace: true }),
      "wait-boot",
    );
  });

  it("maps urgency labels", () => {
    assert.equal(reminderUrgency("urgent"), "High");
    assert.equal(reminderUrgency("medium"), "Normal");
    assert.equal(reminderUrgency("none"), "Low");
  });
});

describe("queue formatting", () => {
  it("sorts the open queue by priority then order", () => {
    const items = [
      item({ id: "low", title: "low", priority: "low", order: 0 }),
      item({ id: "hi", title: "hi", priority: "high", order: 2 }),
      item({ id: "done", title: "done", done: true, order: 0 }),
    ];
    assert.deepEqual(queueItems(items).map((i) => i.id), ["hi", "low"]);
    assert.deepEqual(doneItems(items).map((i) => i.id), ["done"]);
  });

  it("labels overdue reminders", () => {
    const now = new Date("2026-09-06T10:00:00");
    const task = item({ id: "t", title: "t", reminderMode: "daily", reminderTime: "09:00" });
    assert.equal(reminderSubtitle(task, now), "overdue 09:00");
    assert.equal(dueItems([task], now, {
      notificationsEnabled: true,
      bootGraceSeconds: 0,
      sessionGapMinutes: 5,
      nagMinutes: 0,
      minPriority: "none",
      defaultPriority: "none",
      defaultReminderMode: "off",
      defaultReminderTime: "09:00",
    }, { inBootGrace: false, sessionStartedAt: new Date("2026-09-06T08:00:00") }).length, 1);
  });

  it("sameLocalDay and remindAtOn handle clock math", () => {
    const day = new Date("2026-09-06T15:00:00");
    const at = remindAtOn(day, "09:30");
    assert.ok(at);
    assert.equal(at.getHours(), 9);
    assert.equal(at.getMinutes(), 30);
    assert.equal(sameLocalDay(day, at), true);
    assert.equal(remindAtOn(day, "nope"), null);
  });
});
