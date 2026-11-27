# Pill order — which activity is pill 1

Which activity takes the centre, which go to the side pills and which wait behind `+N`. One
rule, in `kit/model/stack.js`, so no module guesses a number (2026-11-07, Ethan). SPEC §2 and
§2c point here.

## Principles

1. **State before kind.** What needs you, then what runs, then what only waits. The app matters
   only inside the same state.
2. **Adapters say the state, not a number.** A module marks an activity `needsYou` or `linger`;
   the kit ranks it. One stand-in (2026-11-08, Ethan): while an agent's question sits in
   Claude's own card (a prompt Buoy does not draw), the session's pill takes the `ask` priority.
3. **Moments are not ranks.** Feedback, an alert, an ask opening overlay the order; after them
   the order is as it was.

## 1. The order

Every visible activity is ranked by, in turn:

1. **Its tier** (§2): needs you › running › waiting.
2. **Its priority** inside the tier: the kind's (§3), or the user's profile or a D-Bus caller's.
3. **Fresh before stale**: one past its `staleAfter` goes after one that is not.
4. **The most recent first**: the last surfaced. An activity whose state changes for good (an
   agent stops, a player plays again) is surfaced anew, so it counts as new.

The first is pill 1, the next two the side pills (SPEC §2c), the rest `+N`. Nothing else orders
pills.

## 2. Tiers

| Tier | Flag | What is in it |
|---|---|---|
| **1. Needs you** | `needsYou: true`; kinds `ask` and `call` always | a permission prompt, a D-Bus `Ask()`, a call, an agent waiting for you (`turn`) or asking in Claude's card (the ask's 90, 2026-11-08) |
| **2. Running** | neither | music playing, a timer, a transfer, an agent at work, a notification, a device just plugged |
| **3. Waiting** | `linger: true`, **once stale** | a paused player, an agent done or stopped with an error |

- **A waiting activity steps back when it dims, not before** (2026-11-07, Ethan): until its
  `staleAfter` it ranks as running, so "Done" or a just-paused track keeps the centre a moment,
  then dims and drops to tier 3 in one change. Waiting activities use `staleAfter` **10 s**
  (`SETTLE_MS` in `kit/model/activity.js`). A running activity that goes stale (an agent with no
  news for 1 min) stays in tier 2, behind fresh ones (§1.3).
- `needsYou` beats `linger`: an agent waiting for you still ends after `activity-linger` without
  news (SPEC §2) but sits in tier 1.
- No priority, however high, lifts an activity across tiers.

## 3. Priorities inside a tier

The kind's default (`kit/model/activity.js` `PRIORITY`):

| Kind | Priority | | Kind | Priority |
|---|---|---|---|---|
| `media` | 10 | | `screen` | 55 |
| `timer` | 20 | | `osd`, `input` | 60 |
| `calendar` | 25 | | `notification` | 70 |
| `progress`, `print` | 30 | | `phone` | 75 |
| `device`, `bluetooth`, `usb`, `network`, `agent` | 35 | | `greeting` | 85 |
| `power` | 40 | | `ask` | 90 |
| `copied` | 45 | | `call` | 95 |
| `attention`, `terminal` | 50 | | | |

- A **profile** (PROFILES.md) may set `priority` 0–100: it moves the app inside its tier only.
- A **D-Bus caller** (DBUS.md) may send `priority` the same way, and `needsYou` / `linger` to
  choose the tier (`Version` 3).
- Adapters do not set `priority`.

## 4. Overlays — moments on top of the order

| Overlay | What it does | How long |
|---|---|---|
| Feedback (`osd`, `input`, `copied`) | covers pill 1 in place; the covered one keeps its slot (SPEC §2e, `pillWindow`) | its ttl, ~1.5 s; never over an `ask` |
| Alert | brings an activity not shown to the centre | 5 s (`ALERT_MS`), longer while hovered |
| Ask / transient opening | an ask opens its card on its pill (SPEC §2); a transient opens expanded | until answered or closed; a `quiet` ask does not open |

They change what is drawn for a moment, not the ranking.

## 5. Not part of the order

- Never drawn, so never ranked: `apps-hidden`, an activity's own `hidden` (an agent's session
  behind its prompt), an ask dismissed into the red light.
- Scheduled activities: ranked when they start.

## 6. Changes from what was there

*Built 2026-11-07* in `kit/model/stack.js` (§1), `kit/model/activity.js` (`needsYou`,
`SETTLE_MS`, the tier; the stack re-renders on stale), the agent adapter (`turn` and the
prompt's session set `needsYou`; done `staleAfter` 10 s), the media adapter (paused `staleAfter`
10 s) and source (§1.4), and D-Bus `Version` 3.

## 7. Tests

- Tiers: a waiting 100 under a running 10 once stale, over it before; `needsYou` 10 over a
  running 70; `needsYou` + `linger` in tier 1; a running stale one stays in tier 2.
- Inside a tier: priority, fresh, newest. Re-surfaced: a player playing again leads a paused
  one; an agent just stopped leads one stopped earlier.
- Overlays: feedback covers pill 1 and gives it back; an alert promotes for 5 s.
- Profiles and D-Bus: `priority` moves inside the tier only.
