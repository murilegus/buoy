# Buoy — spec v0.1 (test build)

uuid `buoy@murilegus`. Every line is a decision for the test build; any of it can change after
trying it.

## 0. What this is, and is not

**A living pill, not a notch assistant.** A floating iPhone-style pill that reacts to what the
system does. Not a place to talk to an AI, drop files or browse tools. Expanded may host a few
tool tabs (off by default, §2b); nothing in the pill comes from them.

- Pure GNOME Shell extension on extensions.gnome.org; no daemon, no binaries. `install.sh`
  (README) is the one way around EGO, from a GitHub release.
- No polling while closed, no blur, nothing animating while idle.
- Only GNOME Shell's own APIs plus GLib/Gio/Soup.

**Out of scope** (needs a daemon, root or a GTK helper): voice assistant, file shelf, battery
charge limit, running or installing software, AI plan usage, screen-wide lyrics. A third party
may add them over the D-Bus API; Buoy never grows a daemon.

Related: Isle (notch + assistant, Rust daemon), NexNotch, Islet (Quickshell), Notchy (macOS).

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

- Panel: transparent, 40 px; two clusters and the island. The island holds **activities only**;
  system status stays in the system cluster.
- **The Overview opens on the whole wallpaper** (2026-11-04, Ethan). Shell clips the Overview's
  workspace backgrounds to the work area (`shell-workspace-background.c` allocate; `workspace.js`
  `_updateRoundedClipBounds`), so under a see-through bar the strip behind it stayed dark.
  `reach.js` widens both clips over every strut by `strut × (1 − state)`: GNOME's exactly when
  shown, the whole monitor at the desktop. `state` is the controls' adjustment
  (`overviewControls.js`, 0 hidden, 1 windows, 2 app grid), clamped to 1. The text under the bar
  takes the wallpaper's contrast below 0.5, light text from 0.5.
- **Cluster background** (2026-11-04, Ethan): `cluster-background = never | hover | always`,
  default `hover` — icons sit bare on the wallpaper, a rounded background (no blur) wraps the
  cluster on hover. `cluster-radius` 0–16, default 16; `cluster-opacity` 5–100 %, default 17. Filled
  as GNOME fills a panel button: the side's foreground at `cluster-opacity`, +11 points while the
  system menu is open, +15 open and hovered (`_drawing.scss` `panel_button` .17/.28/.32). An
  empty cluster has no background; it stays 4 px off the screen edges.
- **Contrast on light wallpapers** (2026-11-04, Ethan): the text flips, not the background.
  `cluster-contrast = auto | dark-text | light-text` (prefs "Icons and text"); the values name the
  text, not GNOME's light/dark style.
  - Each side on its own: the left box; the right one, tray and system cluster together. Class
    `buoy-dark-text` / `buoy-light-text` on that box.
  - Measured: the file Shell draws (`background.js` `getBackground`, `picture-uri-dark` under
    prefer-dark), placed as Mutter places it (`meta-background.c` `get_texture_area`) with the
    colours around it; mean WCAG luminance of the top 40 px under the side; dark text when it
    reads better than white (they cross near 0.2).
  - Signals only (the background keys, `color-scheme`); decoded once per change (GdkPixbuf, async,
    512 px wide), only under `auto`. Unknown (decoding, missing file, slideshow `.xml`): light
    text. Overview from state 0.5: light text.
  - Foreground only: labels and symbolic icons, white (`$transparent_panel_fg_color`) or
    `#1a1a1a`; full-colour icons, menus and the filled recording/sharing indicators stay GNOME's.
    No text shadow, as GNOME's panel. Rejected: a 1 px shadow in the wallpaper's tone (read as a
    doubled edge).
  - A tray button's highlight is the foreground at .17 / .28 / .32 (`panel_button`; Yaru
    compiles a fixed grey). panel.js marks plain tray buttons `buoy-tray-button` so filled
    indicators keep theirs. It fills the whole 32 px button: GNOME's 3 px transparent border is
    dropped, the fill is the background (St draws an inset shadow only over one).
  - One-colour bitmap tray icons count as glyphs: Electron apps send a white PNG through
    AppIndicator (`appIndicator.js`, a FileIcon `color` cannot reach). An icon ≥ 97 % near-white is
    drawn in the text colour on a dark-text side (`Clutter.ColorizeEffect`); logos keep their look.
    Read once at 32 px, only after the side first turns dark-text.
- **Left cluster** (2026-10-30):
  - Focused app's icon + name (`Shell.WindowTracker` `notify::focus-app`); no icon in the theme:
    `<icon>-symbolic`, then `window-symbolic` / `focus-windows-symbolic`.
  - Hover appends the workspace: grid icon + number or its name ("Firefox · ⊞ 2").
  - No focused window: the workspace alone ("⊞ 2"; screen readers hear "Workspace 2").
    `left-cluster-empty = workspace | hidden`.
  - Click → Overview (replaces Activities). Right-click → app menu. Scroll → switch workspace.
- **Tray** (third-party icons: AppIndicator, input method…): bare, each alone, GNOME's order,
  hover and colours; text and symbolic icons follow the contrast. Every button a 32 px square
  (16 px content), the input-method label centred.
- **System cluster** (2026-11-02): GNOME's quick-settings indicators and the **clock**
  (`dateMenu`, moved from centre) as **one button** with the shared hover background; a click
  anywhere, clock included, opens quick settings.
  - The clock has no click, hover or focus of its own (restored on disable); it stays reactive
    because `Panel.toggleCalendar` (Super+V) does nothing otherwise (`ui/panel.js` `_toggleMenu`),
    and hovering it with a menu open does not slide to the calendar. Its unread dot leaves the
    layout — the buoy light (§2a) says "missed". The pieces drop their own highlight and padding;
    the clock sits 12 px from the last indicator.
  - Clock format is GNOME's keys (`clock-show-weekday/-date/-seconds`, `clock-format`,
    `show-weekdate`), shown on Buoy's Panel page so Settings stays in sync. Buoy's default, time
    alone 24-hour (`14:05`), is written once to keys the user never set (`clock-defaults-applied`),
    never reverted.
  - **Dock** (Ubuntu Dock, 2026-11-04, Ethan): the Panel page carries Auto-hide, Panel Mode, Icon
    Size, Show on, Position, Show Trash, Show Volumes on `dash-to-dock`'s own keys (synced both
    ways). Buoy's default — bottom, auto-hide, not edge to edge, 32 px, primary display, no trash or
    volumes — written once (`dock-defaults-applied`), never reverted. "Show on" names displays as
    Settings does (`DisplayConfig` GetCurrentState). Hidden without the dock.
  - The calendar popover is no longer reachable by mouse; Super+V / Super+M still open it. Its
    contents move: notification history → the notifications tab (§6), calendar and weather → Home
    (§3) and idle plans, DND → the quick toggle. World clocks: later.

### 1a. Windows against the top bar: rounded top corners

*2026-11-02; tiled and top edge 2026-11-04.* Adwaita drops its window radius (15 px) when
maximized or tiled, so against a transparent bar the top edge looks cut off. Buoy rounds the
**top two corners** of windows whose top edge meets the bar; the bottom stays square.

- `window-corners` (b, `true`), `window-corners-radius` (i, 15, 0–32), on the **Windows** prefs
  page; live.
- **Which**: every normal, non-fullscreen window, any toolkit, whose top is on the work area's top
  (`kit/model/rounded.js` `onTopEdge`): maximized vertically (full, tiled, vertical only — Mutter
  pins the top, `window.c` `update_edge_constraints`) or a frame starting on that line
  (tiling-assistant quarters, a window moved against the bar). Both corners round, a tiled pair's
  inner ones too. On a floating window only pixels inside the frame are cut (its shadow stays). A
  vertically maximized window also loses what is above its frame and, in the corner squares,
  beside it: the client still draws a square 1 px border there (2026-11-12, #196).
- **How** (`corners.js`): a `Shell.GLSLEffect` on the `Meta.WindowActor` discarding pixels outside
  the two arcs (as `ui/lightbox.js` RadialShaderEffect). Signals only (`window-created`,
  `workareas-changed`, `notify::maximized-*`, `notify::fullscreen`, `position-changed`,
  `size-changed`). On unmaximize the effect stays until `size-changed` (Shell freezes the actor
  before the state flips). A window restored to exactly the work area keeps its corners until its
  next size change.
- **Cost, accepted**: the window paints through an offscreen and Mutter stops culling behind it
  (`meta-cullable.c` `has_active_effects`). Measured (2026-11-04): one maximized over four floating
  1.23 ms a frame (1.00 off); five maximized 1.01 (1.06 off).
- Rejected: corner caps painting a wallpaper clone (wrong with a window behind, must hide in every
  animation).

## 2. Island states

Three tiers by size (2026-11-05, Ethan): **minimal** < **compact** < **expanded** — Apple's words,
not Apple's mapping (CONTRACT.md §2).
- **minimal** — resting in the bar: one line, 32 px at 1em (grows with the font), one to three pills.
- **compact** — on hover: the hovered pill grows in place into a short panel, 56–120 px, over the
  windows (and the system cluster if it must).
- **expanded** — on click or opened by the stack: the panel with tabs, for what compact has no room
  for (media: player choice, the app's volume, shuffle/repeat).

| State | When | Shape | Interaction |
|---|---|---|---|
| **Idle** | no activity | 132×32 r16 at 1× (the clock at its longest, §4); content per `idle-content` (§2a) | hover → +0.75em wide, +2 high; with the amber light the missed list as a compact, with the red light the waiting ask's card (2026-11-13); press → a pulse; **click → Home** (while Bu's eyes show: on release, and a hold ≥ 0.5 s pokes Bu, MASCOT § Expressions) |
| **Minimal** | one or more activities | pill 1 (highest priority) at screen centre, content-fit; up to two side pills to its right, idle-sized, as many as fit (§2c) | hover 300 ms → its compact; **click → the activity's tab**; Home on the `+N` badge or while the missed list shows |
| **Compact** | pointer rests on a pill; an alert (5 s); an ask until answered | grows in place: top edge kept, width min(28em, 0.72 × expanded) (2026-11-12, Ethan); height 56 + 16n up to 152 (§4, design/compact); an ask's card of choices up to expanded's height | the activity's compact content (media: art 72, its bar, the equaliser flown into the ⏸ slot, design/compact "Music"), or the amber missed list (INDICATORS.md); buttons run their action, a click elsewhere = the pill's click; collapses 200 ms after the pointer leaves; an alert's stays 5 s (longer hovered), an ask's until answered (keys work after Super+B) |
| **Expanded** | a click from idle, minimal or compact; the stack for a transient | `EXPANDED` (§4) | only a click outside (or Esc after a click-open) closes, at once; buttons run their action (2026-11-01) |

Rules:
- Closed = live activities only, no chrome. Expanded opens **Home** from idle, the **activity's tab**
  from its pill. Tabs exist only in expanded.
- An activity that ends is removed at once; `ttl` for short-lived ones (§2e, notifications).
- **What only waits goes after `activity-linger`** (5/10/20/30 min, default 5; 2026-11-07, Ethan): a
  `linger` activity (a paused player, an agent done or waiting) ends after that long with nothing
  new; every update restarts the wait, the pointer on its pill holds it. An unanswered permission
  prompt is denied after the same wait.
- **Which pill is first: [PRIORITY.md](PRIORITY.md)** — state (needs you › running › waiting), the
  kind's priority, fresh before stale, newest. Feedback (§2e) and transient interrupt, then the
  previous returns. Transient (Apple's `style: 'transient'`: greeting, a picker) opens expanded;
  feedback never does.
- **Alert** (2026-11-12, design/alerts-and-asks): the shown activity opens its compact in place for
  5 s (held while hovered), or pulses if it has none; an alert on a covered activity brings it up
  for 5 s, then the top returns (an activity with its own pill alerts there, §2c). An **ask** is a
  card at the compact's size (Bu, the question, the buttons), open on its pill until answered.
- A click-open takes the keyboard (modal, Esc works); automatic opens (alert, ask, transient)
  never do.
- **Fullscreen** (2026-11-03): the island hides with the bar on that monitor (`trackFullscreen`;
  back in the Overview) and closes. Hidden, nothing opens or alerts; what ends counts as missed
  (amber), an unanswered ask lights red; back on screen an ask or transient on top opens as if new.
  Super+B does nothing while hidden.
- **Away and Do Not Disturb** (2026-11-13): what ends while away (session idle after `idle-delay`)
  or in DND counts as missed too (`stack.setAway`); alerts and asks still reach the island, which
  keeps a critical card or an ask for your return. The lock screen disables Buoy (no
  `session-modes`).

### 2a. Idle content

*2026-10-30.* `idle-content`, default `auto`. Each value is an **idle plan** from a module
(`modules/<id>/idle.js`), so the list follows the enabled modules; `auto` and `none` are the kit's.

| value | the pill shows | module | refresh |
|---|---|---|---|
| `auto` | the plan that matters now, rotated by context (§2a-iii) | core | plan signals + one re-rank timer while idle |
| `none` | black pill + the **buoy light** (grey, amber or red; §2a-i) | core | event |
| `clock` | a *second* clock, unlike the cluster's: a daypart icon (`kit/model/daypart.js`, §2d; six colour SVGs at 20 px — the sun on an arc, peach `#FFB889` at dawn and evening, yellow `#FFD23F` by day, then the moon; `scripts/icons.js` palette A) + the time in bold even figures, GNOME's format (`clock-format`, locale, `clock-show-seconds`). `idle-clock-style` (2026-11-08, Ethan): icon + daypart in words ("Afternoon", default) · icon + time · icon · words · time | `clock` | `GnomeDesktop.WallClock` (as the lock screen), only while the idle pill shows |
| `weather` | condition icon + temperature ("31°", the user's unit, rounded as the date menu). Compact: "31° · Partly cloudy" over "Feels like 34° · Wind NE 12 km/h · Humidity 75%", unknown parts left out. Buoy's own colour icons, one per GNOME condition (13, night variants), symbolic as fallback (2026-11-06, Ethan). Place, units, refresh: below | `weather` | the date menu's `WeatherClient` (`misc/weather.js`), only while shown: at once when older than `idle-weather-refresh` (30 min / 1 h), then on that interval |
| `next-event` (`calendar`) | today's next event: icon, title, the time at the end ("3:00 PM", "until 4:00 PM", "all day"; the title ellipsizes), growing up to the minimal cap. Compact: title over "3:00 PM – 4:00 PM · in 25 min". One starting within 30 min beats one running; then all-day (`idle-calendar-all-day`); none left → only the light. No Join (Shell's calendar server sends only id, title, times) | `calendar` | the date menu's event source; the wall clock's minute |
| `mascot` | Bu's eyes, modes idle · sleep · missed · waiting; in idle they stroll in pixel steps, one beat every few seconds (`idle-mascot-stroll`); asleep at night, after 60 s without input, in power-saver, with animations off (MASCOT.md § Eyes) | `mascot` (on, last in Automatic's stack, 2026-11-14, Ethan) | light, daypart, idle monitor, power profile; one beat timer only while strolling |

**Weather place** (2026-11-06, Ethan; GNOME Weather is not installed on Ubuntu, so Shell's client
never locates): the first of `org.gnome.shell.weather` `locations`. "Use my location"
(`idle-weather-automatic`, on): each ask asks Geoclue once as `org.gnome.Shell` (no dialog, bounded
by Location Services), puts the nearest GWeather city first, stops Geoclue.
- A fix of ≥ 20 km, or without accuracy, is IP-only (#188: after login an IP fix says Hanoi at 25 km
  while Wi-Fi says Ho Chi Minh City). The ask waits up to 15 s for better; an IP fix never replaces a
  place from a good fix or the user, only fills no place or an earlier IP guess
  (`kit/model/weather.js` nextFix).
- One ask at a time across feeds. No Wi-Fi fix → asked once more 2 min later, never while the pill
  stopped showing weather (`shouldRetry`; 2026-11-13, Ethan: no Wi-Fi scan right after login or
  resume).
- When the date menu's client locates on its own (GNOME Weather installed, `_useAutoLocation`) and
  its place is > 15 km from Buoy's, Buoy reads its own GWeather.Info for its place
  (`useOwnInfo`), one for all feeds, kept until the place changes or disable, refetched on the
  interval from the weather's own time.
- A failed fetch empties GWeather's reading (`gweather-info.c` gweather_info_update →
  gweather_info_reset), so Buoy keeps the last good one, shown during a fetch and after a failure
  while same place and units and ≤ 2 × `idle-weather-refresh` old (`keptReading`; 2026-11-13, Ethan).
- **Refresh** (2026-11-12, Ethan): the place row reads "Current location" with ⟳; prefs writes
  `idle-weather-locate-now`, the Shell locates and fetches once (switch off: only fetches). The row
  says how it went — "by Wi-Fi · 2 min ago", "guessed from the network, about 25 km", "no Wi-Fi fix,
  kept this place" (warning icon), "weather just now", a spinner (`idle-weather-located`,
  `-located-at`, `-updated-at`; `kit/model/settings.js` placeStatus). Switch off: a city searched
  on the Island page (GWeather cities, accents ignored). Location Services off → "Location Services
  is off" with Open Settings.
- **Units** (2026-11-06, Ethan): GNOME Weather's keys `org.gnome.GWeather4` `temperature-unit` /
  `speed-unit`; the first enable sets °C and km/h where never chosen (`weather-defaults-applied`);
  prefs shares them, Automatic (the locale) last. No place or data → only the light, the row says why.

Rules: an idle plan is presentation only (an adapter's data shape), never surfaces an activity, and
is replaced the instant an activity surfaces. Nothing animates while idle: a change (the minute,
`auto` switching) is one transition (§5), then stillness. Each plan's settings sit under it on the
**Island** page (ARCHITECTURE rule 9). With a plan the grey light is not drawn; amber and red are.

Pill structure in every state: `[light] leading · text · trailing [dot]`. The ends are Buoy's status
lights; the zones belong to the plan (idle) or the adapter (minimal). **Lights at pill 1's ends**
(2026-11-10, Ethan; design/pill "Lights at both ends"): an 8 px dot centred in the end's cap (16 from the
edge at 1×); the pill grows at **both** ends by 20 (idle 132 → 172), so the content never moves.
No light, no growth. The cap counts the lights; the text ellipsizes. A light coming or going is one
small morph. Side pills, compact, card and expanded have no light. The grey light only in `none`.

### 2a-i. The buoy light (pill 1's left end, idle and minimal)

Static, never blinking. Off (faint grey, `none` only) · **amber** = something ended while hidden,
away or in DND (hover names it, opening Home clears it), or GNOME notifications nobody has seen
(cleared once the Notifications tab or GNOME's list shows them; NOTIFICATIONS.md §2) · **red** = an
`ask` waiting that could not show. Red › amber. Drawn by `kit/ui/pill.js`, never among the zones.
Not on side pills, compact, card or expanded (Home lists what was missed).

**Bu's lamp is not the light** (2026-11-08, Ethan): a pill Bu leads draws the end's dot like any
other; the lamp keeps its pose's colour (INDICATORS § Bu's lamp).

### 2a-ii. Privacy dot (pill 1's right end, idle and minimal)

One dot at the centre of pill 1's right end, idle or not: **purple** microphone, **green** camera,
**red** screen shared or recorded; one at a time, red › green › purple (design/colours "Privacy dot", 2026-11-11). Ends grow as for the light (§2a). The pill draws it; the `privacy` module tells the
stack (`stack.setPrivacy`). A muted microphone has no dot (`ui/status/volume.js`
`_updatePrivacyIndicator`). Click → Home.
- A recording or share is also an activity with its clock and Stop (design/compact "Screen sharing and recording", 2026-11-14).
- GNOME's own indicators for these are hidden while the module is on: `privacy-dot = pill | system
  | both`, default `pill`.
- Camera and microphone both on for 10 s make a call (2026-11-27, design/compact "In a call"): "In a
  call" with its clock, Mute and the app recording; Do Not Disturb while it lasts
  (`privacy-call-dnd`), given back only if Buoy set it and nothing changed it. Home's first glance,
  "in use", names the apps recording (the mixer knows them; nothing names the camera's).

### 2a-iii. `auto`: a smart stack of idle plans

*2026-11-03.* Like iOS's Smart Stack: the pill shows what is useful next.

- **Relevance.** Every `idle.js` exports `relevance(ctx, opts)` → `{score: 0–100}` or `null` (nothing
  to show); cheap, synchronous, reading the plan's held state. `ctx` = `{now, clock, starts, data}`.

  | plan | score |
  |---|---|
  | `next-event` | starts in ≤ 30 min **90** (holds) · running 80 · within 2 h 50 · later today 25 · none `null` |
  | `weather` | first hour of morning 70 · a change in the next hour (rain, ≥ 5 °C swing) 75 · else 35 · no place `null` |
  | news (M5) | 40; 55 for an item < 1 h old from a followed source |
  | exchange rate / stocks (M5) | 30; 70 past the user's threshold |
  | `clock` | 10, always available |
  | `mascot` | 10, only when in `idle-auto-plans` |

- **Choice** (2026-11-08, Ethan: "an idle pill just rotates"): every plan with something to show
  takes its turn in `idle-auto-plans` order, one per `idle-auto-switch`; the first shown is the
  highest scored; `null` is skipped. A score ≥ 80 **holds** the pill and shows at once.
- **Re-rank** on a plan's `changed` and one kit timer, `idle-auto-switch` 5 (default)/10/20/30 min,
  alive only while idle with `auto`. Between turns a re-rank keeps the shown plan while it has
  something.
- **Interests**: `idle-auto-plans` (as), default `['calendar', 'weather', 'clock', 'mascot']`. Prefs
  **Island**: a reorderable list with switches, each plan's keys under it; a plan whose module is
  off is greyed ("Turn on in Modules") and does not exist (rule 6) — Show set to it leaves the pill
  empty, its row says so. A module that is only a plan (clock, weather) has no Modules switch
  (2026-11-08, Ethan): its feed runs only while its plan is used. "Switch every" shows only under
  Automatic.
- **Interaction**: hover → the shown plan's compact; scroll on the idle pill → next/previous plan
  (held one interval; one step per gesture, 400 ms apart; with `auto` off it goes to the panel's
  workspace scroll); click → Home.
- **Motion**: a switch is one content transition (out 100 ms / in 200 ms, plus the width morph).
- **Built** (2026-11-08): `kit/model/smartstack.js` (`choose`, `scrollTo`, `stackOrder`,
  `intervalMs`), `kit/services/idle.js`. Under `auto` every stacked plan has its feed.
- **Later plans** (news, exchange rate, stocks): each a module, off by default, fetching through
  Soup at most every 30 min, only while in `idle-auto-plans`.

### 2b. Tabs

*2026-10-30.*

- The strip exists only in expanded, only after a click-open; the stack's opens show the activity's
  expanded view without it. Tabs = modules with `tab.js`; Home first.
- **The strip** (2026-11-13, Ethan): `[Home] [fixed] [pinned] [live] [slot] [⋯]`.
  - **Fixed**: every enabled module with kinds, running or not, in module order (§6); before its
    `tab.js` the tab shows its activities' expanded views. Feedback-only modules (osd, copied; §2e)
    have none.
  - **Pinned**: standalone tabs in `tabs-pinned` (Calendar and Devices by default).
  - **Live**: a `tabWhileLive` module's tab only while one of its activities is there (Claude Code,
    Transfers); unclaimed kinds (D-Bus callers) get one while an activity has an expanded view.
  - **In ⋯**: a `tabInMore` module keeps its tab in ⋯ (Timer); with `tabWhileLive` too it is live
    while active (Phone in a call, 2026-11-18, Ethan).
- **Look** (2026-11-02, after Notchy): one rounded group; the active tab icon + title on a lighter
  pill, the others icon only (title as accessible name). Icon: the module's `icon`, an unclaimed
  kind's activity icon, else generic.
- **Which tab opens**: idle or `+N` → Home; a pill or its compact → its kind's tab; kinds without a
  tab (osd, copied) → the activity's `onPress` (e.g. raise the player), else Home. `pressFirst` runs
  `onPress` first; the tab opens only when it does nothing (an agent's terminal, 2026-11-07). The
  last tab is not remembered. A tab whose last activity ends goes back to Home.
- **Standalone tabs** (2026-10-30, after Notchy's ⋯): `tab.js` with `kinds: []` — no source,
  activity or idle plan; tool pages (Clipboard, Launcher, Files, Notes) away from the pill.
  - The **slot** is the last cell, drawn like any tab: the standalone tab last chosen from ⋯
    (`tabs-slot`), else the first enabled one. ⋯ opens a menu floating over the tab (own background
    and border, no blur), right edge on ⋯'s, listing the other standalone tabs then the `tabInMore`
    ones, marking the slot's. A press beside it only closes it. A pinned tab is never in the slot or
    ⋯ (2026-11-13).
  - Reached only via slot, ⋯ or keybind — never by an event. Built on first selection, destroyed
    when expanded closes: closed costs nothing. May use Shell APIs; no polling while closed.
  - A fresh install: Home, the kind tabs, Calendar, Devices, the slot with Clipboard, ⋯. Not
    planned: Calculator, Emoji (GNOME search has them).

### 2c. Several pills

*2026-10-30; shapes and hover 2026-11-05.*

- **Pill 1**: highest priority, screen centre, content-fit as when alone (120 … 0.6 × expanded,
  `wide` 0.8; §4); never narrowed for others.
- **Side pills 2 and 3**: the idle size (132 × 32 at 1×): leading, a short trailing (equaliser,
  `40%`, `4:59`) and `+N`; no text, so the short value goes in `trailing` (CONTRACT.md §3). Leading at
  the left edge, trailing at the right, `+N` at the right edge before it (2026-11-12, Ethan,
  design/pill "Side pills"). Their full content is their compact.
- **How many**: as many as fit before the system cluster (12 px margin), at most two, re-measured
  when it resizes; side pills go before pill 1 narrows. Pill 1 widest, 300 px cluster: 1366 → one,
  1920+ → two.
- `+N` on the last pill shown opens Home with the full list (the rest of that pill: its tab).
- **Hover → compact** (2026-11-05): after 300 ms the pill grows **in place** (§2, §4): top edge kept,
  centred on the pill, shifted only to stay 4 px inside the screen (may cover the system cluster).
  Raised over its neighbours, which fade where they stand: nothing slides. Pill 1 widest: a compact
  on pill 3 needs no shift from 1920 to 3440; on 1366 pill 2's covers ~60 px of the cluster.
- **Leaving**: the compact stays while the pointer is on pill or compact, collapses 200 ms after,
  neighbours fade back. Onto another pill: switch at once, as `ui/popupMenu.js` `PopupMenuManager`
  `_changeMenu`. A pill appearing under a resting pointer opens its compact; an alert or ask closes
  another pill's.
- A click on a pill or its compact opens expanded at its tab: pills **merge** (the primary grows,
  the others slide in and fade, 300 ms); close splits them. When one ends the rest slide to fill.
- **Keyboard** (2026-11-03): `Super+B` (`keybind-focus`) takes the keyboard (modal) and rings the
  centre pill: its 1 px border turns `-st-accent-color` (an activity's keyline steps aside). Inner
  buttons, tabs and rows keep GNOME's 2 px accent ring at 80 % (`_drawing.scss` `focus_ring`).
  ←/→ move the ring (no wrap; follows its activity); Enter/Space opens it as a click; Esc, `Super+B`
  or a click outside lets go. Open: ←/→ walk the strip, Esc or `Super+B` closes. Works in NORMAL,
  OVERVIEW and POPUP modes. An open the stack made takes no keyboard; `Super+B` takes it for that
  pill, which then stays like a click-open. An ask's buttons answer to a printed key: the label's
  first letter (diacritics folded, Đồng ý → D); shared or non-letter starts take their position 1–9
  (Deny · Allow · Always → D · 2 · 3). Ignored while another popup holds the keyboard.

### 2d. Greeting

*2026-11-03; moments 2026-11-06.* Hello when the machine starts or wakes from a long sleep
(expanded: Bu, the greeting, time, date, weather), welcome back on a new login, see you soon when
the session ends (minimal, or compact with a note) — every time, not once a day. **[GREETING.md](GREETING.md)
is the reference**: moments, lines and their priority, sizes, poses, special days, weather, settings.

- **Dayparts** (`kit/model/daypart.js`, shared with the clock plan and `auto`): `dawn · morning ·
  noon · afternoon · evening · night` from `daypart-starts` (ai, default `[5, 7, 11, 13, 18, 22]`,
  wrapping). Any rotation of six distinct hours in cyclic order; anything else falls back to the
  defaults. A part changes on the hour; a consumer arms one timer at `nextBoundary()`. Island page →
  Parts of the day: each part's icon and a drop-down of the hours it may start at, GNOME's 12/24 h,
  Reset (2026-11-13). Greetings: dawn, morning "Good morning" · noon "Good day" · afternoon "Good
  afternoon" · evening "Good evening" · night "Still up".

### 2e. Feedback: minimal only

*2026-11-05, Ethan.* A confirmation of something you just did: `osd` from `hud`, the input source
from `input`, `copied` from `copied`.

- **Minimal only**: no compact, expanded or tab; never an alert, never missed. Click → its
  `onPress` (Sound settings), else Home.
- **Pill 1 for its ttl**, above every kind but `ask` (under one it is pill 2); the covered pill comes
  back in place, side pills and `+N` keep theirs (`stack.js` `pillWindow`). The newest covers an
  older one.
- **ttl** ~1.5 s (copied too, 2026-11-06). A repeat updates the same activity and restarts it
  (holding the volume key keeps one pill). The pointer on any pill pauses it; leaving gives a fresh
  one (`stack.hold`). While Home is open it is a row in Now.
- **Size by type**, content-fit with hints, never px (rule 11): levels icon + bar (`wide`); Caps Lock
  and input icon + a short word; copied icon + snippet or thumbnail, ellipsized at pill 1's widest.

**input** (2026-11-05; covers IBus): the source switched to, named as Shell's indicator does — the
IBus engine's `InputMode` symbol when 1–2 characters (Bamboo's V / E), else the short name — then its
name: "EN · English (US)". Also flashes when an engine changes its own mode; nothing at enable, IBus
startup or when nothing shown changes. Click → Keyboard settings. Super+Space's switcher is replaced
(`input-replace-switcher`, on): a press switches at once to the previous source; each further Space
with Super held moves one along the recent list. Off: GNOME's list.

**hud = every GNOME OSD** ("Volume & keys"; hardware events are `device` / `power`): all go through
`Main.osdWindowManager` `show` / `showAll`, overridden while `hud-replace-osd` is on.
- Levels — icon + bar + percentage (`72%`, `130%` amplified): volume (gsd names an external output:
  "Headphones"), microphone, brightness, keyboard backlight (keys and firmware Fn via UPower
  `BrightnessChangedWithSource`), the battery key. Muted: muted icon, bar and number dimmed.
- Toggles — icon + a short word: touchpad, airplane (and hardware), Bluetooth, rotation lock, privacy
  screen, eject, "Nothing playing" (gsd's ⊘ for a media key without a player,
  `do_multimedia_player_action`). gsd's labels as they come; Buoy words the rest.
- Caps Lock, Num Lock (from the keymap) and Fn Lock (below): Buoy's own; they stay with the switch
  off.
- Quick Settings' volume and microphone sliders show their level as they move (GNOME shows none).
- Click on a level opens its Settings panel.

**Fn Lock** (2026-11-05) lives in firmware; Buoy shows it when the driver exposes an LED
`<device>::fnlock` with `brightness_hw_changed` (one POLLPRI watch, no polling).

| Machine (driver) | Fn Lock | Why |
|---|---|---|
| **Lenovo IdeaPad** with the Fn-keys WMI event (`ideapad-laptop` + `ideapad_wmi`, WMI `8FC0DE0C-B4E4-43FD-B0F3-8871711C1294`) | **yes** — tested on IdeaPad Slim 3 15IRH10 (83K1), kernel 7.0 | `platform::fnlock` with `LED_BRIGHT_HW_CHANGED`, notified from that event (`ideapad_fn_lock_led_notify`) |
| IdeaPad without that event | no | nothing reports a key press |
| any driver adopting `*::fnlock` | yes, untested | same interface |
| Huawei (`huawei-wmi`), LG (`lg-laptop`), Uniwill (`uniwill-laptop`) | no | only a `fn_lock` file: reading it means polling (rule 8) |
| ASUS (`asus-wmi`), ThinkPad, Dell, HP, external keyboards | no | handled in firmware or the keyboard |

**Copied and Clipboard** (two modules, 2026-11-07, Ethan): "Copied" under Quick Feedback
(`modules-copied`, Show what was copied), "Clipboard" under Tabs (`modules-clipboard`). `copied`
listens to `Meta.Selection` `owner-changed` (`meta-selection.c`); the Clipboard history (M5) watches on
its own with `clipboard-history`; off, nothing is stored.
- Silent for a clipboard Shell set itself (`Meta.SelectionSourceMemory`, `st-clipboard.c`: a
  screenshot, a row put back, a clipboard manager restoring), for a remote one
  (`Meta.SelectionSourceRemote`: mutter-devkit, gnome-remote-desktop), for PRIMARY, and for emptied
  text.
- What it shows (2026-11-06), first match: a password manager's secret (`x-kde-passwordManagerHint`)
  → "Copied · hidden", never read; files (`x-special/gnome-copied-files`, `text/uri-list`) → the name
  or "3 items"; an image → its thumbnail (`Gio.BytesIcon`, nothing written) and "Copied image"; text
  → the snippet on one line (≤ 500 characters read).
- The app is the focused one, so `apps-hidden` and profiles apply; no `.desktop` → `system`.
  `copied-show-preview` off: "Copied" alone, nothing read. Click → Home.

**Screenshot** (settled 2026-11-08, NOTIFICATIONS.md §7): not feedback but Shell's own "Screenshot
captured" notification (`ui/screenshot.js` `_storeScreenshot`), shown as any notification — thumbnail,
"Show in Files", a click opens it; gone when its pill ends. One pill per shot (the clipboard side
stays quiet). "Screencast recorded" the same; the recording itself is an activity (§2a-ii).

## 3. Expanded: Home

A **main card** over **one row of tiles** (design/home, 2026-11-11/12, Ethan), laid out again on each
open and each stack change: never empty, never scrolls (`kit/model/home.js` planHome,
`kit/ui/home.js`).

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
  ⚙ (round 32, right of the strip) closes the island and opens prefs. No system indicators here (§1).
```

- **Head** 56 (strip and ⚙ 32, 12 from the top); main card; 8; tiles 100; 12 at the bottom and
  sides. The main card takes the rest: 104 / 168 / 200 at 1920 / 2560 / 3440; with no tile, all.
- **Main card**: the stack's first activity with its buttons; with none, the **greeting** (Bu waving,
  "Good afternoon, Ethan", the date). A player has its own card (`modules/media/home.js`: cover as
  tall as the card less 16, ≤ 184; ⏯ top right, the equaliser, the bar at the foot; from 160 the title
  larger). An ask: its card, buttons bottom right. Others: their compact (or leading, text, value). A
  click opens its tab.
- **Tiles** (fill-1, radius 16): N = floor((row + 8) / 128) — 4 at 1920, 5 at 2560 and 3440. **Missed**
  first, then the activities (leading, a value in 1.5em, a caption: "2 / 3 · Claude Code"); more than
  N → N − 1 and **+K**. Room left: the **glances** in order — in use (§2a-ii), weather, Up next,
  battery, phone, timer — dropped when they don't fit (never into +K). Still room: weather, then Up
  next, take two units; then tiles widen. ≥ 200 wide shows a detail column. A tile opens its tab; one
  without goes up to the main card.
- **Missed** (amber tint 16 %): the stack's missed history and the sources' own unseen
  (`stack.flagMissed`). Its list replaces card and row: ‹ (or Esc), "Missed · N", × clears; "Notifications
  · 3" opens that tab; tasks newest first, each opening its tab. Showing Home clears the amber light;
  the tile stays until every row is opened or cleared.
- **+K** opens "Ongoing": every activity in stack order, rows of 32, scrolling past 5.

Glances and module cards live for the open only (rule 8). Every tab opens at the full expanded cap
(2026-11-08, Ethan): taller scrolls inside; an empty one centres its text under Bu (kit
`EmptyState`). Buoy posts no notifications of its own.

- **Calendar** — `ui/calendar.js` (dateMenu's EDS source). Online Accounts calendars come in by
  themselves (GOA → EDS, `calendar-sources.c`); unticked in GNOME Calendar stays out. Buoy never talks
  to those services; prefs offers "Online Accounts" (2026-11-06, Ethan).
- **Weather glance** — Buoy's icon, temperature, condition; wide: icon 48, the place, the compact's
  details. No high/low (GWeather has no day range). Click → GNOME Weather if installed. Out without a
  place or reading; a stale one is fetched once on open.
- **Up next** — today's next event, its time ("3:00 PM", "Now", "All day") over its title; wide, the
  next two, each a bar (accent while running; no calendar colour from Shell's server) with "3:00 PM ·
  in 25 min". Click → the Calendar tab. Out when nothing is left today.
- **Calendar tab** (2026-11-08, Ethan): the month on one side (circles 26–40 px with the room, digits
  12–16; month name in the accent, year grey, weekends dim, today filled, an accent dot on event
  days), the picked day's events on the other (today: the week ahead) as cards in the calendar's
  colour (EDS `Color`). A row opens the event's page in that column (2026-11-20, design/tabs "Event details"). Read only. No calendars → Bu with "Add an Online Account".
- **Battery glance** (2026-11-12, Ethan) — Quick Settings' own UPower DisplayDevice proxy
  (`ui/status/system.js` PowerToggle): percentage, "Battery" or "Charging"; none on a desktop. The
  power mode's icon top right; a click lists the three modes in place, Settings → Power last
  (2026-11-14); without modes it opens Settings → Power.
- **Timer, phone** — design/home; their M4 items.

## 4. Sizes

*Derived, not fixed (2026-10-30).* Numbers are decided in [Design](design/index.md) (tokens). All in
logical px. `kit/model/shapes.js` `shapesFor()` derives everything from the monitor's logical width
`W`, the bar height and the **em** (font size × resolution / 72, as St: 14.67 px at 11 pt; Large Text
scales it), recomputed on `monitors-changed`, a theme or font change, the bar's height, a new scale,
or `expanded-width`. Design px are at 1em, scaled by em / 14.67, rounded. A function, not
breakpoints. Every width an even whole px (centred on whole pixels); radius ⌊h/2⌋. Expanded (iOS):
width per screen, height fits content on 56 + 16n up to width/2.

| Thing | Rule | 1920 | 2560 | 3440 |
|---|---|---|---|---|
| bar | 2.75em (`#panel.buoy`) | 40 | 40 | 40 |
| pill `h` | bar − 2 × 0.25em; content box h − 2 × 0.25em = the leading's cell | 32 (cell 24) | 32 | 32 |
| idle | 8 + cell + 6 + the idle clock's widest text + 8, measured at run time (widest digit, `88∶88∶88`, wider of AM/PM; design/pill "Idle") | 132×32 (Ubuntu Sans 126, DejaVu 146) | | |
| hover / press | +0.75em / +1.25em wide, +2 / +4 high | 144×34 / 150×36 | | |
| minimal, pill 1 | content + 2 × 8, in [idle, min(24em, 0.6 × expanded)] (`wide` 0.8); a light + 2 × 20, at least idle + 40, cap unchanged | ≤ 336 | ≤ 352 | ≤ 352 |
| light | 8 px dot at the cap's centre; each end + 20 | idle 172 lit | | |
| pills 2–3 | the idle size | 132×32 | 132×32 | 132×32 |
| compact | min(28em, 0.72 × expanded) wide; 56 + 16n up to 152: head 56 (leading 40, 14 at the sides, buttons 32), media 88 (art 72), ≤ 3 rows 120, a **card** (NOTIFICATIONS.md §3) 136 / 152 with one / two message lines, 104 without buttons; a card of choices rows of 32 up to expanded's height (280 at 1920); r 28 (`compactMetrics`) | 404 × 56…152 | 410 | 410 |
| expanded | `clamp(0.28 × W, 560, 760)` or `expanded-width` (≤ W − 40); height 56 + 16n ≤ width/2; r 28; head 56; no tab (greeting) 88 | 560 × ≤280 | 716 × ≤344 | 760 × ≤376 |
| Home | head 56, main card, 8, tiles 100, 12; N = floor((w − 24 + 8) / 128), each ≥ 120, r 16 (§3) | card 104, N 4 | 168, N 5 | 200, N 5 |
| container | the monitor's width, expanded's cap + 40 tall; never reactive at rest (`clutter_actor_should_pick`) | 1920 | 2560 | 3440 |

Leading per tier: minimal a 24 cell at 1em (30 with Large Text), a cover or colour icon fills it, a
symbolic icon 16, Bu 20; compact 40; expanded 56; Bu 20 / 40 / 50 (its 10-cell grid). Minimal gaps 6,
8 before a button; text 1em, weight 600, even figures. Actions: 1 in minimal, 3 in compact and
expanded. Adapters never see these numbers (rule 11): content and at most a hint (`size: 'wide'`).

## 5. Motion

*2026-11-13 (M4 "Motion"); curves, times and each move in [Design](design/index.md) (Motion), numbers in
its tokens.*

- **Springs** for every move, size and shape (`kit/model/motion.js`, run by `kit/ui/spring.js`: one
  Clutter.Timeline per actor, stopped when settled). Each a perceived duration and bounce: `snap`
  (hover, press, tab marker), `size`, `move` (into the compact, slides, merge), `open` (expanded,
  alert, ask), `close` (every shrink, never overshooting). Only growing bounces.
- **Cut short**, a move goes on from where it is with its speed.
- **Radius** on the way: the larger of old and new, ≤ half the height; at the end the shape's own.
- **Shared parts fly** (2026-11-13): the leading and title an activity has in both forms (pill ↔
  compact or card, Home's card ↔ Media tab, tile ↔ its tab) fly on the background's spring as clones
  at their end size, moved and scaled, never re-laid; the old part hidden meanwhile; found by their
  mark (`kit/ui/present/flight.js` markShared). The rest, on expand, into the compact and any growth over
  25 %: at its final place, clipped to the background every frame, opacity following (full from
  halfway); collapse clips the same. A slide moves content with its background.
- **Fades** 100 ms out, 200 ms in; hover, press, checked colours 120 ms (`transition-duration`).
- **Press**: 4 px smaller each way on `snap`, held 90 ms, back.
- **Tab switch**: the marker springs to the new tab on `snap`, the tabs between follow, the title
  fades in; the old body fades out moving 12 px back, the new comes from 12 px on its side. Home's
  in-place lists (Missed, +K) come from 24 px right on `move`; back, from the left.
- **Animations off** (`enable-animations`): every move at its end at once; `slow-down-factor`
  stretches springs as Shell's `ease()` (`misc/animationUtils.js` `adjustAnimationTime`).

## 6. Modules for v0.1

1. **media** — MPRIS, one pill per player from the moment it plays (2026-11-05, Ethan).
   - Minimal: art + title · artist + the equaliser while playing, in the cover's main colour (six
     bars of 2 × 14 growing from the middle, white without colour; design/pill "Equaliser",
     2026-11-13) — moving while on screen, even with animations off; paused, a near-flat line (4 · 6
     · 4 · 2 px), no button, `linger` (§2).
   - Compact: art 40, title / artist · app (a long title scrolls right to left: 2 s pause, 30 px/s,
     two copies 40 px apart; still and ellipsized with animations off), ⏮ ⏯ ⏭, position with elapsed
     and remaining (display only). None when `media-compact-on-hover` ("Controls on hover") is off.
   - Tab (design/media, 2026-11-13): one card like Home's — art, title / "artist · player" / album, ↗
     Open app, a seek slider with times, shuffle · ⏮ ⏯ ⏭ · repeat (unsupported ones disabled) — under
     the players' chips (logo, name, the equaliser while playing). No volume (Sound tab, §6b).
   - Open app raises the window (app from the player's bus pid), then MPRIS `Raise()`: Firefox
     switches to the playing tab; Chrome cannot (`CanRaise` false, no `DesktopEntry`), so its window
     comes up on whatever tab it shows. One player per browser (its latest playing tab).
   - Art corners sit inside the pill's: radius less the inset (compact 24 − 14 = 10; minimal 2,
     raised to 6); square in expanded (2026-11-05, Ethan). Spotify ads: "Ad" and the countdown, no
     skip. A player that stops or leaves the bus ends its activity.
2. **hud** — every GNOME OSD as feedback (§2e).
3. **home** — §3.
4. **appname** — left cluster (§1).
5. **greeting: first run and What's new** (2026-11-08, Ethan) — Bu's hello on the first run with the
   basics, and after each update what is new (GREETING.md §11).
6. **idle `auto`** — the smart stack (§2a-iii).
7. **notifications** (NOTIFICATIONS.md is the reference) — GNOME's banner becomes a pill where GNOME
   would show one (`notification-replace-banners`, on), a compact with its own actions and ×; DND is
   GNOME's switch. The **notifications tab** lists the history from `Main.messageTray` (`getSources()`
   + `source-added`, `notification-added`) — no store of Buoy's; dismissing in either place removes
   it from both.

## 6b. Roadmap after v0.1 (all pure JS)

1. **dbus** — `org.gnome.Shell.Extensions.Buoy`: `Show/Update/End`, `Ask(question, options) →
   answer`; hooks call it with `gdbus call` (DBUS.md).
2. **agents** — Claude Code / Codex approvals in the pill (Deny · Allow · Always), done-alerts; hooks
   from prefs. One `agent` activity per session led by **Bu**, the pose following the hook events
   (MASCOT.md § Agents), the agent's name first (CODING-AGENTS.md).
Each item below is decided in full on its design page; here, what it is and where it reads from.

3. **timer** (2026-11-22, Ethan; design/compact "Timer") — ring and countdown, Pomodoro, the Timer
   tab; saved timers are GNOME Clocks' (`org.gnome.clocks timers`), both ways, and Clocks' "Time is
   up!" becomes Buoy's card. `timer-keep-awake`. Stopwatch: later.
4. **power** (2026-11-14, Ethan; design/compact "Battery and power mode") — plug, unplug, full, low
   battery (replacing gsd's notification) and power mode, from Quick Settings' own UPower proxy.
   **bluetooth** (2026-11-17, Ethan; design/device "Wireless") — connect/disconnect flashes with the
   device's battery, from Quick Settings' client.
5. **calendar** (2026-11-20, Ethan; design/compact "Meeting soon") — a meeting 5 min ahead with Join; the
   link read over EDS's D-Bus (`Calendar.GetObject`) only for an event about to start, no `gi://ECal`;
   evolution-alarm-notify's reminder within 15 min is taken off (`calendar-meeting-alert`);
   `calendar-refresh` asks EDS to refresh online calendars (`Calendar.Refresh`; EDS's own 60 min).
6. **usb** (2026-11-17, Ethan; design/device) — a mounted drive with Open and Eject, replacing GNOME's
   notification; a webcam flashes.
6b. **attention** (2026-11-19, Ethan; design/compact "Windows that need attention") — a window demanding
   attention (as `ui/windowAttentionHandler.js`) stays on the pill till focused or quiet; GNOME's
   "“…” is ready" is not shown meanwhile.
6e. **print** (2026-11-23, Ethan; design/compact "Print jobs") — CUPS's own signals
   (`org.cups.cupsd.Notifier`, for gsd's subscription; none of Buoy's); gsd's matching "Printers"
   notifications hidden.
6d. **network** (2026-11-23, Ethan; design/compact "Network") — Shell's NM.Client: connect, offline, VPN,
   no Internet, captive portal. No rows or switches.
6c. **terminal** (2026-11-21, Ethan; design/compact "Terminal command finished") — Ptyxis's "Command
   completed" as a pill; exit code, time and directory from `hooks/shell.sh` (a line in ~/.zshrc or
   ~/.bashrc, from prefs; files in `$XDG_RUNTIME_DIR` read only when the notification comes).
7. **privacy / recording** — the dots, recording and sharing, "In a call" (§2a-ii).
8. **several pills** — §2c.
9. **clipboard** — the copied feedback (§2e) and, with `clipboard-history`, the Clipboard tab (M5):
   text, links, colours, images (`St.Clipboard.get_content`); search, pin, delete, clear, 1–9 to
   paste; a row sets the clipboard, closes the island and pastes (Ctrl+V by Clutter's virtual
   keyboard, Ctrl+Shift+V in terminals); skips `x-kde-passwordManagerHint`, a pause switch, excluded
   apps, size and count caps; in memory, saved under `~/.cache/buoy/` only if chosen.
10. **Sound tab** (2026-11-05, Ethan) — a standalone tab: each app playing with its own volume, and the
    output device, from `ui/status/volume.js` `getMixerControl`.
11. **greeting** (FEATURES M4; first run and What's new are item 5) — §2d, GREETING.md.

## 6c. Transfers tab

*2026-11-03.* What it shows is bounded by its sources. `com.canonical.Unity.LauncherEntry` comes from
**Files on Ubuntu only** (Ubuntu's `12_unity_launcher_support.patch`) and from **Chrome only on Unity
or KDE** (it dlopens libunity by `XDG_CURRENT_DESKTOP`; checked 2026-11-06). **Firefox sends none.**
So on GNOME browsers come in through the file watch (`downloads`).

**Ring only when the source gives a fraction** — Buoy never invents one:

| Known | Leading | Text | e.g. |
|---|---|---|---|
| a fraction (LauncherEntry) | determinate ring | % | `◔ Chrome · 2 downloads  72 %` |
| only a growing file (`.part`, `.crdownload`) | static download icon | name · size · speed | `⤓ report.pdf · 12 MB · 2.1 MB/s` |
| finished (renamed) | file type icon | name · folder | `report.pdf → Downloads` |

No spinner or endless ring (it would animate the whole time and suggest progress). Speed from the
size between two `Gio.FileMonitor` `changed` events (about one a second): no timer of Buoy's. When an
app's LauncherEntry covers exactly **one** growing file, the file row gets the ring; with more, the
app row keeps the %.

- **`progress` (M3).** libunity sends only while `com.canonical.Unity` is owned: Buoy asks for the
  name too, yielding to Ubuntu Dock (2026-11-05). LauncherEntry says only which app is busy (0–1, maybe
  a count, urgent): one pill and row per app, summed (two Files copies are one "Files 55 %").
  - **Running**: icon, name, the count when sent ("2 downloads"), %, a thin bar.
  - **Done**: "Name · Done" for 3 s (every flash 3 s, 2026-11-16), then a row kept 10 min, at most 5.
    Done = hidden at ≥ 99 %; earlier (cancelled) or leaving the bus ends without Done.
  - A click focuses the app's window (`Shell.AppSystem.lookup_app(id).activate()`). The compact's bar
    ≥ 160 px.
  - Files closed mid-operation (2026-11-06, Ethan) stops sending and posts "N file operations active"
    (GNotification `progress`), then `transfer-complete`: the pill becomes "Files · in background" (no
    ring, no %), then "Files · Done"; reopened, "Files · working" while its window is open. "In
    background" dims after 10 min.
- **`downloads` (M3).** Each `.part` / `.crdownload` in a watched folder is a **Running** row and pill
  once written to (name, size, speed); one never written to while watched never shows; 30 s without
  bytes dims it. Chrome's `Unconfirmed 123456.crdownload` (words + space + ≤ 6 digits, no extension;
  translated) shows the browser's name until renamed. The browser is the running app writing such
  files (Chromium family `.crdownload`, Firefox family `.part`). Renamed: "name → folder" for 4 s,
  then a **Downloaded** row (kept an hour, at most 5; deleted files leave): type icon, name, folder ·
  app · time; click opens; icon-only "Open" (`document-open-symbolic`) and "Show in Files"
  (`folder-open-symbolic`, `org.freedesktop.FileManager1.ShowItems`); hovered or focused, a button's
  name replaces the detail line (St has no tooltips). Deleted or moved before the end: no row.
  - Acting on a row closes the island and a Done/Downloaded row leaves its list (2026-11-06, Ethan);
    each list has an icon-only **×** that empties it, never the files. Every tab action that brings a
    window up closes the island (kit `new Tab({close})`).
  - Watched: the Downloads folder (`GLib.get_user_special_dir(DIRECTORY_DOWNLOAD)`), always; up to 10
    more in `progress-folders` ("More download folders", portal folder chooser), each a non-recursive
    `Gio.FileMonitor` with WATCH_MOVES (one inotify watch each, hence the cap). Rejected: Recent files
    (browsers never write there).
- **Not planned:** "source → destination" for a Files copy (Nautilus reports no names over D-Bus).

Roadmap: FEATURES.md. Status marks: INDICATORS.md. Contract: CONTRACT.md. Mascot: MASCOT.md.
Competitor notes stay local in `docs/notes/` (not committed).

## 7. BuoyKit

*2026-10-30.* A framework first, features second (CONTRACT.md).

- **Core**: activity lifecycle (`surface / update / end / schedule / ask`), priority, ttl and stale,
  the three tiers, Home, motion, the D-Bus API.
- **Default adapters** (each module's `adapter.js`) render every `kind` well enough that an unknown
  app still looks right.
- **Per-app adapters** (`modules/<id>/apps/<slug>.js`) override only what differs (Spotify's ad
  countdown, Telegram's avatar). Adapters return presentation data, never actors.
- D-Bus callers send presentation data directly.

## 8. Non-negotiables

No polling while closed; no blur; no blurred shadows; actors reused, not recreated; nothing animating
while idle (a content change is one transition, §2a; a playing equaliser is an activity, §6); a module
switched off costs zero.
