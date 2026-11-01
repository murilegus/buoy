#!/usr/bin/env bash
# Runs every *.test.js with gjs; exits non-zero on the first failure.
set -euo pipefail
cd "$(dirname "$0")"
fail=0
for t in *.test.js; do
  if gjs -m "$t"; then :; else echo "FAIL: $t"; fail=1; break; fi
done
exit $fail
