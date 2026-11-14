# Architecture

*Decided 2026-10-30.*

Organised **by module/feature** (option B). Alternatives considered: by layer (hard to add
or switch off a feature), by app (system sources don't belong to an app), satellite
extensions per module (later, once there is a community), data-only adapters (engine grows
into a language). B is what Isle and GSConnect do; contributors recognise it.

## Layout

```
src/buoy@murilegus/
├── metadata.json
├── stylesheet.css          the kit's and the panel's CSS, in sections (Stylesheets, below)
├── extension.js            enable(): panel → kit → load enabled modules
├── panel.js                top bar rework: left cluster (app/workspace), bare tray, system cluster (QS + clock)
├── wallpaper.js            the wallpaper Shell draws, decoded once per change, for cluster-contrast (2026-11-04)
├── glyphs.js               one-colour bitmap tray icons (Electron's white glyphs) tinted like the text (2026-11-04)
├── reach.js                the Overview's workspace backgrounds grow under the see-through bar, so closing it ends on the whole wallpaper (2026-11-04)
├── corners.js              rounded top corners on maximized windows (SPEC §1a, 2026-11-02)
├── prefs.js                Adw prefs: Island, Modules (one row per module, in groups: live in the pill,
│                           quick feedback, tabs, Bu — kit/model/settings.js MODULE_GROUPS, 2026-11-06), Apps, Panel (clusters,
│                           2026-11-04), Windows (corners, 2026-11-04), About (version, Bu,
│                           metadata `donations` as "Support Buoy", `dev-mode`)
├── schemas/                GSettings: the one source of every key, its summary and range
├── hooks/                  claude.js: Claude Code's hook (run by Claude Code, never by Buoy),
│                           installed from prefs; stdin → D-Bus `Agent` (CODING-AGENTS.md, 2026-11-07)
├── icons/
│   ├── color/              the daypart and weather colour SVGs (one family, scripts/icons.js is the
│   │                       source and draws docs/icons.png; 2026-11-06)
│   └── symbolic/           `<theme name>-symbolic.svg`: Gravity UI's drawings and Buoy's own, named
│                           as GNOME's theme names the icon, tinted by St with the text colour;
│                           written by scripts/symbolic-icons.js (design/icons, 2026-11-12)
└── lib/
    ├── kit/                FRAMEWORK — stable API; the only thing modules import. Three layers
    │   │                   (2026-11-12, FEATURES M4 "Restructure"); `eslint.config.js` checks who
    │   │                   imports what (rule 1, 2), `tests/boundaries.mjs` checks that check
    │   ├── settings.js     re-exports model/settings.js: the path 0.1's install.sh imports on
    │   │                   --uninstall (Outside the extension); keep it
    │   ├── model/          pure: no St, Clutter, Meta, Shell, Main, Gio, no files; GLib only (a
    │   │   │               timer, a variant). Imports model/ only. Unit-tested with plain gjs
    │   │   ├── activity.js     contract (CONTRACT.md §1), validate + normalise
    │   │   ├── stack.js        an injected clock: surface / update / end / schedule / ask; the pill order (PRIORITY.md);
    │   │   │                   ttl, stale, transient, alert; `apps-hidden` filter; missed history;
    │   │   │                   feedback over pill 1 (`pillWindow`), hover hold (2026-11-05)
    │   │   ├── presentation.js presentation data → render plan (2026-11-01)
    │   │   ├── shapes.js       the pill's sizes from the monitor and the em (rule 11)
    │   │   ├── home.js         Home's plan: the main card, the row of tiles and its fill rules (design/home, 2026-11-12)
    │   │   ├── motion.js       the springs and fades (design/motion), pure: the spring's closed form, settling (2026-11-13)
    │   │   ├── flight.js       shared parts in flight, pure: where a part takes off, its pose on the way (2026-11-13)
    │   │   ├── tabs.js         which tabs exist, where an open starts (2026-11-02)
    │   │   ├── keys.js         keyboard: an ask's keys, ←/→ steps (2026-11-03)
    │   │   ├── settings.js     prefs: which page each schema key goes to, samples (2026-11-03)
    │   │   ├── cluster.js      what the left cluster shows (app / workspace / hover) (2026-11-04)
    │   │   ├── contrast.js     wallpaper placement + luminance → dark or light text per side (2026-11-04)
    │   │   ├── cover.js        a cover's main colour, lifted to read on black: the equaliser's (2026-11-13)
    │   │   ├── rounded.js      which windows get round top corners, where the arcs fall, the shader (2026-11-04)
    │   │   ├── daypart.js      hour → dawn…night from `daypart-starts` (2026-11-03)
    │   │   ├── smartstack.js   idle `auto`: ranks plans by `relevance()` (2026-11-08)
    │   │   ├── palette.js      the colours by role, high contrast, the state colours (design/colours, 2026-11-12)
    │   │   ├── power.js        UPower's states, the power modes, "42 min": the power module and Home's battery tile (2026-11-14)
    │   │   └── mascot.js       Bu: 13 pose grids, lamp rule, frame timing; MASCOT.md is the source (2026-11-03)
    │   ├── services/       the Shell side without actors: buses, files, Shell's objects, the
    │   │   │               one wall clock. Imports model/ and services/, never ui/, St or Clutter
    │   │   ├── registry.js     app-id normalisation table; adapter resolution; app profiles
    │   │   ├── source.js       the base class of a module's source.js
    │   │   ├── dbus.js         org.gnome.Shell.Extensions.Buoy
    │   │   ├── files.js        small files read without blocking the Shell: readText, listInfos/listNames, ppidOf (EGO review, 2026-11-09); readPixels, a picture decoded small (2026-11-13)
    │   │   ├── apps.js         a bus peer's app: its pid, then /proc parents to a window (agent, media; 2026-11-07)
    │   │   ├── sharing.js      the screen shared or recorded, from Shell's indicators (agent, notification; 2026-11-07)
    │   │   ├── power.js        GNOME's battery and power-mode toggles in Quick Settings; switching the mode, silently from Home (2026-11-14)
    │   │   ├── presence.js     you at the screen: input in the last second, away (session idle, locked), DND (alerts; 2026-11-12)
    │   │   ├── idle.js         idle-content: picks the plan, its wall clock only while the idle pill shows (2026-11-04)
    │   │   └── devtools.js     `dev-mode`'s module hot swap
    │   └── ui/             actors. Imports anything in kit/, never a module
    │       ├── island.js       the pills together: capacity, slots, merge/split, grab, alert
    │       ├── pill.js         one pill: content, sizing, hover → compact, morph (2026-11-01; tier names 2026-11-05)
    │       ├── spring.js       springs on the frame clock: one Clutter.Timeline per actor, stopped once settled (2026-11-13)
    │       ├── strip.js        a row of choices whose chosen fill slides to the next: the tab strip, the Media tab's chips (2026-11-13)
    │       ├── home.js         the panel a click opens: tab strip + tab body (Home: the main card
    │       │                   and the row of tiles, design/home 2026-11-12; kind, standalone)
    │       ├── styles.js       a module's stylesheet.css, loaded while it runs (Stylesheets, below)
    │       └── present/        render plan → St actors. The ONLY place content actors are made,
    │           │               one file per tier (2026-11-12; was present.js)
    │           ├── parts.js        labels, meters (ring, bar, level, live position), timed labels,
    │           │                   tick(), FillBox, progressBar()
    │           ├── motion.js       what moves, each by rule 8: the marquee, Bu and his stillness,
    │           │                   the equaliser, typed text; dimStale()
    │           ├── flight.js       shared parts: markShared() on the leading and the title, Flights
    │           │                   flies their clones between forms (pill, Home) (2026-11-13)
    │           ├── elements.js     one element of presentation data as an actor (cover art: St.Icon,
    │           │                   loaded async, rounded by a Shell.GLSLEffect — not a CSS
    │           │                   background-image, which St keeps in its texture cache), action
    │           │                   buttons and their keys, the light, EmptyState
    │           ├── minimal.js      the pill in the bar and the idle pill
    │           ├── compact.js      the hover tier: the compact, the card, Missed's
    │           └── expanded.js     the expanded view
    └── modules/            FEATURES — one self-contained folder each
        └── <id>/
            ├── index.js    export default {id, kinds, source, adapter, tab?,
            │               title?, icon?, tabWhileLive?, tabInMore?, noTab?, badge?}
            │               title/icon: its tab in the strip; tabWhileLive: that tab only
            │               while one of its activities is there, before the slot
            │               (2026-11-07, -13); tabInMore: its tab in ⋯ like a standalone
            │               one (2026-11-13); noTab: never a tab, its
            │               activities open on their own (the greeting, 2026-11-08); badge():
            │               a dot on its tab's icon (2026-11-08); home: {Card} or {Glance,
            │               order, wide} — its part of Home (below, 2026-11-12)
            ├── source.js   watches a system facility, calls stack.surface/update/end;
            │               `enable(stack, registry, settings, {dbus, extension})` (settings: its `<id>-…`
            │               keys, 2026-11-05)
            ├── adapter.js  default presentation for this module's kinds
            ├── tab.js      content for its tab in expanded (optional): export a class,
            │               `new Tab({close, from})` → {actor, destroy(), update?(activities)} (`from`: the activity whose pill opened it, 2026-11-07); optional `choose(id)`: one of its activities was pressed on Home, show that one (2026-11-13); a kind
            │               tab's `update` gets its kind's activities at once and on each
            │               change (2026-11-05); built on first selection, destroyed when
            │               expanded closes; `close()` closes the island after an action
            │               that brings a window up (2026-11-06)
            ├── home.js     its part of Home (optional, SPEC §3, design/home, 2026-11-12):
            │               a Card for its kinds' activity on the main card (media), `new
            │               Card({open, close})` → {actor, show(activity, {height, form,
            │               width}), destroy()}; or a Glance tile (weather, calendar, home's
            │               battery), `new Glance({open, close, changed, settings})` →
            │               {ready, tile: {icon, value, caption, detail?}, wide?(width),
            │               activate(), refresh?(), destroy()}; made the first time Home
            │               shows, kept for the open, destroyed when expanded closes;
            │               `changed()` when its tile changes
            ├── idle.js     idle plan for `idle-content` (optional; clock, weather, calendar);
            │               pure: `keys` (its idle-<id>-… keys), `present(ctx, opts)` →
            │               presentation data (its `compact` is the idle pill's hover tier,
            │               2026-11-06), `seconds(opts)` (tick each second), `ticks: false`
            │               (no wall clock), `relevance(ctx, opts)` for `auto` (SPEC §2a-iii);
            │               ctx = {now, clock, starts, data}
            ├── feed.js     the Shell side of an idle plan with data of its own (optional;
            │               weather 2026-11-06, calendar 2026-11-08): index.js `feed`, `new Feed(onChanged)` →
            │               {state, shown(shown, opts), destroy()}; `state` is the plan's
            │               `ctx.data`. Made by kit/services/idle.js while its plan is the one in use,
            │               told when the idle pill shows so it fetches only then (rule 8)
            ├── stylesheet.css  its own CSS: its tab's and its Home block's (optional;
            │               Stylesheets, below)
            └── apps/       per-app overrides, <slug>.js, same method names as adapter.js
```

A module may keep more pure files beside these when they are worth testing alone
(weather's `read.js`: GWeather.Info → the plan's state, tested with a fake info; calendar's
`agenda.js` and `month.js`: which event is next, its words, the tab's days and month; media's
`layout.js`: the Media tab's card, art, controls and chips, 2026-11-13) and a
Shell-side reader its feed and tab share (calendar's `events.js`: the date menu's event
source, 2026-11-08).

### Stylesheets

*2026-11-12, FEATURES M4 "Restructure".* `stylesheet.css` holds the panel's and the kit's
CSS in sections, in this order: the panel, the pill and its content, compact, the card, Home
and the tab strip. A module's own CSS (its tab, its Home block) is
`lib/modules/<id>/stylesheet.css`; `kit/ui/styles.js` loads it when the module starts and
unloads it when it stops (rule 6: off, nothing of it is loaded), as Shell loads an
extension's (`ui/extensionSystem.js` `_loadExtensionStylesheet`: `St.Theme.load_stylesheet`,
no `@import`). Shell's theme reload carries them over (`ui/main.js` `loadTheme`). Two rules
follow from St:

- At equal specificity **`stylesheet.css` wins over a module's**: St matches the stylesheets
  loaded last first, and a later match wins (`st-theme.c` `st_theme_load_stylesheet` prepends,
  `_st_theme_get_matched_properties` sorts stably by specificity); Shell loads Buoy's before
  `enable()`. A module rule that restyles a kit class names its own container too
  (`.buoy-agents-line .buoy-agents-time` over `.buoy-label`).
- A module's selectors are its own: classes named `buoy-<its words>-…`, used only by its
  files; the kit's classes are styled only in `stylesheet.css`.

Colours (2026-11-12, FEATURES M4 "Colours by role"): inside the island every colour is a role
of `kit/model/palette.js` (design/colours), written as its value with the role in a comment,
since St reads no CSS variables; the bar keeps GNOME's. `tests/palette.test.js` reads every
stylesheet and fails on a colour that is not a role or names the wrong one. GNOME's high
contrast (`St.Settings` `high-contrast`) puts `buoy-hc` on the island; each stylesheet ends
with a block of `.buoy-hc …` rules raising `border`, `border-strong`, `fg-subtle` and
`fg-disabled`, one for every rule that uses them (the test checks), and repeating after them
any rule that must still win (`.buoy-media-on`, today in the calendar).

### Module kinds

| Type | Has | Example |
|---|---|---|
| **source module** | `kinds` + `source.js` + `adapter.js`, optionally `tab.js`, `apps/` | media, hud, progress, agent (Claude Code: kind `agent`, its asks through the kit's `ask`), copied (feedback `copied`) |
| **idle plan** | `idle.js` (optionally also a source module) | clock, weather, calendar, mascot |
| **standalone tab** | `tab.js` only, `kinds: []` | launcher; also the tab of a feedback-only module (`clipboard`, SPEC §2b) |

One module may combine the first two (calendar: next-event activity + idle plan + tab).
A standalone tab never surfaces activities; if it needs to, it becomes a source module.

v0.1 modules: `media`, `hud`, `home`, `progress`, `copied` (the copied flash) and `clipboard` (the Clipboard tab; one module 2026-11-05, apart again 2026-11-07, Ethan: two switches), `input` (the input source as feedback; was `layout`, renamed 2026-11-05: it covers IBus input methods, not only keyboard layouts), `agent` (Claude Code's sessions and permission prompts; was the stub `ask`, 2026-11-07); `notification`,
`timer` is imported as a stub without a source until its roadmap item, so its tab shows
from v0.1 (2026-11-02);
idle plans `clock`, `weather`, `calendar` (next event, 2026-11-08); standalone tabs `calendar` (the month and the picked day's events, 2026-11-08), `clipboard` (stub `tab.js`, in that order, 2026-11-02). `greeting`: its first run and What's new in v0.1, the rest in M4 (2026-11-08).

## Outside the extension

*2026-11-08.*

`install.sh` (repo root) installs, updates and removes Buoy for one user without EGO, from
a GitHub release, a zip or a clone, and leaves its mark in the folder (`.check-updates`: only
then does the greeting ask GitHub for a newer release, GREETING.md §11, 2026-11-13); it
uses the installed extension's own `hooks.js` and
`lib/kit/settings.js` (pure) on removal. Both paths stay: the install.sh of 0.1 and later
imports them from whatever version is installed (since 2026-11-12 `lib/kit/settings.js`
re-exports `kit/model/settings.js`). A tag `v<version-name>` publishes a release
(`.github/workflows/release.yml`, `scripts/release-check.sh`) with
`docs/releases/<version-name>.md` as its notes; `tests/metadata.test.js` keeps the version's
name the same in metadata.json, notes.js and package.json, and checks that metadata's
`settings-schema` names the schema (`enable()` throws without it).
`README.md` is for people who use Buoy (install, settings, privacy, limits);
`CONTRIBUTING.md` holds the repository tree, the setup and the release steps (2026-11-08).

**The docs and their site** (2026-11-10, FEATURES M4 "Design docs and site"). `docs/` is
bilingual: `page.md` in English and `page.vi.md` in Vietnamese side by side; a design page is
written and decided in Vietnamese first, the other docs keep English as their source (they are
not translated yet: Ethan wants them made shorter first). `mkdocs.yml` (repo root) builds the
site with MkDocs Material and mkdocs-static-i18n — only in CI (`.github/workflows/docs.yml` →
GitHub Pages; versions in `requirements-docs.txt`, beside `mkdocs.yml`), never part of the extension or of
`package.json`. The design lives in `docs/design/`:

```
docs/design/
├── index.vi.md         the units and rules every part follows (em, 56 + 16n, concentric radii)
├── tokens.vi.md        the one table of numbers: sizes, radii, gaps, type
├── render/lib.js       shared by the render scripts: draws at 3×, fits text to its 1× width
└── <part>/             colours (the palette the CSS draws from), pill, compact,
                        alerts-and-asks, expanded, tabs, icons, mascot
    ├── index.vi.md     purpose, anatomy, sizes, states, decisions (date, who), open, code
    ├── images/         x.vi.png (labels in Vietnamese), x.en.png (English, with the translation);
    │                   each page links its own (mkdocs-static-i18n serves both as x.png)
    ├── clips/          x.vi.png, motion as an animated PNG (30 fps, design/motion, 2026-11-12): an
    │                   image, so GitHub and the site both play it; scripts/apng.py makes it
    └── render/         the gjs scripts that draw those images
```

`scripts/render-design.sh` redraws every image. The render scripts and `render/` folders are
left out of the site (`exclude_docs`).

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

### App profiles

*2026-11-02.*

`~/.config/buoy/apps/<app>.json`: per-user, data only (rule 7): icon, title template,
hideBody, priority, ttl, regex replace/skip. The registry applies them for every adapter
and reloads them when a file changes; adapters never handle these keys. Format, event
fields and order: [PROFILES.md](PROFILES.md).

## Rules

1. **Modules import `kit/` only.** Never another module. Modules talk through activities.
   Inside the kit, `model/` imports model/ and GLib only, `services/` never imports `ui/`,
   St or Clutter, and nothing in the kit imports a module. `pnpm lint` checks these
   (`eslint.config.js`, `no-restricted-imports`; its cases in `tests/boundaries.mjs`,
   2026-11-12).
2. **`kit/` may import `Main`/Shell. `adapter.js` and `apps/*.js` may not** — no `St`, no
   `Main`, no timers. They are pure functions `event → presentation data`, testable with `gjs`.
   `source.js` and `tab.js` may use Shell APIs. So `adapter.js`, `apps/*.js`, `idle.js` and
   `hooks.js` import only their own module's files and `kit/model/`, and prefs.js nothing
   that needs the Shell (`kit/ui/`, `St`, `Main`, a module's source, tab, home or feed),
   checked by `pnpm lint` as rule 1 (2026-11-12).
3. **Adapters return data, never actors.** Shape of the data is fixed by `presentation.js`:
   `{leading, text, trailing, expanded:{leading,trailing,center,bottom}, actions, ttl,
   priority, keyline, style, sizeHint, onPress, compact}` (`compact` = the hover tier, was
   `peek` until 2026-11-05; SPEC §2). An override returns the same shape. Names in code
   follow the tiers: `shapes.minimal` / `planMinimal` / `buildMinimal` for the pill in the
   bar, `planCompact` / `buildCompact` for the hover tier, `shapes.side` for the 120 px side
   pills (2026-11-05).
4. **Per-app overrides live under the module of the kind they override.** An app present
   in two kinds has two small files. No central `apps/<app>/` folder.
5. **One slug per app** across every source (MPRIS bus name, desktop id, notification
   app name) — the table lives in `kit/services/registry.js`; modules only see the slug.
6. **Module off = not imported** (`modules-<id>` false): no signal connected, no actor
   created, zero cost. Hiding an app (`apps-hidden`) is a stack filter, not an adapter concern.
7. **No code loaded at runtime** (EGO rule). User customisation is JSON profiles only:
   icon, title template, hide body, priority, ttl, simple regex. Logic needs a PR. Also for
   EGO review: no synchronous file IO in the Shell process (`kit/services/files.js` reads
   async; the one exception is St's own stylesheet load, as Shell does it);
   signals tied to their owner with `connectObject` / `disconnectObject`; the Extension object
   is passed down from `extension.js`, never looked up by URL.
8. **No polling while closed; no blur; nothing animating while idle.** A source that must
   poll (progress bar position) polls only while its activity is visible. "Animating"
   means looping or continuous motion: a change of idle content (clock minute, `auto`
   switching plans) is one transition, then stillness (clarified 2026-11-03). Bu's eyes
   stroll by the same rule: a scripted beat every few seconds, each a few single frames
   (stepped, never eased), only while visible and in use; asleep and still after 60 s
   without input, in power-saver and with animations off (`MASCOT.md` § Eyes, 2026-11-03).
   Bu's moving poses are not idle content: they swap two frames every 500 ms only while
   their activity's pill is mapped, and hold still after `mascot-rest-after` (60 s)
   without input and with animations off (`MASCOT.md` § Drawing rules, 2026-11-04).
   The media equaliser moves only while it is mapped and playing (paused, its bars stand
   low and still: the `eq-paused` glyph, 2026-11-07), one
   endless `scale-y` transition per bar, none unmapped or with animations off; it does
   not rest without input, since music plays untouched (2026-11-05, Ethan). So does a
   compact or Media-tab title too long for its width: it scrolls only while it is mapped
   and animations are on, one Clutter.Timeline, translation only (2026-11-05, Ethan).
9. Every setting is a key in `schemas/…gschema.xml` with a `<summary>` and a
   `<description>` (prefs shows them; `<range>`/`<choices>` bound the control). No preview
   key: a module's row has "Show a sample", sent through D-Bus `Surface` like any script. A module's
   own keys are named `<id>-…` and appear inside its row on the Modules page, **except an
   idle plan's**: keys named `idle-<plan>-…` appear on the **Island** page under their
   plan, so what the idle pill shows and how is set in one place (2026-11-04, Ethan). A
   module that is only an idle plan (clock, weather) has its switch on its plan's row there too and
   no row on Modules (2026-11-06, Ethan; was a switch-only row on Modules); a module that
   is more than its plan keeps its row on Modules. Each key has exactly one place: `kit/model/settings.js` places the rest
   and lists the idle plans (prefs cannot import a module, below), and
   `tests/settings.test.js` fails on a key with no place or no text, or an `idle-<plan>-…`
   key anywhere but under its plan. A key enters the schema with the item that implements it, so prefs
   has no switch without an effect. (Changed 2026-11-03 from `index.js#schema`: prefs.js
   runs in its own process and cannot import a module's index.js, which pulls in Shell
   code. One exception, 2026-11-07: `modules/agent/hooks.js`, pure and importing nothing,
   which prefs uses to add and remove Buoy's entries in Claude Code's settings.) Shell-level keys that belong to no module (panel clusters, window corners) get
   their own prefs pages; their code lives next to `panel.js`, not under `modules/`.
10. Standalone tabs are on but not pinned by default (SPEC §2b, 2026-11-02; was "off by
    default"): the strip's slot shows Calendar until another is chosen, and ⋯ lists Calendar
    (marked, in the slot) then Clipboard. Each builds its actor on first selection and
    destroys it when expanded closes; closed costs nothing however many are enabled.
11. **Adapters never return measurements.** No `width`, `height`, `x`, px, or monitor
    queries — only content plus discrete hints (`size: 'wide'`, region `priority`). Sizes
    are derived in `kit/model/shapes.js` from the monitor; the renderer fits content (ellipsize
    text, drop low-priority regions). An adapter written on one screen behaves on every screen.

## Settings model

Planned keys are listed here too; the schema holds only the ones whose item has landed
(2026-11-04: `modules-*`, `apps-hidden`, `apps-plain`, `tabs-pinned`, `tabs-slot`,
`expanded-width`, `dev-mode`, `keybind-focus`, `cluster-background`, `cluster-radius`,
`cluster-opacity`, `cluster-contrast`, `left-cluster-empty`, `clock-defaults-applied`, `dock-defaults-applied`, `window-corners`, `window-corners-radius`, `mascot-rest-after`, `daypart-starts`, `modules-clock`, `idle-content`, `idle-clock-style`). Every key applies at once — prefs and
`gsettings` alike; `modules-<id>` starts or stops only that module.

| Key | Type | Effect |
|---|---|---|
| `modules-<id>` | b | the module runs or not; applies at once (prefs: its row's switch) |
| `apps-hidden` | as | apps whose activities never surface; any app id, slugged (2026-11-02) |
| `apps-plain` | as | apps that use the default adapter instead of their override; any app id, slugged |
| `idle-content` | s | `auto` (default) \| `none` \| any module's idle plan id |
| `idle-auto-plans` | as | plans `auto` may show, in the order they take turns; default `calendar`, `weather`, `clock`, `mascot` (Bu's eyes on by default, 2026-11-14) |
| `idle-auto-switch` | s | minutes per turn of `auto` while idle: `5m` (default), `10m`, `20m`, `30m` (2026-11-13, Ethan; was `idle-auto-interval`, 2–30) |
| `daypart-starts` | ai | start hours of dawn, morning, noon, afternoon, evening, night; default `[5, 7, 11, 13, 18, 22]`; bad values → defaults. In the schema since M3 daypart; on the Island page, When Idle → Parts of the day: each part's colour icon and a drop-down of the hours it may start at, so none is empty or out of order (2026-11-13) |
| `tabs-pinned` | as | standalone tab ids shown as fixed tabs (settings only; `['calendar', 'device']` by default) |
| `tabs-slot` | s | standalone tab in the slot, set from ⋯; empty = the first enabled one (2026-11-02) |
| `dev-mode` | b | exposes `stateObj.reload(id)` module hot swap |
| `cluster-background` | s | never \| hover \| always; default `hover` (2026-11-04) |
| `cluster-radius` | i | that background's corner radius, 0–16 px; default `16` |
| `cluster-opacity` | i | that background's opacity, 5–100 %, in the panel foreground colour like a panel button's hover; default `17` (2026-11-04) |
| `cluster-contrast` | s | auto \| dark-text \| light-text; default `auto` (2026-11-04: values name the text, not GNOME's light/dark) |
| `left-cluster-empty` | s | workspace \| hidden |
| `clock-defaults-applied` | b | bookkeeping: the first enable gave GNOME's clock keys Buoy's defaults (time alone, 24 h) where the user had not set them; the clock switches in prefs are GNOME's own keys (2026-11-04) |
| `dock-defaults-applied` | b | bookkeeping: the first enable gave Ubuntu Dock's keys (`dash-to-dock`) Buoy's defaults — bottom, auto-hide, not edge to edge, 32 px, primary display, no trash or volumes — where the user had not set them; the Dock rows in prefs are the dock's own keys (2026-11-04) |
| `weather-defaults-applied` | b | bookkeeping: the first enable gave GNOME Weather's units (`org.gnome.GWeather4` `temperature-unit`, `speed-unit`) °C and km/h where the user had not chosen them; the Weather plan's unit rows in prefs are those keys (2026-11-06) |
| `window-corners` | b | round the top corners of windows whose top edge meets the bar (maximized, tiled, moved up); default `true` (2026-11-02; top edge 2026-11-04) |
| `window-corners-radius` | i | that radius in logical px, 0–32; default `15` (Adwaita `--window-radius`) |
| `idle-clock-style`, `idle-weather-refresh`, `idle-mascot-stroll` | — | declared by those modules (`idle-weather-refresh`: `30m` \| `1h`, default `30m`; `idle-weather-automatic` b, default `true`: the place from Geoclue, else the city picked in prefs, 2026-11-06; `idle-mascot-stroll` b, default `true`: Bu's eyes look around, 2026-11-14) |
| `greeting-style`, `greeting-farewell`, `greeting-name`, `greeting-birthday`, `greeting-holidays`; bookkeeping `greeting-intro-shown`, `greeting-boot`, `greeting-session`, `greeting-asleep` | — | declared by `greeting` (GREETING.md §9; `greeting-last-day` dropped 2026-11-06) |
| `expanded-width` | i | expanded width, logical px; `0` (default) = derived from the monitor. No height key: like iOS, height fits content up to width/2 (changed from `expanded-size (ii)` 2026-11-01) |
| `progress-folders` | as | folders watched for downloads besides the XDG Downloads dir, at most 10, non-recursive (SPEC §6c, 2026-11-03; M3 and renamed from `transfers-folders` 2026-11-06, rule 9) |
| `keybind-focus` | as | take the keyboard: ring on the centre pill, ←/→, Enter, Esc (default Super+B, SPEC §2c) |
| `mascot-rest-after` | i | seconds without input before a moving Bu holds still, 10–600, default 60 (MASCOT.md, 2026-11-04); the kit's, as Bu is. On the Island page's Pill group since Claude Code's sessions draw Bu (2026-11-07; hidden before: nothing drew Bu, 2026-11-06, Ethan) |
| `activity-linger` | s | `5m` \| `10m` \| `20m` \| `30m`, default `5m`: how long an activity that only waits (`linger`: a paused player, an agent done or waiting for you) stays without news, and how long a permission prompt waits before Deny (SPEC §2, 2026-11-07, Ethan; replaces `media-hide-paused-after` and `agent-ask-timeout`); Island page, Pill group |
| `notification-replace-banners` | — | declared by the notification module (NOTIFICATIONS.md §9): GNOME's banners become pills, default `true`; off, GNOME shows its own (2026-11-07) |
| `agent-quiet-focused` | — | declared by the agent module (CODING-AGENTS.md §9): no jump open while the session's terminal is focused, default `true`. Whether Claude Code's hooks are installed lives in `~/.claude/settings.json`, not in a key |
| `privacy-dot` | — | declared by the privacy module (INDICATORS "Privacy dot", 2026-11-14): `pill` (default) the dot and GNOME's camera, microphone, remote-access icons and recording/sharing buttons hidden; `system` GNOME's alone, no dot; `both` |
| per-module keys | — | declared by the module |

## Open for later

- Satellite extensions (`buoy-<module>@…`) over D-Bus once the contract is stable.
- Scheduled activities need persistence across Shell restarts.
