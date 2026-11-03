#!/usr/bin/env bash
# A progress pill from a script: Surface, Update, End (docs/DBUS.md).
set -euo pipefail

buoy() {
  gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/Buoy \
    --method "org.gnome.Shell.Extensions.Buoy.$1" "${@:2}"
}

id=demo-progress
buoy Surface "{'id': <'$id'>, 'kind': <'progress'>, 'app': <'buoy-demo'>,
  'text': <'Copying 0%'>, 'leading': <{'progress': <0.0>}>,
  'expanded': <{'center': <{'title': <'Copying 3 files'>, 'subtitle': <'0 of 3 GB'>, 'progress': <0.0>}>}>}" >/dev/null

for p in 10 20 30 40 50 60 70 80 90 100; do
  sleep 0.4
  f=$(awk "BEGIN { print $p / 100 }")
  gb=$(awk "BEGIN { print 3 * $p / 100 }")
  buoy Update "'$id'" "{'text': <'Copying $p%'>, 'leading': <{'progress': <$f>}>,
    'expanded': <{'center': <{'title': <'Copying 3 files'>, 'subtitle': <'$gb of 3 GB'>, 'progress': <$f>}>}>}" false >/dev/null
done

sleep 1
buoy End "'$id'" >/dev/null
