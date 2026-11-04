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

/**
 * @param {{width:number}} monitor   Main.layoutManager.primaryMonitor (logical px)
 * @param {number} panelH            Main.panel.height (40 with Buoy's CSS)
 * @param {{expandedWidth?:number}} [opts]  `expanded-width`; 0 or unset = derived
 * @returns {object} idle/expanded/container shapes, hover/press/minimal/shared builders, sharedMax
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
    const sharedMax = even(expW / 3);
    // Centre pill + two side pills to its right, each ≤ sharedMax; never wider than the
    // monitor (the island also stops adding side pills before the system cluster).
    const sharedHalf = sharedMax / 2 + 2 * (PILL_GAP + sharedMax) + OVERSHOOT;
    const containerW = Math.max(expW + 2 * OVERSHOOT,
        Math.min(evenUp(2 * sharedHalf), evenDown(monitor.width)));

    return {
        idle: {w: idleW, h, r: radius(h)},
        hover: base => ({w: even(base.w * 1.10), h: h + 2, r: radius(h + 2)}),
        press: base => ({w: even(base.w * 1.16), h: h + 4, r: radius(h + 4)}),
        // minimal (the pill in the bar, SPEC §2), content-fit; `hint` is a discrete size hint
        // from the adapter, never px
        minimal: (contentW, hint = 'normal') => ({
            w: clamp(evenUp(Math.ceil(contentW) + 28), idleW,
                even(expW * (hint === 'wide' ? 0.8 : 0.6))),
            h, r: radius(h),
        }),
        // h is the cap: expanded fits its content up to this height (APPLE.md B5.4)
        expanded: {w: expW, h: expH, r: 28},
        container: {w: containerW, h: expH + 2 * OVERSHOOT},
        // pills sharing the bar (SPEC §2c): each content-fit between idle and expanded/3
        shared: contentW => ({
            w: clamp(evenUp(Math.ceil(contentW) + 28), idleW, sharedMax),
            h, r: radius(h),
        }),
        sharedMax,
    };
}
