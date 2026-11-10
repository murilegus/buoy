// The palette by role (design/colours): text levels, the fill steps and how a control climbs them
// (rest → hover → pressed), borders, the inverse button, the menu and a state tint. All on the
// island's black. gjs -m roles.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C} from '../../render/lib.js';
const out = ARGV[0];

const W = 760, H = 560;
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
function text(s, x, y, {sz = 8, wt = 400, rgb = [1, 1, 1], a = 0.8, centre = false} = {}) {
    font(sz, wt); L.set_text(s, -1); PangoCairo.update_layout(cr, L);
    const [, e] = L.get_pixel_extents();
    cr.setSourceRGBA(...rgb, a); cr.moveTo(centre ? x - e.width / 2 : x, y); PangoCairo.show_layout(cr, L);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const white = a => [1, 1, 1, a];
const fill = (rgba, x, y, w, h, r) => { rr(x, y, w, h, r); cr.setSourceRGBA(...rgba); cr.fill(); };
const lum = v => { const c = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return c; };
const ratio = (fg, bg) => { const l1 = lum(fg), l2 = lum(bg); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const head = (s, x, y) => text(s, x, y, {sz: 10, wt: 700, a: 1});

// the island
const panel = (x, y, w, h) => { rr(x + .5, y + .5, w - 1, h - 1, 28); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke(); };

// 1. text
panel(16, 16, 352, 196);
head('Chữ và icon', 32, 30);
[['fg', 1, 'Tiêu đề, giá trị, giờ'], ['fg-muted', .70, 'Phụ đề, nghệ sĩ, thân card'],
    ['fg-subtle', .50, 'Thời gian, chi tiết, stale'], ['fg-disabled', .28, 'Ngày tháng khác, tắt']].forEach(([n, a, ex], i) => {
    const y = 58 + i * 36;
    text(ex, 32, y, {sz: 11, wt: 600, a});
    text(`${n} · trắng ${Math.round(a * 100)} %`, 32, y + 17, {sz: 7, a: .5});
    text(`${ratio(a, 0).toFixed(1)}:1`, 340, y + 2, {sz: 8, wt: 600, a: .8, centre: true});
});
text('trên đen', 340, 46, {sz: 6.5, a: .5, centre: true});

// 2. fill steps
panel(384, 16, 360, 196);
head('Nền theo bậc', 400, 30);
[['fill-0', .04], ['fill-1', .08], ['fill-2', .12], ['fill-3', .20], ['fill-4', .28]].forEach(([n, a], i) => {
    const x = 400 + i * 66;
    fill(white(a), x, 54, 56, 40, 12);
    text(n, x + 28, 100, {sz: 8, wt: 600, a: .9, centre: true});
    text(`trắng ${Math.round(a * 100)} %`, x + 28, 112, {sz: 7, a: .5, centre: true});
});
text('Một bậc: 0 · 8 · 12 · 20 · 28 (chữ dùng tiếp 50 · 70 · 100).', 400, 138, {sz: 8, a: .7});
text('Hover lên một bậc, nhấn / đang chọn lên hai bậc.', 400, 152, {sz: 8, a: .7});
text('fill-0 chỉ cho mép card xếp chồng (thông báo).', 400, 166, {sz: 8, a: .7});

// 3. how a control climbs the steps
panel(16, 228, 728, 160);
head('Trạng thái: nghỉ → hover → nhấn', 32, 242);
const COLS = ['nghỉ', 'hover', 'nhấn / chọn'];
COLS.forEach((c, i) => text(c, 236 + i * 170, 262, {sz: 8, wt: 600, a: .7, centre: true}));
[['Hàng (Home, tải về, agent)', [0, .08, .12], 'pill', 'Bản nháp.pdf'],
    ['Card, chip, hàng lịch', [.08, .12, .20], 'pill', 'Họp nhóm · 3:00'],
    ['Nút, thanh tab, ô ảnh', [.12, .20, .28], 'round', '']].forEach(([n, steps, kind, label], r) => {
    const y = 278 + r * 34;
    text(n, 32, y + 6, {sz: 8, a: .8});
    steps.forEach((a, i) => {
        const cx = 236 + i * 170;
        if (kind === 'round') {
            if (a) fill(white(a), cx - 14, y, 28, 28, 14);
            cr.setSourceRGB(1, 1, 1); cr.moveTo(cx - 4, y + 8); cr.lineTo(cx + 6, y + 14); cr.lineTo(cx - 4, y + 20); cr.closePath(); cr.fill();
            text(`fill-${[0, .08, .12, .20, .28].indexOf(a)}`, cx + 62, y + 8, {sz: 7, a: .5});
        } else {
            if (a) fill(white(a), cx - 58, y, 116, 28, 14);
            text(label, cx - 46, y + 6, {sz: 9, wt: 600, a: 1});
            text(a ? `fill-${[0, .08, .12, .20, .28].indexOf(a)}` : 'trong suốt', cx + 62, y + 8, {sz: 7, a: .5});
        }
    });
});

// 4. the rest: border, inverse, menu, a state tint
panel(16, 404, 728, 140);
head('Viền, nút đảo, menu, sắc trạng thái', 32, 418);
// border
rr(32.5, 446.5, 120, 32, 16); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(...white(.12)); cr.setLineWidth(1); cr.stroke();
text('border · trắng 12 %', 32, 486, {sz: 7, a: .6});
rr(176.5, 446.5, 40, 32, 8); cr.setSourceRGBA(...white(.28)); cr.stroke();
text('⌘B', 196, 454, {sz: 9, wt: 600, a: .5, centre: true});
text('border-strong · 28 %', 168, 486, {sz: 7, a: .6});
text('(phím tắt)', 168, 497, {sz: 7, a: .4});
// inverse
const CREAM = C.CREAM;
[[CREAM, 'fill-inverse · #F1EFE8'], [[1, 1, 1], 'hover · trắng']].forEach(([c, n], i) => {
    const cx = 330 + i * 80;
    cr.setSourceRGB(...c); cr.arc(cx, 462, 16, 0, 2 * Math.PI); cr.fill();
    cr.setSourceRGB(0, 0, 0); cr.moveTo(cx - 4, 455); cr.lineTo(cx + 7, 462); cr.lineTo(cx - 4, 469); cr.closePath(); cr.fill();
    text(n, cx, 486, {sz: 7, a: .6, centre: true});
});
text('fg-on-inverse · đen', 370, 497, {sz: 7, a: .4, centre: true});
// menu
fill([0x1f / 255, 0x1f / 255, 0x1f / 255, 1], 470, 438, 120, 72, 14);
rr(470.5, 438.5, 119, 71, 14); cr.setSourceRGBA(...white(.12)); cr.stroke();
fill(white(.08), 476, 446, 108, 26, 9);
text('Cài đặt', 486, 452, {sz: 9, wt: 500, a: 1});
text('Ẩn app này', 486, 482, {sz: 9, wt: 500, a: 1});
text('surface-menu · #1F1F1F', 530, 516, {sz: 7, a: .6, centre: true});
text('(trắng 12 % đã trộn sẵn trên đen)', 530, 527, {sz: 7, a: .4, centre: true});
// tint
const AMBER = C.AMBER;
fill([...AMBER, .16], 606, 446, 120, 30, 15);
cr.setSourceRGB(...AMBER); cr.arc(622, 461, 3.5, 0, 2 * Math.PI); cr.fill();
text('2 bị lỡ', 632, 453, {sz: 9, wt: 600, rgb: AMBER, a: 1});
text('missed-tint · amber 16 %', 666, 486, {sz: 7, a: .6, centre: true});
text('chữ: light-missed', 666, 497, {sz: 7, a: .4, centre: true});

surf.writeToPNG(out);
