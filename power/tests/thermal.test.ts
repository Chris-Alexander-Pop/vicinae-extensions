import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAllowedTarget,
  parseFanControlEnabled,
  parseFanLevel,
  parsePackageMilli,
  parseTargetCelsius,
  parseTurbo,
} from "../src/thermal";

describe("parseTurbo", () => {
  it("maps no_turbo 0 and 1", () => {
    assert.equal(parseTurbo("0\n"), "on");
    assert.equal(parseTurbo("1"), "off");
    assert.equal(parseTurbo(" 0 "), "on");
  });

  it("rejects anything else", () => {
    assert.equal(parseTurbo(""), null);
    assert.equal(parseTurbo("2"), null);
    assert.equal(parseTurbo("on"), null);
  });
});

describe("parseFanLevel", () => {
  it("reads auto and full-speed", () => {
    const proc = "status:\t\tenabled\nspeed:\t\t4400\nlevel:\t\tauto\n";
    assert.deepEqual(parseFanLevel(proc), { mode: "auto", level: "auto" });
    assert.deepEqual(parseFanLevel("level:\t\tdisengaged\n"), {
      mode: "max",
      level: "disengaged",
    });
    assert.deepEqual(parseFanLevel("level: full-speed"), {
      mode: "max",
      level: "full-speed",
    });
  });

  it("keeps a numeric level as other", () => {
    assert.deepEqual(parseFanLevel("level:\t\t7\n"), {
      mode: "other",
      level: "7",
    });
    assert.equal(parseFanLevel("status:\tenabled\n"), null);
  });
});

describe("parseTargetCelsius", () => {
  it("reads a whole-degree package target", () => {
    const xml = "<TripPoint><Temperature>75000</Temperature></TripPoint>";
    assert.equal(parseTargetCelsius(xml), 75);
    assert.equal(parseTargetCelsius("<Temperature> 65000 </Temperature>"), 65);
  });

  it("rejects missing, fractional, and out-of-range values", () => {
    assert.equal(parseTargetCelsius(""), null);
    assert.equal(parseTargetCelsius("<Temperature>75500</Temperature>"), null);
    assert.equal(parseTargetCelsius("<Temperature>40000</Temperature>"), null);
    assert.equal(parseTargetCelsius("<Temperature>110000</Temperature>"), null);
    assert.equal(isAllowedTarget(75), true);
    assert.equal(isAllowedTarget(75.5), false);
    assert.equal(isAllowedTarget(54), false);
  });
});

describe("parsePackageMilli", () => {
  it("accepts a sane millidegree reading", () => {
    assert.equal(parsePackageMilli("80000\n"), 80000);
    assert.equal(parsePackageMilli("nope"), null);
    assert.equal(parsePackageMilli("-1"), null);
  });
});

describe("parseFanControlEnabled", () => {
  it("accepts Y and 1", () => {
    assert.equal(parseFanControlEnabled("Y\n"), true);
    assert.equal(parseFanControlEnabled("1"), true);
    assert.equal(parseFanControlEnabled("N"), false);
    assert.equal(parseFanControlEnabled("0"), false);
  });
});
