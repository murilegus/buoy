# Roadmap

Status: `[ ]` todo · `[~]` in progress · `[x]` done (reviewed by Ethan) · `[-]` dropped.
Top to bottom within a milestone. What an item does lives in SPEC and docs/design; how it was
done, in its PR. Update this file in the item's PR.

Last updated: 2026-11-12

## M0 — Foundation `[x]`

Repo, pnpm, eslint pinned to Shell 50, CI and pre-commit (`pnpm verify`); SPEC, ARCHITECTURE,
the activity contract; the name Buoy, uuid `buoy@murilegus`; `kit/` + `modules/`.

## M1 — Kit `[x]`

Activity contract · stack · presentation → actors · island · side pills · Home and tab strip ·
registry and app profiles · D-Bus · keyboard (`Super+B`) · fullscreen and missed · schema and
prefs.

## M2 — Panel `[x]`

Transparent 40 px panel · left cluster · bare tray and system cluster · cluster background and
contrast · Dock settings · rounded corners on maximized windows.

## M3 — v0.1, first release on EGO `[ ]`

Done: three tiers, compact, media, hud, Home, progress, downloads, copied, input, Claude Code,
daypart, clock, notifications, weather, calendar, pill order, idle `auto`, Island and Modules
pages, Bu, About, greeting first run and What's new, `install.sh`, README, last checks, 0.1.1.

| | Item | Done when |
|---|---|---|
| [~] | Release | 0.1.1 accepted on extensions.gnome.org (in review since 2026-11-09); README badge and wording updated, the overview on the EGO page |
| [ ] | `daypart-starts` in prefs | a row on the Island page (the clock already reads the key) |
| [-] | Home: Now playing on large screens | dropped (2026-11-12): the Home redesign (M4, design/home) gives the main card 168 / 200 and the tall form at 2560 and 3440 |
| [ ] | Field checks | seen with real apps: a Firefox or Thunderbird notification; Spotify and Firefox (https) art; a Google or Microsoft calendar; IBus Bamboo; the red light in fullscreen; a °C locale's Automatic; an EGO update's What's new; Home at 1366 and 2560 |

## M4 — Redesign and "Wow" pack (v0.2) `[ ]`

The design docs first, then the eight redesign items in order (the restructure only moves files),
one branch each, shipped together as 0.2. Sizes are in [docs/design](design/index.md). Motion
comes after the layouts it moves between (compact, the lights, expanded): its shared parts travel
to their places there (2026-11-12, Ethan).

| | Item | Done when |
|---|---|---|
| [~] | Design docs and site | done: `docs/design` per part (Vietnamese first), tokens, MkDocs site in en and vi built in CI. Left: root docs made shorter, then translated; English design pages and images |
| [x] | Restructure: kit, stylesheet, icons | ARCHITECTURE first; kit in `model/` `services/` `ui/`, `present.js` split by tier; a lint check of the import boundaries; one stylesheet in sections plus each tab's CSS beside its module, loaded by kit (not `@import`); `icons/color` and `icons/symbolic`; `install.sh` of 0.1 still works; nothing visible changes |
| [x] | Colours by role | as design/colours: the stylesheet uses only the palette's roles, checked by `tests/palette.test.js`; lights amber `#FF9F0A`, red `#FF453A`; Bu's lamps, stale Bu at 50 %, Bu's tile `#000`; high contrast; INDICATORS and MASCOT updated |
| [x] | Sizes in em: the bar and the pill | as design/pill, icons and mascot; nothing clipped at scale 1 and 2, with Large Text and a wide font; SPEC §2, §4 updated |
| [x] | Compact layout | as design/compact: 56 + 16n tall, radius 28, media 88 with its 72 art, rows with their 16 icons, the card's head, body and buttons (136 / 152); an alert opens its pill's compact in place and an ask is a card at compact size (design/alerts-and-asks "Alert", "Ask"); SPEC §2, §4 updated |
| [x] | Notifications as alerts | as design/alerts-and-asks "Thông báo": a notification arrives as an alert (its card without buttons for 5 s, the buttons on hover, then the pill with its full title); urgent ones keep their buttons and stay; seen only when its card had 5 s while you were present (a presence watch: the core idle monitor's 1 s, as Shell's banner); bursts in turns (1 s each, 2 waiting, same app merged), paused by hover; on a shared screen a burst is one compact, all missed; NOTIFICATIONS §1–§3 updated |
| [x] | The lights at the ends | as design/pill; SPEC §2, §2a-i, §2a-ii updated |
| [x] | Expanded on the same rhythm | as design/expanded and design/home (the main card and the row of tiles); SPEC §3, §4 updated |
| [ ] | Motion | as design/motion: springs (`kit/model/motion.js`, unit-tested: ζ, overshoot, settling, retarget) for every move, size and shape, run on the frame clock; velocity kept when cut short; fades and CSS states; the radius follows the height; tab switch and in-place lists; animations off and slow-down-factor honoured; `shrinkStop` gone; SPEC §5 updated |
| [x] | Symbolic icons from Gravity UI | as design/icons "Icon symbolic" and "Icon tự vẽ": every symbolic icon Buoy draws (tabs, buttons, rows, HUD/OSD, media, calendar, downloads, copied) is a Gravity UI drawing or Buoy's own in its style, shipped as `icons/symbolic/<theme name>-symbolic.svg` so a missing file falls back to the theme's icon of that name; the HUD says airplane mode and Bluetooth on/off; GNOME's own stay in prefs, the system cluster and app logos |
| [x] | Claude Code's questions in Buoy | as design/alerts-and-asks "Hỏi nhiều lựa chọn": AskUserQuestion answered in a card (one row per choice, Other typed in place, Next / Back / Submit), sent once as `answers`; tried first through PermissionRequest in an interactive session; CODING-AGENTS updated |
| [x] | Claude Code Desktop's plan | the Desktop app's own task list (its `update_plan` tool: a whole plan, advance, done/start) read as Claude's task list — the pill's step and progress, the compact's rows; CODING-AGENTS updated |
| [x] | The tab strip | Home · Media · Notifications · Calendar · Devices (both pinned by default, out of ⋯; Devices "Coming soon" until its item), then the live tabs (Claude Code, Transfers, unclaimed kinds) only while they have activities, the slot last (Clipboard until chosen from ⋯), Timer in ⋯; SPEC §2b updated |
| [ ] | Device tab | as design/device (to draw first, Vietnamese): the tab itself (pinned after Calendar, "Coming soon" until now), its three groups (This computer: battery, power mode; Wireless: Bluetooth devices, the phone as a device — its battery, find it; Plugged: drives, phones, webcams, displays, headphones) and how each row looks, empty groups hidden; it shows what the modules below bring, each part implemented in its own item ("Power", "Bluetooth device", "Headphones / display plugged", "USB / phone / webcam plugged", "Phone via GSConnect" for the phone's battery, #215's power mode). Calls, messages and rides stay in the Phone tab |
| [ ] | Phone via GSConnect | Grab/Be ride, OTP (30 s), Zalo/Messenger with avatar, call Mute/Reply SMS; adapters in `modules/phone/apps/`; its own Phone tab for calls, messages and rides (2026-11-13), the phone's battery in the Device tab |
| [ ] | Attention on another workspace | click switches workspace and focuses (Mutter `demands-attention`) |
| [ ] | Headphones / display plugged | choose on the pill; replaces GNOME's jack dialog when on |
| [ ] | Buoy light, the rest | red's hover line; away (GNOME's session idle, after `idle-delay`), the lock screen and DND call `stack.setUnseen()`, with the presence watch of "Notifications as alerts" (INDICATORS, design/alerts-and-asks) |
| [ ] | Power | charging, full, low; "18 W — slow"; "full in 42 min" (UPower) |
| [ ] | Bluetooth device | connected, with its battery |
| [ ] | USB / phone / webcam plugged | mount with one-tap eject |
| [ ] | Privacy dot | as design/colours (mic purple, camera green, screen red) and design/compact (screen sharing and recording in the pill, with Stop); hides GNOME's indicators; "in call" with auto-DND |
| [ ] | Meeting in 5 min · Join | SPEC §6b item 5 |
| [ ] | Timer | pomodoro ring, keep-awake, its tab; a start tile in Home's glance (design/home) |
| [ ] | Idle plan `mascot` | MASCOT.md § Eyes; module off by default; checked with `powertop` on real hardware |
| [ ] | Print job progress | CUPS notifier |
| [ ] | Terminal command finished in an unfocused tab | "exit 0 · 48 s", jump |
| [ ] | VPN / Wi-Fi / captive portal; power profile | as feedback |
| [ ] | Greeting | GREETING.md is true (Start, Wake, Welcome back, Leaving; special days) |

## M5 — Standalone tabs and developer modules `[ ]`

Developer modules opt-in, off by default; the Calendar and Clipboard tabs on (SPEC §2b).

| | Item | Done when |
|---|---|---|
| [ ] | Clipboard tab | SPEC §6b item 9 |
| [ ] | Launcher tab | |
| [ ] | Sound tab | SPEC §6b item 10 |
| [ ] | systemd unit failed → View log | user and system units |
| [ ] | Docker events | exit, OOM, health; one idle pipe |
| [ ] | Shell activity | zsh preexec/precmd → gdbus; the snippet in docs |
| [ ] | Multi-monitor | the pill follows the pointer, or one per monitor |
| [ ] | News idle plan | ≤ 1 fetch / 30 min, only while in `idle-auto-plans`; headline · source; click opens it |
| [ ] | Exchange rate / stocks idle plan | same fetch rule; relevance 70 past the user's threshold |
| [ ] | Localisation en + vi | gettext, greeting strings included |

## Deferred

| Item | Why |
|---|---|
| Synced lyrics in the compact | needs a Position poll while shown |
| Cover-art colour as keyline tint | nice-to-have |
| Scheduled activities across Shell restarts | needs state on disk |
| Window snapping by dragging to the pill | Mutter's tiling API is limited |
| Satellite extensions over D-Bus | once the contract is stable |
| World clocks | placement undecided (SPEC §1) |

## Out of scope (SPEC §0)

Voice assistant · file shelf · battery charge limit · installing software · AI plan usage ·
lyrics overlays · audio visualizer · blur · quick-settings indicators in the pill.
