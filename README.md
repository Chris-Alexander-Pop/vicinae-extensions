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
| [`todo/`](todo/) | Todo, Todo Reminders | Ordered queue + priorities; desktop pings at HH:MM (`~/.config/vicinae/todo/todos.json`) |
| [`internships/`](internships/) | Internships, Internship Watch | SpeedyApply SWE internships: unviewed pile + listings; apply / skip (`~/.config/vicinae/internships/state.json`) |
| [`vpn/`](vpn/) | VPN, VPN Status | Import `.conf`/`.ovpn`/OpenConnect profiles; auto NM vpn/wireguard; multi-up, priority, app allowlists |
| [`antivirus/`](antivirus/) | Antivirus, Antivirus Status | ClamAV full/quick/path scans, history, resume, hits, rkhunter |

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

**Import config file** (Ctrl+N) opens a WireGuard `.conf`, OpenVPN `.ovpn`/`.conf`, or OpenConnect XML/profile and adds it. WireGuard files are imported into NetworkManager; OpenVPN/OpenConnect keep a path to the file. Existing NetworkManager `vpn` / `wireguard` connections are listed automatically. Multiple tunnels can be up at once:

- **Priority** (higher wins) picks which *general* VPN owns the default route
- **App allowlist** (optional) split-tunnels matching apps via cgroup/fwmark (use **Run shell via this VPN** or launch under the helper cgroup)
- **Connect on login** is off for imported NetworkManager profiles (WireGuard/OpenVPN). Toggle it per connection if you really want the tunnel at boot — full-tunnel home WG with a hostname endpoint races wifi/DNS and blackholes the internet until you bounce it
- **Delete** (Ctrl+Backspace) disconnects and removes the connection; NetworkManager profiles are deleted, not just hidden

Overlay metadata lives in `~/.config/vicinae/vpn/connections.json` (no secrets). Credentials use `secret-tool` (`application=vicinae` by default). Privileged ops: `/usr/local/bin/vicinae-vpn` (needs `jq`, `nft`).

```bash
# one-time (re-run after helper updates)
sudo bash vpn/scripts/install-permissions.sh
cd vpn && npm install && npm run build
```

Search **VPN** in Vicinae. **VPN Status** refreshes the live subtitle every 10s.

### Antivirus

Wraps the host ClamAV + Fangfrisch + rkhunter setup (`/usr/local/bin/av-scan`, `av-update`, `clamd`). Home scans skip the trees that previously ran for a day (Android SDK, Trash, Podman, caches, Steam, …).

```bash
cd antivirus && npm install && npm run build
sudo install -m 755 antivirus/scripts/av-scan /usr/local/bin/av-scan
```

Search **Antivirus** in Vicinae.

- **Scan Home (full)** Ctrl+S — entire `$HOME` with excludes
- **Quick scan** Ctrl+Q — Downloads, Desktop, `/tmp`
- **Scan a path** Ctrl+P — file picker
- **Resume** Ctrl+G — continue after Stop, shutdown, or crash (checkpoint in `~/.local/state/clamav/`)
- **Hits** Ctrl+I — open folder, copy path, quarantine, ignore path/signature
- **History** Ctrl+H — every run (done + interrupted), with log/hits/resume
- **Update signatures** Ctrl+U · **rkhunter** Ctrl+K

**Antivirus Status** polls every 15s (`41% · ETA 26m`, `Resume 41%`, or `Clean`) and can desktop-notify when a scan finishes or is interrupted (preference).

State files: `progress.json`, `history.json`, `filelist-<id>.nul`, `ignore.json`, `quarantine/`.

### Govee lights

Wraps the `gvl` CLI (Govee LAN + optional `gvld` schedules). Uses `~/.config/gvl/config.yaml`.

```bash
cd gvl && npm install && npm run build
```

Search **Govee Lights**. **Toggle Lights** shows live power/color as the command subtitle (polls every 10s). Ctrl+1–6 switch panels; Ctrl+T toggles; Ctrl+↑/↓ nudge brightness. On a schedule: Ctrl+K skips the next fire only; Ctrl+O edits that occurrence (time, count, look) without changing the recurring 07:00 / bedtime.

### Todo

Ordered local queue for batch work. Items live in `~/.config/vicinae/todo/todos.json`.

```bash
cd todo && npm install && npm run build
```

Search **Todo**. Ctrl+N adds; Enter / Ctrl+T checks off (unchecked items go to the bottom of the queue); Ctrl+E edits; Ctrl+↑ / Ctrl+↓ reorder within Queue or Done; Ctrl+Backspace deletes.

On add/edit: set **priority** (queue sorts urgent → none, then manual order) and a **reminder** time (`HH:MM` local). Once = ping today; Daily = every day until done. If the time already passed when Vicinae starts, it waits the **boot delay** (default 60s) then pings.

Background command **Todo Reminders** polls every 30s and uses `sendDesktopNotification`. Run it from search to ping immediately (skips boot delay). Knobs live in extension preferences (Notifications, boot delay, session gap, re-notify interval, min priority, add-form defaults). **Notification Settings** from the Todo list opens that pane.

### Internships

SpeedyApply SWE internships ([2027-SWE-College-Jobs](https://github.com/speedyapply/2027-SWE-College-Jobs)). First sync seeds today’s USA + international internships into **Listings** (newest first). Later arrivals go to **Unviewed**. State: `~/.config/vicinae/internships/state.json`.

```bash
cd internships && npm install && npm run build
```

Search **Internships**. Dropdown / Ctrl+1–4: Unviewed, Listings, Applied, Skipped. **Ctrl+U** keeps US & Canada (default); Ctrl+Shift+U shows every region. Ctrl+F / Ctrl+Q / Ctrl+O / Ctrl+0 filter FAANG+, Quant, Other, or all. Ctrl+N newest first; Ctrl+G groups FAANG+ then Quant then Other (newest within each). Enter opens the posting and marks **Applied**; Ctrl+S skips; Ctrl+Z undoes; Ctrl+R refreshes. Extension preferences: **Lists** (USA / International / Both) and desktop notifications when Unviewed grows. **Internship Watch** polls every 15m and shows the new count as the command subtitle.




