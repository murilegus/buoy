// Symbolic icons in place (design/icons, 2026-11-11): the tab strip (the chosen tab icon + title
// on fill-3, the others icon only at fg-muted), the round buttons (32 with a 16 icon; the main
// action cream with a black icon, the others fill-2 with a white one) and a row of 16. The icons
// are Gravity UI's (gravity-ui/, MIT). gjs -m symbolic.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon, t as tr} from '../../render/lib.js';
const out = ARGV[0];

const W = 760, H = 250, CY = [.4, .85, 1];
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 8, wt = 400, rgb = C.WHITE, a = 1, h = 0} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    const e = L.get_pixel_extents()[1];
    cr.setSourceRGBA(...rgb, a); cr.moveTo(x, h ? y + (h - e.height) / 2 : y); PangoCairo.show_layout(cr, L);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (rgba, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgba); cr.fill(); };
const icon = (name, x, y, s, rgb = C.WHITE, a = 1) => gicon(cr, name, x, y, s, rgb, a);
function dim(a, b, y, t, below = false) {
    cr.newPath(); cr.setSourceRGBA(...CY, .9); cr.setLineWidth(.5);
    cr.moveTo(a, y); cr.lineTo(b, y); cr.moveTo(a, y - 2); cr.lineTo(a, y + 2); cr.moveTo(b, y - 2); cr.lineTo(b, y + 2); cr.stroke();
    text(t, (a + b) / 2 - 4, below ? y + 2 : y - 11, {sz: 6.5, wt: 600, rgb: CY});
}
const panel = (x, y, w, h) => { cr.newPath(); rr(x + .5, y + .5, w - 1, h - 1, 20); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke(); };

// 1. the tab strip
text(tr('Thanh tab', 'Tab bar'), 16, 10, {sz: 10, wt: 700});
panel(16, 34, 376, 64);
const sx = 28, sy = 50;
fill([1, 1, 1, C.FILL2], sx, sy, 352, 32, 16);
fill([1, 1, 1, C.FILL3], sx + 4, sy + 4, 80, 24, 12);
icon('house', sx + 12, sy + 8, 16);
text('Home', sx + 34, sy + 4, {sz: 9.5, wt: 600, h: 24});
// the strip of 2026-11-13: Media, Notifications, Calendar, Devices, a live tab (Transfers), ⋯
['music-note', 'bell-dot', 'calendar', 'display',
    'arrow-down-to-line', 'ellipsis-vertical'].forEach((n, i) => icon(n, sx + 96 + i * 36, sy + 8, 16, C.WHITE, C.FG_MUTED));
dim(sx + 4, sx + 84, sy - 6, tr('tab chọn', 'chosen tab')); dim(sx + 96, sx + 112, sy - 6, '16');
text(tr('Cao 32, bo 16. Tab đang chọn: nền fill-3 cao 24 (cách 4), icon 16 và tên 1em 600.', 'Height 32, radius 16. Chosen tab: fill-3, 24 high (inset 4), icon 16 and name 1em 600.'), 16, 108, {sz: 7.5, a: .75});
text(tr('Tab khác: chỉ icon 16, fg-muted 70 %, mỗi ô rộng 36; tên là accessible name.', 'Other tabs: icon 16 only, fg-muted 70 %, each cell 36 wide; the name is the accessible name.'), 16, 121, {sz: 7.5, a: .75});

// 2. buttons
text(tr('Nút tròn', 'Round buttons'), 410, 10, {sz: 10, wt: 700});
panel(410, 34, 334, 64);
const BTN = [['backward-step-fill', 0], ['pause-fill', 1], ['forward-step-fill', 0], ['xmark', 0], ['gear', 0]];
BTN.forEach(([n, main], i) => {
    const bx = 426 + i * 44, by = 50;
    cr.newPath();
    if (main) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2);
    cr.arc(bx + 16, by + 16, 16, 0, 2 * Math.PI); cr.fill();
    icon(n, bx + 8, by + 8, 16, main ? C.BLACK : C.WHITE);
});
dim(426, 458, 102, '32', true); dim(478, 494, 102, '16', true);
tr(['Nút 32, icon 16 ở giữa (cách mép 8). Hành động chính: kem (fill-inverse), icon đen.', 'Còn lại: fill-2, icon trắng; hover fill-3, nhấn fill-4.'],
    ['Button 32, icon 16 centred (8 from the edge).', 'Main action: cream (fill-inverse), black icon.', 'The rest: fill-2, white icon; hover fill-3, pressed fill-4.'])
    .forEach((l, i) => text(l, 410, 120 + i * 13, {sz: 7.5, a: .75}));

// 3. a row
text(tr('Hàng', 'Row'), 16, 150, {sz: 10, wt: 700});
panel(16, 174, 376, 64);
[['check', 'Edit shapes.js', '12s'], ['play-fill', 'Run pnpm test', '4s']].forEach(([n, t, r], i) => {
    const ry = 190 + i * 16;
    icon(n, 36, ry, 16, C.WHITE, .9); text(t, 64, ry, {sz: 9.35, a: .85, h: 16});
    const e = text(r, 0, -100, {sz: 9.35}); text(r, 372 - e.width, ry, {sz: 9.35, a: .5, h: 16});
});
tr(['Icon 16 trong hàng 16, giữa cột leading 40.', 'Icon Gravity UI; nút nhạc và ▶ dùng bản -fill; tab thông báo có tin mới: bell-dot.'],
    ['Icon 16 in a row of 16, centred in a leading column of 40.', 'Gravity UI icons; the music buttons and ▶ use the -fill version;', 'notifications tab with something new: bell-dot.'])
    .forEach((l, i) => text(l, 410, 190 + i * 13, {sz: 7.5, a: .75}));
surf.writeToPNG(out);
