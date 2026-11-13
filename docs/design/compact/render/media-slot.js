// The media compact's ⏸ slot in its states (design/compact "Nhạc", 2026-11-13, Ethan): the
// equaliser at rest, moving or low; the round button under the pointer (fill-inverse-hover, as
// the old ⏸) or the keyboard's focus (fill-inverse and the focus ring); one fading into the
// other where they stand. The code is kit/ui/present/compact.js restButton. Drawn at 3×.
// gjs -m media-slot.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {icon, C, GREY, drawEq, EQ, SAMPLE, COVER} from '../../render/lib.js';

const SC = 3, R = 28, PAD = 14, CW = 404, H88 = 88, X = 40, GX = 40, TITLE = 30, GAPY = 46;
const W1 = C.WHITE, G = GREY.MUTED, CY = [.4, .85, 1];
// the paused bars, as kit/ui/present/motion.js EQ_PAUSED: a near flat line through the middle
const LOW = [4, 6, 7, 5, 6, 3];
const ITEMS = [
    {title: 'Đang phát, lúc nghỉ: equaliser chạy, nền trong suốt', eq: 'play'},
    {title: 'Rê chuột vào ô: nút ⏸ như các nút chính (dưới con trỏ: fill-inverse-hover)', button: 'pause-fill', fill: [1, 1, 1], pointer: true},
    {title: 'Đang dừng, lúc nghỉ: equaliser thấp', eq: 'low'},
    {title: 'Đang dừng, rê chuột vào ô: nút ▶', button: 'play-fill', fill: [1, 1, 1], pointer: true},
    {title: 'Focus bàn phím: nút như các nút chính (kem, fill-inverse) và vòng focus', button: 'pause-fill', fill: C.CREAM, ring: true},
    {title: 'Đổi qua lại: mờ chéo tại chỗ, 120 ms, không dời', eq: 'play', button: 'pause-fill', fill: C.CREAM, half: true},
];
const COLS = 2, ROWS = Math.ceil(ITEMS.length / COLS);
const W = X + COLS * CW + (COLS - 1) * GX + X;
const H = 24 + ROWS * (TITLE + H88 + GAPY) + 40;

const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);

function text(t, x, y, pt, wt, col, a = 1, measure = false) {
    const d = Pango.FontDescription.from_string('SF Pro Display');
    d.set_size(pt * Pango.SCALE); d.set_weight(wt); L.set_font_description(d);
    const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
    L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    if (!measure) { cr.setSourceRGBA(...col, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); }
    return L.get_pixel_extents()[1];
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
function cover(x, y, s, r) {
    const g = new cairo.LinearGradient(x, y, x + s, y + s);
    g.addColorStopRGB(0, ...COVER[0]); g.addColorStopRGB(1, ...COVER[1]);
    cr.setSource(g); rr(x, y, s, s, r); cr.fill();
}
// the equaliser low: the same six bars at their paused heights
function lowEq(x, cy, a = 1) {
    LOW.forEach((h, i) => {
        const bx = x + i * (EQ.w + EQ.gap), by = cy - h / 2;
        cr.newPath(); cr.arc(bx + 1, by + 1, 1, Math.PI, 2 * Math.PI); cr.arc(bx + 1, by + h - 1, 1, 0, Math.PI); cr.closePath();
        cr.setSourceRGBA(...EQ.rgb, a); cr.fill();
    });
}
function button(cx, cy, glyph, fill, a = 1) {
    cr.newPath(); cr.setSourceRGBA(...fill, a); cr.arc(cx, cy, 16, 0, 2 * Math.PI); cr.fill();
    icon(cr, glyph, cx - 8, cy - 8, 16, C.BLACK, a);
}
// GNOME's focus ring on a button: 2 px inside, the accent at 80 %
function ring(cx, cy) {
    cr.newPath(); cr.setSourceRGBA(...C.ACCENT, .8); cr.setLineWidth(2); cr.arc(cx, cy, 15, 0, 2 * Math.PI); cr.stroke();
}
// the pointer, an arrow 14 tall with its tip at (x, y)
function pointer(x, y) {
    cr.newPath(); cr.moveTo(x, y); cr.lineTo(x, y + 14); cr.lineTo(x + 3.6, y + 10.6); cr.lineTo(x + 6, y + 15.6);
    cr.lineTo(x + 8.2, y + 14.6); cr.lineTo(x + 5.8, y + 9.6); cr.lineTo(x + 10.4, y + 9.6); cr.closePath();
    cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGB(1, 1, 1); cr.setLineWidth(1); cr.stroke();
}

ITEMS.forEach((it, i) => {
    const x = X + (i % COLS) * (CW + GX), y = 24 + Math.floor(i / COLS) * (TITLE + H88 + GAPY) + TITLE;
    text(it.title, x, y - 24, 7, 600, W1, .85);
    rr(x + .5, y + .5, CW - 1, H88 - 1, R - .5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke();
    const ax = x + 8, tx = ax + 72 + 12, xr = x + CW - PAD, cx = xr - 16, cy = y + R;
    cover(ax, y + 8, 72, 20);
    text(SAMPLE.track, tx, y + 10, 11, 600, W1); text(SAMPLE.sub, tx, y + 30, 9.5, 400, G);
    const by = y + 60;
    cr.setSourceRGBA(1, 1, 1, C.FILL3); rr(tx, by, xr - tx, 4, 2); cr.fill();
    cr.setSourceRGB(1, 1, 1); rr(tx, by, (xr - tx) * .38, 4, 2); cr.fill();
    text('1:24', tx, by + 11, 8.5, 400, W1, .5);
    const e = text('-2:11', 0, 0, 8.5, 400, W1, .5, true); text('-2:11', xr - e.width, by + 11, 8.5, 400, W1, .5);
    const a = it.half ? .5 : 1;
    if (it.eq === 'play')
        drawEq(cr, cx - EQ.width / 2, cy, a);
    else if (it.eq === 'low')
        lowEq(cx - EQ.width / 2, cy, a);
    if (it.button)
        button(cx, cy, it.button, it.fill, a);
    if (it.ring)
        ring(cx, cy);
    if (it.pointer)
        pointer(cx + 9, cy + 9);
    // the slot: 32, its centre on the head's middle (y = 28), 14 from the right edge
    if (i === 0) {
        cr.setSourceRGBA(...CY, .6); cr.setLineWidth(.5); cr.arc(cx, cy, 16, 0, 2 * Math.PI); cr.stroke();
        text('ô 32, tâm y = 28, cách mép phải 14', cx - 120, y + H88 + 4, 5.5, 600, CY);
    }
});
text('Bấm: dừng hoặc phát. Tên cho trình đọc màn hình: "Pause" khi đang phát, "Play" khi đang dừng. Equaliser bay vào ô này từ đuôi pill (Chuyển động, "Phần chung").',
    X, H - 30, 6.5, 400, W1, .75);
surf.writeToPNG(ARGV[0]);
