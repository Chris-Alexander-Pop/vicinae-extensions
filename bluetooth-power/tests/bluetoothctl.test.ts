import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatStatus, parseRfkill } from "../src/bluetoothctl";

describe("parseRfkill", () => {
  it("detects soft and hard blocks", () => {
    assert.deepEqual(
      parseRfkill("Soft blocked: yes\nHard blocked: no\n"),
      { softBlocked: true, hardBlocked: false },
    );
    assert.deepEqual(
      parseRfkill("Soft blocked: no\nHard blocked: yes\n"),
      { softBlocked: false, hardBlocked: true },
    );
  });

  it("treats missing rfkill text as unblocked", () => {
    assert.deepEqual(parseRfkill(""), { softBlocked: false, hardBlocked: false });
    assert.deepEqual(parseRfkill("not rfkill output"), {
      softBlocked: false,
      hardBlocked: false,
    });
  });
});

describe("formatStatus", () => {
  it("labels power and block states", () => {
    assert.equal(formatStatus({ powered: true, softBlocked: false, hardBlocked: false }), "Bluetooth On");
    assert.equal(formatStatus({ powered: false, softBlocked: false, hardBlocked: false }), "Bluetooth Off");
    assert.equal(formatStatus({ powered: false, softBlocked: true, hardBlocked: false }), "Bluetooth Soft-blocked");
    assert.equal(formatStatus({ powered: true, softBlocked: false, hardBlocked: true }), "Bluetooth Hard-blocked");
  });
});
