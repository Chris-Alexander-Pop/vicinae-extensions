#!/bin/bash
# PRIVATE-ONLY. Do not copy into a vicinaehq/extensions store submission.
# Passwordless sudo for the turbo/fan/target helper, and ThinkPad fan_control=1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER_SRC="$ROOT/bin/vicinae-thermal"
HELPER_DST="/usr/local/bin/vicinae-thermal"
SUDOERS_DST="/etc/sudoers.d/vicinae-thermal"
MODPROBE_DST="/etc/modprobe.d/thinkpad-fan-control.conf"

if [[ ! -f "$HELPER_SRC" ]]; then
  echo "Missing helper: $HELPER_SRC" >&2
  exit 1
fi

install -m 755 "$HELPER_SRC" "$HELPER_DST"

tmp="$(mktemp)"
cat >"$tmp" <<EOF
# Vicinae local power: turbo, ThinkPad fan, and thermald target only.
%wheel ALL=(root) NOPASSWD: $HELPER_DST
EOF

visudo -cf "$tmp"
install -m 440 "$tmp" "$SUDOERS_DST"
rm -f "$tmp"

modprobe_body="# Let userspace set /proc/acpi/ibm/fan (vicinae power-profiles).
options thinkpad_acpi fan_control=1
"
modprobe_changed=0
if [[ ! -f "$MODPROBE_DST" ]] || [[ "$(cat "$MODPROBE_DST")" != "$modprobe_body" ]]; then
  printf '%s' "$modprobe_body" >"$MODPROBE_DST"
  modprobe_changed=1
fi

echo "Installed $HELPER_DST and $SUDOERS_DST"
echo "Wrote $MODPROBE_DST"

# thinkpad_acpi is loaded from the initramfs (modconf hook). A conf that
# exists only on the root filesystem is ignored at boot, so fan_control
# comes back as N after reboot until the image is rebuilt.
if [[ "$modprobe_changed" -eq 1 ]]; then
  if command -v mkinitcpio >/dev/null; then
    echo "Rebuilding initramfs so fan_control=1 is applied on the next boot..."
    mkinitcpio -P
  else
    echo "mkinitcpio not found. Rebuild the initramfs yourself or fan_control will reset on reboot." >&2
  fi
else
  echo "fan_control modprobe file unchanged; skipping initramfs rebuild"
fi

if [[ -r /sys/module/thinkpad_acpi/parameters/fan_control ]]; then
  enabled="$(tr -d '[:space:]' </sys/module/thinkpad_acpi/parameters/fan_control)"
  if [[ "$enabled" == "Y" || "$enabled" == "1" ]]; then
    echo "fan_control is already on"
  else
    echo "Reloading thinkpad_acpi so fan_control=1 applies (ThinkPad hotkeys blip)..."
    if modprobe -r thinkpad_acpi && modprobe thinkpad_acpi; then
      enabled="$(tr -d '[:space:]' </sys/module/thinkpad_acpi/parameters/fan_control)"
      echo "fan_control is now ${enabled}"
    else
      if [[ ! -d /sys/module/thinkpad_acpi ]]; then
        modprobe thinkpad_acpi || true
      fi
      echo "Could not reload thinkpad_acpi. Reboot, then the fan toggle will work." >&2
      exit 1
    fi
  fi
fi

if [[ ! -x /usr/bin/thermald ]]; then
  echo "thermald is not installed. Install it, then re-run this script:" >&2
  echo "  sudo pacman -S thermald && sudo bash power/private/install-thermal-permissions.sh" >&2
  exit 1
fi

target=75
if [[ -f /etc/thermald/thermal-conf.xml ]]; then
  milli="$(sed -n 's/.*<Temperature>[[:space:]]*\([0-9][0-9]*\)[[:space:]]*<\/Temperature>.*/\1/p' /etc/thermald/thermal-conf.xml | head -1)"
  if [[ "$milli" =~ ^[0-9]+$ ]] && (( milli % 1000 == 0 )); then
    existing=$((milli / 1000))
    if (( existing >= 55 && existing <= 95 )); then
      target=$existing
    fi
  fi
fi

echo "Applying thermald package target ${target}C (enabled at boot)..."
"$HELPER_DST" target "$target"
