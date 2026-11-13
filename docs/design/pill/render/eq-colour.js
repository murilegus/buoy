// The equaliser in its cover's main colour (design/pill "Equaliser", 2026-11-13, Ethan): today's
// four white bars of 3 × 12 against six of 2 × 12 and the decided six of 2 × 14, on easy and hard
// covers. The colour is the code's own (kit/model/cover.js), read from each drawn cover as the
// media source reads a real one. gjs -m eq-colour.js out.png
import Cairo from 'cairo';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';

import {SAMPLE, mainColour, lifted, onBlack} from '../../../../src/buoy@murilegus/lib/kit/model/cover.js';

const here = GLib.dir_make_tmp('buoy-eq-XXXXXX');
const Z = 3;
const contrast = onBlack;
const hex = rgb => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function colourOf(path) {
    const px = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, SAMPLE, SAMPLE, false);
    const raw = mainColour({
        bytes: px.read_pixel_bytes().toArray(), channels: px.get_n_channels(), rowstride: px.get_rowstride(),
        width: px.get_width(), height: px.get_height(),
    });
    return {raw, final: raw ? lifted(raw) : [255, 255, 255]};
}

// ---- the covers ------------------------------------------------------------------
function cover(name, paint) {
    const s = new Cairo.ImageSurface(Cairo.Format.RGB24, 216, 216);
    const c = new Cairo.Context(s);
    paint(c);
    c.$dispose();
    s.writeToPNG(`${here}/cover-${name}.png`);
}
const rgb = (c, h) => c.setSourceRGB(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255));
cover('pink', c => {
    rgb(c, '#0E1210'); c.paint();
    rgb(c, '#C2185B'); c.arc(100, 96, 84, 0, 2 * Math.PI); c.fill();
    rgb(c, '#E0457B'); c.arc(78, 74, 34, 0, 2 * Math.PI); c.fill();
});
cover('sample', c => {
    const g = new Cairo.LinearGradient(0, 0, 216, 216);
    g.addColorStopRGB(0, 1, 0.54, 0.24);
    g.addColorStopRGB(1, 0.48, 0.25, 0.89);
    c.setSource(g);
    c.paint();
});
cover('dark', c => {
    rgb(c, '#0B0F1A'); c.paint();
    rgb(c, '#16284A'); c.arc(150, 70, 60, 0, 2 * Math.PI); c.fill();
    rgb(c, '#1F3F7A'); c.arc(150, 70, 24, 0, 2 * Math.PI); c.fill();
});
cover('red', c => {
    rgb(c, '#C4141C'); c.paint();
    rgb(c, '#F2F2F2'); c.rectangle(30, 150, 156, 18); c.fill();
});
cover('amber', c => {
    rgb(c, '#F5A300'); c.paint();
    rgb(c, '#1A1A1A'); c.arc(108, 108, 50, 0, 2 * Math.PI); c.fill();
});
cover('mono', c => {
    const g = new Cairo.LinearGradient(0, 0, 0, 216);
    g.addColorStopRGB(0, 0.85, 0.85, 0.85);
    g.addColorStopRGB(1, 0.1, 0.1, 0.1);
    c.setSource(g);
    c.paint();
});

const ROWS = [
    {cover: 'pink', label: 'Bìa hồng trên nền tối'},
    {cover: 'sample', label: 'Bìa mẫu cam → tím'},
    {cover: 'dark', label: 'Bìa tối'},
    {cover: 'red', label: 'Bìa đỏ'},
    {cover: 'amber', label: 'Bìa hổ phách'},
    {cover: 'mono', label: 'Bìa đen trắng'},
];
const EQ4 = {w: 3, gap: 2, max: 12, h: [0.5, 0.85, 0.65, 0.4]};
const EQ6 = {w: 2, gap: 2, max: 12, h: [0.45, 0.8, 1, 0.6, 0.85, 0.4]};
const EQ6_14 = {...EQ6, max: 14};
const eqWidth = e => e.h.length * e.w + (e.h.length - 1) * e.gap;

// ---- the sheet -------------------------------------------------------------------
const PILL_W = 190, COL = 214, LEFT = 150, TOP = 46, ROW = 46;
const W = LEFT + 3 * COL + 150, H = TOP + (ROWS.length + 1) * ROW + 122;
const surf = new Cairo.ImageSurface(Cairo.Format.ARGB32, W * Z, H * Z);
const cr = new Cairo.Context(surf);
cr.scale(Z, Z);
rgb(cr, '#332B59');
cr.paint();

const text = (s, x, y, {size = 11, bold = false, color = [1, 1, 1, 0.75]} = {}) => {
    cr.selectFontFace('SF Pro Display', Cairo.FontSlant.NORMAL, bold ? Cairo.FontWeight.BOLD : Cairo.FontWeight.NORMAL);
    cr.setFontSize(size);
    cr.setSourceRGBA(...color);
    cr.moveTo(x, y);
    cr.showText(s);
};
const round = (x, y, w, h, r) => {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
};
function eq(x, cy, e, color, k = 1) {
    cr.setSourceRGB(...color.map(v => v / 255));
    e.h.forEach((s, i) => {
        const h = Math.max(e.max * s, e.w) * k;
        round(x + i * (e.w + e.gap) * k, cy - h / 2, e.w * k, h, e.w * k / 2);
        cr.fill();
    });
}
function pill(x, y, name, e, color) {
    cr.setSourceRGB(0, 0, 0);
    round(x, y, PILL_W, 32, 16);
    cr.fill();
    cr.setSourceRGBA(1, 1, 1, 0.12);
    cr.setLineWidth(1);
    round(x + 0.5, y + 0.5, PILL_W - 1, 31, 15.5);
    cr.stroke();
    cr.save();
    round(x + 8, y + 4, 24, 24, 6);
    cr.clip();
    const img = Cairo.ImageSurface.createFromPNG(`${here}/cover-${name}.png`);
    cr.translate(x + 8, y + 4);
    cr.scale(24 / 216, 24 / 216);
    cr.setSourceSurface(img, 0, 0);
    cr.paint();
    cr.restore();
    text('Sóng Ngoài Khơi', x + 38, y + 21, {size: 14.67, bold: true, color: [1, 1, 1, 1]});
    eq(x + PILL_W - 8 - eqWidth(e), y + 16, e, color);
}

text('Hiện tại: 4 thanh 3 px, trắng', LEFT, 28, {bold: true});
text('6 thanh 2 × 12, màu bìa', LEFT + COL, 28, {bold: true});
text('6 thanh 2 × 14, màu bìa', LEFT + 2 * COL, 28, {bold: true});
text('màu lấy được → màu dùng', LEFT + 3 * COL, 28, {bold: true});
ROWS.forEach((r, j) => {
    const y = TOP + j * ROW;
    const c = colourOf(`${here}/cover-${r.cover}.png`);
    text(r.label, 16, y + 20);
    pill(LEFT, y, r.cover, EQ4, [255, 255, 255]);
    pill(LEFT + COL, y, r.cover, EQ6, c.final);
    pill(LEFT + 2 * COL, y, r.cover, EQ6_14, c.final);
    const sx = LEFT + 3 * COL;
    if (c.raw) {
        cr.setSourceRGB(...c.raw.map(v => v / 255));
        round(sx, y + 8, 16, 16, 4);
        cr.fill();
    }
    cr.setSourceRGB(...c.final.map(v => v / 255));
    round(sx + 22, y + 8, 16, 16, 4);
    cr.fill();
    text(c.raw ? `${hex(c.raw)} → ${hex(c.final)}` : 'không có màu → trắng', sx + 44, y + 15, {size: 9});
    text(`${contrast(c.final).toFixed(1)} : 1 trên đen`, sx + 44, y + 27, {size: 9, color: [1, 1, 1, 0.5]});
});

// the two equalisers enlarged, in the first cover's colour
const zy = TOP + ROWS.length * ROW + 30;
const first = colourOf(`${here}/cover-${ROWS[0].cover}.png`).final;
text('Phóng 6 lần:', 16, zy + 46);
eq(LEFT, zy + 42, EQ4, [255, 255, 255], 6);
text('4 × 3 × 12, rộng 18 (hiện tại)', LEFT, zy + 100, {size: 10});
eq(LEFT + COL, zy + 42, EQ6, first, 6);
text('6 × 2 × 12, rộng 22', LEFT + COL, zy + 100, {size: 10});
eq(LEFT + 2 * COL, zy + 42, EQ6_14, first, 6);
text('6 × 2 × 14, rộng 22', LEFT + 2 * COL, zy + 100, {size: 10});

surf.writeToPNG(ARGV[0]);
for (const r of [...ROWS.map(x => x.cover), 'red'])
    GLib.unlink(`${here}/cover-${r}.png`);
GLib.rmdir(here);
