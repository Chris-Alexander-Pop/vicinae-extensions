import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTlpProfile,
  normalizeProfile,
  profileDescription,
  profileLabel,
} from "../src/tlp";

describe("normalizeProfile", () => {
  it("maps TLP aliases onto the three profiles", () => {
    assert.equal(normalizeProfile("performance"), "performance");
    assert.equal(normalizeProfile("AC"), "performance");
    assert.equal(normalizeProfile("balanced"), "balanced");
    assert.equal(normalizeProfile("bat"), "balanced");
    assert.equal(normalizeProfile("power-saver"), "power-saver");
    assert.equal(normalizeProfile("powersaver"), "power-saver");
    assert.equal(normalizeProfile("performance / foo"), "performance");
  });

  it("rejects unknown text", () => {
    assert.equal(normalizeProfile(""), null);
    assert.equal(normalizeProfile("turbo"), null);
  });
});

describe("labels", () => {
  it("labels and describes known profiles", () => {
    assert.equal(isTlpProfile("balanced"), true);
    assert.equal(isTlpProfile("turbo"), false);
    assert.equal(profileLabel("power-saver"), "Power saver");
    assert.match(profileDescription("performance"), /performance/);
  });
});
