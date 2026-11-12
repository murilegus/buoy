# Notifications — GNOME's notifications on the island

The reference for showing the desktop's notifications on Buoy: the pill that replaces
GNOME's banner, its compact with the notification's own buttons, Do Not Disturb, what
hides while the screen is shared, the Notifications tab and Shell's screenshot notice.
FEATURES M3 "notifications" points here. Decided with Ethan, 2026-11-07; built in three
steps (§8).

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
notification GNOME would have shown leaves the queue as an alert on its app's pill instead,
its sound played as the banner would have. No banner is built. It is marked seen
(`acknowledged = true`) only by the rule in §2 (2026-11-12), not when it shows. Off: the
original runs and GNOME shows its banner; Buoy shows no pill (the tab still lists
everything, §6).

**Held, still unseen** (2026-11-08): Shell takes a notification out of the queue in the
same call that queued it unless it holds the queue — full screen, busy, the lock screen.
One that waited (2 s or more, stamped on the tray's `queue-changed`) still shows as a
pill when the screen is back and plays its sound, but is not marked seen: it came while
nobody could look, and its pill is a 6 s glance shared with the app's others, not
GNOME's banner that waits for the user to be active. The tab counts it as missed (§6).
GNOME's own banner would have marked it seen; with replacement off, GNOME decides.

Why not `Main.messageTray.bannerBlocked`: Shell sets it itself, to false, each time the
date menu closes (`ui/panel.js`), and while blocked the queue only fills. The override is
the one place that sees exactly the banners.

An update to a notification already shown comes back the same way: the freedesktop
daemon sets `acknowledged = false` on a `replaces_id`, which asks for a banner again; a
GTK app's notification with the same id is a new object that replaces the old. Either
way the app's pill updates.

## 2. The pill

Since M4 "Notifications as alerts" (2026-11-12, Ethan; drawings and rules in
[design/alerts-and-asks](design/alerts-and-asks/index.vi.md)):

- **An alert, as GNOME 50's banner** (`ui/messageTray.js` `_showNotification`,
  `_expandBanner`): the card (§3) opens on the app's pill for 5 s, the title and up to two
  lines of body, its buttons only under the pointer (`actionsOnHover`); then the pill.
  Critical: the buttons at once, and the card stays until it is dealt with (`alertStays`).
- **Seen only when you were there**: its card had its 5 s while you were present, or you
  hovered or clicked it (the kit's `onSeen`); only then `acknowledged = true`. Present: input
  in the last second (Shell's `IDLE_TIME`, the core idle monitor; `kit/services/presence.js`).
  A card that comes while you are idle waits, with no limit, and starts its 5 s at your next
  input (`add_user_active_watch`, as Shell's banner); it closes, missed, when the session
  turns idle (`idle-delay`, org.gnome.SessionManager.Presence) or the screen locks. Away or
  locked, a new one gets no card.
- **Missed** (the amber light): everything not seen by that rule — a card cut short, one with
  no card, one that waited in Shell's queue (full screen, locked: §1), Do Not Disturb (Shell
  shows no banner, so no card).
- **A burst** (`adapter.js` `Turns`): cards in arrival order; consecutive ones from one app
  are one turn (the newest, "Slack · 4 messages" in the header); the same app after another
  is a turn of its own. Each turn at least 1 s (`ALERT_TURN_MS`), the last one 5 s; besides
  the card at most 2 turns wait (Shell's `MAX_NOTIFICATIONS_IN_QUEUE` = 3); one that finds no
  room gets no card, only its app's pill. A critical one goes first and is never replaced.
  The card stays open between turns, its content cross-fading (100 ms out, 200 ms in), and the
  pills behind it keep their places until it closes; then one pill per app, the newest
  first.
- **Hover during a burst** pauses it: the card stays, shows its buttons and counts as seen;
  a message from the same app only bumps the count; the 1 s and 5 s run only off the card;
  leaving resumes after 200 ms (Shell's `HIDE_TIMEOUT`). A card that opens under a resting
  pointer is not hovered until the pointer leaves and comes back
  (`_onNotificationHoverChanged`). A click opens the app (the card closes, the burst goes
  on); × dismisses that notification (the burst goes on).
- **Shared or recorded screen** (§5): one notification is a card naming only the app; from
  the second, the burst is **one compact** (`sharedBurst`: the apps' logos stacked, "6 new
  notifications", "Slack 3 · Telegram 2 · Gmail 1"), 5 s, later ones only bump the counts;
  no buttons, a click opens nothing, × closes it; each app keeps its pill. All of it is
  missed: nobody read what was hidden.

One pill per app (its id: the desktop id, else the name it sends; not per Shell `Source`,
which notify-send makes once per process): a new notification from the same app replaces the
pill's content instead of adding a pill.

| Part | What it shows |
|---|---|
| leading | the app's icon (the source's `icon`) |
| text | the notification's title; the app's name when it has none |
| trailing | how many of the notifications it has shown are still in GNOME's list, from 2 on |

- **How long:** its card's 5 s, then 6 s as a pill (`TTL` 11 s), held while its card is up
  or the pointer is on it. A new notification from the app starts it again.
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
- **Full screen:** GNOME holds banners, so no pill appears while the island is hidden; the
  queue shows when it is back, as pills with no card, still unseen (§1), so the tab counts
  them.
- **The amber light** (2026-11-08, Ethan): on while GNOME's list holds notifications
  nobody has seen — the date menu's own count, `unseenCount` less the queue
  (`ui/dateMenu.js` `MessagesIndicator._updateCount`), so a notification about to show is
  not counted: one that came during Do Not Disturb, past a full queue, or held while full
  screen. It goes off when they are seen (the tab, or GNOME's list), not when Home is
  shown: the source flags it (`stack.flagMissed`), apart from the stack's missed history.
  GNOME hides its own dot during Do Not Disturb; Buoy's light stays, since that is when
  notifications are missed.

## 3. The compact (hover): a card

> Laid out as design/compact "Card thông báo" (M4 "Compact layout", 2026-11-12): the compact's
> head (the picture 40 with the app's logo on its corner, the sender over "App · time", ×
> round 32), the message under it across the full width (2 lines of 16), the buttons in a row
> 12 from the edges; 104 without buttons, 136 / 152 with. As an alert its buttons show only
> under the pointer (§2). The sketch and sizes below are v0.1's.

The compact of the other kinds (a leading, one title, one subtitle, buttons beside them,
56 / 88 / 120 px) is too tight for a message (Ethan, 2026-11-07: "at least like GNOME's
banner"). A notification's compact is a **card** — GNOME's banner layout inside the
island's black: a kit shape (`compact.card`, `kit/model/presentation.js` planCard,
`kit/ui/present/compact.js`), the first user; the screenshot notice (§7) and later a phone message or
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
  module uses, `kit/services/sharing.js`): the pill's text is the app's name; the card keeps its
  header (app, time, ×) and says "New notification" (or "N notifications") as its title,
  with no body and no picture. The actions stay: their labels are the app's, not the
  message. From the second notification, the burst is one compact instead (§2), and none of
  it counts as seen. Watched only while a notification pill is up; a change re-draws it at
  once.
- **Profiles** (PROFILES.md): `hideBody` keeps the body from the adapter for that app
  (the card shows the title alone); `skip` drops a notification from the pill
  (GNOME's list keeps it, and no banner shows either).
- The lock screen shows no banner (§1), so no pill.

## 6. The Notifications tab (step 2)

The tab lists Shell's own notifications — `Main.messageTray.getSources()`, each source's
`notifications`, kept live with `source-added` / `source-removed` and each source's
`notification-added` / `notification-removed` while the tab is open: the same objects
GNOME's list shows, no store of Buoy's. Redesigned the same day (Ethan, 2026-11-07: the
first flat list "too dull"): cards in app stacks.

```
List                                             An app's view (a stack clicked)
┌ ● 2 missed  5 notifications   [☾ DND] [Clear] ┐ ┌ ‹ Telegram · 3              [Dismiss all] ┐
│ ┌───────────────────────────────────────────┐ │ │ ┌───────────────────────────────────────┐ │
│ │ [logo] Telegram · now ●                3  │ │ │ │ [avatar] now                          │ │
│ │        Lan                                │ │ │ │          Minh                          │ │
│ │        Lunch at 12? Let's try…            │ │ │ │          Sent you a photo              │ │
│ └───────────────────────────────────────────┘ │ │ └───────────────────────────────────────┘ │
│   └─────────────────────────────────────┘     │ │ ┌───────────────────────────────────────┐ │
│ ┌───────────────────────────────────────────┐ │ │ │ [logo] now      [Reply] [Read]  ✕     │ │  ← hover
│ │ [logo] Calculator · 12 min                │ │ │ │        Lan                            │ │
└───────────────────────────────────────────────┘ └───────────────────────────────────────────┘
```

- **The tab's icon:** GNOME's bell, with a dot at its top right while the list has any
  notification (2026-11-08, Ethan). The kit draws it over the icon (a module's `badge()`,
  `kit/model/tabs.js`): small, in the icon's own grey (white on the open tab; no amber: one
  look with the strip), ringed in the strip's colour so it reads as cut out of the bell,
  as Yaru's `message-indicator-symbolic` (the bell with a dot Ubuntu's top bar shows;
  GNOME's own is a bare dot). Not that icon itself (Ethan: one look on every theme). Read when the strip is planned, so only while the island is
  open; the tab asks for it again after Clear or ×.
- **The bar:** "N missed" (amber, with the light's dot) when some were unseen, "N
  notifications", a Do Not Disturb chip lit with the accent while on (GNOME's own
  `show-banners`, inverted, as the quick toggle `ui/status/doNotDisturb.js`; either
  changes the other) and Clear. In an app's view: ‹ the app · N (back) and Dismiss all.
- **A stack per app** (as the pill, §2), the app with the newest notification first: its
  newest notification as a card, one or two thin layers under it and the count when it
  holds more. A click on a stack of several opens the app's view; on a single one it is
  the card's click.
- **A card:** a dark grey rounded tile (#1c1c1e, r 16) — the app's logo 32, "app · time"
  ("now", "3 min", re-read each minute) over a bold title and one line of body, an amber
  dot when it was unseen. On hover (or keyboard focus) its own actions (the first two)
  and × take the right side, in place of the count; a stack's × dismisses the app's
  notifications. A click activates it and closes the island (as a clicked notification
  goes, SPEC §3); an action runs and closes it too.
- **Icons** (Ethan, 2026-11-07): a stack shows the app's logo; the app's view shows what
  the notification brings — its picture (a chat's avatar, a thumbnail: `image-data` /
  `image-path`, a GTK bytes icon), else its own icon when it differs from the app's, else
  the logo.
- **Missed while away:** the notifications nobody has seen — Shell's `acknowledged` false:
  they came while Do Not Disturb was on, the banner queue was full (GNOME keeps three),
  or they waited in it while full screen, busy or locked (§1). Opening the tab marks them seen, as GNOME's list does
  once it is shown (`ui/messageList.js` `vfunc_map`); their dot stays until the tab
  closes. One that arrives while the tab is open is in sight: seen at once, and no pill
  for it. (Decided 2026-11-07, replacing SPEC §3's 2026-11-03 plan of moving Home's Missed
  section here: notifications never reach the stack's missed history — Shell holds
  banners while full screen or busy, and Shell's `acknowledged` already says which were
  seen — and Home's Missed keeps the other kinds.)
- **Dismiss syncs both ways:** × destroys Shell's notification (DISMISSED), so GNOME's
  list loses it; one dismissed in GNOME's list (or withdrawn by the app) leaves the tab
  at once. **Clear** destroys every one (GNOME's Clear closes every message,
  `ui/messageList.js` clear()).
- **Empty:** Bu asleep over "All caught up" (the kit's EmptyState, which takes an actor
  above its text), with the Do Not Disturb chip still on top.
- **Shared screen:** cards name the app and "New notification", no picture (§5).

## 7. Shell's screenshot notice (step 3)

"Screenshot captured" / "Screencast recorded" (`ui/screenshot.js` `_storeScreenshot`,
`_showNotification`) are ordinary notifications, so step 1 already shows them: the pill
("Screen Capture", the title), the card with the thumbnail (the notification's `gicon`),
"Show in Files" (Shell's own action) and a click that opens the file (its `activated`).
Decided 2026-11-08 (Ethan, seeing it): that is enough — no override of its own. The
2026-11-05 extras are dropped: a ~3 s pill (it keeps the 6 s of any notification), the
thumbnail in minimal (the app's icon), and Delete.

**Transient notifications go when their pill ends.** Shell sends both with
`isTransient: true`; GNOME destroys such a notification when its banner hides
(`ui/messageTray.js` `_hideNotificationCompleted`: EXPIRED), so it never stays in the
list. The pill skips the banner, so its ttl does the same: the stack calls the
activity's `onExpire()` when the ttl ends it (never on `end()`), and the source destroys
the app's transient notifications (EXPIRED). A freedesktop notification with the
`transient` hint is the same (`ui/notificationDaemon.js`). Hovering holds the pill, and
the notification with it; × and a click end it as before. Never missed either way: it is
gone before the tab could count it.

## 8. Steps

1. **The pill** (merged 2026-11-07, #143): §1–§5; `notification-replace-banners`.
2. **The tab** (merged 2026-11-08, #144): §6.
3. **The screenshot notice** (2026-11-08): §7 — step 1 shows it; transient notifications
   now go when their pill ends.

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
  most 3 then ×, none → × alone; shared → the app's name, no picture, the count line;
  `hideBody` (no body) → the app's name; long text not cut; Files' ids skipped only while
  progress is on.
- Headless Shell: `notify-send` (freedesktop) with actions and a critical one; a GTK app
  (`gapplication`, GNotification); click activates; × dismisses from GNOME's list;
  replace by id; Do Not Disturb on → no pill, critical still; the setting off → GNOME's
  banner again; disable → nothing left, the original `_showNotification` back.
