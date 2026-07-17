# Local Vicinae Extensions

Private local-only [Vicinae](https://vicinae.com) extensions for this machine.

## Extensions

| Extension | Command(s) | Notes |
|---|---|---|
| [`brightness/`](brightness/) | Set Brightness | `brightnessctl` |
| [`power-profiles/`](power-profiles/) | Select Power Profile, Boost App Priority | TLP profiles + `renice`/`ionice` via helper |

## Requirements

- Node.js ≥ 26
- Vicinae running
- Per-extension system tools (`brightnessctl`, `tlp`, `hyprctl`, etc.)

## Develop / install (local)

```bash
cd brightness   # or power-profiles
npm install
npm run build   # installs to ~/.local/share/vicinae/extensions/<name>
# or: npm run dev
```

### App boost (power-profiles)

One-time passwordless helper (already installed on this host if you ran it):

```bash
sudo bash power-profiles/scripts/install-boost-permissions.sh
```
