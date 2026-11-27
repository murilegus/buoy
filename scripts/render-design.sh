#!/bin/sh
# Redraws every image under docs/design/ from its render script (gjs + cairo, straight at 3×).
# Design source, not a build step: nothing here runs in CI or ends up in the extension.
# Each image is drawn twice, Vietnamese labels (x.vi.png) and English (x.en.png); one with no
# words in it, the two the same, is kept once as x.png for both sites (docs/ARCHITECTURE.md,
# "The docs and their site"). Shell captures are not redrawn here: their sources and compose
# scripts are kept outside the repo.
set -eu
cd "$(dirname "$0")/../docs/design"

# one <out>: out.vi.png and out.en.png the same → out.png
one() {
  if cmp -s "$1.vi.png" "$1.en.png"; then mv "$1.vi.png" "$1.png"; rm "$1.en.png"; else rm -f "$1.png"; fi
}
# r <script> <out> [args]: out without its extension, in both languages
r() {
  script=$1; out=$2; shift 2
  for lang in vi en; do gjs -m "$script" "$out.$lang.png" "$@"; done
  one "$out"
}
# clip <mode> <out>: a render script's frames (30 fps) as an animated PNG, which GitHub and the
# site both play inline (scripts/apng.js); DESIGN_LANG picks the labels, as frames have no name
clip() {
  for lang in vi en; do
    frames="$(mktemp -d)"
    DESIGN_LANG=$lang gjs -m motion/render/motion.js "$frames" "$1"
    gjs -m ../../scripts/apng.js "$frames" "$2.$lang.png" 30
    rm -rf "${frames:?}"
  done
  one "$2"
}

# colours
r colours/render/roles.js colours/images/roles
r colours/render/contrast.js colours/images/contrast
r colours/render/illustration.js colours/images/illustration
r colours/render/lights.js colours/images/lights > /dev/null   # it also prints the contrasts

# pill
p=pill/render; i=pill/images
r $p/anatomy.js $i/anatomy
r $p/weight.js $i/weight
r $p/pad.js $i/pad
r $p/fonts.js $i/fonts > /dev/null   # it also prints its measures
r $p/dots.js $i/dots
r $p/dots.js $i/dots-guides guides
r $p/minimal-media.js $i/minimal-media
r $p/eq-colour.js $i/eq-colour
r $p/side.js $i/side side
r $p/side.js $i/claude claude
r $p/bar.js $i/bar-1920 1920
r $p/bar.js $i/bar-1366 1366

# compact (anatomy-compact.js draws the alerts-and-asks images too)
c=compact/render
r $c/anatomy-compact.js compact/images/anatomy-media media
r $c/media-slot.js compact/images/media-slot
r $c/anatomy-compact.js compact/images/anatomy-rows rows
r $c/anatomy-compact.js compact/images/anatomy-card card
r $c/anatomy-compact.js alerts-and-asks/images/ask ask
r $c/anatomy-compact.js alerts-and-asks/images/question question
r $c/card.js compact/images/card
r $c/body.js compact/images/body
# compact/images/screen is a Shell capture since the privacy dot (2026-11-14); screen.js is its mockup
r $c/reply.js compact/images/reply
r alerts-and-asks/render/notification.js alerts-and-asks/images/notification
r alerts-and-asks/render/shared.js alerts-and-asks/images/shared

# media (design/media; chips-1920 is a Shell capture)
for m in options anatomy states players text switch; do r media/render/media.js media/images/$m $m; done
r media/render/media.js media/images/eq-tab eq

# icons
r icons/render/symbolic.js icons/images/symbolic
r icons/render/own.js icons/images/own
r icons/render/roles.js icons/images/roles

# mascot (Bu's eyes)
for m in expressions sequences; do r mascot/render/eyes.js mascot/images/$m $m; done

# expanded
r expanded/render/expanded.js expanded/images/expanded

# home
for m in states music anatomy fill lists screen; do r home/render/home.js home/images/$m $m; done
# power (one script for home, compact and icons)
for m in tile list; do r home/render/power.js home/images/power-$m $m; done
for m in flash compact; do r home/render/power.js compact/images/power-$m $m; done
r home/render/power.js icons/images/power-modes icons
# the Device tab
for m in columns pages; do r device/render/device.js device/images/$m $m; done
r device/render/wireless.js device/images/wireless
r device/render/bluetooth-page.js device/images/bluetooth-page
r device/render/drives.js device/images/drives
r device/render/phone.js device/images/phone
r device/render/apps.js device/images/apps
r device/render/calls.js device/images/calls
r home/render/phone.js home/images/phone-tile
# headphones / display plugged
for m in flash compact; do r compact/render/plugged.js compact/images/plugged-$m $m; done
r compact/render/attention.js compact/images/attention
r compact/render/meeting.js compact/images/meeting
r compact/render/terminal.js compact/images/terminal
r compact/render/timer.js compact/images/timer
r compact/render/network.js compact/images/network
r compact/render/print.js compact/images/print
r compact/render/call.js compact/images/call
r expanded/render/greeting.js expanded/images/greeting
r tabs/render/event.js tabs/images/event

# motion
for m in curves compact expanded tabs; do r motion/render/motion.js motion/images/$m $m; done
mkdir -p motion/clips
for m in compact expanded tabs; do clip clip-$m motion/clips/$m; done

echo "docs/design: images redrawn"
