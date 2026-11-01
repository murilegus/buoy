#!/usr/bin/env bash
# Symlink the extension into GNOME's user extension dir (dev install).
set -euo pipefail
UUID=buoy@murilegus
SRC="$(cd "$(dirname "$0")/.." && pwd)/src/$UUID"
DST="$HOME/.local/share/gnome-shell/extensions/$UUID"
rm -rf "$DST"
ln -s "$SRC" "$DST"
echo "linked $DST -> $SRC"
echo "now: logout/login (Wayland) then: gnome-extensions enable $UUID"
