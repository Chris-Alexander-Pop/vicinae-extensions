import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parsePluginList } from "../src/hyprctl";
import {
  dropPluginValues,
  mergePluginValues,
  parsePersistState,
  readPersistState,
  upsertPersistedSetting,
} from "../src/persist";
import {
  PLUGIN_CATALOG,
  formatPluginValue,
  groupLoaded,
  liveToPersist,
  normalizeColor,
  parseFieldInput,
  pluginFieldLua,
  pluginHyprlangChunks,
  pluginLuaChunks,
  stepped,
} from "../src/plugins";
import { hyprlangFromState, luaFromState } from "../src/settings";

describe("plugin catalog", () => {
  it("covers the known plugins and keeps option paths safe", () => {
    const ids = PLUGIN_CATALOG.map((catalog) => catalog.id);
    assert.deepEqual(ids, [
      "dynamic-cursors",
      "hyprgrass",
      "darkwindow",
      "hyprglass",
      "hyprwinwrap",
      "virtual-desktops",
      "hyprcapture",
      "hyprexpo",
      "hypr3d",
      "hyprspace",
      "hymission",
      "gloview",
    ]);

    const options = new Set<string>();
    for (const catalog of PLUGIN_CATALOG) {
      assert.match(catalog.luaName, /^[A-Za-z_][A-Za-z0-9_]*$/);
      for (const field of catalog.fields) {
        assert.equal(options.has(field.option), false);
        options.add(field.option);
        assert.match(
          field.option,
          /^plugin:[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)+$/,
        );
        assert.equal(field.option.split(":")[1], catalog.luaName);
        assert.equal(field.fallback.kind, field.kind);
        if (catalog.id === "hypr3d") assert.ok(field.hypr3d);
        parseFieldInput(field, draftOf(field));
      }
    }
  });

  it("writes Hypr3D through hl.plugin.hypr3d.config", () => {
    const grid = PLUGIN_CATALOG.find((catalog) => catalog.id === "hypr3d")?.fields.find(
      (field) => field.option === "plugin:hypr3d:world_grid",
    );
    assert.ok(grid);
    assert.equal(
      pluginFieldLua(grid, { kind: "bool", value: false }),
      "hl.plugin.hypr3d.config({ world = { grid = false } })",
    );
    const lua = pluginLuaChunks({
      "plugin:hypr3d:move_speed": { kind: "float", value: 6 },
    }).join("\n");
    assert.match(lua, /if hl\.plugin\.hypr3d then/);
    assert.match(lua, /hl\.plugin\.hypr3d\.config\(\{ player = \{ move_speed = 6 \} \}\)/);
    assert.deepEqual(
      pluginHyprlangChunks({
        "plugin:hypr3d:move_speed": { kind: "float", value: 6 },
      }),
      [],
    );
  });
});

function draftOf(field: (typeof PLUGIN_CATALOG)[number]["fields"][number]): string {
  const value = field.fallback;
  return value.kind === "bool" ? (value.value ? "true" : "false") : String(value.value);
}

describe("groupLoaded", () => {
  it("matches list names and leaves unknown plugins alone", () => {
    const grouped = groupLoaded([
      {
        name: "hyprgrass",
        author: "horriblename",
        version: "0.3",
        description: "Touchscreen gestures",
      },
      {
        name: "some-other-plugin",
        author: "ada",
        version: "1",
        description: "Uncatalogued",
      },
      {
        name: "Hypr-DarkWindow",
        author: "micha4w",
        version: "5.5.0",
        description: "Shaders",
      },
    ]);
    assert.deepEqual(
      grouped.known.map((entry) => entry.catalog.id),
      ["hyprgrass", "darkwindow"],
    );
    assert.equal(grouped.unknown.length, 1);
    assert.equal(grouped.unknown[0]?.name, "some-other-plugin");
  });
});

describe("plugin values", () => {
  it("reads colors from signed and unsigned ints", () => {
    const tint = PLUGIN_CATALOG.find((c) => c.id === "hyprglass")?.fields.find(
      (field) => field.option === "plugin:hyprglass:tint_color",
    );
    assert.ok(tint);
    assert.equal(normalizeColor("#8899AA22"), "0x8899aa22");
    assert.equal(
      liveToPersist(tint, { kind: "int", value: 0x8899aa22 }).value,
      "0x8899aa22",
    );
    // Hyprland may report a color as a signed 32-bit int.
    const signed = 0x8899aa22 | 0;
    assert.equal(signed < 0, true);
    assert.equal(
      liveToPersist(tint, { kind: "int", value: signed }).value,
      "0x8899aa22",
    );
    assert.throws(() => normalizeColor("8899aa"), /8 hex digits/);
  });

  it("steps and rejects out-of-range input", () => {
    const base = PLUGIN_CATALOG.find((c) => c.id === "dynamic-cursors")?.fields.find(
      (field) => field.option === "plugin:dynamic_cursors:shake:base",
    );
    assert.ok(base);
    assert.deepEqual(stepped(base, { kind: "float", value: 4 }, 1), {
      kind: "float",
      value: 4.5,
    });
    assert.deepEqual(stepped(base, { kind: "float", value: 20 }, 1), {
      kind: "float",
      value: 20,
    });
    assert.throws(
      () => parseFieldInput(base, "40"),
      /maximum is 20/,
    );
  });

  it("labels enum values and keeps an empty shader list", () => {
    const mode = PLUGIN_CATALOG.find((c) => c.id === "dynamic-cursors")?.fields.find(
      (field) => field.option === "plugin:dynamic_cursors:mode",
    );
    const shaders = PLUGIN_CATALOG.find((c) => c.id === "darkwindow")?.fields.find(
      (field) => field.option === "plugin:darkwindow:load_shaders",
    );
    assert.ok(mode && shaders);
    assert.equal(
      formatPluginValue(mode, { kind: "string", value: "stretch" }),
      "Stretch",
    );
    assert.deepEqual(parseFieldInput(shaders, ""), {
      kind: "string",
      value: "",
    });
    assert.equal(
      formatPluginValue(shaders, { kind: "string", value: "" }),
      "None",
    );
  });
});

describe("generated plugin config", () => {
  it("guards lua with hl.plugin and quotes strings", () => {
    const plugins = {
      "plugin:dynamic_cursors:mode": { kind: "string" as const, value: "tilt" },
      "plugin:dynamic_cursors:shake:enabled": {
        kind: "bool" as const,
        value: true,
      },
      "plugin:dynamic_cursors:mode-bad": { kind: "bool" as const, value: true },
    };
    const lua = pluginLuaChunks(plugins).join("\n");
    assert.match(lua, /if hl\.plugin\.dynamic_cursors then/);
    assert.match(
      lua,
      /hl\.config\(\{ plugin = \{ dynamic_cursors = \{ mode = "tilt" \} \} \}\)/,
    );
    assert.match(
      lua,
      /hl\.config\(\{ plugin = \{ dynamic_cursors = \{ shake = \{ enabled = true \} \} \} \}\)/,
    );
    assert.match(
      lua,
      /hl\.plugin\.dynamic_cursors\.shape_rule\(\{ shape = "clientside", mode = "tilt" \}\)/,
    );
    assert.equal(lua.includes("hyprglass"), false);
    assert.equal(lua.includes("mode-bad"), false);

    const mismatched = pluginLuaChunks({
      "plugin:dynamic_cursors:mode": { kind: "bool", value: true },
    });
    assert.deepEqual(mismatched, []);

    const shakeOnly = pluginLuaChunks({
      "plugin:dynamic_cursors:shake:enabled": { kind: "bool", value: false },
    }).join("\n");
    assert.equal(shakeOnly.includes("shape_rule"), false);

    const mode = PLUGIN_CATALOG.find((c) => c.id === "dynamic-cursors")?.fields.find(
      (field) => field.option === "plugin:dynamic_cursors:mode",
    );
    const shake = PLUGIN_CATALOG.find((c) => c.id === "dynamic-cursors")?.fields.find(
      (field) => field.option === "plugin:dynamic_cursors:shake:enabled",
    );
    const shaders = PLUGIN_CATALOG.find((c) => c.id === "darkwindow")?.fields.find(
      (field) => field.option === "plugin:darkwindow:load_shaders",
    );
    assert.equal(mode?.needsReload, true);
    assert.equal(shake?.needsReload, undefined);
    assert.equal(shaders?.needsReload, true);
  });

  it("emits hyprlang blocks and threads them through the settings file", () => {
    const plugins = {
      "plugin:darkwindow:load_shaders": {
        kind: "string" as const,
        value: "invert,tint",
      },
      "plugin:hyprglass:tint_color": {
        kind: "color" as const,
        value: "0x8899aa22",
      },
    };
    const conf = pluginHyprlangChunks(plugins).join("\n");
    assert.match(conf, /load_shaders = "invert,tint"/);
    assert.match(conf, /tint_color = 0x8899aa22/);
    assert.equal(conf.includes('"0x'), false);

    const lua = luaFromState({
      version: 1,
      settings: { animations: { enabled: false } },
      plugins,
      disabledPlugins: {},
      darkWindows: {},
    });
    assert.match(lua, /animations = \{ enabled = false \}/);
    assert.match(lua, /if hl\.plugin\.darkwindow then/);
    assert.match(lua, /if hl\.plugin\.hyprglass then/);

    const rendered = hyprlangFromState({
      version: 1,
      settings: {},
      plugins,
      disabledPlugins: {},
      darkWindows: {},
    });
    assert.match(rendered, /load_shaders = "invert,tint"/);
  });
});

describe("plugin persist", () => {
  it("keeps plugin overrides when a compositor toggle is saved", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vicinae-plugin-"));
    const prevHome = process.env.HOME;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = dir;
    process.env.XDG_CONFIG_HOME = join(dir, "config");
    try {
      mergePluginValues({
        "plugin:hyprgrass:sensitivity": { kind: "float", value: 4 },
        "plugin:not-a-real-option": { kind: "bool", value: true },
      });
      const state = upsertPersistedSetting("animations", { enabled: false });
      assert.equal(state.settings.animations?.enabled, false);
      assert.deepEqual(state.plugins["plugin:hyprgrass:sensitivity"], {
        kind: "float",
        value: 4,
      });
      assert.equal(state.plugins["plugin:not-a-real-option"], undefined);

      const dropped = dropPluginValues(["plugin:hyprgrass:sensitivity"]);
      assert.equal(dropped.plugins["plugin:hyprgrass:sensitivity"], undefined);
      assert.equal(dropped.settings.animations?.enabled, false);
      assert.deepEqual(readPersistState().plugins, {});
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
    }
  });

  it("drops malformed plugin rows", () => {
    const state = parsePersistState({
      version: 1,
      settings: {},
      plugins: {
        "plugin:hyprglass:enabled": { kind: "bool", value: false },
        "plugin:hyprglass:tint_color": { kind: "color", value: "red" },
        "plugin:hyprglass:blur_strength": { kind: "float", value: 1.5 },
      },
    });
    assert.deepEqual(state.plugins["plugin:hyprglass:enabled"], {
      kind: "bool",
      value: false,
    });
    assert.equal(state.plugins["plugin:hyprglass:tint_color"], undefined);
    assert.deepEqual(state.plugins["plugin:hyprglass:blur_strength"], {
      kind: "float",
      value: 1.5,
    });
  });
});

describe("parsePluginList", () => {
  it("reads the hyprctl json list and treats the empty message as none", () => {
    assert.deepEqual(parsePluginList("no plugins loaded"), []);
    assert.deepEqual(parsePluginList("[]"), []);
    assert.deepEqual(
      parsePluginList(
        '[{"name":"hyprglass","author":"hyprnux","version":"0.1","description":"glass"}]',
      ),
      [
        {
          name: "hyprglass",
          author: "hyprnux",
          version: "0.1",
          description: "glass",
        },
      ],
    );
    assert.throws(() => parsePluginList("{"), /Could not parse plugin list/);
  });
});
