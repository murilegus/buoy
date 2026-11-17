// A Bluetooth device's page (decided 2026-11-17, Ethan): headphones in use (the battery up top, the
// volume as a row) next to a mouse (the battery only).
// gjs -m bluetooth-page.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, PW = 560, PH = 280, GAP = 40;
const W = 2 * PW + 3 * GAP - 40, H = 40 + PH + 74;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, right = false, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
    const e = L.get_pixel_extents()[1];
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
const icon = (n, x, y, s = 16, a = 1) => gicon(cr, n, x, y, s, [1, 1, 1], a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});

function battery(x, cy, v, label) {
    cr.save(); cr.translate(x, cy - 8);
    cr.newPath(); rr(.5, 3, 12.5, 10, 3); rr(2, 4.5, 9.5, 7, 1.5); cr.setFillRule(cairo.FillRule.EVEN_ODD);
    cr.setSourceRGBA(1, 1, 1, 1); cr.fill(); cr.setFillRule(cairo.FillRule.WINDING);
    fill(1, 14, 6.25, 1.5, 3.5, .75); fill(1, 3.5, 6, Math.max(1.5, 6.5 * v), 4, .75);
    cr.restore();
    const e = text(label, 0, 0, {wt: 600, measure: true});
    text(label, x + 20, cy - e.height / 2 - 1, {wt: 600});
}
const batteryW = label => 20 + text(label, 0, 0, {wt: 600, measure: true}).width;

function panel(x, y) {
    cr.newPath(); rr(x, y, PW, PH, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    fill(C.FILL1, x + 12, y + 12, 268, 32, 16);
    ['house', 'music-note', 'bell', 'calendar'].forEach((n, i) => icon(n, x + 24 + i * 36, y + 20, 16, C.FG_MUTED));
    fill(C.FILL3, x + 160, y + 14, 112, 28, 14);
    icon('display', x + 170, y + 20, 16); text('Thiết bị', x + 192, y + 19, {sz: SUB, wt: 600});
    fill(C.FILL1, x + PW - 44, y + 12, 32, 32, 16); icon('gear', x + PW - 36, y + 20, 16, C.FG_MUTED);
}
// the page: ‹, the name, its battery at the end; rows 36, r 18, 4 apart (Home's battery page)
function page(x, y, name, batt, rows) {
    panel(x, y);
    const AX = x + 12, AW = PW - 24;
    fill(C.FILL2, AX, y + 56, 32, 32, 16); icon('chevron-left', AX + 8, y + 64);
    text(name, AX + 42, y + 63, {wt: 600});
    battery(AX + AW - 4 - batteryW(batt[1]), y + 72, batt[0], batt[1]);
    rows.forEach((r, i) => {
        const ry = y + 96 + i * 40 + (r.settings ? 4 : 0);
        fill(C.FILL1, AX, ry, AW, 36, 18);
        const a = r.settings ? C.FG_MUTED : 1;
        icon(r.ic, AX + 14, ry + 10, 16, a);
        text(r.name, AX + 40, ry + 9, {a});
        if (r.level) {
            // the volume as the HUD's level, wider in a row: bar 160, 8, its number
            const [v, label] = r.level, bw = 160, lw = 34, bx = AX + AW - 14 - lw - 8 - bw;
            fill(.25, bx, ry + 16, bw, 4, 2); fill(1, bx, ry + 16, bw * v, 4, 2);
            text(label, AX + AW - 14, ry + 9, {wt: 600, right: true});
        }
        if (r.value)
            text(r.value, AX + AW - 14, ry + 9, {a: C.FG_MUTED, right: true});
        if (r.settings)
            icon('arrow-up-right-from-square', AX + AW - 30, ry + 10, 16, C.FG_SUBTLE);
    });
}

let x = GAP / 2;
text('Tai nghe Bluetooth đang phát', x, 12, {sz: 12, wt: 600});
page(x, 40, 'WH-1000XM4', [.8, '80%'], [
    {ic: 'volume', name: 'Âm lượng', level: [.64, '64%']},
    {ic: 'headphones', name: 'Tai nghe', value: '88:92:CC:70:9C:22'},
    {ic: 'bluetooth-slash', name: 'Ngắt kết nối'},
    {ic: 'gear', name: 'Cài đặt Bluetooth', settings: true},
]);
x += PW + GAP;
text('Chuột Bluetooth', x, 12, {sz: 12, wt: 600});
page(x, 40, 'MX Master 3S', [.15, '15%'], [
    {ic: 'mouse', name: 'Chuột', value: 'D4:12:7A:3C:90:11'},
    {ic: 'bluetooth-slash', name: 'Ngắt kết nối'},
    {ic: 'gear', name: 'Cài đặt Bluetooth', settings: true},
]);
const ny = 40 + PH + 12;
note('Đầu trang: tên, và pin ở cuối (hình pin theo mức, rồi số), như độ phân giải ở trang màn hình.', GAP / 2, ny);
note('Âm lượng: chỉ khi âm thanh đang ra thiết bị này; thanh và số như HUD (tắt tiếng: mờ). Bấm hàng: Cài đặt → Âm thanh. Không kéo ở đây: phím và Quick Settings lo.', GAP / 2, ny + 14);
note('Ngắt kết nối: như danh sách Bluetooth của Quick Settings (connect_service); ngắt xong trang đóng, về các cột. Cài đặt Bluetooth: mở Cài đặt, island đóng.', GAP / 2, ny + 28);
note('Thiết bị không có âm thanh (chuột, bàn phím, điện thoại): không có hàng Âm lượng. Hàng loại và địa chỉ (như Cài đặt → Bluetooth): chỉ để xem, không bấm.', GAP / 2, ny + 42);
surf.writeToPNG(out);
