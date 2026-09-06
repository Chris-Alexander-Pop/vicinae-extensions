# Bluetooth Power

Toggle the BlueZ adapter and show On/Off as the command subtitle.

## What it does

- Background poll (30s) reads adapter power via D-Bus/`rfkill` (not `bluetoothctl` on the poll path)
- Interactive run flips power

## External tools

- BlueZ (`org.bluez` on the system bus)
- `/usr/bin/rfkill`
- `/usr/bin/busctl`
- `/usr/bin/bluetoothctl` only as a last-resort fallback

## Privilege

Current user. Hardware/BIOS rfkill hard-blocks cannot be overridden from here.

## Tests

```bash
cd bluetooth-power && npm test
```
