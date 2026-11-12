/**
 * Which text the wallpaper under each side of the top bar wants (`cluster-contrast`, SPEC
 * §1, 2026-11-04). Pure: wallpaper.js decodes the image and hands its pixels here;
 * panel.js puts the answer on each side's box as `buoy-dark-text` / `buoy-light-text`.
 * GNOME's own light/dark style is another thing: it styles Shell's menus and picks
 * `picture-uri-dark`; the text on Buoy's see-through bar follows the wallpaper alone.
 *
 * Which file Shell draws: js/ui/background.js BackgroundSource.getBackground. Where it
 * lands on a monitor: mutter src/compositor/meta-background.c get_texture_area.
 */

export const BAND = 40;     // the panel's height: the strip measured, logical px
export const STEP = 8;      // one profile value per STEP px across the monitor
const ROWS = [2, 6, 10, 14, 18, 22, 26, 30, 34, 38]; // rows sampled inside the band

/**
 * What Shell draws (background.js getBackground): `picture-uri-dark` under prefer-dark,
 * else `picture-uri`; only the colours for `none`. A slideshow (.xml) changes over the day
 * and is not decoded: its colour is unknown.
 *
 * @param {object} s
 * @param {string} s.scheme  org.gnome.desktop.interface color-scheme
 * @param {string} s.uri  picture-uri
 * @param {string} s.uriDark  picture-uri-dark
 * @param {string} s.options  picture-options
 * @returns {{type: ('image'|'pattern'|'unknown'), uri?: string}} what to measure
 */
export function wallpaperSource({scheme, uri, uriDark, options}) {
    if (options === 'none')
        return {type: 'pattern'};
    const u = scheme === 'prefer-dark' ? uriDark : uri;
    if (!u || /\.xml$/i.test(u))
        return {type: 'unknown'};
    return {type: 'image', uri: u};
}

/**
 * Where the image is drawn on a monitor, in that monitor's coordinates — a port of
 * meta-background.c get_texture_area (logical px; `spanned` ignores the monitor scale).
 *
 * @param {string} style  picture-options: wallpaper | centered | scaled | stretched | zoom | spanned
 * @param {{width: number, height: number}} img  the image's real size
 * @param {{x: number, y: number, width: number, height: number}} mon  the monitor
 * @param {{width: number, height: number}} screen  all monitors' bounding size
 * @returns {{x: number, y: number, width: number, height: number, tile: boolean}}
 */
export function imageArea(style, img, mon, screen) {
    const half = n => Math.trunc(n / 2);
    switch (style) {
    case 'wallpaper':
        return {
            x: Math.trunc((screen.width - img.width) / 2) - mon.x,
            y: Math.trunc((screen.height - img.height) / 2) - mon.y,
            width: img.width, height: img.height, tile: true,
        };
    case 'centered':
        return {
            x: half(mon.width) - half(img.width), y: half(mon.height) - half(img.height),
            width: img.width, height: img.height, tile: false,
        };
    case 'scaled':
    case 'zoom': {
        const sx = mon.width / img.width, sy = mon.height / img.height;
        if ((style === 'scaled' && sx < sy) || (style === 'zoom' && sx > sy)) {
            const height = Math.trunc(img.height * sx);
            return {x: 0, y: half(mon.height) - half(height), width: mon.width, height, tile: false};
        }
        const width = Math.trunc(img.width * sy);
        return {x: half(mon.width) - half(width), y: 0, width, height: mon.height, tile: false};
    }
    case 'spanned':
        return {x: -mon.x, y: -mon.y, width: screen.width, height: screen.height, tile: false};
    default: // stretched, and Mutter's default
        return {x: 0, y: 0, width: mon.width, height: mon.height, tile: false};
    }
}

// sRGB channel → linear light, as a table.
const LINEAR = Array.from({length: 256}, (_, i) => {
    const c = i / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/**
 * Relative luminance (WCAG 2), 0 black … 1 white.
 *
 * @param {number} r  0–255
 * @param {number} g  0–255
 * @param {number} b  0–255
 * @returns {number}
 */
export function luminance(r, g, b) {
    return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
}

/** @typedef {[number, number, number]} RGB */
/**
 * @param {string} s  `#rgb`, `#rrggbb` or GDK's `#rrrrggggbbbb` (primary-color's default)
 * @returns {RGB} [r, g, b] 0–255; black when it does not parse
 */
export function parseColor(s) {
    const hex = /^#([0-9a-f]+)$/i.exec(s ?? '')?.[1];
    if (!hex || hex.length % 3 || hex.length > 12)
        return [0, 0, 0];
    const n = hex.length / 3, max = 16 ** n - 1;
    return /** @type {RGB} */ ([0, 1, 2].map(i => Math.round(parseInt(hex.slice(i * n, (i + 1) * n), 16) / max * 255)));
}

/**
 * The colours behind (or instead of) the image at a column of the band: Shell's
 * `_loadPattern`. A vertical gradient starts at the primary colour, which is all the top
 * strip shows; a horizontal one runs left to right across the monitor.
 *
 * @param {{primary: string, secondary: string, shading: string}} pattern
 * @param {number} x  column, monitor coordinates
 * @param {number} width  the monitor's width
 * @returns {number} luminance
 */
export function patternLuminance({primary, secondary, shading}, x, width) {
    const a = parseColor(primary);
    if (shading !== 'horizontal')
        return luminance(...a);
    const b = parseColor(secondary);
    const t = width > 1 ? Math.min(1, Math.max(0, x / (width - 1))) : 0;
    const mixed = /** @type {RGB} */ (a.map((c, i) => Math.round(c + (b[i] - c) * t)));
    return luminance(...mixed);
}

function sample(img, area, x, y, back) {
    let u = (x - area.x) / area.width, v = (y - area.y) / area.height;
    if (area.tile) {
        u -= Math.floor(u);
        v -= Math.floor(v);
    } else if (u < 0 || u >= 1 || v < 0 || v >= 1) {
        return back;            // scaled/centered leave the colours around the image
    }
    const px = Math.min(img.width - 1, Math.floor(u * img.width));
    const py = Math.min(img.height - 1, Math.floor(v * img.height));
    const o = py * img.rowstride + px * img.channels;
    const p = img.pixels;
    const l = luminance(p[o], p[o + 1], p[o + 2]);
    if (!img.alpha)
        return l;
    const a = p[o + 3] / 255;
    return a * l + (1 - a) * back;
}

/**
 * Mean luminance of the top BAND px of a monitor, one value per STEP px across it.
 *
 * @param {?object} img  decoded image at any scale: {width, height, rowstride, channels,
 *   alpha, pixels}; null when only the colours are drawn
 * @param {?object} area  imageArea() for the image's real size; null with no image
 * @param {{width: number}} mon  the monitor
 * @param {object} pattern  see patternLuminance
 * @returns {number[]} ceil(mon.width / STEP) values
 */
export function bandProfile(img, area, mon, pattern) {
    const n = Math.ceil(mon.width / STEP);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const x = Math.min(mon.width - 1, i * STEP + STEP / 2);
        const back = patternLuminance(pattern, x, mon.width);
        let sum = 0;
        for (const y of ROWS)
            sum += img ? sample(img, area, x, y, back) : back;
        out[i] = sum / ROWS.length;
    }
    return out;
}

/**
 * @param {?number[]} profile  bandProfile()
 * @param {number} x0  left edge, monitor coordinates
 * @param {number} x1  right edge
 * @returns {?number} mean luminance under [x0, x1); null with no profile or an empty span
 */
export function spanLuminance(profile, x0, x1) {
    if (!profile)
        return null;
    const a = Math.max(0, Math.floor(x0 / STEP));
    const b = Math.min(profile.length, Math.ceil(x1 / STEP));
    if (b <= a)
        return null;
    let sum = 0;
    for (let i = a; i < b; i++)
        sum += profile[i];
    return sum / (b - a);
}

// The two texts (stylesheet.css): white, and #1a1a1a on a light wallpaper.
const DARK_TEXT = luminance(0x1a, 0x1a, 0x1a);

/**
 * Dark text when it reads better than white on that luminance (WCAG contrast ratio); the
 * two cross near 0.2.
 *
 * @param {number} l  luminance
 * @returns {'dark-text'|'light-text'}
 */
export function textFor(l) {
    return (l + 0.05) / (DARK_TEXT + 0.05) > 1.05 / (l + 0.05) ? 'dark-text' : 'light-text';
}

/**
 * @param {string} mode  `cluster-contrast`: auto | dark-text | light-text
 * @param {?number} l  luminance under that side, null when unknown (still decoding, a
 *   slideshow, a file that would not load)
 * @param {boolean} overview  the Overview is showing: the bar sits on its dark backdrop
 * @returns {'dark-text'|'light-text'}
 */
export function contrastFor(mode, l, overview) {
    if (mode === 'dark-text' || mode === 'light-text')
        return mode;
    if (overview || l === null)
        return 'light-text';
    return textFor(l);
}

/**
 * A tray icon drawn as a bitmap in one light colour — Electron apps' (Claude, Discord…)
 * white tray glyphs, made for a dark bar — is a glyph in all but name: `color` cannot
 * reach a bitmap, so panel.js tints it like the text on a dark-text side (Ethan
 * 2026-11-04). A logo in colours, or in one brand colour, is not one and keeps its look.
 * (A dark glyph needs nothing: on light text it is as invisible as on GNOME's own bar.)
 *
 * @param {object} img  {width, height, rowstride, channels, alpha, pixels}, RGBA
 * @returns {boolean} near-white (min channel ≥ 200, channels within 30) in ≥ 97 % of the
 *   pixels that show (alpha ≥ 32), and at least 1 % of the icon shows
 */
export function lightGlyph(img) {
    if (!img?.alpha)
        return false;           // an opaque bitmap is a picture, not a glyph
    let shown = 0, light = 0;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const o = y * img.rowstride + x * img.channels;
            const [r, g, b, a] = img.pixels.slice(o, o + 4);
            if (a < 32)
                continue;
            shown++;
            const lo = Math.min(r, g, b);
            if (lo >= 200 && Math.max(r, g, b) - lo <= 30)
                light++;
        }
    }
    return shown >= img.width * img.height * 0.01 && light >= shown * 0.97;
}

/**
 * @param {boolean} light  lightGlyph() of the icon
 * @param {'dark-text'|'light-text'} text  that side's text
 * @returns {?string} the tint to draw it in, or null to leave it as the app drew it
 */
export function glyphTint(light, text) {
    return light && text === 'dark-text' ? '#1a1a1a' : null;
}
