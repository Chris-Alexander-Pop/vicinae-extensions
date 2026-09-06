# Vicinae extensions

[Vicinae](https://vicinae.com) extensions for Arch / Hyprland. MIT licensed (`LICENSE`). Each extension has `npm test`.

Passwordless sudo installers and GUI sudo askpass helpers live under `*/private/` and are listed in `STORE-EXCLUDE.txt`. Do not copy those into a `vicinaehq/extensions` pull request.

## Extensions

| Extension | Command(s) | Notes |
|---|---|---|
| [`todo/`](todo/) | Todo, Todo Reminders | Ordered queue + priorities; desktop pings at HH:MM |
| [`brightness/`](brightness/) | Set Brightness | `brightnessctl` |
| [`bluetooth-power/`](bluetooth-power/) | Toggle Bluetooth | BlueZ D-Bus + `rfkill`; 30s subtitle |
| [`hyprland-settings/`](hyprland-settings/) | Hyprland Settings | Toggles via `hyprctl eval` (Lua); persisted in `vicinae-settings.lua` |
| [`topgrade/`](topgrade/) | Topgrade | Background run + live tracker + retry |
| [`antivirus/`](antivirus/) | Antivirus, Antivirus Status | ClamAV full/quick/path, history, resume, rkhunter |
| [`packages/`](packages/) | Packages | Pacman + AUR browse/search/install/update/uninstall |
| [`power-profiles/`](power-profiles/) | Select Power Profile, Boost App Priority | TLP profiles; boost helper is private-only |
| [`gvl/`](gvl/) | Govee Lights, Toggle Lights | `gvl` CLI |

## Requirements

- Node.js ≥ 26 locally (CI uses Node 24 for unit tests)
- Vicinae running
- Per-extension system tools (see each README)

## Develop / install (local)

```bash
cd brightness   # or any other extension directory
npm install
npm test
npm run build   # installs to ~/.local/share/vicinae/extensions/<name>
```

### Machine-local helpers

```bash
bash topgrade/scripts/install-runner.sh
sudo bash power-profiles/private/install-boost-permissions.sh
```

See each extension README for tools, privilege, and what must not be copied into a store submission.
