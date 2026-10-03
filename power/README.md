# Power

Switch TLP profiles, set a thermald package-temperature target, toggle CPU turbo and ThinkPad fan speed, and optionally boost the CPU/I/O priority of an open Hyprland app.

## What it does

- **Power** — `performance` / `balanced` / `power-saver` via `tlp`
- **Package target** — writes `/etc/thermald/thermal-conf.xml` and restarts `thermald`. A passive trip on `x86_pkg_temp` steps the RAPL power limit (12W to 45W), then `intel_pstate`, once the package reaches that temperature. That costs clock speed. Whole degrees from 55 to 95. Default on first install is 75.
- **thermald on/off** — `systemctl enable --now` or `disable --now`. Off stops the daemon (it restores the RAPL limits it changed) and leaves it disabled across reboot. The saved target is still there when you turn it back on. Setting a target also turns it on.
- **CPU turbo** — writes `0` or `1` to `/sys/devices/system/cpu/intel_pstate/no_turbo`
- **Fan speed** — writes `level auto` or `level full-speed` to `/proc/acpi/ibm/fan`
- **Boost App Priority** — `renice`/`ionice` through `/usr/local/bin/vicinae-boost-app`

## External tools

- `tlp` and `tlp-stat`
- `thermald`
- Hyprland (`hyprctl clients`) for the boost picker
- Optional private helpers: `power/bin/vicinae-boost-app`, `power/bin/vicinae-thermal`

## Privilege

Profile switch runs `sudo tlp <profile>` (works with an existing NOPASSWD rule; otherwise sudo/polkit must prompt). This extension does **not** install sudoers from the store-facing tree.

Turbo, fan, and the temperature target go through `/usr/local/bin/vicinae-thermal` (`sudo -n`). A TLP profile change can turn turbo back on, because TLP owns `CPU_BOOST_*`. The target drop-in drops thermald's `--adaptive` flag so DPTF tables do not replace the configured trip. Fan max needs `thinkpad_acpi.fan_control=1`. That module option is off by default, and the sysfs parameter cannot be flipped on a running module.

Passwordless installers are **private-only**:

- `power/private/install-boost-permissions.sh`
- `power/private/install-thermal-permissions.sh` (writes `/etc/modprobe.d/thinkpad-fan-control.conf`, rebuilds the initramfs when that file changes, reloads `thinkpad_acpi` if fan control is still off, and enables thermald at boot)

Do not copy `private/` into a store PR. Store already has `power-profile`.

## Tests

```bash
cd power && npm test
```
