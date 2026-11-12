# Buoy — spec v0.1 (test build)

uuid `buoy@murilegus` until a final name is picked. Everything here is a
decision for the first test build; any of it can change after trying it.

## 0. What this is, and is not

**A living pill, not a notch assistant.** The island is a floating iPhone-style
pill that reacts to what the system is doing. The **pill** is not a place to talk to
an AI, drop files, or browse tools. Expanded may host a few tool tabs (off by default,
§2b), but nothing in the pill ever comes from them.

- Pure GNOME Shell extension. Ships on extensions.gnome.org, installs in one click,
  updates through the Extensions app. No daemon, no binaries. `install.sh` is the one way
  around EGO (README), reading a GitHub release.
- No polling while closed, no blur, nothing animating while idle.
- Every feature must be reachable from GNOME Shell's own APIs plus GLib/Gio/Soup.

**Out of scope by design** (they need a daemon, root, or a GTK helper; Isle covers
them well): voice assistant, file shelf / drag-and-drop tray, battery charge limit,
anything that runs or installs software, AI plan usage, lyrics overlays across the
screen. A third party may add such things through the D-Bus API later; Buoy
itself never grows a daemon.

Related projects: Isle (notch + assistant, Rust daemon), NexNotch (dashboard),
Islet (Quickshell, not GNOME), Notchy (macOS, paid).

## 1. Top bar layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▣ Firefox              ( ● 31° )              ◯ vi ▪   [ ᯤ ⌁ ▮ Fri 2:13 ]      │
│ left cluster           island (pill)          tray     system cluster          │
│ (bare; bg on hover)    idle: weather plan     (bare,   QS indicators + clock   │
│                                                each     (bare; bg on hover)     │
│                                                alone)                           │
└──────────────────────────────────────────────────────────────────────────────┘
  hover left:  [▣ Firefox · ⊞ 2]        hover pill: ( ● 31° · feels 35° / wind, humidity )
  no app:      [⊞ 2]                    click pill: Home · click left: Overview
```

- Panel: transparent, 40px. Two clusters plus the island.
- **The Overview opens and closes on the whole wallpaper** (Ethan, 2026-11-04). Shell sizes
  the Overview's workspace backgrounds to the work area — the monitor minus the struts —
  and clips them there (`shell-workspace-background.c` allocate; `workspace.js`
  `_bin` clip_to_allocation and `_updateRoundedClipBounds`). Under GNOME's opaque bar
  that is all one sees; under a see-through one the strip behind the bar stayed the
  Overview's dark backdrop through the animation — and from the first pixel of a
  three-finger swipe — then jumped to the wallpaper at the end. `reach.js` lets both
  clips reach out over every strut by `strut × (1 − state)`: exactly GNOME's with the
  Overview shown (pixel-identical), the whole monitor at the desktop, the same curve in
  between. The text under the bar follows what is there: the wallpaper's contrast below
  state 0.5, the Overview's (light text) from 0.5. `state` is how far the Overview is
  open — its controls' adjustment, 0 hidden, 1 window picker, 2 app grid
  (`overviewControls.js`), clamped to 1 — not the background's own state, which Shell
  sets back to 0 in the app grid (`workspacesView.js`): that kept the wallpaper's dark
  text over the app grid's dark backdrop (Ethan 2026-11-04).
- **Cluster background** (decided 2026-10-30): **none by default** — icons and text sit
  bare on the wallpaper like the iPhone status bar; only the pill is a black block. On
  hover a translucent rounded background (no blur) wraps the whole cluster. Setting
  `cluster-background = never | hover | always`, default **`hover`**, with
  `cluster-radius` (0–16 px, default **16** = a pill like the island) and
  `cluster-opacity` (5–100 %, default **17**) under it in prefs (Ethan, 2026-11-04; briefly
  `never` / 12 / 35 / 20 earlier the same day). The background is filled as GNOME fills a
  panel button, so it matches a tray button's hover (2026-11-04, was black): the panel
  foreground colour (the side's text, white or dark, from the contrast below) at `cluster-opacity`, and while the system cluster's menu is open 11 points
  more, 15 when also hovered — Shell 50 `_drawing.scss` `panel_button`'s .17 / .28 / .32.
  `always` draws the opacity at rest and on hover. A cluster with nothing to show has no
  background at all (no empty stub), and the background stays 4 px off the screen edges.
- **Contrast on light wallpapers**: like iPhone, the text flips, not the background.
  Setting `cluster-contrast = auto | dark-text | light-text`, default `auto` (prefs:
  Icons and text — Automatic / Dark / Light; it recolours icons, tray glyphs and the tray's
  hover too, so not "Text colour", 2026-11-04). The values name the text, not the wallpaper,
  so they are not taken for GNOME's light/dark style, which is another thing: it styles
  Shell's menus and picks `picture-uri-dark`, and whether it recolours the panel depends
  on the theme (Adwaita does, Yaru keeps `#f2f2f2` on a `#131313` bar); on Buoy's
  see-through bar what is behind the text is the wallpaper, so `auto` follows that alone
  (2026-11-04).
  - Each side on its own: the left box, and the right one — the tray **and** the system
    cluster (Ethan 2026-11-04: the tray follows too, chosen from rendered samples). The
    class goes on that box: `buoy-dark-text` or `buoy-light-text` (not `buoy-light`, the
    island's light's class).
  - Measured: the file Shell draws (`picture-uri`, or `picture-uri-dark` under
    prefer-dark — `background.js` `getBackground`) placed as Mutter places it for
    `picture-options` (`meta-background.c` `get_texture_area`), the colours around or
    instead of it (`none`, the bars of `scaled`/`centered`, transparency); mean WCAG
    luminance of the top 40 px under the side; dark text when it reads better than
    white (the two cross near 0.2).
  - Signals only: the background keys and `color-scheme`; the image is decoded once per
    change of what is drawn (GdkPixbuf, async, 512 px wide) and kept, so a monitor change
    or a cluster moving only re-measures. Nothing is watched or decoded unless `auto`.
  - The Overview: light text once its dark backdrop is what shows under the bar (state ≥ 0.5,
    see the Overview above). Unknown (decoding, a missing file,
    a slideshow `.xml`, which changes over the day and is not followed): light text, as
    before. A file replaced in place keeps its old measure until the next change.
  - Foreground only: labels and symbolic icons, white (as GNOME's own see-through panel,
    `$transparent_panel_fg_color`) or `#1a1a1a`; full-colour icons, menus and the filled
    recording/sharing indicators stay GNOME's.
  - No shadow under the text, Automatic or forced, as GNOME's panel (`_panel.scss`). A 1 px
    shadow in the wallpaper's tone was tried for busy wallpapers: forced, it drew a second,
    opposite edge; Automatic, on a wallpaper of mixed tones it still read as a doubled,
    blurred edge (Ethan 2026-11-04, both).
  - A tray button's highlight follows the text by GNOME's own formula: the foreground at
    .17 hovered, .28 open, .32 open and hovered (`_drawing.scss` `panel_button`). Yaru
    compiles it to a fixed light grey, nearly invisible on a white wallpaper (Ethan
    2026-11-04). panel.js marks the plain tray buttons (`buoy-tray-button`; St has no
    `:not()`), so the filled indicators keep their coloured highlight.
    It fills the whole 32 px button, the cluster background's height: GNOME's 3 px
    transparent border (which made it a 26 px circle) is dropped on those buttons, and
    the fill is their background, since St paints an inset shadow only over a border or
    a background (Ethan 2026-11-04).
  - One-colour bitmap tray icons count as glyphs (Ethan 2026-11-04): Electron apps
    (Claude, Discord…) send their tray icon as a white PNG through AppIndicator
    (`IconThemePath` + `IconName`, read by `appIndicator.js` into a FileIcon), which
    `color` cannot reach, so on a light wallpaper it vanished. An icon whose shown pixels
    are ≥ 97 % near-white is drawn in the text colour on a dark-text side
    (`Clutter.ColorizeEffect`); a logo — several colours, or one brand colour — keeps its
    look (Slack, Firefox). Each picture is read once, at 32 px, and only after the right
    side has first turned dark-text. A dark one-colour glyph is left as it is: on light
    text it is as invisible as on GNOME's own dark bar. The cluster background takes the side's text
    colour, as a panel button's hover does. The pill is always black and unaffected.
- **Left cluster** (decided 2026-10-30): two layers of information in one place.
  - Normal: icon + name of the focused app (`Shell.WindowTracker`, `notify::focus-app`). The
    icon is the app's own; if the theme has none, its monochrome `<icon>-symbolic`, then a
    plain window (`window-symbolic`, else `focus-windows-symbolic`) (Ethan, 2026-11-04).
  - Hover: the cluster widens and appends the workspace as a secondary item: grid icon +
    number ("Firefox · ⊞ 2"), or the workspace name if the user set one ("Firefox · ⊞ Work").
    No "WS" abbreviation; the icon carries the meaning.
  - No focused window (empty desktop, Overview): the workspace is the main content — grid
    icon + its number ("⊞ 2", as on hover; 2026-11-04, Ethan: no "Workspace" word), or
    its name. Screen readers still hear "Workspace 2". Setting
    `left-cluster-empty = workspace | hidden`.
  - Click → Overview (replaces the hidden Activities button; same corner people already
    aim for). Right-click → app menu (New window, Quit, Details). Scroll → switch workspace.
- **Third-party tray icons** keep GNOME's own per-item hover highlight and colours; Buoy
  never wraps them. Their text and symbolic icons follow the contrast above (dark on a
  light wallpaper, 2026-11-04). Their size is made the same (2026-11-04, Ethan): every tray
  button is a 32 px square (16 px of content), its hover a fill of the square, the
  input-method label ("vi", "en") centred in it too.
- **Right side** (decided 2026-10-30, after the Notchy bar): two different things.
  - **Third-party tray icons** (AppIndicator, input method, screen-record…): bare on the
    wallpaper, each standing alone, GNOME's own order. No cluster background.
  - **System cluster** (revised 2026-11-02): GNOME's **quick settings indicators**
    (network, volume, battery…) together with the **clock** (`dateMenu`, moved from
    centre), as **one button** with the shared hover background. A click anywhere in the
    cluster, clock included, opens the stock quick-settings menu; the clock has no click,
    hover or focus of its own (restored on disable). It stays *reactive* — only its click
    gesture is off — because `Panel.toggleCalendar` (Super+V) does nothing on a
    non-reactive button (`ui/panel.js` `_toggleMenu`, 2026-11-04). With a panel menu
    open, hovering the clock does not slide to the calendar either (the panel's menu
    manager leaves it out of hover/focus switching, 2026-11-04). Its unread dot
    (`MessagesIndicator`) leaves the layout — the buoy light (§2a) says "missed". The
    pieces drop their own highlight and padding: the cluster background is the hover (and
    stays while either menu is open), and the clock sits 12 px from the last indicator,
    the same gap the indicators keep (2026-11-04). The clock's format is GNOME's own
    (`org.gnome.desktop.interface` clock-show-weekday/-date/-seconds, clock-format;
    `org.gnome.desktop.calendar` show-weekdate): Buoy's Panel page shows those same keys,
    so it and Settings → Date & Time stay in sync, and Shell's clock follows them. Buoy's
    default is the time alone, 24-hour (`14:05`): written once, on the first enable, to
    the keys the user never set (`clock-defaults-applied`), never reverted (Ethan,
    2026-11-04). Nothing is re-anchored.
  - **Dock** (Ubuntu Dock, 2026-11-04, Ethan): the Panel page carries its rows like the
    clock's — Auto-hide, Panel Mode, Icon Size, Show on, Position, Show Trash, Show
    Volumes — on the dock's own `dash-to-dock` keys, so Settings → Ubuntu Desktop → Dock
    and Buoy's prefs stay in sync. Buoy's default suits the see-through bar and the
    island: the dock at the bottom, auto-hiding, not edge to edge, 32 px, on the primary
    display only, without trash or volumes — written once, on the first enable, to the
    keys the user never set (`dock-defaults-applied`), never reverted (Ubuntu's own: left,
    fixed, edge to edge). "Show on" names and numbers the displays as Settings does, from
    Mutter (`DisplayConfig` GetCurrentState: "Primary Display (1)", "1. Built-in display").
    Both groups say "The same settings as …: synced both ways". Hidden where the dock is
    not installed.
  - The stock calendar/notifications popover is no longer reachable by mouse; Super+V /
    Super+M (`toggle-message-tray`) still open it under the clock. Its contents move to
    Buoy: notification history → the notifications tab (§6), calendar and weather →
    Home (§3) and idle plans, DND → the stock quick toggle (`status/doNotDisturb.js`).
    World clocks: placement later (Home or elsewhere), not in v0.1.
- The island holds **activities only**; persistent system status stays in the system
  cluster. (This supersedes the earlier "indicators in the pill" decision.)

### 1a. Windows against the top bar: rounded top corners

*Decided 2026-11-02; tiled and top edge 2026-11-04.*

Floating windows already have round corners (Adwaita `--window-radius`, 15 px in
libadwaita 1.9 on Ubuntu 26.04), but Adwaita sets it to 0 when maximized or tiled.
With a transparent panel the maximized window's square top edge meets the wallpaper and looks
cut off. Buoy rounds the **top-left and top-right corners only** of windows whose top edge meets the bar,
so the top edge reads as a continuation of the floating windows; the bottom corners stay
square against the screen edge or dock.

- **On by default.** `window-corners` (b, default `true`), `window-corners-radius`
  (i, default `15` = Adwaita's window radius, range 0–32). Both live on their own prefs
  page (**Windows**), not under a module; changes apply live.
- **Which windows**: every normal window whose top edge is on the work area's top
  (`kit/model/rounded.js` `onTopEdge`), not fullscreen, any toolkit (GTK, Qt, Electron,
  Xwayland): maximized vertically — fully maximized, tiled left or right, maximized
  vertically alone; Mutter pins the top edge then (`window.c` `update_edge_constraints`)
  and the client, told `tiled-top`, drops its own top radius — or a frame that starts on
  that line: Ubuntu's tiling-assistant top quarters (pinned with `override_constraints`,
  which JS cannot read back) and a window moved up against the bar (Ethan 2026-11-04).
  Both top corners round, the inner one of a tiled pair too, so tiled windows meet under
  the bar like floating ones. A floating window that already draws round corners looks the
  same; one that draws square ones (Qt, some Electron apps) is rounded there too. On a
  floating window only pixels inside the frame are cut: its own shadow is kept. A window
  maximized vertically (tiled) also loses what lies above its frame and, in the two corner
  squares, beside it: told `tiled-top` but not tiled on its inner side, the client still
  draws a square 1 px border just outside the frame there (GTK 3, GTK 4, the X11 frames
  client), which framed the arc; below the arcs that side keeps its border (2026-11-12, #196).
- **How** (`corners.js`, next to `panel.js`): a `Shell.GLSLEffect` on the window's
  `Meta.WindowActor` that discards the pixels outside the two top arcs — the pattern
  `ui/lightbox.js` (RadialShaderEffect) uses. Whatever is behind shows through the
  corner: the wallpaper under the panel, another window, the Overview. Added on
  maximize, removed on unmaximize, fullscreen, `window-corners = false`, window close and
  disable. Signals only (`window-created`, `workareas-changed`, `notify::maximized-*`,
  `notify::fullscreen`, `position-changed`, `size-changed`); no polling, nothing animates. On unmaximize the effect stays until the window manager's
  `size-changed`: Shell freezes the actor at `size-change`, before the state flips, and
  thaws it once the client has drawn the new size — dropping it at the flip showed the
  frozen window square for a frame (2026-11-04).
- **Cost, accepted**: an effect makes Clutter paint that window through an offscreen
  buffer, and Mutter stops culling windows behind it (`meta-cullable.c`
  `has_active_effects`), so windows under a maximized one are painted again inside the
  damaged area. Only windows on the top edge carry the effect; with the setting off
  nothing is attached. A window restored to exactly the work area gets no `size-changed`,
  so its corners stay until its next size change. Measured (2026-11-04): one maximized over four floating 1.23 ms a frame
  (1.00 off), five maximized 1.01 (1.06 off); the GPU side not measured.
- **Rejected**: two corner caps in top chrome painting a clone of the wallpaper — no
  offscreen and no culling loss, but wrong whenever another window sits behind or is
  raised over the corner, and it would have to hide during every move/maximize
  animation and in the Overview.

## 2. Island states

Three tiers (decided 2026-11-05, Ethan), named by size: **minimal** < **compact** <
**expanded**. Apple's words, not Apple's mapping (CONTRACT.md §2):
- **minimal** — resting in the bar: one line, 32 px tall at 1em (it grows with the font), one to three pills.
- **compact** — on hover: the hovered pill itself grows in place into a short panel, 56 to
  120 px tall, over the top of windows (and the system cluster, if it must). No Apple
  equivalent; it replaces the old hover peek, which only swapped a pill's content.
- **expanded** — on click, or opened by the stack: the panel with tabs; it carries what
  compact has no room for (media: player choice, the app's volume, shuffle/repeat).

The code uses these names since 2026-11-05 (before: compact for minimal, peek for compact).

| State | When | Shape | Interaction |
|---|---|---|---|
| **Idle** | no activity | 132×32 r16 at 1× (as wide as the clock at its longest, measured: §4); content per `idle-content` (§2a) | hover → +0.75em width, +2 height, and with the amber light the missed list as a compact; press → a pulse; **click → open Home** |
| **Minimal** | one or more activities | pill 1 (highest priority) at screen centre, content-fit; up to two side pills to its right, each the idle's size, as many as fit before the system cluster (§2c) | hover a pill 300 ms → its compact; **click → that activity's tab**, Home on the `+N` badge or while the missed list shows (2026-11-04) |
| **Compact** | the pointer rests on a pill; an alert (5 s); an ask, until answered | the pill grows in place: top edge kept, width fixed at min(28em, 0.72 × expanded) — content-fit is the pill's alone (2026-11-12, Ethan); height 56 + 16n up to 152 (§4, design/compact); an ask's card of choices up to expanded's height (2026-11-12, design/alerts-and-asks "Hỏi nhiều lựa chọn") | the activity's compact content (media: art 72, transport and its bar), or the amber missed list instead (INDICATORS.md); its buttons run their action, a click elsewhere on it = the pill's click; hovered, it collapses 200 ms after the pointer leaves; an alert's stays 5 s (longer while hovered), an ask's until it is answered (its keys work after Super+B) (2026-11-12, design/alerts-and-asks) |
| **Expanded** | opened from idle, minimal or compact by a click; by the stack for a transient | `EXPANDED` (see §4) | only a click outside collapses (or Esc after a click-open), at once; clicks inside do nothing, buttons run their action (decided 2026-11-01) |

Rules:
- Pill closed = live activities only, no UI chrome. Expanded = Notchy-style panel.
- Expanded opens **Home** from idle, or the **activity's own tab** from its pill (minimal or
  compact).
- A tab strip exists only inside Expanded (Home · Media · Timer · …). Pill never shows tabs.
- Activity ends → removed immediately. `ttl` for short-lived ones (feedback §2e,
  notifications).
- **What only waits goes after `activity-linger`** (5, 10, 20 or 30 minutes; 5 by
  default; one rule for every module, 2026-11-07, Ethan): an activity marked `linger`
  — a paused player, a coding agent done or waiting for you — ends when nothing new
  happens for that long; every update starts the wait again, the pointer on its pill
  holds it. A permission prompt nobody answers is denied after the same wait.
- **Which pill is first: [PRIORITY.md](PRIORITY.md)** (2026-11-07, Ethan): by state
  (needs you › running › waiting), then the kind's priority, then fresh before stale,
  then the newest. Feedback (§2e) and transient interrupt, then
  the previous returns. Transient is Apple's `style: 'transient'` (greeting, a picker): it
  opens expanded; feedback never does (2026-11-05: the two were mixed up here).
- Alert (2026-11-12, design/alerts-and-asks; was expanded for ~2 s): the shown activity opens
  its compact in place for 5 s (stays while hovered), or pulses if it has no compact; an alert
  on a covered activity brings it up for 5 s, then the top returns (§2c: an activity with a
  pill of its own alerts on that pill). An ask is a card at the compact's size (Bu, the
  question, the buttons) and stays open on its pill until it is answered.
- A click-open takes the keyboard (modal, so Esc works); automatic opens (alert, ask,
  transient) never do, so typing elsewhere is not interrupted.
- Fullscreen (2026-11-03): the island hides with the top bar on a monitor showing a
  fullscreen window (Shell's `trackFullscreen`; it shows again in the Overview), and an
  open island closes. While hidden nothing opens or alerts; activities that end count as
  missed (amber light on return), an unanswered ask lights red. Back on screen, an ask or
  transient on top opens as if it had just arrived. Super+B does nothing while hidden.

### 2a. Idle content

*Decided 2026-10-30.*

Setting `idle-content`, default `auto` (changed from `none` 2026-11-03). Each value is an
**idle plan** provided by a module (`modules/<id>/idle.js`), so the list grows with modules
and shrinks when they are off; `auto` and `none` are the kit's own.

| value | what the pill shows | module | refresh |
|---|---|---|---|
| `auto` | the idle plan that matters right now, chosen and rotated by context (§2a-iii) — a smart stack, not a random carousel | core | plan signals + one re-rank timer while idle |
| `none` | black pill + the **buoy light**: a small dot at its left end (grey, amber or red). Off normally; lit when something was missed (§6 missed history) | core | event |
| `clock` | a *second* clock, styled unlike the one in the right cluster: an icon of the part of the day + the time in bold even figures. Six icons, one per daypart (`kit/model/daypart.js`, §2d): the sun along an arc over the horizon (dawn and evening half-set in peach `#FFB889`, morning/noon/afternoon in yellow `#FFD23F`; palette A, `scripts/icons.js`), then the moon; colour SVGs at 20 px like art and Bu, no state colour (2026-11-04, Ethan). The time is GNOME's: 12/24 h (`clock-format`), locale, and seconds when Date & Time shows them (`clock-show-seconds`). Variants via `idle-clock-style` (2026-11-08, Ethan): icon and the part of the day in words ("Afternoon", the default) · icon and time · icon only · the part of the day in words · time only; the old "with seconds" left for GNOME's own setting | `clock` | GNOME's wall clock (`GnomeDesktop.WallClock`, as the lock screen): a tick on the minute (each second with seconds), right after suspend; it exists only while the idle pill is on screen |
| `weather` | condition icon + temperature ("31°", the user's unit, rounded as the date menu's forecast); its compact (hover): "31° · Partly cloudy" over "Feels like 34° · Wind NE 12 km/h · Humidity 75%", each part left out when unknown; the day itself is Home's (§3). Icons are Buoy's own colour SVGs, one per GNOME condition (13, with clear and few-clouds at night), one family with the clock's dayparts (`scripts/icons.js`, palette A: soft blue cloud, yellow sun, teal moon, rain and wind) — GNOME's symbolic icon as fallback (2026-11-06, Ethan: the symbolic ones read flat). **The place** (2026-11-06, Ethan: GNOME Weather is not installed on Ubuntu, and without it Shell's client never locates): the first of `org.gnome.shell.weather` `locations`, the key GNOME Weather and the date menu use. "Use my location" (`idle-weather-automatic`, on by default): each ask first asks Geoclue once as `org.gnome.Shell` (a system app in geoclue.conf: no dialog, bounded by Location Services) and puts the nearest GWeather city first there; Geoclue is stopped right after. Off: a city searched under the plan on the Island page (GWeather's own cities, accents ignored). Location Services off → "Location Services is off" with an Open Settings button (Privacy). **Units** (2026-11-06, Ethan: an en_US session showed °F in Vietnam): GNOME Weather's own keys, `org.gnome.GWeather4` `temperature-unit` / `speed-unit` — GWeather's own default reads only the locale. Buoy's first enable sets them to °C and km/h where the user never chose (`weather-defaults-applied`, like the clock's keys); prefs has Temperature and Wind speed under the plan, shared with GNOME Weather, Automatic last (the locale's). No place or no data → the pill keeps only the light, and the plan's row says why | `weather` | the date menu's own `WeatherClient` (`misc/weather.js`, `dateMenu.js` WeatherSection) — same place, no second client; asked for news only while the idle pill shows it: at once when older than `idle-weather-refresh` (30 min / 1 h), then on that interval (2026-11-06) |
| `next-event` (`idle-content` `calendar`, "Next Event") | today's next event: the calendar icon, the title, the time at the end ("3:00 PM", "until 4:00 PM" while it runs, "all day"), so a long title ellipsizes and the time stays; the pill grows past the idle size to fit, up to the minimal cap (2026-11-08). Compact: the title over "3:00 PM – 4:00 PM · in 25 min". One starting within 30 min comes before one running; then an all-day event, unless `idle-calendar-all-day` is off (2026-11-08); nothing left today → nothing (only the light). No Join glyph: Shell's calendar server sends only id, title and times (M4 "Meeting in 5 min · Join") | `calendar` | the date menu's event source (`changed`); the wall clock's minute moves it |
| `mascot` | Bu's eyes in the pill, four modes — idle · sleep · missed · waiting; in `idle` the eyes stroll in pixel steps: look, walk, blink, smile, one beat every few seconds (`idle-mascot-stroll`); asleep after 60 s without input, in power-saver and with animations off (`MASCOT.md` § Eyes, 2026-11-03) | `mascot` (off by default) | light changes, daypart, idle monitor, power profile; one beat timer only while strolling |

Rules: an idle plan is presentation only (same data shape as an adapter); it never
surfaces an activity; it is replaced the instant any activity surfaces; nothing animates
while idle — no looping or continuous motion; a change of idle content (the clock's
minute, `auto` switching plans) is one transition (§5), then stillness (clarified
2026-11-03). Each plan's own settings sit under it on the prefs **Island** page (2026-11-04,
ARCHITECTURE rule 9). `idle-content` defaults to `auto` (2026-11-08, when it landed; it was
`clock` until then, Ethan, 2026-11-04); with a plan the grey "off" light is not drawn, amber and red still are.

Pill structure is the same in every state: `[light] leading · text · trailing [dot]`.
The two ends are Buoy's own status lights; the three zones between them belong to the plan
(idle) or the adapter (minimal). **The lights live at pill 1's ends** (2026-11-10, Ethan;
design/pill "Đèn ở hai đầu"; built 2026-11-12): an 8 px dot at the centre of the end's round
cap (16 from the edge at 1×), and the pill grows at **both** ends by that radius and half the
dot (16 + 4 = 20 at 1×; idle 132 → 172), so the content never moves — even for one light.
No light, no growth. The cap is the whole pill's, the lights counted: at pill 1's cap the text
ellipsizes as any long text. A light coming or going is one small morph. Side pills, a
compact, a card and expanded have no light: it is back as soon as pill 1 rests again. The
grey "off" light is drawn only in idle `none`, so an empty pill never looks broken.

### 2a-i. The buoy light (pill 1's left end, idle and minimal)

Static, never blinking. Off (faint grey, idle `none` only) · **amber** = something ended while the island
was hidden (fullscreen; away and DND are M4) (missed history: hover names it, opening Home turns it off — 2026-11-03), or GNOME's
notifications nobody has seen (off once the Notifications tab or GNOME's list shows them —
2026-11-08, NOTIFICATIONS.md §2) · **red** = something
is waiting for your answer (an `ask` that could not show). Red › amber. Shown on pill 1 in idle and minimal, at its
left end (§2a above), never among the zones, so it never competes with the app icon; the pill
draws it (`kit/ui/pill.js`), not the content. Not on side pills, nor in a compact, a card or
expanded (2026-11-10: the compact only shows under the pointer, and Home lists what was
missed).

**Bu's lamp is not the light** (2026-11-08, Ethan; it was from 2026-11-03): a pill Bu
leads (`{mascot}`, agent activities and the greeting) draws the end's dot like any other,
and Bu's lamp keeps its pose's colour (INDICATORS § Bu's lamp) — the lamp is too small to
read as the light, and an amber that stayed while notifications were unseen hid the
agent's colour.

### 2a-ii. Privacy dot (pill 1's right end, idle and minimal)

Mirrors iOS and the buoy light: a small **orange** (mic) / **green** (camera, screen
share) dot at the centre of pill 1's right end, outside the content zones, present whether the
pill is idle or showing an activity; the ends grow as for the buoy light (§2a), so one dot
or both give the same width. The pill draws it; adapters never know. (The ends are built;
the dot itself waits for FEATURES "Privacy dot".) Click → expanded Home with "in use by Zoom".
GNOME's own indicator in the system cluster is hidden while the `privacy` module is on;
setting `privacy-dot = pill | system | both`, default `pill`.

### 2a-iii. `auto`: a smart stack of idle plans

*Decided 2026-11-03.*

Like the iOS Smart Stack or the Windows widgets board: the user does not pick a plan,
the pill shows what is useful *next* — what to prepare for, what is happening outside.

- **Relevance, predefined.** Every `idle.js` also exports `relevance(ctx, opts)` →
  `{score: 0–100}` or `null` when it has nothing to show. Cheap and synchronous: it reads
  the state the plan already holds; no timers, no I/O (those stay in the plan's source).
  `ctx` = `{now, clock, starts, data}`, `opts` its keys. Default scores, fixed in code, not user formulas:

  | plan | score |
  |---|---|
  | `next-event` | starts in ≤ 30 min **90** (holds, see below) · running now 80 · within 2 h 50 · later today 25 · none → `null` |
  | `weather` | first hour of `morning` 70 · a change in the next hour (rain starts, ≥ 5 °C swing) 75 · otherwise 35 · no location/offline → `null` |
  | news (later, M5) | 40; 55 for an item newer than 1 h from a followed source |
  | exchange rate / stocks (later, M5) | 30; 70 on a move past the user's threshold |
  | `clock` | 10 — the floor, always available |
  | `mascot` | 10, like `clock` (ties take turns), only when listed in `idle-auto-plans` |

- **Choice** (2026-11-08, Ethan: "an idle pill just rotates"; it was the highest score,
  only ties taking turns, so the weather's 35 kept the clock off for good). Every plan
  with something to show takes its turn, in `idle-auto-plans` order, round, one per
  `idle-auto-interval`; the first shown is the highest scored. A plan with nothing to show
  yet (`null`: the weather before its first fetch) is skipped, so the pill never waits for
  it — only Show set to that one plan does. A plan scoring ≥ 80
  **holds** the pill until its score drops, and shows at once (never rotate away from a
  meeting in 10 minutes).
- **When it re-ranks.** On a plan's `changed` signal (event added, weather update, a
  daypart boundary) and on one kit timer, `idle-auto-interval` (default 5 min, 2–30),
  that exists only while the pill is idle with `auto` — removed the moment an activity
  surfaces, on expand, and on disable. A re-rank that picks the same plan changes nothing.
- **Interests** (Windows' word): `idle-auto-plans` (as) — which plans the stack may use,
  in the order they take turns; default `calendar`, `weather`, `clock`. Prefs page **Island** (2026-11-04, was
  "Idle"): a reorderable list with switches, one row per plan, its own keys under it; a
  plan whose module is off is greyed ("Turn on in Modules"). The Modules switch turns the
  whole module on or off; the Island switch only puts its plan in the stack. A module that
  is only a plan (clock, weather) has no switch of its own (2026-11-08, Ethan): unused it
  costs nothing, its feed runs only while its plan is in use; turning its plan on turns it
  on, should it have been off. "Switch every" shows only with Show on Automatic. A plan whose module is off does not exist (ARCHITECTURE rule 6); Show set to it leaves the pill empty, and its row says so ("Clock is off, so the pill shows nothing").
- **Interaction.** Hover → the shown plan's compact; scroll on the idle pill → next /
  previous plan in the stack (held for one interval, like swiping the Smart Stack);
  click → Home, as in every idle state.
- **Motion.** A switch is one content transition (fade out 100 ms / in 200 ms, plus the
  width morph if the plan is wider), then nothing until the next switch.
- **Built** (2026-11-08): `kit/model/smartstack.js` (pure: `choose`, `scrollTo`, `stackOrder`,
  `intervalMs`) and `kit/services/idle.js`. Between turns a re-rank (a feed's change, the wall
  clock's minute) keeps the shown plan while it has something to show. While `auto` is on, every plan of the stack has its feed and is told that
  the pill shows (the weather asks on its own interval meanwhile), and the wall clock runs
  whatever plan shows. A scroll steps once per gesture (400 ms apart: a touchpad sends many
  events) and only on the idle pill; with `auto` off it goes on to the panel's workspace
  scroll. `idle-auto-plans` defaults to `['calendar', 'weather', 'clock']`.
- **Later plans** (news, exchange rate, stocks): each its own module, off by default,
  fetching through Soup at most every 30 min and only while it is in `idle-auto-plans`;
  they are why `auto` is a ranked stack rather than a fixed rotation.

### 2b. Tabs

*Decided 2026-10-30.*

- The tab strip exists only inside expanded, and only when a click opened it; the stack's
  own opens (alert, ask, transient) show the activity's expanded view without a strip.
  Tabs = modules that ship `tab.js`; Home is always first; order follows §6.
- **Kind tabs** (decided 2026-11-02): every enabled module with kinds has its tab, always
  shown, running or not (default strip: Home · Media · Notifications · Transfers · Timer ·
  [Calendar] · ⋯; Timer is a stub module until its roadmap item); until it ships `tab.js` the tab shows its activities' expanded
  views (top first) or stays empty. Modules whose kinds are only feedback (osd, copied;
  §2e) have no kind tab; a module with only a `tab.js` (Clipboard, 2026-11-07) is a
  standalone tab, in the slot and ⋯ (2026-11-05). Kinds no module claims (D-Bus callers) get a tab while one of their
  activities has an expanded presentation, after the module tabs.
- **Strip look** (2026-11-02, after Notchy): one rounded group hugging its tabs; the
  active tab shows icon + title on a lighter pill, the others only their icon (the title
  is their accessible name). Every tab has an icon: the module's `icon`, for an unclaimed
  kind its activity's icon, else a generic one.
- Where you open from decides the tab: idle → Home; the `+N` badge → Home; a pill (minimal or
  its compact) → the tab of its kind (`kind → module → tab`); kinds without a tab (osd, copied) → the
  activity's `onPress` if it has one (e.g. raise the player), else Home. An activity with
  `pressFirst` runs its `onPress` before its kind's tab, which opens only when `onPress`
  does nothing (an agent's session: its terminal, else the Claude Code tab; 2026-11-07).
  A module with `tabWhileLive` has its kind tab only while one of its activities is
  there (Claude Code, 2026-11-07); every other kind tab is always shown. Tabs can be
  switched inside expanded, but the next open follows context again — the last tab is not
  remembered. While open the strip follows the stack: a tab whose last activity ends
  goes back to Home.
- **Standalone tabs** (decided 2026-10-30, after Notchy's ⋯ menu): a module with `tab.js`
  and `kinds: []`. No source, no activity, no idle plan; it lives only inside expanded.
  This is where tool-like pages go (Clipboard, Launcher, Files, Notes…) without touching
  the pill.
  - Strip layout: `[Home] [kind tabs of enabled modules] [slot] [⋯]`. The **slot** is the
    last cell, drawn like any other tab (no ▾, 2026-11-02): it shows the standalone tab
    last chosen from ⋯ (`tabs-slot`) and stays until changed; until something is chosen it shows the **first enabled standalone tab**
    (2026-11-02). ⋯ opens a **menu floating over the tab** (raised: its own background and
    border, no blur), dropping from ⋯ with its right edge on ⋯'s (not from the left like
    Notchy); it lists every enabled standalone tab and marks the one in the slot. A press
    beside it, ⋯ included, only closes it.
    Settings can pin some as fixed tabs (`tabs-pinned`), before the slot; a pinned tab is
    never also in the slot.
  - Reachable only via slot / ⋯ / keybind — never opened by an event.
  - Actor built on first selection, destroyed when expanded closes (optional cache setting);
    closed = zero cost regardless of how many are enabled.
  - Standalone tabs are **not pinned by default**: a fresh install shows Home + kind tabs,
    the slot and ⋯. Calendar is the first (2026-11-02; its next-event activity in M4 may make it a kind
    tab), then Clipboard; both on by default, so Calendar sits in the slot until another is
    chosen, Clipboard's body "Coming soon" until its M5 item (2026-11-02; was "off by default").
  - May use Shell APIs in `tab.js`; still no polling while closed.
  - Likely first ones: Clipboard, Launcher. Not planned: Calculator, Emoji (GNOME search has them).

### 2c. Several pills

*Decided 2026-10-30; shapes and hover 2026-11-05.*

- **Pill 1** is the highest priority, at screen centre, content-fit as when it is alone
  (120 … 0.6 × expanded, `wide` 0.8; §4). It never narrows because others run
  (2026-11-05, Ethan: before, every pill was squeezed to ≤ expanded/3).
- **Side pills 2 and 3** share one fixed shape, the idle size (132 × 32 at 1×, §4): leading, a short
  trailing (equaliser, `40%`, `4:59`) and the `+N` badge; their text is dropped. The
  adapter's data is the same for every pill, so the short value that matters goes in
  `trailing` (CONTRACT.md §3). Their full content is their compact. Laid out at both ends
  (2026-11-12, Ethan, design/pill "Pill phụ"): the leading at the left edge, the trailing at
  the right; with `+N` the badge takes the right edge and the trailing moves in before it.
- **How many**: as many side pills as fit before the system cluster (12 px margin), at most
  two, re-measured whenever the right cluster resizes. Side pills go before pill 1 is ever
  narrowed. With pill 1 at its widest and a 300 px system cluster: 1366 → one side pill,
  1920 and wider → two.
- `+N` sits on the last pill shown; clicking the badge opens Home with the full list, the
  rest of that pill its own tab (2026-11-02). Further activities don't show.
- **Hover → compact** (2026-11-05): each pill is an independent actor. After 300 ms on any
  pill, that pill grows **in place** into its compact (§2, §4): its top edge stays at the
  pill's, it is centred where the pill stands and shifted only to stay 4 px inside the
  screen — it may cover the system cluster while hovered. It is raised over its
  neighbours, which fade out where they stand: nothing slides, so the pill under the
  pointer never moves away from it. Pill 1 does the same, at the centre.
  Measured with pill 1 at its widest, a compact on pill 3 needs no shift on any screen
  from 1920 to 3440; on 1366 a compact on pill 2 covers ~60 px of a 300 px system cluster.
- **Leaving**: the compact stays while the pointer is on the pill or the compact, collapses
  200 ms after it leaves, and the neighbours fade back. Moving straight onto another pill
  switches at once (no new 300 ms), as Shell's panel menus follow the pointer while one is
  open (`ui/popupMenu.js` `PopupMenuManager`: an ENTER on another source → `_changeMenu`).
  A pill that appears under a resting pointer opens its compact too; an alert or ask closes
  another pill's compact.
- Click on any pill or its compact opens expanded at that pill's tab. On open, pills
  **merge**: the primary grows into the expanded panel, the others slide in and fade
  (300 ms). Close = split again.
- An `alert: true` update briefly expands **only that pill** (~2 s, no tab strip).
- An alert on an activity beyond the shown pills brings it to the centre for ~2 s.
- Order: highest priority at screen centre, then to the right. When one ends, the rest
  slide to fill (eased x), never jump.
- Keyboard (decided 2026-11-03): `Super+B` (`keybind-focus`) takes the keyboard like a
  menu (modal) and rings the centre pill: its own 1 px border turns the theme's accent
  (`-st-accent-color`, the colour of GNOME's focus rings), full strength, so it follows
  Settings → Appearance; an activity's keyline steps aside while it is ringed. Buttons,
  tabs and rows inside keep GNOME's own 2 px accent ring at 80 % (Shell 50 `_drawing.scss`
  `focus_ring`). (2026-11-04, Ethan: was 2 px of white at 55 % inside the border, 3 px in
  all; 2 px of accent still read heavy on the pill); ←/→ move the ring (no wrap; it follows its activity and clamps when one ends); Enter or Space
  opens the ringed pill as a click would (its tab, or Home); Esc or `Super+B` again lets
  go, and so does a click outside the pills. Open: ←/→ walk the tab strip, Esc or `Super+B` closes. The key works in the Overview too
  (NORMAL, OVERVIEW and POPUP modes, as Shell's own toggles).
  An open the stack made (ask, alert) takes no keyboard (§2); `Super+B` takes it for that
  pill, which then stays open like a click-open. With the keyboard, an ask's buttons
  answer to a key printed on them: the first letter of the label (Allow → A, Deny → D,
  diacritics folded, Đồng ý → D); labels sharing a letter, or not starting with one, take
  their position 1–9 (Deny · Allow · Always → D · 2 · 3). Ignored while another popup
  holds the keyboard.

### 2d. Greeting

*Decided 2026-11-03; moments 2026-11-06.*

Buoy says hello when the machine starts or wakes from a long sleep (expanded: Bu on the
left, the greeting, the time and date and the weather taking the rest), welcome back on a new login,
and see you soon when the session ends (minimal, or compact with a note) — every time,
not once a day. The greeting depends on the moment, the part of the day, the weekday,
the user's birthday and the world's holidays (by time zone). **[GREETING.md](GREETING.md)
is the reference**: moments and how they are detected, every line and its priority,
sizes, Bu's poses, special days, weather, settings and tests.

- **Dayparts** — `kit/model/daypart.js`, shared with the clock plan's icons and `auto`'s
  `ctx.daypart`: `dawn · morning · noon · afternoon · evening · night`, starts from
  `daypart-starts` (ai, hours, default `[5, 7, 11, 13, 18, 22]`, wrapping past midnight).
  Any rotation works (night may start at 1, dawn at 23) as long as the six hours are
  distinct and in cyclic order; anything else falls back to the defaults, never an
  error. A part changes on the hour; a consumer that must follow it arms one timer at
  `nextBoundary()` (2026-11-04).
  Greetings: dawn and morning → "Good morning", noon → "Good day" (vi "Chào buổi trưa"),
  afternoon → "Good afternoon", evening → "Good evening", night → "Still up" (vi
  "Khuya rồi").

### 2e. Feedback: minimal only

*Decided 2026-11-05, Ethan.*

- **What.** A confirmation of something you just did: `osd` from `hud`, the input source
  from `input`, and `copied` from `copied` (GNOME shows nothing on copy; Buoy does).
- **input** (2026-11-05; named `layout` until then — it covers IBus input methods too): the
  input source you switch to, xkb or IBus, as Shell's indicator
  names it — the IBus engine's `InputMode` symbol when it is 1–2 characters (Bamboo's V / E), else
  the short name — then the source's name: "EN · English (US)". It also flashes when an
  engine switches its own mode; nothing at enable, at IBus startup or when nothing shown
  changes. Click → Keyboard settings. Shell's Super+Space switcher list is replaced too
  (2026-11-05, Ethan; `input-replace-switcher`, on): a press switches at once to the source
  used before; with Super still held, each Space moves one further along the recent list —
  the pill shows where it landed. Off, GNOME's list returns.
- **hud = every GNOME OSD** ("Volume & keys" in prefs; not hardware events — USB,
  Bluetooth and power are the M4 `device` / `power` modules) (2026-11-05, Ethan: "ẩn toàn bộ OSD của hệ thống"), all of which
  go through `Main.osdWindowManager` `show` / `showAll`, so `hud` overrides both and the
  stock window never opens while `hud-replace-osd` is on:
  - levels — icon + bar + its percentage, `72%` as Notchy (more when amplified, `130%`): speaker volume
    (gsd names an external output: "Headphones" as text), microphone, display brightness,
    keyboard backlight (keys and the firmware's Fn: gsd forwards UPower's
    `BrightnessChangedWithSource` "internal"), the battery key. Muted: the muted icon, the
    bar and number dimmed at their level;
  - toggles — icon + a short word: touchpad, airplane (and hardware airplane), Bluetooth,
    rotation lock, the privacy screen (mutter), eject, and "Nothing playing" — gsd's ⊘ for a
    media key with no MPRIS player (`do_multimedia_player_action`). gsd's own labels are
    used as they come (translated); Buoy words the ones without;
  - Caps Lock, Num Lock and Fn Lock — Buoy's own (GNOME has no OSD for them): Caps and
    Num Lock from the keymap, on every keyboard; Fn Lock only where the kernel tells the
    system about it — see "Fn Lock support" below.
  - Quick Settings' volume and microphone sliders: GNOME shows no OSD when they are dragged
    (only brightness does), Buoy shows their level as it moves (2026-11-05, Ethan).
  Off, GNOME's popup shows and only Caps/Num/Fn Lock stay in the pill. Click on a level opens
  its Settings panel (Sound, Displays, Keyboard, Power, Mouse).
- **Fn Lock support** (2026-11-05). Fn Lock lives in the laptop's firmware; Linux learns of
  a change only if the vendor's kernel driver reports it. Buoy shows it when the driver
  exposes an LED `<device>::fnlock` with `brightness_hw_changed` (the LED core then wakes
  a reader on each change: one POLLPRI watch, no polling). Today that is:

  | Machine (kernel driver) | Fn Lock in the pill | Why |
  |---|---|---|
  | **Lenovo IdeaPad** with the Fn-keys WMI event (`ideapad-laptop` + `ideapad_wmi`, WMI `8FC0DE0C-B4E4-43FD-B0F3-8871711C1294`) | **yes** — tested on an IdeaPad Slim 3 15IRH10 (83K1), kernel 7.0: each Fn+Esc flips it once, matching the key's light | the driver registers `platform::fnlock` with `LED_BRIGHT_HW_CHANGED` and notifies from that WMI event (`ideapad_fn_lock_led_notify`) |
  | Lenovo IdeaPad without that WMI event | no change shown | the LED exists but nothing reports a key press; it moves only when software sets `fn_lock` |
  | any other driver that adopts the `*::fnlock` LED | yes, untested | same interface |
  | Huawei (`huawei-wmi`), LG (`lg-laptop`), Uniwill-based (`uniwill-laptop`) | no | only a `fn_lock` file: no change event known, reading it would mean polling (ARCHITECTURE rule 8) |
  | ASUS (`asus-wmi`), ThinkPad, Dell, HP, external keyboards | no | Fn Lock is handled in firmware or the keyboard; the system never sees it |

  No LED, or a driver that never reports: no Fn Lock pill, nothing else changes.
- **Minimal only.** No compact on hover, no expanded, no tab; never an alert, never counted
  as missed (INDICATORS.md). Click → its `onPress` if it has one (Sound settings), else
  Home (§2b).
- **Pill 1 for its ttl.** Feedback takes the centre pill above every kind but `ask`; the
  pill it covers comes back in place when it ends, and the side pills keep their
  activities and the `+N` its count (`stack.js` `pillWindow`; they slide only as pill 1's
  width changes). The newest feedback covers an older one. Under an `ask` it is pill 2.
- **ttl** ~1.5 s (copied too since 2026-11-06, Ethan: 1 s read too short). A repeat updates the same activity and restarts the ttl, so
  holding the volume key keeps one pill and only its bar moves. Hover holds it: the
  pointer on any pill pauses its ttl, and leaving gives it a fresh one (`stack.hold`).
- **While Home is open** feedback shows as a row in Now for its ttl (the pill is the
  panel then).
- **Size by type**, content-fit with the adapter's hints, never px (ARCHITECTURE rule 11):
  volume, brightness and backlight are icon + bar (`wide`); Caps Lock and the input source are
  icon + a short word; copied is icon + the snippet or an image thumbnail, ellipsized at
  pill 1's widest.
- **Copied and Clipboard** (one `clipboard` module 2026-11-05; two again 2026-11-07,
  Ethan: in prefs the flash is "Copied" under Quick Feedback with Show what was copied,
  the tab is "Clipboard" under Tabs with Pin to the strip, each with its own switch,
  `modules-copied` and `modules-clipboard`). `copied`'s `source.js` listens to
  `Meta.Selection` `owner-changed` (mutter `meta-selection.c`; no polling) and surfaces
  `copied`; the Clipboard tab's history (FEATURES M5) will watch the clipboard on its own,
  with `clipboard-history` on. Off, nothing is stored.
  `copied` skips a clipboard Shell set itself — the new owner is a
  `Meta.SelectionSourceMemory` (`st-clipboard.c` `st_clipboard_set_content` →
  `meta_selection_source_memory_new`): a screenshot, or a row the Clipboard tab put back;
  the history still records it.
  What the pill shows (2026-11-06), from the new owner's mimetypes, first match wins:
  a password manager's secret (`x-kde-passwordManagerHint`, KeePassXC and KDE's) →
  "Copied · hidden", never read; files (`x-special/gnome-copied-files`, `text/uri-list`)
  → the name, or "3 items"; an image → its thumbnail as art (the PNG bytes as a
  `Gio.BytesIcon`, nothing written) and "Copied image" (2026-11-06); text → the snippet on one line
  (whitespace collapsed, the source hands at most 500 characters), ellipsized at pill 1's
  widest (`wide`). Only the clipboard: PRIMARY changes with every selection and is
  ignored. Emptied text (a password manager clearing it) shows nothing. Silent too for a
  `Meta.SelectionSourceRemote` — another machine's clipboard through RemoteDesktop:
  mutter-devkit syncs the host's at start and on every host copy (`mdk/mdk-session.c`;
  Ethan saw it flash as `pnpm dev` opened, 2026-11-06), gnome-remote-desktop the RDP/VNC
  client's. A clipboard-manager extension restoring its last item sets a Memory owner:
  silent as well. The app is the
  focused one, so `apps-hidden` and profiles apply (hide a password manager by name);
  a window without a `.desktop` counts as `system`. `copied-show-preview` off: "Copied"
  alone and the clipboard is not read. Click → Home (no tab of its kind).
- **Screenshot** (2026-11-05; settled 2026-11-08, NOTIFICATIONS.md §7: step 1's pill and
  card already show it — the thumbnail, "Show in Files", a click opens it — so the extras
  below (~3 s, thumbnail minimal, Delete) are dropped, and it goes when its pill ends, as
  GNOME's transient banner): not feedback but a `notification`, from Shell's own
  "Screenshot captured" (`ui/screenshot.js` `_storeScreenshot`: the PNG goes to the
  clipboard, then a transient notification with the thumbnail, "Show in Files" and
  activate → open the file), shown as any notification (NOTIFICATIONS.md §7). (M4's separate "Screenshot taken" item merged here
  2026-11-06, Ethan; no Copy: Shell already copied it.) One pill per shot: the clipboard side stays quiet (above). A finished screencast
  ("Screencast recorded", same file) is handled the same way; the recording itself is a
  running activity with its timer and stop button (§6b privacy / recording).

## 3. Expanded: Home

Single screen, no sub-navigation: a **main card** over **one row of tiles** (design/home, H5,
decided 2026-11-11/12, Ethan; built 2026-11-12, M4 "Expanded on the same rhythm"). It is
laid out again each time Home opens and each time the stack changes, so it is never empty
and never scrolls (`kit/model/home.js` planHome, `kit/ui/home.js`).

```
┌ ⌂ Home · ♪ · 🔔 · ⤓ · ⏱ · [ ▣ Calendar ] · ⋯ ───────────────────── ⚙ ┐  head 56
│ ┌ main card: the stack's first activity, or the greeting ────────────┐ │
│ │ [cover]  Sóng Ngoài Khơi                          ⏮  ⏯  ⏭        │ │  the rest of
│ │          Hải Đăng · Spotify   ━━━━━━━━━━──────── 1:24 / −2:11      │ │  the height
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌ 🔔 7 ──┐ ┌ Bu 2/3 ──────┐ ┌ ☁ 31° ────────────┐ ┌ ▭ 82% ─┐            │  row 100
│ │ Missed │ │ Claude Code  │ │ Partly cloudy      │ │ Battery │            │
│ └────────┘ └──────────────┘ └────────────────────┘ └─────────┘            │
└────────────────────────────────────────────────────────────────────────┘
  strip: Home · kind tabs of enabled modules · one slot for a standalone tab · ⋯ menu · ⚙ prefs
  ⚙ sits alone at the right of the strip row (a round button 32); it closes the island, then
  opens the extension's prefs window (2026-11-02)
  no system indicators here — they live in the right-hand system cluster (§1)
```

- **The head** is 56: the strip and ⚙ are 32, 12 from the top. Under it the main card, 8,
  the row of tiles 100, and 12 at the bottom; 12 at the sides. The main card takes the rest:
  104 / 168 / 200 at 1920 / 2560 / 3440; with no tile, all of it.
- **The main card** is the stack's first activity with its buttons; with none, the
  **greeting** (Bu waving, "Good afternoon, Ethan", the date). A player has a card of its
  own (`modules/media/home.js`: the cover as tall as the card less 16, at most 160; under
  160 the transport at the top right and the bar at the foot, from 160 the title larger and
  the transport centred under the bar); an ask is its card with its buttons at the bottom
  right; any other activity shows its compact in the card (or, without one, its leading,
  text and value). A click on it opens its tab.
- **The tiles** (fill-1, radius 16): N = floor((row + 8) / 128) a row — 4 at 1920, 5 at
  2560 and 3440. **Missed** first, then the other activities, each a tile (its minimal's
  leading, a value in 1.5em, a caption: "2 / 3 · Claude Code", "42% · report.pdf", a
  player's elapsed time over its title); more than N → N − 1 tiles and **+K**. Room left:
  the **glances** in order — the weather, Up next, the battery (phone and timer with their
  items) — one tile each, left out when they do not fit (never into +K). Still room: the
  weather, then Up next, take two units (the weather's icon at 48 and the place; Up next's
  two events); still room: the tiles widen to fill the row. A tile 200 wide or more shows a
  detail column. A tile opens its tab; an activity without one goes up to the main card.
- **Missed** (the amber tint, 16 %): counts everything unseen — what ended while the
  island could not show it (the stack's missed history) and the sources' own unseen
  (GNOME's notifications nobody saw, `stack.flagMissed` with its row). Its list, in place
  of the card and the row: ‹ (back, also Esc), "Missed · N", × to clear; then "Notifications
  · 3" (its apps) opening the Notifications tab, and the tasks, newest first, each opening
  its tab and leaving. Showing Home turns the amber light off; the tile stays until every
  row is opened or cleared.
- **+K** opens "Ongoing": every activity in the stack's order, rows of 32; past 5 it
  scrolls, the one place Home does.

The glances and a module's card stay for the whole open and go when expanded closes; each
one's data lives only that long (rule 8). Every tab opens the panel at the full expanded
cap (2026-11-08, Ethan): a taller tab scrolls inside, an empty one ("Nothing playing", "No
transfers"…) centres its text with Bu over it (kit `EmptyState`, MASCOT.md). Buoy posts no
notifications of its own.

- Calendar — reuse `ui/calendar.js` (same EDS source as dateMenu). Every account in Settings → Online
  Accounts (Google, Microsoft 365, Exchange, Nextcloud, WebDAV) syncs in by itself: GOA
  registers its calendars with EDS and Shell's calendar server watches every selected
  source (`calendar-sources.c`); a calendar unticked in GNOME Calendar stays out. Buoy
  never talks to those services; prefs offers "Online Accounts" (Settings' `launch-panel`)
  (2026-11-06, Ethan).
- Weather glance — reuse `ui/weather.js` (same GWeather location as dateMenu): Buoy's
  colour icon, the temperature and the condition; wide, the icon at 48 and the place with
  the compact's details (feels like when it differs, wind, humidity). No high / low: GWeather
  gives the current reading and hourly forecasts from now, not the day's range. A click
  opens GNOME Weather when it is installed (Ubuntu ships without it). Left out without a
  place or a reading. Home has its own reader for the open: a stale reading is fetched once.
- Up next — today's events from the same calendar source (the calendar module's
  `events.js` / `agenda.js`). The month grid is the Calendar tab's, not Home's: the tab
  has the month to pick a day on one side, that day's events on the other — today's and
  the week ahead when today is picked (2026-11-08, Ethan); the month scales with the tab's
  height, its circles 26 px at 1920 up to 40 px on large screens (2026-11-08, Ethan): a sixth of
  the six weeks' room, even, 26–40, the digits 12–16 px. The month's name in the accent, the
  year grey, weekends dimmed, today a filled circle, an accent dot on days with events; a
  day's events as cards (dot · title · time). A row opens the calendar app (the date menu's
  choice) and closes the island. No calendars → Bu with "Add an Online Account" (Settings). Home's Up next glance: the next of
  today's events, its time ("3:00 PM", "Now", "All day") over its title; wide, the next two,
  each a bar (the accent for one running; Shell's calendar server sends no calendar colour),
  the title and "3:00 PM · in 25 min"; a click opens the Calendar tab. Left out when nothing
  is left today.
- Battery glance (2026-11-12, Ethan: GNOME's own battery) — the battery Quick Settings
  reads (`ui/status/system.js` PowerToggle's UPower DisplayDevice proxy), no proxy of Buoy's:
  the percentage, "Battery" or "Charging", Buoy's battery icons; none on a desktop. A click
  opens Settings → Power.
- Timer glance — a tile to start one, even when none runs (design/home); comes with the
  timer module's M4 item. The phone's comes with "Phone via GSConnect".

## 4. Sizes

*Decided 2026-10-30: derived, not fixed.*

> **v0.2 redesign:** the new sizes are decided in [Design](design/index.md) (in Vietnamese
> first; the numbers in `design/tokens.vi.md`). The bar and the pill follow it since
> 2026-11-12 (M4 "Sizes in em"); compact, the card and expanded are as in v0.1 below until
> their own M4 items.

All sizes are logical px; HiDPI is handled by St/Clutter. `kit/model/shapes.js#shapesFor()`
derives everything from the monitor's logical width `W`, the panel height and the **em**
(the font's size × resolution / 72, as St reads `em`: 14.67 px at 11 pt; Large Text and the
font setting change it, and the bar and the pill scale with it, design "Đơn vị là em") —
and is recomputed on `monitors-changed`, a theme change (font, Large Text), the bar's height,
a new device scale (the idle clock is measured again) or when `expanded-width` changes.
The design's px are at 1em and scale by em / 14.67, rounded to whole px.
A function, not breakpoints: no jumps when moving between monitors.
Every width is snapped to an even whole px (2026-11-01), so a shape centred in the even-wide
container sits on whole pixels — no half-pixel edges; radius = ⌊h/2⌋.
Expanded follows iOS (2026-11-01): width is fixed per screen (derived, or the user's
`expanded-width`), height is not a setting — it fits the content on 56 + 16n, up to width/2 rounded down to it. The input
container is sized to that cap.

| Thing | Rule | 1920 | 2560 | 3440 |
|---|---|---|---|---|
| bar | 2.75em (`#panel.buoy`) | 40 | 40 | 40 |
| pill height `h` | bar − 2 × 0.25em; its content box h − 2 × 0.25em, the leading's cell | 32 (cell 24) | 32 | 32 |
| idle | 8 + cell + 6 + the idle clock's widest text + 8, the text measured at run time on the pill's label: the font's widest digit, `88∶88∶88` and the wider of AM/PM (design/pill "Idle"); r = h/2 | 132×32 at 1× (Ubuntu Sans: 126; DejaVu Sans: 146; scale 2: +6) | | |
| hover / press | +0.75em / +1.25em width, +2 / +4 height (a pill before or without its compact) | 144×34 / 150×36 from idle | | |
| minimal, pill 1 | content + 2 × 8 (rounded up), clamped to [idle, min(24em, 0.6 × expanded)] (`'wide'` hint → 0.8 × expanded); with a light + 2 × 20 (r + dot/2) and at least idle + 40, the cap unchanged (2026-11-12) | ≤ 336 | ≤ 352 | ≤ 352 |
| light | an 8 px dot (even, 0.5em) at the centre of pill 1's end cap; each end grows 20 | idle 172 lit | | |
| minimal, pills 2–3 | fixed, the idle size | 132×32 | 132×32 | 132×32 |
| compact | design/compact (2026-11-12): width fixed at min(28em, 0.72 × expanded), whatever it holds (content-fit is the pill's alone); height 56 + 16n up to 152 — a head of 56 (leading 40, 8 above and below, 14 at the sides, round buttons 32 on its middle), then rows of 16: media 88 (its art 72), up to 3 rows 120, a **card** (a notification, an ask; NOTIFICATIONS.md §3) 136 with one line of message and 152 with two, 104 without buttons; a card of choices (an agent's question) rows of 32 up to expanded's height, 280 at 1920; r 28; the content carries its paddings, all scaled by the em (`shapes.js` compactMetrics); top edge at the pill's | 404 × 56 … 152 | 410 | 410 |
| expanded | width `clamp(0.28 × W, 560, 760)` or `expanded-width` (≤ W − 40); height on 56 + 16n as the compact's, at most width/2 rounded down to it (2026-11-12, design/expanded; was width/2); r 28; every tab at the cap; the head 56 (the strip 32, 12 from the top); no tab (the greeting) 88 | 560 × ≤280 | 716 × ≤344 | 760 × ≤376 |
| Home | the head 56, the main card (the rest), 8, the row of tiles 100, 12 under it and at the sides; N = floor((w − 24 + 8) / 128) tiles, each ≥ 120, radius 16; the main card low under 160, tall from 160 (§3, design/home) | card 104, N 4 | 168, N 5 | 200, N 5 |
| container | the monitor's width (2026-11-05, was expanded + 20 each side: a compact may open on any pill, up to 4 px from the screen edge), expanded's cap + 40 tall; never reactive at rest, so it takes no clicks (Clutter picks only reactive actors, `clutter_actor_should_pick`) | 1920 | 2560 | 3440 |

Leading element per tier: in minimal a cell of 24 at 1em (30 with Large Text) that a cover
or a colour icon fills, a symbolic icon 16 and Bu 20 centred in it (2026-11-12, design/pill);
40 compact, 56 expanded; Bu 20 / 40 / 50, whole multiples of its 10-cell grid (MASCOT.md).
In minimal the gaps are 6 (cell → text → trailing) and 8 before a button. The text is 1em,
weight 600, even figures. Up to 1 action in minimal, 3 in compact and expanded.

Inside expanded, Home and tabs use flowing layouts (`St.BoxLayout`, `x_expand`); the one
content breakpoint is below ~600 px, where Home goes from 4 cells to 2 columns.

Adapters never see these numbers (ARCHITECTURE rule 11): they return content and at most a
discrete hint (`size: 'wide'`), and the renderer ellipsizes or drops low-priority regions.

## 5. Motion

- Background actor eases `x / width / height`; content fades (100 ms out, 200 ms in).
- `EASE_OUT_BACK`, 460 ms shape (into the compact too) · 360 ms out of the compact · 240 ms
  size (a longer text) · 120/300 ms
  press · 360 ms merge (2026-11-06, Ethan: a fifth slower than the first 380/200/250/300).
- A long shrink bounces at most 12 px (2026-11-06, Ethan): EASE_OUT_BACK goes ~10 % of a
  move past its end, which on expanded → minimal (560 → 168 px) cut 39 px into the text.
  A shrink whose bounce would pass 12 px shrinks to 12 px short of its size (70 % of the
  time, ease-out cubic), then settles out to it (ease-in-out); shorter shrinks (compact →
  minimal, ~120 px) and every grow keep Clutter's own (`kit/model/shapes.js` `shrinkStop`).
- Compact (2026-11-05): a pill growing into its compact is a shape morph (460 ms) and
  grows by far more than 25 %, so it uncovers its content as expanded does (below);
  neighbour pills fade where they stand (100 ms out, 200 ms in).
- Border radius snaps at transition start.
- Content never moves or scales during a morph. On expand (and any morph that grows the
  pill by more than 25%) it sits at its final place and the background **uncovers** it:
  the content is clipped to the background on every frame of the background's own
  transition, so it shows exactly as fast as the pill opens, and its opacity follows the
  same progress (0 → full from halfway), so a word the edge still cuts stays faint; on
  collapse the same clip
  keeps it inside through the undershoot. A slide (slide-to-fill, merge) moves the
  content with its background on the same curve (2026-11-02: before, the expanded text
  showed at full width while the background was still compact).

## 6. Modules for v0.1

1. **media** — MPRIS (2026-11-05, Ethan): one pill per player from the moment it plays.
   Minimal: art + title · artist + equaliser while playing (its four bars grow from their
   middle, up and down at once, while the pill is on screen, wherever it shows — side pill, Home's Now; still with
   animations off; 2026-11-05, Ethan), paused its bars stopped low, a near flat line
   through the middle (4 · 6 · 4 · 2 px, 2026-11-07, Ethan; was ⏸), no button; a
   paused pill waits (`linger`) and goes after `activity-linger` (5 min, §2). Compact (hover): art 40,
   title / artist · app (a title too long for the compact scrolls right to left: 2 s at
   the start, 30 px/s, two copies 40 px apart so each loop ends where it began; still and
   ellipsized with animations off; 2026-11-05, Ethan), ⏮ ⏯ ⏭, the position running with elapsed and remaining —
   display only; no compact when `media-compact-on-hover` ("Controls on hover") is off. Tab Media: players as chips, art, title (scrolling
   like the compact's when long) / artist / album, "Open app",
   a slider to seek, shuffle · ⏮ ⏯ ⏭ · repeat. Laid out (2026-11-08, Ethan) as the art, a
   square as tall as the tab (at most 40 % of its width, 96–280 px), and a column beside it — title / artist / album · app with ↗
   (Open app) beside them, the slider and transport at the bottom — under a row of the
   players' chips (one per app) when there is more than one; each tab gets its own redesign
   after v0.1. "Open app" brings the player's window up
   (Shell activates the app found from the player's bus pid), then asks the player itself
   to come forward (MPRIS `Raise()`). **Firefox** then switches to the tab that plays.
   **Chrome (and Chromium) cannot**: its MPRIS player says `CanRaise` false and sends no
   `DesktopEntry`, so Buoy brings Chrome's window up on whichever tab it shows — the
   playing tab is not reachable from outside Chrome (2026-11-07, seen on Ethan's machine).
   One MPRIS player per browser: its most recent playing tab, so two playing tabs in one
   browser are one pill. Art in minimal and compact has corners
   inside the pill's: the pill's radius less the art's inset across, the content padding
   (24 − 14 = 10 on the compact's 40; minimal 16 − 14 = 2, raised to 6, under which a
   20 px art reads square); in expanded and the tab it stays square (2026-11-05, Ethan). No volume in the tab: per-app volume and
   the output device go to a Sound tab (§6b). Spotify ads: "Ad" and their countdown, no skip.
   A player that stops or leaves the bus ends its activity; the chosen chip keeps its light
   face under the pointer.
2. **hud** — volume / brightness / keyboard backlight / caps lock replace the stock OSD, as
   feedback (§2e).
3. **home** — the expanded Home above.
4. **appname** — left cluster.
5. **greeting: first run and What's new** (2026-11-08, Ethan) — Bu's hello the first time
   Buoy runs with the basics of using it, and after each update what is new and fixed,
   typed in (GREETING.md §11). The rest of the greeting is after v0.1 (§6b).
6. **idle `auto`** — the smart stack over the `clock`, `weather`, `next-event` plans (§2a-iii).
7. **notifications** (moved here from §6b 2026-11-06, Ethan; the reference is
   NOTIFICATIONS.md, 2026-11-07) — GNOME's banner becomes a pill where GNOME would show one
   (`notification-replace-banners`, default on), a compact with the notification's own
   actions (Reply / Mark as read / Open) and ×; DND is GNOME's own switch, followed as it is;
   the toggle comes with the tab. A **notifications tab** lists the history
   (2026-11-02, replaces the clock popover's list): read from `Main.messageTray`
   (`getSources()` + `source-added`, each source's `notifications` +
   `notification-added`), the same data the stock message list uses — no store of our
   own; dismissing in either place removes it from both.

## 6b. Roadmap after v0.1 (all pure JS)

1. **dbus** — `org.gnome.Shell.Extensions.Buoy` iface: `Show/Update/End` activity,
   `Ask(question, options) → answer`. Hook scripts call it with `gdbus call`.
2. **agents** — Claude Code / Codex approvals as a two-button activity in the pill
   (Deny · Allow · Always), done-alerts; hooks installed/removed from prefs. One `agent`
   activity per session with **Bu** as its leading: the pose follows the hook events
   (think · busy · ask · turn · error · compact · done · party, `MASCOT.md` § Agents);
   the agent's name leads the text (2026-11-03).
3. **timer** — pomodoro + stopwatch, keep-awake, ring in the compact pill.
4. **power / bluetooth** — charging, low battery, device connected with its battery.
5. **calendar** — Up next in Home; alert 5 min before with Join when the event has
   a meeting link. Shell's calendar server sends only id, summary, start and end, so the
   link is read over EDS's own D-Bus (`CalendarFactory` → `Calendar.GetObjectList`, raw
   iCalendar: `LOCATION`, `DESCRIPTION`, `URL`, `X-GOOGLE-CONFERENCE`), only for an event
   about to start; no `gi://ECal` (not installed by default).
6. **eject** — mount-added with one-tap eject (downloads moved to v0.1, §6c, 2026-11-06).
7. **privacy / recording** — cam/mic dots, recording timer; "call" activity when
   cam+mic are both in use.
8. **several pills** — pill 1 plus up to two idle-sized side pills (§2c).
9. **clipboard** — the copied feedback (§2e, v0.1) and, with `clipboard-history`, the
    Clipboard tab (M5): text, links, colours and images (`St.Clipboard.get_content`);
    search, pin, delete, clear, 1–9 to paste; a row sets the clipboard, closes the island and
    pastes (Ctrl+V by Clutter's virtual keyboard, Ctrl+Shift+V for terminals); skips
    `x-kde-passwordManagerHint`, a pause switch, excluded apps, size and count caps; kept in
    memory, saved under `~/.cache/buoy/` only if chosen. Layout after Notchy's (2026-11-02).
10. **Sound tab** (2026-11-05, Ethan) — a standalone tab, Notchy's mixer: every app playing
    sound with its own volume slider, and the output device (GNOME's, for everything),
    from Shell's mixer (`ui/status/volume.js` `getMixerControl`). Not in the Media tab.
11. **greeting** (moved from v0.1 2026-11-08, Ethan; FEATURES M4; its first run and What's
    new stay in v0.1, item 5) — hello at start and
    wake, welcome back, see you soon; by part of day, weekday, birthday and holidays
    (§2d, GREETING.md).

## 6c. Transfers tab

*Decided 2026-11-03.*

What the tab can show is bounded by its sources, so it grows in two steps. Checked
2026-11-03 against Nautilus upstream, Ubuntu's packaging and the installed binaries:
`com.canonical.Unity.LauncherEntry` comes from **Files on Ubuntu only** (Ubuntu's
`12_unity_launcher_support.patch` via `libunity`; upstream Nautilus sends none) and from
**Chrome** (`libunity.so.9`) — **but only on Unity or KDE**: Chrome dlopens libunity by
`XDG_CURRENT_DESKTOP`, and on GNOME (Ubuntu's `ubuntu:GNOME` too) it never loads it
(checked 2026-11-06: a real Chrome download sent nothing under `ubuntu:GNOME`, and 57
updates to "Done" under `Unity`). On GNOME, Chrome's downloads reach Buoy only through the
`.crdownload` watch below. **Firefox sends none** (only `_NET_WM_XAPP_PROGRESS`, an X11
window hint). Transmission not checked yet.

**Ring only when the source gives a fraction.** No total, no percentage — Buoy never
invents one:

| Known | Leading | Text | e.g. |
|---|---|---|---|
| a fraction (LauncherEntry) | determinate ring | % | `◔ Chrome · 2 downloads  72 %` |
| only a growing file (`.part`, `.crdownload`) | static download icon, no ring | name · size · speed | `⤓ report.pdf · 12 MB · 2.1 MB/s` |
| finished (renamed) | file type icon | name · folder | `report.pdf → Downloads` |

No spinner and no endless ring: that would animate for the whole transfer and suggest
progress there is none of; the growing size already says it is moving. Speed comes from
the size between two `Gio.FileMonitor` `changed` events (rate-limited by GFileMonitor,
about one a second): no timer of our own. One exception: when an app's LauncherEntry
covers exactly **one** growing file (Chrome, one download), its fraction is that file's,
and the file row gets the ring; with two or more it cannot be split, so the app row keeps
the % and the file rows show size only.

- **M3, `progress`.** libunity only sends while a launcher owns `com.canonical.Unity` (Ubuntu
  Dock does): Buoy asks for the name too, yielding to the dock, so Files keeps reporting
  with the dock off and after it reloads (2026-11-05, seen with the real Files).
  LauncherEntry says only *which app* is busy: progress 0–1, maybe a
  count, urgent. One pill and one row per app, the fraction summed over everything the
  app is doing: two copies in Files are one "Files 55 %" (Ubuntu's patch sends the
  combined ratio and no count, so not even "2 operations"). The tab:
  - **Running** — one row per app: icon, name, the count when sent ("2 downloads"), %,
    a thin bar.
  - **Done** — a row stays a little after the app's progress ends (pill gone), with the
    time, then leaves (2026-11-05: 10 min, at most 5). The pill says "Name · Done" for
    2.5 s first. Done means the progress was hidden at ≥ 99 %; hidden earlier (cancelled)
    or the app leaving the bus ends it without Done.
  - A click on a row or on the pill focuses that app's window
    (`Shell.AppSystem.lookup_app(id).activate()`), not its tab: there is nothing more to
    open. The compact's bar is at least 160 px. "In background" dims after 10 min.
  - Files closed mid-operation (2026-11-06, Ethan): it keeps working but stops sending
    LauncherEntry, and posts "N file operations active" (GNotification id `progress`), then
    "All file operations have been completed" (`transfer-complete`). Buoy reads both (it
    leaves them shown; banners are the notifications module's call): the pill becomes
    "Files · in background" — no ring, no %, since no number comes any more — and
    `transfer-complete` gives "Files · Done". Reopened, Files reports once more and then
    stops again, so the pill stays without % and says "Files · working" while its window
    is open (its own window shows the progress). Minimized, Files keeps reporting.
  - Not from LauncherEntry: Firefox (no signal; its downloads come from `downloads`
    below), Files outside Ubuntu (it only posts the notification "N file operations
    active" while its window is closed — `nautilus-progress-persistence-handler.c`; that
    reaches Buoy with the notifications module).
- **M3, `downloads`** (moved from M4 2026-11-06, Ethan: on GNOME neither browser sends
  LauncherEntry — Chrome loads libunity only on Unity/KDE — so this is their only way in).
  Each `.part` / `.crdownload` in a watched folder is its own
  **Running** row (and pill) once it is written to (name, size, speed; the ring only per
  the exception above) — this is how Firefox shows up at all. A partial file that is
  never written to while watched (a leftover from a broken download) never shows. A row
  with no new bytes for 30 s dims. Chrome
  names the file `Unconfirmed 123456.crdownload` until the download is checked — seen
  2026-11-06 for the whole download (a `.bin` and a `.pdf` from a local server), renamed
  to the real name only at the end; the word is translated — so a `.crdownload` named
  words + space + up to 6 digits, without an extension, shows the browser's name
  ("Google Chrome · 12.3 MB") until it is renamed. The browser is the running app that
  writes such files (Chromium's family `.crdownload`, Firefox's family `.part`); none
  running, no app is named. Renamed to its final name, it says "name → folder" for 4 s
  and moves to a **Downloaded** group (2026-11-06: kept an hour, at most 5; a file
  deleted since leaves when the tab is drawn): file type icon, file name, folder · app ·
  time. A click opens the file; two **icon-only** buttons, "Open"
  (`document-open-symbolic`, the default app) and "Show in Files"
  (`folder-open-symbolic`, `org.freedesktop.FileManager1.ShowItems`, selected in its
  folder). St has no tooltips: hovered or focused, a button's name replaces the row's
  detail line (2026-11-06). Deleted or moved out before the end (cancelled): it ends,
  no row.
  Acting on a row (2026-11-06, Ethan, "as a clicked notification"): opening the file,
  showing it in Files or focusing the app closes the island, and a Done or Downloaded row
  acted on leaves its list. Done and Downloaded each have an icon-only **×** in their
  header (no label, Ethan); it empties the list, never the files. The same close applies to
  every tab action that brings a window up (kit: `new Tab({close})`; Media's "Open
  <app>"; a Home row running its activity's onPress).
  Where files are caught:
  1. the user's Downloads folder, `GLib.get_user_special_dir(DIRECTORY_DOWNLOAD)` (not a
     hard-coded `~/Downloads`), always;
  2. up to 10 more folders in prefs (`progress-folders`, renamed from
     `transfers-folders` 2026-11-06 for ARCHITECTURE rule 9; "More download folders"
     in the Transfers row, Add Folder… through the portal's folder chooser), each one
     non-recursive `Gio.FileMonitor` with WATCH_MOVES (one inotify watch per folder,
     hence the cap), applied at once;
  3. ~~Recent files~~ — dropped 2026-11-06: neither browser writes there for a download.
     A real Chrome download in the test session left no `recently-used.xbel`, and on
     Ethan's machine every Downloads entry in it comes from `xdg-desktop-portal-gnome`,
     i.e. a file saved through a Save dialog, never from Chrome or Firefox themselves. It
     cannot be the catch-all.
- **Not planned:** "source → destination" for a Files copy — Nautilus exposes no names
  over D-Bus (`org.gnome.Nautilus.FileOperations2` starts operations, it does not report
  them), and a guess could be wrong.

Roadmap: FEATURES.md (milestones M0–M5 with status). Status marks: INDICATORS.md. Contract: CONTRACT.md. Mascot: MASCOT.md (Bu). Competitor notes (Notchy audit, Isle, Islet, BEHAVIOUR) are kept locally in `docs/notes/` and not committed.

## 7. BuoyKit

*Decided 2026-10-30.*

Buoy is a framework first, features second — see `CONTRACT.md` for the full contract.

- **Core** owns: activity lifecycle (`surface / update / end / schedule / ask`), priority
  across apps, ttl and stale state, the three tiers (minimal — one to three pills —,
  compact on hover, expanded with leading/trailing/center/bottom regions), Home, motion, and the
  D-Bus API.
- **Default adapters** (each module's `adapter.js`) render every `kind` (media, notification,
  progress, osd, power, device, timer, ask, attention, copied, phone…) well enough that
  an app Buoy has never heard of still looks right.
- **Per-app adapters** (`modules/<id>/apps/<slug>.js`) override only the methods that need to differ
  (Spotify ad countdown, Telegram avatar, Firefox download names). Adapters return
  presentation data, never raw actors; the renderer keeps every app in the same visual
  language.
- Apps and scripts that talk D-Bus send presentation data directly and skip adapters.

## 8. Non-negotiables

No polling while closed; no blur; no shadows with blur; actors reused not recreated;
nothing animating while idle (a content change is one transition, §2a; a playing
equaliser is an activity, not idle, §6); a module switched
off costs zero.
