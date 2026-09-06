# Govee Lights

Control Govee LAN lights through the `gvl` CLI: power, brightness, color, temperature, modes, sleep/wake schedules.

## What it does

- **Govee Lights** — panels for control, color, temperature, modes, schedules
- **Toggle Lights** — live On/Off + color subtitle (10s poll)

Uses `~/.config/gvl/config.yaml`. Optional Direct LAN preference (`--url local`) skips `gvld` (modes/schedules need `gvld`).

## External tools

- `gvl` CLI on `PATH`, or `$HOME/go/bin/gvl`, or `$HOME/.local/bin/gvl`, or the `gvlPath` preference
- Optional `gvld` for animated modes and schedules

## Privilege

Current user. Talks to lights on the LAN. No sudo.

## Tests

```bash
cd gvl && npm test
```
