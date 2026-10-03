# Private-only (not for the Vicinae store)

Installs `/usr/local/bin/vicinae-boost-app`, `/usr/local/bin/vicinae-thermal`, and `%wheel` NOPASSWD sudoers drop-ins for those binaries only.

Do not copy this directory into a store pull request. App-boost can stay a
local helper; the store-facing profile switch uses `sudo tlp` / polkit instead.

```bash
sudo pacman -S thermald
sudo bash power/private/install-boost-permissions.sh
sudo bash power/private/install-thermal-permissions.sh
```

`install-thermal-permissions.sh` installs `/usr/local/bin/vicinae-thermal`, a `%wheel` NOPASSWD rule for that binary only, and `thinkpad_acpi.fan_control=1`. It rebuilds the initramfs when the modprobe file changes, because `thinkpad_acpi` loads from that image and ignores a root-only modprobe file. It reloads the module when fan control is still off. If `thermald` is installed, it enables the service at boot and writes a package target (75°C the first time, otherwise the temperature already in `/etc/thermald/thermal-conf.xml`).
