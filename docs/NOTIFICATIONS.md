# Notifications — GNOME's notifications on the island

The reference for showing the desktop's notifications on Buoy: the pill that replaces
GNOME's banner, its compact with the notification's own buttons, Do Not Disturb, what
hides while the screen is shared, and (next) the Notifications tab and Shell's
screenshot notice. FEATURES M3 "notifications" points here. Decided with Ethan,
2026-11-07; built in three steps (§8).

Shell source read for this (gnome-50): `ui/messageTray.js` (MessageTray, Source,
Notification, `_onNotificationRequestBanner`, `_updateState`, `_showNotification`,
`_updateShowingNotification`), `ui/notificationDaemon.js` (the freedesktop and GTK
daemons, their sources), `ui/messageList.js` (NotificationMessage), `ui/status/doNotDisturb.js`,
`ui/panel.js` (`bannerBlocked` around the date menu).

## Principles

1. **GNOME decides, Buoy draws.** Whether a notification deserves a banner — Do Not
   Disturb, urgency, a full-screen window, the lock screen, an app's own "show banners"
   switch in Settings — stays Shell's call. Buoy shows a pill exactly where GNOME would
   have shown a banner, and nothing else.
2. **The notification is Shell's, never a copy.** The pill acts on the real object:
   a click activates it, a button runs its action, × dismisses it. GNOME's list and Buoy
   always agree, because there is only one list. Buoy posts no notifications of its own.
3. **Short, unless it needs you.** A notification is a moment: pill 1 for a few seconds,
   then the list keeps it. Only a critical one (a low battery, a failing disk) stays
   until you deal with it.
4. **Nothing private on a shared screen.** While the screen is shared or recorded, the
   pill names the app, not what the message says.

## 1. Where Buoy takes over

GNOME shows a banner in `MessageTray._updateState()`: when no banner is up and the queue
has one that may show now (not while busy or full-screen, unless critical or feedback),
it calls `_showNotification()`, which builds the banner and marks the notification seen
(`_updateShowingNotification`: `acknowledged = true`, its sound). Everything before that
point is GNOME's rule:

- `_onNotificationRequestBanner` drops an already-seen notification, a `LOW` one, and
  one whose app may not show banners (`policy.showBanners`: the Do Not Disturb switch
  and the app's own switch in Settings → Notifications), except a critical one;
- `_updateState` holds the queue while a full-screen window covers the primary monitor
  or the session is busy, and shows nothing without `sessionMode.hasNotifications`
  (the lock screen).

With `notification-replace-banners` on, Buoy overrides `_showNotification` (on the
prototype, through Shell's `InjectionManager`, as the hud module does for the OSD): each
notification GNOME would have shown leaves the queue as a pill instead — marked seen and
its sound played, as the banner would have. No banner is built. Off: the original runs
and GNOME shows its banner; Buoy shows no pill (the tab still lists everything, §6).

Why not `Main.messageTray.bannerBlocked`: Shell sets it itself, to false, each time the
date menu closes (`ui/panel.js`), and while blocked the queue only fills. The override is
the one place that sees exactly the banners.

An update to a notification already shown comes back the same way: the freedesktop
daemon sets `acknowledged = false` on a `replaces_id`, which asks for a banner again; a
GTK app's notification with the same id is a new object that replaces the old. Either
way the app's pill updates.

## 2. The pill

One pill per app (its id: the desktop id, else the name it sends; not per Shell `Source`,
which notify-send makes once per process): a new notification from the same app replaces the
pill's content instead of adding a pill.

| Part | What it shows |
|---|---|
| leading | the app's icon (the source's `icon`) |
| text | the notification's title; the app's name when it has none |
| trailing | how many of the notifications it has shown are still in GNOME's list, from 2 on |

- **How long:** 6 s (`TTL`), held while the pointer is on it (the kit's hover hold). A
  new notification from the app starts the 6 s again.
- **Critical** (`Urgency.CRITICAL`): no ttl, `needsYou` — tier 1 (PRIORITY.md §2); it
  stays until it is activated, dismissed or withdrawn by the app.
- **Priority:** the kind's 70 inside the running tier; profiles move it as for any app.
- **Click:** activates the notification, as a click on GNOME's banner does
  (`NotificationMessage.vfunc_clicked` → `notification.activate()`): the app opens where
  the notification points (a Firefox notification brings up its tab). The kit's
  `pressFirst`: the click never opens the tab first.
- **Gone from the list** (activated, dismissed in GNOME's list, withdrawn by the app,
  replaced): the pill shows the app's previous notification it still holds, or ends.
  A GTK replacement arrives in the same call as the old one's end, so the pill waits for
  the end of that call before ending (no flicker).
- **Missed:** GNOME holds banners while full-screen, so no pill appears while the island
  is hidden; the queue shows when it is back (as GNOME's banners do). The missed light
  stays with Buoy's own activities.

## 3. The compact (hover): a card

The compact of the other kinds (a leading, one title, one subtitle, buttons beside them,
56 / 88 / 120 px) is too tight for a message (Ethan, 2026-11-07: "at least like GNOME's
banner"). A notification's compact is a **card** — GNOME's banner layout inside the
island's black: a kit shape (`compact.card`, `kit/presentation.js` planCard,
`kit/present.js`), the first user; the screenshot notice (§7) and later a phone message or
a calendar alert may use it too.

```
┌──────────────────────────────────────────────┐
│ ✉ Telegram · now                          ✕  │  header
│ ┌──┐ Lan                                     │  title, one line
│ │  │ Lunch at 12? Let's try the new place on │  body, up to 2 lines
│ └──┘ Le Loi and Nguyen Hue…                  │
│ [     Reply     ] [   Mark as Read   ]       │  actions, equal widths
└──────────────────────────────────────────────┘
```

| Part | What it shows |
|---|---|
| header | the app's icon (16), its name, the time since it came ("now", then "3 min", "1 h"; re-read once a minute while shown), × at the end |
| picture (40, left) | the notification's own picture (an avatar, a thumbnail: a file or image icon, rounded as art), else its own icon; nothing when it has neither |
| title | the notification's title, one line; the body's start when it has no title, the app's name when it has neither |
| body | the body (markup removed: the freedesktop body may carry `<b>`, `<a>`…), wrapped, at most 2 lines, then … |
| actions | the notification's own actions, at most 3 (in the app's order), in a row of equal widths; no row without actions |

- **Size:** the compact's full width (0.72 × expanded: 404 px at 1920, 516 at 2560, 548
  at 3440), the height of its content up to **160 px** (the other compacts keep 56 / 88
  / ≤ 120; SPEC §4). Header, a title and one line with no picture and no actions measure
  ~76 px; picture, 2 lines and actions ~150.
- A click anywhere on the card but a button activates the notification (§2).
- The **actions** are the app's: Reply / Mark as Read / Open / Delete, whatever it sent.
  A press runs Shell's `Action.activate()` (the app gets its `ActionInvoked` or its GTK
  action, with an activation token so its window may come up) — and the notification
  goes, unless it is `resident`, as in GNOME's banner. **Reply** opens the app where you
  answer: GNOME's banner has no inline reply in Shell 50 (the freedesktop spec has no
  text field; KDE's `inline-reply` is not GNOME's); neither has Buoy.
- **×** dismisses it from GNOME's list too (`destroy(DISMISSED)`, the banner's close).
- More than three actions sent: the first three show. GNOME's list (and the tab, §6) has
  all.

## 4. Do Not Disturb

Do Not Disturb is GNOME's own switch (`org.gnome.desktop.notifications show-banners`
false; the toggle under the notification list, `ui/status/doNotDisturb.js`). It keeps
every notification in the list but shows no banner — except a critical one. Buoy
follows it as it is (§1): no pill while it is on, a critical notification still gets
its `needsYou` pill. The switch itself comes to the Notifications tab (§6). The red light
for an `ask` while Do Not Disturb is SPEC §2a-i's (FEATURES "Buoy light").

## 5. Privacy

- **Screen shared or recorded** (Shell's own indicators, `ui/status/remoteAccess.js`
  ScreenSharingIndicator / ScreenRecordingIndicator `visible`, the same watch the agent
  module uses, `kit/sharing.js`): the pill's text is the app's name; the card keeps its
  header (app, time, ×) and says "New notification" (or "N notifications") as its title,
  with no body and no picture. The actions stay: their labels are the app's, not the
  message. Watched only while a notification pill is up; a change re-draws it at once.
- **Profiles** (PROFILES.md): `hideBody` keeps the body from the adapter for that app
  (the card shows the title alone); `skip` drops a notification from the pill
  (GNOME's list keeps it, and no banner shows either).
- The lock screen shows no banner (§1), so no pill.

## 6. Next: the Notifications tab (step 2)

The tab lists Shell's own notifications (`getSources()` + `source-added`, each source's
`notifications` + `notification-added`): no store of Buoy's. Grouped by app, newest
first; each row its icon, title, body, time, the actions and ×; a row's click activates.
Dismissing here or in GNOME's list removes it from both. "Clear all" at the top, with the
Do Not Disturb switch. Home's Missed group moves to the top of this tab ("Missed while
away"), each missed notification pointing to the real one (SPEC §3).

## 7. Next: Shell's screenshot notice (step 3)

"Screenshot captured" / "Screencast recorded" (`ui/screenshot.js`) through an override of
that notification: pill 1 ~3 s, never missed, thumbnail minimal; compact with "Show in
Files", Delete (to the Trash) and a click that opens it (SPEC §2e).

## 8. Steps

1. **The pill** (this branch): §1–§5; `notification-replace-banners`.
2. **The tab**: §6.
3. **The screenshot notice**: §7.

## 9. Settings

| Key | Default | |
|---|---|---|
| `modules-notification` | on | the module: the pill and the tab |
| `notification-replace-banners` | on | GNOME's banners become pills; off, GNOME shows its own and Buoy only lists them |

## 10. Notifications another module shows

Files' "N file operations active" and "All file operations have been completed" (GTK
ids `progress` and `transfer-complete`) are the Transfers pill already (FEATURES M3
"progress"): while the progress module is on, they get no notification pill of their own
(and no banner). Off, they come as any notification.

## 11. Tests

- Adapter (`tests/notification.test.js`): title / app-name fallback; count from 2;
  critical → `needsYou`, no ttl; markup stripped and whitespace on one line; actions at
  most 2 then ×, none → × alone; shared → the app's name, no picture, the count line;
  `hideBody` (no body) → the app's name; long text not cut; Files' ids skipped only while
  progress is on.
- Headless Shell: `notify-send` (freedesktop) with actions and a critical one; a GTK app
  (`gapplication`, GNotification); click activates; × dismisses from GNOME's list;
  replace by id; Do Not Disturb on → no pill, critical still; the setting off → GNOME's
  banner again; disable → nothing left, the original `_showNotification` back.
