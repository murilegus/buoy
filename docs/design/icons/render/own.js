// The symbolic icons Buoy draws itself where Gravity UI has none (design/icons, 2026-11-11, Ethan):
// the same 16 grid, strokes 1.5 drawn as fills, frames r 3 outside and r 1.5 inside, round ends.
// Each beside Gravity neighbours at 16, then at real 1× pixels magnified 4. gjs -m own.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Rsvg from 'gi://Rsvg?version=2.0';
import GLib from 'gi://GLib';
import cairo from 'cairo';
import {SCALE as SC, C, icon, t} from '../../render/lib.js';
const out = ARGV[0];
const HERE = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);

const OWN = ['battery', 'battery-full', 'battery-low', 'battery-charging', 'bluetooth'];
const NEAR = ['smartphone', 'thunderbolt', 'calendar', 'gear', 'bell'];
const W = 760, H = 300;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 8, wt = 400, a = 1, rgb = C.WHITE} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    cr.setSourceRGBA(...rgb, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L);
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const path = n => [`${HERE}/own/${n}.svg`, `${HERE}/gravity-ui/${n}.svg`].find(p => GLib.file_test(p, GLib.FileTest.EXISTS));
// the icon at 16 real pixels (a 1× screen), magnified 4 with nearest pixels
function pixels(name, x, y) {
    const m = new cairo.ImageSurface(cairo.Format.ARGB32, 16, 16);
    const v = new Rsvg.Rectangle(); v.x = 0; v.y = 0; v.width = 16; v.height = 16;
    Rsvg.Handle.new_from_file(path(name)).render_document(new cairo.Context(m), v);
    cr.save(); cr.translate(x, y); cr.scale(4, 4);
    cr.setSourceRGBA(1, 1, 1, .06); cr.rectangle(0, 0, 16, 16); cr.fill();
    const p = new cairo.SurfacePattern(m); p.setFilter(cairo.Filter.NEAREST);
    cr.setSourceRGB(1, 1, 1); cr.mask(p); cr.restore();
}

text(t('Icon Buoy tự vẽ theo Gravity UI', "Buoy's own icons in the Gravity UI style"), 16, 12, {sz: 10, wt: 700});
cr.newPath(); rr(16.5, 36.5, W - 33, 63, 20); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke();
[...OWN, null, ...NEAR].forEach((n, i) => {
    if (!n) return;
    const x = 40 + i * 62;
    icon(cr, n, x, 52, 16);
    text(n, x + 8 - n.length * 2.2, 76, {sz: 6.5, a: OWN.includes(n) ? .85 : .5});
});
text(t('Tự vẽ', 'Own drawing'), 40, 104, {sz: 7.5, a: .7}); text(t('Của Gravity, để so nét', "Gravity's, to compare strokes"), 40 + 6 * 62, 104, {sz: 7.5, a: .7});
OWN.forEach((n, i) => pixels(n, 40 + i * 76, 130));
pixels('smartphone', 40 + 5 * 76 + 20, 130); pixels('thunderbolt', 40 + 6 * 76 + 20, 130);
text(t('Ở 1× (phóng 4): khung ở mép .5 ngoài và mép nguyên trong như smartphone của Gravity.', "At 1× (magnified 4): the frame's outer edge on .5 and inner edge on a whole pixel, like Gravity's smartphone."), 16, 206, {sz: 7.5, a: .75});
t(['Lưới 16; nét 1.5 vẽ thành vùng tô (St tô path bằng màu chữ); khung bo ngoài = bo trong + 1.5; đầu nét tròn.',
    'Pin: khung 12.5 × 10 bo 3 ngoài, 1.5 trong; mức pin là thanh bo 0.75; đang sạc là tia sét; đầu cực viên thuốc 1.5 × 3.5.',
    'Bluetooth: chữ rune, trục ở x = 7.75 (một pixel đủ và nửa pixel ở 1×), năm nét 1.5 đầu tròn.'],
['Grid 16; strokes 1.5 drawn as filled areas (St fills the path in the text colour); outer frame radius = inner radius + 1.5; round ends.',
    'Battery: frame 12.5 × 10, radius 3 outside, 1.5 inside; the level is a bar with radius 0.75; charging is a lightning bolt; the terminal a 1.5 × 3.5 pill.',
    'Bluetooth: the rune, its axis at x = 7.75 (one full pixel and a half at 1×), five 1.5 strokes with round ends.']).forEach((l, i) => text(l, 16, 226 + i * 15, {sz: 7.5, a: .75}));
surf.writeToPNG(out);
