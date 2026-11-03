# Roadmap & feature backlog

Status: `[ ]` todo · `[~]` in progress · `[x]` done (implemented by agent, reviewed by
Ethan) · `[-]` dropped. Work order: top to bottom within a milestone unless Ethan says
otherwise; the agent sets `[~]` when starting and `[x]` only after Ethan's review. Score = wow × cheap × new
(each 1–3; see bottom). Every item names its module, source signal, settings keys and what
"done" means. Update this file in the same PR as the feature.

Last updated: 2026-11-03

---

## M0 — Foundation (docs, repo)  `[x]`

- [x] Repo layout, pnpm, jsconfig, eslint, scripts (link/dev/pack/verify)
- [x] SPEC.md (what Buoy is/isn't, v0.1 decisions)
- [x] ARCHITECTURE.md (module/feature layout B, rules, settings model)
- [x] APPLE.md (ActivityKit/HIG → BuoyKit contract)
- [x] Competitor notes: NOTCHY, ISLE, ISLET; BEHAVIOUR (iOS rules + Islet benchmark) — local only, `docs/notes/` is not committed
- [x] Name: Buoy, uuid `buoy@murilegus`
- [x] src tree restructured into `kit/` + `modules/`
- [x] Smoke (2026-11-01): eslint-config-gnome pinned to Shell 50's commit + eslint 9.38.0,
  Node via pnpm `devEngines.runtime`; `pnpm lint`/`test` green; `shapes.test.js`;
  `metadata.json` gets `settings-schema` (enable() threw without it); `pnpm dev` moved to
  `--devkit` (Shell 49+) and no longer orphans the shell on restart; enable/disable ×3 clean
  in headless Shell 50.1 and in `pnpm dev`; shapes snap to even px; `expanded-width`
  replaces `expanded-size`. Reviewed 2026-11-01
- [x] CI + pre-commit (2026-11-01): `pnpm verify` (lint, gjs tests, strict schema) runs in a
  `.githooks/pre-commit` hook (set by `pnpm install`, no extra dependency) and in GitHub
  Actions on ubuntu:26.04; `tests/metadata.test.js` guards metadata ↔ schema. `pnpm check`
  (tsc) not gated yet: 12 existing type errors. CI green on PR #1, reviewed 2026-11-01

## M1 — Kit (framework)  `[~]`

Nothing user-visible until M1 is done; everything else depends on it.

| | Item | File | Done when |
|---|---|---|---|
| [x] | Activity contract + `validate()` + cross-app `PRIORITY` | `kit/activity.js` | bad adapter output throws at registry |
| [x] | Stack: `surface/update/end/schedule/ask`, ttl ≤ 8 h, stale, transient, alert, `apps-hidden` filter, missed history (last 5) | `kit/stack.js` | unit-testable with `gjs`, no Shell import |
| | ↳ 2026-11-01 implemented, `tests/stack.test.js`; injected clock, `answer`/`dismiss`, `setUnseen`, light off/missed/waiting; `apps-hidden` live from GSettings. Island does not yet render `alert`, `expand`, `isStale` or the light; `setUnseen` has no caller until the fullscreen item. Missed excludes osd/copied/ask/hidden apps (agreed 2026-11-01). Reviewed, PR #3 | | |
| [x] | Presentation → actors: leading/text/trailing; expanded regions leading/trailing/center/bottom with `priority`; actions; keyline tint | `kit/present.js` | only file that creates content actors |
| | ↳ 2026-11-01 `kit/presentation.js` (pure plan, `tests/presentation.test.js`) + `kit/present.js` (actors: icon, art, eq glyph, ring, bar, text, title block, action buttons; stale dimmed). Island builds compact/expanded content through it, expanded height fits content ≤ w/2, keyline on the border, updates while open stay open. `ask` opens expanded when it reaches the pill (and again when back on top); transient too; buttons call `onAction`. Media adapter no longer sends `size` (rule 11, test guards it). Reviewed, PR #4 | | |
| [x] | Island: idle (none + buoy light), compact content-fit, hover grow/peek, press pulse, expanded morph, click-outside, Esc | `kit/island.js` | morph never moves text |
| | ↳ 2026-11-01 done: idle `none` + light (grey/amber/red, left edge slot, hidden in expanded), hover peek (`peek` field, 300 ms), alert = 2 s expand or pulse, covered alert brought up 2 s (stack), press pulse, only click-outside closes (buttons act), Esc after a click-open (modal grab; the container is reactive only while modal so Clutter delivers Esc to it; confirmed on the real session 2026-11-01). Reviewed, PR #5 | | |
| | ↳ 2026-11-01 (present item): compact content-fit and the expanded morph now render real content; alert, auto-expand, light, peek, Esc still open
| | ↳ 2026-11-01 run in Shell 50.1: idle pill 120×32 centred, hover → 132×34, press → 139×36 and back, 0 repaints at idle, enable/disable clean. Not yet: buoy light, compact content (needs `present.js`), peek, expanded, click-outside, Esc (no key handling yet) | | |
| [x] | Side-by-side minimal: ≤3 pills, centre = highest priority, slide-to-fill, merge on open, `+N` badge, per-pill hover/click, alert-brief on one pill | `kit/island.js` | SPEC §2c all true |
| | ↳ 2026-11-01 stack renders the whole visible list, island shows `capacity` (2–3, measured against the system cluster) and puts `+N` on the last; new `kit/pill.js` (one pill each, bound to its activity so pills slide, never jump); per-pill hover/peek/press/alert; click any pill → it grows into the panel at the centre, the others slide in and fade, split on close; Esc/click-outside as before. Tested at 1920 and 1366. 2026-11-02 review fix: the expanded text sat outside the still-compact background for ~340 ms (a content slide re-laid it out each frame and restarted the bg morph); content now stays at its final place and the bg uncovers it (clip and opacity following the bg transition, SPEC §5); slides move it with the bg; a morph is never restarted toward the same target. Reviewed, PR #7 | | |
| [~] | Home + tab strip: `[Home][kind tabs][slot][⋯]`, context-opens-tab rule, no last-tab memory | `kit/home.js` | SPEC §2b, §3 |
| | ↳ 2026-11-02 `kit/tabs.js` (pure, `tests/tabs.test.js`) + `kit/home.js` (panel per click-open: strip, Home list, kind tabs, slot/⋯/pinned standalone tabs, body scrolls past the cap). Kind tabs for every enabled module with kinds, always shown and empty until their `tab.js` (or showing their activities' expanded views); unclaimed kinds while an activity has expanded; Home lists every activity until the M3 blocks (decided 2026-11-02). Strip like Notchy: active tab icon + title, others icon only; media declares `title`/`icon`; a `notification` module stub (kinds `notification`, `modules-notification` key, no source until M4) gives the Notifications tab, after Media; `progress` (Transfers) and `timer` stubs give their tabs too (key `modules-timer`). The slot shows the standalone tab chosen from ⋯ (`tabs-slot`), the first enabled one until then; `tabs-pinned` stays settings-only. `calendar` then `clipboard`: standalone tabs with an empty `tab.js` (`modules-calendar`, `modules-clipboard`), so Calendar is in the slot by default. ⋯ is a raised menu floating over the tab, right-aligned under ⋯; a press beside it only closes it. Click: idle/+N → Home, pill → its kind's tab, no tab → `onPress` or Home; stack opens (alert/ask/transient) stay strip-less. ⚙ at the right of the strip row closes the island and opens prefs (a placeholder `prefs.js` until the prefs item; Shell offers prefs only when the file exists, `ui/extensionSystem.js` `hasPrefs`); standalone tabs tested with fake modules only (none ship yet). Awaiting review | | |
| [ ] | Registry: slug table, resolve user-JSON → `apps/<slug>.js` → `adapter.js`, `apps-plain` | `kit/registry.js` | |
| [ ] | D-Bus `org.gnome.Shell.Extensions.Buoy`: Surface/Update/End/Schedule/Ask | `kit/dbus.js` | `gdbus call` from a shell script works |
| [ ] | Keyboard: `Super+B` focus, ←/→ between pills, Enter/Esc, A/D for ask | `kit/island.js` | |
| [ ] | Fullscreen: hide island, show missed light on exit | `kit/stack.js` | fullscreen drives `stack.setUnseen()`; fullscreen only (away/DND → M4 Buoy light, decided 2026-11-01). While unseen the stack sends no `expand`/`alert` (an ask must not open in a hidden pill, where any click in the fullscreen app would collapse it) — only the red light; on `setUnseen(false)` a pending ask on top is re-shown with `expand` (found 2026-11-01) |
| [ ] | GSettings schema + `prefs.js` (placeholder window since 2026-11-02, opened from the island's ⚙; Adw, one page per module from `index.js#schema`, test/preview mode key; plus own pages for non-module keys: **Panel** for `cluster-*`/`left-cluster-empty`, **Windows** for `window-corners*`) | `schemas/`, `prefs.js` | |

## M2 — Panel (cosmetic, independent of M1)  `[~]`

| | Item | Done when |
|---|---|---|
| [x] | Transparent 40 px panel, Activities hidden, clock moved | |
| [ ] | Left cluster: focused app icon+name; hover "· ⊞ N"; no-app → "Workspace N"; click Overview; right-click app menu; scroll switches workspace; `left-cluster-empty` | SPEC §1 |
| [ ] | Right: third-party tray bare and separate; system cluster = QS indicators + clock in one `St.BoxLayout`, one click target → quick settings; clock non-reactive, unread dot hidden (SPEC §1, 2026-11-02) | click on the clock opens quick settings; Super+V still opens the calendar popover; disable restores the stock clock |
| [ ] | `cluster-background = hover|always|never` (classes `buoy-cluster-always/never`) | |
| [ ] | `cluster-contrast = auto|light|dark`: wallpaper luminance on `picture-uri` change → `buoy-light` | one decode per wallpaper change |
| [ ] | Rounded top corners on maximized windows (`corners.js`): `Shell.GLSLEffect` on the `Meta.WindowActor` of maximized windows only, top-left + top-right; `window-corners` (default on) and `window-corners-radius` (default 15 = Adwaita) on the prefs **Windows** page (added 2026-11-02) | SPEC §1a; maximized GTK4, GTK3, Electron and Xwayland windows show round top corners with the wallpaper behind, bottom square; unmaximize/fullscreen/off/disable remove the effect from every window; toggle and radius apply live; no square flash during the maximize animation or in the Overview; frame time with ~5 windows behind a maximized one noted in the handover |

## M3 — v0.1 modules (first release on EGO)  `[ ]`

| | Module | kind | Source | Settings | Done when | score |
|---|---|---|---|---|---|---|
| [ ] | **media** | media | `ui/mpris.js` MprisPlayer | `media-peek-on-hover` | compact art+title·artist; hover peek with transport; tab Media (scrub, shuffle, repeat, output); `apps/spotify.js` ad countdown | 6 |
| [ ] | **hud** | osd | wrap `Main.osdWindowManager.show`; `Clutter.Keymap` caps; UPower kbd-backlight | `hud-replace-osd` | stock OSD hidden; volume/brightness/caps/backlight in pill, ttl 1.5 s | 6 |
| [ ] | **home** | — | `ui/calendar.js`, `ui/weather.js`, MPRIS | — | Home per SPEC §3: now playing, calendar, weather, up next, timer block | — |
| [ ] | **progress** | progress | `com.canonical.Unity.LauncherEntry` D-Bus signal | — | Nautilus copy / Firefox / Chrome / Transmission show ring + %; "Done" then end | **27** |
| [ ] | **copied** | copied | `Meta.Selection` `owner-changed` + `St.Clipboard` | `copied-show-preview` | 1 s flash with snippet / image thumb; never stores | 18 |
| [ ] | **layout** | hud | keyboard status `changed` | — | "VI"/"EN" flash on switch | 18 |
| [ ] | **ask** | ask | D-Bus `Ask()`; hooks for Claude Code / Codex | `ask-timeout` (10 min = deny) | buttons return answer to caller; agent approvals Deny·Allow·Always; silent while agent terminal focused; hooks installed/removed from prefs | 18 / 12 |
| [ ] | **daypart** (`kit/daypart.js`, added 2026-11-03) | — | pure, no timer | `daypart-starts` | `dawn…night` from the hour; boundaries, wrap past midnight and bad settings covered in `tests/daypart.test.js`; used by clock, greeting, `auto` | — |
| [ ] | **clock** (idle plan) | — | 1 min tick while idle | `idle-clock-style` | icon by time of day (`kit/daypart.js`) + time; variants | — |
| [ ] | **weather** (idle plan) | — | `ui/weather.js` client | `idle-weather-refresh` | icon + temp; hover peek wind/humidity/feels-like | — |
| [ ] | **idle `auto`** — smart stack (`kit/smartstack.js`, SPEC §2a-iii, added 2026-11-03) | — | each `idle.js#relevance(ctx)`; plans' `changed`; one kit timer while idle | `idle-content` default `auto` (schema default changes from `none`), `idle-auto-plans`, `idle-auto-interval` | highest score shows, ties take turns in `idle-auto-plans` order, ≥ 80 holds; scroll flips; one transition per switch, nothing between; timer exists only while idle with `auto` (gone on surface/expand/disable); ranking, ties, hold and `null` plans unit-tested | — |
| [ ] | **greeting** (SPEC §2d, added 2026-11-03) | greeting | first enable of a local day; `misc/weather.js` `WeatherClient` | `greeting-style` (expanded), `greeting-name`, `greeting-last-day` | once a day at login/first unlock: expanded 3 lines (greeting by daypart + name, long date, place · °C · condition · wind words) ~8 s, hover holds; no weather → 2 lines, filled in place if it arrives; not over fullscreen; second unlock same day shows nothing; adapter tests per daypart, no weather, long name | 18 |
| [ ] | Release: pack, EGO submission, README GIF (file copy progress) | | | | | |

## M4 — "Wow" pack (v0.2)  `[ ]`

| | Item | kind | Source | Done when | score |
|---|---|---|---|---|---|
| [ ] | Phone via GSConnect: Grab/Be ride, OTP (30 s), Zalo/Messenger message with avatar, incoming call Mute/Reply SMS | phone | GSConnect notifications (app-id), telephony | adapters `modules/phone/apps/{grab,be,zalo}.js` | 18 |
| [ ] | Attention on another workspace, jump | attention | Mutter `demands-attention`/`urgent` | click switches workspace + focuses | 18 |
| [ ] | Headphones / display plugged → choose on pill | device | Gvc port change, `monitors-changed` | replaces GNOME jack dialog when enabled | 12 |
| [ ] | Buoy light (amber missed / red waiting) + last-5 history on hover; away (idle > N min) and DND also call `stack.setUnseen()` | core | internal; idle monitor, notification DND setting | SPEC §2a-i, INDICATORS | 12 |
| [ ] | Notifications peek with the notification's own actions; DND; notifications tab with history (SPEC §6b; the tab already shows from a stub module, 2026-11-02) | notification | MessageTray (`getSources`, `source-added`, `notification-added`) | Reply/Mark read/Open; bodies hidden while screen sharing; tab lists the same notifications as the stock message list, dismiss syncs both ways | 8 |
| [ ] | Power: charging/full/low; "18 W — slow"; "full in 42 min" | power | UPower `energy-rate`, `time-to-full` | | 12 |
| [ ] | BT device connected with battery | device | GnomeBluetooth + UPower | | 12 |
| [ ] | Download finished | notification | `Gio.FileMonitor` ~/Downloads | | 12 |
| [ ] | USB/phone/webcam plugged; mount with one-tap eject | device | GUdev, `Gio.VolumeMonitor` | | 12 |
| [ ] | Privacy dot at pill trailing (orange mic / green cam+screen), hides GNOME's; recording timer; "in call" when cam+mic | privacy/call | `Shell.CameraMonitor`, Gvc, screencast | SPEC §2a-ii; auto-DND in call | 8 |
| [ ] | Meeting in 5 min · Join | calendar | `ui/calendar.js` + link regex | | 8 |
| [ ] | Timer / pomodoro ring, keep-awake | timer | GLib, SessionManager Inhibit | tab Timer | 6 |
| [ ] | Screenshot taken → thumb, Copy/Open/Delete | notification | `screenshotUI` signal | | 8 |
| [ ] | Print job progress | progress | CUPS `org.cups.cupsd.Notifier` | | 9 |
| [ ] | Terminal command finished in unfocused tab | notification (adapter) | Ptyxis / GNOME Terminal notifications | "exit 0 · 48 s", jump | 12 |
| [ ] | VPN / Wi-Fi change / captive portal; power profile | hud | NM, power-profiles-daemon | | 6 |
| [ ] | Calendar idle plan: next event | calendar | EDS | | — |

## M5 — Standalone tabs & developer modules (opt-in, off by default)  `[ ]`

| | Item | type | Source | note |
|---|---|---|---|---|
| [ ] | Clipboard tab (history, search, pin; excludes password managers) | standalone tab | `Meta.Selection` | slot/⋯; module + empty `tab.js` exist since 2026-11-02. Layout reference (Notchy, 2026-11-02): title + count badge, "1–9 to paste" hint, Clear; search field; rows with a type icon (text, image, link, colour swatch), image rows with thumbnail, name and type tag, a pin marker, index 1–9 on the right |
| [ ] | Launcher tab | standalone tab | `Shell.AppSystem` | |
| [ ] | systemd unit failed → View log | notification | systemd D-Bus | user + system |
| [ ] | Docker events (exit/OOM/health) | notification | `docker events` via `Gio.Subprocess` | one idle pipe |
| [ ] | Shell activity (zsh preexec/precmd → gdbus) | notification | D-Bus | shell snippet in docs |
| [ ] | Multi-monitor: pill follows pointer / per monitor | core | `monitors-changed` | setting |
| [ ] | News idle plan (an interest for `auto`) | idle plan | Soup, RSS/Atom feeds chosen in prefs | network: ≤ 1 fetch / 30 min, only while in `idle-auto-plans`; headline · source; click opens the link (SPEC §2a-iii, 2026-11-03) |
| [ ] | Exchange rate / stocks idle plan (watchlist) | idle plan | Soup, quote API to choose | same fetch rule; "USD/VND 25 410 ▲0.2 %"; relevance 70 past the user's threshold |
| [ ] | Localisation en + vi | — | gettext | greeting strings (SPEC §2d) included |

## Deferred (fits, needs real work)

| Item | Why deferred |
|---|---|
| Synced lyrics line in compact | Soup + Position poll while visible; adapter heavy |
| Cover-art colour as keyline tint | GdkPixbuf downscale once per track; nice-to-have |
| Scheduled activities persisted across Shell restarts | needs on-disk state |
| Window snapping by dragging to the pill | Mutter tiling API limited |
| Satellite extensions over D-Bus | once contract is stable and there's a community |
| Mascot (discussed 2026-11-03) — the face of the buoy light: static poses per state (asleep at night/idle, looking when something was missed, hand up for an `ask`), motion only with an activity (waves with the greeting, busy while a timer/transfer/agent runs) | needs artwork; rule 8 forbids idle motion; decide once there are drawings |
| World clocks (lost with the clock popover, SPEC §1) | placement undecided: Home or elsewhere; still reachable via Super+V meanwhile |

## Out of scope by design (SPEC §0)

Voice assistant · file shelf / DnD tray · battery charge limit · running/installing software ·
AI plan usage · lyrics overlays · audio visualizer · blur / Liquid Glass · quick-settings
indicators inside the pill (`[-]` reverted 2026-10-30, they live in the system cluster).

---

### Scoring

wow = demo-in-5-seconds value · cheap = 3 signal exists / 2 some work / 1 real work ·
new = 3 nobody has it / 2 only Isle or Notchy / 1 common. Score = product.
Top of the whole list: file copy/download progress (27) — ship it first after core.
