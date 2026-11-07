// A shape is {w, h, r}. All values are logical px — GNOME's HiDPI scale is applied by
// St/Clutter, never here. Sizes derive from the monitor's logical width and the panel
// height; recomputed on monitors-changed or when `expanded-width` changes. Nothing polls.
//
// Every width is an even integer, so is the container: the island centres a shape at
// (container.w − w) / 2, which then lands on a whole pixel and edges stay sharp.

export const GAP = 4;          // pill ↔ screen edge
export const OVERSHOOT = 20;   // container margin so EASE_OUT_BACK never clips
export const PILL_GAP = 8;     // between side-by-side pills (SPEC §2c)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const even = v => 2 * Math.round(v / 2);
const evenUp = v => 2 * Math.ceil(v / 2);      // content must still fit
const evenDown = v => 2 * Math.floor(v / 2);   // must stay within a bound
const radius = h => Math.floor(h / 2);         // never more than half the height

// Compact (SPEC §2, §4, 2026-11-05): the hovered pill grown in place. Content-fit width
// between COMPACT_MIN and 0.72 × expanded; 56 for one row, 88 with a bar, and content-fit
// up to 120 when rows need more (a title and 3 rows measure ~82 px); radius 24.
export const COMPACT_MIN = 240;
export const COMPACT_H = Object.freeze([56, 88, 120]);
// A card (a notification, NOTIFICATIONS.md §3, 2026-11-07): full width, content-fit up to
// this — a header, a picture beside a title and 2 lines, a row of buttons measure ~150.
export const CARD_MAX_H = 160;
const COMPACT_PAD = 14;                             // each side, as the pill's content
const COMPACT_VPAD = 8;                             // top and bottom

/**
 * @param {{width:number}} monitor   Main.layoutManager.primaryMonitor (logical px)
 * @param {number} panelH            Main.panel.height (40 with Buoy's CSS)
 * @param {{expandedWidth?:number}} [opts]  `expanded-width`; 0 or unset = derived
 * @returns {object} idle/side/expanded/container shapes, hover/press/minimal/compact
 *   builders, compactMax
 */
export function shapesFor(monitor, panelH, opts = {}) {
    const h = panelH - 2 * GAP;                                    // 32
    // Like iOS: width is fixed per screen, height follows content (below).
    const maxW = evenDown(monitor.width - 2 * OVERSHOOT);          // container fits on screen
    const expW = opts.expandedWidth > 0
        ? Math.min(even(opts.expandedWidth), maxW)
        : even(clamp(monitor.width * 0.28, 560, 760));             // 1920→560, 2560→716, 3440→760
    const expH = Math.round(expW / 2);
    const idleW = even(h * 3.75);                                  // ≈ iPhone compact (Apple's) ratio
    const compactMax = Math.max(COMPACT_MIN, even(expW * 0.72));   // 404 / 516 / 548
    // The container spans the monitor: a compact may open on any pill and goes up to
    // GAP from the screen edge (SPEC §2c). It is not reactive at rest, so it eats no
    // clicks (Clutter picks only reactive actors, clutter_actor_should_pick).
    const containerW = Math.max(expW + 2 * OVERSHOOT, evenDown(monitor.width));

    return {
        idle: {w: idleW, h, r: radius(h)},
        // side pills 2 and 3 (SPEC §2c): one fixed shape, the idle size
        side: {w: idleW, h, r: radius(h)},
        hover: base => ({w: even(base.w * 1.10), h: h + 2, r: radius(h + 2)}),
        press: base => ({w: even(base.w * 1.16), h: h + 4, r: radius(h + 4)}),
        // minimal (the pill in the bar, SPEC §2), content-fit; `hint` is a discrete size hint
        // from the adapter, never px. Pill 1 keeps it however many pills share the bar.
        minimal: (contentW, hint = 'normal') => ({
            w: clamp(evenUp(Math.ceil(contentW) + 28), idleW,
                even(expW * (hint === 'wide' ? 0.8 : 0.6))),
            h, r: radius(h),
        }),
        // compact from its content's natural size; the island places it (top edge kept)
        // (`card`: a card's height, NOTIFICATIONS.md §3)
        compact: (contentW, contentH, {card = false} = {}) => ({
            w: clamp(evenUp(Math.ceil(contentW) + 2 * COMPACT_PAD), COMPACT_MIN, compactMax),
            h: card
                ? clamp(evenUp(Math.ceil(contentH) + 2 * COMPACT_VPAD), COMPACT_H[0], CARD_MAX_H)
                : compactH(Math.ceil(contentH) + 2 * COMPACT_VPAD),
            r: 24,
        }),
        compactMax,
        // h is the cap: expanded fits its content up to this height (APPLE.md B5.4)
        expanded: {w: expW, h: expH, r: 28},
        container: {w: containerW, h: expH + 2 * OVERSHOOT},
    };
}

function compactH(need) {
    if (need <= COMPACT_H[0])
        return COMPACT_H[0];
    if (need <= COMPACT_H[1])
        return COMPACT_H[1];
    return Math.min(evenUp(need), COMPACT_H[2]);
}

/**
 * Where a compact of width `w` centres: on its pill, shifted only to stay `GAP` inside
 * the container (= the monitor).
 *
 * @param {number} cx  the pill's centre in the container
 * @param {number} w  the compact's width
 * @param {number} containerW
 * @returns {number} the compact's centre, a whole px
 */
export function compactCx(cx, w, containerW) {
    return Math.round(clamp(cx, GAP + w / 2, containerW - GAP - w / 2));
}

// --- the morph's bounce ------------------------------------------------------------------

/** EASE_OUT_BACK goes this share of a move past its end (Clutter's constant 1.70158). */
export const BACK_SHARE = 0.1;
/** The most a shrinking pill may bounce past its size, in px (2026-11-06, Ethan). */
export const SHRINK_BOUNCE = 12;

/**
 * Where a long shrink turns round: EASE_OUT_BACK would go 10 % of the move past its end,
 * which on expanded → minimal (hundreds of px) cut into the text (2026-11-06, Ethan). A
 * shrink whose bounce would pass `maxPx` stops this far short instead, then settles out to
 * its size (pill.js two-step morph); one whose bounce is small enough keeps Clutter's.
 *
 * @param {{w: number, h: number}} from
 * @param {{w: number, h: number}} to
 * @param {number} [maxPx]
 * @returns {?{w: number, h: number}} the size it shrinks to first, or null (Clutter's own)
 */
export function shrinkStop(from, to, maxPx = SHRINK_BOUNCE) {
    const dw = from.w - to.w, dh = from.h - to.h;
    const d = Math.max(dw, dh);
    // a hair over (a 120 px compact → minimal is 12.0 px): keep Clutter's
    if (!(d > 0) || d * BACK_SHARE <= maxPx + 0.05)
        return null;
    const k = maxPx / d;
    return {w: to.w - Math.max(0, dw) * k, h: to.h - Math.max(0, dh) * k};
}
