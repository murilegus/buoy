// The gaps around the text, 8 (before) / 6 (decided 2026-11-12, Ethan) / 4: leading → text and
// text → trailing; margins 8, the leading filling its 24 box. Left: the sample, content-fit; right:
// a title too long for the 336 cap, ellipsized. Then each left end at 2×. gjs -m gap.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, COVER, SAMPLE} from '../../render/lib.js';
const LONG = 'MƯA TUYỆT VỌNG REMIX - KHẢI ĐĂNG X ĐẠT G';
const W = 1000, H = 300;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function font(sz, wt, maxW = 0) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_width(maxW ? Math.floor(maxW * Pango.SCALE) : -1);
    L.set_ellipsize(maxW ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
}
function rr(x, y, w, h, r) { cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath(); }
function label(t, x, y, a = .8, sz = 8.5, wt = 400) { font(sz, wt); L.set_text(t, -1); cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); }
// one pill: margin 8, leading 24 (the cover, r 6), gap g, text 1em 600, gap g, equaliser 16, margin 8
function pill(x, y, g, text, cap = 0) {
    font(11, 600); L.set_text(text, -1); const tw0 = L.get_pixel_extents()[1].width;
    const eq = 16, fixed = 8 + 24 + g + g + eq + 8;
    const w = cap ? cap : fixed + tw0, tw = w - fixed;
    rr(x + .5, y + .5, w - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke();
    const g2 = new cairo.LinearGradient(x + 8, y + 4, x + 32, y + 28); g2.addColorStopRGB(0, ...COVER[0]); g2.addColorStopRGB(1, ...COVER[1]);
    cr.setSource(g2); rr(x + 8, y + 4, 24, 24, 6); cr.fill();
    font(11, 600, cap ? tw : 0); L.set_text(text, -1); const e = L.get_pixel_extents()[1];
    cr.setSourceRGB(1, 1, 1); cr.moveTo(x + 32 + g, y + Math.round((32 - e.height) / 2)); PangoCairo.show_layout(cr, L);
    const ex = x + w - 8 - eq;
    [8, 12, 6, 10].forEach((hh, i) => { cr.setSourceRGB(1, 1, 1); rr(ex + i * 4.33, y + 16 - hh / 2, 3, hh, 1.5); cr.fill(); });
    return w;
}
label('Khoảng quanh chữ (leading → chữ, chữ → trailing): 8 (trước) · 6 (đã chốt) · 4. Lề 8, leading đầy ô 24', 24, 10, .95, 9, 700);
[[8, 'khoảng 8 (trước)'], [6, 'khoảng 6 (đã chốt)'], [4, 'khoảng 4']].forEach(([g, t], i) => {
    const y = 40 + i * 44;
    label(t, 24, y + 9, .85, 8.5, 700);
    const w = pill(130, y, g, `${SAMPLE.track} · ${SAMPLE.artist}`);
    pill(130 + w + 24, y, g, LONG, 336);
});
// 2× of the left end of each pill, to see the gaps against the round end
label('Phóng 2× đầu trái', 24, 178, .95, 9, 700);
[8, 6, 4].forEach((g, i) => {
    cr.save(); cr.translate(24 + i * 320, 200); cr.rectangle(0, 0, 300, 66); cr.clip(); cr.scale(2, 2);
    pill(0, 0, g, `${SAMPLE.track}`);
    cr.restore();
    label(g === 6 ? '6 (đã chốt)' : `${g}`, 24 + i * 320, 272, .8);
});
surf.writeToPNG(ARGV[0]);
