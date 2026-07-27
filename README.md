# Local Vicinae Extensions

Private local-only [Vicinae](https://vicinae.com) extensions for this machine.

## Extensions

| Extension | Command(s) | Notes |
|---|---|---|
| [`brightness/`](brightness/) | Set Brightness | `brightnessctl` |
| [`bluetooth-power/`](bluetooth-power/) | Toggle Bluetooth | `bluetoothctl` + `rfkill`; live On/Off subtitle (10s refresh) |
| [`hyprland-settings/`](hyprland-settings/) | Hyprland Settings | Runtime toggles via `hyprctl eval` (Lua): animations, touchscreen, blur, shadows, software cursors, TrackPoint |
| [`packages/`](packages/) | Packages | Pacman + AUR: browse / search / install / update / uninstall + live log |
| [`power-profiles/`](power-profiles/) | Select Power Profile, Boost App Priority | TLP profiles + `renice`/`ionice` via helper |
| [`topgrade/`](topgrade/) | Topgrade | Background run + live step/log tracker |
| [`vpn/`](vpn/) | VPN, VPN Status | Home OpenVPN + `home.ovpn`, Surfshark `ca-tor`, Campus OpenConnect + Duo `push` (sudoers helper) |

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

Then search **Topgrade** in Vicinae, enter your sudo password once, and track progress (survives closing the launcher).

### Installed packages

Uses `pacman` / `yay` / `checkupdates`. Update and uninstall reuse the Topgrade sudo helpers (`vicinae-sudo-prompt`); install those once if missing:

```bash
bash topgrade/scripts/install-runner.sh
cd packages && npm install && npm run build
```

Search **Packages** in Vicinae. Use the mode dropdown for **Installed** vs **Search & Install**. Critical packages (base system, kernels, Hyprland, etc.) cannot be uninstalled; add more via the extension preference.

### VPN

Profiles: Home (OpenVPN), Surfshark (NetworkManager WireGuard), Campus (OpenConnect + Duo `push`). Privileged ops go through `/usr/local/bin/vicinae-vpn` (sudoers).

Place the home OpenVPN config at `~/.config/vicinae/vpn/home.ovpn` (or set `VICINAE_HOME_OVPN`). Secrets live in the user keyring via `secret-tool` (`application=vicinae` by default — change in extension preferences if needed).

```bash
# one-time
sudo bash vpn/scripts/install-permissions.sh
cd vpn && npm install && npm run build
```

Search **VPN** in Vicinae. Home/Campus prompt for credentials the first time. **VPN Status** refreshes the live subtitle every 10s.


