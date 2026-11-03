#!/usr/bin/env bash
# Ask a question in the pill and wait for the answer; exit 0 only for Allow (docs/DBUS.md).
# Usage: ask.sh "Run the deploy?"
set -euo pipefail

reply=$(gdbus call --session --timeout 120 --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/Buoy \
  --method org.gnome.Shell.Extensions.Buoy.Ask \
  'demo-ask' "${1:-Run the deploy?}" "['Deny', 'Allow']" \
  "{'app': <'buoy-demo'>, 'timeoutMs': <60000>, 'fallback': <'Deny'>}")

choice=${reply#"('"}
choice=${choice%"',)"}
echo "$choice"
[ "$choice" = Allow ]
