# Architecture (decided 2026-10-30)

Organised **by module/feature** (option B). Alternatives considered: by layer (hard to add
or switch off a feature), by app (system sources don't belong to an app), satellite
extensions per module (later, once there is a community), data-only adapters (engine grows
into a language). B is what Isle and GSConnect do; contributors recognise it.

## Layout

```
src/buoy@murilegus/
├── metadata.json
├── stylesheet.css
├── extension.js            enable(): panel → kit → load enabled modules
├── panel.js                top bar rework: left cluster (app/workspace), bare tray, system cluster (QS + clock)
├── corners.js              rounded top corners on maximized windows (SPEC §1a, 2026-11-02)
├── prefs.js                Adw prefs: one page per module + Panel and Windows pages (placeholder, 2026-11-02)
├── schemas/                GSettings: modules.<id>, apps.hidden, sizes, keybinds
└── lib/
    ├── kit/                FRAMEWORK — stable API; the only thing modules import
    │   ├── activity.js     contract (APPLE.md §B1), validate + normalise
    │   ├── stack.js        surface / update / end / schedule / ask; priority across apps;
    │   │                   ttl, stale, transient, alert; apps.hidden filter; missed history
    │   ├── presentation.js presentation data → render plan; pure, unit-tested (2026-11-01)
    │   ├── present.js      render plan → St actors. ONLY place content actors are made
    │   ├── island.js       the pills together: capacity, slots, merge/split, grab, alert
    │   ├── pill.js         one pill: content, sizing, hover/peek, morph (2026-11-01)
    │   ├── home.js         the panel a click opens: tab strip + tab body (Home, kind, standalone)
    │   ├── tabs.js         which tabs exist, where an open starts; pure, unit-tested (2026-11-02)
    │   ├── daypart.js      hour → dawn…night from `daypart-starts`; pure (2026-11-03)
    │   ├── smartstack.js   idle `auto`: ranks plans by `relevance()`, one timer while idle (2026-11-03)
    │   ├── registry.js     app-id normalisation table; adapter resolution
    │   ├── dbus.js         org.gnome.Shell.Extensions.Buoy
    │   └── shapes.js
    └── modules/            FEATURES — one self-contained folder each
        └── <id>/
            ├── index.js    export default {id, kinds, source, adapter, tab?, schema?,
            │               title?, icon?}   title/icon: its tab in the strip
            ├── source.js   watches a system facility, calls stack.surface/update/end
            ├── adapter.js  default presentation for this module's kinds
            ├── tab.js      content for its tab in expanded (optional): export a class,
            │               `new Tab()` → {actor, destroy()}; built on first selection,
            │               destroyed when expanded closes
            ├── idle.js     idle plan for `idle-content` (optional; clock, weather, calendar);
            │               also exports `relevance(ctx)` for `auto` (SPEC §2a-iii)
            └── apps/       per-app overrides, <slug>.js, same method names as adapter.js
```

### Module kinds

| Type | Has | Example |
|---|---|---|
| **source module** | `kinds` + `source.js` + `adapter.js`, optionally `tab.js`, `apps/` | media, hud, progress, ask |
| **idle plan** | `idle.js` (optionally also a source module) | clock, weather, calendar |
| **standalone tab** | `tab.js` only, `kinds: []` | clipboard, launcher |

One module may combine the first two (calendar: next-event activity + idle plan + tab).
A standalone tab never surfaces activities; if it needs to, it becomes a source module.

v0.1 modules: `media`, `hud`, `home`, `progress`, `copied`, `layout`, `ask`; `notification`,
`timer` (and `progress`, kinds `progress`) are imported as stubs without a source until their
roadmap items, so their tabs show from v0.1 (2026-11-02);
`greeting` (2026-11-03); idle plans `clock`, `weather`, `calendar`; standalone tabs `calendar`, `clipboard` (stub `tab.js`, in that order, 2026-11-02).

## Data flow

```
source.js ──ev──► registry.build(kind, app, ev) ──activity──► stack ──► island/present
                      │
                      ├─ ~/.config/buoy/apps/<slug>.json   (user, data only)
                      ├─ modules/<m>/apps/<slug>.js[kind]   (repo, code)
                      └─ modules/<m>/adapter.js[kind]        (default)
D-Bus callers send presentation data directly: no adapter, but the registry slugs the app
and applies the user's profile (Registry.present). API: DBUS.md.
```

### App profiles (2026-11-02)

`~/.config/buoy/apps/<app>.json`: per-user, data only (rule 7): icon, title template,
hideBody, priority, ttl, regex replace/skip. The registry applies them for every adapter
and reloads them when a file changes; adapters never handle these keys. Format, event
fields and order: [PROFILES.md](PROFILES.md).

## Rules

1. **Modules import `kit/` only.** Never another module. Modules talk through activities.
2. **`kit/` may import `Main`/Shell. `adapter.js` and `apps/*.js` may not** — no `St`, no
   `Main`, no timers. They are pure functions `event → presentation data`, testable with `gjs`.
   `source.js` and `tab.js` may use Shell APIs.
3. **Adapters return data, never actors.** Shape of the data is fixed by `presentation.js`:
   `{leading, text, trailing, expanded:{leading,trailing,center,bottom}, actions, ttl,
   priority, keyline, style, sizeHint, onPress, peek}`. An override returns the same shape.
4. **Per-app overrides live under the module of the kind they override.** An app present
   in two kinds has two small files. No central `apps/<app>/` folder.
5. **One slug per app** across every source (MPRIS bus name, desktop id, notification
   app name) — the table lives in `kit/registry.js`; modules only see the slug.
6. **Module off = not imported** (`modules.<id> = false`): no signal connected, no actor
   created, zero cost. Hiding an app (`apps.hidden`) is a stack filter, not an adapter concern.
7. **No code loaded at runtime** (EGO rule). User customisation is JSON profiles only:
   icon, title template, hide body, priority, ttl, simple regex. Logic needs a PR.
8. **No polling while closed; no blur; nothing animating while idle.** A source that must
   poll (progress bar position) polls only while its activity is visible. "Animating"
   means looping or continuous motion: a change of idle content (clock minute, `auto`
   switching plans) is one transition, then stillness (clarified 2026-11-03).
9. Every module declares its GSettings keys in `index.js#schema`; prefs.js renders them.
   Shell-level keys that belong to no module (panel clusters, window corners) get their
   own prefs pages; their code lives next to `panel.js`, not under `modules/`.
10. Standalone tabs are off by default and build their actor on first selection.
11. **Adapters never return measurements.** No `width`, `height`, `x`, px, or monitor
    queries — only content plus discrete hints (`size: 'wide'`, region `priority`). Sizes
    are derived in `kit/shapes.js` from the monitor; the renderer fits content (ellipsize
    text, drop low-priority regions). An adapter written on one screen behaves on every screen.

## Settings model

| Key | Type | Effect |
|---|---|---|
| `modules.<id>` | bool | import the module or not |
| `apps.hidden` | as | apps whose activities never surface; any app id, slugged (2026-11-02) |
| `apps.plain` | as | apps that use the default adapter instead of their override; any app id, slugged |
| `idle-content` | s | `auto` (default, 2026-11-03) \| `none` \| any module's idle plan id |
| `idle-auto-plans` | as | plans `auto` may show, in tie-break order; default every enabled plan |
| `idle-auto-interval` | i | minutes between `auto` re-ranks while idle; default `5`, 2–30 |
| `daypart-starts` | ai | start hours of dawn, morning, noon, afternoon, evening, night; default `[5, 7, 11, 13, 18, 22]` |
| `tabs-pinned` | as | standalone tab ids shown as fixed tabs (settings only) |
| `tabs-slot` | s | standalone tab in the slot, set from ⋯; empty = the first enabled one (2026-11-02) |
| `dev-mode` | b | exposes `stateObj.reload(id)` module hot swap |
| `cluster-background` | s | hover \| always \| never |
| `cluster-contrast` | s | auto \| light \| dark |
| `left-cluster-empty` | s | workspace \| hidden |
| `window-corners` | b | round the top corners of maximized windows; default `true` (2026-11-02) |
| `window-corners-radius` | i | that radius in logical px, 0–32; default `15` (Adwaita `--window-radius`) |
| `idle-clock-style`, `idle-weather-refresh` | — | declared by those modules |
| `greeting-style`, `greeting-name`, `greeting-last-day` | — | declared by `greeting` (SPEC §2d) |
| `expanded-width` | i | expanded width, logical px; `0` (default) = derived from the monitor. No height key: like iOS, height fits content up to width/2 (changed from `expanded-size (ii)` 2026-11-01) |
| `keybind-focus` | as | focus the pill (default Super+B) |
| per-module keys | — | declared by the module |

## Open for later

- Satellite extensions (`buoy-<module>@…`) over D-Bus once the contract is stable.
- Scheduled activities need persistence across Shell restarts.
