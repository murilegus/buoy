# D-Bus API (decided 2026-11-03)

Scripts and apps that know Buoy send their own pill. They skip the adapters, but not the
user: the app is slugged and the user's [profile](PROFILES.md) still applies. Examples to
run: [`docs/examples/dbus/`](examples/dbus/).

| | |
|---|---|
| Bus | session |
| Destination | `org.gnome.Shell` (Buoy runs inside the Shell) |
| Object | `/org/gnome/Shell/Extensions/Buoy` |
| Interface | `org.gnome.Shell.Extensions.Buoy` |
| Version | property `Version` (u), now `1`; it goes up when a method or key changes |

## Methods

| Method | Returns | |
|---|---|---|
| `Surface(a{sv} activity)` | `s id` | shows it; an existing `id` is replaced. `''` when the user's profile skips it |
| `Update(s id, a{sv} patch, b alert)` | `b found` | changes the keys given (`state` is replaced whole); `alert` expands it briefly |
| `End(s id)` | `b found` | removes it at once |
| `Schedule(a{sv} activity, x startAt)` | `s id` | shows it at `startAt`, ms since the epoch, with an alert |
| `Ask(s id, s question, as options, a{sv} opts)` | `s choice` | a question with one button per option; replies when one is pressed, `opts.fallback` after `opts.timeoutMs`, `''` when it is ended or Buoy is disabled. `opts.app` names the asker |

Signal `Action(s id, s action)`: a button of one of your activities was pressed
(`actions` below). Watch it with `gdbus monitor` (`examples/dbus/actions.sh`).

Ids are yours (letters, digits, `. : _ -`, up to 64); Buoy keeps them apart from its
modules' ids. Omit `id` in `Surface` and one is made up and returned.

## The activity (`a{sv}`)

The presentation contract of [APPLE.md §B1](APPLE.md), minus the callbacks D-Bus cannot
carry. `kind` is required; everything else is optional. An unknown key is an error.

| Key | Type | |
|---|---|---|
| `id` | s | see above |
| `kind` | s | `progress`, `media`, `deploy`… any name; `ask` is `Ask()`'s. Picks the tab (SPEC §2b) |
| `app` | s | any id the app goes by; slugged (`com.example.Deploy` → `deploy`) |
| `text` | s | the pill's text; ellipsized, never cut by Buoy |
| `leading`, `trailing` | s or a{sv} | icon name, or `{'icon'}`, `{'art'}`, `{'progress': 0..1}`, `{'bar'}`, `{'countdown': s}`, `{'text'}`, `{'mascot': s}` (a Bu pose, leading only, MASCOT.md; drawn once M3 Bu lands, 2026-11-03) |
| `expanded` | b or a{sv} | `true` = enlarged compact; or regions `leading`, `center` (`{'title', 'subtitle', 'progress'}`), `trailing`, `bottom` (`{'transport': true}`) |
| `actions` | aa{sv} | `[{'id', 'label'?, 'icon'?}]`: 1 shown in compact, 3 in expanded; pressed → `Action` |
| `peek` | a{sv} | what hover shows: `{'leading', 'text', 'trailing', 'transport'}` |
| `attributes`, `state` | a{sv} | your data; profiles read `attributes` like an event |
| `priority` | number 0–100 | across all apps; default by kind (progress 30, notification 70 …) |
| `ttl`, `staleAfter` | number, ms | ends after `ttl` (8 h at most); dims after `staleAfter` without an update |
| `style` | s | `standard` or `transient` (opens expanded, ends when closed) |
| `alert` | b | expand briefly when it appears |
| `keyline` | s | border tint, `#rrggbb` (state colours are reserved: INDICATORS.md) |
| `sizeHint` | s | `normal` or `wide` |

Numbers can be sent as any D-Bus number type. Sizes are never sent: the pill fits its
content (ARCHITECTURE rule 11).

## Limits and errors

- At most 32 of your activities live at once (`LimitsExceeded`); at most 16 KiB each.
- A wrong key or value is `org.freedesktop.DBus.Error.InvalidArgs`, naming the key:
  `unknown key "colour"`, `kind is required`, `priority: a number from 0 to 100`.
- Activities are not tied to your connection: a `gdbus call` exits at once. Use `ttl`
  or `End`.

## Profiles

`Registry.present()` (PROFILES.md "How it combines"): `skip`, `hideBody` and `replace`
work on your `attributes`; `title` fills from them; `icon`, `priority`, `ttl` replace
yours. This holds through `Update` too; an update whose attributes match `skip` ends the
activity. `apps-hidden` hides your app like any other.

## From a shell

```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/Buoy \
  --method org.gnome.Shell.Extensions.Buoy.Surface \
  "{'id': <'deploy'>, 'kind': <'deploy'>, 'app': <'ci'>, 'text': <'Deploying'>,
    'leading': <{'progress': <0.3>}>, 'ttl': <600000>}"
```

`Ask` blocks until answered, so give `gdbus` a `--timeout` longer than `timeoutMs`
(`examples/dbus/ask.sh`).
