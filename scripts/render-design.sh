#!/bin/sh
# Redraws every image under docs/design/ from its render script (gjs + cairo, straight at 3×).
# Design source, not a build step: nothing here runs in CI or ends up in the extension.
# The images carry Vietnamese labels (x.vi.png); the English ones (x.en.png) come with the
# English translation of each page (docs/ARCHITECTURE.md, "The docs and their site").
set -eu
cd "$(dirname "$0")/../docs/design"

r() { script=$1; out=$2; shift 2; gjs -m "$script" "$out" "$@"; }
# clip <mode> <out.png>: a render script's frames (30 fps) as an animated PNG, which GitHub and the
# site both play inline (scripts/apng.py, Pillow)
clip() {
  frames="$(mktemp -d)"
  gjs -m motion/render/motion.js "$frames" "$1"
  python3 -I ../../scripts/apng.py "$frames" "$2" 30
  rm -rf "${frames:?}"
}

# colours
r colours/render/roles.js colours/images/roles.vi.png
r colours/render/contrast.js colours/images/contrast.vi.png
r colours/render/illustration.js colours/images/illustration.vi.png
r colours/render/lights.js colours/images/lights.vi.png > /dev/null   # it also prints the contrasts

# pill
p=pill/render; i=pill/images
r $p/anatomy.js $i/anatomy.vi.png
r $p/weight.js $i/weight.vi.png
r $p/pad.js $i/pad.vi.png
r $p/fonts.js $i/fonts.vi.png > /dev/null   # it also prints its measures
r $p/dots.js $i/dots.vi.png
r $p/dots.js $i/dots-guides.vi.png guides
r $p/minimal-media.js $i/minimal-media.vi.png
r $p/side.js $i/side.vi.png side
r $p/side.js $i/claude.vi.png claude
r $p/bar.js $i/bar-1920.vi.png 1920
r $p/bar.js $i/bar-1366.vi.png 1366

# compact (anatomy-compact.js draws the alerts-and-asks images too)
c=compact/render
r $c/anatomy-compact.js compact/images/anatomy-media.vi.png media
r $c/anatomy-compact.js compact/images/anatomy-rows.vi.png rows
r $c/anatomy-compact.js compact/images/anatomy-card.vi.png card
r $c/anatomy-compact.js alerts-and-asks/images/ask.vi.png ask
r $c/anatomy-compact.js alerts-and-asks/images/question.vi.png question
r $c/card.js compact/images/card.vi.png
r $c/body.js compact/images/body.vi.png
r $c/screen.js compact/images/screen.vi.png
r $c/reply.js compact/images/reply.vi.png
r alerts-and-asks/render/notification.js alerts-and-asks/images/notification.vi.png
r alerts-and-asks/render/shared.js alerts-and-asks/images/shared.vi.png

# icons
r icons/render/symbolic.js icons/images/symbolic.vi.png
r icons/render/own.js icons/images/own.vi.png
r icons/render/roles.js icons/images/roles.vi.png

# expanded
r expanded/render/expanded.js expanded/images/expanded.vi.png

# home
for m in states anatomy fill lists screen; do r home/render/home.js home/images/$m.vi.png $m; done

# motion
for m in curves compact expanded tabs; do r motion/render/motion.js motion/images/$m.vi.png $m; done
mkdir -p motion/clips
for m in compact expanded tabs; do clip clip-$m motion/clips/$m.vi.png; done

echo "docs/design: images redrawn"
