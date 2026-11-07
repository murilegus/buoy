/**
 * `auto`: the idle pill as a smart stack of idle plans (SPEC §2a-iii, FEATURES M3 "idle
 * auto"). Pure: which plan shows, given each plan's relevance. kit/idle.js asks the plans,
 * keeps the times each was shown, runs the one timer and draws the choice.
 *
 * - The highest score shows. Ties take turns: on a turn (the kit's timer) the tied plan
 *   shown longest ago comes next, `idle-auto-plans` order breaking a tie of those; between
 *   turns (a plan's `changed`, the minute) the shown plan stays while it is still among the
 *   highest — a re-rank that picks the same plan changes nothing.
 * - A plan at HOLD or more holds the pill until its score drops: no turn takes it away
 *   (never rotate away from a meeting in 10 minutes). A higher one still wins.
 * - A plan the user scrolled to stays until the next turn, while it has something to show.
 * - `null` (nothing to show) leaves the stack; nothing to show at all → null.
 */

/** A score this high holds the pill (SPEC §2a-iii). */
export const HOLD = 80;

const isScore = v => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {{id: string, score: ?number}[]} plans  in `idle-auto-plans` order
 * @returns {{id: string, score: number}[]} the ones with something to show, that order
 */
export function candidates(plans) {
    return (Array.isArray(plans) ? plans : []).filter(p => p && typeof p.id === 'string' && isScore(p.score));
}

/**
 * @param {object} opts
 * @param {{id: string, score: ?number}[]} opts.plans  in `idle-auto-plans` order
 * @param {?string} [opts.current]  the plan shown now
 * @param {boolean} [opts.turn]  the timer's turn: ties move on
 * @param {?string} [opts.pinned]  scrolled to, until the next turn
 * @param {{[id: string]: number}} [opts.shownAt]  when each plan was last shown (ms); never
 *   shown counts as longest ago
 * @returns {?string} the plan to show
 */
export function choose({plans, current = null, turn = false, pinned = null, shownAt = {}}) {
    const list = candidates(plans);
    if (!list.length)
        return null;
    if (pinned && !turn && list.some(p => p.id === pinned))
        return pinned;
    const top = Math.max(...list.map(p => p.score));
    const tied = list.filter(p => p.score === top);
    const here = tied.find(p => p.id === current);
    if (here && (!turn || here.score >= HOLD || tied.length === 1))
        return here.id;
    const when = id => isScore(shownAt[id]) ? shownAt[id] : -Infinity;
    // the longest ago; stable on ties, so idle-auto-plans order breaks them
    const others = here ? tied.filter(p => p.id !== current) : tied;
    return others.reduce((best, p) => when(p.id) < when(best.id) ? p : best).id;
}

/**
 * Scroll on the idle pill (SPEC §2a-iii "Interaction"): the next or previous plan with
 * something to show, in `idle-auto-plans` order, round.
 *
 * @param {{id: string, score: ?number}[]} plans  in `idle-auto-plans` order
 * @param {?string} current
 * @param {number} step  +1 next, -1 previous
 * @returns {?string}
 */
export function scrollTo(plans, current, step) {
    const list = candidates(plans);
    if (!list.length)
        return null;
    const i = list.findIndex(p => p.id === current);
    if (i < 0)
        return list[step < 0 ? list.length - 1 : 0].id;
    return list[(i + (step < 0 ? -1 : 1) + list.length) % list.length].id;
}

/**
 * @param {*} value  `idle-auto-plans`
 * @param {string[]} running  the running modules' plans, in IDLE_PLANS order
 * @returns {string[]} the stack's plans, in the key's order: listed and running, each once
 */
export function stackOrder(value, running) {
    const seen = new Set();
    return (Array.isArray(value) ? value : [])
        .filter(id => typeof id === 'string' && running.includes(id) && !seen.has(id) && seen.add(id));
}

/**
 * @param {*} minutes  `idle-auto-interval`
 * @returns {number} ms between turns: the key's minutes, 2–30, 5 when unset
 */
export function intervalMs(minutes) {
    const m = Number.isInteger(minutes) ? Math.min(30, Math.max(2, minutes)) : 5;
    return m * 60 * 1000;
}
