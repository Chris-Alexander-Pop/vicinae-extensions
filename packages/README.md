# Packages

Browse, search, install, update, and uninstall Pacman/AUR packages.

## What it does

- Installed list + Arch/AUR search (debounced, cancellable)
- Live operation log
- Uninstall guard: Arch `base` deps, extra essentials, the **running** kernel package (from `pacman -Qqo /usr/lib/modules/$(uname -r)`, `VICINAE_KERNEL_PACKAGE`, or the uname flavor), plus a preference list

## External tools

- `pacman`, `checkupdates`
- AUR helper on `PATH` (`yay` or equivalent as used by the operations code)

## Privilege

Install/update/uninstall need root. On this machine they call `~/.local/bin/vicinae-sudo-prompt` from `topgrade/private/` (not for the store). A store copy should omit those helpers and use interactive sudo/polkit the same way other Arch package extensions do.

The store already has `arch-packages` and `pacman-updates`. Do not submit this as a new extension without a written delta (or a PR into those).

## Tests

```bash
cd packages && npm test
```
