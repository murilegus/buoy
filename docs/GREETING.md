# Greeting — Bu says hello, welcome back and see you soon

The reference for every moment Buoy speaks on its own: when it does, what it says, how
big, for how long, and which pose Bu takes. SPEC §2d points here; a new moment, line or
holiday needs a change here first. Decided with Ethan, 2026-11-06 (replaces the
once-a-day greeting of 2026-11-03).

## Principles

1. **Moments, not days.** Buoy greets on an event (the machine starts, wakes from a long
   sleep, a new login, the session ends), every time it happens. There is no
   once-a-day rule and no `greeting-last-day`.
2. **Short and useful.** A greeting says one friendly thing and at most two useful ones
   (the time and date, the weather or an umbrella). It never asks for anything.
3. **The right size.** One short line → minimal. Two ideas → compact (title + subtitle).
   Never a long minimal: a line that would not fit pill 1 at rest moves to compact.
   Expanded only for a fresh start (§2).
4. **Out of the way.** Not over a fullscreen window, never takes the keyboard, any real
   activity interrupts it, a click outside closes it. It is a transient activity like any
   other (SPEC §2, APPLE.md A3).
5. **Bu is the face.** Every greeting leads with Bu (`MASCOT.md`); the pose follows the
   moment (§6). No other icon competes with him.
6. **Words in one place.** Every string is in `modules/greeting/adapter.js`, English first;
   Vietnamese and other languages come with gettext (M5 localisation). The adapter is
   pure: it builds every line from plain facts the source hands it.

## 1. Moments

| Moment | Detected by | Size | Stays |
|---|---|---|---|
| **Start** — the machine was off or rebooted | `/proc/sys/kernel/random/boot_id` differs from `greeting-boot` | expanded (§2) | ~8 s, held while hovered; Bu waves 5 s |
| **Wake** — back from a sleep or hibernation of 3 h or more | time asleep since the last disable ≥ 3 h (below) | expanded (§2) | as Start |
| **Welcome back** — a new login, same boot (after a log out) | the logind session differs from `greeting-session`, same boot | minimal, or compact with a note (§4) | 4 s, held while hovered |
| **Leaving** — shut down, restart or log out from Shell's dialog | `Main.endSessionDialog` `_confirm(signal)` (below) | minimal, or compact with a note (§5) | until the session ends (~1.5 s) |
| A lock, a short sleep, the extension turned off and on | — | nothing | — |
| A fullscreen window has focus at that moment | `global.display.focus_window.is_fullscreen()` | nothing (no retry later) | — |
| Any moment with `greeting-style = off` | — | nothing; Leaving follows `greeting-farewell` | — |

How the moments are told apart (all read at `enable`, nothing polled):

- **Boot.** `boot_id` is new on every boot (kernel, `random/boot_id`), unlike the boot
  time, which a hibernation resume keeps. Stored in `greeting-boot` once a Start shows.
- **Session.** The logind session of this Shell (`misc/loginManager.js`
  `getCurrentSessionProxy`, its `Id`; `XDG_SESSION_ID` as fallback). A log out and in on
  the same boot gives a new one → Welcome back. Stored in `greeting-session`.
- **Sleep.** Shell disables extensions on lock and enables them on unlock (Buoy has no
  `session-modes`, `ui/extensionSystem.js`), and suspend locks first. The time the machine
  spent asleep since boot is `CLOCK_BOOTTIME − CLOCK_MONOTONIC` (`/proc/uptime` minus
  `GLib.get_monotonic_time()`): both tick while awake, only the first while suspended or
  hibernated. `disable` stores it (`greeting-asleep`, s); `enable` compares. Suspend and
  hibernate cannot be told apart (logind's `PrepareForSleep` does not say which) and do
  not need to be: a long sleep is a fresh start either way. Threshold 3 h, fixed.
- **Leaving.** `Main.endSessionDialog` (`ui/endSessionDialog.js`): a confirm button closes
  the dialog first, then calls `_confirm(signal)` (`ConfirmedLogout`, `ConfirmedShutdown`,
  `ConfirmedReboot`; `_type` tells a restart for updates). Buoy wraps `_confirm` with the
  extension's InjectionManager, shows the line, and lets the original run unchanged — the
  session does not wait for Buoy. Best effort: a power button without the dialog,
  `systemctl poweroff` or a crash says nothing.
- **First install.** `greeting-intro-shown` false → the next Start or Wake is the intro
  (§3, priority 1); set once it showed.

## 2. Start and Wake: the expanded hello

```
┌──────────────────────────────────────────────────────────────────┐
│        Good morning, Ethan.                                      │
│ [Bu]   It's 07:42 on Friday, 6 November 2026.                    │
│        ☁ Ho Chi Minh City: 28 °C, partly cloudy, light breeze.   │
└──────────────────────────────────────────────────────────────────┘
 leading   center (grows)
```

- **Layout.** The expanded presentation's own regions (APPLE.md B2): Bu in `leading`, the
  three lines in `center`, which takes all the width left (`grow: 'center'`, the default);
  no `trailing`. Bu is as tall as the text block — 80 px for three lines, 60 px for two
  (a multiple of his 10 cells, MASCOT.md: whole pixels) — and centred with it. Ethan,
  2026-11-07: Bu on the left and more room for the words; no fixed column ratio. Expanded
  width as any activity (SPEC §4); height fits the text.
- **Line 1 — the greeting**, large (the expanded title, larger than other titles). Chosen
  by §3.
- **Line 2 — when**: "It's 07:42 on Friday, 6 November 2026." The time in GNOME's format
  (`clock-format`, 12/24 h), the date in the locale's long form. On an observance (§7) it
  becomes "It's 07:42 on Friday, 6 November 2026. Today is Teachers' Day." — or, when too
  long for one line, the observance moves to line 3 and the weather drops.
- **Line 3 — the weather** (§8): "Ho Chi Minh City: 28 °C, partly cloudy, light breeze.",
  with the condition's colour icon before it. Or the umbrella line. No weather yet → the
  line is left out (Bu shrinks to 60 px) and filled in place if it arrives while open
  (the source waits ~3 s for a first update before showing without it).
- **Intro** (first install): line 2 is "Hover me for more, click for Home, Super+B to
  reach me." and there is no line 3.
- **Timing.** ~8 s, held while the pointer is on it (the stack's hover hold, SPEC §2e);
  a click outside closes it at once; Esc does nothing (it never took the keyboard).
- `greeting-style = minimal`: line 1 alone in the pill for 4 s (compact if it needs a
  note, as Welcome back).

## 3. Line 1: which greeting

The first rule that applies wins. `name` is `greeting-name`, or the real name
(`GLib.get_real_name()`), or the user name.

| # | When (local time at the moment) | Line 1 | Bu |
|---|---|---|---|
| 1 | First install (`greeting-intro-shown` false) | "Hi, I'm Bu." | wave |
| 2a | **Birthday** (`greeting-birthday` = today's `MM-DD`) | "Happy birthday, {name}!" | party |
| 2b | **A celebration** (§7, kind `celebrate`) | its line, e.g. "Merry Christmas, {name}!" | party |
| 3 | Between 01:00 and dawn's start (`daypart-starts`) | "Still up, {name}? Don't stay too late." | wave |
| 4 | Monday, dawn or morning | "New week, {name}." | wave |
| 5 | Saturday, dawn to noon | "Happy Saturday, {name}." | wave |
| 5 | Sunday, dawn to noon | "Easy Sunday, {name}." | wave |
| 5 | Saturday or Sunday, afternoon to night | "Enjoy your weekend, {name}." | wave |
| 6 | Otherwise, by daypart (`kit/daypart.js`) | dawn, morning → "Good morning, {name}." · noon → "Good day, {name}." · afternoon → "Good afternoon, {name}." · evening → "Good evening, {name}." · night → "Still up, {name}?" | wave |

Observances (§7, kind `observe`) never take line 1; they go on line 2.

## 4. Welcome back

| When | Title | Subtitle (→ compact) | Bu |
|---|---|---|---|
| A new login on the same boot | "Welcome back, {name}." | — | wave |
| … and rain is coming (§8) | "Welcome back, {name}." | "Rain around 17:00, take an umbrella." | wave |
| … on a celebration | its line (§7) | — | party |

## 5. Leaving

The first rule that applies wins for the title; at most one subtitle, rain first.

| # | When | Title | Bu |
|---|---|---|---|
| 1 | Restart for updates (dialog type `UPDATE_RESTART`) | "Updating. Back in a moment." | busy |
| 2 | Restart | "Be right back." | wave |
| 3 | Log out | "Catch you later, {name}." | wave |
| 4 | Shut down on a celebration's evening (§7) | its line, e.g. "Merry Christmas, {name}." | party |
| 5 | Shut down, Friday afternoon to night | "Have a good weekend, {name}." | done |
| 6 | Shut down, evening or night | "Good night, {name}." | sleep |
| 7 | Shut down, otherwise | "See you soon, {name}." | wave |

| Subtitle (→ compact) | When |
|---|---|
| "Rain around 17:00, take an umbrella." | shut down or log out, rain coming within 3 h, before the evening (§8) |
| "Long day. Rest well." | shut down after more than 10 h awake on this boot (`/proc/uptime` minus the time asleep) |

## 6. Sizes and Bu

| Size | When | Bu | Text |
|---|---|---|---|
| **minimal** | one line of at most ~24 characters (fits pill 1 at rest) | 20 px | the line |
| **compact** | a title and one subtitle, or a line too long for minimal | 40 px | title over subtitle |
| **expanded** | Start and Wake (§2), unless `greeting-style = minimal` | 80 / 60 px, in `leading` | three or two lines in `center`, which grows |

Poses (MASCOT.md § Poses): `wave` plays for 5 s (Ethan, 2026-11-06; MASCOT's `once` is
~2 s, so the greeting asks for longer), then `idle`. `party` plays once, then `done`.
`sleep`, `done` are still; `busy` loops while shown. The lamp is the pose's own: the
greeting never shows amber or red (INDICATORS § Bu's lamp) unless the stack has them.

## 7. Special days

A built-in table, data only (ARCHITECTURE rule 7), `modules/greeting/holidays.js`, tested.
Two kinds:

- **celebrate** — takes line 1 (§3 priority 2b), Bu `party`; also the Leaving title on its
  evening.
- **observe** — line 1 stays the day's greeting; line 2 adds "Today is {name}."

The region comes from the **time zone**, not the locale (an `en_US` session in Ho Chi
Minh City is common): `GLib.TimeZone.new_local().get_identifier()`, e.g.
`Asia/Ho_Chi_Minh` (or `Asia/Saigon`) → Vietnam. `greeting-holidays`: `auto` (global +
the region's) · `global` (global only) · `off`. A region is added by a PR with its data.

| Region | Date | Kind | Line |
|---|---|---|---|
| global | 1 January | celebrate | "Happy New Year, {name}!" |
| global | 14 February | observe | "Today is Valentine's Day." |
| global | 8 March | observe | "Today is International Women's Day." |
| global | Easter Sunday (computed, Gregorian computus) | celebrate | "Happy Easter, {name}!" |
| global | 1 May | observe | "Today is Labour Day." |
| global | 31 October | celebrate | "Happy Halloween, {name}!" |
| global | 24 December | celebrate | "Merry Christmas Eve, {name}!" |
| global | 25 December | celebrate | "Merry Christmas, {name}!" |
| global | 31 December | celebrate | "Last day of the year, {name}." |
| Vietnam | Tết, 1–3 of the first lunar month | celebrate | "Happy Lunar New Year, {name}!" |
| Vietnam | Hùng Kings' day, 10th of the 3rd lunar month | observe | "Today is Hùng Kings' Day." |
| Vietnam | 30 April | observe | "Today is Reunification Day." |
| Vietnam | 2 September | observe | "Today is National Day." |
| Vietnam | Mid-Autumn, 15th of the 8th lunar month | celebrate | "Happy Mid-Autumn, {name}!" |
| Vietnam | 20 October | observe | "Today is Vietnamese Women's Day." |
| Vietnam | 20 November | observe | "Today is Teachers' Day." |

- **Lunar dates** are a generated table of Gregorian dates for 2026–2040
  (`scripts/lunar.js`, the Vietnamese lunar calendar at UTC+7, run by hand like
  `scripts/icons.js`; its output is data in `holidays.js`). Past 2040 the lunar days are
  silently skipped until the table is extended. Test anchors: Tết 2026 = 17 February.
- **Two on one day**: the birthday wins over a celebration; a celebration over an
  observance (the observance still goes on line 2).
- Shown at Start, Wake and Welcome back, and on the Leaving title for celebrations; never
  more than the moments of §1.

## 8. Weather

From GNOME's own client, the date menu's (`dateMenu.js` WeatherSection `_weatherClient`),
read through the kit's shared weather helpers (`kit/weather.js`, pure; Shell side
`kit/weatherclient.js`) — the same reading as the weather plan, not through the weather
module (ARCHITECTURE rule 1). Same place and units: the plan's "Use my location" and
units rows (SPEC §2a, `org.gnome.GWeather4`).

- **Line**: "{place}: {temp} {unit}, {condition}, {wind}." — the place as the date menu
  names it; the temperature rounded in the user's unit with its symbol ("28 °C"); the
  condition in words, lower case ("partly cloudy"); the wind in words by Beaufort force:
  0 → "calm", 1–3 → "light breeze", 4–5 → "breezy", 6 and up → "strong wind".
- **Rain coming**: the current condition is dry and a forecast within the next 3 h is
  wet (rain, showers, storm, snow — the weather plan's `isWet`). Line 3 (or the subtitle)
  becomes "Rain around 17:00, take an umbrella." (snow: "Snow around 17:00, dress
  warm."; storm: "Storms around 17:00, stay dry."), the hour of the first wet forecast in
  GNOME's time format.
- **No data** (no place, offline, no client): no weather line, no umbrella; never an
  error.

## 9. Settings

| Key | Type | Default | Prefs | Meaning |
|---|---|---|---|---|
| `modules-greeting` | b | true | Modules, its own row | the module |
| `greeting-style` | s | `expanded` | yes | `expanded` · `minimal` · `off` — Start and Wake |
| `greeting-farewell` | b | true | yes | Leaving lines (§5) |
| `greeting-name` | s | `''` | yes, prefilled with the real name | `''` = the real name |
| `greeting-birthday` | s | `''` | yes, a month and day | `MM-DD`, `''` = none |
| `greeting-holidays` | s | `auto` | yes | `auto` · `global` · `off` (§7) |
| `greeting-intro-shown` | b | false | no (bookkeeping) | the intro showed once |
| `greeting-boot` | s | `''` | no (bookkeeping) | the boot of the last Start |
| `greeting-session` | s | `''` | no (bookkeeping) | the logind session of the last greeting |
| `greeting-asleep` | i | 0 | no (bookkeeping) | seconds asleep since boot, at the last disable |

`greeting-last-day` (SPEC 2026-11-03) is dropped.

## 10. Code and tests

- `modules/greeting/`: `index.js` (kind `greeting`), `adapter.js` (pure: every line and
  the size from `{moment, now, daypart, weekday, name, special?, weather?, rain?, longDay?,
  intro?}`), `holidays.js` (data + `specialDay(date, region, birthday)`, pure), `source.js`
  (the moments of §1, the weather wait, the InjectionManager on `_confirm`).
- Kit: `kit/weather.js` / `kit/weatherclient.js` shared with the weather plan; an
  expanded `{mascot}` leading may be as tall as the text block beside it (80 / 60 px
  instead of the fixed 50, §2) — the regions and their `grow` are unchanged; a pill that
  is expanded still reports hover to the stack (hover holds its ttl).
- Tests (`tests/greeting.test.js`): every row of §3–§5 and its priority; each daypart;
  weekdays and weekends; 01:00 vs dawn; sizes (24 characters, long names stay whole —
  the renderer ellipsizes); no weather, rain, snow, storm; Beaufort words; holidays —
  fixed dates, Easter 2026–2030, Tết and Mid-Autumn anchors, birthday over a
  celebration, observance on line 2, `global` vs `auto` vs `off`, time zone → region; no
  measurements in the output.
- In the Shell (headless): Start (a new `boot_id` faked in settings), Wake (a faked sleep
  total), Welcome back (another session id), Leaving (the dialog's confirm), fullscreen,
  `off`; the weather filled in place; hover hold; a real activity interrupting.
