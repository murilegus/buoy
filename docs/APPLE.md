# Apple Live Activities / ActivityKit — research and the Buoy translation

Sources (read Oct 30 2026): developer.apple.com ActivityKit framework page, *Displaying live
data with Live Activities*, WidgetKit `DynamicIsland` reference, HIG *Live Activities*
(change log: Oct 13 2026 "limited width layouts, updated platforms and specs"; Dec 16 2025
macOS + CarPlay), WWDC26 session 223 *Live Activities essentials*, WWDC25 216/278.

Part A is what Apple does. Part B is the Buoy equivalent ("BuoyKit"): a framework with a
default rendering for every activity plus optional per-app customisation, the same split
Apple makes between system (renders, manages lifecycle) and app (declares data + views).

---

## A. How Apple does it

### A1. Roles

| Apple | Who writes it |
|---|---|
| **ActivityKit** — request / update / end, push tokens, relevance, stale date, limits | Apple (system) |
| **Rendering + lifecycle + placement** (Dynamic Island, Lock Screen, StandBy, Mac menu bar, Watch Smart Stack, CarPlay) | Apple (system) |
| **ActivityAttributes** — static data + `ContentState` dynamic data | the app |
| **Presentations** — SwiftUI views for compact leading/trailing, minimal, expanded, Lock Screen | the app, in its widget extension |
| **Interactions** — Button/Toggle via App Intents, deep link on tap | the app |

Apple never writes an adapter for a third-party app. If the app doesn't adopt ActivityKit,
nothing appears. Only system apps (Music, Timer, Phone, AirDrop, Face ID, charging…) show
up "for free".

### A2. Data model

- `ActivityAttributes`: static fields, fixed for the activity's life (team names, order id).
- `ContentState`: dynamic fields; every `update()` replaces it whole. `Codable & Hashable`.
- Combined static + dynamic payload ≤ **4 KB**.
- `ActivityContent` wraps the state with `staleDate` (after which `isStale == true`, UI can
  show "outdated") and `relevanceScore` (which of *this app's* activities goes in the Island;
  ties → first started; higher wins).
- Live Activities run sandboxed: no network, no location. Data comes only via the app
  (foreground, or background via BackgroundTasks) or APNs push.

### A3. Lifecycle

| Call | Notes |
|---|---|
| `request(attributes:content:pushType:style:alertConfiguration:start:)` | app must be foreground, except via `LiveActivityIntent` (Control Center, Action button, Shortcuts) or push-to-start (iOS 17.2) |
| `style:` **standard** (iOS 18) | persists until ended / 8 h cap |
| `style:` **transient** (iOS 18) | appears directly in expanded; ends when device locks, user collapses it, taps outside, or leaves the app. Music uses it for the AirPlay picker |
| `start:` date (iOS 26) | **scheduled** activity (sports match later today); must pass an alert config |
| `update(_:alertConfiguration:)` | with alert config → Island shows **expanded briefly**, lights screen, sound; Watch gets a real alert. HIG: alert only for essential updates |
| `end(_:dismissalPolicy:)` | always send final state. **Island removes immediately**; Lock Screen / Mac menu bar / Watch keep it up to 4 h (`default`), `immediate`, or `after(date)`. HIG suggests 15–30 min |
| limits | 8 h active max (+4 h lingering on Lock Screen = 12 h); device-dependent cap on simultaneous + scheduled activities |
| observation | `activityUpdates`, `activityStateUpdates` (active / ended / dismissed / stale), `contentUpdates`, `pushTokenUpdates` |
| remote | push-to-start, update, end via APNs; **broadcast channels** (iOS 18) for shared events (one push → all subscribers) |

### A4. Presentations in the Dynamic Island

| Presentation | When | Size (pt, iPhone 430×932 / 393×852) |
|---|---|---|
| **Compact** leading + trailing | exactly one activity; the two views read as one piece of info; tap → app | 62.33×36.67 / 52.33×36.67 each side |
| **Compact, reduced width** | iPhone 18 Pro with **two** activities → both shown compact side by side; also landscape (iOS 27) and "iPhone Duo" | fit inside a 28 pt circle |
| **Minimal** | several activities on other devices: one attached, up to **two detached** (circle or oval by content) | 36.67–45 × 36.67 |
| **Expanded** | touch-and-hold compact/minimal; also **briefly on alerting updates**; transient activities start here | 371–408 wide × 84–160 tall |
| Lock Screen / banner | devices without Island show the Lock Screen presentation as a banner for alerts | 84–160 tall, 14 pt margins |
| StandBy | minimal at top; tap → Lock Screen presentation 2× | |
| Mac menu bar (macOS 26) | compact / minimal / expanded; click → iPhone Mirroring | iOS sizes |
| Watch Smart Stack (watchOS 11) | leading + trailing auto-combined, or custom `.small` family | 152–198 × 70–82 |
| CarPlay (iOS 26) | leading + trailing combined; buttons disabled | 240×78/100, 170×78 |

Expanded layout = four regions: **leading**, **trailing** (either side of the camera, wrap
below), **center** (below camera), **bottom** (full width). `priority:` makes one region take
full width; `.belowIfTooWide` drops leading content under the camera.

### A5. Visual rules (HIG, the parts that transfer)

- Island background is **opaque black, not customisable** in compact/minimal/expanded.
  Brand with bold colour in content; optional **keyline tint** (border) via `keylineTint`.
- Island corner radius **44 pt**; content concentric with it; even margins; nothing poking
  into the rounded corners; separate blocks with an inset pill or a thick line, never to the edge.
- Text medium weight or heavier; small text sparingly.
- Expanded is an *enlarged* compact: same elements, same order. Height is dynamic — grow
  only when there is more to show (rideshare: short while finding driver, taller once assigned).
- Logo mark without container; never the whole app icon. No ads. Avoid sensitive info (show a
  summary, redact, tap to reveal).
- One interactive element preferred; actions only for essential, once-or-pause things
  (play/pause, mute, contact driver). Tap anywhere else → deep link into the app.
- Prefer **one activity that rotates** through several events over several activities.
- Animations: system ignores custom timing; text changes use blurred transitions, images and
  symbols animate, views fade in/out, `numericText` for counters; custom transitions
  (opacity, move, slide, push, scale) allowed; max 2 s; none on reduced luminance.
- Start activities only when expected (after an order, when a match starts); always end
  immediately when the task ends; update only on real change; alert rarely.

### A6. What's new, in order

| Release | Addition |
|---|---|
| iOS 16.1 | Live Activities, Dynamic Island, compact/minimal/expanded |
| iOS 17 | StandBy; interactive Buttons/Toggles via App Intents; `LiveActivityIntent` |
| iOS 17.2 | push-to-start tokens |
| iOS 18 | `ActivityStyle` standard/transient; broadcast push channels; `supplementalActivityFamilies` (`.small` Watch, `.medium`); watchOS Smart Stack |
| iOS 26 / macOS 26 | scheduled activities (`start:`); Mac menu bar via iPhone Mirroring; CarPlay Dashboard; Liquid Glass visuals |
| iOS 27 (WWDC26) | Island visible in **landscape**, new limited-width style; `isDynamicIslandLimitedInWidth`; two compact activities side by side on iPhone 18 Pro; up to three minimal |

---

## B. BuoyKit — the GNOME translation

Buoy plays Apple's role (render, lifecycle, placement) **and** fills the gap Apple leaves
(apps that never adopted anything) with adapters. Three layers:

```
Sources  ──►  Adapters  ──►  BuoyKit  ──►  Island renderer
(what the      (default per    (lifecycle,    (compact / minimal /
 system emits)  kind + per-app  priority,      expanded, Home)
                overrides)      ttl, stale)
D-Bus API ──────────────────────┘   apps & scripts that know Buoy skip the adapter layer
```

### B1. Activity contract (= ActivityAttributes + ContentState)

```js
{
  id:        'media:spotify',          // unique per source instance
  kind:      'media',                  // picks the default adapter
  app:       'spotify',                // normalised; picks the override
  attributes:{ title, artist, art },   // static for this activity's life
  state:     { status, position },     // replaced whole on update()
  priority:  10,                       // = relevanceScore, across ALL apps (Apple: per app)
  ttl:       0,                        // ms; 0 = until ended; cap 8 h like Apple
  staleAfter:0,                        // ms without update → isStale → dimmed/"—"
  style:     'standard' | 'transient', // transient = opens expanded, ends on click-outside
  alert:     false,                    // true on update → expand briefly (Apple alert config)
  keyline:   null,                     // optional border tint
  onPress, onExpand, actions: [{id, label, icon}],  // ≤ 1 in minimal, ≤ 3 compact/expanded (HIG)
  onAction(id)                         // a button was pressed (ask: answers it)
  compact: {leading, text, trailing, transport}  // the hover tier (Buoy's own; was `peek`); transport = ≤3 actions
                                       // + subtitle, progress, rows ≤ 3 with FEATURES M3 "Compact tier"
}
```

Lifecycle API (internal and D-Bus): `surface(activity)` · `update(id, patch, {alert})` ·
`end(id, {dismissal: 'immediate' | ms})` · `schedule(activity, startAt)` ·
`ask(id, question, options, {timeoutMs, fallback}) → choice` (no Apple equivalent; Buoy's
extra) answered by `answer(id, choice)`; an ask opens expanded whenever it reaches the
pill, since only expanded shows every option (decided 2026-11-01); `dismiss(id)` hides an ask but keeps it pending
(red light), any other activity just ends. `ttl: 0` lives until ended; the 8 h cap
applies to a set `ttl` (`kit/stack.js`, 2026-11-01).

Apple rules kept as code: 8 h cap, end removes from the pill immediately, relevance decides
which shows, stale state renders dimmed, alert = brief expanded, transient ends on outside click.

### B2. Presentations

| Apple | Buoy |
|---|---|
| compact leading + trailing | **minimal**, pill 1: one pill, three zones: **leading** (icon/art) · **text** · **trailing** (status glyph/progress); content-fit width, h 32 |
| compact reduced width (two activities, iPhone 18 Pro) / minimal (up to 3) | **minimal**, side pills: up to two 120 × 32 pills right of pill 1, attached in the bar (not detached bubbles); leading + short trailing + `+N` (SPEC §2c, 2026-11-05) |
| expanded | width per screen (560–760, `expanded-width` overrides) × height fitting content up to width/2 — as iOS: fixed width, dynamic height; regions **leading / trailing / center / bottom** with `priority`; opened by click; alerts open it briefly; transient activities start here |
| Lock Screen / banner | n/a (GNOME lock screen out of scope) |
| Mac menu bar | *we are the menu bar* |
| hover (no Apple equivalent) | **compact**: the hovered pill grows in place to 0.72 × expanded × 56/88, up to 120 for rows (leading 40, two lines, ≤ 3 actions, a bar or ≤ 3 rows); before it, +10 % width and +2 height (SPEC §2, §4, 2026-11-05) |

Names (2026-11-05): Buoy's tiers are **minimal < compact < expanded** by size. Buoy's
minimal is Apple's compact and minimal; Buoy's compact is the hover tier Apple has no
counterpart for. Apple's words above, in part A, keep Apple's meaning.

Expanded is an enlarged compact: adapters give the same elements for both and the renderer
positions them; adapters do not get a free-form canvas. Expanded also carries what compact
has no room for (media: player choice, the app's volume, shuffle/repeat).

### B3. Adapters (= the app's widget extension, written by us or the community)

```js
// lib/apps/default.js — one method per kind, returns presentation data, not actors
media(a)        → { leading: art, text: `${title} · ${artist}`, trailing: eqGlyph, expanded: {...}, actions: [playPause] }
notification(a) → { leading: appIcon, text: title, trailing: null, ttl: 3000, actions: n.actions.slice(0,1) }
progress(a)     → { leading: appIcon, text: label, trailing: ring(fraction) }
osd(a)          → { leading: icon, trailing: bar(level), ttl: 1500 }
power(a), timer(a), ask(a) …

// lib/apps/spotify.js — override only what differs
export default { media(a) { ...detect 'Advertisement' → text 'Ad', trailing countdown } }
```

Leading/trailing values an adapter may return (normalised by `kit/presentation.js#element`):
`'icon-name'` or a `Gio.Icon` (icon) · `'eq'` (a named glyph) · `{art, icon}` (artwork with
an icon fallback) · `{progress}` (ring) · `{bar}` · `{countdown}` / `{text}` (text) ·
**`{mascot: '<pose>', icon?}`** (Bu, added 2026-11-03): one of the 13 poses in
`MASCOT.md`; an unknown pose falls back to `icon`, else `idle`. When a pill's leading is
Bu, Bu's lamp is the buoy light: the left edge slot is not drawn, and the lamp shows the
stack's `missed`/`waiting` colour if there is one, else the pose's (SPEC §2a-i). The pose
is data; frames, the swap timer and colours are the kit's.

**One minimal for every place** (2026-11-05): an adapter returns one `leading · text ·
trailing` and never knows which pill it lands in. Pill 1 shows all three; a 120 px side
pill (SPEC §2c) shows `leading` and `trailing` only and drops `text`. So the **short value
that matters most goes in `trailing`**, where every pill shows it, and `text` carries what
can be lost: media `eq` or pause, progress a ring, timer `{countdown}` (not the time in
`text`), an agent's step as `{text: '4/7'}`. An activity with nothing useful to put there
is still recognised by its `leading`.

```js
agent(a) → { leading: {mascot: pose(a.state.event)}, text: `${a.attributes.agent} · ${a.state.label}`,
             trailing: {countdown: a.state.elapsed} }   // pose(): MASCOT.md § Agents
```

Resolution: `apps/<normalised app>.js[kind]` → `apps/default.js[kind]`. An app that speaks
the D-Bus API can send its own presentation data and bypass adapters entirely (that is the
"app adopts ActivityKit" path).

### B4. Sources (what Apple's system apps give for free, GNOME gives via signals)

MPRIS → media · LauncherEntry → progress · MessageTray → notification · OSD → osd ·
UPower / Bluetooth / Gvc / GUdev / Keymap → power, device, hud · Mutter urgent → attention ·
Selection → copied · GSConnect notifications → phone · D-Bus API → anything else.

### B5. HIG rules adopted as Buoy design rules

1. Black opaque pill; colour lives in content; optional keyline tint per activity.
2. Radius = h/2 for the pill; expanded radius 28; concentric margins (8 px pill, 14 px expanded).
3. Text 13–14 px medium+; leading element ≤ 20 px in minimal, 40 px in compact, 56 px in expanded.
4. Compact and expanded = enlarged minimal, same order; height grows only with content.
5. ≤ 1 action in minimal, ≤ 3 in compact and expanded; click elsewhere = open the app/window.
6. Rotate one activity through sub-events (e.g. one "downloads" activity cycling files)
   rather than stacking many.
7. End immediately; update only on change; alert rarely; never start unexpectedly
   (every source is a module the user can switch off).
8. Motion ≤ 2 s; content fades/slides, numbers tick; nothing animates while idle.
9. No ads, no sensitive bodies while screen sharing (Isle does this too).

### B6. What Buoy adds that Apple doesn't have

- `ask()` — synchronous question with buttons returning the answer to the caller.
- A hover tier, compact: the pill grows in place to show controls (SPEC §2).
- Adapters for apps that never adopted anything (Apple has none).
- Priority across apps (Apple only ranks within one app; the system decides across apps).
- Missed-activity light + short history.
- Bu, a mascot whose lamp is that light (`MASCOT.md`): one pose set for agents, the
  greeting and the brand, data-only in the contract.

### B7. What Apple has that Buoy skips

Push/APNs, broadcast channels, App Intents, Lock Screen/StandBy/Watch/CarPlay families,
push-to-start — all replaced by one local D-Bus interface.
