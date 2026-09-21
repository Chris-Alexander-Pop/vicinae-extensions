import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adaptDndPrefs,
  adaptMutedApps,
  adaptNotificationList,
  DEFAULT_DND,
} from "../src/types";

describe("adaptDndPrefs", () => {
  it("falls back when the payload is missing", () => {
    assert.deepEqual(adaptDndPrefs(null), DEFAULT_DND);
  });

  it("reads sidecar snake_case fields", () => {
    assert.deepEqual(
      adaptDndPrefs({
        enabled: true,
        schedule_enabled: true,
        start_time: "21:30",
        end_time: "06:00",
        weekdays_only: false,
      }),
      {
        enabled: true,
        schedule_enabled: true,
        start_time: "21:30",
        end_time: "06:00",
        weekdays_only: false,
      },
    );
  });
});

describe("adaptNotificationList", () => {
  it("skips junk rows and keeps actions", () => {
    const items = adaptNotificationList([
      { id: "nope" },
      {
        id: 3,
        app_name: "Slack",
        summary: "Hello",
        body: "World",
        urgency: 2,
        timestamp: 1700000000,
        actions: [{ key: "ok", label: "OK" }, { key: 1 }],
      },
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.id, 3);
    assert.deepEqual(items[0]?.actions, [{ key: "ok", label: "OK" }]);
  });

  it("returns an empty list for a non-array", () => {
    assert.deepEqual(adaptNotificationList({ items: [] }), []);
  });
});

describe("adaptMutedApps", () => {
  it("reads rules.muted_apps", () => {
    assert.deepEqual(adaptMutedApps({ muted_apps: ["Slack", 1, "Mail"] }), [
      "Slack",
      "Mail",
    ]);
    assert.deepEqual(adaptMutedApps(null), []);
  });
});
