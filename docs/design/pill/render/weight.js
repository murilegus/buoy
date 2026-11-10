// The idle clock pill at weight 400 / 600 / 700 with an 8 px gap after the 24 leading box
// (2026-11-10). gjs -m weight.js out.png
// Left column: drawn at 1 device px a logical px (a scale-1 screen), then enlarged 2× with nearest
// so the real pixels show. Right column: drawn at device scale 2 (HiDPI). Each pill's width comes
// from its own label measured at that scale, as Buoy will measure it at run time. Beside each pill
// the bar's own text at 700, as GNOME's #panel draws it (_panel.scss: font-weight: bold).
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';

const OUT = 2, LABEL = 120, STRIP = 250, COLGAP = 24, HEAD = 44, ROW = 70, FOOT = 64;
const W = LABEL + 2 * STRIP + COLGAP + 16, H = HEAD + 3 * ROW + FOOT;
const PAD = 8, BOX = 24, GAP = 8, CLOCK = '10∶45∶30 AM', WIDEST = '88∶88∶88 AM';
const SUN = ['....Y.....', '.Y..Y..Y..', '..Y...Y...', '....YY....', 'YY.YYYY.YY', '...YYYY...', '....YY....', '..Y...Y...', '.Y..Y..Y..', '....Y.....'];
const WALL = [0.20, 0.17, 0.35], WHITE = [1, 1, 1];
const ROWS = [[400, '400 · regular'], [600, '600 · đang chốt'], [700, '700 · như thanh']];

function layout(cr, t, pt, wt, tnum = true) {
    const L = PangoCairo.create_layout(cr);
    PangoCairo.context_set_resolution(L.get_context(), 96);
    const d = Pango.FontDescription.from_string('SF Pro Display');
    d.set_size(pt * Pango.SCALE); d.set_weight(wt); L.set_font_description(d);
    if (tnum) { const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at); }
    L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    return L;
}
function width(cr, t, wt) { const [, log] = layout(cr, t, 11, wt).get_extents(); return Math.ceil(log.width / Pango.SCALE); }
function show(cr, t, x, midY, pt, wt, col, a = 1, tnum = true) {
    const L = layout(cr, t, pt, wt, tnum), [, log] = L.get_extents();
    cr.setSourceRGBA(...col, a); cr.moveTo(x, Math.round(midY - log.height / Pango.SCALE / 2)); PangoCairo.show_layout(cr, L);
    return log.width / Pango.SCALE;
}
function rr(cr, x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
// one strip of the bar (logical coordinates, origin at its top-left): the bar's text at 700, the pill
function strip(cr, wt) {
    cr.setSourceRGB(...WALL); cr.rectangle(0, 0, STRIP, 40); cr.fill();
    show(cr, 'vi', 10, 20, 11, 700, WHITE, 1, false);
    const r = 87, rw = width(cr, `${r} %`, 700);
    show(cr, `${r} %`, STRIP - 10 - rw, 20, 11, 700, WHITE);
    const tw = width(cr, WIDEST, wt), pw = PAD + BOX + GAP + tw + PAD, px = Math.round((STRIP - pw) / 2);
    rr(cr, px + .5, 4.5, pw - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
    const x0 = px + PAD;
    SUN.forEach((row, yy) => [...row].forEach((c, xx) => {
        if (c === 'Y') { cr.setSourceRGB(1, .82, .4); cr.rectangle(x0 + 2 + xx * 2, 8 + 2 + yy * 2, 2, 2); cr.fill(); }
    }));
    show(cr, CLOCK, x0 + BOX + GAP, 20, 11, wt, WHITE);
    return {pw, px, tw};
}

const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * OUT, H * OUT);
const cr = new cairo.Context(surf);
cr.setSourceRGB(0.11, 0.11, 0.12); cr.paint();
cr.scale(OUT, OUT);
const colX = [LABEL, LABEL + STRIP + COLGAP];
show(cr, 'Tỷ lệ 1× (màn thường; phóng 2 lần, giữ nguyên điểm ảnh)', colX[0], 22, 8, 600, WHITE, .85, false);
show(cr, 'Tỷ lệ 2× (HiDPI)', colX[1], 22, 8, 600, WHITE, .85, false);

ROWS.forEach(([wt, name], i) => {
    const y = HEAD + i * ROW;
    show(cr, name, 12, y + 20, 8.5, 600, WHITE, .9, false);
    // 1×: its own surface at 1 device px, pasted enlarged with nearest
    const one = new cairo.ImageSurface(cairo.Format.ARGB32, STRIP, 40), c1 = new cairo.Context(one);
    const m1 = strip(c1, wt);
    cr.save(); cr.translate(colX[0], y); cr.setSourceSurface(one, 0, 0);
    cr.getSource().setFilter(cairo.Filter.NEAREST); cr.rectangle(0, 0, STRIP, 40); cr.fill(); cr.restore();
    // 2×: straight onto the 2× canvas
    cr.save(); cr.translate(colX[1], y); const m2 = strip(cr, wt); cr.restore();
    [[0, m1], [1, m2]].forEach(([c, m]) => {
        show(cr, `pill ${m.pw} = 8 + 24 + 8 + chữ ${m.tw} + 8`, colX[c] + m.px, y + 50, 6.5, 400, WHITE, .7, false);
    });
});
const fy = HEAD + 3 * ROW + 8;
show(cr, 'SF Pro Display 11pt, số đều. Ô leading 24 → chữ: 8. Độ rộng pill đo theo nhãn rộng nhất "88∶88∶88 AM" ở từng tỷ lệ.', 12, fy + 6, 7, 400, WHITE, .75, false);
show(cr, 'Chữ hai bên pill ("vi", "87 %") là chữ của thanh GNOME, đậm 700 (#panel, _panel.scss).', 12, fy + 22, 7, 400, WHITE, .75, false);
surf.writeToPNG(ARGV[0]);
