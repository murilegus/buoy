/**
 * A cover's main colour, for the equaliser beside it (design/pill "Equaliser", 2026-11-13,
 * Ethan: one colour from the cover, as the iPhone's island; not a gradient). Pure: the
 * media source decodes the cover small (kit/services/files.js readPixels) and hands its
 * bytes here; the adapter passes the answer on as the glyph's `color`.
 *
 * - The colour is the hue most of the cover's coloured pixels share. Grey, black and white
 *   pixels do not vote; a dark pixel votes as a bright one does, so a navy cover is blue.
 * - A cover with next to no colour (black, grey, black and white) has none: the equaliser
 *   stays `fg`.
 * - It is shown on the island's black, so it is made lighter — the same hue and
 *   saturation — until 4.5:1 (design/colours "Tương phản").
 */

import {luminance} from './contrast.js';

/** The side the cover is decoded to: enough to tell its colours, cheap to walk. */
export const SAMPLE = 24;
/** Contrast with the island's black the equaliser's colour must reach. */
export const MIN_CONTRAST = 4.5;

const BINS = 24;            // 15° of hue each
const MIN_SATURATION = 0.2; // below: grey, no vote
const MIN_VALUE = 0.1;      // below: black, no vote
const MIN_SHARE = 0.06;     // of the picture's pixels, by saturation: less is no colour

/** @typedef {[number, number, number]} RGB */

// hue 0–360, saturation and value 0–1
function hsv([r, g, b]) {
    const [x, y, z] = [r / 255, g / 255, b / 255];
    const max = Math.max(x, y, z), d = max - Math.min(x, y, z);
    let h = 0;
    if (d > 0) {
        if (max === x)
            h = ((y - z) / d + 6) % 6;
        else if (max === y)
            h = (z - x) / d + 2;
        else
            h = (x - y) / d + 4;
    }
    return [h * 60, max ? d / max : 0, max];
}

function hsl(rgb) {
    const [x, y, z] = rgb.map(v => v / 255);
    const max = Math.max(x, y, z), min = Math.min(x, y, z), l = (max + min) / 2, d = max - min;
    return [hsv(rgb)[0], d && l > 0 && l < 1 ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
}

function fromHsl([h, s, l]) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = l - c / 2;
    const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
    return /** @type {RGB} */ ([r, g, b].map(v => Math.max(0, Math.min(255, Math.round((v + m) * 255)))));
}

const isByte = v => Number.isInteger(v) && v >= 0 && v <= 255;

/**
 * @param {RGB} rgb
 * @returns {number} its contrast with black (WCAG 2), 1 … 21
 */
export function onBlack(rgb) {
    return (luminance(...rgb) + 0.05) / 0.05;
}

/**
 * @param {*} img  {bytes, channels, rowstride, width, height}: a pixbuf's pixels, RGB or RGBA
 * @returns {?RGB} the hue most of its coloured pixels share, averaged; null for a picture
 *   with next to no colour, or pixels that are not there
 */
export function mainColour(img) {
    const {bytes, channels: n, rowstride, width: w, height: h} = img ?? {};
    if (!bytes || ![3, 4].includes(n) || !(w > 0) || !(h > 0) || !(rowstride >= w * n) ||
        bytes.length < (h - 1) * rowstride + w * n)
        return null;
    const bins = Array.from({length: BINS}, () => ({w: 0, rgb: [0, 0, 0]}));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * rowstride + x * n;
            if (n === 4 && bytes[i + 3] < 128)
                continue;                  // see-through: not part of the picture
            const rgb = /** @type {RGB} */ ([bytes[i], bytes[i + 1], bytes[i + 2]]);
            const [hue, s, v] = hsv(rgb);
            if (s < MIN_SATURATION || v < MIN_VALUE)
                continue;
            const b = bins[Math.floor(hue / (360 / BINS)) % BINS];
            b.w += s;
            rgb.forEach((c, k) => (b.rgb[k] += c * s));
        }
    }
    // a hue and its two neighbours: red sits on both ends of the wheel
    const near = i => [-1, 0, 1].map(d => bins[(i + d + BINS) % BINS]);
    const score = i => near(i).reduce((sum, b, k) => sum + b.w * (k === 1 ? 2 : 1), 0);
    const best = bins.map((_, i) => i).reduce((a, i) => score(i) > score(a) ? i : a, 0);
    const total = near(best).reduce((sum, b) => sum + b.w, 0);
    if (total / (w * h) < MIN_SHARE)
        return null;
    return /** @type {RGB} */ ([0, 1, 2].map(k => Math.round(near(best).reduce((sum, b) => sum + b.rgb[k], 0) / total)));
}

/**
 * @param {RGB} rgb
 * @returns {RGB} the same hue and saturation, lighter until it reads on black (MIN_CONTRAST);
 *   itself when it already does
 */
export function lifted(rgb) {
    if (onBlack(rgb) >= MIN_CONTRAST)
        return rgb;
    const [h, s, l0] = hsl(rgb);
    let c = rgb;
    for (let l = l0; l <= 1 && onBlack(c) < MIN_CONTRAST; l += 0.01)
        c = fromHsl([h, s, Math.min(l, 1)]);
    return onBlack(c) >= MIN_CONTRAST ? c : [255, 255, 255];
}

/**
 * @param {*} rgb
 * @returns {?string} '#rrggbb', or null for anything that is not three bytes
 */
export function hex(rgb) {
    return Array.isArray(rgb) && rgb.length === 3 && rgb.every(isByte)
        ? `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`
        : null;
}

/**
 * The equaliser's colour for a cover.
 *
 * @param {*} img  as mainColour
 * @returns {?string} '#rrggbb' readable on black, or null: no colour, the equaliser stays `fg`
 */
export function coverColour(img) {
    const c = mainColour(img);
    return c ? hex(lifted(c)) : null;
}
