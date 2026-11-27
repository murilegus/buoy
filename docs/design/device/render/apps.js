// Phone via GSConnect, part 2 (design/device "Ứng dụng trên điện thoại", 2026-11-18, Ethan): the
// phone's apps — an OTP code, a Zalo / Messenger message with its sender's picture, a Grab / Be ride.
// gjs -m apps.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, SAMPLE, icon as gicon, t} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, KW = 404;
const W = 1200, H = 600;
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
const icon = (n, x, y, s = 16, a = 1) => gicon(cr, n, x, y, s, [1, 1, 1], a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});
const title = (t, x, y) => text(t, x, y, {sz: 12, wt: 600});
// a sender's picture: round, a gradient (a sample photo)
function avatar(x, y, s, initials) {
    const g = new cairo.LinearGradient(x, y, x + s, y + s);
    g.addColorStopRGB(0, .98, .62, .45); g.addColorStopRGB(1, .55, .32, .78);
    cr.newPath(); cr.arc(x + s / 2, y + s / 2, s / 2, 0, 2 * Math.PI); cr.setSource(g); cr.fill();
    const e = text(initials, 0, 0, {sz: s * .3, wt: 700, measure: true});
    text(initials, x + (s - e.width) / 2, y + (s - e.height) / 2 - 1, {sz: s * .3, wt: 700});
}
// the phone badge at a picture's corner (part 1)
const badge = (x, y) => { fill(1, x, y, 18, 18, 9, [0, 0, 0]); icon('smartphone', x + 2, y + 1, 14); };
// a card's head: picture 40, title, "App · Redmi Note 14 · bây giờ", ×
function head(x, y, pic, t, sub) {
    pic(x + 14, y + 8);
    text(t, x + 66, y + 10, {wt: 600, max: KW - 120});
    text(sub, x + 66, y + 30, {sz: SUB, a: C.FG_MUTED});
    fill(C.FILL2, x + KW - 46, y + 12, 32, 32, 16); icon('xmark', x + KW - 38, y + 20, 16, C.FG_MUTED);
}
function buttons(x, y, labels) {
    const bw = (KW - 24 - 8 * (labels.length - 1)) / labels.length;
    labels.forEach(([ic, l], i) => {
        const bx = x + 12 + i * (bw + 8);
        fill(C.FILL2, bx, y, bw, 32, 16);
        const e = text(l, 0, 0, {sz: SUB, wt: 600, measure: true}), w = (ic ? 22 : 0) + e.width;
        if (ic)
            icon(ic, bx + (bw - w) / 2, y + 8, 16);
        text(l, bx + (bw - w) / 2 + (ic ? 22 : 0), y + 8, {sz: SUB, wt: 600});
    });
}
// a pill: lead (drawn in 24 at x+4), its text, its trailing
function pill(x, y, lead, t, trail = null) {
    const e = text(t, 0, 0, {wt: 600, measure: true, tnum: true});
    const te = trail ? text(trail, 0, 0, {wt: 600, measure: true, tnum: true}) : {width: 0};
    const w = Math.max(131, 8 + 24 + 6 + e.width + (trail ? 12 + te.width : 0) + 12);
    fill(1, x, y, w, 32, 16, [0, 0, 0]);
    lead(x + 4, y + 4);
    text(t, x + 38, y + 8, {wt: 600, tnum: true});
    if (trail)
        text(trail, x + w - 12, y + 8, {wt: 600, a: C.FG_MUTED, right: true, tnum: true});
    return w;
}
const glyph = n => (x, y) => icon(n, x + 4, y + 4, 16);
const PX = 16 + KW + 32;

// --- 1. an OTP code ---------------------------------------------------------------------------------
let y = 40;
title(t('1 · Mã OTP: mã to, nút Sao chép, 30 giây', '1 · OTP code: a big code, a Copy button, 30 seconds'), 16, y - 26);
cr.newPath(); rr(16, y, KW, 152, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
head(16, y, (x, yy) => { fill(C.FILL3, x, yy, 40, 40, 10); icon('comment', x + 10, yy + 10, 20); },
    'Vietcombank', t('Tin nhắn · Redmi Note 14 · bây giờ', 'Messages · Redmi Note 14 · now'));
text('482 913', 30, y + 60, {sz: 22, wt: 700, tnum: true});
text('0:24', 16 + KW - 14, y + 70, {sz: SUB, a: C.FG_MUTED, right: true, tnum: true});
buttons(16, y + 108, [['copy', t('Sao chép mã', 'Copy Code')]]);
pill(PX, y + 8, glyph('key'), '482 913', '0:24');
pill(PX + 230, y + 8, glyph('copy'), t('Đã chép mã', 'Code Copied'));
note(t('pill: chìa khoá + mã, đếm ngược 30 giây rồi tắt, cả khi card còn chờ (tin vẫn trong tab Thông báo)', 'pill: key + code, counts down 30 seconds then ends, even while the card still waits (the message stays in the Notifications tab)'), PX, y + 50);
note(t('bấm Sao chép mã: pill thành "Đã chép mã" 3 giây (icon như module copied)', 'click Copy Code: the pill becomes "Code Copied" for 3 seconds (icon as module copied)'), PX, y + 64);
note(t('Nhận ra mã: 4–8 chữ số đi cùng chữ OTP, mã, code, xác thực, xác minh, verification, G-…', 'Spotting a code: 4–8 digits with the word OTP, mã, code, xác thực, xác minh, verification, G-…'), PX, y + 86);
note('("Ma OTP cua Quy khach la 482913", "G-482913 is your Google verification code").', PX, y + 100);
note(t('Chia sẻ màn hình: không hiện mã, như mọi thông báo lúc đó (chỉ tên app).', 'Screen sharing: no code shown, like every notification then (app name only).'), PX, y + 114);
note(t('Thay nút "Copy 482913" GSConnect tự thêm (nó chỉ bắt đúng 6 số).', 'Replaces the "Copy 482913" button GSConnect adds (it catches exactly 6 digits only).'), PX, y + 128);

// --- 2. Zalo / Messenger: the sender's picture -----------------------------------------------------
y += 152 + 60;
title(t('2 · Zalo, Messenger: ảnh người gửi', '2 · Zalo, Messenger: the sender\'s photo'), 16, y - 26);
cr.newPath(); rr(16, y, KW, 136, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
head(16, y, (x, yy) => { avatar(x, yy, 40, 'QT'); badge(x + 26, yy + 26); }, SAMPLE.person, t('Zalo · Redmi Note 14 · bây giờ', 'Zalo · Redmi Note 14 · now'));
text('Tối nay họp lúc 8 giờ nhé, nhớ mang bản vẽ.', 30, y + 64, {sz: SUB, a: .85, max: KW - 28});
buttons(16, y + 92, [[null, 'Đánh dấu đã đọc']]);
pill(PX, y + 8, (x, yy) => avatar(x, yy, 24, 'QT'), SAMPLE.person);
// a group
const gx = PX + 200;
cr.newPath(); rr(gx, y, 340, 56, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
avatar(gx + 8, y + 8, 40, "TK"); badge(gx + 34, y + 34);
text('Nhóm Thiết kế', gx + 58, y + 8, {wt: 600});
text(`${SAMPLE.short}: Tối nay họp lúc 8 giờ nhé`, gx + 58, y + 28, {sz: SUB, a: C.FG_MUTED, max: 260});
note(t('Ảnh tròn như card thông báo đã chốt (design/compact): ảnh 40, góc dưới là chấm điện thoại', 'A round photo as the decided notification card (design/compact): photo 40, the phone dot in the bottom corner'), PX, y + 86);
note(t('(GSConnect không gửi logo Zalo khi tin có ảnh: KDE Connect gửi largeIcon, tức ảnh người gửi).', '(GSConnect sends no Zalo logo when the message has a photo: KDE Connect sends largeIcon, the sender\'s photo).'), PX, y + 100);
note(t('Nhóm: tên nhóm làm tiêu đề, "Trâm: …" ở thân. Nút của app (Đánh dấu đã đọc…) giữ nguyên.', 'Group: the group name as title, "Trâm: …" in the body. The app\'s buttons (Đánh dấu đã đọc…) stay.'), PX, y + 114);
note(t('Trả lời ngay trong card: PR 3 (cùng Reply SMS).', 'Reply right in the card: PR 3 (with Reply SMS).'), PX, y + 128);

// --- 3. Grab / Be: a ride -----------------------------------------------------------------------------
y += 136 + 60;
title(t('3 · Grab, Be: chuyến xe', '3 · Grab, Be: the ride'), 16, y - 26);
cr.newPath(); rr(16, y, KW, 136, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
head(16, y, (x, yy) => { fill(1, x, yy, 40, 40, 10, [.0, .69, .31]); icon('car', x + 10, yy + 10, 20); },
    'Tài xế đã đến', t('Grab · Redmi Note 14 · bây giờ', 'Grab · Redmi Note 14 · now'));
text('Nguyễn Văn An · Honda Vision trắng', 30, y + 64, {sz: SUB, a: .85, max: KW - 160});
fill(C.FILL3, 16 + KW - 132, y + 58, 118, 28, 8);
text('59X1-234.56', 16 + KW - 73 - text('59X1-234.56', 0, 0, {wt: 700, measure: true, tnum: true}).width / 2, y + 63, {wt: 700, tnum: true});
buttons(16, y + 92, [[null, 'Gọi tài xế'], [null, 'Nhắn tin']]);
pill(PX, y + 8, glyph('car'), 'Tài xế đã đến', '59X1-234.56');
note(t('pill: xe + chữ của app (giữ nguyên, Buoy không đoán câu chữ), biển số ở cuối;', 'pill: car + the app\'s words (kept as is, Buoy does not guess the wording), the plate at the end;'), PX, y + 50);
note(t('ở lại như thông báo thường.', 'stays as a normal notification.'), PX, y + 64);
note(t('Tin có biển số (59X1-234.56, 30A-123.45) là tin chuyến xe: biển số ra ô riêng. Không có: thông báo thường.', 'A message with a plate (59X1-234.56, 30A-123.45) is a ride message: the plate gets its own box. None: a normal notification.'), PX, y + 86);
note(t('Giới hạn: KDE Connect không gửi thông báo "đang diễn ra" (FLAG_ONGOING_EVENT), nên không có', 'Limit: KDE Connect does not send "ongoing" notifications (FLAG_ONGOING_EVENT), so there is no'), PX, y + 108);
note(t('đếm phút xe tới hay bản đồ, chỉ các tin rời rạc.', 'countdown to the car or map, only separate messages.'), PX, y + 122);
surf.writeToPNG(out);
