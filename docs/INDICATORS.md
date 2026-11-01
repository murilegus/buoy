# Indicators — the buoy light and the privacy dot

The reference for every status mark on the pill. One table, stick to it; a new colour or
position needs a change here first (SPEC §2a-i / §2a-ii point to this file).

## Principles

1. **Two edge slots, nothing else.** Left edge = *the buoy light* (about you: what you
   missed or what is waiting for you). Right edge = *the privacy dot* (about the machine:
   what is sensing right now). No third slot, no badges on icons.
2. **Static.** A mark changes state by changing colour or appearing/disappearing, never by
   blinking, pulsing or breathing (SPEC §8: nothing animates while idle).
3. **Only when meaningful.** A slot is not drawn when it has nothing to say; the three
   content zones then use the full pill. The only exception is the grey "off" light in
   idle `none`, so an empty pill never reads as broken.
4. **Same in idle and compact.** Expanded hides both: Home and peek already explain them.
5. **One colour = one meaning**, across every module. Modules never pick colours.

## Buoy light (left edge)

| Colour | Token | Meaning | Set by | Cleared by | Shown in |
|---|---|---|---|---|---|
| grey `#3a3a3a` | `light-off` | nothing | — | — | idle `none` only |
| amber `#EF9F27` | `light-missed` | ≥1 activity ended while you were away (idle > N min), the island was hidden (fullscreen), or DND suppressed it; missed history has entries. Not counted (2026-11-01): `osd`, `copied` (feedback for your own action), `ask` (red instead), hidden apps | `stack` on end-while-unseen (`setUnseen`) | hover-peek closed, Home opened, or history emptied | idle, compact |
| red `#E24B4A` | `light-waiting` | an `ask` activity exists that could not surface (DND, fullscreen, user dismissed) and still has no answer | `stack` when an `ask` is queued but not shown | the ask is answered, times out (→ deny), or is ended by the caller | idle, compact |

Precedence: red › amber › off. Only one light is drawn.

Hover on the pill while the light is amber/red opens the peek listing the last 5 missed /
waiting items (`Copy done 14:02 · Battery full 13:50 · Slack ⊞ 3`). Click → Home.

## Privacy dot (right edge)

| Colour | Token | Meaning | Source | Shown in |
|---|---|---|---|---|
| orange `#F0997B` | `dot-mic` | microphone in use by some app | Gvc source-output streams | idle, compact |
| green `#5DCAA5` | `dot-cam` | camera in use, **or** screen is being shared/recorded | `Shell.CameraMonitor`; screencast / screen-share indicator | idle, compact |

Precedence when both: green › orange (camera/screen is the more sensitive one), one dot.
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
| state colours | amber/red/orange/green are reserved for the slots; an adapter must not use them as keyline |
| setting | `keyline = brand \| none`, default `brand`; `none` = plain black pill like iOS |
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

Slot width 10 px + 6 px gap. When a slot appears the neighbouring zone nudges inward and
the pill grows by that amount (one short morph). Both slots are inserted by
`kit/present.js`; adapters and idle plans cannot draw into them.

## Accessibility

Colour is never the only channel: the hover peek names the state in words
("2 missed", "Waiting: Claude Code wants to run `git push`"), and the Home row for the
privacy dot names the app. High-contrast theme swaps amber/red/orange/green for the
GNOME accent and error colours.
