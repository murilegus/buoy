#!/usr/bin/env bash
# The gate: run by the pre-commit hook and by CI, so both check the same things.
# Lint, the type check (tsc over the JSDoc), gjs unit tests, and the GSettings schema
# compiling in strict mode.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm lint
pnpm check
pnpm test
glib-compile-schemas --strict --dry-run src/buoy@murilegus/schemas
echo "verify: ok"
