# Hyprland Settings

Runtime Hyprland toggles via `hyprctl eval` (Lua `hl.config` / `hl.device`), persisted across reload and login.

## What it does

- Animations, touchscreen, blur, shadows, software cursors
- TrackPoint enable/disable: device name from `VICINAE_TRACKPOINT_DEVICE` or the first `hyprctl devices` mouse whose name looks like a TrackPoint (`trackpoint`, `track-point`, or `tpps/`)

Each toggle is applied immediately and saved. The first time you open the command, current compositor values for these toggles are saved so a reload does not drop this session.

## Persistence

After install, Hyprland loads the generated snippet last so saved toggles survive `hyprctl reload` and login.

- **Install Persist Hook** (root search) or the **Setup** row in Hyprland Settings
- Overrides: `$XDG_CONFIG_HOME/vicinae/hyprland-settings/state.json`
- Generated Lua: `$XDG_CONFIG_HOME/hypr/vicinae-settings.lua` (when `hyprland.lua` exists)
- Generated hyprlang: `$XDG_CONFIG_HOME/hypr/vicinae-settings.conf` (when only `hyprland.conf` exists)

The installer appends a short load hook to `hyprland.lua` or `hyprland.conf`. It does not replace the rest of your config. Toggling a setting also installs the hook if it is missing.

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
