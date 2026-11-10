// The illustration palettes (design/colours, "Minh hoạ"): the daypart and weather icons, Bu's
// body and Bu's lamp per pose, and where they come close to a state colour (ΔE, CIELAB 1976),
// as seen with normal vision and deuteranopia (Machado 2009). Bu and the icons are read from the
// extension itself, so the drawing follows them. gjs -m illustration.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Rsvg from 'gi://Rsvg?version=2.0';
import cairo from 'cairo';
import {SCALE as SC, fit, width1x} from '../../render/lib.js';
import {POSES, PALETTE, frameAt, cells, lampColour} from '../../../../src/buoy@murilegus/lib/kit/mascot.js';
const out = ARGV[0];
const ICONS = `${import.meta.url.replace('file://', '').replace(/docs\/design\/.*/, '')}src/buoy@murilegus/icons`;
// the lights and dots as decided (design/colours); the lamp of `missed` / `ask` follows the lights
const STATE = {missed: '#FF9F0A', waiting: '#FF453A', mic: '#BF5AF2', cam: '#30D158'};
// Bu's lamp, more saturated (design/colours, "Minh hoạ"); `lampColour` is what ships today
const NEW = {idle: '#C8C6BD', done: '#B4E33D', busy: '#3D9BFF', wave: '#FFE14D', think: '#FF7EB6', compact: '#5AD8F5', error: '#8A8880'};
const LAMP = p => ({missed: STATE.missed, ask: STATE.waiting})[p] ?? NEW[p] ?? lampColour(p);
const OLD = p => ({missed: '#EF9F27', ask: '#E24B4A'})[p] ?? lampColour(p);

const W = 780, H = 704;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);
function font(sz, wt) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); const a = new Pango.AttrList(); a.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(a);
}
function text(s, x, y, {sz = 8, wt = 400, a = 0.8, centre = false} = {}) {
    font(sz, wt); L.set_text(s, -1); PangoCairo.update_layout(cr, L);
    const [, e] = L.get_pixel_extents();
    cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(centre ? x - e.width / 2 : x, y); PangoCairo.show_layout(cr, L);
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const panel = (x, y, w, h) => { rr(x + .5, y + .5, w - 1, h - 1, 28); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke(); };
const head = (s, x, y) => text(s, x, y, {sz: 10, wt: 700, a: 1});

// colour maths
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const gam = c => { c = Math.min(1, Math.max(0, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const DEUT = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]];
const deut = rgb => { const l = rgb.map(lin); return DEUT.map(r => gam(r[0] * l[0] + r[1] * l[1] + r[2] * l[2])); };
function lab(rgb) {
    const [r, g, b] = rgb.map(lin);
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b),
        Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

function swatch(x, y, h, label, d = 18) {
    cr.setSourceRGB(...hex(h)); cr.arc(x + d / 2, y + d / 2, d / 2, 0, 2 * Math.PI); cr.fill();
    text(label, x + d / 2, y + d + 4, {sz: 7, a: .75, centre: true});
    text(h, x + d / 2, y + d + 14, {sz: 6.5, a: .45, centre: true});
}
function icon(name, x, y, s) {
    const hd = Rsvg.Handle.new_from_file(`${ICONS}/${name}.svg`);
    const v = new Rsvg.Rectangle(); v.x = x; v.y = y; v.width = s; v.height = s;
    hd.render_document(cr, v);
}
function bu(pose, x, y, cell, alpha = 1, lamp = LAMP) {
    const {frame} = frameAt(pose, 0, {still: true});
    for (const c of cells(frame, lamp(pose))) {
        cr.setSourceRGBA(...hex(c.colour), alpha); cr.rectangle(x + c.x * cell, y + c.y * cell, c.w * cell, cell); cr.fill();
    }
}

// 1. icons
panel(16, 16, 748, 150);
head('Icon buổi và thời tiết (bảng A)', 32, 30);
['daypart-dawn', 'daypart-morning', 'daypart-noon', 'daypart-evening', 'daypart-night', 'weather-few-clouds',
    'weather-overcast', 'weather-showers', 'weather-snow', 'weather-fog', 'weather-storm'].forEach((n, i) => icon(n, 32 + i * 44, 52, 40));
[['mặt trời', '#FFD23F'], ['cam đào', '#FFB889'], ['xanh ngọc', '#5CD6E6'], ['mây', '#CFE6FB'], ['mây sau', '#7FA8D0'],
    ['tuyết', '#BFF2FA'], ['sương', '#9DBBD6'], ['chân trời', '#7A838D']].forEach(([n, h], i) => swatch(36 + i * 62, 108, h, n));

// 2. Bu
panel(16, 182, 748, 278);
head('Bu: thân và đèn theo dáng', 32, 196);
bu('idle', 36, 222, 5);
[['thân', PALETTE.B], ['sọc', PALETTE.S], ['chấm', PALETTE.D], ['"z"', PALETTE.Z], ['nước', PALETTE.W]]
    .forEach(([n, h], i) => swatch(104 + i * 52, 230, h, n));
text('Mờ khi stale:', 380, 224, {sz: 8, a: .7});
[[1, 'thường'], [.4, '40 % (nay)'], [.5, '50 % (mới)']].forEach(([a, n], i) => {
    bu('stale', 384 + i * 80, 240, 4, a); text(n, 404 + i * 80, 284, {sz: 7, a: .6, centre: true});
});
const PS = ['idle', 'done', 'busy', 'wave', 'think', 'compact', 'error', 'sleep', 'missed', 'ask'];
[['nay', OLD, 300], ['mới', LAMP, 388]].forEach(([row, lamp, y]) => {
    text(row, 32, y - 12, {sz: 7.5, wt: 700, a: .7});
    PS.forEach((p, i) => {
        const x = 36 + i * 72;
        bu(p, x + 6, y, 4, 1, lamp);
        text(p, x + 26, y + 44, {sz: 7, wt: p === 'missed' || p === 'ask' ? 700 : 400, a: .8, centre: true});
        text(lamp(p).toUpperCase(), x + 26, y + 54, {sz: 6.5, a: .45, centre: true});
    });
});

// 3. close to a state colour
panel(16, 476, 748, 212);
head('Gần màu trạng thái', 32, 490);
function pill(x, y, iconName, label, left, right) {
    font(11, 600); L.set_text(label, -1); fit(L, cr, width1x(L.get_font_description(), label));
    const tw = Math.round(width1x(L.get_font_description(), label)), th = L.get_pixel_extents()[1].height;
    const pw = 8 + 24 + 8 + tw + 8 + (left ? 20 : 0) + (right ? 20 : 0);
    rr(x + .5, y + .5, pw - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
    const dot = (cx, c) => { cr.setSourceRGB(...hex(c)); cr.arc(cx, y + 16, 4, 0, 2 * Math.PI); cr.fill(); };
    if (left) dot(x + 16, left);
    if (right) dot(x + pw - 16, right);
    const zx = x + 8 + (left ? 20 : 0);
    icon(iconName, zx + 2, y + 6, 20);
    cr.setSourceRGB(1, 1, 1); cr.moveTo(zx + 32, y + Math.round((32 - th) / 2)); PangoCairo.show_layout(cr, L);
}
pill(32, 516, 'daypart-dawn', '5:48 AM', null, STATE.mic);
text('cam đào cạnh chấm mic', 32, 554, {sz: 7.5, a: .6});
pill(32, 584, 'daypart-noon', '12:05 PM', STATE.missed, null);
text('mặt trời cạnh đèn amber', 32, 622, {sz: 7.5, a: .6});
[['cam đào', '#FFB889', 'mic', STATE.mic], ['mặt trời', '#FFD23F', 'amber', STATE.missed],
    ['wave', NEW.wave, 'amber', STATE.missed], ['done', NEW.done, 'cam', STATE.cam]].forEach(([a, ha, b, hb], r) => {
    const y = 514 + r * 38;
    text(`${a} – ${b}`, 260, y + 6, {sz: 8, a: .8});
    [['thường', x => x], ['mù lục', deut]].forEach(([n, f], k) => {
        const x = 380 + k * 190, ca = f(hex(ha)), cb = f(hex(hb));
        cr.setSourceRGB(...ca); cr.arc(x + 10, y + 11, 10, 0, 2 * Math.PI); cr.fill();
        cr.setSourceRGB(...cb); cr.arc(x + 34, y + 11, 10, 0, 2 * Math.PI); cr.fill();
        const d = dE(ca, cb);
        text(`ΔE ${d.toFixed(0)}`, x + 54, y + 4, {sz: 8.5, wt: 700, a: d < 20 ? 1 : .6});
        if (r === 0) text(n, x + 22, 498, {sz: 8, wt: 600, a: .7, centre: true});
    });
});
text('ΔE dưới 20: gần, dễ nhầm ở cỡ nhỏ.', 380, 666, {sz: 7, a: .5});

surf.writeToPNG(out);
