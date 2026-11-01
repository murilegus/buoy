#!/usr/bin/env bash
# Nested GNOME Shell that restarts whenever a source file changes.
# Shell 49+ dropped --nested; the nested window is mutter's devkit.
# Needs: inotify-tools, mutter-dev-bin (mutter-devkit). Logs go to this terminal.
set -uo pipefail
for bin in inotifywait /usr/libexec/mutter-devkit; do
  command -v "$bin" >/dev/null || { echo "missing $bin (apt install inotify-tools mutter-dev-bin)" >&2; exit 1; }
done
UUID=buoy@murilegus
SRC="$(cd "$(dirname "$0")/.." && pwd)/src/$UUID"

# The devkit window shows a 1280x800 monitor; MUTTER_DEBUG_DUMMY_MODE_SPECS no longer
# applies and --virtual-monitor adds a second monitor instead of resizing it.
run() {
  dbus-run-session -- bash -c "
      gnome-extensions enable $UUID 2>/dev/null
      exec gnome-shell --devkit --wayland
    " &
  PID=$!
}

# gnome-shell is a child of dbus-run-session; killing dbus-run-session alone
# orphans the shell and leaves its devkit window open.
stop() {
  pkill -TERM -P "$PID" -x gnome-shell
  wait "$PID" 2>/dev/null
}
WATCH=
trap 'kill "$WATCH" 2>/dev/null; stop; exit' INT TERM

run
while :; do
  # in the background so a signal runs the trap at once instead of after the next change
  inotifywait -q -e modify,create,delete,move -r "$SRC" & WATCH=$!
  wait "$WATCH" || break
  stop
  run
done
stop
# Note: for module-only edits (lib/modules/<id>/**) you can skip the restart:
#   enable `dev-mode` in settings, then in Looking Glass (Alt+F2 → lg):
#   Main.extensionManager.lookup('buoy@murilegus').stateObj.reload('media')
# Kit edits (lib/kit/**, extension.js, panel.js) still need this restart loop.
