// A shape is {w, h, r}. All values are logical px — GNOME's HiDPI scale is applied by
// St/Clutter, never here. Sizes derive from the monitor's logical width and the panel
// height; recomputed on monitors-changed or when `expanded-width` changes. Nothing polls.
//
// Every width is an even integer, so is the container: the island centres a shape at
// (container.w − w) / 2, which then lands on a whole pixel and edges stay sharp.

export const GAP = 4;          // pill ↔ screen edge
export const OVERSHOOT = 20;   // container margin so EASE_OUT_BACK never clips

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const even = v => 2 * Math.round(v / 2);
const evenUp = v => 2 * Math.ceil(v / 2);      // content must still fit
const evenDown = v => 2 * Math.floor(v / 2);   // must stay within a bound
const radius = h => Math.floor(h / 2);         // never more than half the height

/**
 * @param {{width:number}} monitor   Main.layoutManager.primaryMonitor (logical px)
 * @param {number} panelH            Main.panel.height (40 with Buoy's CSS)
 * @param {{expandedWidth?:number}} [opts]  `expanded-width`; 0 or unset = derived
 * @returns {object} idle/expanded/container shapes, hover/press/compact builders, minimalMax
 */
export function shapesFor(monitor, panelH, opts = {}) {
    const h = panelH - 2 * GAP;                                    // 32
    // Like iOS: width is fixed per screen, height follows content (below).
    const maxW = evenDown(monitor.width - 2 * OVERSHOOT);          // container fits on screen
    const expW = opts.expandedWidth > 0
        ? Math.min(even(opts.expandedWidth), maxW)
        : even(clamp(monitor.width * 0.28, 560, 760));             // 1920→560, 2560→716, 3440→760
    const expH = Math.round(expW / 2);
    const idleW = even(h * 3.75);                                  // ≈ iPhone compact ratio

    return {
        idle: {w: idleW, h, r: radius(h)},
        hover: base => ({w: even(base.w * 1.10), h: h + 2, r: radius(h + 2)}),
        press: base => ({w: even(base.w * 1.16), h: h + 4, r: radius(h + 4)}),
        // content-fit compact; `hint` is a discrete size hint from the adapter, never px
        compact: (contentW, hint = 'normal') => ({
            w: clamp(evenUp(Math.ceil(contentW) + 28), idleW,
                even(expW * (hint === 'wide' ? 0.8 : 0.6))),
            h, r: radius(h),
        }),
        // h is the cap: expanded fits its content up to this height (APPLE.md B5.4)
        expanded: {w: expW, h: expH, r: 28},
        container: {w: expW + 2 * OVERSHOOT, h: expH + 2 * OVERSHOOT},
        // side-by-side minimal: each pill gets at most this width
        minimalMax: even(expW / 3),
    };
}
