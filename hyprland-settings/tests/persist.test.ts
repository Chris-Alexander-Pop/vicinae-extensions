import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  detectEntrypoint,
  ensureHyprlandHook,
  HOOK_MARKER,
  hookBlock,
  installPersistHook,
  parsePersistState,
  persistPaths,
  readPersistState,
  readSetupStatus,
  renderLuaFile,
  upsertPersistedSetting,
  withHyprlandConfHook,
  withHyprlandHook,
  writeGeneratedLua,
} from "../src/persist";
import {
  hyprlangFromState,
  luaFromState,
  luaForPersisted,
  SETTINGS,
  stateFromLive,
} from "../src/settings";

describe("parsePersistState", () => {
  it("keeps boolean overrides and device names", () => {
    const state = parsePersistState({
      version: 1,
      settings: {
        animations: { enabled: false },
        trackpoint: { enabled: true, deviceName: "tpps/2-elan-trackpoint" },
        skip: { enabled: "yes" },
      },
    });
    assert.deepEqual(state.settings.animations, { enabled: false });
    assert.deepEqual(state.settings.trackpoint, {
      enabled: true,
      deviceName: "tpps/2-elan-trackpoint",
    });
    assert.equal(state.settings.skip, undefined);
  });

  it("returns empty settings for junk", () => {
    assert.deepEqual(parsePersistState(null).settings, {});
    assert.deepEqual(parsePersistState("nope").settings, {});
  });
});

describe("renderLuaFile / luaFromState", () => {
  it("emits a comment-only file when nothing is saved", () => {
    const lua = renderLuaFile([]);
    assert.match(lua, /No overrides yet/);
    assert.equal(
      luaFromState({
        version: 1,
        settings: {},
        plugins: {},
        disabledPlugins: {},
        darkWindows: {},
      }),
      lua,
    );
  });

  it("emits hl.config / hl.device for saved toggles", () => {
    const lua = luaFromState({
      version: 1,
      plugins: {},
      disabledPlugins: {},
      darkWindows: {},
      settings: {
        animations: { enabled: false },
        "software-cursors": { enabled: true },
        trackpoint: {
          enabled: true,
          deviceName: "tpps/2-elan-trackpoint",
        },
      },
    });
    assert.match(
      lua,
      /hl\.config\(\{ animations = \{ enabled = false \} \}\)/,
    );
    assert.match(
      lua,
      /hl\.config\(\{ cursor = \{ no_hardware_cursors = 1 \} \}\)/,
    );
    assert.match(
      lua,
      /hl\.device\(\{ name = "tpps\/2-elan-trackpoint", enabled = true \}\)/,
    );
  });

  it("emits hyprlang blocks for conf-based Hyprland", () => {
    const conf = hyprlangFromState({
      version: 1,
      plugins: {},
      disabledPlugins: {},
      darkWindows: {},
      settings: {
        animations: { enabled: false },
        trackpoint: {
          enabled: false,
          deviceName: "tpps/2-elan-trackpoint",
        },
      },
    });
    assert.match(conf, /animations \{\n    enabled = false\n\}/);
    assert.match(
      conf,
      /device \{\n    name = tpps\/2-elan-trackpoint\n    enabled = false\n\}/,
    );
  });

  it("snapshots live list items into persist state", () => {
    const animations = SETTINGS.find((s) => s.id === "animations");
    const trackpoint = SETTINGS.find((s) => s.id === "trackpoint");
    assert.ok(animations && trackpoint);
    const state = stateFromLive([
      { ...animations, enabled: false },
      {
        ...trackpoint,
        enabled: true,
        deviceName: "tpps/2-elan-trackpoint",
      },
    ]);
    assert.deepEqual(state.settings.animations, { enabled: false });
    assert.deepEqual(state.settings.trackpoint, {
      enabled: true,
      deviceName: "tpps/2-elan-trackpoint",
    });
  });

  it("skips device overrides that have no name", () => {
    const trackpoint = SETTINGS.find((s) => s.id === "trackpoint");
    assert.ok(trackpoint);
    assert.equal(
      luaForPersisted(trackpoint, { enabled: true }),
      undefined,
    );
  });
});

describe("hyprland.lua hook", () => {
  it("appends the dofile block once", () => {
    const once = withHyprlandHook("-- stub\ndofile('aura')\n");
    assert.ok(once.includes(HOOK_MARKER));
    assert.equal(withHyprlandHook(once), once);
    assert.match(hookBlock(), /vicinae-settings\.lua/);
    const confHook = withHyprlandConfHook("# base\n", "/tmp/vicinae-settings.conf");
    assert.ok(confHook.includes("source = /tmp/vicinae-settings.conf"));
    assert.equal(
      withHyprlandConfHook(confHook, "/tmp/other.conf"),
      confHook,
    );
  });

  it("patches an existing hyprland.lua under XDG_CONFIG_HOME", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vicinae-hypr-"));
    const prevHome = process.env.HOME;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = dir;
    process.env.XDG_CONFIG_HOME = join(dir, "config");
    try {
      const paths = persistPaths();
      await mkdir(join(paths.hyprlandLuaPath, ".."), { recursive: true });
      await writeFile(paths.hyprlandLuaPath, "-- entry\n", "utf8");

      assert.equal(ensureHyprlandHook(), true);
      assert.equal(ensureHyprlandHook(), false);
      const body = await readFile(paths.hyprlandLuaPath, "utf8");
      assert.ok(body.startsWith("-- entry"));
      assert.ok(body.includes("pcall(dofile"));
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
    }
  });

  it("sources vicinae-settings.conf from hyprland.conf when lua is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vicinae-hypr-"));
    const prevHome = process.env.HOME;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = dir;
    process.env.XDG_CONFIG_HOME = join(dir, "config");
    try {
      const paths = persistPaths();
      await mkdir(join(paths.hyprlandConfPath, ".."), { recursive: true });
      await writeFile(paths.hyprlandConfPath, "# hyprlang\n", "utf8");

      assert.equal(detectEntrypoint().kind, "conf");
      const result = installPersistHook();
      assert.equal(result.kind, "conf");
      assert.equal(result.changed, true);
      const body = await readFile(paths.hyprlandConfPath, "utf8");
      assert.ok(body.includes(`source = ${paths.confPath}`));
      assert.ok(body.includes(HOOK_MARKER));

      const status = readSetupStatus();
      assert.equal(status.entrypoint, "conf");
      assert.equal(status.hookInstalled, true);
      assert.equal(status.ready, false);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
    }
  });
});

describe("persist files", () => {
  it("writes state.json and generated lua", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vicinae-hypr-"));
    const prevHome = process.env.HOME;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = dir;
    process.env.XDG_CONFIG_HOME = join(dir, "config");
    try {
      const state = upsertPersistedSetting("blur", { enabled: true });
      writeGeneratedLua(luaFromState(state));

      const paths = persistPaths();
      const saved = readPersistState();
      assert.deepEqual(saved.settings.blur, { enabled: true });
      const lua = await readFile(paths.luaPath, "utf8");
      assert.match(
        lua,
        /hl\.config\(\{ decoration = \{ blur = \{ enabled = true \} \} \}\)/,
      );
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
    }
  });
});
