// Reply in the notification card (decided 2026-11-11): the button row becomes a one-line field
// with Send, same height, so the card keeps 56 + 16n. Four states: the card, Reply pressed (empty,
// Send off), typing (Send on), sent. Only for a source that takes a reply (a phone's messages
// through GSConnect): GNOME Shell's notifications have no inline reply (notificationDaemon.js,
// GetCapabilities). gjs -m reply.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon} from '../../render/lib.js';
const out = ARGV[0];

const R = 28, PW = 340, H1 = 136, W = 2 * PW + 3 * 24 + 220, TOP = 34, GAP = 70;
const H = TOP + 2 * (H1 + GAP) + 10;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 9.5, wt = 400, rgb = C.WHITE, a = 1, measure = false, maxW = 0} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
    L.set_width(maxW ? maxW * Pango.SCALE : -1); L.set_ellipsize(maxW ? Pango.EllipsizeMode.START : Pango.EllipsizeMode.NONE);
    L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    const e = L.get_pixel_extents()[1];
    if (!measure) { cr.setSourceRGBA(...rgb, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); }
    L.set_width(-1); L.set_ellipsize(Pango.EllipsizeMode.NONE);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (a, x, y, w, h, r) => { rr(x, y, w, h, r); cr.setSourceRGBA(1, 1, 1, a); cr.fill(); };
const mid = (t, y, h, o) => y + (h - text(t, 0, 0, {...o, measure: true}).height) / 2;
// Send: a 32 circle with arrow-right (design/icons)
function send(cx, cy, on) {
    cr.newPath(); if (on) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2);
    cr.arc(cx, cy, 16, 0, 2 * Math.PI); cr.fill();
    if (on) icon(cr, 'arrow-right', cx - 8, cy - 8, 16, C.BLACK); else icon(cr, 'arrow-right', cx - 8, cy - 8, 16, C.WHITE, C.FG_DISABLED);
}
function card(x, y, title, row) {
    rr(x + .5, y + .5, PW - 1, H1 - 1, R - .5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke();
    text(title, x, y - 22, {sz: 9, wt: 600, a: .85});
    // head 56: avatar 40 (an illustration) with the app's badge, name, source · time, ×
    const g = new cairo.LinearGradient(x + 14, y + 8, x + 54, y + 48); g.addColorStopRGB(0, .55, .8, .65); g.addColorStopRGB(1, .2, .4, .6);
    cr.setSource(g); rr(x + 14, y + 8, 40, 40, 10); cr.fill();
    rr(x + 38, y + 32, 18, 18, 5); cr.setSourceRGB(0, 0, 0); cr.fill();
    cr.setSourceRGB(.3, .55, .95); rr(x + 40, y + 34, 14, 14, 3.5); cr.fill();   // the app's logo: not a state colour
    text('Mira Vale', x + 66, y + 9, {sz: 11, wt: 600});
    text('Tin nhắn · Pixel 8 · 2 min', x + 66, y + 29, {rgb: C.WHITE, a: C.FG_MUTED});
    fill(C.FILL2, x + PW - 46, y + 12, 32, 32, 16); icon(cr, 'xmark', x + PW - 38, y + 20, 16);
    // body: one line, from the leading column (design/compact)
    text('On my way, 5 min.', x + 14, y + 56 + 8, {a: C.FG_MUTED});
    row(x, y + 56 + 8 + 16 + 12);
}
const bw = (PW - 24 - 8) / 2;
const buttons = (x, by) => ['Reply', 'Mark as read'].forEach((t, k) => {
    fill(C.FILL2, x + 12 + k * (bw + 8), by, bw, 32, 16);
    const e = text(t, 0, 0, {wt: 600, measure: true}); text(t, x + 12 + k * (bw + 8) + (bw - e.width) / 2, by + (32 - e.height) / 2, {wt: 600});
});
// the field: from the button row's left edge to Send, r 16 like the buttons (28 − 12)
function field(x, by, {value = '', caret = true, focus = true} = {}) {
    const fw = PW - 24 - 32 - 8;
    fill(C.FILL2, x + 12, by, fw, 32, 16);
    if (focus) { rr(x + 13, by + 1, fw - 2, 30, 15); cr.setSourceRGBA(...C.ACCENT, .8); cr.setLineWidth(2); cr.stroke(); }
    const o = {maxW: fw - 28};
    if (value) {
        const e = text(value, x + 26, mid(value, by, 32, o), o);
        if (caret) { cr.setSourceRGB(1, 1, 1); cr.rectangle(x + 26 + Math.min(e.width, fw - 28) + 1, by + 9, 1.5, 14); cr.fill(); }
    } else {
        if (caret) { cr.setSourceRGB(1, 1, 1); cr.rectangle(x + 26, by + 9, 1.5, 14); cr.fill(); }
        text('Trả lời Mira…', x + 30, mid('Trả lời Mira…', by, 32, {}), {a: C.FG_SUBTLE});
    }
    send(x + PW - 12 - 16, by + 16, Boolean(value));
}
const xs = [24, 24 + PW + 24];
const y1 = TOP + 24, y2 = y1 + H1 + GAP;
card(xs[0], y1, '1 · Card: hai nút của tin nhắn', x => buttons(x, y1 + 92));
card(xs[1], y1, '2 · Bấm Reply: hàng nút thành ô nhập, Gửi tắt', x => field(x, y1 + 92));
card(xs[0], y2, '3 · Đang gõ: Gửi sáng (kem), Enter cũng gửi', x => field(x, y2 + 92, {value: 'Ok, mình đợi ở sảnh nhé'}));
card(xs[1], y2, '4 · Đã gửi: một dòng xác nhận, card đóng sau 2 s', x => {
    const by = y2 + 92;
    icon(cr, 'check', x + 18, by + 8, 16);
    text('Đã gửi: Ok, mình đợi ở sảnh nhé', x + 40, mid('Đã gửi', by, 32, {}), {a: C.FG_SUBTLE, maxW: PW - 60});
});
// notes on the right
const nx = xs[1] + PW + 24;
[
    'Cao giữ nguyên: ô nhập thay hàng nút,', 'cùng 32 → 136 (1 dòng) / 152 (2 dòng).', '',
    'Ô nhập: fill-2, bo 16 như nút; focus là', 'vòng accent 2 px. Một dòng; dài thì', 'cuộn, giữ phần cuối.', '',
    'Gửi: tròn 32, cuối hàng. Rỗng: fill-2,', 'mũi tên mờ. Có chữ: kem (nút chính).', '',
    'Esc: về hai nút, giữ chữ đã gõ đến khi', 'card đóng. Bấm ra ngoài: như Esc.', '',
    'Đang gõ: compact không thu lại khi chuột', 'rời, đếm giờ đóng card dừng lại.', '',
    'Lỗi: dòng 4 ghi "Không gửi được" và', 'nút Thử lại; chữ còn nguyên.',
].forEach((l, i) => text(l, nx, y1 + i * 13, {sz: 7.5, a: .75}));
text('Chỉ khi nguồn nhận được trả lời (tin nhắn điện thoại qua GSConnect). Thông báo của app desktop như Slack chỉ có nút Reply mở app: GNOME Shell không hỗ trợ trả lời ngay trong thông báo.',
    24, H - 22, {sz: 7.5, a: .7});
surf.writeToPNG(out);
