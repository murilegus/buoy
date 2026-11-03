# Bu — Buoy's mascot (decided 2026-11-03)

Bu is the buoy itself: a small pixel float with a lamp on its head, and **the lamp is the
buoy light** (SPEC §2a-i, INDICATORS). Bu gives the light a body; it adds no new idea.

Bu is not an assistant face. It never talks, never follows the pointer, never glows, and
never moves while the island is idle (SPEC §0, §8; ARCHITECTURE rule 8). Its job is to
make state readable at a glance and to give Buoy a recognisable identity.

![Bu: all 13 poses, dark and light](mascot/sheet.svg)

Two forms, one family:

- **Bu** — the pixel buoy, 13 poses (below). Used by the brand, by agent activities and by
  the greeting.
- **Bu's eyes** — only the two eyes, drawn inside the black pill; the idle plan `mascot`
  (§ Eyes). Same lamp colours, same rules.

## Where Bu appears

| Place | What | Since |
|---|---|---|
| Brand | extension icon, README, EGO screenshots, prefs About page; empty states ("Nothing going on" in Home, the empty Notifications tab) | M3 release |
| Agents | the **leading** of every agent activity (Claude Code, Codex, any D-Bus caller that sends `{mascot}`); the pose follows the agent's lifecycle (§ Agents). The agent's name is always the first word of the text, since Bu does not say which agent it is | M3 `ask`, M4 agent activity |
| Greeting | leading of the expanded greeting (SPEC §2d), `wave` once | M3 greeting |
| Idle plan `mascot` | Bu's eyes in the idle pill (§ Eyes), module off by default | M4 |

Not: the compact pills of other modules (app icons and art stay), and not as a
replacement for the light in every state.

## Drawing rules

- **Grid 10 × 10.** Sizes are multiples of 10 so every cell is whole logical px: **20 px**
  in compact (cell 2, APPLE §B5.3 leading ≤ 20), **50 px** in expanded headers (≤ 56),
  40 px in Home and prefs. HiDPI multiplies whole px; nothing blurs.
- **A fixed palette, always on dark** (corrected 2026-11-03 to match the reviewed design:
  this table had said "foreground at 35 / 55 / 70 %", which drew grey water and a faded
  stripe). Every cell is a solid colour, no partial opacity, so the edges stay crisp at
  20 px. Bu sits only on black: inside the always-black pill, and elsewhere (prefs, Home
  cards, README, EGO) on its own `#0b0b0b` tile — never on a light background. Cell
  letters:

  | Cell | Meaning | Colour |
  |---|---|---|
  | `.` | empty | transparent |
  | `B` `A` | body, arm | `#F1EFE8` |
  | `S` | stripe | `#888780` |
  | `D` | dots, bubble, sparkles | `#D3D1C7` |
  | `Z` | sleep "z" | `#444441` |
  | `W` | water | `#185FA5` |
  | `E` | eye — a hole, the black shows through | transparent |
  | `L` | lamp | the pose's lamp colour (INDICATORS § Bu's lamp); `foreground` = the body colour |

- **The lamp is the light.** When a pill's leading is Bu, the left edge slot is not drawn.
  If the stack's light is `missed` or `waiting`, the lamp shows that colour whatever the
  pose (an `ask` waiting elsewhere still reads red); otherwise it shows the pose's own
  colour. Amber and red appear only with their INDICATORS meanings (`missed`, `ask`).
- **Motion, only with an activity.** Four poses move: `busy` and `think` loop while their
  activity is visible; `wave` and `party` play once (~2 s) and settle on `done` / `idle`.
  Every move is **two frames swapped every 500 ms** — two repaints a second of a 20 px
  area, no frame clock, no easing. The swap timer lives in `present.js`, exists only while
  a moving pose is mapped, and is removed on pose change, destroy and disable; the frame
  holds still while the user is away (Mutter idle monitor, a signal) and when
  `org.gnome.desktop.interface enable-animations` is off. The lamp never blinks.
- **Stale** is drawn by the renderer as for any stale activity (dimmed, APPLE §B1); the
  `stale` pose is what Bu looks like while dimmed.

## Rendering (decided 2026-11-03)

- `kit/mascot.js` holds the grids below as data: pure, no `St`, unit-tested. Pose names
  are a closed set; an unknown pose falls back to the element's `icon`, or `idle`.
- `present.js` paints a grid with one `St.DrawingArea` (cairo rectangles) in the palette
  above. No image files ship in the extension, so HiDPI comes free and there is nothing to
  keep in sync but this file.
- `tests/mascot.test.js` parses the grid blocks of **this file** and compares them with
  `kit/mascot.js`, so the doc stays the source of truth.
- The SVGs in `docs/mascot/` are previews for review and the README, made from the same
  grids and the palette above (regenerated 2026-11-03 when the palette was corrected);
  they are not loaded at runtime. The `stale` preview is dimmed to 40 %, as the renderer
  dims a stale activity.
  `hello.svg` (README, 2026-11-03) waves `wave.1`/`wave.2` for 3 s at 500 ms, then
  rests on `idle` (CSS, once per page load; `prefers-reduced-motion` shows `idle` only).
- Contract: an adapter (or a D-Bus caller) sets `leading: {mascot: '<pose>', icon?}`
  (APPLE §B3). Data only — no actor, no timer, no size (rules 2, 3, 11).

## Poses

| Pose | Name | When | Lamp | Moves |
|---|---|---|---|---|
| `idle` | normal | default; brand; agent session open, nothing running | `#B4B2A9` | — |
| `sleep` | asleep | brand at night; empty states after `night` | `#444441` | — |
| `missed` | looking | something was missed (brand, Home empty state with history) | amber `#EF9F27` | — |
| `ask` | hand up | an agent asks for permission (`ask()`) | red `#E24B4A` | — |
| `done` | pleased | the agent finished | `#97C459` | — |
| `busy` | working | a tool is running | `#85B7EB` | loop, bobs into the water |
| `wave` | waving | greeting | `#FAC775` | once, then `idle` |
| `think` | thinking | prompt received, no tool yet | `#AFA9EC` | loop, thought dots |
| `turn` | your turn | the agent waits for you to type | foreground | — |
| `error` | sinking | a tool or the turn failed | `#5F5E5A` | — |
| `compact` | squeezed | the agent compacts its context | `#B5D4F4` | — |
| `stale` | faded | no update for `staleAfter` (drawn dimmed) | `#444441` | — |
| `party` | celebrating | done after a run longer than 10 min | `#97C459` | once, then `done` |

Every block is one frame: `<pose>[.<frame>]  lamp <colour>`. Moving poses have frames
`.1` and `.2`.

```bu
idle  lamp #B4B2A9
....LL....
....BB....
..BBBBBB..
.BBEBBEBB.
.BBBBBBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
sleep  lamp #444441
....LL..Z.
....BB.Z..
..BBBBBB..
.BBBBBBBB.
.BEEBBEEB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
missed  lamp #EF9F27
....LL....
....BB....
..BBBBBB..
.BBBEBBEB.
.BBBBBBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
ask  lamp #E24B4A
....LL..A.
....BB..A.
..BBBBBBA.
.BBEBBEBB.
.BBEBBEBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
done  lamp #97C459
....LL....
....BB....
..BBBBBB..
.BBEBBEBB.
.BBBEEBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
busy.1  lamp #85B7EB
....LL....
....BB....
..BBBBBB..
.BEBBEBBB.
.BBBBBBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
busy.2  lamp #85B7EB
..........
....LL....
....BB....
..BBBBBB..
.BEBBEBBB.
.BBBBBBBB.
.SSSSSSSS.
.BBBBBBBB.
W.WW..WW.W
.W..WW..W.
```

```bu
wave.1  lamp #FAC775
.A..LL....
.A..BB....
.ABBBBBB..
.BBEBBEBB.
.BBBEEBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
wave.2  lamp #FAC775
A...LL....
.A..BB....
..BBBBBB..
.BBEBBEBB.
.BBBEEBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
think.1  lamp #AFA9EC
....LL.D.D
....BB.D..
..BEBBEB..
.BBBBBBBB.
.BBBBBBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
think.2  lamp #AFA9EC
....LL.D..
....BB.D..
..BEBBEB..
.BBBBBBBB.
.BBBBBBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
turn  lamp foreground
....LL.DDD
....BB.D..
..BBBBBB..
.BBBBBBBB.
.BBEBBEBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
error  lamp #5F5E5A
..........
....LL....
....BB....
..BBBBBB..
.BEBBBEBB.
.BBEBBBEB.
WWSSSSSSWW
.WWWBBWWW.
W.WW..WW.W
.W..WW..W.
```

```bu
compact  lamp #B5D4F4
..........
....LL....
....BB....
BBBBBBBBBB
BEEBBBBEEB
SSSSSSSSSS
.BBBBBBBB.
..........
W.WW..WW.W
.W..WW..W.
```

```bu
stale  lamp #444441
....LL....
....BB....
..BBBBBB..
.BBBBBBBB.
.BEEBBEEB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

```bu
party.1  lamp #97C459
D...LL...D
....BB....
..BBBBBB..
.BBEBBEBB.
.BBBEEBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
D........D
WW.W..W.WW
```

```bu
party.2  lamp #97C459
....LL....
....BB....
..BBBBBB..
.BBEBBEBB.
.BBBEEBBB.
.SSSSSSSS.
.BBBBBBBB.
..BBBBBB..
W.WW..WW.W
.W..WW..W.
```

## Agents

An agent activity (kind `agent`, M4; the `ask` module uses `ask` from M3) maps its
source's events to poses in the adapter — pure, so every mapping is unit-tested. For
Claude Code hooks:

| Hook event | Pose | Notes |
|---|---|---|
| `UserPromptSubmit` | `think` | surfaces the activity |
| `PreToolUse` | `busy` | permission needed → `ask()`, pose `ask` until answered |
| `PostToolUse` with an error | `error` | until the next event |
| `Notification` (permission prompt) | `ask` | |
| `Notification` (waiting for input) | `turn` | |
| `PreCompact` | `compact` | |
| `SubagentStop` | `busy` | the parent keeps working |
| `Stop` | `done` (alert), `party` first if the run took > 10 min | ends after its ttl |
| no update for `staleAfter` | `stale` | the renderer dims it |
| `SessionEnd` | — | `end()` |

Codex's `notify` (turn complete) → `done`, or `turn` when it waits for input. A D-Bus
caller may send `{mascot}` directly and skip the adapter.

## Eyes — idle plan `mascot`

Only the eyes, centred in the 120 × 32 idle pill, in the foreground colour; the light
stays in its edge slot and the eyes react to it. **Four modes, not thirteen**: idle means
no activity, so the moving and activity poses (`busy`, `think`, `done`, `party`, `wave`,
`turn`, `error`, `compact`, `ask` as an activity) never occur here.

![Bu's eyes: the four idle modes](mascot/eyes.svg)

| Mode | When | Eyes (in the 120 × 32 pill) |
|---|---|---|
| `idle` | nothing to say | two bars 4.5 × 10, r 2.2, at x 49 and 66 |
| `sleep` | daypart `night`, or the user is away | two lines 9 × 2.4 at y 16 |
| `missed` | light amber | the bars shifted 6 px toward the light |
| `waiting` | light red (an `ask` waiting under DND) | two bars 6 × 15, r 3 |

Static: a mode changes only on an event (light change, daypart boundary, away/back);
never a blink. `idle-content = mascot` picks it; in `auto` it scores 10 like `clock`
(ties take turns) when it is in `idle-auto-plans`.

## Name

**Bu**. A quick web search on 2026-11-03 found no app or GNOME extension mascot called
Bu; the nearest are Pizza 4P's cheese mascot "BUU" and Gnomelets (pixel pets on the
GNOME desktop). Not a trademark check — do one before the EGO release. In Vietnamese
"bu" without tone marks is neutral.
