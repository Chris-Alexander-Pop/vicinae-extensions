import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  HOOK_MARKER,
  ensurePluginSwitchHook,
  parsePersistState,
  persistPaths,
  upsertPersistedSetting,
  writeDisabledPlugins,
} from "../src/persist";
import {
  PLUGIN_SWITCH_MARKER,
  isSafePluginPath,
  matchPluginPaths,
  pidFromLock,
  pluginKey,
  pluginSwitchHookBlock,
  renderDisabledPluginsLua,
  shouldSkipPluginPath,
  soPathsFromMaps,
  withPluginSwitchHook,
} from "../src/plugin-switch";

const MAPS = [
  "7f000-7f111 r-xp 00000000 08:01 1 /usr/lib/libc.so.6",
  "7f200-7f211 r-xp 00000000 08:01 2 /opt/out/hypr-dynamic-cursors.so",
  "7f300-7f311 r-xp 00000000 08:01 3 /opt/out/hyprgrass.so",
  "7f400-7f411 r-xp 00000000 08:01 4 /opt/out/hyprglass.so",
  "7f500-7f511 r-xp 00000000 08:01 5 /opt/My Plugins/Hypr-DarkWindow.so (deleted)",
  "7f600-7f611 r-xp 00000000 08:01 6 /opt/out/screen-shadow-omit.so",
  "7f700-7f711 r-xp 00000000 08:01 7 /usr/bin/Hyprland",
].join("\n");

describe("plugin path matching", () => {
  it("pairs loaded names with one .so and ignores libc", () => {
    const paths = soPathsFromMaps(MAPS);
    assert.ok(paths.includes("/opt/My Plugins/Hypr-DarkWindow.so"));
    assert.equal(paths.includes("/usr/bin/Hyprland"), false);
    assert.equal(paths.filter((path) => path.endsWith("libc.so.6")).length, 1);

    const matched = matchPluginPaths(
      [
        "dynamic-cursors",
        "hyprgrass",
        "hyprglass",
        "Hypr-DarkWindow",
        "screen-shadow-omit",
      ],
      paths,
    );
    assert.equal(matched["dynamic-cursors"], "/opt/out/hypr-dynamic-cursors.so");
    assert.equal(matched.hyprgrass, "/opt/out/hyprgrass.so");
    assert.equal(matched.hyprglass, "/opt/out/hyprglass.so");
    assert.equal(matched["screen-shadow-omit"], "/opt/out/screen-shadow-omit.so");
    assert.equal(
      matched["Hypr-DarkWindow"],
      null,
      "spaces in the path cannot be passed to hyprctl",
    );
    assert.notEqual(pluginKey("hyprgrass"), pluginKey("hyprglass"));
  });

  it("leaves a name unset when two libraries match", () => {
    const matched = matchPluginPaths(
      ["hyprgrass"],
      ["/opt/a/hyprgrass.so", "/opt/b/Hyprgrass.so"],
    );
    assert.equal(matched.hyprgrass, null);
  });

  it("reads a pid from the lock file", () => {
    assert.equal(pidFromLock("4242\nwayland-1\n"), 4242);
    assert.equal(pidFromLock("nope\n"), null);
    assert.equal(pidFromLock("0\n"), null);
  });
});

describe("plugin load skip", () => {
  it("skips an exact path or the only file with that name", () => {
    const skipped = ["/real/hyprgrass.so", "/opt/hyprglass.so"];
    assert.equal(shouldSkipPluginPath("/real/hyprgrass.so", skipped), true);
    assert.equal(shouldSkipPluginPath("/cfg/hyprgrass.so", skipped), true);
    assert.equal(shouldSkipPluginPath("/opt/hyprglass.so", skipped), true);
    assert.equal(shouldSkipPluginPath("/other/hyprgrass-extra.so", skipped), false);

    const both = ["/a/hyprgrass.so", "/b/hyprgrass.so"];
    assert.equal(shouldSkipPluginPath("/a/hyprgrass.so", both), true);
    assert.equal(shouldSkipPluginPath("/cfg/hyprgrass.so", both), false);
  });

  it("renders a lua table and prepends a hook that is not the settings hook", () => {
    const lua = renderDisabledPluginsLua({
      "/opt/out/hyprgrass.so": { path: "/opt/out/hyprgrass.so" },
      "/tmp/nope.txt": { path: "/tmp/nope.txt" },
    });
    assert.match(lua, /\["\/opt\/out\/hyprgrass.so"\] = true/);
    assert.equal(lua.includes("nope.txt"), false);
    assert.equal(isSafePluginPath("/tmp/nope.txt"), false);

    const settings = `-- ${HOOK_MARKER}\ndofile("aura")\n`;
    const hooked = withPluginSwitchHook(settings);
    assert.ok(hooked.startsWith(`-- ${PLUGIN_SWITCH_MARKER}`));
    assert.ok(hooked.includes('dofile("aura")'));
    assert.equal(withPluginSwitchHook(hooked), hooked);
    assert.equal(HOOK_MARKER.includes(PLUGIN_SWITCH_MARKER), false);
    assert.equal(pluginSwitchHookBlock().includes(HOOK_MARKER), false);
  });

  it("keeps a turned-off plugin across a settings save", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vicinae-switch-"));
    const prevHome = process.env.HOME;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = dir;
    process.env.XDG_CONFIG_HOME = join(dir, "config");
    try {
      const row = {
        name: "hyprgrass",
        path: "/opt/out/hyprgrass.so",
        description: "gestures",
        author: "horriblename",
        version: "0.3",
      };
      writeDisabledPlugins({ [row.path]: row });
      const saved = upsertPersistedSetting("blur", { enabled: true });
      assert.deepEqual(saved.disabledPlugins[row.path], row);
      assert.equal(parsePersistState({ disabledPlugins: { "/tmp/x": { name: "x", path: "/tmp/x" } } }).disabledPlugins["/tmp/x"], undefined);

      const paths = persistPaths();
      await mkdir(join(paths.hyprlandLuaPath, ".."), { recursive: true });
      await writeFile(paths.hyprlandLuaPath, "-- entry\n", "utf8");
      assert.equal(ensurePluginSwitchHook(), true);
      assert.equal(ensurePluginSwitchHook(), false);
      const body = await readFile(paths.hyprlandLuaPath, "utf8");
      assert.ok(body.startsWith(`-- ${PLUGIN_SWITCH_MARKER}`));
      assert.ok(body.includes("-- entry"));
      const skip = await readFile(paths.pluginsLuaPath, "utf8");
      assert.match(skip, /hyprgrass\.so/);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
    }
  });
});

function luaBin(): string | null {
  for (const bin of ["lua", "luajit", "lua5.4", "lua5.3"]) {
    const found = spawnSync(bin, ["-v"], { encoding: "utf8" });
    if (found.status === 0) return bin;
  }
  return null;
}

describe("plugin switch hook lua", () => {
  it("skips the same paths as shouldSkipPluginPath", async () => {
    const bin = luaBin();
    if (!bin) return;

    const dir = await mkdtemp(join(tmpdir(), "vicinae-switch-lua-"));
    const xdg = join(dir, "config");
    await mkdir(join(xdg, "hypr"), { recursive: true });
    await writeFile(
      join(xdg, "hypr", "vicinae-plugins.lua"),
      renderDisabledPluginsLua({
        "/real/hyprgrass.so": { path: "/real/hyprgrass.so" },
      }),
      "utf8",
    );

    const script = `
hl = { plugin = {} }
local calls = {}
function hl.plugin.load(path)
  calls[#calls + 1] = path
end
${pluginSwitchHookBlock()}
hl.plugin.load("/real/hyprgrass.so")
hl.plugin.load("/cfg/hyprgrass.so")
hl.plugin.load("/opt/hyprglass.so")
for _, path in ipairs(calls) do
  io.write(path)
  io.write(string.char(10))
end
`;
    const ran = spawnSync(bin, ["-e", script], {
      encoding: "utf8",
      env: { ...process.env, HOME: dir, XDG_CONFIG_HOME: xdg },
    });
    assert.equal(ran.status, 0, ran.stderr);
    assert.deepEqual(
      ran.stdout.trim().split("\n").filter(Boolean),
      ["/opt/hyprglass.so"],
    );
    assert.equal(shouldSkipPluginPath("/cfg/hyprgrass.so", ["/real/hyprgrass.so"]), true);
    assert.equal(shouldSkipPluginPath("/opt/hyprglass.so", ["/real/hyprgrass.so"]), false);
  });
});
