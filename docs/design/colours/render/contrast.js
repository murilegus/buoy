// High contrast (design/colours): the same Home (design/home) normally and with GNOME's high contrast on —
// borders 12 % → 50 % (as gnome-shell-sass _default-colors.scss, $contrast == 'high'), fg-subtle
// 50 % → 70 % (= fg-muted), fg-disabled 28 % → 50 %. Fills stay. gjs -m contrast.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, EQ, drawBu, drawEq, icon, SAMPLE} from '../../render/lib.js';
const out = ARGV[0];

const W = 16 + 2 * (560 + 16), H = 350;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);
function text(s, x, y, {sz = 9, wt = 400, a = 1, right = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
    L.set_text(s, -1); PangoCairo.update_layout(cr, L); const e = L.get_pixel_extents()[1];
    cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(right ? x - e.width : x, y); PangoCairo.show_layout(cr, L); return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (a, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(1, 1, 1, a); cr.fill(); };
const ratio = a => { const v = a * 255 / 255, c = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return ((c + 0.05) / 0.05).toFixed(1); };

// Home at 1920 (560 × 280): borders on the panel, fg-muted on the tabs and captions, fg-subtle on the
// times and details; fg-disabled is ⏭ when the player has no next track (the Media tab's, not drawn)
function round(cx, cy, name, {main = false, a = 1} = {}) {
    cr.newPath(); if (main) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2);
    cr.arc(cx, cy, 16, 0, 2 * Math.PI); cr.fill(); icon(cr, name, cx - 8, cy - 8, 16, main ? C.BLACK : C.WHITE, a);
}
function home(X, title, {border, subtle, disabled}) {
    text(title, X, 12, {sz: 10, wt: 700});
    const Y = 38, PW = 560, PH = 280;
    cr.newPath(); rr(X + .5, Y + .5, PW - 1, PH - 1, 28); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, border); cr.setLineWidth(1); cr.stroke();
    const sx = X + 12, sy = Y + 12, tabs = ['music-note', 'bell', 'calendar', 'smartphone', 'ellipsis-vertical'];
    fill(C.FILL2, sx, sy, 86 + tabs.length * 36 + 4, 32, 16); fill(C.FILL3, sx + 4, sy + 4, 80, 24, 12);
    icon(cr, 'house', sx + 12, sy + 8, 16); text('Home', sx + 34, sy + 7, {sz: 9.5, wt: 600});
    tabs.forEach((n, k) => icon(cr, n, sx + 96 + k * 36, sy + 8, 16, C.WHITE, C.FG_MUTED));
    round(X + PW - 28, sy + 16, 'gear');
    // the main card
    const cx = X + 12, cy = Y + 56, cw = PW - 24;
    fill(C.FILL1, cx, cy, cw, 104, 16); fill(C.FILL2, cx + 8, cy + 8, 88, 88, 8);
    text(SAMPLE.track, cx + 108, cy + 12, {sz: 11, wt: 600}); text(SAMPLE.sub, cx + 108, cy + 32, {sz: 9.35, a: C.FG_MUTED});
    drawEq(cr, cx + cw - 28 - EQ.width / 2, cy + 28);   // play / pause at rest (design/home "Thẻ nhạc")
    fill(C.FILL3, cx + 108, cy + 66, cw - 122, 4, 2); fill(1, cx + 108, cy + 66, (cw - 122) * .45, 4, 2);
    text('1:24', cx + 108, cy + 78, {sz: 9.35, a: subtle}); text('-1:41', cx + cw - 14, cy + 78, {sz: 9.35, a: subtle, right: true});
    // the row: two tiles and a wide one with a detail column in fg-subtle
    const ty = cy + 112, u = (cw - 2 * 8) / 4;
    [['bu', '2 / 3', 'Claude Code', 1], ['arrow-down-to-line', '42%', 'Bản nháp.pdf', 1], ['calendar', '3:00', 'Design review', 2]].reduce((tx, [ic, v, c, n]) => {
        const w = n * u + (n - 1) * 0;
        fill(C.FILL1, tx, ty, w, 100, 16);
        if (ic === 'bu') drawBu(cr, 'busy', tx + 12, ty + 12, 2); else icon(cr, ic, tx + 14, ty + 14, 16);
        text(v, tx + 12, ty + 40, {sz: 16.5, wt: 600}); text(c, tx + 12, ty + 68, {sz: 9.35, a: C.FG_MUTED});
        if (n === 2) { text('25 phút nữa', tx + w - 14, ty + 44, {sz: 9.35, a: subtle, right: true}); text('phòng 3', tx + w - 14, ty + 62, {sz: 9.35, a: subtle, right: true}); }
        return tx + w + 8;
    }, cx);
    text(`viền ${Math.round(border * 100)} % · chữ phụ ${Math.round(subtle * 100)} % (${ratio(subtle)}:1) · chữ tắt ${Math.round(disabled * 100)} % (⏭ ở tab Media khi không có bài sau)`,
        X, Y + PH + 10, {sz: 7.5, a: .7});
}
home(16, 'Thường', {border: .12, subtle: .5, disabled: .28});
home(16 + 560 + 16, 'Tương phản cao', {border: .5, subtle: .7, disabled: .5});
surf.writeToPNG(out);
