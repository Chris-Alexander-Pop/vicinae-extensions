# Power Profiles

Switch TLP profiles and optionally boost the CPU/I/O priority of an open Hyprland app.

## What it does

- **Select Power Profile** — `performance` / `balanced` / `power-saver` via `tlp`
- **Boost App Priority** — `renice`/`ionice` through `/usr/local/bin/vicinae-boost-app`

## External tools

- `tlp` and `tlp-stat`
- Hyprland (`hyprctl clients`) for the boost picker
- Optional private helper: `power-profiles/bin/vicinae-boost-app`

## Privilege

Profile switch runs `sudo tlp <profile>` (works with an existing NOPASSWD rule; otherwise sudo/polkit must prompt). This extension does **not** install sudoers from the store-facing tree.

App boost's passwordless installer is **private-only**: `power-profiles/private/install-boost-permissions.sh`. Do not copy `private/` into a store PR. Store already has `power-profile`.

## Tests

```bash
cd power-profiles && npm test
```
