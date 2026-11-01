#!/usr/bin/env bash
# Symlink the extension into GNOME's user extension dir (dev install).
set -euo pipefail
UUID=buoy@murilegus
SRC="$(cd "$(dirname "$0")/.." && pwd)/src/$UUID"
DST="$HOME/.local/share/gnome-shell/extensions/$UUID"
rm -rf "$DST"
ln -s "$SRC" "$DST"
glib-compile-schemas --strict "$SRC/schemas"
echo "linked $DST -> $SRC (schemas compiled)"
echo "now: logout/login (Wayland) then: gnome-extensions enable $UUID"
