# D-Bus API

*Decided 2026-11-03.*

Scripts and apps that know Buoy send their own pill. They skip the adapters, not the user: the
app is slugged and the user's [profile](PROFILES.md) applies. Examples:
[`docs/examples/dbus/`](examples/dbus/).

| | |
|---|---|
| Bus | session |
| Destination | `org.gnome.Shell` (Buoy runs inside the Shell) |
| Object | `/org/gnome/Shell/Extensions/Buoy` |
| Interface | `org.gnome.Shell.Extensions.Buoy` |
| Version | property `Version` (u), now `3` (`Agent` 2, `needsYou` / `linger` 3; 2026-11-07); goes up when a method or key changes |

## Methods

| Method | Returns | |
|---|---|---|
| `Surface(a{sv} activity)` | `s id` | shows it, replacing an existing `id`; `''` when the user's profile skips it |
| `Update(s id, a{sv} patch, b alert)` | `b found` | changes the keys given (`state` replaced whole); `alert` expands it briefly |
| `End(s id)` | `b found` | removes it at once |
| `Schedule(a{sv} activity, x startAt)` | `s id` | shows it at `startAt` (ms since the epoch) with an alert |
| `Ask(s id, s question, as options, a{sv} opts)` | `s choice` | one button per option; replies when one is pressed, `opts.fallback` after `opts.timeoutMs`, `''` when ended or Buoy is disabled. `opts.app` names the asker |
| `Agent(s source, s event)` | `s reply` | a coding agent's hook event as JSON text (`source` `claude`, sent by Buoy's hook, [CODING-AGENTS.md](CODING-AGENTS.md)); `''` for a report, the hook's stdout for an answered permission prompt, `''` at once while the agent module is off. At most 256 KiB |

Signal `Action(s id, s action)`: a button of one of your activities was pressed. Watch with
`gdbus monitor` (`examples/dbus/actions.sh`).

Ids are yours (letters, digits, `. : _ -`, up to 64), kept apart from modules' ids. Omit `id` in
`Surface` to get one made up and returned.

## The activity (`a{sv}`)

[CONTRACT.md §1](CONTRACT.md) minus the callbacks. `kind` is required, the rest optional; an
unknown key is an error.

| Key | Type | |
|---|---|---|
| `id` | s | above |
| `kind` | s | `progress`, `media`, `deploy`… any name; `ask` is `Ask()`'s. Picks the tab (SPEC §2b) |
| `app` | s | any id the app goes by; slugged (`com.example.Deploy` → `deploy`) |
| `text` | s | the pill's text; ellipsized, never cut |
| `leading`, `trailing` | s or a{sv} | icon name, or `{'icon'}`, `{'art'}`, `{'progress': 0..1}`, `{'bar'}`, `{'countdown': s}`, `{'text'}`, `{'mascot': s}` (a Bu pose, leading only, MASCOT.md; unknown → `icon` if sent, else `idle`) |
| `expanded` | b or a{sv} | `true` = enlarged minimal; or regions `leading`, `center` (`{'title', 'subtitle', 'progress'}`), `trailing`, `bottom` (`{'transport': true}`) |
| `actions` | aa{sv} | `[{'id', 'label'?, 'icon'?}]`: 1 shown in minimal, 3 in compact and expanded; pressed → `Action` |
| `compact` | a{sv} | the hover tier (SPEC §2): `{'leading', 'text', 'trailing', 'transport'}` |
| `attributes`, `state` | a{sv} | your data; profiles read `attributes` like an event |
| `priority` | number 0–100 | inside its tier ([PRIORITY.md](PRIORITY.md)), across all apps; default by kind |
| `needsYou` | b | tier 1, over everything that only runs (Version 3) |
| `linger` | b | it only waits: ends after `activity-linger` without news; once stale, steps behind what runs (Version 3) |
| `ttl`, `staleAfter` | number, ms | ends after `ttl` (8 h at most); dims after `staleAfter` without an update |
| `style` | s | `standard` or `transient` (opens expanded, ends when closed) |
| `alert` | b | expand briefly when it appears |
| `keyline` | s | border tint, `#rrggbb` (state colours reserved: INDICATORS.md) |
| `sizeHint` | s | `normal` or `wide` |

Numbers may be any D-Bus number type. Sizes are never sent (ARCHITECTURE rule 11).

## Limits and errors

- At most 32 of your activities at once (`LimitsExceeded`), 16 KiB each.
- A wrong key or value is `org.freedesktop.DBus.Error.InvalidArgs` naming it: `unknown key
  "colour"`, `kind is required`, `priority: a number from 0 to 100`.
- Activities are not tied to your connection (a `gdbus call` exits at once): use `ttl` or `End`.

## Profiles

`Registry.present()` (PROFILES.md "How it combines"): `skip`, `hideBody`, `replace` work on your
`attributes`; `title` fills from them; `icon`, `priority`, `ttl` replace yours. Also through
`Update`: an update whose attributes match `skip` ends the activity. `apps-hidden` hides your
app like any other.

## From a shell

```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/Buoy \
  --method org.gnome.Shell.Extensions.Buoy.Surface \
  "{'id': <'deploy'>, 'kind': <'deploy'>, 'app': <'ci'>, 'text': <'Deploying'>,
    'leading': <{'progress': <0.3>}>, 'ttl': <600000>}"
```

`Ask` blocks until answered: give `gdbus` a `--timeout` longer than `timeoutMs`
(`examples/dbus/ask.sh`).
