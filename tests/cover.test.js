// Run: gjs -m tests/cover.test.js   (pure: a cover's main colour for the equaliser, design/pill)
import {SAMPLE, MIN_CONTRAST, mainColour, lifted, onBlack, hex, coverColour} from '../src/buoy@murilegus/lib/kit/model/cover.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function ok(cond, msg) {
    if (!cond)
        throw new Error(msg);
}

// a picture of w × h pixels from paint(x, y) → [r, g, b] or [r, g, b, a]
function picture(w, h, paint, {channels = 3, pad = 0} = {}) {
    const rowstride = w * channels + pad;
    const bytes = new Uint8Array(h * rowstride);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++)
            paint(x, y).forEach((v, k) => (bytes[y * rowstride + x * channels + k] = v));
    }
    return {bytes, channels, rowstride, width: w, height: h};
}
const flat = rgb => picture(SAMPLE, SAMPLE, () => rgb);
const hueOf = ([r, g, b]) => {
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (!d)
        return null;
    let h = (r - g) / d + 4;
    if (max === r)
        h = ((g - b) / d + 6) % 6;
    else if (max === g)
        h = (b - r) / d + 2;
    return Math.round(h * 60);
};
const nearHue = (rgb, want, msg, tol = 12) => {
    const h = hueOf(rgb);
    const d = Math.abs(((h - want) % 360 + 540) % 360 - 180);
    ok(h !== null && d <= tol, `${msg}: hue ${h}, want about ${want}`);
};

// --- the main colour ------------------------------------------------------------------------
eq(mainColour(flat([219, 40, 106])), [219, 40, 106], 'one colour: itself');
nearHue(mainColour(picture(SAMPLE, SAMPLE, (x, y) => y < 18 ? [200, 30, 90] : [20, 20, 20])), 339, 'roses on black: the roses');
nearHue(mainColour(picture(SAMPLE, SAMPLE, x => x < 16 ? [30, 90, 200] : [220, 180, 20])), 219, 'two colours: the one with more of the picture');
nearHue(mainColour(picture(SAMPLE, SAMPLE, x => x < 16 ? [220, 180, 20] : [30, 90, 200])), 48, 'the other way round: the other');
nearHue(mainColour(picture(SAMPLE, SAMPLE, x => x % 2 ? [230, 20, 40] : [230, 30, 10])), 3, 'reds on both ends of the wheel count as one');
nearHue(mainColour(picture(SAMPLE, SAMPLE, (x, y) => (x - 16) ** 2 + (y - 8) ** 2 < 49 ? [22, 40, 74] : [11, 15, 26])), 222,
    'a dark navy cover is blue: dark pixels vote as bright ones');
eq(mainColour(flat([128, 128, 128])), null, 'grey: no colour');
eq(mainColour(flat([0, 0, 0])), null, 'black: no colour');
eq(mainColour(flat([255, 255, 255])), null, 'white: no colour');
eq(mainColour(picture(SAMPLE, SAMPLE, (_x, y) => [y * 10, y * 10, y * 10])), null, 'black and white: no colour');
eq(mainColour(picture(SAMPLE, SAMPLE, (x, y) => x < 4 && y < 4 ? [255, 0, 0] : [40, 40, 40])), null,
    'a small coloured mark on a grey cover: no colour');
nearHue(mainColour(picture(SAMPLE, SAMPLE, (x, y) => x < 12 && y < 12 ? [255, 0, 0] : [40, 40, 40])), 0, 'a quarter of it red: red');
eq(mainColour(picture(SAMPLE, SAMPLE, x => x < 20 ? [200, 30, 90, 0] : [30, 90, 200, 255], {channels: 4})), [30, 90, 200],
    'RGBA: see-through pixels are not part of the picture');
eq(mainColour(picture(SAMPLE, SAMPLE, () => [219, 40, 106], {pad: 5})), [219, 40, 106], 'a rowstride wider than the row: the padding is skipped');
eq(mainColour(picture(1, 1, () => [10, 200, 120])), [10, 200, 120], 'one pixel');
eq([mainColour(null), mainColour({}), mainColour({bytes: new Uint8Array(3), channels: 3, rowstride: 3, width: 2, height: 2}),
    mainColour({bytes: new Uint8Array(12), channels: 2, rowstride: 4, width: 2, height: 2}),
    mainColour({bytes: new Uint8Array(12), channels: 3, rowstride: 6, width: 0, height: 2})],
[null, null, null, null, null], 'no pixels, too few bytes, odd channels, no size: none, no throw');

// --- read on black --------------------------------------------------------------------------
eq(MIN_CONTRAST, 4.5, '4.5:1 on the island (design/colours)');
eq(lifted([239, 160, 1]), [239, 160, 1], 'already light enough: itself');
for (const dark of [[15, 23, 42], [183, 31, 87], [197, 23, 31], [10, 60, 20], [60, 0, 90], [1, 0, 0]]) {
    const c = lifted(dark);
    ok(onBlack(c) >= MIN_CONTRAST, `${hex(dark)} lifted to ${hex(c)} reads on black, ${onBlack(c).toFixed(2)}:1`);
    ok(onBlack(c) < MIN_CONTRAST + 1.2, `${hex(dark)} is lifted no further than needed, ${onBlack(c).toFixed(2)}:1`);
    if (hueOf(dark) !== null && dark.some(v => v > 5))
        nearHue(c, hueOf(dark), `${hex(dark)} keeps its hue`);
}
eq(lifted([15, 23, 42]).every(v => Number.isInteger(v) && v >= 0 && v <= 255), true, 'bytes out');
ok(Math.abs(onBlack([255, 255, 255]) - 21) < 0.01 && Math.abs(onBlack([0, 0, 0]) - 1) < 0.01, 'contrast with black: 21 for white, 1 for black');

// --- as the glyph takes it ------------------------------------------------------------------
eq([hex([219, 40, 106]), hex([0, 0, 0]), hex([255, 255, 255])], ['#db286a', '#000000', '#ffffff'], '#rrggbb, lower case');
eq([hex([256, 0, 0]), hex([1.5, 0, 0]), hex([1, 2]), hex('red'), hex(null)], [null, null, null, null, null], 'not three bytes: none');
eq(coverColour(flat([239, 160, 1])), '#efa001', 'an amber cover: its amber');
ok(/^#[0-9a-f]{6}$/.test(coverColour(flat([15, 23, 42]))) && coverColour(flat([15, 23, 42])) !== '#0f172a', 'a dark cover: lifted');
eq([coverColour(flat([90, 90, 90])), coverColour(null)], [null, null], 'no colour, no cover: none (the equaliser stays fg)');

print('cover: ok');
