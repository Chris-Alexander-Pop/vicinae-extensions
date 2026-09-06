import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampPercent,
  parseBrightnessctlInfo,
  parseStepPercent,
} from "../src/brightnessctl";

describe("parseBrightnessctlInfo", () => {
  it("parses machine-readable brightnessctl info", () => {
    const info = parseBrightnessctlInfo("intel_backlight,backlight,48000,50%,96000");
    assert.equal(info.device, "intel_backlight");
    assert.equal(info.className, "backlight");
    assert.equal(info.current, 48000);
    assert.equal(info.percent, 50);
    assert.equal(info.max, 96000);
  });

  it("does not throw on a truncated brightnessctl line", () => {
    const info = parseBrightnessctlInfo("only-device");
    assert.equal(info.device, "only-device");
  });
});

describe("clampPercent / parseStepPercent", () => {
  it("clamps and rounds percents", () => {
    assert.equal(clampPercent(-4), 0);
    assert.equal(clampPercent(140.2), 100);
    assert.equal(clampPercent(33.4), 33);
  });

  it("parses step size with a sane fallback", () => {
    assert.equal(parseStepPercent("10"), 10);
    assert.equal(parseStepPercent("0"), 5);
    assert.equal(parseStepPercent("nope", 7), 7);
    assert.equal(parseStepPercent("999"), 50);
  });
});
