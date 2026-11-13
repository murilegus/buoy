# Indicators — the buoy light and the privacy dot

The reference for every status mark on the pill. One table, stick to it; a new colour or
position needs a change here first (SPEC §2a-i / §2a-ii point to this file).

> **v0.2 redesign:** where the lights sit and how the pill grows around them are decided in
> [Design](design/index.md) (Pill; in Vietnamese first): pill 1 only, an 8 px dot at the centre
> of each end circle. Their colours are the palette's roles (design/colours,
> `kit/model/palette.js`, in the code since 2026-11-12). Their meaning stays here.

## Principles

1. **Two edge slots, nothing else.** Left edge = *the buoy light* (about you: what you
   missed or what is waiting for you). Right edge = *the privacy dot* (about the machine:
   what is sensing right now). No third slot, no badges on icons.
2. **Static.** A mark changes state by changing colour or appearing/disappearing, never by
   blinking, pulsing or breathing (SPEC §8: nothing animates while idle).
3. **Only when meaningful.** A slot is not drawn when it has nothing to say; the three
   content zones then use the full pill. The only exception is the grey "off" light in
   idle `none`, so an empty pill never reads as broken.
4. **Same in idle, minimal and compact.** Expanded hides both: Home and the compact's
   missed list already explain them.
5. **One colour = one meaning**, across every module. Modules never pick colours.

## Buoy light (left edge)

| Colour | Token | Meaning | Set by | Cleared by | Shown in |
|---|---|---|---|---|---|
| white 20 % | `light-off` | nothing | — | — | idle `none` only |
| amber `#FF9F0A` | `light-missed` | ≥1 activity ended while the island was hidden (fullscreen), you were away (GNOME's session idle) or in Do Not Disturb (2026-11-13); missed history has entries. Not counted (2026-11-01): `osd`, `copied`, `input` (feedback for your own action), `ask` (red instead), hidden apps | `stack` on end-while-unseen (`setUnseen`) or away (`setAway`) | Home shown (the list stays there until Clear, 2026-11-03), or history emptied | idle, minimal, compact |
| red `#FF453A` | `light-waiting` | an `ask` activity exists that could not surface (fullscreen, dismissed) and still has no answer | `stack` when an `ask` is queued but not shown | the ask is answered, times out (→ deny), or is ended by the caller | idle, minimal, compact |

Precedence: red › amber › off. Only one light is drawn.

> **v0.2** (2026-11-12, Ethan; design/alerts-and-asks): amber also covers what ended or came
> while you were away (GNOME's session idle, after `idle-delay`), the screen locked, or in Do Not
> Disturb, and notifications that never had their 5 s while you were present (a card cut short,
> one with no room in a burst). Opening Home turns it off; Home's Missed tile stays until every
> row is opened or cleared. NOTIFICATIONS §2 has the notification rules.

Not states: the clock plan's daypart icons (SPEC §2a, 2026-11-04) are yellow
`#FFD23F` and peach `#FFB889` (palette A) beside the light, never amber or red; `tests/clock.test.js`
checks the files.

### Bu's lamp

*2026-11-03; 2026-11-08.*

Bu's lamp shows its pose's colour, always. The buoy light is the pill's edge dot on a pill
Bu leads too: amber/red never reach the lamp (2026-11-08, Ethan: the lamp is too small to
read as the light; it replaced the 2026-11-03 rule "the lamp is the light, no edge slot").
The lamp's colour is — chosen by the kit, never by a module; static, never
blinking; never another colour from this file, except amber for `missed` and red for `ask`.
This rule is the lamp's: the rest of Bu (body, stripe, water…) is MASCOT.md's fixed
palette, none of which is a state colour here (2026-11-03).

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
| `#5F5E5A` | error |
| `#B5D4F4` | compact |

Hover on the centre pill while the light is amber opens its compact as the missed list
(2026-11-05: up to 3 rows, newest first, each the kind's icon, its text and the time it
ended; was one ellipsized line, `2 missed · Copy done · Tea 4:00`); hover clears nothing. Click →
Home, whose Missed section lists them with their times and turns the light off (SPEC §3,
2026-11-03). With an activity running, the list takes the place of the activity's own compact
(media's transport comes back once Home has been shown), and a click while the list shows
opens Home, not the activity's tab; a click before it shows (the first 300 ms) opens the
tab as usual (`tabs.js` `pressTarget`, 2026-11-04). Red (waiting) has no compact yet: M4 Buoy light.

## Privacy dot (right edge)

| Colour | Token | Meaning | Source | Shown in |
|---|---|---|---|---|
| purple `#BF5AF2` | `dot-mic` | microphone in use by some app | Gvc source-output streams | idle, minimal, compact |
| green `#30D158` | `dot-cam` | camera in use | `Shell.CameraMonitor` | idle, minimal, compact |
| red `#FF453A` | `dot-screen` | screen is being shared or recorded (the waiting red, on the other side) | screencast / screen-share indicator | idle, minimal, compact |

Precedence when several: red › green › purple (design/colours "Chấm riêng tư", 2026-11-11), one
dot. Location has no dot, as in GNOME and on Apple's devices.
Click → expanded Home with the "in use by …" row (app name, since when, Stop for recordings).

GNOME's own privacy indicator in the system cluster is hidden while the `privacy` module
is on (`privacy-dot = pill | system | both`, default `pill`) so the same fact is shown once.

## Keyline tint (the pill's 1 px border)

The one place an app may put its colour on the pill — Apple's `keylineTint`. It says
**who** is speaking, never **what** is happening (that is the job of the two slots).

| | Rule |
|---|---|
| default | `rgba(255,255,255,0.12)` — idle always, and any activity whose adapter sets `keyline: null` |
| activity | adapter may set `keyline: '#1DB954'` (brand colour of the app); applies in compact and expanded of that activity only |
| idle plans | may not set a keyline |
| several pills | each pill carries its own |
| cover-art colour | if ever added (deferred), it feeds the keyline, never the background |
| state colours | the lights' amber and red, the dots' purple and green are reserved for the slots; an adapter must not use them as keyline (`kit/model/palette.js` STATE_COLOURS) |
| setting | `keyline = brand \| none`, default `brand`; `none` = plain black pill like iOS |
| theme accent | never the keyline: an accent border at rest would say nothing and pull the eye all day. The accent is only the keyboard focus ring (`Super+B`, SPEC §2c), as everywhere in GNOME; while ringed, the 1 px border is the accent and the keyline waits (2026-11-04) |
| motion | not eased (St can't); it switches with the content swap |

## What is NOT an indicator

- Media playing → that is a compact activity, not a light.
- "Charging", "VPN on", "DND on" → activities (transient) or system-cluster icons, never a
  light colour. Adding a fourth colour is a SPEC change, not a module decision.
- Progress → trailing ring inside the activity, not an edge slot.

## Layout

```
[● ] [leading] [text ………………] [trailing] [ ●]
 light  icon/art  main line     glyph/ring   dot
 (left slot)  ←── adapter / idle plan ──→  (right slot)
```

The slots are pill 1's ends (2026-11-10, design/pill "Đèn ở hai đầu"; built 2026-11-12): an
8 px dot at the centre of the end's round cap, and the pill grows at both ends by that radius
and half the dot (20 at 1×), so the zones never move (one short morph). The cap counts the
lights. The pill draws them (`kit/ui/pill.js`); adapters and idle plans cannot draw into
them. Side pills, a compact, a card and expanded have none.

## Accessibility

Colour is never the only channel: the hover compact names the state in words
("2 missed", "Waiting: Claude Code wants to run `git push`"), and the Home row for the
privacy dot names the app. GNOME's high contrast raises the borders and the quieter text
(design/colours "Tương phản cao"); the lights and dots keep their colours, each 3:1 or more on
black already.
