# Indicators — the buoy light and the privacy dot

Every status mark on the pill. A new colour or position needs a change here first (SPEC §2a-i,
§2a-ii). Where the marks sit and how the pill grows around them is in [Design](design/index.md)
(Pill); their colours are palette roles (`kit/model/palette.js`, design/colours).

## Principles

1. **Two edge slots, nothing else.** Left = *the buoy light* (about you: what you missed or
   what waits for you). Right = *the privacy dot* (about the machine: what senses now). No
   third slot, no badges on icons.
2. **Static.** A mark changes colour or appears/disappears; never blinks, pulses or breathes
   (SPEC §8).
3. **Only when meaningful.** An empty slot is not drawn. Exception: the grey "off" light in
   idle `none`, so an empty pill never looks broken.
4. **Same in idle, minimal and compact.** Expanded hides both (Home and the missed list
   explain them).
5. **One colour = one meaning**, across modules. Modules never pick colours.

## Buoy light (left edge)

| Colour | Token | Meaning | Set by | Cleared by | Shown in |
|---|---|---|---|---|---|
| white 20 % | `light-off` | nothing | — | — | idle `none` only |
| amber `#FF9F0A` | `light-missed` | missed history has entries: an activity ended or came while the island was hidden (fullscreen), you were away (GNOME's session idle, after `idle-delay`), the screen locked, or in Do Not Disturb; or a notification never had its 5 s while you were present (cut short, no room in a burst) (2026-11-12, Ethan; NOTIFICATIONS §2). Not counted: `osd`, `copied`, `input` (your own action), `ask` (red), hidden apps (2026-11-01) | `stack` (`setUnseen`, `setAway`) | opening Home, or history emptied; Home's Missed tile stays until every row is opened or cleared | idle, minimal |
| red `#FF453A` | `light-waiting` | an `ask` that could not surface (fullscreen, dismissed) is still unanswered | `stack`, an `ask` queued but not shown | answered, timed out (→ deny), or ended by the caller | idle, minimal |

Precedence: red › amber › off; one light drawn.

Not states: the clock plan's daypart icons (SPEC §2a, 2026-11-04) beside the light are yellow
`#FFD23F` and peach `#FFB889`, never amber or red (`tests/clock.test.js`).

### Bu's lamp

*2026-11-03; 2026-11-08.*

Bu's lamp always shows its pose's colour, chosen by the kit, static. On a pill Bu leads, the
buoy light is still the edge dot: amber/red reach the lamp only as the `missed`/`ask` poses'
own colours (2026-11-08, Ethan: the lamp is too small to read as the light). The rest of Bu is
MASCOT.md's fixed palette, none of it a state colour.

| Colour | Poses |
|---|---|
| `#C8C6BD` | idle |
| `#444441` | sleep, stale |
| amber `#FF9F0A` | missed |
| red `#FF453A` | ask |
| `#B4E33D` | done, party |
| `#3D9BFF` | busy |
| `#FFE14D` | wave |
| `#FF7EB6` | think (pink: purple is the mic) |
| `#5AD8F5` | compact |
| `#8A8880` | error (grey, never red: red is ask) |
| foreground | turn |

Hover on the centre pill while amber: its compact becomes the missed list (up to 3 rows,
newest first: icon, text, end time, 2026-11-05); hover clears nothing. Click → Home, whose
Missed section lists them and turns the light off (SPEC §3). With an activity running the list
replaces its compact (media's transport returns once Home was shown); a click while the list
shows opens Home, before it shows (first 300 ms) the activity's tab (`tabs.js` `pressTarget`,
2026-11-04). Hover while red: the waiting ask's own card (newest unanswered off screen, with its
buttons) replaces the compact; answer there; leaving closes it, still red (2026-11-13, Ethan;
`stack.waiting`).

## Privacy dot (right edge)

| Colour | Token | Meaning | Source | Shown in |
|---|---|---|---|---|
| purple `#BF5AF2` | `dot-mic` | microphone in use | Gvc source-output streams | idle, minimal |
| green `#30D158` | `dot-cam` | camera in use | `Shell.CameraMonitor` | idle, minimal |
| red `#FF453A` | `dot-screen` | screen shared or recorded (the waiting red, other side) | Shell's screencast (`screenshotUI` `screencast-in-progress`), Mutter's remote access handles | idle, minimal |

Mic and camera come from GNOME's Quick Settings indicators (input slider visible and not muted;
camera icon bound to `Shell.CameraMonitor`), so Buoy counts what GNOME counts
(`modules/privacy/source.js`, 2026-11-14). Precedence: red › green › purple, one dot
(design/colours "Privacy dot", 2026-11-11). Location has no dot, as in GNOME and Apple.

Click → Home. A recording or share is its own activity (kind `screen`, priority 55): its clock
in the pill, Stop in its compact and on Home's card (design/compact). Camera plus microphone make
an "In a call" activity, and Home's "in use" glance names the recording apps (2026-11-27,
design/compact "In a call"); the camera's app stays unnamed (`Shell.CameraMonitor` only counts).

While the `privacy` module is on, GNOME's own indicators (camera, microphone, remote access in
the system cluster; recording and sharing buttons in the bar) are hidden, so a fact shows once
(`privacy-dot = pill | system | both`, default `pill`).

## Keyline tint (the pill's 1 px border)

The one place an app may put its colour (Apple's `keylineTint`): it says **who** speaks, never
**what** happens (that is the slots' job).

| | Rule |
|---|---|
| default | `rgba(255,255,255,0.12)`: idle always, and an activity with `keyline: null` |
| activity | adapter may set `keyline: '#1DB954'` (the app's brand colour), in that activity's compact and expanded only |
| idle plans | may not set one |
| several pills | each carries its own |
| cover-art colour | if ever added (deferred), feeds the keyline, never the background |
| state colours | amber, red, purple, green are the slots'; never a keyline (`kit/model/palette.js` STATE_COLOURS) |
| setting (planned, no key yet) | `keyline = brand \| none`, default `brand`; `none` = plain black pill like iOS |
| theme accent | never the keyline (it would pull the eye all day); only the keyboard focus ring (`Super+B`, SPEC §2c), as in GNOME; while ringed the border is the accent and the keyline waits (2026-11-04) |
| motion | not eased (St can't); switches with the content swap |

## What is NOT an indicator

- Media playing, progress (a trailing ring): activities, not slots.
- "Charging", "VPN on", "DND on": transient activities or system-cluster icons, never a light.
  A fourth colour is a SPEC change, not a module decision.

## Layout

```
[● ] [leading] [text ………………] [trailing] [ ●]
 light  icon/art  main line     glyph/ring   dot
 (left slot)  ←── adapter / idle plan ──→  (right slot)
```

The slots are pill 1's ends (2026-11-10, design/pill "Lights at both ends"): an 8 px dot centred in
each round cap; the pill grows at both ends by that radius plus half the dot (20 at 1×), so the
zones never move; the cap counts the lights. `kit/ui/pill.js` draws them; adapters and idle plans cannot. Side pills,
compact, card and expanded have none.

## Accessibility

Colour is never the only channel: the compact names the state ("2 missed", "Waiting: Claude
Code wants to run `git push`"), and Home's row names the app behind the dot. High contrast
raises borders and quiet text (design/colours "High contrast"); lights and dots keep their
colours, each ≥ 3:1 on black.
