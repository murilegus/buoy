// The buoy light and the privacy dot in three palettes: what we ship, GNOME's palette, more vivid;
// then C with the privacy dots as decided (mic purple, camera a brighter green).
// Each row: two real-size pills (8 px dots, design/pill), then the four state colours as seen with
// normal vision, protanopia and deuteranopia (Machado 2009, severity 1), with the contrast on black.
// gjs -m lights.js out.png   (also prints the contrast table)
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, fit, width1x} from '../../render/lib.js';
const out = ARGV[0];

const OPTIONS = [
    ['A · hiện tại', {missed: '#EF9F27', waiting: '#E24B4A', mic: '#F0997B', cam: '#5DCAA5'}],
    ['B · bảng GNOME', {missed: '#FFA348', waiting: '#ED333B', mic: '#F0997B', cam: '#5DCAA5'}],
    ['C · tươi hơn', {missed: '#FF9F0A', waiting: '#FF453A', mic: '#F0997B', cam: '#5DCAA5'}],
    ['D · C, chấm mới', {missed: '#FF9F0A', waiting: '#FF453A', mic: '#BF5AF2', cam: '#30D158'}, ['mic', 'cam']],
];
const NAMES = {missed: 'missed', waiting: 'waiting', mic: 'mic', cam: 'cam'};
const SIMS = [['thường', null],
    ['mù đỏ', [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]],
    ['mù lục', [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]]];

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const gam = c => { c = Math.min(1, Math.max(0, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const lum = rgb => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const onBlack = rgb => (lum(rgb) + 0.05) / 0.05;
const sim = (rgb, m) => { if (!m) return rgb; const l = rgb.map(lin); return m.map(row => gam(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])); };

const W = 890, ROW = 92, TOP = 26;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, (TOP + ROW * OPTIONS.length) * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);
function font(sz, wt) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); const a = new Pango.AttrList(); a.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(a);
}
function text(s, x, y, sz = 8, wt = 400, a = 0.8) { font(sz, wt); L.set_text(s, -1); cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); }
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const dot = (x, y, d, rgb) => { cr.setSourceRGB(...rgb); cr.arc(x, y, d / 2, 0, 2 * Math.PI); cr.fill(); };

// a pill: lights at the centre of each end circle, each lit end 20 wider (design/pill)
function pill(x, y, label, left, right) {
    font(11, 600); L.set_text(label, -1); fit(L, cr, width1x(L.get_font_description(), label));
    const tw = Math.round(width1x(L.get_font_description(), label)), th = L.get_pixel_extents()[1].height;
    const pw = tw + 16 + (left ? 20 : 0) + (right ? 20 : 0);
    rr(x + .5, y + .5, pw - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
    if (left) dot(x + 16, y + 16, 8, left);
    if (right) dot(x + pw - 16, y + 16, 8, right);
    cr.setSourceRGB(1, 1, 1); cr.moveTo(x + 8 + (left ? 20 : 0), y + Math.round((32 - th) / 2)); PangoCairo.show_layout(cr, L);
    return pw;
}

const SX = 440, SW = 150;
SIMS.forEach(([name], i) => text(name, SX + i * SW, 8, 8, 600, 0.9));
const report = [];
OPTIONS.forEach(([name, c, shown = ['missed', 'waiting']], r) => {
    const y = TOP + r * ROW;
    text(name, 12, y + 4, 9, 600, 1);
    shown.forEach((k, i) => text(`${k} ${c[k]}`, 12, y + 22 + i * 12));
    const rgb = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, hex(v)]));
    const w1 = pill(120, y, '2:41 PM', rgb.missed, null);
    pill(120 + w1 + 12, y, '2:41 PM', rgb.waiting, rgb.mic);
    const w3 = pill(120, y + 44, 'Đang ghi âm', null, rgb.mic);
    pill(120 + w3 + 12, y + 44, 'Đang chia sẻ', null, rgb.cam);
    SIMS.forEach(([, m], i) => {
        const x0 = SX + i * SW;
        rr(x0 - 4, y - 2, SW - 12, ROW - 12, 12); cr.setSourceRGB(0, 0, 0); cr.fill();
        Object.keys(NAMES).forEach((k, j) => {
            const cx = x0 + 16 + j * 34, s = sim(rgb[k], m);
            dot(cx, y + 16, 16, s); dot(cx, y + 40, 8, s);
            text(NAMES[k], cx - 13, y + 52, 6.5, 400, 0.6);
            text(onBlack(s).toFixed(1), cx - 9, y + 62, 7, 600, 0.85);
        });
    });
    report.push(`${name}: ` + Object.entries(rgb).map(([k, v]) => `${k} ${c[k]} ${onBlack(v).toFixed(2)}:1`).join(', '));
});
surf.writeToPNG(out);
print(report.join('\n'));
