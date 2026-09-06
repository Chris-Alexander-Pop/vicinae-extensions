import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  looksLikeTrackpoint,
  luaConfigAssignment,
  luaDeviceEnabled,
  hyprlangConfigAssignment,
  hyprlangDeviceEnabled,
} from "../src/hyprctl";
import { statusLabel } from "../src/settings";

describe("luaConfigAssignment", () => {
  it("nests a dotted option into hl.config", () => {
    assert.equal(
      luaConfigAssignment("animations:enabled", "true"),
      "hl.config({ animations = { enabled = true } })",
    );
    assert.equal(
      luaConfigAssignment("decoration:blur:enabled", "false"),
      "hl.config({ decoration = { blur = { enabled = false } } })",
    );
  });

  it("rejects empty or invalid option segments", () => {
    assert.throws(() => luaConfigAssignment("", "true"), /Invalid option path/);
    assert.throws(
      () => luaConfigAssignment("animations:enabled-flag", "true"),
      /Invalid option segment/,
    );
  });
});

describe("luaDeviceEnabled", () => {
  it("quotes the device name and bool", () => {
    assert.equal(
      luaDeviceEnabled("tpps/2-elan-trackpoint", false),
      'hl.device({ name = "tpps/2-elan-trackpoint", enabled = false })',
    );
  });

  it("escapes quotes in the device name", () => {
    assert.equal(
      luaDeviceEnabled('weird"name', true),
      'hl.device({ name = "weird\\"name", enabled = true })',
    );
  });
});

describe("hyprlangConfigAssignment", () => {
  it("nests a dotted option into hyprlang blocks", () => {
    assert.equal(
      hyprlangConfigAssignment("animations:enabled", "true"),
      "animations {\n    enabled = true\n}",
    );
    assert.equal(
      hyprlangConfigAssignment("decoration:blur:enabled", "false"),
      "decoration {\n    blur {\n        enabled = false\n    }\n}",
    );
  });
});

describe("hyprlangDeviceEnabled", () => {
  it("emits a device block", () => {
    assert.equal(
      hyprlangDeviceEnabled("tpps/2-elan-trackpoint", false),
      "device {\n    name = tpps/2-elan-trackpoint\n    enabled = false\n}",
    );
  });
});

describe("looksLikeTrackpoint", () => {
  it("matches TrackPoint names without a ThinkPad hardcode", () => {
    assert.equal(looksLikeTrackpoint("tpps/2-generic-stick"), true);
    assert.equal(looksLikeTrackpoint("USB TrackPoint"), true);
    assert.equal(looksLikeTrackpoint("track-point-mouse"), true);
    assert.equal(looksLikeTrackpoint("logitech-usb-mouse"), false);
  });
});

describe("statusLabel", () => {
  it("formats on/off", () => {
    assert.equal(statusLabel(true), "On");
    assert.equal(statusLabel(false), "Off");
  });
});
