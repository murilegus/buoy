#!/usr/bin/env bash
# Nested GNOME Shell that restarts whenever a source file changes.
# Needs: inotify-tools. Logs of the nested shell go to this terminal.
set -uo pipefail
UUID=buoy@murilegus
SRC="$(cd "$(dirname "$0")/.." && pwd)/src/$UUID"

run() {
  env MUTTER_DEBUG_DUMMY_MODE_SPECS=1600x900 \
    dbus-run-session -- bash -c "
      gnome-extensions enable $UUID 2>/dev/null
      exec gnome-shell --nested --wayland
    " &
  PID=$!
}

run
while inotifywait -q -e modify,create,delete,move -r "$SRC"; do
  kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null
  run
done
# Note: for module-only edits (lib/modules/<id>/**) you can skip the restart:
#   enable `dev-mode` in settings, then in Looking Glass (Alt+F2 → lg):
#   Main.extensionManager.lookup('buoy@murilegus').stateObj.reload('media')
# Kit edits (lib/kit/**, extension.js, panel.js) still need this restart loop.
