import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clamp,
  colorsEqual,
  namedColorFor,
  nearestPreset,
  parseStepPercent,
  rgbHex,
} from "../src/presets";
import {
  daysPreset,
  formatDays,
  formatStatusLine,
  isOn,
  parseConfigShow,
  parseStatus,
} from "../src/status";

describe("color helpers", () => {
  it("formats and matches named colors", () => {
    assert.equal(rgbHex({ r: 255, g: 0, b: 0 }), "#ff0000");
    assert.equal(namedColorFor({ r: 255, g: 0, b: 0 }), "red");
    assert.equal(namedColorFor({ r: 1, g: 2, b: 3 }), undefined);
    assert.equal(colorsEqual({ r: 1, g: 2, b: 3 }, { r: 1, g: 2, b: 3 }), true);
  });

  it("clamps, steps, and picks nearest brightness presets", () => {
    assert.equal(clamp(120, 0, 100), 100);
    assert.equal(parseStepPercent("0"), 5);
    assert.equal(nearestPreset(47), 50);
    assert.equal(nearestPreset(1), 1);
  });
});

describe("status formatting", () => {
  it("parses LAN status JSON-ish objects", () => {
    const status = parseStatus({
      onOff: 1,
      brightness: 80,
      color: { r: 255, g: 0, b: 0 },
      colorTemInKelvin: 0,
    });
    assert.equal(isOn(status), true);
    assert.equal(formatStatusLine(status), "On · 80% · red");
  });

  it("treats malformed status as off/black", () => {
    const status = parseStatus("nope");
    assert.equal(isOn(status), false);
    assert.equal(status.brightness, 0);
  });

  it("labels schedule days", () => {
    assert.equal(formatDays(["mon", "tue", "wed", "thu", "fri"]), "weekdays");
    assert.equal(daysPreset(["sat", "sun"]), "weekend");
    assert.equal(daysPreset(undefined), "everyday");
    assert.equal(daysPreset(["mon"]), "custom");
  });

  it("parses gvl config show text", () => {
    const cfg = parseConfigShow("path: /usr/bin/gvl\nurl: local\ntoken: ***\naddress: 192.0.2.10\n");
    assert.equal(cfg.url, "local");
    assert.equal(cfg.tokenSet, false);
    assert.equal(cfg.address, "192.0.2.10");
  });
});
