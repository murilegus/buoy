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
  no app:      [⊞ Workspace 2]          click pill: Home · click left: Overview
```

- Panel: transparent, 40px. Two clusters plus the island.
- **Cluster background** (decided 2026-10-30): **none by default** — icons and text sit
  bare on the wallpaper like the iPhone status bar; only the pill is a black block. On
  hover a translucent rounded background (`rgba(0,0,0,0.35)`, radius 12, no blur) wraps
  the whole cluster. Setting `cluster-background = hover | always | never`, default `hover`.
- **Contrast on light wallpapers**: like iPhone, the text flips, not the background. On
  `picture-uri` change (signal, no polling) decode the wallpaper once, downscaled, measure
  mean luminance of the top 40 px under each cluster, and toggle class `buoy-light` → dark
  text/icons. 1 px non-blurred text/icon shadow as fallback for busy wallpapers. Setting
  `cluster-contrast = auto | light | dark`, default `auto`. The pill is always black and
  unaffected.
- **Left cluster** (decided 2026-10-30): two layers of information in one place.
  - Normal: icon + name of the focused app (`Shell.WindowTracker`, `notify::focus-window`).
  - Hover: the cluster widens and appends the workspace as a secondary item: grid icon +
    number ("Firefox · ⊞ 2"), or the workspace name if the user set one ("Firefox · ⊞ Work").
    No "WS" abbreviation; the icon carries the meaning.
  - No focused window (empty desktop, Overview): the workspace is the main content, in
    full words — grid icon + "Workspace 2", or its name. Setting
    `left-cluster-empty = workspace | hidden`.
  - Click → Overview (replaces the hidden Activities button; same corner people already
    aim for). Right-click → app menu (New window, Quit, Details). Scroll → switch workspace.
- **Third-party tray icons** keep GNOME's own per-item hover highlight; Buoy never wraps
  or restyles them.
- **Right side** (decided 2026-10-30, after the Notchy bar): two different things.
  - **Third-party tray icons** (AppIndicator, input method, screen-record…): bare on the
    wallpaper, each standing alone, GNOME's own order. No cluster background.
  - **System cluster** (revised 2026-11-02): GNOME's **quick settings indicators**
    (network, volume, battery…) together with the **clock** (`dateMenu`, moved from
    centre), as **one button** with the shared hover background. A click anywhere in the
    cluster, clock included, opens the stock quick-settings menu; the clock has no click,
    hover or focus of its own (`dateMenu` stays in place, non-reactive, restored on
    disable). Its unread dot (`MessagesIndicator`) is hidden — the buoy light (§2a) says
    "missed". Nothing is re-anchored.
  - The stock calendar/notifications popover is no longer reachable by mouse; Super+V /
    Super+M (`toggle-message-tray`) still open it under the clock. Its contents move to
    Buoy: notification history → the notifications tab (§6b), calendar and weather →
    Home (§3) and idle plans, DND → the stock quick toggle (`status/doNotDisturb.js`).
    World clocks: placement later (Home or elsewhere), not in v0.1.
- The island holds **activities only**; persistent system status stays in the system
  cluster. (This supersedes the earlier "indicators in the pill" decision.)

### 1a. Maximized windows: rounded top corners (decided 2026-11-02)

Floating windows already have round corners (Adwaita `--window-radius`, 15 px in
libadwaita 1.9 on Ubuntu 26.04), but Adwaita sets it to 0 when maximized or tiled.
With a transparent panel the maximized window's square top edge meets the wallpaper and looks
cut off. Buoy rounds the **top-left and top-right corners only** of maximized windows,
so the top edge reads as a continuation of the floating windows; the bottom corners stay
square against the screen edge or dock.

- **On by default.** `window-corners` (b, default `true`), `window-corners-radius`
  (i, default `15` = Adwaita's window radius, range 0–32). Both live on their own prefs
  page (**Windows**), not under a module; changes apply live.
- **Which windows**: maximized in both directions (`maximized_horizontally &&
  maximized_vertically`), normal window types, any toolkit (GTK, Qt, Electron, Xwayland).
  Not fullscreen, not half-tiled (Super+←/→) for now — tiled is an open question.
- **How** (`corners.js`, next to `panel.js`): a `Shell.GLSLEffect` on the window's
  `Meta.WindowActor` that discards the pixels outside the two top arcs — the pattern
  `ui/lightbox.js` (RadialShaderEffect) uses. Whatever is behind shows through the
  corner: the wallpaper under the panel, another window, the Overview. Added on
  maximize, removed on unmaximize, fullscreen, `window-corners = false`, window close and
  disable. Signals only (`window-created`, `notify::maximized-*`, `notify::fullscreen`);
  no polling, nothing animates.
- **Cost, accepted**: an effect makes Clutter paint that window through an offscreen
  buffer, and Mutter stops culling windows behind it (`meta-cullable.c`
  `has_active_effects`), so windows under a maximized one are painted again inside the
  damaged area. Only maximized windows carry the effect; with the setting off nothing is
  attached. Measure frame time with ~5 windows behind a maximized one before shipping.
- **Rejected**: two corner caps in top chrome painting a clone of the wallpaper — no
  offscreen and no culling loss, but wrong whenever another window sits behind or is
  raised over the corner, and it would have to hide during every move/maximize
  animation and in the Overview.

## 2. Island states

| State | When | Shape | Interaction |
|---|---|---|---|
| **Idle** | no activity | `IDLE` 120×32 r16; content per `idle-content` (§2a) | hover → +12px; press → +20px pulse; **click → open Home** |
| **Compact** | one activity | `activity.shape`, content-fit | hover → `hoverShape`; after 300 ms the activity's `peek` if it has one (e.g. media transport); **click → open that activity's tab** |
| **Minimal** | two+ activities | **side-by-side compact pills** (iPhone 18 Pro / iOS 27 model): highest priority at screen centre, others to the right in priority order, each 120 px … expanded/3, same zones as a single compact (text ellipsizes); fewer pills when three would reach the system cluster (2026-11-01) | each pill clicks into its own tab |
| **Expanded** | opened from idle or compact; by the stack for `ask` / transient; for ~2 s by an alert | `EXPANDED` (see §4) | only a click outside collapses (or Esc after a click-open); clicks inside do nothing, buttons run their action (decided 2026-11-01) |

Rules:
- Pill closed = live activities only, no UI chrome. Expanded = Notchy-style panel.
- Expanded opens **Home** from idle, or the **activity's own tab** from compact.
- A tab strip exists only inside Expanded (Home · Media · Timer · …). Pill never shows tabs.
- Activity ends → removed immediately. `ttl` for transient ones (OSD, notifications).
- Highest priority shows; ties → most recent. Transient interrupts, then previous returns.
- Alert (2026-11-01): the shown activity opens expanded for ~2 s (stays while hovered),
  or pulses if it has no expanded; an alert on a covered activity brings it up for ~2 s,
  then the top returns (until side-by-side minimal mode gives it its own pill).
- A click-open takes the keyboard (modal, so Esc works); automatic opens (alert, ask,
  transient) never do, so typing elsewhere is not interrupted.

### 2a. Idle content (decided 2026-10-30)

Setting `idle-content`, default `auto` (changed from `none` 2026-11-03). Each value is an
**idle plan** provided by a module (`modules/<id>/idle.js`), so the list grows with modules
and shrinks when they are off; `auto` and `none` are the kit's own.

| value | what the pill shows | module | refresh |
|---|---|---|---|
| `auto` | the idle plan that matters right now, chosen and rotated by context (§2a-iii) — a smart stack, not a random carousel | core | plan signals + one re-rank timer while idle |
| `none` | black pill + the **buoy light**: a small amber dot at the leading edge. Off normally; lit when something was missed (§6 missed history) | core | event |
| `clock` | a *second* clock, styled unlike the one in the right cluster: time + time-of-day icon (dawn / morning / noon / afternoon / evening / night, from `kit/daypart.js`, §2d); variants via `idle-clock-style` (icon+time, time only, icon only, with seconds) | `clock` | 1 min tick, only while idle |
| `weather` | condition icon + temperature; hover peek adds wind direction/speed, humidity, feels-like; expanded shows the day | `weather` | GNOME's own `ui/weather.js` client (same location as dateMenu); `idle-weather-refresh` 30 min / 1 h |
| `next-event` | next calendar event: title · time, Join glyph when it has a link | `calendar` | EDS signals |

Rules: an idle plan is presentation only (same data shape as an adapter); it never
surfaces an activity; it is replaced the instant any activity surfaces; nothing animates
while idle — no looping or continuous motion; a change of idle content (the clock's
minute, `auto` switching plans) is one transition (§5), then stillness (clarified
2026-11-03). Each plan has its own settings page.

Pill structure is the same in every state: `[light] leading · text · trailing [dot]`.
The two edge slots are Buoy's own status layers; the three zones between them belong to
the plan (idle) or the adapter (compact). **Edge slots exist only when they have
something to say**: no light → no slot, the three zones take the full pill; a light or
dot appears → that zone nudges inward and the pill grows a few px (one small morph).
The grey "off" light is drawn only in idle `none`, so an empty pill never looks broken;
idle `none` keeps the full 120 px.

### 2a-i. The buoy light (left edge slot, idle and compact)

Static, never blinking. Off (faint grey, idle `none` only) · **amber** = something ended while you were
away / fullscreen (missed history, hover to peek, clears after peek) · **red** = something
is waiting for your answer (an `ask` while DND). Red › amber. Shown in idle **and**
compact — it is a separate slot, so it never competes with the app icon; `present.js`
nudges the leading zone inward when the light is on. Hidden only while expanded, where
Home already lists what was missed.

### 2a-ii. Privacy dot (right edge slot, idle and compact)

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

- **Choice.** Highest score shows. Ties → the plan in `idle-auto-plans` order that was
  shown longest ago, so equal plans take turns. A plan scoring ≥ 80 **holds** the pill
  until its score drops (never rotate away from a meeting in 10 minutes).
- **When it re-ranks.** On a plan's `changed` signal (event added, weather update, a
  daypart boundary) and on one kit timer, `idle-auto-interval` (default 5 min, 2–30),
  that exists only while the pill is idle with `auto` — removed the moment an activity
  surfaces, on expand, and on disable. A re-rank that picks the same plan changes nothing.
- **Interests** (Windows' word): `idle-auto-plans` (as) — which plans the stack may use,
  in tie-break order; default every enabled plan. Prefs page **Idle**: a reorderable
  list with switches. A plan whose module is off does not exist (ARCHITECTURE rule 6).
- **Interaction.** Hover → the shown plan's peek; scroll on the idle pill → next /
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
  views (top first) or stays empty. Modules whose kinds are only feedback (osd, copied)
  have none. Kinds no module claims (D-Bus callers) get a tab while one of their
  activities has an expanded presentation, after the module tabs.
- **Strip look** (2026-11-02, after Notchy): one rounded group hugging its tabs; the
  active tab shows icon + title on a lighter pill, the others only their icon (the title
  is their accessible name). Every tab has an icon: the module's `icon`, for an unclaimed
  kind its activity's icon, else a generic one.
- Where you open from decides the tab: idle → Home; the `+N` badge → Home; a compact pill
  → the tab of its kind (`kind → module → tab`); kinds without a tab (osd, copied) → the
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

### 2c. Several pills (minimal mode, decided 2026-10-30)

- Each pill is an independent actor: hover grows only that pill; hover peek only on it.
- Click on any pill opens expanded at that pill's tab. On open, pills **merge**: the primary
  grows into the expanded panel, the others slide in and fade (300 ms). Close = split again.
- An `alert: true` update briefly expands **only that pill** (~2 s, no tab strip).
- Max 3 pills. Further activities don't show; the last pill carries a `+N` badge; clicking
  the badge opens Home with the full list, the rest of that pill its own tab (2026-11-02).
- Space (2026-11-01): pills stop before the system cluster (12 px margin). On 1366 px all
  three fit at ~124 px each; if two side pills of 120 px don't fit, only two pills show
  (or one), and the rest count in `+N`. Re-measured whenever the right cluster resizes.
- An alert on an activity beyond the shown pills brings it to the centre for ~2 s.
- Order: highest priority at screen centre, then to the right. When one ends, the rest
  slide to fill (eased x), never jump.
- Keyboard: `Super+B` focuses the primary; ←/→ moves between pills; Enter opens; Esc closes.

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
  `greeting-style = expanded | compact | off`, default `expanded`; `compact` shows only the
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
  Greetings: dawn and morning → "Good morning", noon → "Good day" (vi "Chào buổi trưa"),
  afternoon → "Good afternoon", evening → "Good evening", night → "Still up" (vi
  "Khuya rồi").
- The adapter builds all text from `{daypart, name, date, weather?}`; pure, no truncation.

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

- **Until the M3 blocks** (2026-11-02): Home lists every visible activity (the full list,
  also behind `+N`), each row its compact view; a row opens that activity's tab. Nothing
  running → "Nothing going on". The panel's height fits its content up to the expanded cap;
  beyond that the tab body scrolls (no blur, scrollbar only when needed).
- Now playing (compact) — MPRIS. Hidden when nothing plays.
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
| hover / press | +10 % / +16 % width, +2 / +4 height | 132×34 / 140×36 from idle | | |
| compact | content + 28 (rounded up), clamped to [idle, 0.6×expanded] (`'wide'` hint → 0.8) | ≤ 336 | ≤ 430 | ≤ 456 |
| expanded | width `clamp(0.28 × W, 560, 760)` or `expanded-width` (≤ W − 40); height fits content, at most width/2; r 28 | 560 × ≤280 | 716 × ≤358 | 760 × ≤380 |
| container | expanded + 20 px each side (overshoot room) | | | |
| minimal pills | ≤ expanded/3 each, max 3 | | | |

Inside expanded, Home and tabs use flowing layouts (`St.BoxLayout`, `x_expand`); the one
content breakpoint is below ~600 px, where Home goes from 4 cells to 2 columns.

Adapters never see these numbers (ARCHITECTURE rule 11): they return content and at most a
discrete hint (`size: 'wide'`), and the renderer ellipsizes or drops low-priority regions.

## 5. Motion

- Background actor eases `x / width / height`; content fades (100 ms out, 200 ms in).
- `EASE_OUT_BACK`, 380 ms shape · 200 ms hover · 120/250 ms press.
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

1. **media** — MPRIS: compact (art + title · artist), hover peek (transport), tab Media.
2. **hud** — volume / brightness / caps lock replace the stock OSD.
3. **home** — the expanded Home above.
4. **appname** — left cluster.
5. **greeting** — once a day, expanded hello with date and weather (§2d).
6. **idle `auto`** — the smart stack over the `clock`, `weather`, `next-event` plans (§2a-iii).

## 6b. Roadmap after v0.1 (all pure JS)

1. **notifications** — peek in the pill with the notification's own actions
   (Reply / Mark as read / Open); DND toggle. A **notifications tab** lists the history
   (2026-11-02, replaces the clock popover's list): read from `Main.messageTray`
   (`getSources()` + `source-added`, each source's `notifications` +
   `notification-added`), the same data the stock message list uses — no store of our
   own; dismissing in either place removes it from both.
2. **dbus** — `org.gnome.Shell.Extensions.Buoy` iface: `Show/Update/End` activity,
   `Ask(question, options) → answer`. Hook scripts call it with `gdbus call`.
3. **agents** — Claude Code / Codex approvals as a two-button activity in the pill
   (Deny · Allow · Always), done-alerts; hooks installed/removed from prefs.
4. **timer** — pomodoro + stopwatch, keep-awake, ring in the compact pill.
5. **power / bluetooth** — charging, low battery, device connected with its battery.
6. **calendar** — Up next in Home; alert 5 min before with Join when the event has
   a meeting link.
7. **downloads / eject** — Downloads folder monitor; mount-added with one-tap eject.
8. **privacy / recording** — cam/mic dots, recording timer; "call" activity when
   cam+mic are both in use.
9. **minimal mode** — side-by-side compact pills for two or three activities (§2c).
10. **clipboard** — optional module, off by default.

Roadmap: FEATURES.md (milestones M0–M5 with status). Status marks: INDICATORS.md. Research: APPLE.md (ActivityKit/HIG → BuoyKit). Competitor notes (Notchy audit, Isle, Islet, BEHAVIOUR) are kept locally in `docs/notes/` and not committed.

## 7. BuoyKit (decided 2026-10-30)

Buoy is a framework first, features second — see `APPLE.md` part B for the full contract.

- **Core** owns: activity lifecycle (`surface / update / end / schedule / ask`), priority
  across apps, ttl and stale state, the three presentations (compact, side-by-side
  minimal, expanded with leading/trailing/center/bottom regions), Home, motion, and the
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
nothing animating while idle (a content change is one transition, §2a); a module switched
off costs zero.
