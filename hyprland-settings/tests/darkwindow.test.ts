import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  blankShade,
  darkWindowLuaChunk,
  darkWindowRuleName,
  newDarkWindowId,
  normalizeDarkWindow,
  orderedShades,
  parseClients,
  parseColor,
  shadeForWindow,
  shadeShaderLoaded,
  shaderSpec,
  type DarkWindowConfig,
} from "../src/darkwindow";
import {
  dropPluginValues,
  parsePersistState,
  readPersistState,
  writeDarkWindows,
} from "../src/persist";
import { luaFromState } from "../src/settings";

function shade(patch: Partial<DarkWindowConfig> = {}): DarkWindowConfig {
  return normalizeDarkWindow({
    ...blankShade(),
    id: "dw0123456789ab",
    name: "Firefox",
    className: "firefox",
    ...patch,
  });
}

describe("dark window shades", () => {
  it("builds shader strings the plugin can parse", () => {
    assert.equal(shaderSpec(shade({ shader: "invert" })), "invert");
    assert.equal(
      shaderSpec(
        shade({
          shader: "tint",
          tintColor: [1, 0, 0],
          tintStrength: 0.1,
        }),
      ),
      "tint tintColor=[1 0 0] tintStrength=0.1",
    );
    assert.equal(
      shaderSpec(
        shade({
          shader: "chromakey",
          bkg: [0, 0, 0],
          similarity: 0.1,
          amount: 1.4,
          targetOpacity: 0.83,
        }),
      ),
      "chromakey bkg=[0 0 0] similarity=0.1 amount=1.4 targetOpacity=0.83",
    );
  });

  it("accepts hex colors and rejects channels above 1", () => {
    assert.deepEqual(parseColor("#ff0000"), [1, 0, 0]);
    assert.deepEqual(parseColor("0 0.5 1"), [0, 0.5, 1]);
    assert.throws(() => parseColor("2 0 0"), /0 to 1/);
  });

  it("prefers a title shade over a class shade", () => {
    const general = shade({ id: "dw0123456789ab", title: "" });
    const titled = shade({
      id: "dwabcdefabcdef",
      title: "Mozilla Firefox",
      name: "Firefox title",
    });
    const other = shade({
      id: "dw111111111111",
      className: "kitty",
      name: "Kitty",
    });
    assert.equal(
      shadeForWindow([general, titled, other], {
        className: "firefox",
        title: "Mozilla Firefox",
      })?.id,
      titled.id,
    );
    assert.equal(
      shadeForWindow([general, titled], {
        className: "firefox",
        title: "Other tab",
      })?.id,
      general.id,
    );
    assert.equal(
      shadeForWindow([general], { className: "kitty", title: "x" }),
      undefined,
    );
  });

  it("emits class rules before title rules and escapes match text", () => {
    const general = shade({
      id: "dw0123456789ab",
      className: "org.mozilla.firefox",
      title: "",
    });
    const titled = shade({
      id: "dwabcdefabcdef",
      className: "org.mozilla.firefox",
      title: 'say "hi"',
      shader: "invert",
    });
    const chunk = darkWindowLuaChunk(orderedShades([titled, general]));
    assert.ok(chunk);
    const generalAt = chunk.indexOf(darkWindowRuleName(general.id));
    const titledAt = chunk.indexOf(darkWindowRuleName(titled.id));
    assert.ok(generalAt !== -1 && titledAt !== -1 && generalAt < titledAt);
    assert.ok(chunk.includes('class = "^org\\\\.mozilla\\\\.firefox$"'));
    assert.ok(chunk.includes('title = "^say \\"hi\\"$"'));
    assert.ok(chunk.includes('["darkwindow:shade"] = "invert"'));
    assert.equal(darkWindowLuaChunk([{ ...shade(), className: "" }]), undefined);
  });

  it("checks shaders to load", () => {
    assert.equal(shadeShaderLoaded("tint", undefined), true);
    assert.equal(shadeShaderLoaded("tint", "all"), true);
    assert.equal(shadeShaderLoaded("tint", "invert, tint"), true);
    assert.equal(shadeShaderLoaded("chromakey", "invert"), false);
    assert.equal(shadeShaderLoaded("invert", ""), false);
  });

  it("parses clients and drops a bad saved shade", () => {
    const windows = parseClients(
      JSON.stringify([
        {
          address: "0xabc",
          class: "firefox",
          title: "One",
          workspace: { name: "1" },
        },
        { class: "skip-me" },
      ]),
    );
    assert.deepEqual(windows, [
      {
        address: "0xabc",
        className: "firefox",
        title: "One",
        workspace: "1",
      },
    ]);
    assert.deepEqual(parseClients("no open windows"), []);

    const id = newDarkWindowId();
    const state = parsePersistState({
      darkWindows: {
        [id]: shade({ id, name: "Kept" }),
        other: { id: "nope", name: "Bad" },
      },
    });
    assert.equal(state.darkWindows[id]?.name, "Kept");
    assert.equal(state.darkWindows.other, undefined);
    assert.throws(() => normalizeDarkWindow(shade({ name: "" })), /Name this shade/);
  });

  it("keeps shades when a plugin option is dropped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vicinae-shade-"));
    const prevHome = process.env.HOME;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = dir;
    process.env.XDG_CONFIG_HOME = join(dir, "config");
    try {
      const config = shade();
      writeDarkWindows({ [config.id]: config });
      const dropped = dropPluginValues(["plugin:hyprgrass:sensitivity"]);
      assert.equal(dropped.darkWindows[config.id]?.className, "firefox");
      const lua = luaFromState(readPersistState());
      assert.match(lua, /hl\.window_rule/);
      assert.match(lua, new RegExp(config.id));
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
    }
  });
});
