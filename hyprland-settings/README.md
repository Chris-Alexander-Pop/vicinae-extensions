# Hyprland Settings

Runtime Hyprland toggles via `hyprctl eval` (Lua `hl.config` / `hl.device`), persisted across reload and login.

## What it does

- Animations, touchscreen, blur, shadows, software cursors
- TrackPoint enable/disable: device name from `VICINAE_TRACKPOINT_DEVICE` or the first `hyprctl devices` mouse whose name looks like a TrackPoint (`trackpoint`, `track-point`, or `tpps/`)
- Loaded plugins, as their own sections. `hyprctl plugin list` decides what shows up.

Plugins this extension knows how to edit:

| Loaded name | Section | What you can change |
|---|---|---|
| `dynamic-cursors` | Dynamic cursors | Mode, tilt, stretch, rotate, shake-to-find, hyprcursor |
| `hyprgrass` | Hyprgrass | Sensitivity, long-press, edge margin, border resize |
| `Hypr-DarkWindow` | Dark Window | Which built-in shaders load, plus a saved shade per window class or title |
| `hyprglass` | Hyprglass | Theme, preset, blur, refraction, tint, layer glass |
| `hyprwinwrap` | Hyprwinwrap | Background window class, size, and position |
| `virtual-desktops` | Virtual desktops | Names, cycling, layout memory, monitor order |
| `HyprCapture` | HyprCapture | Capture mode, save path, clipboard, recording |
| `hyprexpo` | Hyprexpo | Grid, gaps, gesture, labels, keyboard nav |
| `hypr3d` | Hypr3D | Room, window scale, movement, map. Applied with `hl.plugin.hypr3d.config` |
| `Hyprspace` | Hyprspace | Overview bar size, cards, gestures, colors |
| `hymission` | Hymission | Layout, padding, strip, labels, backdrop |
| `GloView` | GloView | Tile layout, strip, workspaces, labels |

Hypr3D does not register `hyprctl` options. Its rows call `hl.plugin.hypr3d.config`, and the value shown is the one saved here.

A loaded plugin that is not in that table still shows up, with its name and description. Each plugin has a **Loaded** row. Off unloads it and writes the `.so` path to `vicinae-plugins.lua`. A hook at the top of `hyprland.lua` skips `hl.plugin.load` for that path, including when your config passes a different string with the same file name, so a reload does not bring it back. On loads it again. A `plugin =` line in `hyprland.conf` is not covered. The path comes from the running Hyprland process. If none or more than one library matches, that switch stays unavailable.

Changing an option applies it with `hyprctl eval` and writes it into the persist snippet. **Save current values** stores every readable option for that plugin. **Forget saved overrides** drops them. When the plugin only reads that option on a config reload, Hyprland is reloaded so the change shows up.

Cursor mode, tilt, stretch, rotate, and Dark Window's shader list are in that group. Cursor mode also writes a clientside shape rule for the same mode. A clientside rule of `none` in your own config would otherwise hide the mode inside most apps.

Gesture binds, other shape rules, and hyprglass preset tables stay in your Hyprland config. Those are not config values.

Dark Window shades are the exception. Window shades lists open windows. Saved shades lists every shade you already made, so you can change the shader, the class, or the title. Each one is a named `hl.window_rule` in the generated Lua file. A title shade wins over a class shade for that window. Saving reloads Hyprland when the plugin is loaded and `hyprland.lua` is the config, so the rule is what the compositor is using. Tint and chromakey have to be included in Shaders to load.

## Persistence

After install, Hyprland loads the generated snippet last so saved toggles survive `hyprctl reload` and login.

- **Install Persist Hook** (root search) or the **Setup** row in Hyprland Settings
- Overrides: `$XDG_CONFIG_HOME/vicinae/hyprland-settings/state.json`
- Generated Lua: `$XDG_CONFIG_HOME/hypr/vicinae-settings.lua` (when `hyprland.lua` exists)
- Generated hyprlang: `$XDG_CONFIG_HOME/hypr/vicinae-settings.conf` (when only `hyprland.conf` exists)
- Plugins left off: `$XDG_CONFIG_HOME/hypr/vicinae-plugins.lua`, plus a `vicinae-plugin-switch` hook at the top of `hyprland.lua`

The installer appends a short load hook to `hyprland.lua` or `hyprland.conf`. It does not replace the rest of your config. Toggling a setting, or changing a plugin option, also installs the hook if it is missing.

Saved plugin options are wrapped in `if hl.plugin.<name> then` in the generated Lua file, so a reload does not error when that plugin is not loaded. The hyprlang file has no equivalent guard.

Opening Hyprland Settings re-applies saved values if Hyprland was reloaded without that hook.

## External tools

- Hyprland with `/usr/bin/hyprctl`
- A Hyprland build that accepts Lua `hyprctl eval` (legacy `hyprctl keyword` is not used)

## Privilege

Current user. Talks to the running compositor; no sudo.

## Tests

```bash
cd hyprland-settings && npm test
```
