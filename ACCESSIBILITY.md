# Accessibility

Buoy should be usable without a mouse, without perfect sight and without motion. This page
says what works today, what does not yet, and how to tell us about a barrier.

## What works

- **Keyboard.** <kbd>Super</kbd>+<kbd>B</kbd> (changeable in Settings) reaches the pill from
  anywhere: <kbd>←</kbd>/<kbd>→</kbd> move between pills and between Home's tabs,
  <kbd>Enter</kbd> opens, <kbd>Esc</kbd> lets go. A permission prompt answers from the
  keyboard too: each button takes the first letter of its label (<kbd>D</kbd>eny,
  <kbd>A</kbd>llow), or its position (<kbd>1</kbd>–<kbd>9</kbd>) when two labels start alike.
  Buttons show a focus ring.
- **Screen readers.** The pill, its buttons and Home's controls carry accessible names (the
  track and artist, "Open Rhythmbox", "Position", the tab names…), read through GNOME's
  accessibility stack.
- **Motion.** With GNOME's animations turned off (Settings → Accessibility → Seeing →
  Reduce Animation), long titles stop scrolling, Bu stops moving and the pill changes size
  without animating: GNOME Shell turns every eased change into an instant one
  (`misc/animationUtils.js` `adjustAnimationTime`), and Buoy's own loops check the same
  setting. Bu's waving picture at the top of the README stays still with the system's
  reduced-motion setting; the other README animations do not.
- **Nothing important hides behind motion or colour alone.** Bu's pose comes with words in
  the pill ("needs your OK", "Running pnpm test"); a missed activity lights the buoy light
  and is listed in Home.
- **Contrast.** The pill is black with light text. The top bar's text and icons switch
  between white and dark with the wallpaper (`cluster-contrast`).

## Known limitations

- Buoy has not been tested with Orca end to end. Accessible names are set, but the order
  Orca reads Home in, and how a pill growing or shrinking is announced, are unverified.
- How GNOME's Large Text setting affects the pill has not been checked: its sizes are set in
  pixels to fit the top bar, and text may not grow with it.
- Some status is shown only while it is on screen (a transfer's speed, a track's position);
  there is no spoken announcement when an activity starts or ends.
- The pill sits on the primary display only.

## Supported environments

GNOME Shell 50 on Wayland (tested on Ubuntu 26.04), with GNOME's own accessibility
settings and the Orca screen reader that ships with it.

## Reporting a barrier

Open an issue with the [Bug report](https://github.com/murilegus/buoy/issues/new/choose)
form and say which assistive technology or setting you use (Orca, Large Text, Reduce
Animation, a keyboard-only setup, a high-contrast theme…) and what got in your way. If you'd
rather not post publicly, write to conduct@murilegus.dev. Accessibility problems are treated
as bugs, not feature requests.
