// gjs -m scripts/icons.js [--sheet-only] [sheet.png] [bigpx]
//
// The daypart and weather icons: 19 colour SVGs on a 16 px grid, always on black, shown
// at 20 px in the idle pill and 40 px in the hover card. Design source, not a build step:
// it rewrites src/buoy@murilegus/icons/{daypart,weather}-*.svg, then renders docs/icons.png
// (a 20 px row, a grid at 40 px with names, five mock idle pills). Chosen 2026-11-06
// (Ethan: palette A, soft blue cloud). Every part carries an id (sun, moon, cloud, rain,
// snow, bolt, wind, horizon, arc) so a tab can split an icon into layers and animate them.
import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Rsvg from 'gi://Rsvg';

const here = GLib.path_get_dirname(import.meta.url.replace('file://', ''));
const ICONS = `${here}/../src/buoy@murilegus/icons`;
const sheetOnly = ARGV[0] === '--sheet-only';
const args = sheetOnly ? ARGV.slice(1) : ARGV;
const SHEET = args[0] ?? `${here}/../docs/icons.png`;
const BIG = Number(args[1] ?? 40);

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

// The upper half of a disc on the horizon, with three rays.
function halfSun(cx, cy, r, ri, ro, sw, color = PEACH) {
    const disc = `<path d="M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(cy)}Z" fill="${color}"/>`;
    const rays = [225, 270, 315].map(deg => ray(cx, cy, ri, ro, deg, sw, color));
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

// The one cloud: two bumps on a rounded base, in the box x, y, w, h.
function cloud(x, y, w, h, color = CLOUD, id = 'cloud') {
    const rr = 0.275 * h;
    const big = [x + 0.60 * w, y + 0.42 * h, 0.42 * h];
    const sm = [x + 0.27 * w, y + 0.50 * h, 0.34 * h];
    return `<g id="${id}" fill="${color}"><circle cx="${f(big[0])}" cy="${f(big[1])}" r="${f(big[2])}"/>` +
        `<circle cx="${f(sm[0])}" cy="${f(sm[1])}" r="${f(sm[2])}"/>` +
        `<rect x="${f(x)}" y="${f(y + h - 2 * rr)}" width="${f(w)}" height="${f(2 * rr)}" rx="${f(rr)}"/></g>`;
}

const drops = (xs, y0, y1, sw = 1.4, dx = -0.8, color = TEAL) =>
    `<g id="rain">${xs.map(x => line(x, y0, x + dx, y1, sw, color)).join('')}</g>`;

const dots = (pts, r, color = SNOW) =>
    `<g id="snow">${pts.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}"/>`).join('')}</g>`;

const bolt = (pts, color = SUN) =>
    `<path id="bolt" d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' ')}Z" fill="${color}" stroke="${color}" stroke-width="0.5" stroke-linejoin="round"/>`;

const svg = (...parts) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${parts.join('')}</svg>\n`;

// ---- dayparts: one horizon and one faint dotted arc, shared ------------------------
const HY = 14.2;
const AR = 5.6;
const horizon = () =>
    `<path id="arc" d="M${f(8 - AR)} ${f(HY)}A${f(AR)} ${f(AR)} 0 0 1 ${f(8 + AR)} ${f(HY)}" fill="none" ` +
    `stroke="${HORIZON}" stroke-width="1" stroke-dasharray="0.01 1.5" stroke-linecap="round" opacity="0.6"/>${
        line(1, HY, 15, HY, 1.2, HORIZON).replace('<line', '<line id="horizon"')}`;
const onArc = deg => [8 + AR * Math.cos(rad(deg)), HY - AR * Math.sin(rad(deg))];
const [mx, my] = onArc(124);
const [ax, ay] = onArc(56);
const arcSun = (x, y) => sun(x, y, 2.1, 2.8, 3.6, 1.1, {off: 22.5});

const icons = {
    'daypart-dawn': svg(horizon(), halfSun(3.8, HY, 3.2, 3.9, 5.4, 1.2)),
    'daypart-morning': svg(horizon(), arcSun(mx, my)),
    'daypart-noon': svg(horizon(), arcSun(8, HY - AR)),
    'daypart-afternoon': svg(horizon(), arcSun(ax, ay)),
    'daypart-evening': svg(horizon(), halfSun(12.2, HY, 3.2, 3.9, 5.4, 1.2)),
    'daypart-night': svg(horizon(), moon(7.4, 8.4, 3.6), star(12.4, 4.4, 1.2), star(11.8, 9.4, 0.75)),

    // ---- weather: GWeather's conditions; sun or moon behind the cloud, upper left ----
    'weather-clear': svg(sun(8, 8, 3.7, 5.0, 6.9, 1.5)),
    'weather-clear-night': svg(moon(7.2, 8.6, 5.2), star(12.8, 3.6, 1.5), star(13.8, 8.2, 0.8)),
    'weather-few-clouds': svg(sun(5.2, 5.4, 2.9, 3.7, 4.7, 1.2), cloud(3.0, 6.6, 12.5, 7.6)),
    'weather-few-clouds-night': svg(moon(5.4, 5.2, 3.6), cloud(3.0, 6.6, 12.5, 7.6)),
    'weather-overcast': svg(cloud(3.5, 1.5, 12, 7, CLOUD_DARK, 'cloud-back'), cloud(0.5, 6.0, 13, 8)),
    'weather-fog': svg(cloud(0.5, 1.2, 15, 8.2),
        `<g id="fog">${line(2.2, 11.6, 11.0, 11.6, 1.4, FOG)}${line(5.0, 14.3, 13.8, 14.3, 1.4, FOG)}</g>`),
    'weather-showers-scattered': svg(sun(4.8, 4.6, 2.5, 3.2, 4.1, 1.1), cloud(3.0, 5.6, 12.5, 6.8),
        drops([7.4, 11.4], 13.2, 15.0)),
    'weather-showers': svg(cloud(0.5, 1.0, 15, 8), drops([4.6, 8.4, 12.2], 10.6, 14.6, 1.5, -1.0)),
    'weather-snow': svg(cloud(0.5, 1.0, 15, 8), dots([[4.2, 11.6], [8, 13.9], [11.8, 11.6]], 1.2)),
    'weather-storm': svg(cloud(0.5, 0.8, 15, 7.6),
        bolt([[8.9, 8.0], [5.6, 12.4], [8.0, 12.4], [6.8, 15.3], [10.6, 10.9], [8.4, 10.9], [9.9, 8.0]]),
        drops([3.6, 13.2], 9.8, 12.4, 1.4, -0.7)),
    'weather-windy': svg(`<g id="wind" fill="none" stroke="${TEAL}" stroke-width="1.5" stroke-linecap="round">` +
        '<path d="M1 5.4H10.2a1.9 1.9 0 1 0-1.9-1.9"/>' +
        '<path d="M1 9H13.2a2 2 0 1 1-2 2"/>' +
        '<path d="M1 12.6H7.6a1.5 1.5 0 1 1-1.5 1.5"/></g>'),
    'weather-tornado': svg(`<g id="tornado">${[
        [1.2, 2.6, 14.8, 2.6], [2.8, 5.6, 13.6, 5.6], [4.8, 8.6, 12.6, 8.6], [6.6, 11.6, 11.2, 11.6], [8.6, 14.5, 10.4, 14.5],
    ].map(p => line(...p, 1.6, TEAL)).join('')}</g>`),
    'weather-severe-alert': svg(`<path id="sign" d="M8 1.6 15 14H1Z" fill="${SUN}" stroke="${SUN}" stroke-width="1.6" stroke-linejoin="round"/>`,
        `<rect x="7.2" y="5.4" width="1.6" height="5.1" rx="0.8" fill="${INK}"/><circle cx="8" cy="12.3" r="0.95" fill="${INK}"/>`),
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
const H = 24 + 44 + rows * (cell + 18) + 70;
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

names.forEach((n, i) => draw(n, 12 + i * 30, 14, 20));
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

const barY = H - 56;
cr.setSourceRGB(0.16, 0.16, 0.17);
cr.rectangle(0, barY, W, 44);
cr.fill();
const pill = (x, icon, text) => {
    const w = 20 + 10 + 8 * text.length + 16;
    cr.setSourceRGB(0, 0, 0);
    cr.newSubPath();
    cr.arc(x + 15, barY + 22, 15, Math.PI / 2, 3 * Math.PI / 2);
    cr.arc(x + w - 15, barY + 22, 15, -Math.PI / 2, Math.PI / 2);
    cr.closePath();
    cr.fill();
    draw(icon, x + 10, barY + 12, 20);
    cr.setSourceRGB(1, 1, 1);
    cr.setFontSize(13);
    cr.moveTo(x + 36, barY + 27);
    cr.showText(text);
};
pill(16, 'daypart-afternoon', '14:32');
pill(130, 'weather-few-clouds', '31°');
pill(230, 'weather-showers', '24°');
pill(330, 'daypart-night', '23:05');
pill(450, 'weather-storm', '19°');
surf.writeToPNG(SHEET);
print(`${SHEET} ${W}x${H}`);
