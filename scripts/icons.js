// gjs -m scripts/icons.js [--sheet-only] [sheet.png] [bigpx]
//
// The daypart and weather icons: 19 colour SVGs on a 24 grid, always on black. They fill
// the pill's 24 px leading cell (one unit = one pixel), 48 px is two pixels a unit, the
// compact's 40 is a little soft (docs/design/icons, 2026-11-11, Ethan). Design source, not
// a build step: it rewrites src/buoy@murilegus/icons/color/{daypart,weather}-*.svg, then renders
// docs/icons.png (a 24 px row, a grid at 48 px with names, five mock idle pills). Palette A,
// soft blue cloud (2026-11-06). Every part carries an id (sun, moon, cloud, rain, snow,
// bolt, wind, horizon, arc) so a tab can split an icon into layers and animate them.
//
// Whole pixels: a straight edge lies on an integer; a disc has an integer centre and
// radius (or both on .5); an upright or level stroke is 2 wide on an integer centre line.
import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Rsvg from 'gi://Rsvg';

const here = GLib.path_get_dirname(import.meta.url.replace('file://', ''));
const ICONS = `${here}/../src/buoy@murilegus/icons/color`;
const sheetOnly = ARGV[0] === '--sheet-only';
const args = sheetOnly ? ARGV.slice(1) : ARGV;
const SHEET = args[0] ?? `${here}/../docs/icons.png`;
const BIG = Number(args[1] ?? 48);

// ---- palette A ---------------------------------------------------------------
const SUN = '#FFD23F';
const PEACH = '#FFB889';            // dawn and evening sun; not the orange status light
const TEAL = '#5CD6E6';             // moon, rain, wind
const INK = '#000000';              // the "!" — always on black, so a hole
const CLOUD = '#CFE6FB';            // soft blue-white cloud
const CLOUD_DARK = '#7FA8D0';       // the cloud behind, in overcast
const SNOW = '#BFF2FA';
const FOG = '#9DBBD6';
const HORIZON = '#7A838D';
const ARC = '#6B737C';               // the sun's path: single pixels, solid

// ---- primitives ----------------------------------------------------------------
const f = v => v.toFixed(2).replace(/\.?0+$/, '').replace(/^-0$/, '0');
const rad = deg => deg * Math.PI / 180;

const line = (x1, y1, x2, y2, sw, color) =>
    `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${f(sw)}" stroke-linecap="round"/>`;

const ray = (cx, cy, ri, ro, deg, sw, color) =>
    line(cx + ri * Math.cos(rad(deg)), cy + ri * Math.sin(rad(deg)), cx + ro * Math.cos(rad(deg)), cy + ro * Math.sin(rad(deg)), sw, color);

// A disc with n rays from ri to ro, the first at `off` degrees.
function sun(cx, cy, r, ri, ro, sw, {color = SUN, n = 8, off = 0} = {}) {
    const rays = Array.from({length: n}, (_, i) => ray(cx, cy, ri, ro, off + i * 360 / n, sw, color));
    return `<g id="sun"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${color}"/>${rays.join('')}</g>`;
}

// The upper half of a disc standing on the horizon row, with five rays, 35° apart: the
// upper three reach ro, the two outer ones stop a pixel short (2026-11-11, Ethan). The
// outer two reach ro - 1 + sw / 2 sideways, so the centre sits that far inside the grid.
function halfSun(cx, cy, r, ri, ro, sw, color = PEACH) {
    const disc = `<path d="M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(cy)}Z" fill="${color}"/>`;
    const rays = [[200, ro - 1], [235, ro], [270, ro], [305, ro], [340, ro - 1]]
        .map(([deg, to]) => ray(cx, cy, ri, to, deg, sw, color));
    return `<g id="sun">${disc}${rays.join('')}</g>`;
}

// A crescent: a disc minus a slightly smaller one offset to the upper right.
function moon(cx, cy, r, color = TEAL) {
    const d = 0.62 * r;
    const r2 = 0.86 * r;
    const [ux, uy] = [0.80, -0.60];            // unit vector to the cut centre
    const a = (r * r - r2 * r2 + d * d) / (2 * d); // distance from the centre to the chord
    const h = Math.sqrt(Math.max(r * r - a * a, 0));
    const [mx, my] = [cx + a * ux, cy + a * uy];
    const p1 = [mx - h * uy, my + h * ux];
    const p2 = [mx + h * uy, my - h * ux];
    return `<path id="moon" d="M${f(p1[0])} ${f(p1[1])}A${f(r)} ${f(r)} 0 1 1 ${f(p2[0])} ${f(p2[1])}` +
        `A${f(r2)} ${f(r2)} 0 0 0 ${f(p1[0])} ${f(p1[1])}Z" fill="${color}"/>`;
}

// A four-point sparkle.
function star(cx, cy, s, color = SUN) {
    const k = 0.32 * s;
    return `<path d="M${f(cx)} ${f(cy - s)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + s)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + s)}` +
        `Q${f(cx - k)} ${f(cy + k)} ${f(cx - s)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - s)}Z" fill="${color}"/>`;
}

// The one cloud: two bumps on a rounded base, in the box x, y, w, h (whole numbers). The
// bumps' centres and radii are rounded so the cloud's top, sides and bottom lie on pixels.
function cloud(x, y, w, h, color = CLOUD, id = 'cloud') {
    const base = Math.round(0.55 * h);
    const R = Math.round(0.42 * h);
    const r = Math.round(0.34 * h);
    const big = [Math.round(x + 0.60 * w), y + R, R];
    const sm = [Math.max(Math.round(x + 0.27 * w), x + r), y + h - base / 2 - Math.round(0.24 * h), r];
    return `<g id="${id}" fill="${color}"><circle cx="${f(big[0])}" cy="${f(big[1])}" r="${f(big[2])}"/>` +
        `<circle cx="${f(sm[0])}" cy="${f(sm[1])}" r="${f(sm[2])}"/>` +
        `<rect x="${f(x)}" y="${f(y + h - base)}" width="${f(w)}" height="${f(base)}" rx="${f(base / 2)}"/></g>`;
}

const drops = (xs, y0, y1, sw = 2, dx = -1, color = TEAL) =>
    `<g id="rain">${xs.map(x => line(x, y0, x + dx, y1, sw, color)).join('')}</g>`;

const dots = (pts, r, color = SNOW) =>
    `<g id="snow">${pts.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}"/>`).join('')}</g>`;

const bolt = (pts, color = SUN) =>
    `<path id="bolt" d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' ')}Z" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/>`;

const svg = (...parts) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${parts.join('')}</svg>\n`;

// ---- dayparts: one horizon and one dotted arc, shared ---------------------------------
// The horizon is exactly one pixel row, row 15 (y 15–16), x 1–23: in the 32 px pill that is
// row 19, the time's baseline row (measured in headless Shell, 2026-11-06, Ethan). The
// sun's path is single solid pixels on an arc around (12, 15), radius about 8.4, mirrored
// in x = 12 (docs/design/icons, 2026-11-11). Cells are [column, row] of the right half.
const HY = 15;
const AR = 8.4;
const ARC_CELLS = [[13, 6], [15, 7], [17, 8], [19, 10], [20, 12]];
const pixels = [...ARC_CELLS.map(([x, y]) => [23 - x, y]).reverse(), ...ARC_CELLS];
const horizon = () =>
    `<g id="arc" fill="${ARC}">${pixels.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1"/>`).join('')}</g>` +
    `<rect id="horizon" x="1" y="${HY}" width="22" height="1" fill="${HORIZON}"/>`;
const onArc = deg => [Math.round(12 + AR * Math.cos(rad(deg))), Math.round(HY - AR * Math.sin(rad(deg)))];
const [mx, my] = onArc(124);
const [ax, ay] = onArc(56);
const arcSun = (x, y) => sun(x, y, 3, 5, 5, 2);

const icons = {
    'daypart-dawn': svg(horizon(), halfSun(9, HY, 5, 7, 9, 2)),
    'daypart-morning': svg(horizon(), arcSun(mx, my)),
    'daypart-noon': svg(horizon(), arcSun(12, 7)),
    'daypart-afternoon': svg(horizon(), arcSun(ax, ay)),
    'daypart-evening': svg(horizon(), halfSun(15, HY, 5, 7, 9, 2)),
    'daypart-night': svg(horizon(), moon(10.5, 7.5, 5.5), star(18.5, 3.5, 2.5), star(17.5, 10.5, 1.5)),

    // ---- weather: GWeather's conditions; sun or moon behind the cloud, upper left ----
    'weather-clear': svg(sun(12, 12, 6, 8, 10, 2)),
    'weather-clear-night': svg(moon(11, 13, 9), star(19.5, 4.5, 2.5), star(20.5, 12.5, 1.5)),
    'weather-few-clouds': svg(sun(8, 9, 4, 6, 7, 2), cloud(5, 11, 18, 11)),
    'weather-few-clouds-night': svg(moon(7.5, 7.5, 5.5), cloud(5, 11, 18, 11)),
    'weather-overcast': svg(cloud(5, 2, 18, 11, CLOUD_DARK, 'cloud-back'), cloud(1, 10, 19, 12)),
    'weather-fog': svg(cloud(1, 2, 22, 12),
        `<g id="fog">${line(4, 17, 16, 17, 2, FOG)}${line(8, 21, 20, 21, 2, FOG)}</g>`),
    'weather-showers-scattered': svg(sun(7, 7, 3, 5, 6, 2), cloud(5, 8, 18, 10),
        drops([12, 18], 20, 22)),
    'weather-showers': svg(cloud(1, 2, 22, 12), drops([6.5, 12.5, 18.5], 17, 22)),
    'weather-snow': svg(cloud(1, 2, 22, 12), dots([[6, 18], [12, 21], [18, 18]], 2)),
    'weather-storm': svg(cloud(1, 1, 22, 11),
        bolt([[13.5, 11.5], [8.5, 18.5], [12, 18.5], [10, 23], [16, 16.5], [12.5, 16.5], [15, 11.5]]),
        drops([6, 20], 15, 18)),
    'weather-windy': svg(`<g id="wind" fill="none" stroke="${TEAL}" stroke-width="2" stroke-linecap="round">` +
        '<path d="M2 8H15a3 3 0 1 0-3-3"/>' +
        '<path d="M2 13H19a3 3 0 1 1-3 3"/>' +
        '<path d="M2 18H11a2 2 0 1 1-2 2"/></g>'),
    'weather-tornado': svg(`<g id="tornado">${[
        [2, 2, 22, 2], [4, 7, 20, 7], [7, 12, 19, 12], [10, 17, 17, 17], [13, 22, 16, 22],
    ].map(p => line(...p, 2, TEAL)).join('')}</g>`),
    'weather-severe-alert': svg(`<path id="sign" d="M12 3 22 21H2Z" fill="${SUN}" stroke="${SUN}" stroke-width="2" stroke-linejoin="round"/>`,
        `<rect x="11" y="8" width="2" height="8" rx="1" fill="${INK}"/><circle cx="12" cy="18.5" r="1.5" fill="${INK}"/>`),
};

if (!sheetOnly) {
    for (const [name, body] of Object.entries(icons))
        GLib.file_set_contents(`${ICONS}/${name}.svg`, body);
    print(`${Object.keys(icons).length} icons → ${ICONS}`);
}

// ---- contact sheet -------------------------------------------------------------
const names = Object.keys(icons);
const cols = 10;
const cell = BIG + 24;
const rows = Math.ceil(names.length / cols);
const W = cols * cell + 24;
const H = 24 + 44 + rows * (cell + 18) + 66;
const surf = new Cairo.ImageSurface(Cairo.Format.ARGB32, W, H);
const cr = new Cairo.Context(surf);
cr.setSourceRGB(0, 0, 0);
cr.paint();

const draw = (name, x, y, s) => {
    const handle = Rsvg.Handle.new_from_file(`${ICONS}/${name}.svg`);
    handle.render_document(cr, new Rsvg.Rectangle({x, y, width: s, height: s}));
};
const label = name => name
    .replace('weather-', '').replace('daypart-', '')
    .replace('showers-scattered', 'showers-sc.').replace('few-clouds-night', 'few-cl-night');

names.forEach((n, i) => draw(n, 12 + i * 34, 14, 24));
cr.selectFontFace('sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
cr.setFontSize(9);
names.forEach((n, i) => {
    const x = 12 + (i % cols) * cell;
    const y = 60 + Math.floor(i / cols) * (cell + 18);
    draw(n, x, y, BIG);
    cr.setSourceRGB(0.6, 0.6, 0.6);
    cr.moveTo(x, y + BIG + 11);
    cr.showText(label(n));
});

const barY = H - 52;
cr.setSourceRGB(0.16, 0.16, 0.17);
cr.rectangle(0, barY, W, 40);
cr.fill();
const pill = (x, icon, text) => {
    // the pill of docs/design: 32 high in a 40 bar, 8 at the sides, the icon fills the 24 cell
    const w = 8 + 24 + 8 + 8 * text.length + 12;
    cr.setSourceRGB(0, 0, 0);
    cr.newSubPath();
    cr.arc(x + 16, barY + 20, 16, Math.PI / 2, 3 * Math.PI / 2);
    cr.arc(x + w - 16, barY + 20, 16, -Math.PI / 2, Math.PI / 2);
    cr.closePath();
    cr.fill();
    draw(icon, x + 8, barY + 8, 24);
    cr.setSourceRGB(1, 1, 1);
    cr.setFontSize(13);
    cr.moveTo(x + 40, barY + 24);
    cr.showText(text);
};
pill(16, 'daypart-afternoon', '14:32');
pill(130, 'weather-few-clouds', '31°');
pill(230, 'weather-showers', '24°');
pill(330, 'daypart-night', '23:05');
pill(450, 'weather-storm', '19°');
surf.writeToPNG(SHEET);
print(`${SHEET} ${W}x${H}`);
