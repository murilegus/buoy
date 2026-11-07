/**
 * Activity contract (docs/APPLE.md §B1). validate() fills defaults and throws
 * on shape errors so a bad adapter fails loudly at the registry, not in the renderer.
 */
export const KINDS = ['media', 'notification', 'progress', 'osd', 'input', 'power', 'device',
    'timer', 'ask', 'agent', 'attention', 'copied', 'phone', 'calendar', 'privacy', 'call'];

export const PRIORITY = {
    media: 10, timer: 20, calendar: 25, progress: 30, device: 35, agent: 35, power: 40,
    copied: 45, attention: 50, osd: 60, input: 60, notification: 70, phone: 75, ask: 90, call: 95,
};

/** Feedback for your own action (SPEC §2e): minimal only, pill 1 for its ttl, never missed. */
export const FEEDBACK = new Set(['osd', 'input', 'copied']);

const EIGHT_HOURS = 8 * 60 * 60 * 1000;

/**
 * How long an activity that only waits stays without news (`linger: true`: a paused
 * player, a coding agent done or waiting for you) — one rule for every module
 * (2026-11-07, Ethan): `activity-linger`, 5 min by default. The stack ends it then; each
 * update is news and starts the wait again.
 */
export const DEFAULT_LINGER = 5 * 60 * 1000;

/**
 * How long a waiting activity keeps its place before it dims and steps back to the
 * waiting tier (docs/PRIORITY.md §2): its `staleAfter` (agent done, a paused player).
 */
export const SETTLE_MS = 10 * 1000;

/** Kinds that always need you (PRIORITY.md §2): tier 1 whatever the adapter says. */
const NEEDS_YOU = new Set(['ask', 'call']);

/**
 * The activity's tier (docs/PRIORITY.md §2, 2026-11-07): 1 needs you, 2 running,
 * 3 waiting. `needsYou` (or kind ask / call) wins; `linger` counts only once the activity
 * is stale, so a waiting one keeps its place until it dims.
 *
 * @param {object} a  a validated activity, with the stack's `isStale`
 * @returns {1|2|3}
 */
export function tierOf(a) {
    if (a.needsYou === true || NEEDS_YOU.has(a.kind))
        return 1;
    return a.linger === true && a.isStale === true ? 3 : 2;
}

/**
 * @param {object} a  activity as built by an adapter (needs `id` and `kind`)
 * @returns {object} the activity with contract defaults filled in, ttl capped at 8 h
 */
export function validate(a) {
    if (!a?.id || !a.kind)
        throw new Error('activity needs id and kind');
    return {
        app: 'system',
        attributes: {},
        state: {},
        priority: PRIORITY[a.kind] ?? 0,
        staleAfter: 0,
        linger: false,
        needsYou: false,
        style: 'standard',
        alert: false,
        keyline: null,
        actions: [],
        sizeHint: 'normal',
        ...a,
        ttl: Math.min(a.ttl ?? 0, EIGHT_HOURS) || 0,
    };
}
