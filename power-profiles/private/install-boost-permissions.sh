#!/bin/bash
# PRIVATE-ONLY. Do not copy into a vicinaehq/extensions store submission.
# Install passwordless sudo for the boost helper (same pattern as tlp NOPASSWD).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER_SRC="$ROOT/bin/vicinae-boost-app"
HELPER_DST="/usr/local/bin/vicinae-boost-app"
SUDOERS_DST="/etc/sudoers.d/vicinae-power-boost"

if [[ ! -f "$HELPER_SRC" ]]; then
  echo "Missing helper: $HELPER_SRC" >&2
  exit 1
fi

install -m 755 "$HELPER_SRC" "$HELPER_DST"

tmp="$(mktemp)"
cat >"$tmp" <<EOF
# Vicinae local power-profiles: allow boosting selected apps without a password.
%wheel ALL=(root) NOPASSWD: $HELPER_DST
EOF

visudo -cf "$tmp"
install -m 440 "$tmp" "$SUDOERS_DST"
rm -f "$tmp"

echo "Installed $HELPER_DST and $SUDOERS_DST"
echo "Test: sudo -n $HELPER_DST boost \$\$"
