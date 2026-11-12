// Notifications while the screen is shared or recorded (design/alerts-and-asks, decided
// 2026-11-12, Ethan): a burst is one compact (the head 56 only), the apps' logos stacked, the
// count, each app's count; no body, no picture, no buttons. Here Slack ×3, Telegram ×2, Gmail.
// gjs -m shared.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon} from '../../render/lib.js';
const out = ARGV[0];
const W = 24 + 404 + 40 + 131 * 3 + 16 + 24, H = 170;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf); cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
const W1 = C.WHITE, SUB = 9.35;
function text(t, x, y, {sz = 11, wt = 400, a = 1} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    cr.setSourceRGBA(...W1, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L);
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (rgba, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgba); cr.fill(); };
function shape(x, y, w, h, r) {
    cr.newPath(); rr(x + .5, y + .5, w - 1, h - 1, r); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke();
}
// stand-ins for the apps' logos (not state colours)
const APPS = {Slack: [.45, .2, .5], Telegram: [.2, .6, .9], Gmail: [.85, .3, .25]};
const logo = (x, y, s, c) => fill([...c, 1], x, y, s, s, s / 4);

text('Đợt tin khi đang chia sẻ màn hình: một compact', 24, 12, {sz: 9, wt: 700});
const x = 24, y = 40, w = 404;
shape(x, y, w, 56, 28);
fill([1, 1, 1, C.FILL2], x + 14, y + 8, 40, 40, 10);   // the leading: the apps' logos stacked
logo(x + 20, y + 14, 16, APPS.Slack); logo(x + 32, y + 14, 16, APPS.Telegram); logo(x + 26, y + 26, 16, APPS.Gmail);
text('6 thông báo mới', x + 66, y + 10, {wt: 600});
text('Slack 3 · Telegram 2 · Gmail 1 · bây giờ', x + 66, y + 30, {sz: SUB, a: C.FG_MUTED});
cr.newPath(); cr.setSourceRGBA(1, 1, 1, C.FILL2); cr.arc(x + w - 30, y + 28, 16, 0, 2 * Math.PI); cr.fill();
icon(cr, 'xmark', x + w - 38, y + 20, 16);
text('5 s, rồi về pill; tin tới thêm chỉ đổi số. × chỉ đóng compact.', x, y + 64, {sz: 8, a: .75});
// afterwards: one pill per app, named only
const px = x + w + 40;
text('Sau đó: mỗi app một pill, chỉ tên app', px, 12, {sz: 9, wt: 700});
// the newest first (PRIORITY); the trailing count from 2 on, as in NOTIFICATIONS §2
[['Gmail', 1], ['Telegram', 2], ['Slack', 3]].forEach(([a, n], i) => {
    const bx = px + i * (131 + 8);
    shape(bx, y + 12, 131, 32, 16);
    logo(bx + 10, y + 18, 20, APPS[a]);
    text(a, bx + 40, y + 19, {wt: 600});
    if (n > 1) text(String(n), bx + 131 - 20, y + 19, {wt: 600, a: C.FG_MUTED});
});
['Không thân, không ảnh, không nút; bấm không mở gì (mở app hay tab sẽ lộ nội dung).',
 'Cả đợt tính là bị nhỡ: nội dung bị ẩn nên chưa ai đọc; xem lại trong Bị nhỡ sau khi dừng chia sẻ.',
 'Đèn amber vẫn sáng trong lúc chia sẻ: đèn không lộ gì.'].forEach((l, i) => text(l, 24, 120 + i * 15, {sz: 8, a: .8}));
surf.writeToPNG(out);
