// Screen sharing and recording in Buoy's pill (proposal 2026-11-11): three bars (recording alone;
// with music; while Claude Code asks) and the two compacts on hover, recording and sharing, with
// the Stop button. Real size, drawn at 3×. Symbolic icons, drawn white.
// gjs -m screen.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, fit, width1x, C, drawBu, icon as gicon, SAMPLE} from '../../render/lib.js';
const out = ARGV[0];
// Gravity UI (design/icons): video for recording, display-pulse for sharing, music-note for music
const {RED, CREAM, WALL} = C;

const W = 760, H = 520;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.14, 0.12, 0.24); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);
function font(sz, wt) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); const a = new Pango.AttrList(); a.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(a);
    return d;
}
function text(s, x, y, {sz = 8, wt = 400, a = 0.8, rgb = [1, 1, 1], exact = false} = {}) {
    const d = font(sz, wt); L.set_text(s, -1);
    if (exact) fit(L, cr, width1x(d, s)); else PangoCairo.update_layout(cr, L);
    const [, e] = L.get_pixel_extents();
    cr.setSourceRGBA(...rgb, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L);
    return e;
}
const w1 = (s, sz, wt) => Math.round(width1x(font(sz, wt), s));
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const icon = (name, x, y, s, rgb = [1, 1, 1]) => gicon(cr, name, x, y, s, rgb);
const dot = (cx, cy, rgb) => { cr.setSourceRGB(...rgb); cr.arc(cx, cy, 4, 0, 2 * Math.PI); cr.fill(); };

// a pill: leading 20, gap 8, text 1em 600; min 133 (idle); a light or dot on either end widens both
// ends by 20 (design/pill)
function pill(cx, y, {lead, label, left = null, right = null, bu = false}) {
    const tw = w1(label, 11, 600), inner = Math.max(133 - 16, 20 + 8 + tw), lit = left || right;
    const pw = inner + 16 + (lit ? 40 : 0), x = Math.round(cx - pw / 2);
    rr(x + .5, y + .5, pw - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
    if (left) dot(x + 16, y + 16, left);
    if (right) dot(x + pw - 16, y + 16, right);
    const zx = x + 8 + (lit ? 20 : 0) + Math.round((inner - 20 - 8 - tw) / 2);
    if (bu) drawBu(cr, 'ask', zx + 2, y + 6, 2);   // Bu 20, the ask pose: its lamp red
    else icon(lead, zx + 2, y + 8, 16);
    const e = text(label, zx + 28, 0, {sz: 11, wt: 600, a: 0, exact: true});
    text(label, zx + 28, y + Math.round((32 - e.height) / 2), {sz: 11, wt: 600, a: 1, exact: true});
    return [x, pw];
}
function bar(y, caption) {
    cr.setSourceRGB(...WALL); cr.rectangle(16, y, W - 32, 40); cr.fill();
    text(caption, 16, y + 46, {sz: 8, a: .7});
}

// 1. bars
text('Trên thanh', 16, 12, {sz: 10, wt: 700, a: 1});
bar(32, 'Chỉ quay: pill 1 là bản ghi, đồng hồ chạy; chấm đỏ bên phải.');
pill(W / 2, 36, {lead: 'video', label: '0:42', right: RED});
bar(96, 'Quay và nghe nhạc: bản ghi (55) đứng trước nhạc (10); nhạc sang pill phụ.');
const [px, pw] = pill(W / 2, 100, {lead: 'video', label: '0:42', right: RED});
pill(px + pw + 8 + 133 / 2, 100, {lead: 'music-note', label: '1:24'});
bar(160, 'Claude Code hỏi trong lúc quay: ask (cần bạn) lên pill 1, đèn đỏ trái; bản ghi sang pill phụ; chấm đỏ vẫn ở pill 1.');
const [qx, qw] = pill(W / 2, 164, {bu: true, label: 'Cần trả lời', left: RED, right: RED});
pill(qx + qw + 8 + 133 / 2, 164, {lead: 'video', label: '0:42'});

// 2. compacts on hover
text('Hover: compact', 16, 232, {sz: 10, wt: 700, a: 1});
function compact(x, y, {lead, title, sub, w = 300}) {
    rr(x + .5, y + .5, w - 1, 55, 27.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
    // leading 40 at 14, 8: the fill-2 circle with the icon
    cr.setSourceRGBA(1, 1, 1, .12); cr.arc(x + 34, y + 28, 20, 0, 2 * Math.PI); cr.fill();
    icon(lead, x + 24, y + 18, 20);
    text(title, x + 62, y + 11, {sz: 11, wt: 600, a: 1, exact: true});
    text(sub, x + 62, y + 30, {sz: 9.35, a: .5});
    // Stop: round 32, centre on y = 28, 14 from the edge; fill-inverse, stop-fill in black
    const bx = x + w - 14 - 32;
    cr.newPath(); cr.setSourceRGB(...CREAM); cr.arc(bx + 16, y + 28, 16, 0, 2 * Math.PI); cr.fill();
    icon('stop-fill', bx + 8, y + 20, 16, [0, 0, 0]);
    return bx;
}
const notes = (x, y, lines) => lines.forEach((l, i) => text(l, x, y + i * 13, {sz: 7.5, a: .65}));
const b1 = compact(16, 256, {lead: 'video', title: 'Đang quay màn hình', sub: '0:42 · từ 14:03'});
notes(16, 322, ['Rộng: tối thiểu 16em (240), ở đây theo chữ.', 'Cao 56, chỉ phần đầu; bo 28.',
    'Leading 40: nền fill-2, icon trắng.', 'Tiêu đề 1em 600 fg; dòng dưới 0.85em fg-subtle,', 'đồng hồ chạy và giờ bắt đầu.',
    'Dừng: nút tròn 32, fill-inverse, stop-fill đen;', `cách mép phải 14, tâm y = 28.`]);
compact(400, 256, {lead: 'display-pulse', title: 'Đang chia sẻ màn hình', sub: '12:05 · từ 13:51'});
notes(400, 322, ['Giống hệt, khác icon và chữ.', 'App quay qua portal (OBS…): "Ứng dụng đang quay màn hình".',
    'Không biết tên app: Mutter không đưa tên', '(MetaRemoteAccessHandle chỉ có is-recording).',
    'Dừng tất cả phiên chia sẻ, như nút của GNOME.']);
text('Bấm vào pill (không phải nút Dừng): mở Home, bản ghi là thẻ chính hoặc một ô. Không có tab riêng.', 16, 432, {sz: 8, a: .8});
text('Không đèn trong compact; chấm đỏ trở lại khi compact thu về pill.', 16, 448, {sz: 8, a: .8});
text('Mic và camera không thành activity: chỉ chấm (tím, xanh), bấm mở Home.', 16, 464, {sz: 8, a: .8});
text('Nút của GNOME trên thanh (quay: đỏ, đồng hồ; chia sẻ: cam) ẩn khi module privacy bật.', 16, 480, {sz: 8, a: .8});

surf.writeToPNG(out);
