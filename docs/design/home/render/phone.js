// Phone tile in Home (decided 2026-11-17, Ethan): the phone through GSConnect as a glance after the
// battery — narrow and wide, and what a click shows (in place of the card and the row).
// gjs -m phone.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out] = ARGV;
const W1 = C.WHITE, SUB = 9.35, BIG = 16.5, TILE_H = 100;
const W = 1060, H = 560;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, right = false, max = 0, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
    L.set_width(max > 0 ? max * Pango.SCALE : -1); L.set_ellipsize(max > 0 ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    const e = L.get_pixel_extents()[1];
    L.set_width(-1);
    if (measure)
        return e;
    cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(right ? x - e.width : x, y); PangoCairo.show_layout(cr, L);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (a, x, y, w, h, r, rgb = [1, 1, 1]) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgb, a); cr.fill(); };
const icon = (n, x, y, s = 16, a = 1) => gicon(cr, n, x, y, s, W1, a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});

// a tile (design/home "Kích thước"): leading 16 at 14, value 1.5em 600, caption 0.85em fg-muted; the
// top right corner (fg-subtle) as the battery tile's mode; from 200 a detail column
function tile(x, y, w, {ic, val, cap, corner = null, det = []}) {
    fill(C.FILL1, x, y, w, TILE_H, 16);
    icon(ic, x + 14, y + 14, 16);
    if (corner)
        icon(corner, x + w - 12 - 16, y + 14, 16, C.FG_SUBTLE);
    text(val, x + 12, y + 40, {sz: BIG, wt: 600});
    text(cap, x + 12, y + 68, {sz: SUB, a: C.FG_MUTED, max: (w >= 200 ? w / 2 : w - 24)});
    if (w >= 200)
        det.forEach((d, i) => d && text(d, x + w - 14, y + 44 + i * 18, {sz: SUB, a: C.FG_SUBTLE, right: true}));
}

text('Ô điện thoại: hẹp 128 và rộng', 16, 12, {sz: 12, wt: 600});
const T = [
    {ic: 'smartphone', val: '77%', cap: 'Redmi Note 14', corner: 'battery-charging', det: ['đầy sau 40 phút', 'đang sạc']},
    {ic: 'smartphone', val: '54%', cap: 'Redmi Note 14', det: ['còn 9 giờ', '']},
    {ic: 'smartphone', val: '15%', cap: 'Redmi Note 14', corner: 'battery-low', det: ['còn 1 giờ 10 phút', 'pin yếu']},
];
T.forEach((t, i) => tile(16 + i * 136, 40, 128, t));
T.slice(0, 2).forEach((t, i) => tile(16 + 3 * 136 + 8 + i * 228, 40, 220, t));
note('số lớn là pin điện thoại (GSConnect, đúng số); dưới là tên máy; góc trên phải: đang sạc hay pin yếu (fg-subtle), không thì trống', 16, 40 + TILE_H + 8);
note('ô rộng (từ 200): thời gian đầy / còn lại (GSConnect ước tính), và đang sạc / pin yếu', 16, 40 + TILE_H + 22);

// Home at 1920 with it, after the battery
text('Home ở 1920: sau ô pin', 16, 196, {sz: 12, wt: 600});
const HX = 16, HY = 220, HW = 560, HH = 280;
cr.newPath(); rr(HX, HY, HW, HH, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
fill(C.FILL1, HX + 12, HY + 12, 268, 32, 16);
fill(C.FILL3, HX + 14, HY + 14, 76, 28, 14); icon('house', HX + 24, HY + 20, 16); text('Home', HX + 46, HY + 19, {sz: SUB, wt: 600});
['music-note', 'bell', 'calendar', 'display'].forEach((n, i) => icon(n, HX + 104 + i * 36, HY + 20, 16, C.FG_MUTED));
fill(C.FILL1, HX + HW - 44, HY + 12, 32, 32, 16); icon('gear', HX + HW - 36, HY + 20, 16, C.FG_MUTED);
fill(C.FILL1, HX + 12, HY + 56, HW - 24, 104, 16);
text('Chào buổi chiều, Ethan', HX + 28, HY + 92, {sz: 13, wt: 600});
text('Thứ Ba, 17 tháng 11', HX + 28, HY + 116, {sz: SUB, a: C.FG_MUTED});
const tw = (HW - 24 - 3 * 8) / 4;
[
    {ic: 'cloud', val: '24°', cap: 'Nhiều mây'},
    {ic: 'calendar', val: '15:00', cap: 'Họp nhóm'},
    {ic: 'battery', val: '76%', cap: 'Pin', corner: 'scales-balanced'},
    T[0],
].forEach((t, i) => tile(HX + 12 + i * (tw + 8), HY + 168, tw, t));
note('thứ tự nhìn nhanh: thời tiết, sắp tới, pin, điện thoại, hẹn giờ (design/home); chỉ khi điện thoại', HX, HY + HH + 8);
note('đang nối qua GSConnect; hết chỗ thì bỏ như mọi ô nhìn nhanh', HX, HY + HH + 22);

// a click: the phone's list in place of the card and the row, as the battery tile's
const AX = HX + HW + 48, ay = HY, AW = 420, AH = 192;
text('Bấm ô: thay thẻ chính và hàng ô', AX, 196, {sz: 12, wt: 600});
cr.newPath(); rr(AX, ay, AW, AH, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
fill(C.FILL2, AX + 12, ay + 12, 32, 32, 16); icon('chevron-left', AX + 20, ay + 20);
text('Redmi Note 14 · 77% · đang sạc', AX + 54, ay + 19, {wt: 600});
text('đầy sau 40 phút', AX + AW - 16, ay + 20, {sz: SUB, a: C.FG_SUBTLE, right: true});
fill(C.FILL1, AX + 12, ay + 56, AW - 24, 36, 18);
icon('magnifier', AX + 26, ay + 66, 16); text('Tìm điện thoại', AX + 52, ay + 65);
text('đổ chuông', AX + AW - 28, ay + 65, {a: C.FG_MUTED, right: true});
fill(C.FILL1, AX + 12, ay + 100, AW - 24, 36, 18);
icon('gear', AX + 26, ay + 110, 16, C.FG_MUTED); text('Cài đặt GSConnect', AX + 52, ay + 109, {a: C.FG_MUTED});
icon('arrow-up-right-from-square', AX + AW - 40, ay + 110, 16, C.FG_SUBTLE);
note('như trang điện thoại trong tab Thiết bị; ‹ hoặc Esc về Home', AX, ay + AH + 8);
note('có tab Điện thoại (phần 3): bấm ô mở tab đó', AX, ay + AH + 22);
surf.writeToPNG(out);
