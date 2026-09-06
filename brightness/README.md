# Brightness

Set display brightness through `brightnessctl`.

## What it does

- Pick a percent, or nudge with Ctrl+↑ / Ctrl+↓
- Optional device name in extension preferences (empty = `brightnessctl` default)

## External tools

- [`brightnessctl`](https://github.com/Hummer12007/brightnessctl) on `PATH`

udev backlight access is whatever the distro already configured for your user. This extension does not install sudoers rules.

## Privilege

Runs `brightnessctl` as the current user.

## Tests

```bash
cd brightness && npm test
```
