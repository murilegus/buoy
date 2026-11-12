// A shape is {w, h, r}. All values are logical px — GNOME's HiDPI scale is applied by
// St/Clutter, never here. Sizes derive from the monitor's logical width, the panel height
// and the em (the font's size: Large Text and the font setting scale the pill with the
// bar, docs/design "Đơn vị là em"); recomputed on monitors-changed, when the theme's font
// or resolution changes, and when `expanded-width` changes. Nothing polls.
//
// Every width is an even integer, so is the container: the island centres a shape at
// (container.w − w) / 2, which then lands on a whole pixel and edges stay sharp.

export const GAP = 4;          // pill ↔ screen edge (a compact near it)
export const OVERSHOOT = 20;   // container margin so EASE_OUT_BACK never clips
export const PILL_GAP = 8;     // between side-by-side pills (SPEC §2c)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const even = v => 2 * Math.round(v / 2);
const evenUp = v => 2 * Math.ceil(v / 2);      // content must still fit
const evenDown = v => 2 * Math.floor(v / 2);   // must stay within a bound
const radius = h => Math.floor(h / 2);         // never more than half the height

// The design's px are at 1em = 11 pt at 96 dpi (docs/design/tokens.vi.md); at another em
// each scales by em / EM_1 and rounds to whole px.
export const EM_1 = 11 * 96 / 72;   // 14.67

/**
 * The pill's sizes at an em (design/pill, tokens "Thanh và pill"), whole px.
 *
 * @param {number} [em]  one em in logical px: the font's size × resolution / 72, as St reads
 *   `em` in CSS (st-theme-node.c get_length_from_term)
 * @returns {{inset: number, pad: number, gap: number, buttonGap: number, hover: number,
 *   press: number}}
 */
export function pillMetrics(em = EM_1) {
    const k = (em > 0 ? em : EM_1) / EM_1;
    return {
        inset: Math.round(4 * k),       // 0.25em: bar → pill, and pill → content box, each side
        pad: Math.round(8 * k),         // the pill's edge → its content box, sideways
        gap: Math.round(6 * k),         // leading cell → text, text → trailing
        buttonGap: Math.round(8 * k),   // trailing → a button
        hover: even(12 * k),            // 0.75em wider under the pointer (was × 1.10)
        press: even(18 * k),            // pressed: about 0.5em past the hover (was × 1.16)
    };
}

// What the idle clock takes at 1× with SF Pro Display 11 (design/pill "Idle"): the width
// when nothing measured it yet (tests, before the first reposition).
export const IDLE_TEXT_1EM = 85;

/**
 * The idle pill keeps room for its widest plan, the clock at its longest (design/pill
 * "Idle"): two-digit hours, minutes and seconds in the font's widest digit, with Shell's
 * ratio sign U+2236 (as WallClock writes the time), and the wider of AM/PM.
 *
 * @param {string} digit  the font's widest digit, measured
 * @param {string} [meridiem]  the locale's wider of AM/PM; empty when it has none
 * @returns {string}
 */
export function idleSample(digit, meridiem = '') {
    const d = /^[0-9]$/.test(digit) ? digit : '8';
    const t = `${d}${d}\u2236${d}${d}\u2236${d}${d}`;
    return meridiem ? `${t} ${meridiem}` : t;
}

/**
 * The compact's sizes at an em (design/compact, tokens "Compact"), whole px: the hovered
 * pill grown in place, and the card. Its content lays itself out with these (paddings
 * included), so the compact is exactly as big as its content.
 *
 * @param {number} [em]  one em in logical px
 * @returns {object} head 56 (leading 40, 8 above and below, 14 at the sides), rows of 16,
 *   radius 28, the round button 32, the media art 72 with its radius 20, the card's gaps
 */
export function compactMetrics(em = EM_1) {
    const k = (em > 0 ? em : EM_1) / EM_1;
    const px = v => Math.round(v * k);
    return {
        head: px(56), lead: px(40), vpad: px(8), side: px(14), gap: px(12),
        row: px(16), maxRows: 6,                  // 56 + 16n, at most 56 + 6 × 16 = 152
        radius: px(28), button: px(32),
        art: px(72), artInset: px(8), artRadius: px(20),
        rowIcon: px(16),
        bodyGap: px(8), actionsGap: px(12), edge: px(12),   // the card: body, buttons
        min: even(240 * k),                       // 16em, 240 at 1em (tokens)
    };
}

/**
 * @param {{width:number}} monitor   Main.layoutManager.primaryMonitor (logical px)
 * @param {number} panelH            Main.panel.height (2.75em = 40 with Buoy's CSS)
 * @param {object} [opts]
 * @param {number} [opts.expandedWidth]  `expanded-width`; 0 or unset = derived
 * @param {number} [opts.em]  one em in logical px; unset = EM_1
 * @param {number} [opts.idleTextW]  the idle clock's widest text, measured; unset = 85 at 1em
 * @returns {object} idle/side/expanded/container shapes, hover/press/minimal/compact
 *   builders, compactMax, and the pill's metrics (pad, cell, gap, buttonGap, inset)
 */
export function shapesFor(monitor, panelH, opts = {}) {
    const em = opts.em > 0 ? opts.em : EM_1;
    const m = pillMetrics(em);
    const h = panelH - 2 * m.inset;                                // 32 = bar − 2 × 0.25em
    const cell = h - 2 * m.inset;                                  // 24, the leading's cell
    // Like iOS: width is fixed per screen, height follows content (below).
    const maxW = evenDown(monitor.width - 2 * OVERSHOOT);          // container fits on screen
    const expW = opts.expandedWidth > 0
        ? Math.min(even(opts.expandedWidth), maxW)
        : even(clamp(monitor.width * 0.28, 560, 760));             // 1920→560, 2560→716, 3440→760
    const expH = Math.round(expW / 2);
    // 8 + 24 + 6 + the clock + 8 (design/pill "Idle"): 131 → 132 at 1×, even
    const textW = opts.idleTextW > 0 ? opts.idleTextW : IDLE_TEXT_1EM * em / EM_1;
    const idleW = evenUp(2 * m.pad + cell + m.gap + Math.ceil(textW));
    // pill 1's cap: 24em, so the text never grows with the screen, and 0.6 × expanded so
    // minimal < compact < expanded (tokens "Độ rộng tối đa trên thanh"); `wide` 0.8 × expanded
    const minimalCap = Math.min(evenDown(24 * em), even(expW * 0.6));
    // the compact: 16em … min(28em, 0.72 × expanded), 240 … 404 at 1920 (tokens "Compact")
    const cm = compactMetrics(em);
    const compactMax = Math.max(cm.min, Math.min(evenDown(28 * em), even(expW * 0.72)));
    const compactTall = cm.head + cm.maxRows * cm.row;
    // The container spans the monitor: a compact may open on any pill and goes up to
    // GAP from the screen edge (SPEC §2c). It is not reactive at rest, so it eats no
    // clicks (Clutter picks only reactive actors, clutter_actor_should_pick).
    const containerW = Math.max(expW + 2 * OVERSHOOT, evenDown(monitor.width));

    return {
        idle: {w: idleW, h, r: radius(h)},
        // side pills 2 and 3 (SPEC §2c): one fixed shape, the idle size
        side: {w: idleW, h, r: radius(h)},
        hover: base => ({w: even(base.w + m.hover), h: h + 2, r: radius(h + 2)}),
        press: base => ({w: even(base.w + m.press), h: h + 4, r: radius(h + 4)}),
        // minimal (the pill in the bar, SPEC §2), content-fit; `hint` is a discrete size hint
        // from the adapter, never px. Pill 1 keeps it however many pills share the bar.
        minimal: (contentW, hint = 'normal') => ({
            w: clamp(evenUp(Math.ceil(contentW) + 2 * m.pad), idleW,
                hint === 'wide' ? even(expW * 0.8) : minimalCap),
            h, r: radius(h),
        }),
        // compact from its content's natural size, paddings included; the island places it
        // (top edge kept). Heights step by rows: 56 + 16n up to 152, for every compact, the
        // card too (design/compact "Kích thước"); a card takes the full width.
        compact: (contentW, contentH, {card = false} = {}) => ({
            w: card ? compactMax : clamp(evenUp(Math.ceil(contentW)), cm.min, compactMax),
            h: Math.min(compactTall,
                cm.head + Math.max(0, Math.ceil((Math.ceil(contentH) - cm.head) / cm.row)) * cm.row),
            r: cm.radius,
        }),
        compactMax,
        compactMetrics: cm,
        // h is the cap: expanded fits its content up to this height (CONTRACT.md §5.4)
        expanded: {w: expW, h: expH, r: 28},
        container: {w: containerW, h: expH + 2 * OVERSHOOT},
        // the pill's own metrics (design/pill): its content box sits pad in from each side
        // and inset from top and bottom; the leading takes a cell × cell square
        em, pad: m.pad, inset: m.inset, cell, gap: m.gap, buttonGap: m.buttonGap,
    };
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
