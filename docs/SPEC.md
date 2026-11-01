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
  - **System cluster**: GNOME's **quick settings indicators** (network, volume, battery…)
    together with the **clock** (`dateMenu`, moved from centre), as one cluster with the
    shared hover background. Clicking an indicator opens the stock quick-settings menu;
    clicking the clock opens the stock calendar/notifications popover. Nothing is re-anchored.
- The island holds **activities only**; persistent system status stays in the system
  cluster. (This supersedes the earlier "indicators in the pill" decision.)

## 2. Island states

| State | When | Shape | Interaction |
|---|---|---|---|
| **Idle** | no activity | `IDLE` 120×32 r16; content per `idle-content` (§2a) | hover → +12px; press → +20px pulse; **click → open Home** |
| **Compact** | one activity | `activity.shape`, content-fit | hover → `hoverShape` (peek, e.g. media transport); **click → open that activity's tab** |
| **Minimal** | two+ activities | **side-by-side compact pills** (iPhone 18 Pro / iOS 27 model): highest priority at screen centre, others to the right in priority order, each ≥120 px, same shape and zones as a single compact | each pill clicks into its own tab |
| **Expanded** | opened from idle or compact | `EXPANDED` (see §4) | click outside / Esc → collapse |

Rules:
- Pill closed = live activities only, no UI chrome. Expanded = Notchy-style panel.
- Expanded opens **Home** from idle, or the **activity's own tab** from compact.
- A tab strip exists only inside Expanded (Home · Media · Timer · …). Pill never shows tabs.
- Activity ends → removed immediately. `ttl` for transient ones (OSD, notifications).
- Highest priority shows; ties → most recent. Transient interrupts, then previous returns.

### 2a. Idle content (decided 2026-10-30)

Setting `idle-content`, default `none`. Each value is an **idle plan** provided by a module
(`modules/<id>/idle.js`), so the list grows with modules and shrinks when they are off.

| value | what the pill shows | module | refresh |
|---|---|---|---|
| `none` | black pill + the **buoy light**: a small amber dot at the leading edge. Off normally; lit when something was missed (§6 missed history) | core | event |
| `clock` | a *second* clock, styled unlike the one in the right cluster: time + time-of-day icon (dawn / morning / noon / afternoon / evening / night); variants via `idle-clock-style` (icon+time, time only, icon only, with seconds) | `clock` | 1 min tick, only while idle |
| `weather` | condition icon + temperature; hover peek adds wind direction/speed, humidity, feels-like; expanded shows the day | `weather` | GNOME's own `ui/weather.js` client (same location as dateMenu); `idle-weather-refresh` 30 min / 1 h |
| `next-event` | next calendar event: title · time, Join glyph when it has a link | `calendar` | EDS signals |

Rules: an idle plan is presentation only (same data shape as an adapter); it never
surfaces an activity; it is replaced the instant any activity surfaces; nothing animates
while idle. Each plan has its own settings page.

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

### 2b. Tabs (decided 2026-10-30)

- The tab strip exists only inside expanded. Tabs = modules that ship `tab.js`; Home is
  always first; order follows §6.
- Where you open from decides the tab: idle → Home; a compact pill → the tab of its kind
  (`kind → module → tab`); kinds without a tab (osd, copied) → Home. Tabs can be switched
  inside expanded, but the next open follows context again — the last tab is not remembered.
- **Standalone tabs** (decided 2026-10-30, after Notchy's ⋯ menu): a module with `tab.js`
  and `kinds: []`. No source, no activity, no idle plan; it lives only inside expanded.
  This is where tool-like pages go (Clipboard, Launcher, Files, Notes…) without touching
  the pill.
  - Strip layout: `[Home] [kind tabs of enabled modules] [slot ▾] [⋯]`. The **slot** is one
    cell showing the standalone tab last chosen from ⋯; it stays until changed. ⋯ lists every
    enabled standalone tab. Settings can pin some as fixed tabs.
  - Reachable only via slot / ⋯ / keybind — never opened by an event.
  - Actor built on first selection, destroyed when expanded closes (optional cache setting);
    closed = zero cost regardless of how many are enabled.
  - All standalone tabs are **off by default**; a fresh install shows Home + kind tabs only.
  - May use Shell APIs in `tab.js`; still no polling while closed.
  - Likely first ones: Clipboard, Launcher. Not planned: Calculator, Emoji (GNOME search has them).

### 2c. Several pills (minimal mode, decided 2026-10-30)

- Each pill is an independent actor: hover grows only that pill; hover peek only on it.
- Click on any pill opens expanded at that pill's tab. On open, pills **merge**: the primary
  grows into the expanded panel, the others slide in and fade (300 ms). Close = split again.
- An `alert: true` update briefly expands **only that pill** (~2 s, no tab strip).
- Max 3 pills. Further activities don't show; the last pill carries a `+N` badge; clicking
  it opens Home with the full list.
- Order: highest priority at screen centre, then to the right. When one ends, the rest
  slide to fill (eased x), never jump.
- Keyboard: `Super+B` focuses the primary; ←/→ moves between pills; Enter opens; Esc closes.

## 3. Expanded: Home

Single screen, no sub-navigation. Four blocks, each a module that can be off:

```
┌ ⌂ Home · ♪ Media · ⏱ Timer · [ ▣ Clipboard ▾ ] · ⋯ ──────────────── ⚙ ┐
│ [art] title           ⟲ ≡    │ ☁ Weather          ⏱ Timer            │
│       artist                 │   31° Partly cloudy   --:--            │
│   ◀◀  ▶  ▶▶                  │   HCMC · H34 L26                       │
│                              │ UP NEXT                                │
│ October 2026        ‹ ›      │ ▌Design review 3:00 PM                 │
│  S  M  T  W  T  F  S         │ ▌Gym 5:30 PM · 45 min                  │
│  …  calendar grid …          │                                        │
└──────────────────────────────┴────────────────────────────────────────┘
  strip: Home · kind tabs of enabled modules · one slot for a standalone tab · ⋯ menu · ⚙ prefs
  no system indicators here — they live in the right-hand system cluster (§1)
```

- Now playing (compact) — MPRIS. Hidden when nothing plays.
- Calendar — reuse `ui/calendar.js` (same EDS source as dateMenu).
- Weather — reuse `ui/weather.js` (same GWeather location as dateMenu).
- Up next — today's events from the same calendar source.
- Timer — current pomodoro/stopwatch or `--:--`.

## 4. Sizes (decided 2026-10-30: derived, not fixed)

All sizes are logical px; HiDPI is handled by St/Clutter. `kit/shapes.js#shapesFor()`
derives everything from two inputs — the monitor's logical width `W` and the panel
height — and is recomputed on `monitors-changed` or when `expanded-size` changes.
A function, not breakpoints: no jumps when moving between monitors.

| Thing | Rule | 1920 | 2560 | 3440 |
|---|---|---|---|---|
| pill height `h` | panel 40 − 2×4 | 32 | 32 | 32 |
| idle | `h × 3.75` wide, r = h/2 | 120×32 | 120×32 | 120×32 |
| hover / press | +10 % / +16 % width, +2 / +4 height | | | |
| compact | content + 28, clamped to [idle, 0.6×expanded] (`'wide'` hint → 0.8) | | | |
| expanded | `clamp(0.28 × W, 560, 760)`, height = width/2, r 28; `expanded-size` overrides | 560×280 | 717×358 | 760×380 |
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
- Content never moves during a morph.

## 6. Modules for v0.1

1. **media** — MPRIS: compact (art + title · artist), hover peek (transport), tab Media.
2. **hud** — volume / brightness / caps lock replace the stock OSD.
3. **home** — the expanded Home above.
4. **appname** — left cluster.

## 6b. Roadmap after v0.1 (all pure JS)

1. **notifications** — peek in the pill with the notification's own actions
   (Reply / Mark as read / Open); DND toggle.
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

Roadmap: FEATURES.md (milestones M0–M5 with status). Status marks: INDICATORS.md. Research: APPLE.md (ActivityKit/HIG → BuoyKit), NOTCHY.md (74-feature audit), ISLE.md, ISLET.md, BEHAVIOUR.md.

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
nothing animating while idle; a module switched off costs zero.
