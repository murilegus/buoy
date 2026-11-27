# App profiles

*Decided 2026-11-02.*

A profile changes how one app shows in the pill, without code: one JSON file per app in
`~/.config/buoy/apps/`. It is yours: Buoy ships none; the project's per-app behaviour is code
in `modules/<m>/apps/<slug>.js` (ARCHITECTURE rule 4). Examples:
[`docs/examples/apps/`](examples/apps/).

## Where and when

- One file per app, named after it and slugged like every app id: `com.spotify.Client.json`,
  `Spotify.json` and `spotify.json` are the same app. Keep one; which of two wins is undefined.
- Read on enable and whenever a file in the folder changes (a file monitor: saving is enough).
  The folder may be a symlink.
- A file with a mistake is skipped whole, with one warning naming it:
  `journalctl -f -o cat /usr/bin/gnome-shell | grep 'app profile'`.

## Keys

All optional. An unknown key is an error, so a typo is reported, not ignored.

| Key | Type | Effect |
|---|---|---|
| `icon` | string | icon name; replaces the pill's left element |
| `title` | string | template for the pill's text over the event's fields: `"{artist} — {title}"`; an unknown field is empty |
| `hideBody` | boolean | the event's `body` never reaches the adapter (notification text) |
| `priority` | number 0–100 | replaces the kind's default inside the activity's tier: never lifts a waiting one over a running one ([PRIORITY.md](PRIORITY.md)) |
| `ttl` | number, ms | how long the activity lives; still capped at 8 h |
| `replace` | list | `{field, pattern, with, flags?}` regex replace on a string field, in order, before the adapter; `with` may use `$1` |
| `skip` | object | `{field, pattern, flags?}`: events whose field matches surface nothing |

`flags` may hold `i` (ignore case), `m` (multi-line), `s` (`.` matches newlines). Patterns are
JavaScript regular expressions in JSON strings (`\s` is `"\\s"`).

## Event fields

`title`, `replace` and `skip` work on the fields the source sends:

| Kind | Fields | From |
|---|---|---|
| `media` | `title`, `artist`, `art`, `status`, `length` | MPRIS (M3) |
| `notification` | `title`, `body`, … | Message tray (M4) |
| any, over D-Bus | the caller's `attributes` | [DBUS.md](DBUS.md) |

## How it combines

1. The profile's `skip`, then `hideBody` and `replace`, change the event.
2. The app's override (`modules/<m>/apps/<slug>.js`) builds the pill, or the module's default
   adapter when there is none or the app is in `apps-plain`.
3. The profile's `title`, `icon`, `priority`, `ttl` go on top.

A profile still applies in `apps-plain`; `apps-hidden` hides the app whatever its profile says.
D-Bus callers send their pill directly; their profile treats `attributes` as the event, through
updates too (2026-11-03, [DBUS.md](DBUS.md)).
