// A notification arrives as an alert (design/alerts-and-asks, decided 2026-11-12, Ethan), as
// GNOME 50's banner does (ui/messageTray.js _showNotification, _expandBanner): the card comes up
// on its pill without buttons for 5 s, the app's buttons on hover, then back to the pill with the
// notification's full title. gjs -m notification.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon} from '../../render/lib.js';
const out = ARGV[0];
const W = 24 + 4 * 404 + 3 * 28 + 24, H = 360;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf); cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
const W1 = C.WHITE, SUB = 9.35;
function text(t, x, y, {sz = 11, wt = 400, rgb = W1, a = 1, maxW = 0, lines = 1, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_width(maxW ? maxW * Pango.SCALE : -1); L.set_wrap(Pango.WrapMode.WORD);
    L.set_height(maxW ? -lines : -1); L.set_ellipsize(maxW ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    const e = L.get_pixel_extents()[1];
    if (!measure) { cr.setSourceRGBA(...rgb, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); }
    L.set_width(-1); L.set_height(-1);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (rgba, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgba); cr.fill(); };
function shape(x, y, w, h, r) { cr.newPath(); rr(x + .5, y + .5, w - 1, h - 1, r); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke(); }
function avatar(x, y) {
    const g = new cairo.LinearGradient(x, y, x + 40, y + 40); g.addColorStopRGB(0, .55, .8, .65); g.addColorStopRGB(1, .2, .4, .6);
    cr.newPath(); rr(x, y, 40, 40, 10); cr.setSource(g); cr.fill();
    fill([0, 0, 0, 1], x + 24, y + 24, 18, 18, 5); fill([.45, .2, .5, 1], x + 26, y + 26, 14, 14, 3.5);
}
const BODY = 'Pushed the pill shapes to the branch — can you review the compact and the card before the 3 PM sync?';
// the card: head 56, body lines of 16 from 8 under it, then (on hover) the button row
function card(x, y, {buttons = false, shared = false, hold = ''} = {}) {
    const lines = shared ? 0 : 2, h = 56 + (lines ? 8 + 16 * lines : 0) + (buttons ? 12 + 32 + 12 : 8), w = 404;
    shape(x, y, w, h, 28);
    if (shared) { fill([1, 1, 1, C.FILL2], x + 14, y + 8, 40, 40, 10); fill([.45, .2, .5, 1], x + 25, y + 19, 18, 18, 4.5); }
    else avatar(x + 14, y + 8);
    text(shared ? 'Slack' : 'Mira Vale', x + 66, y + 10, {wt: 600});
    text(shared ? 'Thông báo mới · bây giờ' : 'Slack · #design · bây giờ', x + 66, y + 30, {sz: SUB, a: C.FG_MUTED});
    cr.newPath(); cr.setSourceRGBA(1, 1, 1, C.FILL2); cr.arc(x + w - 30, y + 28, 16, 0, 2 * Math.PI); cr.fill(); icon(cr, 'xmark', x + w - 38, y + 20, 16);
    if (lines) text(BODY, x + 14, y + 64, {sz: SUB, a: .85, maxW: w - 28, lines});
    if (buttons) {
        const by = y + h - 12 - 32, bw = (w - 24 - 8) / 2;
        ['Reply', 'Mark as read'].forEach((t, i) => {
            fill([1, 1, 1, C.FILL2], x + 12 + i * (bw + 8), by, bw, 32, 16);
            const e = text(t, 0, 0, {wt: 600, measure: true}); text(t, x + 12 + i * (bw + 8) + (bw - e.width) / 2, by + 7, {wt: 600});
        });
    }
    if (hold) text(hold, x, y + h + 8, {sz: 8, a: .7});
    return h;
}
function pill(cx, y, label) {
    const e = text(label, 0, 0, {wt: 600, measure: true}), pw = Math.max(133, 8 + 24 + 8 + e.width + 8), x = cx - pw / 2;
    shape(x, y, pw, 32, 16);
    fill([.45, .2, .5, 1], x + 10, y + 6, 20, 20, 5);
    text(label, x + 40, y + 7, {wt: 600});
}
const xs = [0, 1, 2, 3].map(i => 24 + i * (404 + 28)), TOP = 46;
const heads = ['1 · Tới: card tự mở trên pill, không nút (5 s)', '2 · Rê chuột: hiện hàng nút, giữ lại', '3 · Hết 5 s: thu về pill, tiêu đề đầy đủ', '4 · Đang chia sẻ màn hình: chỉ tên app'];
heads.forEach((t, i) => text(t, xs[i], 14, {sz: 9, wt: 700}));
card(xs[0], TOP, {hold: 'Như banner GNOME: tên, nguồn, 2 dòng thân; × vẫn có. Cao 104.'});
card(xs[1], TOP, {buttons: true, hold: 'Như banner GNOME khi rê chuột: hiện nút của app. Cao 152; đếm giờ dừng.'});
pill(xs[2] + 202, TOP, 'New message from Mira Vale');
text('Pill: tiêu đề đầy đủ của thông báo, như app gửi (không sửa riêng cho app nào);', xs[2], TOP + 44, {sz: 8, a: .7});
text('rê chuột mở lại card, có nút.', xs[2], TOP + 60, {sz: 8, a: .7});
card(xs[3], TOP, {shared: true, hold: 'Như hiện nay (NOTIFICATIONS §5): không tên người, không thân.'});
['v0.1: thông báo chỉ là pill (tiêu đề, 6 s); muốn đọc nội dung hay bấm nút phải rê chuột vào pill.',
 'GNOME 50 (ui/messageTray.js _showNotification, ui/messageList.js NotificationMessage): banner hiện ngay tiêu đề và một dòng thân; rê chuột vào thì',
 'mở rộng (thân tới 6 dòng) và hiện nút (_expandBanner); khẩn cấp hoặc "force-expanded" thì mở rộng sẵn. Ẩn sau 4 s, chỉ tính khi người dùng đang thao tác.',
 'Thông báo là một alert: card tự mở 5 s, không nút; rê chuột thì hiện nút và giữ; rồi về pill. Khẩn cấp: card có nút, ở đến khi xử lý.',
].forEach((l, i) => text(l, 24, 250 + i * 18, {sz: 8.5, a: i ? .8 : .95}));
surf.writeToPNG(out);
