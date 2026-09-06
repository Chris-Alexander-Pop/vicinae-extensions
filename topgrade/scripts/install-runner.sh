#!/usr/bin/env bash
# Install the Topgrade runner binary + systemd user unit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_SRC="$ROOT/bin/vicinae-topgrade-run"
BIN_DST="${HOME}/.local/bin/vicinae-topgrade-run"
UNIT_SRC="$ROOT/systemd/vicinae-topgrade.service"
UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_DST="${UNIT_DIR}/vicinae-topgrade.service"

mkdir -p "$(dirname "$BIN_DST")" "$UNIT_DIR"

install -m 755 "$BIN_SRC" "$BIN_DST"
# Askpass helpers live under private/ and are not part of a store copy.
install -m 755 "$ROOT/private/vicinae-sudo-askpass" "${HOME}/.local/bin/vicinae-sudo-askpass"
install -m 755 "$ROOT/private/vicinae-sudo-password-warm" "${HOME}/.local/bin/vicinae-sudo-password-warm"
install -m 755 "$ROOT/private/vicinae-sudo-prompt" "${HOME}/.local/bin/vicinae-sudo-prompt"
install -m 644 "$UNIT_SRC" "$UNIT_DST"

systemctl --user daemon-reload
echo "Installed:"
echo "  $BIN_DST"
echo "  ${HOME}/.local/bin/vicinae-sudo-askpass"
echo "  ${HOME}/.local/bin/vicinae-sudo-password-warm"
echo "  ${HOME}/.local/bin/vicinae-sudo-prompt"
echo "  $UNIT_DST"
echo "Test: systemctl --user start vicinae-topgrade.service"
echo "Status: systemctl --user status vicinae-topgrade.service"
