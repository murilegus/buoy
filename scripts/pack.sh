#!/usr/bin/env bash
# Build the zip for extensions.gnome.org / manual install.
set -euo pipefail
UUID=buoy@murilegus
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/dist"
gnome-extensions pack --force \
  --extra-source=lib --extra-source=panel.js --extra-source=schemas --extra-source=icons \
  --out-dir="$ROOT/dist" \
  "$ROOT/src/$UUID"
ls -la "$ROOT/dist"
