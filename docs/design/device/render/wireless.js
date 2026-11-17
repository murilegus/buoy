// Bluetooth device (FEATURES M4 "Bluetooth device", decided 2026-11-17, Ethan): a volume says itself with
// the HUD's bar, a battery with a battery drawn at its level; the flashes, the Device tab's Wireless
// column and a device's page.
// gjs -m wireless.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out] = ARGV;
const W1 = C.WHITE, SUB = 9.35, PW = 560, PH = 280;
const W = 1200, H = 236 + PH + 60;
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
const fill = (a, x, y, w, h, r, rgb = W1) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgb, a); cr.fill(); };
const icon = (n, x, y, s = 16, a = 1) => gicon(cr, n, x, y, s, W1, a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});

// --- the two trailing kinds ---------------------------------------------------------------------
// a level (the HUD's, kit/ui/present/parts.js levelBar): a bar 40 × 4, 8, its number
const BAR = 40;
function levelW(label, bw = BAR) {
    return bw + 8 + Math.max(34, text(label, 0, 0, {wt: 600, measure: true}).width);
}
function level(x, cy, v, label, {off = false, bw = BAR} = {}) {
    const a = off ? C.FG_SUBTLE : 1;
    fill(.25 * a, x, cy - 2, bw, 4, 2);
    fill(a, x, cy - 2, Math.max(4, bw * v), 4, 2);
    const lw = Math.max(34, text(label, 0, 0, {wt: 600, measure: true}).width);
    const e = text(label, 0, 0, {wt: 600, measure: true});
    text(label, x + bw + 8 + lw, cy - e.height / 2 - 1, {wt: 600, a, right: true});
}
// a battery (Buoy's battery icon, its inside filled to the level), 4, its number; a coarse level
// (UPower's, no number) only the battery
function batteryW(label) {
    return 16 + (label ? 4 + text(label, 0, 0, {wt: 600, measure: true}).width : 0);
}
function battery(x, cy, v, label) {
    const y = cy - 8;
    cr.save(); cr.translate(x, y);
    cr.newPath(); rr(.5, 3, 12.5, 10, 3); rr(2, 4.5, 9.5, 7, 1.5); cr.setFillRule(cairo.FillRule.EVEN_ODD);
    cr.setSourceRGBA(1, 1, 1, 1); cr.fill(); cr.setFillRule(cairo.FillRule.WINDING);
    fill(1, 14, 6.25, 1.5, 3.5, .75);
    fill(1, 3.5, 6, Math.max(1.5, 6.5 * v), 4, .75);
    cr.restore();
    if (label) {
        const e = text(label, 0, 0, {wt: 600, measure: true});
        text(label, x + 20, cy - e.height / 2 - 1, {wt: 600});
    }
}

// a pill at its real width (design/tokens): 8 + leading 24 + 6 + text + 6 + trailing + 8, at least 131
function pill(x, y, lead, t, trail = null) {
    const te = text(t, 0, 0, {wt: 600, measure: true});
    const tw = trail ? trail.w : 0;
    const w = Math.max(131, 8 + 24 + 6 + te.width + (tw ? 6 + tw : 0) + 8);
    fill(1, x, y, w, 32, 16, [0, 0, 0]);
    icon(lead, x + 12, y + 8, 16);
    text(t, x + 38, y + 16 - te.height / 2 - 1, {wt: 600});
    if (trail)
        trail.draw(x + w - 8 - tw, y + 16);
    return w;
}
const lv = (v, label, off = false) => ({w: levelW(label), draw: (x, cy) => level(x, cy, v, label, {off})});
const bt = (v, label = null) => ({w: batteryW(label), draw: (x, cy) => battery(x, cy, v, label)});
function row(items, y) {
    let x = 16;
    items.forEach(([ic, t, tr]) => {
        x += pill(x, y, ic, t, tr) + 14;
    });
    return x;
}

text('Âm lượng: thanh và số, như HUD', 16, 12, {sz: 12, wt: 600});
row([['headphones', 'Logi USB Headset', lv(.64, '64%')], ['headphones', 'Tai nghe', lv(.64, '64%', true)],
    ['headphones', 'Đã rút tai nghe', lv(.62, '62%')], ['volume', 'Loa', lv(.62, '62%')]], 36);
note('flash cắm, rút tai nghe (module plugged): âm lượng như phím âm lượng, thanh 40 rồi số; tắt tiếng: cả hai mờ (fg-subtle)', 16, 74);

text('Pin: hình pin theo mức, rồi số', 16, 100, {sz: 12, wt: 600});
row([['headphones', 'WH-1000XM4', bt(.8, '80%')], ['mouse', 'MX Master 3S', bt(.15, '15%')], ['keyboard', 'K380', bt(.5)],
    ['smartphone', 'Pixel 8'], ['headphones', 'Đã ngắt WH-1000XM4']], 124);
note('flash nối Bluetooth, 3 s: icon theo loại, tên, pin (hình pin 16 vẽ tới mức, rồi số); UPower chỉ báo mức thô (K380): chỉ hình pin', 16, 162);
note('điện thoại thường không gửi pin qua Bluetooth: chỉ tên (pin đến với GSConnect); ngắt: "Đã ngắt …", không trailing', 16, 176);
note('tai nghe Bluetooth: chỉ flash này (pin), module plugged không flash thêm; lúc bật Buoy, lúc tắt Bluetooth: không flash (HUD đã báo)', 16, 190);

// --- the Device tab ------------------------------------------------------------------------------
function panel(x, y) {
    cr.newPath(); rr(x, y, PW, PH, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    fill(C.FILL1, x + 12, y + 12, 268, 32, 16);
    ['house', 'music-note', 'bell', 'calendar'].forEach((n, i) => icon(n, x + 24 + i * 36, y + 20, 16, C.FG_MUTED));
    fill(C.FILL3, x + 160, y + 14, 112, 28, 14);
    icon('display', x + 170, y + 20, 16); text('Thiết bị', x + 192, y + 19, {sz: SUB, wt: 600});
    fill(C.FILL1, x + PW - 44, y + 12, 32, 32, 16); icon('gear', x + PW - 36, y + 20, 16, C.FG_MUTED);
}
function columns(x, y, groups) {
    panel(x, y);
    const n = groups.length, cw = (PW - 24 - (n - 1) * 8) / n;
    groups.forEach((g, i) => {
        const cx = x + 12 + i * (cw + 8);
        text(`${g.title.toUpperCase()}  ${g.rows.length}`, cx + 10, y + 58, {sz: 7.5, wt: 600, a: C.FG_SUBTLE});
        g.rows.forEach(([ic, name, val], j) => {
            const ry = y + 76 + j * 64;
            fill(C.FILL1, cx, ry, cw, 58, 16);
            icon(ic, cx + 12, ry + 12, 16);
            if (typeof val === 'string')
                text(val, cx + cw - 12, ry + 11, {wt: 600, right: true});
            else if (val)
                val.draw(cx + cw - 12 - val.w, ry + 20);
            text(name, cx + 12, ry + 34, {sz: SUB, a: C.FG_MUTED, max: cw - 24});
        });
    });
}
const lvs = (v, label) => ({w: levelW(label, 24), draw: (x, cy) => level(x, cy, v, label, {bw: 24})});
const ty = 236;
text('Tab Thiết bị: cột Không dây', 16, ty - 24, {sz: 12, wt: 600});
columns(16, ty, [
    {title: 'Máy này', rows: [['battery', 'Pin · dùng 11 W', '76%'], ['scales-balanced', 'Chế độ năng lượng', 'Cân bằng']]},
    {title: 'Không dây', rows: [['mouse', 'MX Master 3S', bt(.15, '15%')], ['headphones', 'WH-1000XM4 · đang phát', bt(.8, '80%')], ['smartphone', 'Pixel 8', null]]},
    {title: 'Đang cắm', rows: [['display', 'ViewSonic 27″', 'Nối'], ['headphones', 'Logi USB Headset', lvs(.64, '64%')]]},
]);

// a Bluetooth device's page, in place of the columns
const px = 16 + PW + 48;
text('Bấm một thiết bị Bluetooth', px, ty - 24, {sz: 12, wt: 600});
panel(px, ty);
const AX = px + 12, AW = PW - 24;
fill(C.FILL2, AX, ty + 56, 32, 32, 16); icon('chevron-left', AX + 8, ty + 64);
text('WH-1000XM4', AX + 42, ty + 63, {wt: 600});
battery(AX + AW - 4 - batteryW('80%'), ty + 72, .8, '80%');
fill(C.FILL1, AX, ty + 96, AW, 36, 18);
icon('bluetooth-slash', AX + 14, ty + 106, 16); text('Ngắt kết nối', AX + 40, ty + 105);
fill(C.FILL1, AX, ty + 140, AW, 36, 18);
icon('gear', AX + 14, ty + 150, 16, C.FG_MUTED); text('Cài đặt Bluetooth', AX + 40, ty + 149, {a: C.FG_MUTED});
icon('arrow-up-right-from-square', AX + AW - 30, ty + 150, 16, C.FG_SUBTLE);

const ny = ty + PH + 12;
note('Không dây: thiết bị Bluetooth đang nối (của Quick Settings) và chuột, bàn phím 2.4 GHz có báo pin (UPower); pin yếu (≤ 20 %) lên trước.', 16, ny);
note('Giá trị: pin là hình pin + số; âm lượng (tai nghe có dây, Đang cắm) là thanh 24 + số. Ô Pin của máy giữ số: icon của nó đã là pin. Âm thanh đang ra thiết bị: "· đang phát".', 16, ny + 14);
note('Bấm thiết bị Bluetooth: trang có pin, Ngắt kết nối (như danh sách của Quick Settings), Cài đặt Bluetooth. Bấm thiết bị 2.4 GHz: Cài đặt → Nguồn.', 16, ny + 28);
surf.writeToPNG(out);
