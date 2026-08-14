# Local Vicinae Extensions

Private local-only [Vicinae](https://vicinae.com) extensions for this machine.

## Extensions

| Extension | Command(s) | Notes |
|---|---|---|
| [`brightness/`](brightness/) | Set Brightness | `brightnessctl` |
| [`gvl/`](gvl/) | Govee Lights, Toggle Lights | `gvl` CLI (LAN lights + gvld schedules); live subtitle on Toggle Lights |
| [`bluetooth-power/`](bluetooth-power/) | Toggle Bluetooth | BlueZ D-Bus + `rfkill` for status (no `bluetoothctl` on poll); 30s refresh |
| [`hyprland-settings/`](hyprland-settings/) | Hyprland Settings | Runtime toggles via `hyprctl eval` (Lua): animations, touchscreen, blur, shadows, software cursors, TrackPoint |
| [`packages/`](packages/) | Packages | Pacman + AUR: browse / search / install / update / uninstall + live log |
| [`power-profiles/`](power-profiles/) | Select Power Profile, Boost App Priority | TLP profiles + `renice`/`ionice` via helper |
| [`topgrade/`](topgrade/) | Topgrade | Background run + live tracker + recent-run history |
| [`vpn/`](vpn/) | VPN, VPN Status | Dynamic registry: auto NM vpn/wireguard + user OpenVPN/OpenConnect; multi-up, priority, app allowlists |

## Requirements

- Node.js ≥ 26
- Vicinae running
- Per-extension system tools (`brightnessctl`, `tlp`, `hyprctl`, etc.)

## Develop / install (local)

```bash
cd brightness   # or power-profiles / hyprland-settings / …
npm install
npm run build   # installs to ~/.local/share/vicinae/extensions/<name>
# or: npm run dev
```

### Hyprland settings

Runtime toggles only (lost on `hyprctl reload` / logout). Uses Lua `hyprctl eval` because this machine’s Hyprland build rejects legacy `hyprctl keyword`.

```bash
cd hyprland-settings && npm install && npm run build
```

Search **Hyprland Settings** in Vicinae. Enter toggles animations / touchscreen / blur / shadows / software cursors / TrackPoint.

### App boost (power-profiles)

One-time passwordless helper (already installed on this host if you ran it):

```bash
sudo bash power-profiles/scripts/install-boost-permissions.sh
```

### Topgrade runner

One-time user install (no root):

```bash
bash topgrade/scripts/install-runner.sh
cd topgrade && npm install && npm run build
```

Then search **Topgrade** in Vicinae, authorize sudo once, and track progress (survives closing the launcher). Failed runs appear under **Recent runs**; use **Retry Failed** to re-run only the failed steps (skips steps disabled in `topgrade.toml`).

### Installed packages

Uses `pacman` / `yay` / `checkupdates`. Update and uninstall reuse the Topgrade sudo helpers (`vicinae-sudo-prompt`); install those once if missing:

```bash
bash topgrade/scripts/install-runner.sh
cd packages && npm install && npm run build
```

Search **Packages** in Vicinae. Use the mode dropdown for **Installed** vs **Search & Install**. Critical packages (base system, kernels, Hyprland, etc.) cannot be uninstalled; add more via the extension preference.

### VPN

Auto-lists NetworkManager `vpn` / `wireguard` connections and lets you add OpenVPN (`.ovpn`) or OpenConnect entries. Multiple tunnels can be up at once:

- **Priority** (higher wins) picks which *general* VPN owns the default route
- **App allowlist** (optional) split-tunnels matching apps via cgroup/fwmark (use **Run shell via this VPN** or launch under the helper cgroup)

Overlay metadata lives in `~/.config/vicinae/vpn/connections.json` (no secrets). Credentials use `secret-tool` (`application=vicinae` by default). Privileged ops: `/usr/local/bin/vicinae-vpn` (needs `jq`, `nft`).

```bash
# one-time (re-run after helper updates)
sudo bash vpn/scripts/install-permissions.sh
cd vpn && npm install && npm run build
```

Search **VPN** in Vicinae. **VPN Status** refreshes the live subtitle every 10s.

### Govee lights

Wraps the `gvl` CLI (Govee LAN + optional `gvld` schedules). Uses `~/.config/gvl/config.yaml`.

```bash
cd gvl && npm install && npm run build
```

Search **Govee Lights**. **Toggle Lights** shows live power/color as the command subtitle (polls every 10s). Ctrl+1–6 switch panels; Ctrl+T toggles; Ctrl+↑/↓ nudge brightness. On a schedule: Ctrl+K skips the next fire only; Ctrl+O edits that occurrence (time, count, look) without changing the recurring 07:00 / bedtime.


