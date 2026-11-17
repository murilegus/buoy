// USB / phone / webcam plugged (decided 2026-11-17, Ethan): a drive's compact (Open, Eject), the flashes,
// the Plugged In column and a drive's page.
// gjs -m drives.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, PW = 560, PH = 280;
const W = 1320, H = 314 + PH + 60;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, right = false, centre = false, max = 0, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
    L.set_width(max > 0 ? max * Pango.SCALE : -1); L.set_ellipsize(max > 0 ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    const e = L.get_pixel_extents()[1];
    L.set_width(-1);
    if (measure)
        return e;
    let px = x;
    if (right)
        px = x - e.width;
    else if (centre)
        px = x - e.width / 2;
    cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(px, y); PangoCairo.show_layout(cr, L);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (a, x, y, w, h, r, rgb = [1, 1, 1]) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgb, a); cr.fill(); };
const icon = (n, x, y, s = 16, a = 1) => gicon(cr, n, x, y, s, [1, 1, 1], a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});

function pill(x, y, lead, t, trail = null) {
    const te = text(t, 0, 0, {wt: 600, measure: true}), pe = trail ? text(trail, 0, 0, {wt: 600, measure: true}) : null;
    const w = Math.max(131, 8 + 24 + 6 + te.width + (pe ? 6 + pe.width : 0) + 8);
    fill(1, x, y, w, 32, 16, [0, 0, 0]);
    icon(lead, x + 12, y + 8, 16);
    text(t, x + 38, y + 16 - te.height / 2 - 1, {wt: 600});
    if (pe)
        text(trail, x + w - 8 - pe.width, y + 16 - pe.height / 2 - 1, {wt: 600, a: C.FG_MUTED});
    return w;
}

// --- a drive plugged in: its compact opens on its own (an alert), Open and Eject -----------------
text('Cắm ổ: compact tự mở', 16, 12, {sz: 12, wt: 600});
const CX = 16, cy = 36, kw = 404;
fill(1, CX, cy, kw, 104, 28, [0, 0, 0]);
fill(C.FILL2, CX + 14, cy + 8, 40, 40, 20); icon('hard-drive', CX + 26, cy + 20, 16);
text('USB 64 GB', CX + 66, cy + 9, {wt: 600}); text('Trống 41 GB / 64 GB', CX + 66, cy + 29, {sz: SUB, a: C.FG_MUTED});
const bw = (kw - 24 - 8) / 2;
[['folder-open', 'Mở'], ['eject', 'Ngắt']].forEach(([ic, t], i) => {
    const bx = CX + 12 + i * (bw + 8);
    fill(C.FILL2, bx, cy + 60, bw, 32, 16);
    const e = text(t, 0, 0, {sz: SUB, wt: 600, measure: true});
    icon(ic, bx + bw / 2 - (e.width + 22) / 2, cy + 68, 16);
    text(t, bx + bw / 2 - (e.width + 22) / 2 + 22, cy + 68, {sz: SUB, wt: 600});
});
note('alert như cắm màn hình (giữ 5 s lúc bạn có mặt), rồi pill 3 s; thay thông báo “USB 64 GB” connected của GNOME', CX, cy + 112);
note('Mở: Files ở gốc ổ; Ngắt: ghi nốt dữ liệu rồi tháo (eject, không được thì unmount); đang bận: hộp thoại GNOME liệt kê app', CX, cy + 126);
let px = CX + kw + 28;
px += pill(px, cy + 8, 'hard-drive', 'USB 64 GB') + 14;
pill(px, cy + 8, 'smartphone', 'Redmi Note 14');
note('điện thoại cắm dây, chế độ truyền tệp (MTP): như một ổ, icon điện thoại, chỉ Mở và Ngắt (không có dung lượng)', CX + kw + 28, cy + 48);
note('chỉ sạc: không có ổ, không báo', CX + kw + 28, cy + 62);

// --- the other flashes -------------------------------------------------------------------------
text('Ngắt, rút, webcam: flash 3 s', 16, 186, {sz: 12, wt: 600});
px = 16;
for (const [ic, t] of [['hard-drive', 'Đang ghi vào USB 64 GB'], ['hard-drive', 'Có thể rút USB 64 GB'], ['hard-drive', 'Đã rút USB 64 GB'],
    ['camera', 'Logi C920'], ['camera', 'Đã rút Logi C920']])
    px += pill(px, 208, ic, t) + 14;
note('"Đang ghi vào": còn dữ liệu đang ghi, ở tới khi xong; "Có thể rút": ngắt xong; "Đã rút": rút ra mà chưa ngắt; chỉ unmount (Files), ổ còn cắm: không báo', 16, 246);
note('Webcam rời: cắm, rút (camera tích hợp không tính: cổng USB "fixed"). Thông báo của GNOME (cắm ổ, đang ghi, có thể rút) không hiện: Buoy nói thay', 16, 260);

// --- the Plugged In column and a drive's page ---------------------------------------------------
function panel(x, y) {
    cr.newPath(); rr(x, y, PW, PH, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    fill(C.FILL1, x + 12, y + 12, 268, 32, 16);
    ['house', 'music-note', 'bell', 'calendar'].forEach((n, i) => icon(n, x + 24 + i * 36, y + 20, 16, C.FG_MUTED));
    fill(C.FILL3, x + 160, y + 14, 112, 28, 14);
    icon('display', x + 170, y + 20, 16); text('Thiết bị', x + 192, y + 19, {sz: SUB, wt: 600});
    fill(C.FILL1, x + PW - 44, y + 12, 32, 32, 16); icon('gear', x + PW - 36, y + 20, 16, C.FG_MUTED);
}
const ty = 314;
text('Tab Thiết bị: cột Đang cắm', 16, ty - 24, {sz: 12, wt: 600});
panel(16, ty);
const groups = [
    {title: 'Máy này', rows: [['battery', 'Pin · dùng 11 W', '76%'], ['scales-balanced', 'Chế độ năng lượng', 'Cân bằng']]},
    {title: 'Đang cắm', rows: [['display', 'ViewSonic 27″', 'Nối'], ['hard-drive', 'USB 64 GB', '41 GB'], ['camera', 'Logi C920', null]]},
];
const cw = (PW - 24 - 8) / 2;
groups.forEach((g, i) => {
    const cx = 16 + 12 + i * (cw + 8);
    text(`${g.title.toUpperCase()}  ${g.rows.length}`, cx + 10, ty + 58, {sz: 7.5, wt: 600, a: C.FG_SUBTLE});
    g.rows.forEach(([ic, name, val], j) => {
        const ry = ty + 76 + j * 64;
        fill(C.FILL1, cx, ry, cw, 58, 16);
        icon(ic, cx + 12, ry + 12, 16);
        if (val)
            text(val, cx + cw - 12, ry + 11, {wt: 600, right: true});
        text(name, cx + 12, ry + 34, {sz: SUB, a: C.FG_MUTED, max: cw - 24});
    });
});
const qx = 16 + PW + 48;
text('Bấm một ổ', qx, ty - 24, {sz: 12, wt: 600});
panel(qx, ty);
const AX = qx + 12, AW = PW - 24;
fill(C.FILL2, AX, ty + 56, 32, 32, 16); icon('chevron-left', AX + 8, ty + 64);
text('USB 64 GB', AX + 42, ty + 63, {wt: 600});
text('Trống 41 GB / 64 GB', AX + AW - 4, ty + 64, {sz: SUB, a: C.FG_SUBTLE, right: true});
[['folder-open', 'Mở trong Files'], ['eject', 'Ngắt']].forEach(([ic, t], i) => {
    const ry = ty + 96 + i * 40;
    fill(C.FILL1, AX, ry, AW, 36, 18);
    icon(ic, AX + 14, ry + 10, 16); text(t, AX + 40, ry + 9);
});
const ny = ty + PH + 12;
note('Đang cắm: màn hình, ổ (USB, thẻ nhớ, ổ rời, điện thoại MTP; giá trị là dung lượng trống), webcam rời, âm thanh có dây. Ổ mạng, ổ trong máy không tính.', 16, ny);
note('Bấm ổ: trang Mở trong Files, Ngắt; ngắt xong về các cột. Bấm webcam: mở app Camera (Snapshot) nếu có, không thì không làm gì.', 16, ny + 14);
note('Webcam không có giá trị: Shell chỉ biết "có camera đang dùng", không biết cái nào.', 16, ny + 28);
surf.writeToPNG(out);
