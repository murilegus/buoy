// Run: gjs -m tests/shapes.test.js   (pure; no Shell needed)
import {shapesFor, GAP, OVERSHOOT, PILL_GAP} from '../src/buoy@murilegus/lib/kit/shapes.js';

const PANEL_H = 40; // Buoy's panel height (stylesheet.css)

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

eq([GAP, OVERSHOOT, PILL_GAP], [4, 20, 8], 'constants');

// --- derivation per monitor width ------------------------------------------
// expanded width = 28 % of the monitor, clamped to [560, 760], snapped to even px;
// height = w / 2.
const CASES = [
    // container: wide enough for the centre pill + two side pills of minimalMax (SPEC §2c)
    {width: 1366, expW: 560, expH: 280, minimalMax: 186, compactMax: 336, wideMax: 448, containerW: 1002},
    {width: 1920, expW: 560, expH: 280, minimalMax: 186, compactMax: 336, wideMax: 448, containerW: 1002},
    {width: 2560, expW: 716, expH: 358, minimalMax: 238, compactMax: 430, wideMax: 572, containerW: 1262},
    {width: 3440, expW: 760, expH: 380, minimalMax: 254, compactMax: 456, wideMax: 608, containerW: 1342},
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

    // minimal (side-by-side) pills: content + 28, between idle and minimalMax
    eq(s.minimal(0), s.idle, `${at} minimal(0) is idle`);
    eq(s.minimal(100.2).w, 130, `${at} minimal content-fit, even`);
    eq(s.minimal(5000).w, c.minimalMax, `${at} minimal capped at expanded/3`);
    eq([s.minimal(150).h, s.minimal(150).r], [32, 16], `${at} minimal keeps pill height`);
    if (c.minimalMax / 2 + 2 * (PILL_GAP + c.minimalMax) > s.container.w / 2)
        throw new Error(`${at} three minimal pills do not fit the container`);
    eq(s.minimalMax, c.minimalMax, `${at} minimalMax`);

    // hover / press grow from whatever base they get
    eq(s.hover(s.idle), {w: 132, h: 34, r: 17}, `${at} hover(idle)`);
    eq(s.press(s.idle), {w: 140, h: 36, r: 18}, `${at} press(idle)`);

    // compact: content + 28 px padding rounded up to even, floor at idle width, cap by hint
    eq(s.compact(0), s.idle, `${at} compact(0) floors at idle`);
    eq(s.compact(50).w, 120, `${at} compact(50) still idle width`);
    eq(s.compact(100.2).w, 130, `${at} compact rounds content width up to even`);
    eq(s.compact(102).w, 130, `${at} compact keeps an even fit as is`);
    eq(s.compact(5000).w, c.compactMax, `${at} compact cap (normal)`);
    eq(s.compact(5000, 'wide').w, c.wideMax, `${at} compact cap (wide)`);
    eq(s.compact(5000, 'bogus').w, c.compactMax, `${at} unknown hint behaves as normal`);
    eq([s.compact(200).h, s.compact(200).r], [32, 16], `${at} compact keeps pill height`);

    // the pill must always fit inside the input container, including press overshoot
    const press = s.press(s.compact(5000, 'wide'));
    if (press.w > s.container.w || press.h > s.container.h)
        throw new Error(`${at} press(wide compact) ${press.w}x${press.h} overflows container`);
    if (s.expanded.w > s.container.w || s.expanded.h > s.container.h)
        throw new Error(`${at} expanded overflows container`);

    // every resting shape is whole and even-wide, so it centres on a whole pixel
    const shapes = [s.idle, s.expanded, s.hover(s.idle), s.press(s.idle)];
    for (const w of [0, 1, 37.5, 99, 100.2, 211, 333.3, 420, 5000]) {
        for (const hint of ['normal', 'wide']) {
            const base = s.compact(w, hint);
            shapes.push(base, s.hover(base), s.press(base), s.minimal(w), s.hover(s.minimal(w)));
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
    if (s.minimalMax % 2 !== 0)
        throw new Error(`${at} minimalMax not even`);
}

// clamp edges
eq(shapesFor({width: 2000}, PANEL_H).expanded.w, 560, '2000 px (exactly 560) stays at the floor');
eq(shapesFor({width: 2715}, PANEL_H).expanded.w, 760, '2715 px reaches the 760 ceiling');
eq(shapesFor({width: 800}, PANEL_H).expanded.w, 560, 'small monitor never goes below 560');

// --- expanded-width override (opts.expandedWidth; 0 = derived) ----------------
{
    const s = shapesFor({width: 1920}, PANEL_H, {expandedWidth: 600});
    eq(s.expanded, {w: 600, h: 300, r: 28}, 'override expanded (h is the content cap)');
    eq(s.container, {w: 1072, h: 340}, 'override container (three 200 px pills)');
    eq(s.minimalMax, 200, 'override minimalMax');
    eq(s.compact(5000).w, 360, 'override caps compact at 60 %');
    eq(s.idle, {w: 120, h: 32, r: 16}, 'override leaves idle alone');
}
eq(shapesFor({width: 1366}, PANEL_H, {expandedWidth: 900}).expanded.w, 900,
    'override wins over the monitor clamp (above 760)');
eq(shapesFor({width: 3440}, PANEL_H, {expandedWidth: 400}).expanded.w, 400,
    'override wins over the monitor clamp (below 560)');
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
