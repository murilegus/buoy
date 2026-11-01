// A shape is {w, h, r}. All values are logical px — GNOME's HiDPI scale is applied by
// St/Clutter, never here. Sizes derive from the monitor's logical width and the panel
// height; recomputed on monitors-changed or when `expanded-size` changes. Nothing polls.

export const GAP = 4;          // pill ↔ screen edge
export const OVERSHOOT = 20;   // container margin so EASE_OUT_BACK never clips

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {{width:number}} monitor   Main.layoutManager.primaryMonitor (logical px)
 * @param {number} panelH            Main.panel.height (40 with Buoy's CSS)
 * @param {{expandedWidth?:number}} [opts]  user override from `expanded-size`
 */
export function shapesFor(monitor, panelH, opts = {}) {
    const h = panelH - 2 * GAP;                                    // 32
    const expW = opts.expandedWidth ??
        Math.round(clamp(monitor.width * 0.28, 560, 760));          // 1920→560, 2560→717, 3440→760
    const expH = Math.round(expW / 2);
    const idleW = Math.round(h * 3.75);                            // ≈ iPhone compact ratio

    return {
        idle:     {w: idleW, h, r: h / 2},
        hover:    base => ({w: Math.round(base.w * 1.10), h: h + 2, r: (h + 2) / 2}),
        press:    base => ({w: Math.round(base.w * 1.16), h: h + 4, r: (h + 4) / 2}),
        // content-fit compact; `hint` is a discrete size hint from the adapter, never px
        compact:  (contentW, hint = 'normal') => ({
            w: clamp(Math.ceil(contentW) + 28, idleW, expW * (hint === 'wide' ? 0.8 : 0.6)),
            h, r: h / 2,
        }),
        expanded: {w: expW, h: expH, r: 28},
        container: {w: expW + 2 * OVERSHOOT, h: expH + 2 * OVERSHOOT},
        // side-by-side minimal: each pill gets at most this width
        minimalMax: Math.round(expW / 3),
    };
}
