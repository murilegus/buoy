// Symbolic icons in place (design/icons, 2026-11-11): the tab strip (the chosen tab icon + title
// on fill-3, the others icon only at fg-muted), the round buttons (32 with a 16 icon; the main
// action cream with a black icon, the others fill-2 with a white one) and a row of 16. The icons
// come from the system theme: Yaru, else Adwaita, as St looks them up. gjs -m symbolic.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Rsvg from 'gi://Rsvg?version=2.0';
import GLib from 'gi://GLib';
import cairo from 'cairo';
import {SCALE as SC, C} from '../../render/lib.js';
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
const DIRS = ['actions', 'status', 'mimetypes', 'devices', 'apps', 'places', 'categories', 'emblems', 'legacy', 'ui', 'time'];
const THEMES = ['/usr/share/icons/Yaru/scalable', '/usr/share/icons/Adwaita/symbolic'];
function icon(name, x, y, s, rgb = C.WHITE, a = 1) {
    const path = THEMES.flatMap(t => DIRS.map(d => `${t}/${d}/${name}.svg`)).find(p => GLib.file_test(p, GLib.FileTest.EXISTS));
    const m = new cairo.ImageSurface(cairo.Format.ARGB32, s * SC, s * SC);
    const v = new Rsvg.Rectangle(); v.x = 0; v.y = 0; v.width = s * SC; v.height = s * SC;
    Rsvg.Handle.new_from_file(path).render_document(new cairo.Context(m), v);
    cr.save(); cr.scale(1 / SC, 1 / SC); cr.setSourceRGBA(...rgb, a); cr.maskSurface(m, x * SC, y * SC); cr.restore();
}
function dim(a, b, y, t, below = false) {
    cr.newPath(); cr.setSourceRGBA(...CY, .9); cr.setLineWidth(.5);
    cr.moveTo(a, y); cr.lineTo(b, y); cr.moveTo(a, y - 2); cr.lineTo(a, y + 2); cr.moveTo(b, y - 2); cr.lineTo(b, y + 2); cr.stroke();
    text(t, (a + b) / 2 - 4, below ? y + 2 : y - 11, {sz: 6.5, wt: 600, rgb: CY});
}
const panel = (x, y, w, h) => { cr.newPath(); rr(x + .5, y + .5, w - 1, h - 1, 20); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke(); };

// 1. the tab strip
text('Thanh tab', 16, 10, {sz: 10, wt: 700});
panel(16, 34, 376, 64);
const sx = 28, sy = 50;
fill([1, 1, 1, C.FILL2], sx, sy, 352, 32, 16);
fill([1, 1, 1, C.FILL3], sx + 4, sy + 4, 80, 24, 12);
icon('go-home-symbolic', sx + 12, sy + 8, 16);
text('Home', sx + 34, sy + 4, {sz: 9.5, wt: 600, h: 24});
['audio-x-generic-symbolic', 'preferences-system-notifications-symbolic', 'x-office-calendar-symbolic', 'phone-symbolic',
    'alarm-symbolic', 'folder-download-symbolic', 'view-more-symbolic'].forEach((n, i) => icon(n, sx + 96 + i * 36, sy + 8, 16, C.WHITE, C.FG_MUTED));
dim(sx + 4, sx + 84, sy - 6, 'tab chọn'); dim(sx + 96, sx + 112, sy - 6, '16');
text('Cao 32, bo 16. Tab đang chọn: nền fill-3 cao 24 (cách 4), icon 16 và tên 1em 600.', 16, 108, {sz: 7.5, a: .75});
text('Tab khác: chỉ icon 16, fg-muted 70 %, mỗi ô rộng 36; tên là accessible name.', 16, 121, {sz: 7.5, a: .75});

// 2. buttons
text('Nút tròn', 410, 10, {sz: 10, wt: 700});
panel(410, 34, 334, 64);
const BTN = [['media-skip-backward-symbolic', 0], ['media-playback-pause-symbolic', 1], ['media-skip-forward-symbolic', 0], ['window-close-symbolic', 0], ['emblem-system-symbolic', 0]];
BTN.forEach(([n, main], i) => {
    const bx = 426 + i * 44, by = 50;
    cr.newPath();
    if (main) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2);
    cr.arc(bx + 16, by + 16, 16, 0, 2 * Math.PI); cr.fill();
    icon(n, bx + 8, by + 8, 16, main ? C.BLACK : C.WHITE);
});
dim(426, 458, 102, '32', true); dim(478, 494, 102, '16', true);
text('Nút 32, icon 16 ở giữa (cách mép 8). Hành động chính: kem (fill-inverse), icon đen.', 410, 120, {sz: 7.5, a: .75});
text('Còn lại: fill-2, icon trắng; hover fill-3, nhấn fill-4.', 410, 133, {sz: 7.5, a: .75});

// 3. a row
text('Hàng', 16, 150, {sz: 10, wt: 700});
panel(16, 174, 376, 64);
[['object-select-symbolic', 'Edit shapes.js', '12s'], ['media-playback-start-symbolic', 'Run pnpm test', '4s']].forEach(([n, t, r], i) => {
    const ry = 190 + i * 16;
    icon(n, 36, ry, 16, C.WHITE, .9); text(t, 64, ry, {sz: 9.35, a: .85, h: 16});
    const e = text(r, 0, -100, {sz: 9.35}); text(r, 372 - e.width, ry, {sz: 9.35, a: .5, h: 16});
});
text('Icon 16 trong hàng 16, giữa cột leading 40.', 410, 190, {sz: 7.5, a: .75});
text('Icon của Yaru; máy không có Yaru dùng Adwaita.', 410, 203, {sz: 7.5, a: .75});
surf.writeToPNG(out);
