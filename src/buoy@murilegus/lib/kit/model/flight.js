/**
 * Shared parts (design/motion "Phần chung đi tới chỗ mới", FEATURES M4 "Motion: shared
 * parts"): a part both forms have — the leading, the title — goes from where it was in the
 * old form to its place in the new one, on the bg's spring, drawn at its end size and scaled
 * (`translation` and `scale`, never laid out again). Pure: boxes in, poses out; the actors
 * are kit/ui/present/flight.js's.
 *
 * A box is {x, y, w, h} in stage pixels; a pose is {x, y, scale}: the drawn part's top left
 * corner and its scale about that corner.
 */

const ok = b => b && [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0;

/**
 * Where a part starts: over the box it had, at the scale that makes it as big as it was.
 * A leading keeps its centre and fits the old box (24 → 72: a third); a title keeps its left
 * edge and its middle, scaled by its font size (`font`, any unit the same on both sides;
 * without it the line's height) — the pill's label and the compact's scrolling title are
 * not the same height for the same text (the text grows from the old title's start, as the
 * design draws it).
 *
 * @param {string} part  'title', or any other ('leading', the equaliser…): kept centred
 * @param {object} from  the box it leaves; a title's with its `font` size when known
 * @param {object} to  its box in the new form (its own size: scale 1), the same
 * @returns {?{x: number, y: number, scale: number}} null when a box is empty
 */
export function takeoff(part, from, to) {
    if (!ok(from) || !ok(to))
        return null;
    if (part === 'title') {
        const fonts = from.font > 0 && to.font > 0;
        const scale = fonts ? from.font / to.font : from.h / to.h;
        return {x: from.x, y: from.y + (from.h - to.h * scale) / 2, scale};
    }
    const scale = Math.min(from.w / to.w, from.h / to.h);
    return {x: from.x + (from.w - to.w * scale) / 2, y: from.y + (from.h - to.h * scale) / 2, scale};
}

/**
 * The pose at a point of the flight: from the takeoff to the part's own place at scale 1,
 * as far as the bg has gone (`p` past 1 when the bg's spring overshoots: the part with it).
 *
 * @param {{x: number, y: number, scale: number}} start  takeoff()
 * @param {object} to  the part's box now (it may still move: a list laid out late)
 * @param {number} p  the bg's progress, 0 … 1
 * @param {number} [p0]  the progress it took off at: a part whose place came late (a tab
 *   that shows the tile's activity a frame later) covers the rest of the way, not all of it
 * @returns {{x: number, y: number, scale: number}}
 */
export function poseAt(start, to, p, p0 = 0) {
    const q = Number.isFinite(p) ? p : 1;
    const from = Number.isFinite(p0) && p0 > 0 && p0 < 1 ? p0 : 0;
    const t = (q - from) / (1 - from);
    const mix = (a, b) => a + (b - a) * t;
    return {x: mix(start.x, to.x), y: mix(start.y, to.y), scale: Math.max(0.01, mix(start.scale, 1))};
}

/**
 * The box a pose covers: where a part in flight is, should another change take it off again.
 *
 * @param {{x: number, y: number, scale: number}} pose
 * @param {{w: number, h: number, font?: number}} size  the part's own size (and font size)
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function boxOf(pose, size) {
    const box = {x: pose.x, y: pose.y, w: size.w * pose.scale, h: size.h * pose.scale};
    if (size.font > 0)
        box.font = size.font * pose.scale;
    return box;
}
