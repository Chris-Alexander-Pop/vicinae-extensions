# Hyprland Settings

Runtime Hyprland toggles via `hyprctl eval` (Lua `hl.config` / `hl.device`).

## What it does

- Animations, touchscreen, blur, shadows, software cursors
- TrackPoint enable/disable: device name from `VICINAE_TRACKPOINT_DEVICE` or the first `hyprctl devices` mouse whose name looks like a TrackPoint (`trackpoint`, `track-point`, or `tpps/`)

Toggles are runtime-only (lost on `hyprctl reload` / logout).

## External tools

- Hyprland with `/usr/bin/hyprctl`
- A Hyprland build that accepts Lua `hyprctl eval` (legacy `hyprctl keyword` is not used)

## Privilege

Current user. Talks to the running compositor; no sudo.

## Tests

```bash
cd hyprland-settings && npm test
```
