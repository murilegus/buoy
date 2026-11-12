# Activity contract

What a source, an adapter or a D-Bus caller gives Buoy, and what Buoy does with it. Modelled on
Apple's Live Activities (ActivityKit, the HIG); Buoy plays Apple's role (render, lifecycle,
placement) and fills the gap Apple leaves — apps that never adopted anything — with adapters.

```
Sources  ──►  Adapters  ──►  BuoyKit  ──►  Island renderer
(what the      (default per    (lifecycle,    (minimal / compact /
 system emits)  kind + per-app  priority,      expanded, Home)
                overrides)      ttl, stale)
D-Bus API ──────────────────────┘   apps & scripts that know Buoy skip the adapter layer
```

## 1. Activity

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
  alert:     false,                    // true on surface/update → its card opens on its pill (an alert)
  keyline:   null,                     // optional border tint
  onPress, onExpand, actions: [{id, label, icon}],  // ≤ 1 in minimal, ≤ 3 compact/expanded (HIG)
  minimalAction: true,                 // false: no button in minimal, the compact has them (media)
  onAction(id, value?)                 // a button was pressed (ask: answers it); a tab may pass a value (seek)
  onExpire()                           // its ttl ended it (not end()): a transient notification goes (2026-11-08)
  // an alert's card (design/alerts-and-asks, 2026-11-12): held 5 s of your presence, then closed
  alertStays: false,                   // true: the card stays until this turns false (a critical notification)
  alertKey:  null,                     // the card it is: another key on the same activity is another card;
                                       // the card closes when the key changes (a burst's turn)
  onSeen()                             // its card had its 5 s while you were there, or was hovered
  onAlertDone(seen)                    // its card closed (or got none: hidden, away, another card up)
  onAlertState({mayYield, hovered})    // the card had its 1 s and the pointer is off it: another may take its place
  tile: {value, caption} | {live, caption}  // Home's tile (design/home): its own value in large figures;
                                       // `live` a player's position, the elapsed time; default: a text
                                       // or ring trailing, the text as caption (kit/model/home.js tileOf)
  compact.card: {icon, app, at, picture, title, body, close, actionsOnHover}
                                       // a message's card; actionsOnHover: its buttons only under the
                                       // pointer; picture may be {stack: [icon, …]} (≤ 3 logos)
  compact: {leading, text, subtitle, trailing, transport, progress, rows}  // the hover tier (Buoy's
                                       // own; was `peek`); transport = ≤3 actions; progress 0..1 or
                                       // live {position, length, at, playing} (ms), which runs with
                                       // elapsed and remaining while shown; rows ≤ 3
}
```

Lifecycle API (internal and D-Bus): `surface(activity)` · `update(id, patch, {alert})` ·
`end(id, {dismissal: 'immediate' | ms})` · `schedule(activity, startAt)` ·
`ask(id, question, options, {timeoutMs, fallback}) → choice` (no Apple equivalent; Buoy's
extra) answered by `answer(id, choice)`; an ask opens expanded whenever it reaches the
pill, since only expanded shows every option (decided 2026-11-01); `dismiss(id)` hides an ask but keeps it pending
(red light), any other activity just ends. `ttl: 0` lives until ended; the 8 h cap
applies to a set `ttl` (`kit/model/stack.js`, 2026-11-01).

`validate()` throws on bad adapter or caller output (the registry, `surface`, `update`,
`schedule`). Apple rules kept as code: 8 h cap, end removes from the pill immediately, relevance decides
which shows, stale state renders dimmed, alert = brief expanded, transient ends on outside click.

## 2. Tiers

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
counterpart for. Apple's words keep Apple's meaning.

Expanded is an enlarged compact: adapters give the same elements for both and the renderer
positions them; adapters do not get a free-form canvas. Expanded also carries what compact
has no room for (media: player choice, the app's volume, shuffle/repeat).

## 3. Adapters

```js
// modules/<id>/adapter.js — one method per kind, returns presentation data, not actors
media(a)        → { leading: art, text: `${title} · ${artist}`, trailing: eqGlyph, expanded: {...}, actions: [playPause] }
notification(a) → { leading: appIcon, text: title, trailing: null, ttl: 6000, actions: n.actions.slice(0,1) }
progress(a)     → { leading: appIcon, text: label, trailing: ring(fraction) }
osd(a)          → { leading: icon, text: device | word | null, trailing: {bar, label: '62', off?}, ttl: 1500 }
power(a), timer(a), ask(a) …

// modules/media/apps/spotify.js — override only what differs
export default { media(a) { ...detect 'Advertisement' → text 'Ad', trailing countdown } }
```

Leading/trailing values an adapter may return (normalised by `kit/model/presentation.js#element`):
`'icon-name'` or a `Gio.Icon` (icon) · `'eq'` / `'eq-paused'` (named glyphs: the equaliser, moving or stopped low) · `{art, icon}` (artwork with
an icon fallback) · `{progress}` (ring) · `{bar, label?, off?}` (a bar; `label` its number
beside it, `off` dims both — a muted level, 2026-11-05) · `{countdown}` / `{text}` (text) ·
`{until: ms since the epoch}` (a countdown the renderer runs once a second while shown,
2026-11-05: a Spotify ad) ·
**`{mascot: '<pose>', icon?}`** (Bu, added 2026-11-03): one of the 13 poses in
`MASCOT.md`; an unknown pose falls back to `icon`, else `idle`. Bu's lamp always shows
its pose's colour; the buoy light stays at pill 1's left end (INDICATORS). The pose
is data; frames, the swap timer and colours are the kit's.

**One minimal for every place** (2026-11-05): an adapter returns one `leading · text ·
trailing` and never knows which pill it lands in. Pill 1 shows all three; an idle-sized side
pill (SPEC §2c) shows `leading` and `trailing` only and drops `text`. So the **short value
that matters most goes in `trailing`**, where every pill shows it, and `text` carries what
can be lost: media `eq` or pause, progress a ring, timer `{countdown}` (not the time in
`text`), an agent's step as `{text: '4/7'}`. An activity with nothing useful to put there
is still recognised by its `leading`.

```js
agent(a) → { leading: {mascot: pose(a.state.event)}, text: `${a.attributes.agent} · ${a.state.label}`,
             trailing: {countdown: a.state.elapsed} }   // pose(): MASCOT.md § Agents
```

Resolution: `modules/<id>/apps/<slug>.js[kind]` → the module's `adapter.js[kind]`. An app that speaks
the D-Bus API can send its own presentation data and bypass adapters entirely (that is the
"app adopts ActivityKit" path).

## 4. Sources

MPRIS → media · LauncherEntry → progress · MessageTray → notification · OSD → osd ·
UPower / Bluetooth / Gvc / GUdev / Keymap → power, device, hud · Mutter urgent → attention ·
Selection → copied · GSConnect notifications → phone · D-Bus API → anything else.

## 5. Rules

1. Black opaque pill; colour lives in content; optional keyline tint per activity.
2. Radius = h/2 for the pill; expanded radius 28; concentric margins (8 px pill, 14 px expanded).
3. Text in the pill 1em, weight 600 (compact and expanded 13–14 px medium+ until their M4 items); the leading in minimal takes a cell of 24 px at 1em (a cover fills it), 40 px in compact, 56 px in expanded (SPEC §4).
4. Compact and expanded = enlarged minimal, same order; height grows only with content.
5. ≤ 1 action in minimal, ≤ 3 in compact and expanded; click elsewhere = open the app/window.
6. Rotate one activity through sub-events (e.g. one "downloads" activity cycling files)
   rather than stacking many.
7. End immediately; update only on change; alert rarely; never start unexpectedly
   (every source is a module the user can switch off).
8. Motion ≤ 2 s; content fades/slides, numbers tick; nothing animates while idle.
9. No ads, no sensitive bodies while screen sharing (Isle does this too).
