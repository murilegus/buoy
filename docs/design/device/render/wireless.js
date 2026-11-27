// Bluetooth device (FEATURES M4 "Bluetooth device", decided 2026-11-17, Ethan): a volume says itself with
// the HUD's bar, a battery with a battery drawn at its level; the flashes, the Device tab's Wireless
// column and a device's page.
// gjs -m wireless.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon, t} from '../../render/lib.js';

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

text(t('Âm lượng: thanh và số, như HUD', 'Volume: a bar and a number, as the HUD'), 16, 12, {sz: 12, wt: 600});
row([['headphones', 'Logi USB Headset', lv(.64, '64%')], ['headphones', t('Tai nghe', 'Headphones'), lv(.64, '64%', true)],
    ['headphones', t('Đã rút tai nghe', 'Unplugged Headphones'), lv(.62, '62%')], ['volume', t('Loa', 'Speakers'), lv(.62, '62%')]], 36);
note(t('flash cắm, rút tai nghe (module plugged): âm lượng như phím âm lượng, thanh 40 rồi số; tắt tiếng: cả hai mờ (fg-subtle)', 'headphones plugged, unplugged flash (module plugged): volume as the volume keys, a 40 bar then the number; muted: both dim (fg-subtle)'), 16, 74);

text(t('Pin: hình pin theo mức, rồi số', 'Battery: a battery drawn to its level, then the number'), 16, 100, {sz: 12, wt: 600});
row([['headphones', 'WH-1000XM4', bt(.8, '80%')], ['mouse', 'MX Master 3S', bt(.15, '15%')], ['keyboard', 'K380', bt(.5)],
    ['smartphone', 'Redmi Note 14', bt(.8, '80%')], ['headphones', t('Đã ngắt WH-1000XM4', 'Disconnected WH-1000XM4')]], 124);
note(t('flash nối Bluetooth, 3 s: icon theo loại, tên, pin (hình pin 16 vẽ tới mức, rồi số); UPower chỉ báo mức thô (K380): chỉ hình pin', 'Bluetooth connected flash, 3 s: icon by kind, name, battery (a 16 battery drawn to its level, then the number); UPower gives only a coarse level (K380): the battery alone'), 16, 162);
note(t('điện thoại gửi pin theo bậc 20 % (HFP battchg 0–5): số ghi như nhận được; không gửi thì chỉ tên (pin đúng đến với GSConnect); ngắt: "Đã ngắt …", không trailing', 'a phone sends battery in 20 % steps (HFP battchg 0–5): the number as received; none sent: name only (the exact battery comes with GSConnect); disconnected: "Disconnected …", no trailing'), 16, 176);
note(t('tai nghe Bluetooth: chỉ flash này (pin), module plugged không flash thêm; lúc bật Buoy, lúc tắt Bluetooth: không flash (HUD đã báo)', 'Bluetooth headphones: this flash only (battery), module plugged adds none; when Buoy starts, when Bluetooth turns off: no flash (the HUD has said it)'), 16, 190);

// --- the Device tab ------------------------------------------------------------------------------
function panel(x, y) {
    cr.newPath(); rr(x, y, PW, PH, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    fill(C.FILL1, x + 12, y + 12, 268, 32, 16);
    ['house', 'music-note', 'bell', 'calendar'].forEach((n, i) => icon(n, x + 24 + i * 36, y + 20, 16, C.FG_MUTED));
    fill(C.FILL3, x + 160, y + 14, 112, 28, 14);
    icon('display', x + 170, y + 20, 16); text(t('Thiết bị', 'Devices'), x + 192, y + 19, {sz: SUB, wt: 600});
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
text(t('Tab Thiết bị: cột Không dây', 'Devices tab: the Wireless column'), 16, ty - 24, {sz: 12, wt: 600});
columns(16, ty, [
    {title: t('Máy này', 'This Computer'), rows: [['battery', t('Pin · dùng 11 W', 'Battery · using 11 W'), '76%'], ['scales-balanced', t('Chế độ năng lượng', 'Power Mode'), t('Cân bằng', 'Balanced')]]},
    {title: t('Không dây', 'Wireless'), rows: [['mouse', 'MX Master 3S', bt(.15, '15%')], ['headphones', t('WH-1000XM4 · đang phát', 'WH-1000XM4 · Playing'), bt(.8, '80%')], ['smartphone', 'Pixel 8', null]]},
    {title: t('Đang cắm', 'Plugged In'), rows: [['display', 'ViewSonic 27″', t('Nối', 'Join')], ['headphones', 'Logi USB Headset', lvs(.64, '64%')]]},
]);

// a Bluetooth device's page, in place of the columns
const px = 16 + PW + 48;
text(t('Bấm một thiết bị Bluetooth', 'Click a Bluetooth device'), px, ty - 24, {sz: 12, wt: 600});
panel(px, ty);
const AX = px + 12, AW = PW - 24;
fill(C.FILL2, AX, ty + 56, 32, 32, 16); icon('chevron-left', AX + 8, ty + 64);
text('WH-1000XM4', AX + 42, ty + 63, {wt: 600});
battery(AX + AW - 4 - batteryW('80%'), ty + 72, .8, '80%');
fill(C.FILL1, AX, ty + 96, AW, 36, 18);
icon('headphones', AX + 14, ty + 106, 16); text(t('Tai nghe', 'Headphones'), AX + 40, ty + 105);
text('88:92:CC:70:9C:22', AX + AW - 14, ty + 105, {a: C.FG_MUTED, right: true});
fill(C.FILL1, AX, ty + 136, AW, 36, 18);
icon('bluetooth-slash', AX + 14, ty + 146, 16); text(t('Ngắt kết nối', 'Disconnect'), AX + 40, ty + 145);
fill(C.FILL1, AX, ty + 180, AW, 36, 18);
icon('gear', AX + 14, ty + 190, 16, C.FG_MUTED); text(t('Cài đặt Bluetooth', 'Bluetooth Settings'), AX + 40, ty + 189, {a: C.FG_MUTED});
icon('arrow-up-right-from-square', AX + AW - 30, ty + 190, 16, C.FG_SUBTLE);

const ny = ty + PH + 12;
note(t('Không dây: thiết bị Bluetooth đang nối (của Quick Settings) và chuột, bàn phím 2.4 GHz có báo pin (UPower); pin yếu (≤ 20 %) lên trước.', 'Wireless: connected Bluetooth devices (Quick Settings\') and 2.4 GHz mice, keyboards that report a battery (UPower); low battery (≤ 20 %) first.'), 16, ny);
note(t('Giá trị: pin là hình pin + số; âm lượng (tai nghe có dây, Đang cắm) là thanh 24 + số. Ô Pin của máy giữ số: icon của nó đã là pin. Âm thanh đang ra thiết bị: "· đang phát".', 'Values: battery is a battery + number; volume (wired headphones, Plugged In) is a 24 bar + number. The computer\'s Battery tile keeps the number: its icon is a battery already. Sound going to the device: "· Playing".'), 16, ny + 14);
note(t('Bấm thiết bị Bluetooth: trang có pin, loại và địa chỉ, Ngắt kết nối (như danh sách của Quick Settings), Cài đặt Bluetooth. Bấm thiết bị 2.4 GHz: Cài đặt → Nguồn.', 'Click a Bluetooth device: a page with battery, kind and address, Disconnect (as Quick Settings\' list), Bluetooth Settings. Click a 2.4 GHz device: Settings → Power.'), 16, ny + 28);
surf.writeToPNG(out);
