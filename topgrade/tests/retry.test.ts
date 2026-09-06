import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildRetryPlan,
  canRetry,
  collectFailedSteps,
} from "../src/retry";

describe("buildRetryPlan", () => {
  it("maps failure labels onto --only step ids", () => {
    const plan = buildRetryPlan(["System update", "Visual Studio Code extensions", "uv"]);
    assert.deepEqual(plan.only, ["system", "vscode", "uv"]);
    assert.deepEqual(plan.unmatched, []);
    assert.equal(canRetry(["System update"]), true);
  });

  it("records unmatched labels instead of inventing a step", () => {
    const plan = buildRetryPlan(["not-a-real-topgrade-step", ""]);
    assert.deepEqual(plan.only, []);
    assert.deepEqual(plan.unmatched, ["not-a-real-topgrade-step"]);
    assert.match(plan.summary, /unmapped/);
    assert.equal(canRetry(["not-a-real-topgrade-step"]), false);
  });

  it("skips steps disabled in topgrade.toml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vicinae-topgrade-"));
    await writeFile(
      join(dir, "topgrade.toml"),
      'disable = ["system"]\n',
      "utf8",
    );
    const prev = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = dir;
    try {
      const plan = buildRetryPlan(["system update", "firmware"]);
      assert.deepEqual(plan.only, ["firmware"]);
      assert.equal(plan.unmatched.includes("system update"), false);
    } finally {
      if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prev;
    }
  });
});

describe("collectFailedSteps", () => {
  it("collects failed steps from status, log, and error text", () => {
    const names = collectFailedSteps(
      {
        steps: [
          { name: "system", status: "failed" },
          { name: "uv", status: "success" },
        ],
        error: "Failed: rustup, cargo",
      },
      "vim: FAILED\n",
    );
    assert.deepEqual(names, ["system", "vim", "rustup", "cargo"]);
  });

  it("handles missing status", () => {
    assert.deepEqual(collectFailedSteps(null), []);
  });
});
