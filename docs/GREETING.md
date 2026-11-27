# Greeting — Bu says hello, welcome back and see you soon

Every moment Buoy speaks on its own: when, what, how big, how long, which pose (SPEC §2d).
A new moment, line or holiday changes this file first. Decided with Ethan, 2026-11-06.

## Principles

1. **Moments, not days.** Greet on every event (start, long-sleep wake, login, session end).
   No once-a-day rule.
2. **Short and useful.** One friendly thing, at most two useful ones (time and date, weather
   or umbrella). Never asks for anything.
3. **The right size.** One short line → minimal; two ideas, or a line too long for pill 1 at
   rest → compact. Expanded only for a fresh start (§2).
4. **Out of the way.** A transient activity (SPEC §2, CONTRACT.md §1): not over fullscreen,
   never takes the keyboard, any real activity interrupts it, a click outside closes it.
5. **Bu is the face.** Every greeting leads with Bu, pose per moment (§6). No other icon.
6. **Words in one place.** Every string in `modules/greeting/adapter.js` (pure), English
   first; other languages with gettext (M5).
7. **Typed in** (2026-11-08, Ethan). Text types in a character at a time on one timer, removed
   when done, on close and disable. `enable-animations` off → whole at once. Hover holds the
   greeting; typing goes on.

## 0. Scope by release

- **v0.1** (FEATURES M3 "greeting: first run and What's new", 2026-11-08, Ethan): only §11.
  §1–§10 are M4 "greeting". Each release adds its notes to What's new (§11).
- **M4 in three parts** (2026-11-25, Ethan; design/expanded "Greeting"), all in 2026-11-26:
  (1) §1, §3 rules 3–6, §4–§6, prefs `greeting-style`, `greeting-farewell`, `greeting-name`;
  (2) weather and rain (§8), client moved into the kit; (3) special days and birthday (§7, §3
  rules 2a–2b). Line 3 is text only (no icon per line in the expanded center). Welcome back
  says a birthday as a celebration; the birthday is a month and day in prefs.

## 1. Moments

| Moment | Detected by | Size | Stays |
|---|---|---|---|
| **Start** — the machine was off or rebooted | `/proc/sys/kernel/random/boot_id` differs from `greeting-boot` | expanded (§2) | ~8 s, held while hovered; Bu waves 5 s |
| **Wake** — back from a sleep or hibernation of 3 h or more | time asleep since the last disable ≥ 3 h (below) | expanded (§2) | as Start |
| **Welcome back** — a new login, same boot | the logind session differs from `greeting-session`, same boot | minimal, or compact with a note (§4) | 4 s, held while hovered |
| **Leaving** — shut down, restart or log out from Shell's dialog | `Main.endSessionDialog` `_confirm(signal)` (below) | minimal, or compact with a note (§5) | until the session ends (~1.5 s) |
| A lock, a short sleep, the extension turned off and on | — | nothing | — |
| A fullscreen window has focus | `global.display.focus_window.is_fullscreen()` | nothing (no retry) | — |
| `greeting-style = off` | — | nothing; Leaving follows `greeting-farewell` | — |

All read at `enable`, nothing polled:

- **Boot.** `boot_id` is new each boot (boot time survives hibernation). Saved once a Start shows.
- **Session.** `misc/loginManager.js` `getCurrentSessionProxy` `Id` (fallback
  `XDG_SESSION_ID`).
- **Sleep.** Shell disables extensions on lock, enables on unlock (no `session-modes`,
  `ui/extensionSystem.js`); suspend locks first. Asleep since boot = `CLOCK_BOOTTIME −
  CLOCK_MONOTONIC` (`/proc/uptime` minus `GLib.get_monotonic_time()`), saved by `disable` in
  `greeting-asleep` (s), compared by `enable`. Suspend and hibernate count alike. 3 h, fixed.
- **Leaving.** `ui/endSessionDialog.js` closes the dialog, then calls `_confirm(signal)`
  (`ConfirmedLogout`, `ConfirmedShutdown`, `ConfirmedReboot`; `_type` tells a restart for
  updates). Buoy wraps `_confirm` (InjectionManager), shows the line, runs the original
  unchanged. No dialog (power button, `systemctl poweroff`, crash) → nothing.
- **First install.** `greeting-intro-shown` false → the next Start or Wake is the intro (§3
  rule 1); since v0.1 that is §11's first run, on the first enable.

## 2. Start and Wake: the expanded hello

```
┌──────────────────────────────────────────────────────────────────┐
│        Good morning, Ethan.                                      │
│ [Bu]   It's 07:42 on Friday, 6 November 2026.                    │
│        ☁ Ho Chi Minh City: 28 °C, partly cloudy, light breeze.   │
└──────────────────────────────────────────────────────────────────┘
 leading   center (grows)
```

- **Layout** (2026-11-07, Ethan; CONTRACT.md §2): Bu in `leading`, lines in `center`
  (`grow: 'center'`), no `trailing`. Bu is as tall as the text (80 px for three lines, 60 for
  two) and centred with it. Width as any activity (SPEC §4).
- **Line 1**: the greeting (§3), the expanded title, larger than other titles.
- **Line 2**: "It's 07:42 on Friday, 6 November 2026." (`clock-format`; the locale's long
  date). An observance (§7) appends "Today is Teachers' Day."; too long → it takes line 3 and
  the weather drops.
- **Line 3**: the weather or umbrella line (§8). None yet → left out (Bu 60 px), filled in
  place if it arrives; the source waits ~3 s first.
- **Intro** (first install): the lines of §11, no line 3.
- **Timing.** ~8 s, held while hovered (SPEC §2e); a click outside closes it; Esc does nothing.
- `greeting-style = minimal`: line 1 alone for 4 s (compact with a note, as Welcome back).

## 3. Line 1: which greeting

First rule that applies wins. `name` is `greeting-name`, or `GLib.get_real_name()`, or the
user name.

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
| 6 | Otherwise, by daypart (`kit/model/daypart.js`) | dawn, morning → "Good morning, {name}." · noon → "Good day, {name}." · afternoon → "Good afternoon, {name}." · evening → "Good evening, {name}." · night → "Still up, {name}?" | wave |

Observances (§7) never take line 1; they go on line 2.

## 4. Welcome back

| When | Title | Subtitle (→ compact) | Bu |
|---|---|---|---|
| A new login on the same boot | "Welcome back, {name}." | — | wave |
| … and rain is coming (§8) | "Welcome back, {name}." | "Rain around 17:00, take an umbrella." | wave |
| … on a celebration | its line (§7) | — | party |

## 5. Leaving

First rule wins for the title; at most one subtitle, rain first.

| # | When | Title | Bu |
|---|---|---|---|
| 1 | Restart for updates (dialog type `UPDATE_RESTART`, or the install-updates box ticked) | "Updating. Back in a moment." | busy |
| 2 | Restart | "Be right back." | wave |
| 3 | Log out | "Catch you later, {name}." | wave |
| 4 | Shut down on a celebration's evening (§7) | its line, e.g. "Merry Christmas, {name}." | party |
| 5 | Shut down, Friday afternoon to night | "Have a good weekend, {name}." | done |
| 6 | Shut down, evening or night | "Good night, {name}." | sleep |
| 7 | Shut down, otherwise | "See you soon, {name}." | wave |

| Subtitle (→ compact) | When |
|---|---|
| "Rain around 17:00, take an umbrella." | shut down or log out, rain within 3 h, before the evening (§8) |
| "Long day. Rest well." | shut down after more than 10 h awake on this boot (`/proc/uptime` minus the time asleep) |

## 6. Sizes and Bu

| Size | When | Bu | Text |
|---|---|---|---|
| **minimal** | one line of at most ~24 characters (fits pill 1 at rest) | 20 px | the line |
| **compact** | a title and one subtitle, or a line too long for minimal | 40 px | title over subtitle |
| **expanded** | Start and Wake (§2), unless `greeting-style = minimal` | 80 / 60 px, in `leading` | three or two lines in `center`, which grows |

Poses (MASCOT.md § Poses): `wave` 5 s (Ethan, 2026-11-06), then `idle`; `party` once, then
`done`; `sleep`, `done` still; `busy` loops. The lamp is the pose's own (INDICATORS § Bu's lamp).

## 7. Special days

A built-in table, data only (ARCHITECTURE rule 7), `modules/greeting/holidays.js`, tested.

- **celebrate** — takes line 1 (§3 rule 2b), Bu `party`; also the Leaving title on its evening.
- **observe** — line 1 stays; line 2 adds "Today is {name}."

The region comes from the **time zone**, not the locale:
`GLib.TimeZone.new_local().get_identifier()`, e.g. `Asia/Ho_Chi_Minh` (or `Asia/Saigon`) →
Vietnam. `greeting-holidays`: `auto` (global + region) · `global` · `off`. A region is added by
a PR with its data.

| Region | Date | Kind | Line |
|---|---|---|---|
| global | 1 January | celebrate | "Happy New Year, {name}!" |
| global | 14 February | observe | "Today is Valentine's Day." |
| global | 8 March | observe | "Today is International Women's Day." |
| global | Easter Sunday (computed, Gregorian computus) | celebrate | "Happy Easter, {name}!" |
| global | 1 May | observe | "Today is Labour Day." |
| global | Mother's Day, the 2nd Sunday of May | observe | "Today is Mother's Day." |
| global | Father's Day, the 3rd Sunday of June | observe | "Today is Father's Day." |
| global | 31 October | celebrate | "Happy Halloween, {name}!" |
| global | 24 December | celebrate | "Merry Christmas Eve, {name}!" |
| global | 25 December | celebrate | "Merry Christmas, {name}!" |
| global | 31 December | celebrate | "Last day of the year, {name}." |
| Vietnam | Tết, 1–3 of the first lunar month | celebrate | "Happy Lunar New Year, {name}!" |
| Vietnam | First full moon, 15th of the 1st lunar month | observe | "Today is the First Full Moon Festival." |
| Vietnam | 27 February | observe | "Today is Vietnamese Doctors' Day." |
| Vietnam | Hùng Kings' day, 10th of the 3rd lunar month | observe | "Today is Hùng Kings' Day." |
| Vietnam | 30 April | observe | "Today is Reunification Day." |
| Vietnam | Buddha's birthday, 15th of the 4th lunar month | observe | "Today is Vesak." |
| Vietnam | 1 June | observe | "Today is Children's Day." |
| Vietnam | 28 June | observe | "Today is Vietnamese Family Day." |
| Vietnam | Vu Lan, 15th of the 7th lunar month | observe | "Today is Vu Lan." |
| Vietnam | 2 September | observe | "Today is National Day." |
| Vietnam | Mid-Autumn, 15th of the 8th lunar month | celebrate | "Happy Mid-Autumn, {name}!" |
| Vietnam | 20 October | observe | "Today is Vietnamese Women's Day." |
| Vietnam | 20 November | observe | "Today is Teachers' Day." |
| Vietnam | Kitchen Gods' day, 23rd of the 12th lunar month | observe | "Today is Kitchen Gods' Day." |

- **Lunar dates** (2026-11-07, Ethan): Gregorian dates for 2026–2099 of each lunar row (Tết's
  2nd and 3rd days follow; Kitchen Gods' day falls in the next Gregorian year), ~6 KB, generated
  by hand with `gjs -m scripts/lunar.js --write` (UTC+7, Hồ Ngọc Đức's algorithm); nothing
  computed at runtime. Past 2099: skipped. Anchor: Tết 2026 = 17 February.
- **Mother's and Father's Day** (2026-11-16, with the other observances added then): nth
  Sunday, computed like Easter; the date Vietnam and most countries keep (not the UK's).
- **Two on one day**: birthday › celebration › observance (still on line 2); two observances:
  the region's (2026-11-16).
- Shown at Start, Wake, Welcome back, and as the Leaving title for celebrations.

## 8. Weather

From GNOME's own client, the date menu's (`dateMenu.js` WeatherSection `_weatherClient`),
read through the kit's shared weather helpers (`kit/model/weather.js`, pure; Shell side
`kit/services/weather.js`) as the weather plan reads it, not through the weather module
(ARCHITECTURE rule 1). Same place and units as the plan (SPEC §2a, `org.gnome.GWeather4`).

- **Line**: "{place}: {temp} {unit}, {condition}, {wind}." — e.g. "Ho Chi Minh City: 28 °C,
  partly cloudy, light breeze."; place as the date menu names it, temperature rounded,
  condition in lower case, wind by Beaufort: 0 "calm", 1–3 "light breeze", 4–5 "breezy", 6+
  "strong wind".
- **Rain coming**: dry now, a wet forecast (the plan's `isWet`) within 3 h → "Rain around
  17:00, take an umbrella." (snow: "Snow around 17:00, dress warm."; storm: "Storms around
  17:00, stay dry."), the first wet hour in GNOME's time format.
- **No data**: no weather line, no umbrella, never an error.

## 9. Settings

| Key | Type | Default | Prefs | Meaning |
|---|---|---|---|---|
| `modules-greeting` | b | true | Modules, Bu group | the module |
| `greeting-style` | s | `expanded` | yes | `expanded` · `minimal` · `off` — Start and Wake |
| `greeting-farewell` | b | true | yes | Leaving lines (§5) |
| `greeting-name` | s | `''` | yes, prefilled with the real name | `''` = the real name |
| `greeting-birthday` | s | `''` | yes, a month and day | `MM-DD`, `''` = none |
| `greeting-holidays` | s | `auto` | yes | `auto` · `global` · `off` (§7) |
| `greeting-intro-shown` | b | false | About's "Show Bu's introduction again" sets it false (§11) | the intro showed once (§11) |
| `greeting-version-seen` | i | 0 | no (bookkeeping) | the last version What's new spoke for (§11) |
| `prefs-page` | s | `''` | no (bookkeeping) | the prefs page to open, then cleared (`whats-new`, §11) |
| `greeting-boot` | s | `''` | no (bookkeeping) | the boot of the last Start |
| `greeting-session` | s | `''` | no (bookkeeping) | the logind session of the last greeting |
| `greeting-asleep` | i | 0 | no (bookkeeping) | seconds asleep since boot, at the last disable |

`greeting-last-day` (SPEC 2026-11-03) is dropped.

## 10. Code and tests

- `modules/greeting/`: `index.js` (kind `greeting`); `adapter.js` (pure: lines and size from
  `{moment, now, daypart, weekday, name, special?, weather?, rain?, longDay?, intro?}`);
  `holidays.js` (data + pure `specialDay(date, region, birthday)`); `source.js` (§1, the
  weather wait, the `_confirm` injection).
- Kit: `kit/model/weather.js` / `kit/services/weather.js`, shared with the weather plan
  (2026-11-26); an expanded `{mascot}` leading may match the text's height (80 / 60 px, not
  50); an expanded pill still reports hover to the stack.
- Tests (`tests/greeting.test.js`): every row and priority of §3–§5, dayparts, weekends, 01:00
  vs dawn, sizes (24 characters; long names stay whole, the renderer ellipsizes), weather
  cases and Beaufort words, holidays (Easter 2026–2030, Mother's Day 2026 = 10 May, Father's
  Day 2026 = 21 June, lunar anchors, precedence, `auto`/`global`/`off`, time zone → region);
  no measurements in the output.
- In the Shell (headless): each moment faked (`boot_id`, sleep total, session id, the dialog's
  confirm), fullscreen, `off`, weather filled in place, hover hold, a real activity interrupting.

## 11. First run and What's new

*v0.1, 2026-11-08, Ethan.* One mechanism, read at `enable` against `metadata.json` `version`
(EGO's integer):

| Case | When | What Bu says |
|---|---|---|
| **First run** | `greeting-intro-shown` false (a fresh install) | the intro: who Bu is and the basics of using Buoy — v0.1's "what's new", since everything is |
| **What's new** | `greeting-version-seen` lower than the running version, the intro already shown | that version's notes: what is new, what was fixed |
| Neither | the version already seen | nothing |

- **When.** The first `enable` that finds the case, once the island is seen (not over
  fullscreen: it waits; never while locked). Both keys are written once shown; the first run
  also sets `greeting-version-seen`. An EGO update then re-login is an ordinary `enable`.
- **Form.** Expanded transient (principle 4), Bu `wave` 5 s then `idle`, typed in (principle
  7). Held while hovered; stays until closed or ~12 s after the last line is in.
- **First run's lines.** "Hi, I'm Bu." then one basic per line: hover for more; click for
  Home; the shortcut, the user's `keybind-focus` ("Super+B" by default; said as set, none →
  line left out; 2026-11-08, Ethan); scroll on the idle pill for what else it shows; ⚙ in Home
  for settings. Exact words in `adapter.js`.
- **What's new's lines.** "New in Buoy {version}" (`version-name` if `metadata.json` has one,
  else the number EGO writes), then up to 4 lines, new first, then fixes; more → "…and more",
  which opens prefs on About → What's new (2026-11-08, Ethan). Notes are bundled, never
  fetched: `modules/greeting/notes.js`, `{version, name, added: [], fixed: []}` per release. No
  entry → nothing said, still counts as seen. Skipped versions: the newest notes only.
- **About → What's new** (2026-11-08, Ethan): a subpage, every version's notes newest first
  (v0.1's is the intro). Headings "Buoy 0.2 — this version", "Buoy 0.1 — 8 November 2026"
  (`date` in notes.js, pure data so prefs imports it). To open it the Shell side sets
  `prefs-page` = `whats-new` and calls `Main.extensionManager.openExtensionPrefs`; prefs shows
  the page and clears the key (an open window follows the change). A key, because
  `OpenExtensionPrefs` passes on only `modal` (`js/dbusServices/extensions/extensionsService.js`).
- **About → "Show Bu's introduction again"** (2026-11-08, Ethan): sets `greeting-intro-shown`
  false; the source sees it, shows the first run at once in the pill, sets it true.
  `greeting-version-seen` stays.
- **Tests.** The case (fresh, update, same, downgrade → nothing, no notes); lines; the cap and
  "…and more"; typing steps and end (pure: text after n ms); animations off → whole.

### A newer Buoy

*2026-11-13, Ethan.* Bu says when a newer version is ready, once per release, as What's new
(expanded, typed in, ~12 s). `greeting-updates` (default on, a row under Greeting) turns it off.

| Installed from | How Buoy knows | What Bu says |
|---|---|---|
| extensions.gnome.org | Shell checks at session start and daily and downloads the update (`ui/extensionDownloader.js` `checkForUpdates`), then sets Buoy's `hasUpdate` and emits `extension-state-changed` (`notifyExtensionUpdate`). Buoy reads that: **no request of its own** | "A newer Buoy is ready." / "Log out and back in to use it." (Shell installs it at the next login, `_installExtensionUpdates`) |
| `install.sh` | one GET of `api.github.com/repos/murilegus/buoy/releases/latest`, **the one network call Buoy makes** (FEATURES M3) | "Buoy 0.2 is out." / "You have 0.1.1." / "Paste the command in a terminal to update." with **Copy command** (install.sh's `--update` line, to the clipboard) and **Release notes** (the release's page, in the browser) |
| a development checkout (a link) | nothing | nothing |

- **Which install.** `install.sh` leaves an empty `.check-updates` in the extension's folder;
  GitHub is asked only then. An EGO update replaces the folder, so the mark goes.
- **When.** An `enable` with no first run or What's new, after Shell's startup: `hasUpdate`
  first; else, with the mark, GitHub at most daily (`greeting-update-checked`, epoch s; any
  answer counts, none → ask next enable). No polling, no timer (rule 8).
- **Sent**: the bare request, user agent "Buoy". Buoy never updates itself (rule 7).
- **Read**: only the tag, as a version-name (one to four numbers, `adapter.js` `versionName`);
  anything else is dropped. The notes' address is built from it, never taken from the network.
- **Once.** `greeting-update-told`: the version-name (GitHub) or `shell:<running version>`
  (Shell). Waits out fullscreen, as the greeting.
- **Tests.** Tags and non-tags; newer/same/older ("0.10" after "0.9"); every GitHub answer;
  daily due and clock going back; once per release from either source; lines and buttons.
