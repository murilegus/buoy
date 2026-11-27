# Tokens

Buoy's one table of numbers. Other pages (SPEC, NOTIFICATIONS, INDICATORS, the design pages) link
here instead of copying the numbers. Px numbers are for 1em = 11pt ≈ 14.67 px and scale with the em
([General rules](index.md#general-rules)).

## Bar and pill

| Name | Value | Notes | Status |
|---|---|---|---|
| Bar (panel) | 2.75em = 40 | | Decided |
| Pill, height | 32 = bar − 2 × 0.25em | idle, minimal, side pills | Decided |
| Pill, radius | 16 | half the height | Decided |
| Content box | height 24, 4 above and below | | Decided |
| Side padding | 8 | was 14 (`PAD`) | Decided |
| Gap leading → text, text → trailing | 6 | was 8: the round end makes 8 look wider than the padding | Decided (Ethan, 2026-11-12) |
| Gap trailing → button | 8 | | Decided |
| Leading | icon 24, filling the 24 content box; Bu 20 centred in a 24 slot (10 × 10 grid) | | Decided (Ethan, 2026-11-11) |
| Border | 1 px, white 12 %, inside the shape | | Decided |
| Idle | as wide as the widest plan, measured at run time: 131 at 1×, 136 at 1.25–2× | 8 + 24 + 6 + text + 8; the code rounds up to an even number (132) so the pill centres on a whole pixel | Decided |
| Light dot | 8, at the centre of the round end (16 from the edge) | only on pill 1 | Decided |
| Equaliser | 6 bars 2 × 14, gap 2, radius 1 | 22 wide; was 4 bars 3 × 12 (18 wide); stopping: falls in 200 ms; in the music compact: centred in the round button's 32 slot | Decided (Ethan, 2026-11-13) |
| Each end grows when it has a light | 20 = radius 16 + half the dot 4 | idle 131 → 171 | Decided |
| Side pill | 131, the same as idle; at most 2, on the right | | Decided (Ethan, 2026-11-11) |
| Hover | width plus 0.75em (12), height plus 2 as now (32 → 34) | replaces × 1.10 | Decided (Ethan, 2026-11-11) |

## Compact

| Name | Value | Notes | Status |
|---|---|---|---|
| Height | 56 + 16n, at most 152 | a 56 head, then 16 lines | Decided |
| Radius | 28 | | Decided |
| Head | 56: leading 40, 8 above and below, 14 on each side | | Decided (Ethan, 2026-11-11) |
| Round button | 32, centred at y = 28 | | Decided (Ethan, 2026-11-11) |
| Cover (music) | 72, 8 from the edge, radius 20 | music 88 | Decided |
| Row (Claude Code, missed) | 16, icon 16; 8 above, 8 below | 88 / 104 / 120 | Decided (Ethan, 2026-11-11) |
| Notification card | body 8 below the head, 12 above the buttons; buttons 12 from the edge, height 32, radius 16 | 136 / 152 | Decided |
| Ask | as the card | 120 / 136 / 152 | Decided |
| Multiple-choice question | a 28 row per choice, 4 apart (step 32) | up to 276 | Decided (Ethan, 2026-11-11; 4 apart: 2026-11-13) |
| Width | fixed min(28em, 0.72 × expanded); fits its content only in the pill | 404 at 1920, 410 at 2560 | Decided (Ethan, 2026-11-12; was 16em … min(…), fitting its content) |

## Expanded

| Name | Value | Notes | Status |
|---|---|---|---|
| Width | clamp(0.28 × screen, 560, 760) | | Decided |
| Height | by content, 56 + 16n, at most width/2 rounded down | 280 / 344 / 376 at 1920 / 2560 / 3440 | Decided |
| Radius | 28 | | Decided |
| Tab strip | height 32, 12 from the top edge | radius 16, concentric | Decided |
| Home: main card | what is left: 104 / 168 / 200 at 1920 / 2560 / 3440 | tall layout from 160 | Decided (Ethan, 2026-11-11) |
| Home: tile | height 100, width ≥ 120, 8 apart; a wide tile takes 2 shares | N = 4 / 5 / 5 | Decided (Ethan, 2026-11-11) |
| Head without tabs | 88 = 16 + leading 56 + 16, leading radius 12 | greeting 88 | Decided |
| Scrollbar | 3 bar, fully rounded, in a 7 lane (2 from the edge) | replaces GNOME's solid grey 8 bar; the list narrows when the bar is there, it does not cover the rows; keeps this style even while the old tab fades out on a tab change | Decided (Ethan, 2026-11-21; thinner 2026-11-23) |

## Maximum width on the bar

Take the smallest of three limits: by em, by a share of expanded, by the free space between the two
clusters. **Decided**

| | Smallest | Largest | 1366 / 1920 | 2560 / 3440 |
|---|---|---|---|---|
| Idle, side pill | 131 | 131 | 131 | 131 |
| Minimal, pill 1 | 131 | min(24em, 0.6 × expanded, free space) | 336 | 352 |
| Compact | fixed | min(28em, 0.72 × expanded) | 404 | 410 |
| Expanded | 560 | 760 | 560 | 716 / 760 |

## Type

| Name | Value | Line height | Status |
|---|---|---|---|
| Text in the pill | 1em, weight 600, tabular figures | 18 | Decided |
| Title | 1em, weight 600 | 18 | Decided |
| Subtitle, body, row | 0.85em | 16 | Decided |
| Smallest | 0.85em; GNOME uses no text below 9pt ≈ 0.82em (`%caption`) | — | Decided |

Line heights measured with Pango in SF Pro Display 11pt. Two lines of 1em + 0.85em need 34, so a 32
row holds only one line ([Alerts and asks](alerts-and-asks/index.md)).

## Timing

| Name | Value | Status |
|---|---|---|
| Alert shown | 5 s, held while hovered | Decided |
| Compact shown after hover | 300 ms | Decided |

## Motion

Springs by `d` (perceived duration) and `bounce`: mass 1, stiffness (2π / d)², damping
(1 − bounce) · 4π / d ([Motion](motion/index.md)). Settled: under 0.5 px from the target over a
400 px travel.

| Name | d | bounce | Overshoot | 95 % at | Settled at | Status |
|---|---|---|---|---|---|---|
| `snap` | 240 ms | 0.15 | 0.6 % | 141 ms | 327 ms | Proposed |
| `size` | 240 ms | 0 | 0 | 182 ms | 344 ms | Proposed |
| `move` | 400 ms | 0.20 | 1.5 % (compact 4 px wider) | 216 ms | 532 ms | Proposed |
| `open` | 500 ms | 0.25 | 2.8 % (expanded 12 wider, 7 px taller) | 249 ms | 631 ms | Proposed |
| `close` | 360 ms | 0 | 0 | 272 ms | 515 ms | Proposed |

| Name | Duration | Curve | Status |
|---|---|---|---|
| `fade-out` | 100 ms | ease-out | Proposed |
| `fade-in` | 200 ms | ease-out | Proposed |
| `state` | 120 ms | ease-out (CSS) | Proposed |
| `idle` | 300 ms | ease-in-out | Proposed |
| Grace when leaving compact | 200 ms | | Decided |
| One step when scrolling on idle | 400 ms | | Decided |
| Selection mark and body on a tab change | shift 12 px | | Proposed |
| In-place list | arrives from 24 px | | Proposed |
| Pill press | shrinks 4 px each way | | Proposed |
