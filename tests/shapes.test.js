// Run: gjs -m tests/shapes.test.js   (pure; no Shell needed)
import {shapesFor, compactCx, COMPACT_MIN, COMPACT_H, GAP, OVERSHOOT, PILL_GAP} from '../src/buoy@murilegus/lib/kit/shapes.js';

const PANEL_H = 40; // Buoy's panel height (stylesheet.css)

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

eq([GAP, OVERSHOOT, PILL_GAP, COMPACT_MIN, COMPACT_H], [4, 20, 8, 240, [56, 88, 120]], 'constants');

// --- derivation per monitor width ------------------------------------------
// expanded width = 28 % of the monitor, clamped to [560, 760], snapped to even px;
// height = w / 2.
const CASES = [
    // container: the monitor's width, so a compact can open on any pill (SPEC §2c)
    {width: 1366, expW: 560, expH: 280, minimalMax: 336, wideMax: 448, compactMax: 404, containerW: 1366},
    {width: 1920, expW: 560, expH: 280, minimalMax: 336, wideMax: 448, compactMax: 404, containerW: 1920},
    {width: 2560, expW: 716, expH: 358, minimalMax: 430, wideMax: 572, compactMax: 516, containerW: 2560},
    {width: 3440, expW: 760, expH: 380, minimalMax: 456, wideMax: 608, compactMax: 548, containerW: 3440},
];

for (const c of CASES) {
    const s = shapesFor({width: c.width}, PANEL_H);
    const at = `@${c.width}`;

    // idle does not depend on the monitor: pill height = panel − 2·GAP
    eq(s.idle, {w: 120, h: 32, r: 16}, `${at} idle`);
    eq(s.expanded, {w: c.expW, h: c.expH, r: 28}, `${at} expanded`);
    eq(s.container, {w: c.containerW, h: c.expH + 2 * OVERSHOOT}, `${at} container`);
    if (s.container.w > c.width)
        throw new Error(`${at} container wider than the monitor`);

    // side pills 2 and 3: one fixed shape, the idle size (SPEC §2c, 2026-11-05)
    eq(s.side, {w: 120, h: 32, r: 16}, `${at} side pill is 120 × 32`);

    // hover / press grow from whatever base they get
    eq(s.hover(s.idle), {w: 132, h: 34, r: 17}, `${at} hover(idle)`);
    eq(s.press(s.idle), {w: 140, h: 36, r: 18}, `${at} press(idle)`);

    // minimal: content + 28 px padding rounded up to even, floor at idle width, cap by hint
    eq(s.minimal(0), s.idle, `${at} minimal(0) floors at idle`);
    eq(s.minimal(50).w, 120, `${at} minimal(50) still idle width`);
    eq(s.minimal(100.2).w, 130, `${at} minimal rounds content width up to even`);
    eq(s.minimal(102).w, 130, `${at} minimal keeps an even fit as is`);
    eq(s.minimal(5000).w, c.minimalMax, `${at} minimal cap (normal)`);
    eq(s.minimal(5000, 'wide').w, c.wideMax, `${at} minimal cap (wide)`);
    eq(s.minimal(5000, 'bogus').w, c.minimalMax, `${at} unknown hint behaves as normal`);
    eq([s.minimal(200).h, s.minimal(200).r], [32, 16], `${at} minimal keeps pill height`);

    // compact (SPEC §4): 0.72 × expanded, content-fit down to 240, 56 or 88 tall, r 24
    eq(s.compactMax, c.compactMax, `${at} compactMax = 0.72 × expanded`);
    eq(s.compact(5000, 40), {w: c.compactMax, h: 56, r: 24}, `${at} compact capped, one row`);
    eq(s.compact(10, 10).w, COMPACT_MIN, `${at} compact never below 240`);
    eq(s.compact(300.4, 40).w, 330, `${at} compact content-fit + 28, even`);
    eq(s.compact(300, 40).h, 56, `${at} 40 px of content (leading 40) → 56`);
    eq(s.compact(300, 41).h, 88, `${at} more than one row → 88`);
    eq(s.compact(300, 72).h, 88, `${at} a bar under a 40 px row still 88`);
    eq(s.compact(300, 82).h, 98, `${at} a title and 3 rows: content-fit (82 + 16)`);
    eq(s.compact(300, 81).h, 98, `${at} content-fit heights are even`);
    eq(s.compact(300, 200).h, 120, `${at} taller content stops at 120`);

    // where a compact opens: on its pill, shifted only to stay GAP inside the screen
    const W = s.container.w, cw = c.compactMax;
    eq(compactCx(W / 2, cw, W), W / 2, `${at} compact on the centre pill stays centred`);
    eq(compactCx(W - 10, cw, W), W - GAP - cw / 2, `${at} near the right edge: shifted left`);
    eq(compactCx(10, cw, W), GAP + cw / 2, `${at} near the left edge: shifted right`);
    // pill 1 at its widest (wide), two side pills: a compact on pill 3 needs no shift
    const p3 = W / 2 + c.wideMax / 2 + 2 * PILL_GAP + s.side.w + s.side.w / 2;
    if (p3 + cw / 2 > W - GAP)
        throw new Error(`${at} a compact on pill 3 would leave the screen`);
    eq(compactCx(p3, cw, W), Math.round(p3), `${at} compact on pill 3 keeps its centre`);

    // the pill must always fit inside the input container, including press overshoot
    const press = s.press(s.minimal(5000, 'wide'));
    if (press.w > s.container.w || press.h > s.container.h)
        throw new Error(`${at} press(wide minimal) ${press.w}x${press.h} overflows container`);
    if (s.expanded.w > s.container.w || s.expanded.h > s.container.h)
        throw new Error(`${at} expanded overflows container`);
    if (COMPACT_H[2] > s.container.h)
        throw new Error(`${at} compact overflows container`);

    // every resting shape is whole and even-wide, so it centres on a whole pixel
    const shapes = [s.idle, s.side, s.expanded, s.hover(s.idle), s.press(s.idle), s.hover(s.side)];
    for (const w of [0, 1, 37.5, 99, 100.2, 211, 333.3, 420, 5000]) {
        for (const hint of ['normal', 'wide']) {
            const base = s.minimal(w, hint);
            shapes.push(base, s.hover(base), s.press(base), s.compact(w, 30), s.compact(w, 70), s.compact(w, 87));
        }
    }
    for (const sh of shapes) {
        const where = `${at} ${JSON.stringify(sh)}`;
        if (sh.w % 2 !== 0)
            throw new Error(`${where}: width not even`);
        if (!Number.isInteger(sh.h) || !Number.isInteger(sh.r))
            throw new Error(`${where}: height/radius not integer`);
        if (!Number.isInteger((s.container.w - sh.w) / 2))
            throw new Error(`${where}: centred x is fractional`);
        if (sh.r > sh.h / 2)
            throw new Error(`${where}: radius above h/2`);
    }
}

// clamp edges
eq(shapesFor({width: 2000}, PANEL_H).expanded.w, 560, '2000 px (exactly 560) stays at the floor');
eq(shapesFor({width: 2715}, PANEL_H).expanded.w, 760, '2715 px reaches the 760 ceiling');
eq(shapesFor({width: 800}, PANEL_H).expanded.w, 560, 'small monitor never goes below 560');

// --- expanded-width override (opts.expandedWidth; 0 = derived) ----------------
{
    const s = shapesFor({width: 1920}, PANEL_H, {expandedWidth: 600});
    eq(s.expanded, {w: 600, h: 300, r: 28}, 'override expanded (h is the content cap)');
    eq(s.container, {w: 1920, h: 340}, 'override container (the monitor)');
    eq(s.compactMax, 432, 'override: compact 0.72 × 600');
    eq(s.minimal(5000).w, 360, 'override caps minimal at 60 %');
    eq(s.idle, {w: 120, h: 32, r: 16}, 'override leaves idle alone');
}
eq(shapesFor({width: 1366}, PANEL_H, {expandedWidth: 900}).expanded.w, 900,
    'override wins over the monitor clamp (above 760)');
eq(shapesFor({width: 3440}, PANEL_H, {expandedWidth: 400}).expanded.w, 400,
    'override wins over the monitor clamp (below 560)');
eq(shapesFor({width: 3440}, PANEL_H, {expandedWidth: 300}).compactMax, COMPACT_MIN,
    'a tiny expanded never makes compact narrower than its floor');
eq(shapesFor({width: 1920}, PANEL_H, {expandedWidth: 601}).expanded, {w: 602, h: 301, r: 28},
    'odd override snaps to even');
eq(shapesFor({width: 1366}, PANEL_H, {expandedWidth: 5000}).container.w, 1366,
    'override never pushes the container off screen');
eq(shapesFor({width: 1365}, PANEL_H, {expandedWidth: 5000}).expanded.w, 1324,
    'screen cap rounds down on odd monitors');
for (const off of [0, -10, undefined, null, NaN]) {
    eq(shapesFor({width: 1920}, PANEL_H, {expandedWidth: off}).expanded.w, 560,
        `expandedWidth ${off} = derived`);
}
eq(shapesFor({width: 1920}, PANEL_H, {}).expanded.w, 560, 'empty opts = derived');

// --- panel height drives pill height ---------------------------------------
{
    const s = shapesFor({width: 1920}, 32);
    eq(s.idle, {w: 90, h: 24, r: 12}, 'panel 32 → idle');
    eq(s.hover(s.idle), {w: 100, h: 26, r: 13}, 'panel 32 → hover');
}
{
    const s = shapesFor({width: 1920}, 41);
    eq(s.idle, {w: 124, h: 33, r: 16}, 'odd pill height → radius floors');
    eq(s.press(s.idle).r, 18, 'odd pill height → press radius');
}

// shapes are fresh objects: mutating one call's result must not leak into the next
{
    const a = shapesFor({width: 1920}, PANEL_H);
    a.idle.w = 1;
    eq(shapesFor({width: 1920}, PANEL_H).idle.w, 120, 'results are not shared');
}

console.log('shapes: ok');
