// Phone via GSConnect, part 3 (design/device "Cuộc gọi và tab Điện thoại", 2026-11-18, Ethan): a call
// ringing and going on, the reply in the card, the Phone tab with its empty states.
// gjs -m calls.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, SAMPLE, icon as gicon, drawBu, t} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, KW = 404, PW = 560, PH = 280;
const W = 1200, H = 830 + 56;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, rgb = [1, 1, 1], right = false, max = 0, measure = false, tnum = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
    const at = new Pango.AttrList(); if (tnum) at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
    L.set_width(max > 0 ? max * Pango.SCALE : -1); L.set_ellipsize(max > 0 ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    const e = L.get_pixel_extents()[1];
    L.set_width(-1);
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
const icon = (n, x, y, s = 16, a = 1, rgb = [1, 1, 1]) => gicon(cr, n, x, y, s, rgb, a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});
const title = (t, x, y) => text(t, x, y, {sz: 12, wt: 600});
const GREEN = C.CAM;
function avatar(x, y, s, initials, g2 = [.55, .32, .78]) {
    const g = new cairo.LinearGradient(x, y, x + s, y + s);
    g.addColorStopRGB(0, .98, .62, .45); g.addColorStopRGB(1, ...g2);
    cr.newPath(); cr.arc(x + s / 2, y + s / 2, s / 2, 0, 2 * Math.PI); cr.setSource(g); cr.fill();
    const e = text(initials, 0, 0, {sz: s * .3, wt: 700, measure: true});
    text(initials, x + (s - e.width) / 2, y + (s - e.height) / 2 - 1, {sz: s * .3, wt: 700});
}
const badge = (x, y) => { fill(1, x, y, 18, 18, 9, [0, 0, 0]); icon('smartphone', x + 2, y + 1, 14); };
function head(x, y, pic, t, sub) {
    pic(x + 14, y + 8);
    text(t, x + 66, y + 10, {wt: 600, max: KW - 120});
    text(sub, x + 66, y + 30, {sz: SUB, a: C.FG_MUTED, tnum: true});
}
const close = (x, y) => { fill(C.FILL2, x + KW - 46, y + 12, 32, 32, 16); icon('xmark', x + KW - 38, y + 20, 16, C.FG_MUTED); };
function buttons(x, y, labels, w = KW) {
    const bw = (w - 24 - 8 * (labels.length - 1)) / labels.length;
    labels.forEach(([ic, l], i) => {
        const bx = x + 12 + i * (bw + 8);
        fill(C.FILL2, bx, y, bw, 32, 16);
        const e = text(l, 0, 0, {sz: SUB, wt: 600, measure: true}), tw = (ic ? 22 : 0) + e.width;
        if (ic)
            icon(ic, bx + (bw - tw) / 2, y + 8, 16);
        text(l, bx + (bw - tw) / 2 + (ic ? 22 : 0), y + 8, {sz: SUB, wt: 600});
    });
}
function pill(x, y, lead, t, trail = null, trailRgb = [1, 1, 1], trailA = C.FG_MUTED) {
    const e = text(t, 0, 0, {wt: 600, measure: true, tnum: true});
    const te = trail ? text(trail, 0, 0, {wt: 600, measure: true, tnum: true}) : {width: 0};
    const w = Math.max(131, 8 + 24 + 6 + e.width + (trail ? 12 + te.width : 0) + 12);
    fill(1, x, y, w, 32, 16, [0, 0, 0]);
    lead(x + 4, y + 4);
    text(t, x + 38, y + 8, {wt: 600, tnum: true});
    if (trail)
        text(trail, x + w - 12, y + 8, {wt: 600, a: trailA, rgb: trailRgb, right: true, tnum: true});
    return w;
}
const greenPhone = (x, y) => icon('handset', x + 4, y + 4, 16, 1, GREEN);
const PX = 16 + KW + 32;

// --- 1. a call ringing --------------------------------------------------------------------------------
let y = 40;
title(t('1 · Cuộc gọi đến: card ở lại tới khi điện thoại thôi đổ chuông', '1 · Incoming call: the card stays till the phone stops ringing'), 16, y - 26);
cr.newPath(); rr(16, y, KW, 104, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
head(16, y, (x, yy) => { avatar(x, yy, 40, 'QT'); badge(x + 26, yy + 26); }, SAMPLE.person, t('Cuộc gọi đến · Redmi Note 14', 'Incoming Call · Redmi Note 14'));
close(16, y);
buttons(16, y + 60, [['volume-slash', t('Tắt chuông', 'Mute')]]);
pill(PX, y + 8, (x, yy) => avatar(x, yy, 24, 'QT'), SAMPLE.person, t('Gọi đến', 'Incoming'), GREEN, 1);
note(t('pill: ảnh người gọi (KDE Connect gửi kèm, không có thì ống nghe xanh), tên, "Gọi đến" xanh;', 'pill: caller photo (KDE Connect sends it along; without one, a green handset), name, "Incoming" in green;'), PX, y + 50);
note(t('kind call (95, cần bạn): đứng trước mọi thứ, card mở ngay và ở lại tới khi điện thoại thôi đổ chuông.', 'kind call (95, needs you): ahead of everything, the card opens at once and stays till the phone stops ringing.'), PX, y + 64);
note(t('Tắt chuông: điện thoại im (GSConnect muteCall), pill thành "Đã tắt chuông", card đóng. Nghe, từ chối: trên', 'Mute: the phone goes silent (GSConnect muteCall), the pill becomes "Silenced", the card closes. Answer, decline: on'), PX, y + 86);
note(t('điện thoại: KDE Connect không có lệnh đó. ×: ẩn card, cuộc gọi vẫn đổ chuông.', 'the phone: KDE Connect has no command for them. ×: hides the card, the call keeps ringing.'), PX, y + 100);

// --- 2. a call going on --------------------------------------------------------------------------------
y += 104 + 60;
title(t('2 · Đang gọi: đồng hồ chạy tới khi cúp máy', '2 · On a call: the clock runs till hang-up'), 16, y - 26);
cr.newPath(); rr(16, y, KW, 56, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
head(16, y, (x, yy) => { avatar(x, yy, 40, 'QT'); badge(x + 26, yy + 26); }, SAMPLE.person, t('Đang gọi · Redmi Note 14 · 3:42', 'On a Call · Redmi Note 14 · 3:42'));
pill(PX, y + 12, greenPhone, SAMPLE.person, '3:42', GREEN, 1);
note(t('pill: ống nghe xanh, tên, đồng hồ xanh từ lúc nghe máy (như quay màn hình); hover: card không nút.', 'pill: green handset, name, green clock from pick-up (like screen recording); hover: a card with no buttons.'), PX, y + 52);
note(t('Hết khi cúp máy (GSConnect gỡ thông báo). Không flash "cuộc gọi kết thúc".', 'Ends at hang-up (GSConnect removes the notification). No "call ended" flash.'), PX, y + 66);

// --- 3. a reply in the card -----------------------------------------------------------------------------
y += 56 + 60;
title(t('3 · Trả lời ngay trong card (đã chốt ở design/compact)', '3 · Reply right in the card (decided in design/compact)'), 16, y - 26);
cr.newPath(); rr(16, y, KW, 136, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
head(16, y, (x, yy) => { avatar(x, yy, 40, 'QT'); badge(x + 26, yy + 26); }, SAMPLE.person, t('Zalo · Redmi Note 14 · bây giờ', 'Zalo · Redmi Note 14 · now'));
close(16, y);
text('Tối nay họp lúc 8 giờ nhé, nhớ mang bản vẽ.', 30, y + 64, {sz: SUB, a: .85, max: KW - 28});
buttons(16, y + 92, [['arrow-shape-turn-up-left', t('Trả lời', 'Reply')], [null, 'Đánh dấu đã đọc']]);
const cx = PX;
cr.newPath(); rr(cx, y, KW, 136, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
head(cx, y, (x, yy) => { avatar(x, yy, 40, 'QT'); badge(x + 26, yy + 26); }, SAMPLE.person, t('Zalo · Redmi Note 14 · bây giờ', 'Zalo · Redmi Note 14 · now'));
close(cx, y);
text('Tối nay họp lúc 8 giờ nhé, nhớ mang bản vẽ.', cx + 14, y + 64, {sz: SUB, a: .85, max: KW - 28});
fill(C.FILL2, cx + 12, y + 92, KW - 24 - 40, 32, 16);
cr.newPath(); rr(cx + 12, y + 92, KW - 24 - 40, 32, 16); cr.setSourceRGBA(...C.ACCENT, 1); cr.setLineWidth(2); cr.stroke();
text('Ok, mình đến lúc 8 giờ', cx + 26, y + 100, {sz: SUB});
fill(1, cx + KW - 44, y + 92, 32, 32, 16, C.CREAM); icon('arrow-right', cx + KW - 36, y + 100, 16, 1, [0, 0, 0]);
note(t('Nút Trả lời khi app trên điện thoại cho trả lời (Zalo, Messenger, SMS của Google Messages…): KDE Connect gửi mã', 'A Reply button when the phone app allows replies (Zalo, Messenger, Google Messages SMS…): KDE Connect sends a reply'), 16, y + 146);
note(t('trả lời, Buoy gửi chữ qua GSConnect (replyNotification) — không mở cửa sổ. Ô nhập, Gửi, Esc, "Đã gửi", lỗi: như design/compact.', 'id, Buoy sends the text through GSConnect (replyNotification) — no window opens. Entry, Send, Esc, "Sent", errors: as design/compact.'), 16, y + 160);

// --- 4. the Phone tab ----------------------------------------------------------------------------------
y += 136 + 210 - 130;
title(t('4 · Tab Điện thoại: ba cột, như tab Thiết bị', '4 · Phone tab: three columns, like the Devices tab'), 16, y - 26);
function panel(x, py, selected = true) {
    cr.newPath(); rr(x, py, PW, PH, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    fill(C.FILL1, x + 12, py + 12, 320, 32, 16);
    ['house', 'music-note', 'bell', 'calendar', 'display'].forEach((n, i) => icon(n, x + 24 + i * 36, py + 20, 16, C.FG_MUTED));
    if (selected) {
        fill(C.FILL3, x + 196, py + 14, 132, 28, 14);
        icon('smartphone', x + 206, py + 20, 16); text(t('Điện thoại', 'Phone'), x + 228, py + 19, {sz: SUB, wt: 600});
    }
    fill(C.FILL1, x + PW - 44, py + 12, 32, 32, 16); icon('gear', x + PW - 36, py + 20, 16, C.FG_MUTED);
}
panel(16, y);
// its head: the phone, its battery, Find My Phone
icon('smartphone', 16 + 22, y + 60, 16);
const hn = text('Redmi Note 14', 16 + 44, y + 59, {wt: 600});
cr.save(); cr.translate(16 + 52 + hn.width, y + 60);
cr.newPath(); rr(.5, 3, 12.5, 10, 3); rr(2, 4.5, 9.5, 7, 1.5); cr.setFillRule(cairo.FillRule.EVEN_ODD); cr.setSourceRGBA(1, 1, 1, 1); cr.fill();
cr.setFillRule(cairo.FillRule.WINDING); fill(1, 14, 6.25, 1.5, 3.5, .75); fill(1, 3.5, 6, 5, 4, .75); cr.restore();
text('77%', 16 + 72 + hn.width, y + 59, {wt: 600});
const fl = t('Tìm điện thoại', 'Find My Phone'), fe = text(fl, 0, 0, {sz: SUB, wt: 600, measure: true});
fill(C.FILL2, 16 + PW - 22 - fe.width - 34, y + 54, fe.width + 34, 28, 14);
icon('magnifier', 16 + PW - 22 - fe.width - 24, y + 60, 16); text(fl, 16 + PW - 22 - fe.width, y + 60, {sz: SUB, wt: 600});
const cw = (PW - 24 - 16) / 3;
const cols = [
    {t: t('Cuộc gọi', 'Calls'), n: 2, rows: [[greenPhone, SAMPLE.person, '3:42', true], [(x, yy) => icon('handset-arrow-in', x + 4, yy + 4, 16), 'Mẹ', t('Gọi nhỡ · 10 phút', 'Missed call · 10 min'), false]]},
    {t: t('Tin nhắn', 'Messages'), n: 2, rows: [[(x, yy) => avatar(x + 4, yy + 4, 16, ''), SAMPLE.person, 'Zalo · Tối nay họp lúc 8…', false, true], [(x, yy) => icon('comment', x + 4, yy + 4, 16), 'Vietcombank', t('Tin nhắn · Ma OTP cua…', 'Messages · Ma OTP cua…'), false]]},
    {t: t('Khác', 'Other'), n: 1, rows: [[(x, yy) => fill(1, x + 4, yy + 4, 16, 16, 8, [0, .69, .31]), 'Tài xế đã đến', 'Grab · 59X1-234.56', false]]},
];
cols.forEach((g, i) => {
    const x = 16 + 12 + i * (cw + 8);
    text(`${g.t.toUpperCase()}  ${g.n}`, x + 10, y + 96, {sz: 7.5, wt: 600, a: C.FG_SUBTLE});
    g.rows.forEach(([lead, name, sub, green, reply], j) => {
        const ry = y + 114 + j * 64;
        fill(C.FILL1, x, ry, cw, 58, 16);
        lead(x + 8, ry + 6);
        text(name, x + 36, ry + 11, {wt: 600, max: cw - 72});
        if (reply) {
            fill(C.FILL2, x + cw - 36, ry + 8, 24, 24, 12); icon('arrow-shape-turn-up-left', x + cw - 32, ry + 12, 16);
        }
        text(sub, x + 12, ry + 36, {sz: SUB, a: green ? 1 : C.FG_MUTED, rgb: green ? GREEN : [1, 1, 1], max: cw - 24, tnum: true});
    });
});
// the empty states
const ex = 16 + PW + 48;
panel(ex, y);
drawBu(cr, 'idle', ex + PW / 2 - 26, y + 70, 4);
const t1 = t('Cần GSConnect để thấy điện thoại', 'Needs GSConnect to see your phone');
text(t1, ex + PW / 2 - text(t1, 0, 0, {measure: true}).width / 2, y + 150, {a: C.FG_MUTED});
const b1 = t('Cài GSConnect', 'Install GSConnect'), be = text(b1, 0, 0, {sz: SUB, wt: 600, measure: true});
fill(C.FILL2, ex + PW / 2 - be.width / 2 - 20, y + 178, be.width + 40, 32, 16);
text(b1, ex + PW / 2 - be.width / 2, y + 186, {sz: SUB, wt: 600});
note(t('Trống: Bu và đúng chỗ đang kẹt như dòng Điện thoại trong prefs (cài, bật, ghép đôi, nối) với nút giúp;', 'Empty: Bu and exactly where it is stuck, as the Phone row in prefs (install, enable, pair, connect), with a button to help;'), ex, y + PH + 10);
note(t('đã sẵn sàng mà chưa có gì: "Không có cuộc gọi hay tin nhắn mới".', 'ready but nothing yet: "No calls or messages".'), ex, y + PH + 24);
let ny = y + PH + 10;
note(t('Đầu tab: điện thoại, pin, Tìm điện thoại. Ba cột từ thông báo của điện thoại trong danh sách GNOME: cuộc gọi', "Tab head: phone, battery, Find My Phone. Three columns from the phone's notifications in GNOME's list: calls"), 16, ny);
note(t('(đang có, đồng hồ xanh; gọi nhỡ), tin nhắn (SMS, Zalo, Messenger…), khác; mới nhất trên, 2 ô một cột ở 1920, "+N".', '(ongoing, green clock; missed), messages (SMS, Zalo, Messenger…), other; newest on top, 2 tiles a column at 1920, "+N".'), 16, ny + 14);
note(t('Bấm ô: như bấm thông báo. Nút Trả lời: trang có tin nhắn, ô nhập và Gửi. Tab trong ⋯ (như Hẹn giờ), tự lên', 'Click a tile: as clicking the notification. Reply button: a page with the message, an entry and Send. Tab in ⋯ (like Timer), it comes up to'), 16, ny + 28);
note(t('thanh tab khi có cuộc gọi; bấm ô điện thoại ở Home mở tab này.', 'the tab bar during a call; clicking the phone tile in Home opens this tab.'), 16, ny + 42);
surf.writeToPNG(out);
