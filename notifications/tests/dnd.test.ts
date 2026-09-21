import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMutedApp,
  dndBlocksNow,
  formatDndDetail,
  formatDndStatus,
  formatNotificationTime,
  isWithinScheduledQuietHours,
  mergeSchedule,
  parseHm,
  removeMutedApp,
  urgencyLabel,
  withToggledManual,
  withToggledSchedule,
} from "../src/dnd";
import { DEFAULT_DND, type DndPrefs } from "../src/types";

function at(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

const scheduled: DndPrefs = {
  enabled: false,
  schedule_enabled: true,
  start_time: "22:00",
  end_time: "07:00",
  weekdays_only: true,
};

describe("parseHm", () => {
  it("accepts 24-hour times", () => {
    assert.deepEqual(parseHm("22:00"), { h: 22, m: 0 });
    assert.deepEqual(parseHm("7:05"), { h: 7, m: 5 });
  });

  it("rejects junk", () => {
    assert.equal(parseHm("25:00"), null);
    assert.equal(parseHm("10"), null);
    assert.equal(parseHm("nope"), null);
  });
});

describe("quiet hours", () => {
  it("is off when the schedule is disabled", () => {
    const prefs = { ...scheduled, schedule_enabled: false };
    assert.equal(isWithinScheduledQuietHours(prefs, at(2026, 9, 21, 23)), false);
  });

  it("covers an overnight weekday window", () => {
    // Monday 23:10
    assert.equal(isWithinScheduledQuietHours(scheduled, at(2026, 9, 21, 23, 10)), true);
    // Tuesday 06:30
    assert.equal(isWithinScheduledQuietHours(scheduled, at(2026, 9, 22, 6, 30)), true);
    // Tuesday 07:00 is the end (exclusive)
    assert.equal(isWithinScheduledQuietHours(scheduled, at(2026, 9, 22, 7)), false);
    // Tuesday 15:00
    assert.equal(isWithinScheduledQuietHours(scheduled, at(2026, 9, 22, 15)), false);
  });

  it("skips weekends when weekdays_only", () => {
    // Saturday 23:00
    assert.equal(isWithinScheduledQuietHours(scheduled, at(2026, 9, 19, 23)), false);
  });

  it("covers a same-day window", () => {
    const lunch: DndPrefs = {
      ...scheduled,
      start_time: "12:00",
      end_time: "13:00",
      weekdays_only: false,
    };
    assert.equal(isWithinScheduledQuietHours(lunch, at(2026, 9, 19, 12, 30)), true);
    assert.equal(isWithinScheduledQuietHours(lunch, at(2026, 9, 19, 13)), false);
  });

  it("treats equal start/end as never inside", () => {
    const same = { ...scheduled, start_time: "10:00", end_time: "10:00" };
    assert.equal(isWithinScheduledQuietHours(same, at(2026, 9, 21, 10)), false);
  });
});

describe("dnd status labels", () => {
  it("prefers manual DND over the schedule", () => {
    const prefs = { ...scheduled, enabled: true };
    const now = at(2026, 9, 21, 15);
    assert.equal(formatDndStatus(prefs, now), "DND On");
    assert.equal(dndBlocksNow(prefs, now), true);
    assert.equal(formatDndDetail(prefs, now), "Manual do not disturb");
  });

  it("labels an active quiet-hour window", () => {
    const now = at(2026, 9, 21, 23);
    assert.equal(formatDndStatus(scheduled, now), "Quiet Hours");
    assert.equal(dndBlocksNow(scheduled, now), true);
    assert.match(formatDndDetail(scheduled, now), /Inside window/);
  });

  it("labels off when nothing is blocking", () => {
    const now = at(2026, 9, 21, 15);
    assert.equal(formatDndStatus(DEFAULT_DND, now), "DND Off");
    assert.equal(dndBlocksNow(DEFAULT_DND, now), false);
    assert.equal(formatDndDetail(DEFAULT_DND, now), "Notifications allowed");
  });
});

describe("patches", () => {
  it("toggles manual and schedule flags", () => {
    assert.equal(withToggledManual(DEFAULT_DND).enabled, true);
    assert.equal(withToggledSchedule(DEFAULT_DND).schedule_enabled, true);
  });

  it("keeps the last valid HH:MM when a patch is junk", () => {
    const next = mergeSchedule(DEFAULT_DND, { start_time: "nope", end_time: "08:15" });
    assert.equal(next.start_time, "22:00");
    assert.equal(next.end_time, "08:15");
  });

  it("adds and removes muted apps without dupes", () => {
    const once = addMutedApp([], "Slack");
    assert.deepEqual(addMutedApp(once, "slack"), once);
    assert.deepEqual(removeMutedApp(once, "SLACK"), []);
    assert.deepEqual(addMutedApp(once, "  "), once);
  });
});

describe("display helpers", () => {
  it("formats unix-second timestamps", () => {
    assert.equal(formatNotificationTime(0), "");
    const label = formatNotificationTime(1_700_000_000);
    assert.match(label, /\d/);
  });

  it("labels urgency extremes only", () => {
    assert.equal(urgencyLabel(2), "critical");
    assert.equal(urgencyLabel(0), "low");
    assert.equal(urgencyLabel(1), undefined);
  });
});
