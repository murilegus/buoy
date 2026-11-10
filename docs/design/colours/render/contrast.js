// High contrast (design/colours): the same Home normally and with GNOME's high contrast on —
// borders 12 % → 50 % (as gnome-shell-sass _default-colors.scss, $contrast == 'high'), fg-subtle
// 50 % → 70 % (= fg-muted), fg-disabled 28 % → 50 %. Fills stay. gjs -m contrast.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC} from '../../render/lib.js';
const out = ARGV[0];

const W = 760, H = 330;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);
function text(s, x, y, {sz = 9, wt = 400, a = 1} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
    L.set_text(s, -1); cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L);
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (a, x, y, w, h, r) => { rr(x, y, w, h, r); cr.setSourceRGBA(1, 1, 1, a); cr.fill(); };
const ratio = a => { const v = a * 255 / 255, c = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return ((c + 0.05) / 0.05).toFixed(1); };

function home(X, title, {border, subtle, disabled}) {
    text(title, X, 12, {sz: 10, wt: 700});
    const Y = 34, PW = 356, PH = 280;
    rr(X + .5, Y + .5, PW - 1, PH - 1, 28); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, border); cr.setLineWidth(1); cr.stroke();
    fill(.12, X + 12, Y + 12, PW - 24, 32, 16);
    fill(.20, X + 16, Y + 16, 72, 24, 12); text('Home', X + 34, Y + 20, {wt: 600});
    text('Nhạc', X + 104, Y + 20, {a: .7}); text('Lịch', X + 152, Y + 20, {a: .7});
    text('ĐANG PHÁT', X + 20, Y + 58, {sz: 7.5, wt: 700, a: subtle});
    fill(.08, X + 12, Y + 74, PW - 24, 64, 16);
    fill(.12, X + 20, Y + 82, 48, 48, 12);
    text('Lofi Beats', X + 80, Y + 84, {sz: 10, wt: 600});
    text('Chillhop Music', X + 80, Y + 101, {a: .7});
    text('1:24 / 3:05', X + 80, Y + 117, {sz: 8, a: subtle});
    text('TẢI VỀ', X + 20, Y + 152, {sz: 7.5, wt: 700, a: subtle});
    text('Bản nháp.pdf', X + 24, Y + 170, {wt: 600}); text('2,4 MB · 12 giây trước', X + 24, Y + 186, {sz: 8, a: subtle});
    fill(.12, X + 12, Y + 210, 64, 28, 14); text('Xoá', X + 32, Y + 216, {a: .7});
    rr(X + 84.5, Y + 210.5, 40, 27, 8); cr.setSourceRGBA(1, 1, 1, border === .12 ? .28 : .7); cr.stroke();
    text('⌘B', X + 95, Y + 216, {sz: 8, wt: 600, a: subtle});
    text('Không còn gì khác', X + 20, Y + 250, {a: disabled});
    text(`viền ${Math.round(border * 100)} % · chữ phụ ${Math.round(subtle * 100)} % (${ratio(subtle)}:1) · chữ tắt ${Math.round(disabled * 100)} %`,
        X + 150, Y + 250, {sz: 7, a: .5});
}
home(16, 'Thường', {border: .12, subtle: .5, disabled: .28});
home(388, 'Tương phản cao', {border: .5, subtle: .7, disabled: .5});
surf.writeToPNG(out);
