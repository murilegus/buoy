// Run: gjs -m tests/contrast.test.js   (pure: text over the wallpaper, SPEC §1 cluster-contrast)
import {
    BAND, STEP, bandProfile, contrastFor, glyphTint, imageArea, lightGlyph, luminance, parseColor,
    patternLuminance, spanLuminance, textFor, wallpaperSource,
} from '../src/buoy@murilegus/lib/kit/model/contrast.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function near(actual, expected, msg, tol = 0.01) {
    if (typeof actual !== 'number' || Math.abs(actual - expected) > tol)
        throw new Error(`${msg}: expected ≈${expected}, got ${actual}`);
}

// --- which file Shell draws (background.js getBackground) -----------------------------
const bg = {scheme: 'default', uri: 'file:///a.jpg', uriDark: 'file:///b.jpg', options: 'zoom'};
eq(wallpaperSource(bg), {type: 'image', uri: 'file:///a.jpg'}, 'default scheme: picture-uri');
eq(wallpaperSource({...bg, scheme: 'prefer-light'}).uri, 'file:///a.jpg', 'prefer-light: picture-uri');
eq(wallpaperSource({...bg, scheme: 'prefer-dark'}).uri, 'file:///b.jpg', 'prefer-dark: picture-uri-dark');
eq(wallpaperSource({...bg, options: 'none'}), {type: 'pattern'}, 'picture-options none: the colours only');
eq(wallpaperSource({...bg, uri: 'file:///usr/share/backgrounds/day.XML'}), {type: 'unknown'},
    'a slideshow is not decoded');
eq(wallpaperSource({...bg, uri: ''}), {type: 'unknown'}, 'no uri: unknown');

// --- where it lands (meta-background.c get_texture_area) ------------------------------
const img4k = {width: 3840, height: 2160};
const mon = (width, height, x = 0) => ({x, y: 0, width, height});
for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]]) {
    eq(imageArea('zoom', img4k, mon(w, h), {width: w, height: h}),
        {x: 0, y: 0, width: w, height: Math.trunc(2160 * (w / 3840)), tile: false},
        `zoom, 16:9 image on ${w}×${h}: covers the monitor`);
}
eq(imageArea('zoom', img4k, mon(3440, 1440), {width: 3440, height: 1440}),
    {x: 0, y: -247, width: 3440, height: 1935, tile: false},
    'zoom on 3440×1440: fits the width, top and bottom cut');
eq(imageArea('scaled', img4k, mon(3440, 1440), {width: 3440, height: 1440}),
    {x: 440, y: 0, width: 2560, height: 1440, tile: false},
    'scaled on 3440×1440: fits the height, colour bars left and right');
eq(imageArea('centered', {width: 1000, height: 500}, mon(1920, 1080), {width: 1920, height: 1080}),
    {x: 460, y: 290, width: 1000, height: 500, tile: false}, 'centered: real size, in the middle');
eq(imageArea('wallpaper', {width: 256, height: 256}, mon(1920, 1080, 1920), {width: 3840, height: 1080}),
    {x: 1792 - 1920, y: 412, width: 256, height: 256, tile: true},
    'wallpaper: a tile centred on the whole screen, in the monitor\'s coordinates');
eq(imageArea('spanned', img4k, mon(1920, 1080, 1920), {width: 3840, height: 1080}),
    {x: -1920, y: 0, width: 3840, height: 1080, tile: false}, 'spanned: one image over all monitors');
eq(imageArea('stretched', img4k, mon(1366, 768), {width: 1366, height: 768}),
    {x: 0, y: 0, width: 1366, height: 768, tile: false}, 'stretched: the monitor, any aspect');
eq(imageArea('bogus', img4k, mon(800, 600), {width: 800, height: 600}).width, 800,
    'an unknown style is stretched, as Mutter\'s default');

// --- colours -----------------------------------------------------------------------
near(luminance(0, 0, 0), 0, 'black is 0');
near(luminance(255, 255, 255), 1, 'white is 1');
near(luminance(128, 128, 128), 0.2159, 'mid grey is ~0.22 (linear, not 0.5)', 0.001);
eq(parseColor('#000000000000'), [0, 0, 0], 'GDK 16-bit black (primary-color default)');
eq(parseColor('#ffffffffffff'), [255, 255, 255], 'GDK 16-bit white');
eq(parseColor('#1a1a1a'), [26, 26, 26], '#rrggbb');
eq(parseColor('#fff'), [255, 255, 255], '#rgb');
eq(parseColor('rgb(1,2,3)'), [0, 0, 0], 'not hex: black');
eq(parseColor('#12345'), [0, 0, 0], 'hex length not a multiple of 3: black');
eq(parseColor(undefined), [0, 0, 0], 'missing: black');

const black = {primary: '#000000', secondary: '#ffffff', shading: 'solid'};
near(patternLuminance(black, 500, 1000), 0, 'solid: the primary colour');
near(patternLuminance({...black, shading: 'vertical'}, 500, 1000), 0, 'vertical: the top is the primary');
near(patternLuminance({...black, shading: 'horizontal'}, 0, 1000), 0, 'horizontal: primary on the left');
near(patternLuminance({...black, shading: 'horizontal'}, 999, 1000), 1, 'horizontal: secondary on the right');

// --- the band --------------------------------------------------------------------------
// A tiny RGB(A) image from a function of (x, y) → [r, g, b, a].
function image(width, height, f, alpha = false) {
    const channels = alpha ? 4 : 3, rowstride = width * channels + 2; // padded rows, as GdkPixbuf
    const pixels = new Uint8Array(rowstride * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++)
            f(x, y).slice(0, channels).forEach((c, i) => (pixels[y * rowstride + x * channels + i] = c));
    }
    return {width, height, rowstride, channels, alpha, pixels};
}
const W = [255, 255, 255, 255], K = [0, 0, 0, 255];
const m = mon(320, 400), screen = {width: 320, height: 400};
const profile = (img, style, pattern = black) =>
    bandProfile(img, img ? imageArea(style, {width: img.width * 10, height: img.height * 10}, m, screen) : null, m, pattern);

eq(profile(null, 'zoom').length, 320 / STEP, 'one value per STEP px');
eq(bandProfile(null, null, mon(321, 400), black).length, Math.ceil(321 / STEP), 'a partial last step counts');
near(spanLuminance(profile(null, 'zoom', {...black, primary: '#ffffff'}), 0, 320), 1, 'colours only: their luminance');
const split = image(32, 40, x => x < 16 ? W : K);
near(spanLuminance(profile(split, 'stretched'), 0, 160), 1, 'left half of the image white');
near(spanLuminance(profile(split, 'stretched'), 160, 320), 0, 'right half black');
const topWhite = image(32, 40, (_x, y) => y < 4 ? W : K); // the top tenth: 40 px of 400
near(spanLuminance(profile(topWhite, 'stretched'), 0, 320), 1, `only the top ${BAND} px count`);
const narrow = image(16, 40, () => W);       // 160×400 real: scaled leaves 80 px bars each side
const bars = profile(narrow, 'scaled');
near(spanLuminance(bars, 0, 80), 0, 'scaled: the bars show the colour');
near(spanLuminance(bars, 80, 240), 1, 'scaled: the image between them');
const clear = image(32, 40, () => [255, 255, 255, 0], true);
near(spanLuminance(profile(clear, 'stretched'), 0, 320), 0, 'a transparent image shows the colour behind');
near(spanLuminance(profile(image(32, 40, () => W, true), 'stretched'), 0, 320), 1, 'an opaque one does not');
const tile = image(2, 2, () => W);           // 20×20 real, tiled: covers everything
near(spanLuminance(bandProfile(tile, imageArea('wallpaper', {width: 20, height: 20}, m, screen), m, black), 0, 320),
    1, 'wallpaper: the tile repeats, no colour shows');

// --- a span of it ------------------------------------------------------------------------
eq(spanLuminance(null, 0, 100), null, 'no profile yet: unknown');
eq(spanLuminance([0.5, 0.5], 40, 40), null, 'an empty span: unknown');
near(spanLuminance([0, 1, 1, 0], 8, 24), 1, 'the steps under the span');
near(spanLuminance([0, 1], -50, 5000), 0.5, 'clamped to the monitor');

// --- the decision ------------------------------------------------------------------------
eq(textFor(1), 'dark-text', 'white wallpaper: dark text');
eq(textFor(0), 'light-text', 'black wallpaper: light text');
eq(textFor(luminance(128, 128, 128)), 'dark-text', 'mid grey (128): dark text reads better');
eq(textFor(luminance(110, 110, 110)), 'light-text', 'darker grey (110): white reads better');
eq(contrastFor('auto', 0.9, false), 'dark-text', 'auto follows the wallpaper');
eq(contrastFor('auto', 0.9, true), 'light-text', 'auto in the Overview: its dark backdrop');
eq(contrastFor('auto', null, false), 'light-text', 'auto, unknown: light text (GNOME\'s look)');
eq(contrastFor('dark-text', 0, true), 'dark-text', 'dark-text: always, even in the Overview');
eq(contrastFor('light-text', 1, false), 'light-text', 'light-text: always');

// --- one-colour tray glyphs (Electron's white tray icons) ------------------------------
const disc = (rgb, a = 255) => image(16, 16, (x, y) => (x - 8) ** 2 + (y - 8) ** 2 < 36 ? [...rgb, a] : [0, 0, 0, 0], true);
eq(lightGlyph(disc([255, 255, 255])), true, 'a white shape on transparency is a glyph (Claude\'s)');
eq(lightGlyph(disc([255, 255, 255], 140)), true, 'semi-transparent white too');
eq(lightGlyph(disc([228, 228, 228])), true, 'near-white grey too');
eq(lightGlyph(disc([74, 21, 75])), false, 'one brand colour is a logo, not a glyph');
eq(lightGlyph(disc([255, 220, 120])), false, 'light but tinted (yellow): a logo');
eq(lightGlyph(disc([20, 20, 20])), false, 'a dark glyph: nothing to do on a light-text side');
const twoTone = image(16, 16, x => x < 8 ? [255, 255, 255, 255] : [230, 60, 60, 255], true);
eq(lightGlyph(twoTone), false, 'white with a colour half: a logo (Slack, Firefox)');
const speck = image(16, 16, (x, y) => x === 15 && y === 15 ? [200, 30, 30, 255] : [255, 255, 255, x < 12 ? 255 : 0], true);
eq(lightGlyph(speck), true, 'one stray pixel in 192 does not spoil a glyph (≥ 97 %)');
eq(lightGlyph(image(16, 16, () => [255, 255, 255, 0], true)), false, 'nothing shows: not a glyph');
eq(lightGlyph(image(16, 16, () => [255, 255, 255])), false, 'no alpha channel: a picture');
eq(lightGlyph(null), false, 'no image: not a glyph');
eq(glyphTint(true, 'dark-text'), '#1a1a1a', 'a white glyph on a dark-text side takes the text colour');
eq(glyphTint(true, 'light-text'), null, 'on a light-text side it is already right');
eq(glyphTint(false, 'dark-text'), null, 'a logo is left alone');

log('contrast: ok');
