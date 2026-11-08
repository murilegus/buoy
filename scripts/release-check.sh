#!/usr/bin/env bash
# Before a release is published (.github/workflows/release.yml): the tag names the version
# metadata.json calls itself, and that version has its notes. Prints the version's name.
#
#   scripts/release-check.sh v0.1      → 0.1, or an error and exit 1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
META="$ROOT/src/buoy@murilegus/metadata.json"
tag="${1:?usage: release-check.sh <tag>}"

name="$(grep -oE '"version-name": *"[^"]+"' "$META" | grep -oE '"[^"]+"$' | tr -d '"' || true)"
[ -n "$name" ] || { echo "metadata.json has no version-name" >&2; exit 1; }
[ "$tag" = "v$name" ] || { echo "tag $tag, but metadata.json's version-name is $name: tag v$name" >&2; exit 1; }
[ -s "$ROOT/docs/releases/$name.md" ] || { echo "docs/releases/$name.md is missing: the release's notes" >&2; exit 1; }
echo "$name"
