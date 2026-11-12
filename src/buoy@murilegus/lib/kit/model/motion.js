/**
 * Buoy's motion (docs/design/motion, tokens "Chuyển động"): springs for every move, size and
 * shape, plain fades for the rest. Pure (no St, no Clutter), so it runs under plain gjs;
 * kit/ui/spring.js runs these on the frame clock.
 *
 * A spring is said in two numbers, as Apple's (WWDC23 "Animate with springs"): `d` the
 * perceived duration (when the move *looks* done) and `bounce`. Mass 1, stiffness (2π / d)²,
 * damping (1 − bounce) · 4π / d, so the damping ratio ζ = 1 − bounce. A spring sent elsewhere
 * mid-way starts from where it is with the velocity it has: nothing jumps.
 *
 * Times are in ms, distances in px, velocities in px per ms.
 */

/** @typedef {{d: number, bounce: number}} Spring */

/** The springs (design/motion "Lò xo và độ mờ"): bounce only when growing. */
export const SPRINGS = Object.freeze({
    snap: Object.freeze({d: 240, bounce: 0.15}),   // press, the tab marker, the pill's hover
    size: Object.freeze({d: 240, bounce: 0}),      // a size the content changed
    move: Object.freeze({d: 400, bounce: 0.2}),    // pill → compact, appear, slide, merge
    open: Object.freeze({d: 500, bounce: 0.25}),   // expanded, an alert, an ask
    close: Object.freeze({d: 360, bounce: 0}),     // every shrink back
});

/** The fades (opacity; ms and Clutter's mode by name), and the CSS states. */
export const FADES = Object.freeze({
    out: Object.freeze({ms: 100, mode: 'EASE_OUT_QUAD'}),
    in: Object.freeze({ms: 200, mode: 'EASE_OUT_QUAD'}),
    state: Object.freeze({ms: 120, mode: 'EASE_OUT_QUAD'}),
    idle: Object.freeze({ms: 300, mode: 'EASE_IN_OUT_QUAD'}),
});

/** Tab switch and the body's slide (px); an in-place list comes from this far. */
export const TAB_SHIFT = 12;
export const LIST_SHIFT = 24;
/** A press shrinks the pill this much each way (px). */
export const PRESS_SHRINK = 4;
/** A press held this long before it springs back (ms). */
export const PRESS_HOLD = 90;

/** Settled: within half a pixel of the target, and moving less than that in a frame. */
export const SETTLE_PX = 0.5;
const FRAME_MS = 1000 / 60;

/**
 * @param {Spring} s
 * @returns {number} the damping ratio ζ = 1 − bounce, in (0, 1]
 */
export function dampingRatio(s) {
    return 1 - Math.min(0.99, Math.max(0, s.bounce));
}

/**
 * Where a spring is `t` ms after it started at `x0` with velocity `v0` towards `target`.
 *
 * @param {Spring} s
 * @param {number} x0
 * @param {number} v0  px per ms
 * @param {number} target
 * @param {number} t  ms
 * @returns {{x: number, v: number}}
 */
export function springAt(s, x0, v0, target, t) {
    const w = 2 * Math.PI / s.d;
    const z = dampingRatio(s);
    const u0 = x0 - target;
    if (t <= 0)
        return {x: x0, v: v0};
    if (!Number.isFinite(t))
        return {x: target, v: 0};     // animations off: there at once
    if (z < 1) {
        const wd = w * Math.sqrt(1 - z * z);
        const e = Math.exp(-z * w * t);
        const c = Math.cos(wd * t), sn = Math.sin(wd * t);
        return {
            x: target + e * (u0 * c + (v0 + z * w * u0) / wd * sn),
            v: e * (v0 * c - (z * w * v0 + w * w * u0) / wd * sn),
        };
    }
    const e = Math.exp(-w * t);
    const b = v0 + w * u0;
    return {x: target + (u0 + b * t) * e, v: (v0 - w * b * t) * e};
}

/**
 * @param {{x: number, v: number}} at
 * @param {number} target
 * @returns {boolean} close enough to stop: within SETTLE_PX and slower than SETTLE_PX a frame
 */
export function isSettled(at, target) {
    return Math.abs(at.x - target) < SETTLE_PX && Math.abs(at.v) * FRAME_MS < SETTLE_PX;
}

/**
 * How long a spring takes to settle for good (never out of SETTLE_PX after it), from rest at
 * `distance` from its target. A bound for tests and for a runner's safety stop.
 *
 * @param {Spring} s
 * @param {number} [distance]
 * @returns {number} ms
 */
export function settleTime(s, distance = 400) {
    let last = 0;
    const end = 10 * s.d;
    for (let t = 0; t <= end; t++) {
        if (Math.abs(springAt(s, -distance, 0, 0, t).x) >= SETTLE_PX)
            last = t;
    }
    return last + 1;
}

/**
 * The spring for a change of shape (design/motion "Bị cắt ngang"): a move to a smaller shape
 * closes (no bounce); to a larger one it takes the move's own.
 *
 * @param {string} token  the move's spring: a SPRINGS key
 * @param {{w: number, h: number}} from
 * @param {{w: number, h: number}} to
 * @returns {string} a SPRINGS key
 */
export function springFor(token, from, to) {
    const shrinks = to.w * to.h < from.w * from.h;
    if (shrinks && (token === 'open' || token === 'move'))
        return 'close';
    return SPRINGS[token] ? token : 'move';
}

/**
 * The radius on the way (design/motion "Bo góc đi theo chiều cao"): never more than half the
 * height, never more than the shape's own.
 *
 * @param {number} h  the height now
 * @param {number} r  the target's radius
 * @returns {number} whole px
 */
export function radiusAt(h, r) {
    return Math.max(0, Math.round(Math.min(h / 2, r)));
}

/**
 * How far along a move is, 0 at its start, 1 at its end (may pass 1 with a bounce).
 *
 * @param {number} from
 * @param {number} to
 * @param {number} now
 * @returns {number}
 */
export function progressOf(from, to, now) {
    return Math.abs(to - from) < 1e-6 ? 1 : (now - from) / (to - from);
}

/**
 * Spring time from clock time: Shell's slow-down-factor stretches it, animations off ends it
 * at once (`misc/animationUtils.js` `adjustAnimationTime`).
 *
 * @param {number} elapsed  ms on the clock
 * @param {{enabled: boolean, slowDown: number}} settings
 * @returns {number} ms on the spring, Infinity with animations off
 */
export function springTime(elapsed, {enabled, slowDown}) {
    if (!enabled)
        return Infinity;
    return elapsed / (slowDown > 0 ? slowDown : 1);
}
