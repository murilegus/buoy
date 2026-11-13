/**
 * `auto`: the idle pill as a smart stack of idle plans (SPEC §2a-iii, FEATURES M3 "idle
 * auto"). Pure: which plan shows, given each plan's relevance. kit/services/idle.js asks the plans,
 * runs the one timer and draws the choice.
 *
 * - The idle pill turns (2026-11-08, Ethan: "an idle pill just rotates"): every plan with
 *   something to show takes its turn, in `idle-auto-plans` order, round, one per turn
 *   (the kit's timer, `idle-auto-switch`). Between turns (a plan's `changed`, the
 *   minute) the shown plan stays while it has something to show — a re-rank that picks
 *   the same plan changes nothing. The first plan shown is the highest scored.
 * - A plan at HOLD or more holds the pill until its score drops: no turn takes it away
 *   (never rotate away from a meeting in 10 minutes); the highest of them shows at once.
 * - A plan the user scrolled to stays until the next turn, while it has something to show.
 * - `null` (nothing to show) leaves the stack; nothing to show at all → null.
 * (Until 2026-11-08 only plans tied at the top took turns, so the weather's 35 kept the
 * clock's 10 off the pill for good.)
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
 * @param {boolean} [opts.turn]  the timer's turn: the next plan comes
 * @param {?string} [opts.pinned]  scrolled to, until the next turn
 * @returns {?string} the plan to show
 */
export function choose({plans, current = null, turn = false, pinned = null}) {
    const list = candidates(plans);
    if (!list.length)
        return null;
    if (pinned && !turn && list.some(p => p.id === pinned))
        return pinned;
    const top = Math.max(...list.map(p => p.score));
    if (top >= HOLD) {                  // held: the highest, the shown one on a tie
        const held = list.filter(p => p.score === top);
        return (held.find(p => p.id === current) ?? held[0]).id;
    }
    const here = list.find(p => p.id === current);
    if (!here)                          // the first, or the shown one left: the highest
        return list.find(p => p.score === top).id;
    if (!turn)
        return here.id;
    return list[(list.indexOf(here) + 1) % list.length].id;
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
 * @param {*} value  `idle-auto-switch`: '5m', '10m', '20m' or '30m' (2026-11-13, Ethan)
 * @returns {number} ms between turns, 5 minutes for anything else
 */
export function intervalMs(value) {
    const m = /^(5|10|20|30)m$/.exec(String(value ?? ''));
    return (m ? Number(m[1]) : 5) * 60 * 1000;
}
