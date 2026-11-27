// Phone via GSConnect, part 1 (decided 2026-11-17, Ethan): the phone as a device — its cell and page in
// the Device tab, its notifications under the phone app's name, the prefs row when GSConnect is
// missing.
// gjs -m phone.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, SAMPLE, icon as gicon, t} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, PW = 560, PH = 280;
const W = 1200, H = t(640, 672);  // the vi height cuts the last two notes off
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, rgb = [1, 1, 1], right = false, max = 0, lines = 1, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
    L.set_width(max > 0 ? max * Pango.SCALE : -1); L.set_ellipsize(max > 0 ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    L.set_height(lines > 1 ? -lines : -1); L.set_wrap(Pango.WrapMode.WORD_CHAR);
    const e = L.get_pixel_extents()[1];
    L.set_width(-1); L.set_height(-1);
    if (measure)
        return e;
    cr.setSourceRGBA(...rgb, a); cr.moveTo(right ? x - e.width : x, y); PangoCairo.show_layout(cr, L);
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
    return 20 + e.width;
}
const batteryW = label => 20 + text(label, 0, 0, {wt: 600, measure: true}).width;
function panel(x, y) {
    cr.newPath(); rr(x, y, PW, PH, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    fill(C.FILL1, x + 12, y + 12, 268, 32, 16);
    ['house', 'music-note', 'bell', 'calendar'].forEach((n, i) => icon(n, x + 24 + i * 36, y + 20, 16, C.FG_MUTED));
    fill(C.FILL3, x + 160, y + 14, 112, 28, 14);
    icon('display', x + 170, y + 20, 16); text(t('Thiết bị', 'Devices'), x + 192, y + 19, {sz: SUB, wt: 600});
    fill(C.FILL1, x + PW - 44, y + 12, 32, 32, 16); icon('gear', x + PW - 36, y + 20, 16, C.FG_MUTED);
}

// --- the Device tab: the phone's cell, its page ------------------------------------------------
const ty = 40;
text(t('Tab Thiết bị: điện thoại trong cột Không dây', 'Devices tab: the phone in the Wireless column'), 16, ty - 26, {sz: 12, wt: 600});
panel(16, ty);
const cw = (PW - 24 - 8) / 2;
const cols = [
    {title: t('Máy này', 'This Computer'), rows: [['battery', t('Pin · dùng 11 W', 'Battery · using 11 W'), '76%'], ['scales-balanced', t('Chế độ năng lượng', 'Power Mode'), t('Cân bằng', 'Balanced')]]},
    {title: t('Không dây', 'Wireless'), rows: [['smartphone', t('Redmi Note 14 · đang sạc', 'Redmi Note 14 · Charging'), [.77, '77%']], ['headphones', 'WH-1000XM4', [.8, '80%']]]},
];
cols.forEach((g, i) => {
    const cx = 16 + 12 + i * (cw + 8);
    text(`${g.title.toUpperCase()}  ${g.rows.length}`, cx + 10, ty + 58, {sz: 7.5, wt: 600, a: C.FG_SUBTLE});
    g.rows.forEach(([ic, name, val], j) => {
        const ry = ty + 76 + j * 64;
        fill(C.FILL1, cx, ry, cw, 58, 16);
        icon(ic, cx + 12, ry + 12, 16);
        if (typeof val === 'string')
            text(val, cx + cw - 12, ry + 11, {wt: 600, right: true});
        else
            battery(cx + cw - 12 - batteryW(val[1]), ry + 20, val[0], val[1]);
        text(name, cx + 12, ry + 34, {sz: SUB, a: C.FG_MUTED, max: cw - 24});
    });
});
const px = 16 + PW + 48;
text(t('Bấm điện thoại', 'Click the phone'), px, ty - 26, {sz: 12, wt: 600});
panel(px, ty);
const AX = px + 12, AW = PW - 24;
fill(C.FILL2, AX, ty + 56, 32, 32, 16); icon('chevron-left', AX + 8, ty + 64);
text('Redmi Note 14', AX + 42, ty + 63, {wt: 600});
battery(AX + AW - 4 - batteryW('77%'), ty + 72, .77, '77%');
const rows = [['magnifier', t('Tìm điện thoại', 'Find My Phone'), t('đổ chuông', 'Rings it'), false], ['gear', t('Cài đặt GSConnect', 'GSConnect Settings'), null, true]];
rows.forEach(([ic, name, val, set], i) => {
    const ry = ty + 96 + i * 40 + (set ? 4 : 0);
    fill(C.FILL1, AX, ry, AW, 36, 18);
    icon(ic, AX + 14, ry + 10, 16, set ? C.FG_MUTED : 1);
    text(name, AX + 40, ry + 9, {a: set ? C.FG_MUTED : 1});
    if (val)
        text(val, AX + AW - 14, ry + 9, {a: C.FG_MUTED, right: true});
    if (set)
        icon('arrow-up-right-from-square', AX + AW - 30, ry + 10, 16, C.FG_SUBTLE);
});
let ny = ty + PH + 10;
note(t('Pin đúng từ GSConnect (không theo bậc 20 % như Bluetooth); đang sạc: "· đang sạc" dưới tên. Nối cả Bluetooth: một ô (tên trùng), pin của GSConnect.', 'Exact battery from GSConnect (not in 20 % steps like Bluetooth); charging: "· Charging" under the name. Also on Bluetooth: one tile (same name), GSConnect\'s battery.'), 16, ny);
note(t('Trang: Tìm điện thoại (GSConnect "ring": điện thoại đổ chuông dù đang im lặng), Cài đặt GSConnect. Cách nối (Wi-Fi / Bluetooth) GSConnect không đưa lên D-Bus. Không flash khi nối, ngắt.', 'Page: Find My Phone (GSConnect "ring": the phone rings even when silent), GSConnect Settings. How it connects (Wi-Fi / Bluetooth) GSConnect does not put on D-Bus. No flash on connect, disconnect.'), 16, ny + 14);

// --- a phone's notification: under the phone app's name ------------------------------------------
const cy = ny + 52;
text(t('Thông báo của điện thoại', 'The phone\'s notifications'), 16, cy - 22, {sz: 12, wt: 600});
const kw = 404;
cr.newPath(); rr(16, cy, kw, 104, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
fill(1, 30, cy + 8, 40, 40, 10, [.0, .41, .98]);            // the phone app's icon (Zalo's blue), as GSConnect sends it
text('Z', 50, cy + 16, {sz: 13, wt: 700, right: false});
text(SAMPLE.person, 82, cy + 10, {wt: 600});
text(t('Zalo · Redmi Note 14 · bây giờ', 'Zalo · Redmi Note 14 · now'), 82, cy + 30, {sz: SUB, a: C.FG_MUTED});
text('Tối nay họp lúc 8 giờ nhé, nhớ mang bản vẽ.', 30, cy + 64, {sz: SUB, a: .85, max: kw - 28});
// its pill
const pe = text(SAMPLE.person, 0, 0, {wt: 600, measure: true});
const pw = Math.max(131, 8 + 24 + 6 + pe.width + 8);
fill(1, 16 + kw + 32, cy + 8, pw, 32, 16, [0, 0, 0]);
fill(1, 16 + kw + 40, cy + 12, 24, 24, 6, [.0, .41, .98]);
text(SAMPLE.person, 16 + kw + 32 + 38, cy + 16, {wt: 600});
note(t('pill: icon app trên điện thoại, tiêu đề (người gửi) như thông báo thường; card:', 'pill: the phone app\'s icon, the title (sender) as a normal notification; card:'), 16 + kw + 32, cy + 50);
note(t('dòng dưới "Zalo · Redmi Note 14" (tên điện thoại nói nó đến từ đâu)', 'the line below "Zalo · Redmi Note 14" (the phone\'s name says where it came from)'), 16 + kw + 32, cy + 64);
note(t('Thông báo điện thoại GSConnect gửi (tên app = tiêu đề) thành của app đó: tab Thông báo nhóm theo Zalo, Messenger… chứ không gộp hết vào "GSConnect".', 'Phone notifications GSConnect sends (app name = title) become that app\'s: the Notifications tab groups by Zalo, Messenger… instead of lumping all under "GSConnect".'), 16, cy + 116);
note(t('Nút của thông báo (Trả lời, Copy mã OTP GSConnect tự thêm) giữ nguyên; app riêng (OTP, Grab, Zalo kèm ảnh) ở PR 2.', 'The notification\'s buttons (Reply, the OTP Copy GSConnect adds) stay; per-app looks (OTP, Grab, Zalo with photo) in PR 2.'), 16, cy + 130);

// --- prefs: Modules → Phone, three states -----------------------------------------------------------
const gy = cy + 176;
text(t('Cài đặt Buoy → Modules → Thiết bị: dòng Điện thoại', 'Buoy Settings → Modules → Devices: the Phone row'), 16, gy - 22, {sz: 12, wt: 600});
const states = [
    [t('Cần GSConnect để thấy điện thoại', 'Needs GSConnect to see your phone'), t('Cài GSConnect', 'Install GSConnect')],
    [t('GSConnect đang tắt', 'GSConnect is off'), t('Bật GSConnect', 'Turn On GSConnect')],
    [t('Chưa ghép đôi điện thoại (KDE Connect)', 'No phone paired yet\n(KDE Connect on the phone)'), t('Mở GSConnect', 'Open GSConnect')],  // en: two lines, as the row wraps it
];
states.forEach(([sub, btn], i) => {
    const x = 16 + i * 392, w = 376;
    fill(1, x, gy, w, 64, 12, [.18, .18, .18]);
    const two = sub.includes('\n');
    text(t('Điện thoại', 'Phone'), x + 16, gy + (two ? 7 : 12), {wt: 600});
    text(sub, x + 16, gy + (two ? 26 : 34), {sz: SUB, a: C.FG_MUTED, max: w - 150});
    const be = text(btn, 0, 0, {sz: SUB, wt: 600, measure: true});
    fill(1, x + w - 16 - be.width - 24, gy + 16, be.width + 24, 32, 8, [.3, .3, .3]);
    text(btn, x + w - 16 - be.width - 12, gy + 24, {sz: SUB, wt: 600});
});
note(t('Cài GSConnect: mở trang của nó trên extensions.gnome.org (Ubuntu còn có gói gnome-shell-extension-gsconnect); Bật: bật extension đó; Mở: cài đặt GSConnect để ghép đôi.', 'Install GSConnect: opens its page on extensions.gnome.org (Ubuntu also has the gnome-shell-extension-gsconnect package); Turn On: turns that extension on; Open: GSConnect\'s settings, to pair.'), 16, gy + 76);
note(t('Không flash, không nhắc trong pill. Tab Điện thoại (PR 3) nói cùng điều đó trong khung trống của nó.', 'No flash, no reminder in the pill. The Phone tab (PR 3) says the same in its empty state.'), 16, gy + 90);
surf.writeToPNG(out);
