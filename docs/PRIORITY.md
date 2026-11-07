# Pill order — which activity is pill 1

The reference for the order of the pills: which activity takes the centre, which go to
the side pills and which wait behind `+N`. One rule, in one place (`kit/stack.js`), so
a module never has to guess a number to land where it should. Decided with Ethan,
2026-11-07, after a paused player kept the centre over one that played and a finished
agent needed a priority of its own to step aside. SPEC §2 and §2c point here.

## Principles

1. **State before kind.** What needs you comes first, then what is running, then what
   only waits. Which app it is matters only inside the same state.
2. **Adapters say the state, not a number.** A module marks an activity `needsYou` or
   `linger`; the kit ranks it. No adapter picks a priority to win or lose (today's
   agent 60 and 5 go).
3. **Moments are not ranks.** Feedback, an alert, an ask opening are short overlays on
   top of the order; when they pass, the order is what it was.

## 1. The order

Every visible activity is ranked by, in turn:

1. **Its tier** (§2): needs you › running › waiting.
2. **Its priority** inside the tier: the kind's (§3), or what the user's profile or a
   D-Bus caller set.
3. **Fresh before stale**: one past its `staleAfter` goes after one that is not.
4. **The most recent first**: the last one surfaced. An activity whose state changes
   for good (an agent that stops, a player that starts again) is surfaced anew, so it
   counts as new.

The first is pill 1 at the centre, the next two the side pills (SPEC §2c), the rest
`+N`. Nothing else orders pills.

## 2. Tiers

| Tier | Flag the adapter sets | What is in it |
|---|---|---|
| **1. Needs you** | `needsYou: true`; kinds `ask` and `call` always | a permission prompt, a D-Bus `Ask()`, a call, an agent waiting for your answer (`turn`) |
| **2. Running** | neither flag | music playing, a timer, a transfer, an agent at work, a notification, a device just plugged |
| **3. Waiting** | `linger: true` | a paused player, an agent done or stopped with an error |

- `needsYou` wins over `linger`: an agent waiting for you lingers (it ends after
  `activity-linger` without news, SPEC §2) and still sits in tier 1.
- `linger` already means "ends after `activity-linger`"; the same flag now also says
  "behind what runs". One fact, two effects.
- A tier is never set by a number: no priority, however high, lifts a waiting activity
  over a running one.

## 3. Priorities inside a tier

The kind's default (`kit/activity.js` `PRIORITY`), unchanged:

| Kind | Priority | | Kind | Priority |
|---|---|---|---|---|
| `media` | 10 | | `copied` | 45 |
| `timer` | 20 | | `attention` | 50 |
| `calendar` | 25 | | `osd`, `input` | 60 |
| `progress` | 30 | | `notification` | 70 |
| `device`, `agent` | 35 | | `phone` | 75 |
| `power` | 40 | | `ask` | 90 |
| | | | `call` | 95 |

- A **profile** (`~/.config/buoy/apps/<app>.json`, PROFILES.md) may set `priority`
  0–100: it moves the app inside its tier, never across.
- A **D-Bus caller** (DBUS.md) may send `priority` the same way, and `needsYou` /
  `linger` to choose the tier (new keys, `Version` 3).
- Adapters do not set `priority`.

## 4. Overlays — moments on top of the order

| Overlay | What it does | How long |
|---|---|---|
| Feedback (`osd`, `input`, `copied`) | covers pill 1 in place; the covered one keeps its slot (SPEC §2e, `pillWindow`) | its ttl, ~1.5 s; never over an `ask` |
| Alert | brings an activity that is not shown to the centre | 2 s (`ALERT_MS`), longer while hovered |
| Ask / transient opening | pill 1 opens expanded when it arrives at the centre | until answered or closed; a `quiet` ask does not open |

They change what is drawn for a moment, not the ranking.

## 5. Not part of the order

- `apps-hidden`, an activity's own `hidden` (an agent's session behind its prompt), an
  ask dismissed into the red light: live, never drawn, so never ranked.
- Scheduled activities: ranked when they start.

## 6. Changes from today (to build)

- `kit/stack.js`: rank by tier, then priority, then fresh, then recent (§1); `ask` and
  `call` are tier 1 by kind; `needsYou` validated in `kit/activity.js`.
- Agent adapter: `turn` and the permission prompt's session set `needsYou`; drop
  `PRIORITY.turn` 60 and `PRIORITY.done` 5 (done is `linger`, so tier 3 by itself).
- Media adapter: nothing new (paused is already `linger`): a paused player falls behind
  one that plays.
- Media source: a player that starts playing again is surfaced anew (§1.4).
- D-Bus: `needsYou`, `linger` (`Version` 3); DBUS.md, PROFILES.md say "inside its tier".
- SPEC §2 and §2c: the scattered ordering sentences point here.

## 7. Tests

- Tiers: a waiting activity of priority 100 under a running one of 10; a `needsYou` of
  priority 10 over a running notification of 70; `needsYou` + `linger` in tier 1.
- Inside a tier: priority, then fresh before stale, then the newest.
- Re-surfaced on a state change: a player playing again leads a paused one; an agent
  that just stopped leads one that stopped earlier.
- Overlays unchanged: feedback covers pill 1 and gives it back, an alert promotes for 2 s.
- Profiles and D-Bus: `priority` moves inside the tier only.
