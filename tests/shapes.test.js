// Run: gjs -m tests/shapes.test.js   (pure; no Shell needed)
import {
    shapesFor, compactCx, compactMetrics, GAP, OVERSHOOT, PILL_GAP, BACK_SHARE, SHRINK_BOUNCE, shrinkStop,
    EM_1, IDLE_TEXT_1EM, pillMetrics, idleSample,
} from '../src/buoy@murilegus/lib/kit/model/shapes.js';

const PANEL_H = 40; // Buoy's panel height at 1em (stylesheet.css: 2.75em)

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

eq([GAP, OVERSHOOT, PILL_GAP], [4, 20, 8], 'constants');
const COMPACT_MIN = 240, COMPACT_TALL = 152;

// --- derivation per monitor width ------------------------------------------
// expanded width = 28 % of the monitor, clamped to [560, 760], snapped to even px;
// height = w / 2.
const CASES = [
    // container: the monitor's width, so a compact can open on any pill (SPEC §2c)
    // minimal: min(24em, 0.6 × expanded), tokens "Độ rộng tối đa trên thanh": 336 / 352
    {width: 1366, expW: 560, expH: 280, minimalMax: 336, wideMax: 448, compactMax: 404, containerW: 1366},
    {width: 1920, expW: 560, expH: 280, minimalMax: 336, wideMax: 448, compactMax: 404, containerW: 1920},
    // compact: min(28em, 0.72 × expanded), tokens: 404 / 410
    {width: 2560, expW: 716, expH: 358, minimalMax: 352, wideMax: 572, compactMax: 410, containerW: 2560},
    {width: 3440, expW: 760, expH: 380, minimalMax: 352, wideMax: 608, compactMax: 410, containerW: 3440},
];

for (const c of CASES) {
    const s = shapesFor({width: c.width}, PANEL_H);
    const at = `@${c.width}`;

    // idle does not depend on the monitor: 8 + 24 + 6 + 85 + 8 = 131 → 132 (even), and the
    // pill = bar − 2 × 0.25em
    eq(s.idle, {w: 132, h: 32, r: 16}, `${at} idle`);
    eq(s.expanded, {w: c.expW, h: c.expH, r: 28}, `${at} expanded`);
    eq(s.container, {w: c.containerW, h: c.expH + 2 * OVERSHOOT}, `${at} container`);
    if (s.container.w > c.width)
        throw new Error(`${at} container wider than the monitor`);

    // side pills 2 and 3: one fixed shape, the idle size (SPEC §2c, 2026-11-05)
    eq(s.side, {w: 132, h: 32, r: 16}, `${at} side pill is the idle's 132 × 32`);

    // hover / press grow by a fixed em amount, whatever the base (design/pill: 0.75em = 12)
    eq(s.hover(s.idle), {w: 144, h: 34, r: 17}, `${at} hover(idle): + 12, + 2`);
    eq(s.press(s.idle), {w: 150, h: 36, r: 18}, `${at} press(idle): + 18, + 4`);
    eq(s.hover(s.minimal(5000)).w, c.minimalMax + 12, `${at} hover adds 12 at the cap too, not 10 %`);

    // minimal: content + 2 × 8 padding rounded up to even, floor at idle width, cap by hint
    eq(s.minimal(0), s.idle, `${at} minimal(0) floors at idle`);
    eq(s.minimal(100.2).w, 132, `${at} minimal(100) still idle width`);
    eq(s.minimal(120.2).w, 138, `${at} minimal rounds content width up to even (121 + 16)`);
    eq(s.minimal(122).w, 138, `${at} minimal keeps an even fit as is`);
    eq(s.minimal(5000).w, c.minimalMax, `${at} minimal cap (normal)`);
    eq(s.minimal(5000, 'wide').w, c.wideMax, `${at} minimal cap (wide)`);
    eq(s.minimal(5000, 'bogus').w, c.minimalMax, `${at} unknown hint behaves as normal`);
    eq([s.minimal(200).h, s.minimal(200).r], [32, 16], `${at} minimal keeps pill height`);

    // compact (design/compact): its content lays out its own paddings, so the compact is the
    // content's size: content-fit width from 240 to the cap, heights 56 + 16n up to 152, r 28
    eq(s.compactMax, c.compactMax, `${at} compactMax = min(28em, 0.72 × expanded)`);
    eq(s.compact(5000, 56), {w: c.compactMax, h: 56, r: 28}, `${at} compact capped, the head alone`);
    eq(s.compact(10, 10).w, COMPACT_MIN, `${at} compact never below 240`);
    eq(s.compact(300.4, 56).w, 302, `${at} compact content-fit, even (no padding added)`);
    eq(s.compact(300, 40).h, 56, `${at} less than the head: still the head, 56`);
    eq(s.compact(300, 56).h, 56, `${at} the head alone: 56`);
    eq(s.compact(300, 57).h, 72, `${at} a pixel more: one row more, 72`);
    eq(s.compact(300, 88).h, 88, `${at} media with its bar: 88`);
    eq(s.compact(300, 120).h, 120, `${at} three rows: 56 + 8 + 48 + 8 = 120`);
    eq(s.compact(300, 300).h, COMPACT_TALL, `${at} taller content stops at 152`);
    for (let need = 0; need <= 200; need += 7) {
        const h = s.compact(300, need).h;
        if ((h - 56) % 16 !== 0 || h < 56 || h > COMPACT_TALL)
            throw new Error(`${at} compact(${need}).h = ${h} is not 56 + 16n up to 152`);
    }
    // a card (a notification, NOTIFICATIONS.md §3): content-fit up to 160, never under 56
    const card = {card: true};
    eq(s.compact(100, 136, card), {w: c.compactMax, h: 136, r: 28}, `${at} card: full width, one line 136`);
    eq(s.compact(100, 152, card).h, 152, `${at} card with two lines: 152`);
    eq(s.compact(100, 104, card).h, 104, `${at} card without buttons (an alert): 104`);
    eq(s.compact(100, 300, card).h, COMPACT_TALL, `${at} card stops at 152`);
    eq(s.compact(100, 10, card).h, 56, `${at} card never under 56`);

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
    if (COMPACT_TALL > s.container.h)
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
    eq(s.compactMax, 410, 'override: 0.72 × 600 = 432, but 28em = 410 is less');
    eq(s.minimal(5000).w, 352, 'override: 0.6 × 600 = 360, but 24em = 352 is less');
    eq(s.idle, {w: 132, h: 32, r: 16}, 'override leaves idle alone');
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
    eq(s.idle, {w: 124, h: 24, r: 12}, 'panel 32 → pill 24, cell 16: 8 + 16 + 6 + 85 + 8');
    eq(s.hover(s.idle), {w: 136, h: 26, r: 13}, 'panel 32 → hover');
}
{
    const s = shapesFor({width: 1920}, 41);
    eq(s.idle, {w: 132, h: 33, r: 16}, 'odd pill height → radius floors');
    eq(s.press(s.idle).r, 18, 'odd pill height → press radius');
}

// shapes are fresh objects: mutating one call's result must not leak into the next
{
    const a = shapesFor({width: 1920}, PANEL_H);
    a.idle.w = 1;
    eq(shapesFor({width: 1920}, PANEL_H).idle.w, 132, 'results are not shared');
}

// --- the em (design "Đơn vị là em": Large Text and the font size scale bar and pill) ----
eq(compactMetrics(), {
    head: 56, lead: 40, vpad: 8, side: 14, gap: 12, row: 16, maxRows: 6, radius: 28, button: 32,
    art: 72, artInset: 8, artRadius: 20, rowIcon: 16, bodyGap: 8, actionsGap: 12, edge: 12, min: 240,
}, 'the compact at 1em: tokens');
{
    const m = compactMetrics(EM_1 * 1.25);
    eq([m.head, m.lead, m.row, m.radius, m.button, m.art, m.min], [70, 50, 20, 35, 40, 90, 300], 'the compact with Large Text');
    const s = shapesFor({width: 1920}, 50, {em: EM_1 * 1.25});
    eq([s.compact(100, 70).h, s.compact(100, 71).h, s.compact(100, 999).h], [70, 90, 190], 'Large Text: 70 + 20n up to 190');
    eq(s.compactMax, 404, 'Large Text: 28em = 513, 0.72 × 560 = 404 caps');
}
eq(Math.round(EM_1 * 100) / 100, 14.67, '1em = 11 pt at 96 dpi');
eq(pillMetrics(), {inset: 4, pad: 8, gap: 6, buttonGap: 8, hover: 12, press: 18}, 'the pill at 1em: tokens');
eq(pillMetrics(EM_1 * 1.25), {inset: 5, pad: 10, gap: 8, buttonGap: 10, hover: 16, press: 22}, 'Large Text (1.25)');
eq(pillMetrics(EM_1 * 2), {inset: 8, pad: 16, gap: 12, buttonGap: 16, hover: 24, press: 36}, 'twice the font');
eq(pillMetrics(0), pillMetrics(), 'no em: the design\'s');
{
    const s = shapesFor({width: 1920}, PANEL_H);
    eq([s.em, s.pad, s.inset, s.cell, s.gap, s.buttonGap], [EM_1, 8, 4, 24, 6, 8], 'metrics at 1em: content box 24');
}
{
    // Large Text: the bar is 2.75em = 50, the pill 40 and its cell 30 (design/mascot: Bu keeps 20 in it)
    const em = EM_1 * 1.25, s = shapesFor({width: 1920}, 50, {em});
    eq([s.idle.h, s.cell, s.pad, s.gap], [40, 30, 10, 8], 'Large Text: pill 40, cell 30');
    eq(s.idle.w, 166, 'Large Text idle: 10 + 30 + 8 + 107 (85 × 1.25) + 10 = 165 → 166');
    eq(s.minimal(5000).w, 336, 'Large Text: 24em = 440, but 0.6 × expanded = 336 still caps');
    eq(shapesFor({width: 3440}, 50, {em}).minimal(5000).w, 440, 'Large Text on a wide screen: 24em = 440');
    eq(s.hover(s.idle), {w: 182, h: 42, r: 21}, 'Large Text hover: + 16');
}
{
    // measured, not written: the clock is 90 at 1.25–2× (design/pill), so idle is 136 there
    const s = shapesFor({width: 1920}, PANEL_H, {idleTextW: 90});
    eq([s.idle.w, s.side.w], [136, 136], 'a measured clock of 90 → idle and side pills 136');
    eq(shapesFor({width: 1920}, PANEL_H, {idleTextW: 103}).idle.w, 150, 'DejaVu Sans (103): 149 → 150');
    eq(shapesFor({width: 1920}, PANEL_H, {idleTextW: 84.3}).idle.w, 132, 'fractional text rounds up');
    for (const bad of [0, -5, NaN, undefined, null])
        eq(shapesFor({width: 1920}, PANEL_H, {idleTextW: bad}).idle.w, 132, `idleTextW ${bad}: the 1× default`);
    eq(IDLE_TEXT_1EM, 85, 'SF Pro Display 11 at 1×');
}
eq(idleSample('8', 'AM'), '88\u223688\u223688 AM', 'the clock at its longest, Shell\'s ratio sign');
eq(idleSample('0'), '00\u223600\u223600', 'no meridiem: 24 h locale');
eq(idleSample('x', 'PM'), '88\u223688\u223688 PM', 'not a digit: 8');

// --- the morph's bounce (2026-11-06: expanded → minimal bounced into its text) ----------------
{
    eq([BACK_SHARE, SHRINK_BOUNCE], [0.1, 12], 'Clutter\'s back goes 10 % past; a shrink at most 12 px');
    // measured in headless Shell: 560×133 → 168×32 went down to 129×22 (39 px past, under the text)
    const stop = shrinkStop({w: 560, h: 133}, {w: 168, h: 32});
    eq(Math.round((168 - stop.w) * 10) / 10, 12, 'the long collapse turns 12 px short of its width');
    eq(Math.round((32 - stop.h) * 10) / 10, 3.1, 'and its height in the same proportion (101 of 392 px)');
    eq(shrinkStop({w: 360, h: 56}, {w: 240, h: 32}), null, 'compact → minimal (120 px): Clutter\'s own bounce, 12 px');
    eq(shrinkStop({w: 300, h: 32}, {w: 240, h: 32}), null, 'a short shrink: Clutter\'s own');
    eq([shrinkStop({w: 240, h: 32}, {w: 560, h: 133}), shrinkStop({w: 240, h: 32}, {w: 240, h: 32})], [null, null],
        'growing or not moving: Clutter\'s own (a grow bounces outward)');
    const tall = shrinkStop({w: 240, h: 300}, {w: 240, h: 56});
    eq([tall.w, Math.round((56 - tall.h) * 10) / 10], [240, 12], 'a shrink in height only: its height turns 12 px short');
}

console.log('shapes: ok');
