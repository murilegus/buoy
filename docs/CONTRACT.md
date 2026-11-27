# Activity contract

What a source, an adapter or a D-Bus caller gives Buoy, and what Buoy does with it. Modelled on
Apple's Live Activities; Buoy plays Apple's role (render, lifecycle, placement) and covers apps
that adopted nothing with adapters.

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
  attributes:{ title, artist, art },   // static for the activity's life
  state:     { status, position },     // replaced whole on update()
  priority:  10,                       // = relevanceScore, across ALL apps (Apple: per app)
  ttl:       0,                        // ms; 0 = until ended; cap 8 h
  staleAfter:0,                        // ms without update → stale → dimmed/"—"
  style:     'standard' | 'transient', // transient: opens expanded, ends on click-outside
  alert:     false,                    // true on surface/update → its card opens on its pill
  keyline:   null,                     // optional border tint
  onPress, onExpand,
  actions:   [{id, label, icon, selected?, types?, main?}],  // ≤ 1 minimal, ≤ 3 compact/expanded;
             // selected: one of a set, chosen one marked (power modes, 2026-11-14);
             // main: the one to press, cream (Join, 2026-11-20)
  minimalAction: true,                 // false: no button in minimal, compact has them (media)
  onAction(id, value?)                 // button pressed (ask: answers it); a tab may pass a value (seek)
  onExpire()                           // its ttl ended it, not end() (2026-11-08)
  // alert card (design/alerts-and-asks, 2026-11-12): held 5 s of your presence, then closed
  alertStays: false,                   // true: stays until false again (critical notification)
  alertKey:  null,                     // new key = new card; a change closes the card (a burst's turn)
  onSeen()                             // card had its 5 s with you there, or was hovered
  onAlertDone(seen)                    // card closed (or got none: hidden, away, another up)
  onAlertState({mayYield, hovered})    // card had its 1 s, pointer off it: another may replace it
  tile: {value, caption} | {live, caption}  // Home's tile (design/home): value in large figures;
             // live: player position, elapsed; default: text or ring trailing, text as caption
             // (kit/model/home.js tileOf)
  compact.card: {icon, app, at, picture, title, body, close, actionsOnHover, tight}
             // a message's card. actionsOnHover: buttons only under the pointer; picture may be
             // {stack: [icon, …]} (≤ 3 logos); tight: no message, buttons 12 under the picture
             // (104); code (+ codeEnd, an element): one-time code, 2em, instead of the message;
             // tag: short text at its end (licence plate); reply: {state typing|sent|failed,
             // hint, text, textId, sendId, cancelId}: entry and Send instead of the buttons
             // (opened, with the keyboard, by an action with types: true)
  compact: {leading, text, subtitle, trailing, transport, progress, rows}  // hover tier.
             // transport: ≤ 3 actions; progress: 0..1 or live {position, length, at, playing}
             // (ms), running with elapsed and remaining while shown; rows: [{icon, text, detail,
             // dim, rank}] ≤ 16, compact draws the 3 of lowest rank (ties: first) in order, Home's
             // main card as many as fit (2026-11-13); subtitle may run: {elapsed, text} →
             // "0:42 · from 14:03" (2026-11-14)
}
```

Lifecycle (internal and D-Bus): `surface(activity)` · `update(id, patch, {alert})` ·
`end(id, {dismissal: 'immediate' | ms})` · `schedule(activity, startAt)` ·
`ask(id, question, options, {timeoutMs, fallback}) → choice`, answered by `answer(id, choice)`
(Buoy's own). An ask opens expanded on reaching the pill: only expanded shows every option
(2026-11-01). `dismiss(id)` hides an ask but keeps it pending (red light); other activities just
end. The 8 h cap applies to a set `ttl` (`kit/model/stack.js`).

`validate()` throws on bad adapter or caller output (registry, `surface`, `update`,
`schedule`). Apple rules in code: 8 h cap, end removes at once, relevance decides what shows,
stale renders dimmed, alert = brief expanded, transient ends on outside click.

## 2. Tiers

| Apple | Buoy |
|---|---|
| compact leading + trailing | **minimal**, pill 1: zones **leading** (icon/art) · **text** · **trailing** (glyph/progress); content-fit width, h 32 |
| compact reduced width / minimal | **minimal**, side pills: up to two 120 × 32 pills right of pill 1, attached in the bar; leading + short trailing + `+N` (SPEC §2c, 2026-11-05) |
| expanded | width per screen (560–760, `expanded-width` overrides) × height fitting content up to width/2, as iOS; regions **leading / trailing / center / bottom** with `priority`; opened by click; alerts open it briefly; transient activities start here |
| Lock Screen / banner | n/a (GNOME lock screen out of scope) |
| Mac menu bar | *we are the menu bar* |
| hover (none) | **compact**: the hovered pill grows in place to 0.72 × expanded × 56/88, up to 120 for rows (leading 40, two lines, ≤ 3 actions, a bar or ≤ 3 rows); before it, +10 % width and +2 height (SPEC §2, §4, 2026-11-05) |

Names (2026-11-05): Buoy's tiers are **minimal < compact < expanded** by size. Buoy's minimal is
Apple's compact and minimal; Buoy's compact is a hover tier Apple lacks. Apple's words keep
Apple's meaning.

Expanded is an enlarged compact: adapters give the same elements and the renderer places them;
no free-form canvas. Expanded also carries what compact has no room for (media: player choice,
app volume, shuffle/repeat).

## 3. Adapters

```js
// modules/<id>/adapter.js: one method per kind, returns presentation data, never actors
progress(a) → { leading: appIcon, text: label, trailing: ring(fraction) }
osd(a)      → { leading: icon, text: device | word | null, trailing: {bar, label: '62', off?}, ttl: 1500 }
// modules/media/apps/spotify.js: override only what differs ('Advertisement' → text 'Ad', a countdown)
```

Leading/trailing values (normalised by `kit/model/presentation.js#element`):

| Value | Draws |
|---|---|
| `'icon-name'` or a `Gio.Icon` | an icon |
| `'eq'` / `'eq-paused'` | the equaliser, moving or stopped low |
| `{glyph, color}` | a named glyph in the activity's `'#rrggbb'` (the equaliser in its cover's colour); else dropped, the glyph `fg` |
| `{icon, label?, more?}` | an icon with short text beside, "+k" before (a command's ✓ and its time, 2026-11-21) |
| `{art, icon}` | artwork, icon fallback; `round: true` a person's round photo (a message's sender) |
| `{icon \| text \| since \| elapsed, color: '#rrggbb'}` | in the activity's own colour (a call's green) |
| `{workspace: n, more?: k}` | a window's workspace in a square, "+k" before |
| `{progress}` · `{countdown}` / `{text}` | a ring · text |
| `{bar, label?, off?}` | a bar, its number beside; `off` dims both (a muted level, 2026-11-05) |
| `{battery, label?}` | a battery at its level 0..1, its number beside; none for a coarse level, so it never reads as a volume (2026-11-17) |
| `{until: ms since epoch, more?}` | a countdown run once a second while shown (Spotify ad, 2026-11-05; "+k" other timers, 2026-11-22) |
| `{ring: {from, until}}` | time left as a ring, redrawn each second while shown (a timer, 2026-11-22) |
| `{elapsed: ms since epoch}` | counting up, `0:42` (a screen recording, 2026-11-14) |
| `{icon, backdrop: true}` | the icon on a round fill-2 plate in a compact's leading 40 (2026-11-14) |
| `{icon, subtle: true}` | a quiet icon in fg-subtle beside what it qualifies (the idle battery's power mode, 2026-11-27) |
| **`{mascot: '<pose>', icon?}`** | Bu (2026-11-03): one of 13 poses in `MASCOT.md`; unknown → `icon`, else `idle`. The lamp shows the pose's colour; the buoy light stays at pill 1's left end (INDICATORS). Frames, swap timer and colours are the kit's |

**One minimal for every place** (2026-11-05): an adapter returns one `leading · text ·
trailing`, never knowing its pill. Pill 1 shows all three; a side pill (SPEC §2c) drops `text`.
So the **short value that matters goes in `trailing`**, and `text` holds what can be lost:
media `eq` or pause, progress a ring, timer `{countdown}`, an agent's step `{text: '4/7'}`.
Without a useful trailing, `leading` still identifies the activity.

Resolution: `modules/<id>/apps/<slug>.js[kind]` → the module's `adapter.js[kind]`. An app that
speaks D-Bus may send its own presentation data and skip adapters (the "app adopts
ActivityKit" path).

## 4. Sources

MPRIS → media · LauncherEntry → progress · MessageTray → notification · OSD → osd ·
UPower / Bluetooth / Gvc / GUdev / Keymap → power, device, hud · Mutter urgent → attention ·
Selection → copied · GSConnect notifications → phone · D-Bus API → anything else.

## 5. Rules

1. Black opaque pill; colour lives in content; optional keyline tint per activity.
2. Radius = h/2 for the pill; expanded radius 28; concentric margins (8 px pill, 14 px expanded).
3. Text in the pill 1em, weight 600 (compact and expanded 13–14 px medium+ until their M4
   items); the minimal leading takes a 24 px cell at 1em (a cover fills it), 40 px in compact,
   56 px in expanded (SPEC §4).
4. Compact and expanded = enlarged minimal, same order; height grows only with content.
5. ≤ 1 action in minimal, ≤ 3 in compact and expanded; click elsewhere = open the app/window.
6. Rotate one activity through sub-events (one "downloads" activity cycling files) rather than
   stacking many.
7. End immediately; update only on change; alert rarely; never start unexpectedly (every
   source is a module the user can switch off).
8. Motion ≤ 2 s; content fades/slides, numbers tick; nothing animates while idle.
9. No ads, no sensitive bodies while screen sharing.
