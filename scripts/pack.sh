#!/usr/bin/env bash
# Build the zip for extensions.gnome.org / manual install.
#
# `gnome-extensions pack` takes extension.js, metadata.json, prefs.js and the
# stylesheet*.css files on its own, and copies schemas/*.gschema.xml itself
# (gnome-shell subprojects/extensions-tool/src/command-pack.c: pack_extension,
# find_schemas). Everything else must be named with --extra-source, so the list is
# derived from the folder: every other top-level file or folder ships, and a new
# runtime file cannot be left out of the zip.
set -euo pipefail
UUID=buoy@murilegus
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src/$UUID"

extra=()
for path in "$SRC"/*; do
  name="$(basename "$path")"
  case "$name" in
    extension.js|metadata.json|prefs.js|stylesheet*.css) ;;  # packed by default
    schemas) ;;                                              # packed by default, .xml only
    *) extra+=("--extra-source=$name") ;;
  esac
done

mkdir -p "$ROOT/dist"
echo "extra sources: ${extra[*]#--extra-source=}"
gnome-extensions pack --force "${extra[@]}" --out-dir="$ROOT/dist" "$SRC"
ls -la "$ROOT/dist"
