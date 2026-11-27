# Design

Every decision about how Buoy looks: sizes, gaps, radii, type, colour. The SPEC says what Buoy
**does** and when; these pages say what it **looks like**. Design pages are written and decided in
Vietnamese first, then translated into English.

**Status** of each decision: **Decided** = Ethan has decided · **Proposed** = Claude proposes,
waiting for Ethan's review · **Open** = not decided yet. Each Decided line gives the date and who
decided, where known.

The changes here are not in the code yet: they are the M4 (v0.2) redesign items in
[FEATURES](../FEATURES.md). Each page has an "In the code" section listing what has to change
when the work is done.

## The parts

| Part | Contents |
|---|---|
| [Tokens](tokens.md) | every shared number: the bar, pill, compact, expanded, radii, gaps, type |
| [Colours](colours/index.md) | colours by role, the light and the dots, what follows GNOME |
| [Pill](pill/index.md) | idle, minimal, side pills, the light at either end, text, width on the bar |
| [Compact](compact/index.md) | the hover shape: the head, music, the Claude Code row, the notification card |
| [Alerts and asks](alerts-and-asks/index.md) | the 5 s alert, the ask with buttons, several questions |
| [Expanded](expanded/index.md) | the panel that opens on click, the greeting |
| [Home](home/index.md) | the main card, the row of tiles, how it is filled so it is never empty |
| [Tabs](tabs/index.md) | the tab strip and the shared rules; one page per tab |
| [Media](media/index.md) | the Media tab: a card like Home's, chips for several players, buttons and bar always complete |
| [Device](device/index.md) | the Device tab: one column per group, tile 58, "+N", a page on click |
| [Icons](icons/index.md) | time-of-day and weather icons |
| [Bu](mascot/index.md) | Bu's size in each shape |
| [Motion](motion/index.md) | Dynamic-Island-style springs, each transition, interaction, when interrupted |

## General rules

- **The unit is the em.** At 11pt, 1em ≈ 14.67 px (Ethan's font: SF Pro Display 11, display scale
  1×). Every px number on these pages is for 1em = 11pt and scales with the em: turn on large text
  and the bar, the pill and the gaps all grow. **Decided**
- **Measured from the outer edge.** The 1 px border sits inside the shape (as `box-sizing:
  border-box`), so every measurement is taken from the outer edge. **Decided**
- **Heights on a 16 line.** Compact and expanded are always **56 + 16n** tall: a 56 head, then
  content on 16 lines — one step is one line of 0.85em text. **Decided** (Ethan, 2026-11-10)
- **Concentric radii.** A shape inside another, a distance d from its edge, has radius = outer
  radius − d (compact's radius 28, padding 8 → cover radius 20; padding 12 → button radius 16).
  **Decided**
- **Widths are measured from the real text at run time,** not hard-coded: the same text is a
  different width in each font and at each display scale. **Decided**
- **A change of shape is one growth:** minimal < compact < expanded, on every screen. **Decided**
- **One set of sample content for every image**, so the images can be compared, in one place
  (`render/lib.js` `SAMPLE`, `COVER`). Music: the song **Sóng Ngoài Khơi** by **Hải Đăng**, on
  Spotify (pill "Sóng Ngoài Khơi · Hải Đăng", subtitle "Hải Đăng · Spotify"), a diagonal orange →
  purple gradient cover. Person: **Quỳnh Trâm**, **Trâm** for short (a Slack message in #design, a
  call). **Decided** (Ethan, 2026-11-12)

## Redrawing the images

The images are drawn with gjs + cairo, straight at 3× so they stay sharp when zoomed:
`scripts/render-design.sh` redraws them all. Each part has `images/` (the images) and `render/`
(the scripts); `render/lib.js` is shared (measures text at 1×, stretches the text 3× to match).
Each image is drawn in two versions at once: `x.vi.png` (Vietnamese labels) and `x.en.png`
(English); the script picks the words with `lib.js`'s `t(vi, en)`. An image with no words keeps a
single `x.png` for both sites. The English version uses the exact strings Buoy shows (buttons, tab
names, times); the sample content (songs, names, messages, file names) is the same in both.
Images captured from the Shell are not redrawn: their compositing scripts and source images live
outside the repo.
