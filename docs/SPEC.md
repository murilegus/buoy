# Buoy — spec v0.1 (test build)

uuid `buoy@murilegus` until a final name is picked. Everything here is a
decision for the first test build; any of it can change after trying it.

## 0. What this is, and is not

**A living pill, not a notch assistant.** The island is a floating iPhone-style
pill that reacts to what the system is doing. The **pill** is not a place to talk to
an AI, drop files, or browse tools. Expanded may host a few tool tabs (off by default,
§2b), but nothing in the pill ever comes from them.

- Pure GNOME Shell extension. Ships on extensions.gnome.org, installs in one click,
  updates through the Extensions app. No daemon, no binaries, no `curl | bash`.
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
  button is a 32 px square (16 px of content), so each highlight is one 26 px circle,
  the input-method label ("vi", "en") centred in it too.
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

### 1a. Windows against the top bar: rounded top corners (decided 2026-11-02; tiled and top edge 2026-11-04)

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
  (`kit/rounded.js` `onTopEdge`), not fullscreen, any toolkit (GTK, Qt, Electron,
  Xwayland): maximized vertically — fully maximized, tiled left or right, maximized
  vertically alone; Mutter pins the top edge then (`window.c` `update_edge_constraints`)
  and the client, told `tiled-top`, drops its own top radius — or a frame that starts on
  that line: Ubuntu's tiling-assistant top quarters (pinned with `override_constraints`,
  which JS cannot read back) and a window moved up against the bar (Ethan 2026-11-04).
  Both top corners round, the inner one of a tiled pair too, so tiled windows meet under
  the bar like floating ones. A floating window that already draws round corners looks the
  same; one that draws square ones (Qt, some Electron apps) is rounded there too. Only
  pixels inside the frame are cut: a floating window's own shadow is kept.
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
  nothing is attached. Measure frame time with ~5 windows behind a maximized one before shipping.
- **Rejected**: two corner caps in top chrome painting a clone of the wallpaper — no
  offscreen and no culling loss, but wrong whenever another window sits behind or is
  raised over the corner, and it would have to hide during every move/maximize
  animation and in the Overview.

## 2. Island states

Three tiers (decided 2026-11-05, Ethan), named by size: **minimal** < **compact** <
**expanded**. Apple's words, not Apple's mapping (APPLE §B2):
- **minimal** — resting in the bar: one line, 32 px tall, one to three pills.
- **compact** — on hover: the hovered pill itself grows in place into a short panel, 56 or
  88 px tall, over the top of windows (and the system cluster, if it must). No Apple
  equivalent; it replaces the old hover peek, which only swapped a pill's content.
- **expanded** — on click, or opened by the stack: the panel with tabs; it carries what
  compact has no room for (media: player choice, the app's volume, shuffle/repeat).

The code uses these names since FEATURES M3 "Three tiers: names in code" (2026-11-05); the
older notes in FEATURES still say compact for minimal, peek for compact and minimal mode
for several pills.

| State | When | Shape | Interaction |
|---|---|---|---|
| **Idle** | no activity | `IDLE` 120×32 r16; content per `idle-content` (§2a) | hover → +10 % width, +2 height, and with the amber light the missed list as a compact; press → +16 % pulse; **click → open Home** |
| **Minimal** | one or more activities | pill 1 (highest priority) at screen centre, content-fit; up to two side pills to its right, each a fixed 120×32, as many as fit before the system cluster (§2c) | hover a pill 300 ms → its compact; **click → that activity's tab**, Home on the `+N` badge or while the missed list shows (2026-11-04) |
| **Compact** | the pointer rests on a pill | the hovered pill grows in place: top edge kept, width 0.72 × expanded (content-fit, ≥ 240), height 56 for one row, 88 with a bar, content-fit up to 120 for rows (§4) | the activity's compact content (media: transport and seek bar), or the amber missed list instead (INDICATORS.md); its buttons run their action, a click elsewhere on it = the pill's click; never takes the keyboard; collapses 200 ms after the pointer leaves |
| **Expanded** | opened from idle, minimal or compact by a click; by the stack for `ask` / transient; for ~2 s by an alert | `EXPANDED` (see §4) | only a click outside collapses (or Esc after a click-open); clicks inside do nothing, buttons run their action (decided 2026-11-01) |

Rules:
- Pill closed = live activities only, no UI chrome. Expanded = Notchy-style panel.
- Expanded opens **Home** from idle, or the **activity's own tab** from its pill (minimal or
  compact).
- A tab strip exists only inside Expanded (Home · Media · Timer · …). Pill never shows tabs.
- Activity ends → removed immediately. `ttl` for short-lived ones (feedback §2e,
  notifications).
- Highest priority shows; ties → most recent. Feedback (§2e) and transient interrupt, then
  the previous returns. Transient is Apple's `style: 'transient'` (greeting, a picker): it
  opens expanded; feedback never does (2026-11-05: the two were mixed up here).
- Alert (2026-11-01): the shown activity opens expanded for ~2 s (stays while hovered),
  or pulses if it has no expanded; an alert on a covered activity brings it up for ~2 s,
  then the top returns (§2c: an activity with a pill of its own alerts on that pill).
- A click-open takes the keyboard (modal, so Esc works); automatic opens (alert, ask,
  transient) never do, so typing elsewhere is not interrupted.
- Fullscreen (2026-11-03): the island hides with the top bar on a monitor showing a
  fullscreen window (Shell's `trackFullscreen`; it shows again in the Overview), and an
  open island closes. While hidden nothing opens or alerts; activities that end count as
  missed (amber light on return), an unanswered ask lights red. Back on screen, an ask or
  transient on top opens as if it had just arrived. Super+B does nothing while hidden.

### 2a. Idle content (decided 2026-10-30)

Setting `idle-content`, default `auto` (changed from `none` 2026-11-03). Each value is an
**idle plan** provided by a module (`modules/<id>/idle.js`), so the list grows with modules
and shrinks when they are off; `auto` and `none` are the kit's own.

| value | what the pill shows | module | refresh |
|---|---|---|---|
| `auto` | the idle plan that matters right now, chosen and rotated by context (§2a-iii) — a smart stack, not a random carousel | core | plan signals + one re-rank timer while idle |
| `none` | black pill + the **buoy light**: a small amber dot at the leading edge. Off normally; lit when something was missed (§6 missed history) | core | event |
| `clock` | a *second* clock, styled unlike the one in the right cluster: an icon of the part of the day + the time in bold even figures. Six icons, one per daypart (`kit/daypart.js`, §2d): the sun along an arc over the horizon (dawn and evening half-set in peach `#F5C4B3`, morning/noon/afternoon in pale gold `#FAC775`), then the moon; colour SVGs at 20 px like art and Bu, no state colour (2026-11-04, Ethan). The time is GNOME's (12/24 h, locale). Variants via `idle-clock-style`: icon and time (default) · time only · icon only · with seconds | `clock` | GNOME's wall clock (`GnomeDesktop.WallClock`, as the lock screen): a tick on the minute (each second with seconds), right after suspend; it exists only while the idle pill is on screen |
| `weather` | condition icon + temperature; its compact adds wind direction/speed, humidity, feels-like; expanded shows the day | `weather` | GNOME's own `ui/weather.js` client (same location as dateMenu); `idle-weather-refresh` 30 min / 1 h |
| `next-event` | next calendar event: title · time, Join glyph when it has a link | `calendar` | EDS signals |
| `mascot` | Bu's eyes in the pill, four modes — idle · sleep · missed · waiting; in `idle` the eyes stroll in pixel steps: look, walk, blink, smile, one beat every few seconds (`idle-mascot-stroll`); asleep after 60 s without input, in power-saver and with animations off (`MASCOT.md` § Eyes, 2026-11-03) | `mascot` (off by default) | light changes, daypart, idle monitor, power profile; one beat timer only while strolling |

Rules: an idle plan is presentation only (same data shape as an adapter); it never
surfaces an activity; it is replaced the instant any activity surfaces; nothing animates
while idle — no looping or continuous motion; a change of idle content (the clock's
minute, `auto` switching plans) is one transition (§5), then stillness (clarified
2026-11-03). Each plan's own settings sit under it on the prefs **Island** page (2026-11-04,
ARCHITECTURE rule 9). Until `auto` lands, `idle-content` defaults to `clock` (Ethan,
2026-11-04); with a plan the grey "off" light is not drawn, amber and red still are.

Pill structure is the same in every state: `[light] leading · text · trailing [dot]`.
The two edge slots are Buoy's own status layers; the three zones between them belong to
the plan (idle) or the adapter (minimal). **Edge slots exist only when they have
something to say**: no light → no slot, the three zones take the full pill; a light or
dot appears → that zone nudges inward and the pill grows a few px (one small morph).
The grey "off" light is drawn only in idle `none`, so an empty pill never looks broken;
idle `none` keeps the full 120 px.

### 2a-i. The buoy light (left edge slot, idle, minimal and compact)

Static, never blinking. Off (faint grey, idle `none` only) · **amber** = something ended while you were
away / fullscreen (missed history: hover names it, opening Home turns it off — 2026-11-03) · **red** = something
is waiting for your answer (an `ask` while DND). Red › amber. Shown in idle, minimal
**and** compact — it is a separate slot, so it never competes with the app icon; `present.js`
nudges the leading zone inward when the light is on. Hidden only while expanded, where
Home already lists what was missed.

**Bu carries the light** (2026-11-03): when a pill's leading is Bu (`{mascot}`, agent
activities and the greeting), the edge slot is not drawn — Bu's lamp is the light. It
shows the stack's amber/red when there is one, otherwise the pose's own colour
(INDICATORS § Bu's lamp). One light per pill, never two.

### 2a-ii. Privacy dot (right edge slot, idle, minimal and compact)

Mirrors iOS and the buoy light: a small **orange** (mic) / **green** (camera, screen
share) dot at the far right of the pill, outside the content zones, present whether the
pill is idle or showing an activity. `present.js` inserts it last and nudges the
trailing zone inward; adapters never know. Click → expanded Home with "in use by Zoom".
GNOME's own indicator in the system cluster is hidden while the `privacy` module is on;
setting `privacy-dot = pill | system | both`, default `pill`.

### 2a-iii. `auto`: a smart stack of idle plans (decided 2026-11-03)

Like the iOS Smart Stack or the Windows widgets board: the user does not pick a plan,
the pill shows what is useful *next* — what to prepare for, what is happening outside.

- **Relevance, predefined.** Every `idle.js` also exports `relevance(ctx)` →
  `{score: 0–100}` or `null` when it has nothing to show. Cheap and synchronous: it reads
  the state the plan already holds; no timers, no I/O (those stay in the plan's source).
  `ctx` = `{now, daypart}`. Default scores, fixed in code, not user formulas:

  | plan | score |
  |---|---|
  | `next-event` | starts in ≤ 30 min **90** (holds, see below) · running now 80 · within 2 h 50 · later today 25 · none → `null` |
  | `weather` | first hour of `morning` 70 · a change in the next hour (rain starts, ≥ 5 °C swing) 75 · otherwise 35 · no location/offline → `null` |
  | news (later, M5) | 40; 55 for an item newer than 1 h from a followed source |
  | exchange rate / stocks (later, M5) | 30; 70 on a move past the user's threshold |
  | `clock` | 10 — the floor, always available |
  | `mascot` | 10, like `clock` (ties take turns), only when listed in `idle-auto-plans` |

- **Choice.** Highest score shows. Ties → the plan in `idle-auto-plans` order that was
  shown longest ago, so equal plans take turns. A plan scoring ≥ 80 **holds** the pill
  until its score drops (never rotate away from a meeting in 10 minutes).
- **When it re-ranks.** On a plan's `changed` signal (event added, weather update, a
  daypart boundary) and on one kit timer, `idle-auto-interval` (default 5 min, 2–30),
  that exists only while the pill is idle with `auto` — removed the moment an activity
  surfaces, on expand, and on disable. A re-rank that picks the same plan changes nothing.
- **Interests** (Windows' word): `idle-auto-plans` (as) — which plans the stack may use,
  in tie-break order; default every enabled plan. Prefs page **Island** (2026-11-04, was
  "Idle"): a reorderable list with switches, one row per plan, its own keys under it; a
  plan whose module is off is greyed ("Turn on in Modules"). The Modules switch turns the
  whole module on or off; the Island switch only puts its plan in the stack. A plan whose module is off does not exist (ARCHITECTURE rule 6).
- **Interaction.** Hover → the shown plan's compact; scroll on the idle pill → next /
  previous plan in the stack (held for one interval, like swiping the Smart Stack);
  click → Home, as in every idle state.
- **Motion.** A switch is one content transition (fade out 100 ms / in 200 ms, plus the
  width morph if the plan is wider), then nothing until the next switch.
- **Later plans** (news, exchange rate, stocks): each its own module, off by default,
  fetching through Soup at most every 30 min and only while it is in `idle-auto-plans`;
  they are why `auto` is a ranked stack rather than a fixed rotation.

### 2b. Tabs (decided 2026-10-30)

- The tab strip exists only inside expanded, and only when a click opened it; the stack's
  own opens (alert, ask, transient) show the activity's expanded view without a strip.
  Tabs = modules that ship `tab.js`; Home is always first; order follows §6.
- **Kind tabs** (decided 2026-11-02): every enabled module with kinds has its tab, always
  shown, running or not (default strip: Home · Media · Notifications · Transfers · Timer ·
  [Calendar] · ⋯; Notifications, Transfers and Timer are stub modules until their
  roadmap items); until it ships `tab.js` the tab shows its activities' expanded
  views (top first) or stays empty. Modules whose kinds are only feedback (osd, copied;
  §2e) have no kind tab; a feedback-only module's own `tab.js` (clipboard's history) is a
  standalone tab, in the slot and ⋯ (2026-11-05). Kinds no module claims (D-Bus callers) get a tab while one of their
  activities has an expanded presentation, after the module tabs.
- **Strip look** (2026-11-02, after Notchy): one rounded group hugging its tabs; the
  active tab shows icon + title on a lighter pill, the others only their icon (the title
  is their accessible name). Every tab has an icon: the module's `icon`, for an unclaimed
  kind its activity's icon, else a generic one.
- Where you open from decides the tab: idle → Home; the `+N` badge → Home; a pill (minimal or
  its compact) → the tab of its kind (`kind → module → tab`); kinds without a tab (osd, copied) → the
  activity's `onPress` if it has one (e.g. raise the player), else Home. Tabs can be
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
    chosen, their bodies empty until the M5 item (2026-11-02; was "off by default").
  - May use Shell APIs in `tab.js`; still no polling while closed.
  - Likely first ones: Clipboard, Launcher. Not planned: Calculator, Emoji (GNOME search has them).

### 2c. Several pills (decided 2026-10-30; shapes and hover 2026-11-05)

- **Pill 1** is the highest priority, at screen centre, content-fit as when it is alone
  (120 … 0.6 × expanded, `wide` 0.8; §4). It never narrows because others run
  (2026-11-05, Ethan: before, every pill was squeezed to ≤ expanded/3).
- **Side pills 2 and 3** share one fixed shape, 120 × 32 (the idle size): leading, a short
  trailing (equaliser, `40%`, `4:59`) and the `+N` badge; their text is dropped. The
  adapter's data is the same for every pill, so the short value that matters goes in
  `trailing` (APPLE §B3). Their full content is their compact.
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
  all; 2 px of accent still read heavy on the pill); ←/→ move the ring (no wrap); Enter or Space
  opens the ringed pill as a click would (its tab, or Home); Esc or `Super+B` again lets
  go, and so does a click outside the pills. Open: ←/→ walk the tab strip, Esc closes.
  An open the stack made (ask, alert) takes no keyboard (§2); `Super+B` takes it for that
  pill, which then stays open like a click-open. With the keyboard, an ask's buttons
  answer to a key printed on them: the first letter of the label (Allow → A, Deny → D,
  diacritics folded, Đồng ý → D); labels sharing a letter, or not starting with one, take
  their position 1–9 (Deny · Allow · Always → D · 2 · 3). Ignored while another popup
  holds the keyboard.

### 2d. Greeting (decided 2026-11-03)

Once a day, the first time the island appears, it opens expanded and says hello.

- **When.** On the first enable of a local day: login, or the first unlock/resume on a
  new day (Shell disables extensions on lock and re-enables them on unlock — Buoy has no
  `session-modes`, so it runs only in `user`, `ui/extensionSystem.js`). State:
  `greeting-last-day` (s, `YYYY-MM-DD`), written only once the greeting has really shown.
  Not shown while a fullscreen window has focus; then the next enable that day tries
  again.
- **What.** A transient activity, kind `greeting`, from the `greeting` module. It opens
  expanded like any stack open (no keyboard grab, §2), stays ~8 s (held while hovered),
  click outside closes it early, then it ends and the idle content takes over. Any real
  activity that surfaces meanwhile interrupts it (transient rules); the day still counts.
  `greeting-style = expanded | minimal | off`, default `expanded`; `minimal` shows only the
  first line in the pill for 4 s.
- **Expanded content**, three lines, the greeting large:
  ```
  Good morning, Ethan.
  Today is Tuesday, 3 November 2026.
  Ho Chi Minh City: 32 °C, cloudy, light breeze.
  ```
  (vi: "Chào buổi sáng, Ethan. Hôm nay thứ Ba, ngày 3/11/2026. Nhiệt độ ở TP.HCM hiện tại
  là 32 °C, có mây, gió nhẹ.") Date in the locale's long form; weather = location name,
  current temperature, condition, wind in words (calm · light breeze · breezy · strong
  wind, by Beaufort). Strings go through gettext with the localisation item (M5).
- **Weather source.** GNOME's own client (`misc/weather.js` `WeatherClient`, the location
  the clock popover uses), created by the greeting's `source.js` — not the `weather`
  module (rule 1). At login it waits up to ~3 s for the first update; without one the
  weather line is left out, and filled in place if data arrives while open. No location or
  offline → two lines.
- **Name.** `greeting-name` (s); empty = `GLib.get_real_name()`, falling back to the user
  name. Prefs shows it prefilled so a short name is one edit away.
- **Dayparts** — `kit/daypart.js`, shared with the clock plan's icons and `auto`'s
  `ctx.daypart`: `dawn · morning · noon · afternoon · evening · night`, starts from
  `daypart-starts` (ai, hours, default `[5, 7, 11, 13, 18, 22]`, wrapping past midnight).
  Any rotation works (night may start at 1, dawn at 23) as long as the six hours are
  distinct and in cyclic order; anything else falls back to the defaults, never an
  error. A part changes on the hour; a consumer that must follow it arms one timer at
  `nextBoundary()` (2026-11-04).
  Greetings: dawn and morning → "Good morning", noon → "Good day" (vi "Chào buổi trưa"),
  afternoon → "Good afternoon", evening → "Good evening", night → "Still up" (vi
  "Khuya rồi").
- The adapter builds all text from `{daypart, name, date, weather?}`; pure, no truncation.
- **Bu waves** (2026-11-03): the expanded greeting's leading is `{mascot: 'wave'}` — two
  frames for ~2 s, then `idle` (`MASCOT.md`).

### 2e. Feedback: minimal only (decided 2026-11-05, Ethan)

- **What.** A confirmation of something you just did: `osd` from `hud`, the input source
  from `input`, and `copied` from `clipboard` (GNOME shows nothing on copy; Buoy does).
- **input** (2026-11-05; named `layout` until then — it covers IBus input methods too): the
  input source you switch to, xkb or IBus, as Shell's indicator
  names it — the IBus engine's `InputMode` symbol when it has one (Bamboo's V / E), else
  the short name — then the source's name: "EN · English (US)". It also flashes when an
  engine switches its own mode. Shell's Super+Space switcher list is replaced too
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
- **ttl** ~1.5 s (copied 1 s). A repeat updates the same activity and restarts the ttl, so
  holding the volume key keeps one pill and only its bar moves. Hover holds it: the
  pointer on any pill pauses its ttl, and leaving gives it a fresh one (`stack.hold`).
- **While Home is open** feedback shows as a row in Now for its ttl (the pill is the
  panel then).
- **Size by type**, content-fit with the adapter's hints, never px (ARCHITECTURE rule 11):
  volume, brightness and backlight are icon + bar (`wide`); Caps Lock and the input source are
  icon + a short word; copied is icon + the snippet or an image thumbnail, ellipsized at
  pill 1's widest.
- **Clipboard** (2026-11-05, was two modules, `copied` and `clipboard`): one `clipboard`
  module. Its `source.js` listens to `Meta.Selection` `owner-changed` (mutter
  `meta-selection.c`; no polling) and surfaces `copied`; with `clipboard-history` on it
  also keeps the history its standalone tab shows (FEATURES M5). Off, nothing is stored.
  `copied` skips a clipboard Shell set itself — the new owner is a
  `Meta.SelectionSourceMemory` (`st-clipboard.c` `st_clipboard_set_content` →
  `meta_selection_source_memory_new`): a screenshot, or a row the Clipboard tab put back;
  the history still records it.
- **Screenshot** (2026-11-05): not feedback but a `notification`, from Shell's own
  "Screenshot captured" (`ui/screenshot.js` `_storeScreenshot`: the PNG goes to the
  clipboard, then a transient notification with the thumbnail, "Show in Files" and
  activate → open the file), presented by the notification module's override for Shell's
  screenshot source. Short like feedback: pill 1 for ~3 s, never counted as missed (your
  own action), minimal = thumbnail 20 + "Screenshot". Unlike feedback it has a compact —
  thumbnail 40, "Show in Files", click opens the image — since it leaves a file you may
  act on. One pill per shot: the clipboard side stays quiet (above). A finished screencast
  ("Screencast recorded", same file) is handled the same way; the recording itself is a
  running activity with its timer and stop button (§6b privacy / recording).

## 3. Expanded: Home

Single screen, no sub-navigation. Four blocks, each a module that can be off:

```
┌ ⌂ Home · ♪ Media · ⏱ Timer · [ ▣ Clipboard ] · ⋯ ────────────────── ⚙ ┐
│ [art] title           ⟲ ≡    │ ☁ Weather          ⏱ Timer            │
│       artist                 │   31° Partly cloudy   --:--            │
│   ◀◀  ▶  ▶▶                  │   HCMC · H34 L26                       │
│                              │ UP NEXT                                │
│ October 2026        ‹ ›      │ ▌Design review 3:00 PM                 │
│  S  M  T  W  T  F  S         │ ▌Gym 5:30 PM · 45 min                  │
│  …  calendar grid …          │                                        │
└──────────────────────────────┴────────────────────────────────────────┘
  strip: Home · kind tabs of enabled modules · one slot for a standalone tab · ⋯ menu · ⚙ prefs
  ⚙ sits alone at the right of the strip row (a round button); it closes the island, then
  opens the extension's prefs window (2026-11-02)
  no system indicators here — they live in the right-hand system cluster (§1)
```

- **Missed** (2026-11-03): while the missed history has entries, Home starts with a
  "Missed · N" section — the last 5, newest first, each row the kind's icon, its text, the
  tab's name and the time it ended; a row opens that kind's tab and leaves the list, as an
  activated system notification does; "× Clear" empties it.
  Showing Home turns the amber light off; the list stays until cleared or pushed out by
  newer ones. The running activities follow under "Now". In M4 the notifications tab
  carries the same group ("Missed while away") above the system's own list; a missed
  notification there points to the real one, never a copy, and Buoy posts no
  notifications of its own.
- **Until the M3 blocks** (2026-11-02): Home lists every visible activity (the full list,
  also behind `+N`), each row its minimal view; a row opens that activity's tab. Nothing
  running → "Nothing going on" with Bu (`idle`, or `missed` while history has entries). The panel's height fits its content up to the expanded cap;
  beyond that the tab body scrolls (no blur, scrollbar only when needed).
- Now playing (one row) — MPRIS. Hidden when nothing plays.
- Calendar — reuse `ui/calendar.js` (same EDS source as dateMenu).
- Weather — reuse `ui/weather.js` (same GWeather location as dateMenu).
- Up next — today's events from the same calendar source.
- Timer — current pomodoro/stopwatch or `--:--`.

## 4. Sizes (decided 2026-10-30: derived, not fixed)

All sizes are logical px; HiDPI is handled by St/Clutter. `kit/shapes.js#shapesFor()`
derives everything from two inputs — the monitor's logical width `W` and the panel
height — and is recomputed on `monitors-changed` or when `expanded-width` changes.
A function, not breakpoints: no jumps when moving between monitors.
Every width is snapped to an even whole px (2026-11-01), so a shape centred in the even-wide
container sits on whole pixels — no half-pixel edges; radius = ⌊h/2⌋.
Expanded follows iOS (2026-11-01): width is fixed per screen (derived, or the user's
`expanded-width`), height is not a setting — it fits the content up to width/2. The input
container is sized to that cap.

| Thing | Rule | 1920 | 2560 | 3440 |
|---|---|---|---|---|
| pill height `h` | panel 40 − 2×4 | 32 | 32 | 32 |
| idle | `h × 3.75` wide, r = h/2 | 120×32 | 120×32 | 120×32 |
| hover / press | +10 % / +16 % width, +2 / +4 height (a pill before or without its compact) | 132×34 / 140×36 from idle | | |
| minimal, pill 1 | content + 28 (rounded up), clamped to [idle, 0.6×expanded] (`'wide'` hint → 0.8) | ≤ 336 | ≤ 430 | ≤ 456 |
| minimal, pills 2–3 | fixed, the idle size | 120×32 | 120×32 | 120×32 |
| compact | width 0.72 × expanded, content-fit down to 240; height 56 (one row), 88 (a bar), content-fit up to 120 for rows (a title and 3 rows measure 72 px, so the missed list is 88; a 40 px leading over 3 rows needs more — measured in Shell 50.1, 2026-11-05); r 24; top edge at the pill's (2026-11-05) | ≤ 404 × 56/88/≤120 | ≤ 516 | ≤ 548 |
| expanded | width `clamp(0.28 × W, 560, 760)` or `expanded-width` (≤ W − 40); height fits content, at most width/2; r 28 | 560 × ≤280 | 716 × ≤358 | 760 × ≤380 |
| container | the monitor's width (2026-11-05, was expanded + 20 each side: a compact may open on any pill, up to 4 px from the screen edge), expanded's cap + 40 tall; never reactive at rest, so it takes no clicks (Clutter picks only reactive actors, `clutter_actor_should_pick`) | 1920 | 2560 | 3440 |

Leading element per tier (2026-11-05): 20 px minimal, 40 compact, 56 expanded; Bu
20 / 40 / 50, whole multiples of its 10-cell grid (MASCOT.md). Up to 1 action in
minimal, 3 in compact and expanded.

Inside expanded, Home and tabs use flowing layouts (`St.BoxLayout`, `x_expand`); the one
content breakpoint is below ~600 px, where Home goes from 4 cells to 2 columns.

Adapters never see these numbers (ARCHITECTURE rule 11): they return content and at most a
discrete hint (`size: 'wide'`), and the renderer ellipsizes or drops low-priority regions.

## 5. Motion

- Background actor eases `x / width / height`; content fades (100 ms out, 200 ms in).
- `EASE_OUT_BACK`, 380 ms shape · 200 ms hover · 120/250 ms press.
- Compact (2026-11-05): a pill growing into its compact is a shape morph (380 ms) and
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
   animations off; 2026-11-05, Ethan), ⏸ when paused, no button; a
   paused pill goes after `media-hide-paused-after` (5 min). Compact (hover): art 40,
   title / artist · app (a title too long for the compact scrolls right to left: 2 s at
   the start, 30 px/s, two copies 40 px apart so each loop ends where it began; still and
   ellipsized with animations off; 2026-11-05, Ethan), ⏮ ⏯ ⏭, the position running with elapsed and remaining —
   display only. Tab Media: players as chips, art, title (scrolling
   like the compact's when long) / artist / album, "Open app",
   a slider to seek, shuffle · ⏮ ⏯ ⏭ · repeat. Art in minimal and compact has corners
   inside the pill's: the pill's radius less the art's inset across, the content padding
   (24 − 14 = 10 on the compact's 40; minimal 16 − 14 = 2, raised to 6, under which a
   20 px art reads square); in expanded and the tab it stays square (2026-11-05, Ethan). No volume in the tab: per-app volume and
   the output device go to a Sound tab (§6b). Spotify ads: "Ad" and their countdown.
2. **hud** — volume / brightness / keyboard backlight / caps lock replace the stock OSD, as
   feedback (§2e).
3. **home** — the expanded Home above.
4. **appname** — left cluster.
5. **greeting** — once a day, expanded hello with date and weather (§2d).
6. **idle `auto`** — the smart stack over the `clock`, `weather`, `next-event` plans (§2a-iii).
7. **notifications** (moved here from §6b 2026-11-06, Ethan) — a compact with the notification's own actions
   (Reply / Mark as read / Open); DND toggle. A **notifications tab** lists the history
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
   a meeting link.
6. **eject** — mount-added with one-tap eject (downloads moved to v0.1, §6c, 2026-11-06).
7. **privacy / recording** — cam/mic dots, recording timer; "call" activity when
   cam+mic are both in use.
8. **several pills** — pill 1 plus up to two 120 px side pills (§2c).
9. **clipboard** — the copied feedback (§2e, v0.1) and, with `clipboard-history`, the
    Clipboard tab: history, search, pin, paste (M5).
10. **Sound tab** (2026-11-05, Ethan) — a standalone tab, Notchy's mixer: every app playing
    sound with its own volume slider, and the output device (GNOME's, for everything),
    from Shell's mixer (`ui/status/volume.js` `getMixerControl`). Not in the Media tab.

## 6c. Transfers tab (decided 2026-11-03)

What the tab can show is bounded by its sources, so it grows in two steps. Checked
2026-11-03 against Nautilus upstream, Ubuntu's packaging and the installed binaries:
`com.canonical.Unity.LauncherEntry` comes from **Files on Ubuntu only** (Ubuntu's
`12_unity_launcher_support.patch` via `libunity`; upstream Nautilus sends none) and from
**Chrome** (`libunity.so.9`); **Firefox sends none** (only `_NET_WM_XAPP_PROGRESS`, an X11
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

- **M3, `progress`.** LauncherEntry says only *which app* is busy: progress 0–1, maybe a
  count, urgent. One pill and one row per app, the fraction summed over everything the
  app is doing: two copies in Files are one "Files 55 %" (Ubuntu's patch sends the
  combined ratio and no count, so not even "2 operations"). The tab:
  - **Running** — one row per app: icon, name, the count when sent ("2 downloads"), %,
    a thin bar.
  - **Done** — a row stays a little after the app's progress ends (pill gone), with the
    time, then leaves (2026-11-05: 10 min, at most 5). The pill says "Name · Done" for
    2.5 s first. Done means the progress was hidden at ≥ 99 %; hidden earlier (cancelled)
    or the app leaving the bus ends it without Done.
  - A click focuses that app's window (`Shell.AppSystem.lookup_app(id).activate()`);
    there is nothing more to open.
  - Not in M3: Firefox (no signal), Files outside Ubuntu (it only posts the notification
    "N file operations active" while its window is closed —
    `nautilus-progress-persistence-handler.c`; that reaches Buoy with M4 notifications).
- **M3, `downloads`** (moved from M4 2026-11-06, Ethan: on GNOME neither browser sends
  LauncherEntry — Chrome loads libunity only on Unity/KDE — so this is their only way in).
  Each `.part` / `.crdownload` in a watched folder is its own
  **Running** row from the moment it appears (name, size, speed; the ring only per the
  exception above) — this is how Firefox shows up at all. Renamed to its final name, it
  moves to a **Downloaded** group: file type icon, file name, folder · app · time. A
  click opens the file; two **icon-only** buttons (accessible name and tooltip "Open",
  "Show in Files"): `document-open-symbolic` opens it, `folder-open-symbolic` shows it
  selected in Files.
  Where files are caught:
  1. the user's Downloads folder, `GLib.get_user_special_dir(DIRECTORY_DOWNLOAD)` (not a
     hard-coded `~/Downloads`), always;
  2. up to 10 more folders in prefs (`transfers-folders`), each one non-recursive
     `Gio.FileMonitor` (one inotify watch per folder, hence the cap);
  3. to try first in M4: Recent files (`recently-used.xbel`, one monitor) as the
     catch-all for a file saved anywhere — filtered to browsers and to entries added
     just now, since it also lists every file opened elsewhere. If Firefox and Chrome
     both write there, it becomes the main source for finished files and 1–2 the
     fallback; not verified yet. Recent files only see a file once it is finished, so
     Running rows still need 1–2.
- **Not planned:** "source → destination" for a Files copy — Nautilus exposes no names
  over D-Bus (`org.gnome.Nautilus.FileOperations2` starts operations, it does not report
  them), and a guess could be wrong.

Roadmap: FEATURES.md (milestones M0–M5 with status). Status marks: INDICATORS.md. Research: APPLE.md (ActivityKit/HIG → BuoyKit). Mascot: MASCOT.md (Bu). Competitor notes (Notchy audit, Isle, Islet, BEHAVIOUR) are kept locally in `docs/notes/` and not committed.

## 7. BuoyKit (decided 2026-10-30)

Buoy is a framework first, features second — see `APPLE.md` part B for the full contract.

- **Core** owns: activity lifecycle (`surface / update / end / schedule / ask`), priority
  across apps, ttl and stale state, the three tiers (minimal — one to three pills —,
  compact on hover, expanded with leading/trailing/center/bottom regions), Home, motion, and the
  D-Bus API.
- **Default adapters** (`lib/apps/default.js`) render every `kind` (media, notification,
  progress, osd, power, device, timer, ask, attention, copied, phone…) well enough that
  an app Buoy has never heard of still looks right.
- **Per-app adapters** (`lib/apps/<app>.js`) override only the methods that need to differ
  (Spotify ad countdown, Telegram avatar, Firefox download names). Adapters return
  presentation data, never raw actors; the renderer keeps every app in the same visual
  language.
- Apps and scripts that talk D-Bus send presentation data directly and skip adapters.

## 8. Non-negotiables

No polling while closed; no blur; no shadows with blur; actors reused not recreated;
nothing animating while idle (a content change is one transition, §2a; a playing
equaliser is an activity, not idle, §6); a module switched
off costs zero.
