# Notifications

Aura inbox, do-not-disturb, and quiet hours from Vicinae.

## What it does

- **Toggle DND** — flips sidecar `Notifications.SetDnd`. Background poll (30s) puts On / Off / Quiet Hours on the command subtitle
- **Notifications** — inbox list, dismiss, invoke actions, mute/unmute apps, toggle schedule, edit quiet-hour times

Talks to `ags-sidecar` on loopback (`POST /api/Notifications.*` with `X-Aura-Token`), then `swaync-client -dn` / `-df`. Sidecar prefs alone do not hide banners.

## External tools

- Aura sidecar (`ags-sidecar` listening on `127.0.0.1:9080`)
- `/usr/bin/swaync-client` (Hyprland notification daemon)
- Token from `$AURA_HTTP_TOKEN`, then `$XDG_RUNTIME_DIR/aura-http-token`, then `GET /api/meta`

## Privilege

Current user. Loopback HTTP only.

## Tests

```bash
cd notifications && npm test
```
