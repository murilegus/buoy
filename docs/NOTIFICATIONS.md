# Notifications — GNOME's notifications on the island

The desktop's notifications on Buoy: the pill that replaces GNOME's banner, its card, Do
Not Disturb, sharing, the Notifications tab, Shell's screenshot notice. FEATURES M3
"notifications" points here. Decided with Ethan, 2026-11-07; three steps (§8). Shell
source (gnome-50): `ui/messageTray.js`, `ui/notificationDaemon.js`, `ui/messageList.js`,
`ui/status/doNotDisturb.js`, `ui/panel.js`.

## Principles

1. **GNOME decides, Buoy draws.** Whether a notification gets a banner (Do Not Disturb,
   urgency, full screen, lock screen, the app's "show banners" switch) is Shell's call.
   Buoy shows a pill exactly where GNOME would show a banner.
2. **The notification is Shell's, never a copy.** The pill acts on the real object, so
   GNOME's list and Buoy always agree. Buoy posts no notifications.
3. **Short, unless it needs you.** Pill 1 for a few seconds; only a critical one stays.
4. **Nothing private on a shared screen.** The pill names the app, not the message.

## 1. Where Buoy takes over

GNOME's rules before the banner stay: `_onNotificationRequestBanner` drops a seen
notification, a `LOW` one, and one whose app may not show banners (`policy.showBanners`:
Do Not Disturb, the app's switch) unless critical; `_updateState` holds the queue in full
screen or busy and shows nothing without `sessionMode.hasNotifications` (lock). Then
`_showNotification()` builds the banner (`_updateShowingNotification`: seen, sound).

With `notification-replace-banners` on, Buoy overrides `_showNotification` on the
prototype (`InjectionManager`, as the hud module): each banner becomes an alert on the
app's pill, its sound played. Marked seen (`acknowledged = true`) only by §2's rule
(2026-11-12). Off: GNOME's banner, no pill (the tab still lists all, §6).

**Held, still unseen** (2026-11-08): one that waited in Shell's queue (≥ 2 s, stamped on
`queue-changed`; full screen, busy, lock) shows as a pill with sound when the screen is
back, but stays unseen: a 3 s glance is not a banner waiting for you. Missed (§6).

**After the lock screen** (2026-11-13): Buoy is off while locked, and at unlock Shell
updates the tray first (`ui/messageTray.js` `_sessionUpdated` immediate,
`ui/extensionSystem.js` `_sessionUpdated` async). So on enable (also after login) Buoy
stamps the queue as waited and takes a showing banner off (`_notificationRemoved`, kept),
marks it unread and runs it through the override quietly: held, unseen, amber light, no
card. A critical one (`notify-send -u critical`, GTK `urgent`) gets its staying card with
buttons (2026-11-13, Ethan).

Rejected: `Main.messageTray.bannerBlocked` (Shell resets it whenever the date menu closes,
`ui/panel.js`; blocked, the queue only fills).

Updates come the same way: the freedesktop daemon sets `acknowledged = false` on a
`replaces_id`; a GTK notification with the same id replaces the old object. The pill updates.

## 2. The pill

M4 "Notifications as alerts" (2026-11-12, Ethan; [Design](design/index.md), alerts and
asks):

- **An alert, as GNOME 50's banner** (`_showNotification`, `_expandBanner`): the card (§3)
  on the app's pill for 5 s, buttons only under the pointer (`actionsOnHover`); then the
  pill. Critical: buttons at once, card stays (`alertStays`).
- **Seen only when you were there**: the card had its 5 s while you were present, or you
  hovered or clicked it (kit `onSeen`). Present = input in the last second (Shell's
  `IDLE_TIME`; `kit/services/presence.js`). A card arriving while idle waits and starts its
  5 s at your next input (`add_user_active_watch`); it closes, missed, when the session
  goes idle (`idle-delay`, org.gnome.SessionManager.Presence) or locks. Away or locked: no
  card.
- **Missed** (amber light): all not seen — card cut short, no card, held (§1), Do Not
  Disturb.
- **A burst** (`adapter.js` `Turns`): cards in arrival order; consecutive ones from one app
  are one turn ("Slack · 4 messages"). Each turn ≥ 1 s (`ALERT_TURN_MS`), the last 5 s; at
  most 2 turns wait (Shell's `MAX_NOTIFICATIONS_IN_QUEUE` = 3), others get only the pill.
  Critical first, never replaced. The card cross-fades between turns (100 ms out, 200 in);
  pills behind keep their places, then one pill per app, newest first.
- **Hover** pauses a burst: buttons show, counts as seen, the same app bumps the count;
  resumes 200 ms after leaving (Shell's `HIDE_TIMEOUT`). A card opening under a resting
  pointer is not hovered until it leaves and returns (`_onNotificationHoverChanged`). Click
  opens the app, × dismisses; the burst goes on.
- **Shared or recorded** (§5): one notification is a card naming the app; from the second,
  **one compact** (`sharedBurst`: logos stacked, "6 new notifications", "Slack 3 ·
  Telegram 2 · Gmail 1"), 5 s, counts bumped; no buttons, click does nothing, × closes;
  each app keeps its pill. All missed.

One pill per app (the desktop id, else the sent name; not per `Source`, which notify-send
makes per process); a new notification replaces its content.

| Part | What it shows |
|---|---|
| leading | the app's icon (the source's `icon`) |
| text | the notification's title; the app's name when it has none |
| trailing | how many of the notifications it has shown are still in GNOME's list, from 2 on |

- **How long:** card 5 s, then pill 3 s (`TTL` 8 s; 2026-11-16, Ethan), held while the
  card or pointer is on it; a new one restarts it.
- **Critical** (`Urgency.CRITICAL`): no ttl, `needsYou` (tier 1, PRIORITY.md §2) until
  activated, dismissed or withdrawn.
- **Priority:** the kind's 70; profiles move it.
- **Click:** `notification.activate()`, as GNOME's banner
  (`NotificationMessage.vfunc_clicked`). Kit `pressFirst`: never the tab first.
- **Gone from the list** (activated, dismissed, withdrawn, replaced): shows the app's
  previous notification, or ends. A GTK replacement arrives in the old one's end call, so
  the pill waits for that call to finish (no flicker).
- **Full screen:** no pill while hidden; the queue then shows as unseen pills, no card (§1).
- **The amber light** (2026-11-08, Ethan): on while GNOME's list holds unseen
  notifications — `unseenCount` minus the queue, as the date menu
  (`ui/dateMenu.js` `MessagesIndicator._updateCount`). Off when seen (tab, GNOME's list),
  not when Home shows. The source flags it (`stack.flagMissed`, apart from the stack's
  missed history) with a Home Missed row "Notifications · 3", the apps, opens the tab
  (`adapter.js` missedRow, 2026-11-12, design/home). Stays during Do Not Disturb, unlike
  GNOME's dot.

## 3. The compact (hover): a card

A notification's compact is a **card** (2026-11-07, Ethan: "at least like GNOME's
banner"), the kit shape `compact.card` (`kit/model/presentation.js` planCard,
`kit/ui/present/compact.js`), also used by §7. Layout: design/compact "Card thông báo"
(2026-11-12) — head (picture 40, app logo on its corner, sender over "App · time", round
× 32), message full width (2 lines of 16), buttons 12 from the edges; 104 tall without
buttons, 136 / 152 with; full compact width, ≤ 160.

| Part | What it shows |
|---|---|
| header | app icon, name, time since ("now", "3 min", "1 h"; re-read each minute while shown), × |
| picture | the notification's picture (avatar, thumbnail; rounded as art), else its own icon; else nothing |
| title | one line; else the body's start; else the app's name |
| body | markup removed, wrapped, ≤ 2 lines, then … |
| actions | the app's own, ≤ 3 in its order, equal widths; no row without |

- Click anywhere but a button activates it (§2). × is `destroy(DISMISSED)`, gone from
  GNOME's list too.
- A button runs `Action.activate()` (with an activation token); the notification goes
  unless `resident`. **Reply** opens the app: Shell 50 has no inline reply (the
  freedesktop spec has no text field), so neither has Buoy.
- More than three actions: the first three; GNOME's list and the tab have all.

## 4. Do Not Disturb

GNOME's switch (`org.gnome.desktop.notifications show-banners` false,
`ui/status/doNotDisturb.js`): all stay in the list, no banner unless critical. Buoy follows
it (§1): no pill; critical still gets its `needsYou` pill. The switch is in the tab (§6).
Red light for an `ask` meanwhile: SPEC §2a-i.

## 5. Privacy

- **Shared or recorded** (`ui/status/remoteAccess.js` ScreenSharingIndicator /
  ScreenRecordingIndicator `visible`, via `kit/services/sharing.js`): pill text the app's
  name; card header kept, title "New notification" ("N notifications"), no body or
  picture; actions stay (the app's labels). From the second, one compact (§2), unseen.
  Watched only while a notification pill is up; changes re-draw at once.
- **Profiles** (PROFILES.md): `hideBody` drops the body; `skip` drops the pill (GNOME's
  list keeps it, no banner).
- Lock screen: no banner, no pill (§1).

## 6. The Notifications tab (step 2)

Shell's own notifications (`Main.messageTray.getSources()`, each source's
`notifications`), live via `source-added` / `source-removed` / `notification-added` /
`notification-removed` while open; no store of Buoy's. Cards in app stacks (2026-11-07,
Ethan).

- **Icon:** GNOME's bell with a dot at top right while the list is not empty (2026-11-08,
  Ethan), drawn by the kit (module `badge()`, `kit/model/tabs.js`): the icon's grey (white
  on the open tab; no amber), ringed in the strip's colour, as Yaru's
  `message-indicator-symbolic` but not that icon (one look on every theme). Read when the
  strip is planned; re-asked after Clear or ×.
- **Bar:** "N missed" (amber, with dot), "N notifications", a Do Not Disturb chip (accent
  while on; `show-banners` inverted, synced with the quick toggle), Clear. App view: ‹ app
  · N (back), Dismiss all.
- **A stack per app**, newest first: its newest card, one or two layers under it, a count
  when more. Click: several → the app's view; one → the card's click.
- **Card:** tile #1c1c1e, r 16: logo 32, "app · time" (re-read each minute) over a bold
  title and one body line, amber dot when unseen. Hover or focus: first two actions and ×
  replace the count; a stack's × dismisses the app's. Click or action activates and closes
  the island (SPEC §3).
- **Icons** (2026-11-07, Ethan): stacks show the app's logo; the app view the
  notification's picture (`image-data` / `image-path`, GTK bytes icon), else its own icon
  if different, else the logo.
- **Missed while away:** `acknowledged` false (Do Not Disturb, full queue, held, §1).
  Opening the tab marks them seen (as `ui/messageList.js` `vfunc_map`); their dot stays
  until it closes. One arriving while open is seen, no pill. Notifications never enter the
  stack's missed history; Home's Missed keeps the other kinds (2026-11-07, replaces SPEC
  §3's 2026-11-03 plan).
- **Dismiss syncs both ways:** × destroys (DISMISSED); dismissed or withdrawn in GNOME
  leaves the tab at once. **Clear** destroys all (`ui/messageList.js` clear()).
- **Empty:** Bu asleep over "All caught up" (kit EmptyState), Do Not Disturb chip on top.
- **Shared:** "New notification", no picture (§5).

## 7. Shell's screenshot notice (step 3)

"Screenshot captured" / "Screencast recorded" (`ui/screenshot.js` `_storeScreenshot`) are
ordinary notifications: pill "Screen Capture", card with the thumbnail (`gicon`), "Show in
Files", click opens the file. No override (2026-11-08, Ethan). Rejected: a ~3 s pill, the
thumbnail in minimal, Delete.

**Transient notifications go when their pill ends.** Shell sends both with
`isTransient: true`, and GNOME destroys such one when its banner hides
(`_hideNotificationCompleted`: EXPIRED). So the stack calls `onExpire()` when the ttl
ends the activity (never on `end()`) and the source destroys the app's transient
notifications (EXPIRED); also a freedesktop `transient` hint. Hover holds both. Never missed.

## 8. Steps

1. **The pill** (merged 2026-11-07, #143): §1–§5; `notification-replace-banners`.
2. **The tab** (merged 2026-11-08, #144): §6.
3. **The screenshot notice** (2026-11-08): §7.

## 9. Settings

| Key | Default | |
|---|---|---|
| `modules-notification` | on | the module: the pill and the tab |
| `notification-replace-banners` | on | GNOME's banners become pills; off, GNOME shows its own and Buoy only lists them |

## 10. Notifications another module shows

Files' "N file operations active" / "All file operations have been completed" (GTK ids
`progress`, `transfer-complete`) are the Transfers pill (FEATURES M3 "progress"): with
the progress module on, no pill or banner; off, as any notification.

Claude's own (2026-11-13, Ethan): posted per session ("Buoy — Implementation") when a turn
ends or waits. If its app id says Claude and an agent activity with that session's name is
on the island (`stack.find`, adapter.js `agentShows`): no pill, marked read (no amber);
GNOME's list keeps it. Other Claude notifications as any.

## 11. Tests

- `tests/notification.test.js`: title / app-name fallback; count from 2; critical →
  `needsYou`, no ttl; markup stripped, whitespace on one line; ≤ 3 actions then ×, none →
  × alone; shared → app name, no picture, count line; `hideBody`; long text not cut;
  Files' ids skipped only with progress on; `agentShows`.
- Headless Shell: `notify-send` with actions and critical; GTK app (`gapplication`);
  click activates; × dismisses from GNOME's list; replace by id; Do Not Disturb → no pill,
  critical still; setting off → GNOME's banner; disable → nothing left, the original
  `_showNotification` back.
