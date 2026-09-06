import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  criticalReason,
  isCriticalPackage,
  kernelPackagesFromUname,
  parseExtraCritical,
} from "../src/critical";

describe("kernelPackagesFromUname", () => {
  it("derives the running kernel package from the release string", () => {
    const flavor = "zen";
    assert.deepEqual(kernelPackagesFromUname(`6.16.4-${flavor}1-1-${flavor}`), [
      `linux-${flavor}`,
    ]);
    assert.deepEqual(kernelPackagesFromUname("6.12.1-lts"), ["linux-lts"]);
    assert.deepEqual(kernelPackagesFromUname("6.8.0-generic"), ["linux"]);
  });
});

describe("parseExtraCritical", () => {
  it("splits comma/whitespace lists", () => {
    assert.deepEqual(parseExtraCritical("foo, bar baz"), ["foo", "bar", "baz"]);
    assert.deepEqual(parseExtraCritical("  "), []);
    assert.deepEqual(parseExtraCritical(undefined), []);
  });
});

describe("isCriticalPackage", () => {
  it("protects base packages and preference extras", () => {
    const prev = process.env.VICINAE_KERNEL_PACKAGE;
    process.env.VICINAE_KERNEL_PACKAGE = "linux-testflavor";
    try {
      assert.equal(isCriticalPackage("glibc"), true);
      assert.equal(isCriticalPackage("htop"), false);
      assert.equal(isCriticalPackage("my-meta", ["my-meta"]), true);
      assert.match(criticalReason("base") ?? "", /base system/);
      assert.match(criticalReason("my-meta", ["my-meta"]) ?? "", /Extra critical/);
      assert.equal(criticalReason("htop"), null);
    } finally {
      if (prev === undefined) delete process.env.VICINAE_KERNEL_PACKAGE;
      else process.env.VICINAE_KERNEL_PACKAGE = prev;
    }
  });
});
