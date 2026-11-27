# Architecture

*Decided 2026-10-30.*

Organised **by module/feature**, like Isle and GSConnect. Rejected: by layer (hard to switch a
feature off), by app (system sources have no app), one extension per module (Open for later),
data-only adapters (the engine grows into a language).

## Layout

```
src/buoy@murilegus/
├── metadata.json
├── stylesheet.css      kit and panel CSS, in sections (Stylesheets)
├── extension.js        enable(): panel → kit → enabled modules
├── panel.js            top bar: left cluster (app/workspace), bare tray, system cluster (QS + clock)
├── wallpaper.js        Shell's wallpaper, decoded once per change, for cluster-contrast
├── glyphs.js           one-colour bitmap tray icons (Electron's white glyphs), tinted like text
├── reach.js            Overview backgrounds reach under the see-through bar
├── corners.js          rounded top corners on maximized windows (SPEC §1a)
├── prefs.js            Adw pages: Island, Modules (grouped by kit/model/settings.js MODULE_GROUPS),
│                       Apps, Panel, Windows, About (version, Bu, `donations`, `dev-mode`)
├── schemas/            GSettings: the one source of every key, summary and range
├── hooks/              claude.js: Claude Code's hook (run by Claude Code), installed from prefs:
│                       stdin → D-Bus `Agent` (CODING-AGENTS.md); shell.sh: the shell hook for
│                       the terminal module (a line in ~/.zshrc or ~/.bashrc, from prefs)
├── icons/color/        daypart and weather SVGs, from scripts/icons.js
├── icons/symbolic/     `<theme name>-symbolic.svg` (Gravity UI and Buoy's own), from
│                       scripts/symbolic-icons.js (design/icons)
└── lib/
    ├── kit/            FRAMEWORK, the only thing modules import; three layers (2026-11-12),
    │   │               imports checked by `eslint.config.js`, tested in `tests/boundaries.mjs`
    │   ├── settings.js re-exports model/settings.js; 0.1's install.sh imports this path: keep it
    │   ├── model/      pure, GLib only (timer, variant); imports model/ only; tested with plain gjs
    │   │   ├── activity.js     contract (CONTRACT.md §1): validate, normalise
    │   │   ├── stack.js        injected clock; surface/update/end/schedule/ask; order (PRIORITY.md);
    │   │   │                   ttl, stale, transient, alert; `apps-hidden`; missed; `pillWindow`
    │   │   ├── presentation.js presentation data → render plan
    │   │   ├── shapes.js       pill sizes from monitor and em (rule 11)
    │   │   ├── home.js, tabs.js, keys.js   Home's plan (design/home); which tabs, where an open
    │   │   │                   starts; an ask's keys, ←/→
    │   │   ├── motion.js, flight.js        springs and fades; shared parts in flight (design/motion)
    │   │   ├── settings.js     each key's prefs page, samples
    │   │   ├── cluster.js, contrast.js, rounded.js   left cluster; text contrast; window corners
    │   │   ├── palette.js, cover.js        colour roles, high contrast, state colours
    │   │   │                   (design/colours); a cover's colour lifted for black
    │   │   ├── daypart.js, smartstack.js   hour → part from `daypart-starts`; `auto` by `relevance()`
    │   │   ├── weather.js, power.js, displays.js, audio.js, devices.js, bluetooth.js, drives.js,
    │   │   │   phone.js        plain state for those modules and the Device tab (design/device)
    │   │   └── mascot.js       Bu: 13 pose grids, lamp, frame timing (source: MASCOT.md)
    │   ├── services/   Shell side, no actors: buses, files, Shell objects, the one wall clock;
    │   │   │           imports model/ and services/, never ui/, St, Clutter
    │   │   ├── registry.js     app-id slugs, adapter resolution, app profiles
    │   │   ├── source.js       base class of a module's source.js
    │   │   ├── dbus.js         org.gnome.Shell.Extensions.Buoy
    │   │   ├── files.js        async reads: readText, listInfos/listNames, ppidOf, readPixels
    │   │   ├── apps.js         a bus peer's app: pid, /proc parents, window
    │   │   ├── presence.js     input in the last second, away (idle, locked), DND
    │   │   ├── idle.js         picks the idle plan; wall clock only while the idle pill shows
    │   │   ├── devtools.js     `dev-mode` hot swap
    │   │   └── sharing.js, weather.js, power.js, displays.js, audio.js, bluetooth.js,
    │   │       peripherals.js, drives.js, cameras.js, gsconnect.js   readers of GNOME's own
    │   │                       objects (Quick Settings, Gvc, Mutter, UPower, Gio, date menu)
    │   └── ui/         actors; imports anything in kit/, never a module
    │       ├── island.js       the pills together: capacity, slots, merge/split, grab, alert
    │       ├── pill.js         one pill: content, sizing, hover → compact, morph
    │       ├── spring.js       springs on the frame clock, one Clutter.Timeline per actor
    │       ├── strip.js        choices with a sliding fill (tab strip, Media chips)
    │       ├── home.js         what a click opens: tab strip + body
    │       ├── styles.js       a module's stylesheet.css while it runs
    │       └── present/        render plan → St actors, the ONLY place content actors are made:
    │                           parts.js, motion.js (rule 8), lists.js, flight.js, elements.js,
    │                           minimal.js, compact.js, expanded.js
    └── modules/<id>/   FEATURES, one self-contained folder each (files below)
```

Cover art (`present/elements.js`) is an St.Icon loaded async and rounded by a Shell.GLSLEffect,
not a CSS background-image, which St keeps in its texture cache.

| Module file | Role |
|---|---|
| `index.js` | `export default {id, kinds, source, adapter, tab?, title?, icon?, tabWhileLive?, tabInMore?, noTab?, badge?, home?, feed?}`. `title`, `icon`: its tab. `tabWhileLive`: the tab only while its activity is there, before the slot. `tabInMore`: the tab in ⋯; with `tabWhileLive`, live while its activity is (Phone). `noTab`: activities open on their own (greeting). `badge()`: a dot on the tab's icon. `home`: `{Card}` or `{Glance, order, wide}` |
| `source.js` | watches a facility, calls `stack.surface/update/end`; `enable(stack, registry, settings, {dbus, extension})`; its keys are `<id>-…` |
| `adapter.js` | default presentation for its kinds |
| `tab.js` | optional. `new Tab({close, from})` → `{actor, destroy(), update?(activities), choose?(id)}`. `from`: the opening pill's activity; `update`: a kind tab's activities, at once and on change; `choose`: its activity pressed on Home; `close()`: after an action that raises a window. Built on first selection, destroyed when expanded closes |
| `home.js` | optional (SPEC §3, design/home). `new Card({open, close})` → `{actor, show(activity, {height, form, width}), destroy()}` (media). `new Glance({open, close, changed, settings})` → `{ready, tile: {icon, value, caption, detail?}, wide?(width), activate(), refresh?(), destroy()}`, `changed()` when the tile changes (weather, calendar, battery). Made when Home first shows, destroyed when expanded closes |
| `idle.js` | optional idle plan, pure: `keys` (`idle-<id>-…`), `present(ctx, opts)` → presentation data (`compact` = the idle pill's hover tier), `seconds(opts)` (tick each second), `ticks: false` (no wall clock), `relevance(ctx, opts)` for `auto` (SPEC §2a-iii); `ctx = {now, clock, starts, data}` |
| `feed.js` | optional Shell side of an idle plan's data: index.js `feed`, `new Feed(onChanged)` → `{state, shown(shown, opts), destroy()}`, `state` = `ctx.data`. kit/services/idle.js makes it while its plan is in use and tells it when the idle pill shows, so it fetches only then (rule 8) |
| `stylesheet.css` | optional: its tab's and Home block's CSS (Stylesheets) |
| `apps/<slug>.js` | per-app overrides, same methods as `adapter.js` |

A module may add pure files worth testing alone (calendar's `agenda.js`, `month.js`; media's
`layout.js`) and a Shell-side reader its feed and tab share (calendar's `events.js`). What two
modules need is the kit's (rule 1), as weather moved there (2026-11-26, GREETING.md §8).

### Stylesheets

*2026-11-12.* `stylesheet.css` sections, in order: panel, pill and content, compact, card, Home
and tab strip. A module's own CSS (tab, Home block) is `lib/modules/<id>/stylesheet.css`, loaded
by `kit/ui/styles.js` while the module runs (rule 6: off, nothing of it is loaded), as Shell
loads an extension's (`ui/extensionSystem.js` `_loadExtensionStylesheet`, no `@import`); theme
reloads keep it (`ui/main.js` `loadTheme`).

- At equal specificity **`stylesheet.css` wins over a module's** (`st-theme.c`
  `st_theme_load_stylesheet` prepends, `_st_theme_get_matched_properties` sorts stably; Shell
  loads Buoy's first). A module rule restyling a kit class names its own container too
  (`.buoy-agents-line .buoy-agents-time` over `.buoy-label`).
- A module's classes are `buoy-<its words>-…`, used only by it; kit classes are styled only in
  `stylesheet.css`.

Colours: inside the island every colour is a `kit/model/palette.js` role (design/colours),
written as its value with the role in a comment (St has no CSS variables); the bar keeps
GNOME's. `tests/palette.test.js` fails on a non-role colour or a wrong role. High contrast
(`St.Settings` `high-contrast`) adds `buoy-hc` to the island; each stylesheet ends with
`.buoy-hc` rules raising `border`, `border-strong`, `fg-subtle`, `fg-disabled` wherever used
(tested), then any rule that must still win (`.buoy-media-on`, in the calendar).

### Module kinds

| Type | Has | Example |
|---|---|---|
| **source module** | `kinds`, `source.js`, `adapter.js`; optional `tab.js`, `apps/` | media, hud, progress, agent (asks via the kit's `ask`), copied |
| **idle plan** | `idle.js` (may also be a source module: calendar) | clock, weather, calendar, mascot |
| **standalone tab** | `tab.js` only, `kinds: []`; never surfaces activities | launcher; a feedback-only module's tab (`clipboard`, SPEC §2b) |

v0.1 modules: `media`, `hud`, `home`, `progress`, `copied` and `clipboard` (two switches,
2026-11-07, Ethan), `input`, `agent`; stubs `notification`, `timer` so their tabs show
(2026-11-02); idle plans `clock`, `weather`, `calendar`; standalone tabs `calendar`, then
`clipboard`; `greeting`: first run and What's new, the rest in M4 (2026-11-08).

## Outside the extension

*2026-11-08.*

- `install.sh` installs, updates, removes Buoy without EGO (release, zip or clone) and leaves
  `.check-updates`: only then does the greeting check GitHub for a release (GREETING.md §11).
  Removal uses the installed `hooks.js` and `lib/kit/settings.js`; both paths stay for every
  install.sh since 0.1.
- A tag `v<version-name>` publishes a release (`.github/workflows/release.yml`,
  `scripts/release-check.sh`, notes `docs/releases/<version-name>.md`). `tests/metadata.test.js`
  keeps the version name equal in metadata.json, notes.js, package.json and checks
  `settings-schema` (`enable()` throws without it).
- `README.md` is for users; `CONTRIBUTING.md` holds the repo tree, setup and release steps.

**The docs and their site** (2026-11-10, FEATURES M4 "Design docs and site"). `docs/` is
bilingual: `page.md` English, `page.vi.md` Vietnamese. Design pages are decided in Vietnamese
first; other docs keep English as source (translated 2026-11-27; a change to one updates the other in the same PR; FEATURES is
English only). `mkdocs.yml` builds
the site (MkDocs Material, mkdocs-static-i18n) only in CI (`.github/workflows/docs.yml` →
GitHub Pages; versions in `requirements-docs.txt`), never in the extension or `package.json`.

```
docs/design/
├── index.vi.md       units and rules for every part (em, 56 + 16n, concentric radii); index.md in English
├── tokens.vi.md      the one table of numbers: sizes, radii, gaps, type
├── render/lib.js     shared by render scripts: draws at 3×, fits text to its 1× width
└── <part>/           colours, pill, compact, alerts-and-asks, expanded, home, media, device, tabs,
    │                 icons, mascot, motion
    ├── index.vi.md   purpose, anatomy, sizes, states, decisions (date, who), open, code
    ├── images/       x.vi.png, x.en.png; mkdocs-static-i18n serves each as x.png
    ├── clips/        x.vi.png: motion as animated PNG, 30 fps (scripts/apng.js)
    └── render/       gjs scripts drawing the images; scripts/render-design.sh runs them all
```

Scripts and `render/` stay out of the site (`exclude_docs`).

## Data flow

```
source.js ──ev──► registry.build(kind, app, ev) ──activity──► stack ──► island/present
                      │
                      ├─ ~/.config/buoy/apps/<slug>.json   (user, data only)
                      ├─ modules/<m>/apps/<slug>.js[kind]   (repo, code)
                      └─ modules/<m>/adapter.js[kind]        (default)
D-Bus callers send presentation data: no adapter, but the app is slugged and the profile
applied (Registry.present). API: DBUS.md.
```

### App profiles

*2026-11-02.* `~/.config/buoy/apps/<app>.json`, data only (rule 7), applied by the registry for
every adapter and reloaded on change; adapters never see them. [PROFILES.md](PROFILES.md).

## Rules

1. **Modules import `kit/` only**, never another module; they talk through activities. In the
   kit, `model/` imports model/ and GLib only, `services/` never `ui/`, St or Clutter, nothing
   a module. `pnpm lint` checks (`eslint.config.js`, cases in `tests/boundaries.mjs`, 2026-11-12).
2. **`kit/` may import `Main`/Shell. `adapter.js` and `apps/*.js` may not**: no `St`, `Main`,
   timers; pure `event → presentation data`, testable with `gjs`. `source.js`, `tab.js` may use
   Shell APIs. `adapter.js`, `apps/*.js`, `idle.js`, `hooks.js` import only their module's files
   and `kit/model/`; prefs.js nothing needing the Shell (`kit/ui/`, `St`, `Main`, a module's
   source, tab, home, feed). Lint-checked with rule 1.
3. **Adapters return data, never actors**, in the shape `presentation.js` fixes: `{leading,
   text, trailing, expanded:{leading,trailing,center,bottom}, actions, ttl, priority, keyline,
   style, sizeHint, onPress, compact}` (`compact` = hover tier, SPEC §2); overrides too. Code
   names follow the tiers (2026-11-05): `shapes.minimal`/`planMinimal`/`buildMinimal` (pill in
   the bar), `planCompact`/`buildCompact` (hover), `shapes.side` (120 px side pills).
4. **Per-app overrides live under the module of the kind they override.** An app in two kinds
   has two small files; no central `apps/<app>/`.
5. **One slug per app** across sources (MPRIS bus name, desktop id, notification app name),
   from the table in `kit/services/registry.js`; modules see only the slug.
6. **Module off = not imported** (`modules-<id>` false): no signal, no actor, zero cost. Hiding
   an app (`apps-hidden`) is a stack filter, not an adapter concern.
7. **No code loaded at runtime** (EGO). User customisation is JSON profiles only (icon, title
   template, hide body, priority, ttl, simple regex); logic needs a PR. Also for EGO review: no
   sync file IO in the Shell (`kit/services/files.js` is async; St's stylesheet load excepted,
   as Shell does it); signals bound with `connectObject`/`disconnectObject`; the Extension
   object passed down from `extension.js`, never looked up by URL.
8. **No polling while closed; no blur; nothing animating while idle.** A source that must poll
   (progress position) polls only while its activity is visible. Animating = looping or
   continuous motion; a change of idle content (clock minute, `auto` switching) is one
   transition, then stillness (2026-11-03). Allowed, never with animations off:
   - Bu's eyes: a scripted beat every few seconds, a few stepped frames, only visible and in
     use; asleep after 60 s without input and in power-saver (`MASCOT.md` § Eyes, 2026-11-03).
   - Bu's moving poses: two frames every 500 ms while their pill is mapped; still after
     `mascot-rest-after` (60 s) without input (`MASCOT.md` § Drawing rules, 2026-11-04).
   - Media equaliser: mapped and playing only (paused: low still bars, `eq-paused`), one
     endless `scale-y` per bar; no rest without input, music plays untouched (2026-11-05, Ethan).
   - A title too long for a compact or the Media tab scrolls while mapped: one
     Clutter.Timeline, translation only (2026-11-05, Ethan).
9. Every setting is a `schemas/…gschema.xml` key with `<summary>` and `<description>` (prefs
   shows them; `<range>`/`<choices>` bound it). No preview key: a module's row has "Show a
   sample", sent via D-Bus `Surface`. A module's keys are `<id>-…` in its Modules row, **except
   idle plans'**: `idle-<plan>-…` sit under their plan on the **Island** page (2026-11-04,
   Ethan); a module that is only an idle plan (clock, weather) has its switch there and no
   Modules row (2026-11-06, Ethan). `kit/model/settings.js` gives each key one place and lists
   the idle plans, as prefs.js cannot import a module's index.js (2026-11-03); exception
   `modules/agent/hooks.js`, pure, for Claude Code's settings (2026-11-07).
   `tests/settings.test.js` fails on a key without place or text, or `idle-<plan>-…` elsewhere.
   A key lands with the item that implements it. Shell-level keys (clusters, corners) get their
   own pages; their code sits beside `panel.js`.
10. Standalone tabs (SPEC §2b, 2026-11-13): Calendar and Devices pinned by default
    (`tabs-pinned`); the slot shows the first other standalone tab (Clipboard) until another is
    chosen; ⋯ lists the unpinned ones, the slot's marked.
    Each builds its actor on first selection and destroys it when expanded closes; closed costs
    nothing.
11. **Adapters never return measurements**: no `width`, `height`, `x`, px or monitor queries,
    only content and discrete hints (`size: 'wide'`, region `priority`). `kit/model/shapes.js`
    derives sizes from the monitor; the renderer fits content (ellipsizes, drops low-priority
    regions). An adapter written on one screen works on every screen.

## Settings model

Planned keys are listed too; the schema holds landed ones. Every key applies at once (prefs or
`gsettings`); `modules-<id>` starts or stops only that module.

| Key | Type | Effect |
|---|---|---|
| `modules-<id>` | b | the module runs (its row's switch) |
| `apps-hidden` | as | apps whose activities never surface; any id, slugged (2026-11-02) |
| `apps-plain` | as | apps using the default adapter, not their override; any id, slugged |
| `idle-content` | s | `auto` (default) \| `none` \| an idle plan id |
| `idle-auto-plans` | as | plans `auto` shows, in turn; default `calendar`, `weather`, `clock`, `mascot` (Bu's eyes on by default, 2026-11-14) |
| `idle-auto-switch` | s | minutes per `auto` turn: `5m` (default), `10m`, `20m`, `30m` (2026-11-13, Ethan) |
| `daypart-starts` | ai | start hours of dawn, morning, noon, afternoon, evening, night; default `[5, 7, 11, 13, 18, 22]`, bad → default. Island → When Idle → Parts of the day: each part's colour icon and a drop-down of its start hours, never empty or out of order (2026-11-13) |
| `tabs-pinned` | as | standalone tabs shown fixed; default `['calendar', 'device']`; no prefs row |
| `tabs-slot` | s | slot tab, set from ⋯; empty = first enabled (2026-11-02) |
| `dev-mode` | b | exposes `stateObj.reload(id)` hot swap |
| `cluster-background` | s | never \| hover \| always; default `hover` (2026-11-04) |
| `cluster-radius`, `cluster-opacity` | i | its radius 0–16 px, default `16`; opacity 5–100 % of the panel foreground, default `17` |
| `cluster-contrast` | s | auto \| dark-text \| light-text (names the text); default `auto` |
| `left-cluster-empty` | s | workspace \| hidden |
| `clock-`, `dock-`, `weather-defaults-applied` | b | the first enable set, where unset: GNOME's clock (time alone, 24 h); Ubuntu Dock `dash-to-dock` (bottom, auto-hide, not edge to edge, 32 px, primary display, no trash or volumes) (2026-11-04); `org.gnome.GWeather4` `temperature-unit`, `speed-unit` °C, km/h (2026-11-06). Their prefs rows are those apps' own keys |
| `window-corners` | b | round top corners of windows touching the bar (maximized, tiled, moved up); default `true` (2026-11-04) |
| `window-corners-radius` | i | logical px, 0–32; default `15` (Adwaita `--window-radius`) |
| `idle-clock-style`, `idle-weather-refresh`, `idle-weather-automatic`, `idle-mascot-stroll` | — | by those modules: refresh `30m` \| `1h`, default `30m`; automatic default `true`: place from Geoclue, else the city in prefs (2026-11-06); stroll default `true`: Bu's eyes look around (2026-11-14) |
| `greeting-style`, `-farewell`, `-name`, `-birthday`, `-holidays`; bookkeeping `-intro-shown`, `-boot`, `-session`, `-asleep` | — | by `greeting` (GREETING.md §9) |
| `expanded-width` | i | logical px; `0` (default) = from the monitor. No height key: height fits content up to width/2, like iOS (2026-11-01) |
| `progress-folders` | as | download folders besides XDG Downloads, ≤ 10, non-recursive (SPEC §6c) |
| `keybind-focus` | as | take the keyboard: ring on the centre pill, ←/→, Enter, Esc; default Super+B (SPEC §2c) |
| `mascot-rest-after` | i | seconds without input before a moving Bu holds still, 10–600, default 60; the kit's; Island → Pill (2026-11-07) |
| `activity-linger` | s | `5m` \| `10m` \| `20m` \| `30m`, default `5m`: how long a `linger` activity (paused player, agent done or waiting) stays without news, and a permission prompt waits before Deny (SPEC §2, 2026-11-07, Ethan); Island → Pill |
| `notification-replace-banners` | — | by notification (NOTIFICATIONS.md §9): banners become pills, default `true`; off, GNOME's own (2026-11-07) |
| `agent-quiet-focused` | — | by agent (CODING-AGENTS.md §9): no jump open while the session's terminal is focused, default `true`. Hooks installed or not: `~/.claude/settings.json` |
| `privacy-dot` | — | by privacy (INDICATORS "Privacy dot", 2026-11-14): `pill` (default) the dot, GNOME's camera, microphone, remote-access icons and recording/sharing buttons hidden; `system` GNOME's only; `both` |
| per-module keys | — | declared by the module |

## Open for later

- Satellite extensions (`buoy-<module>@…`) over D-Bus once the contract is stable.
- Scheduled activities need persistence across Shell restarts.
