// Expanded at 1920 (560 wide, r 28): Home with a 56 head (tab strip 32, concentric), rows of 32 up to w/2 = 280;
// and the transient without tabs (the greeting) with a 88 head (leading 56 at pad 16, concentric) (2026-11-09).
// Heights on 56 + 16n like the compact; ask and alert are compact-sized since 2026-11-10 (Ethan).
// gjs -m expanded.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, GREY, drawBu} from '../../render/lib.js';
const EW = 560, R = 28, W = 1120, H = 340;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, pt, wt, col, a = 1, measure = false) { const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(pt * Pango.SCALE); d.set_weight(wt);
  L.set_font_description(d); const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
  L.set_text(t, -1); if (!measure) { cr.setSourceRGBA(...col, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); } return L.get_pixel_extents()[1]; }
function rr(x, y, w, h, r) { cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath(); }
const W1 = C.WHITE, G = GREY.MUTED;
const right = (t, xr, y, pt, col, a) => { const e = text(t, 0, 0, pt, 400, col, a, true); text(t, xr - e.width, y, pt, 400, col, a); };
function panel(x, y, w, h) { rr(x + .5, y + .5, w - 1, h - 1, R - .5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke(); }
function guides(x, y, w, ys, col = [.4, .8, 1]) { cr.setDash([2, 3], 0); cr.setSourceRGBA(...col, .45); cr.setLineWidth(1);
  for (const gy of ys) { cr.moveTo(x + 6, y + gy + .5); cr.lineTo(x + w - 6, y + gy + .5); } cr.stroke(); cr.setDash([], 0); }
function tile(x, y, s, r, c0, c1) { const g = new cairo.LinearGradient(x, y, x + s, y + s); g.addColorStopRGB(0, ...c0); g.addColorStopRGB(1, ...c1); cr.setSource(g); rr(x, y, s, s, r); cr.fill(); }
// Bu at 50 (5 px cells): the real grids, pose wave as the greeting shows it
const bu = (x, y, cell) => drawBu(cr, 'wave', x, y, cell);

// A) Home, 560 × 280 = 56 + 7 × 32
{
  const x = 20, y = 30, h = 280; panel(x, y, EW, h);
  text('Home (có tab) — 560 × 280 = 56 + 7×32 (= rộng/2)', x, 8, 9, 600, W1, .85);
  // tab strip: 32 high at 12 from the top = concentric with r 28 (28 − 12 = 16 = 32/2)
  const sx = x + 12, sy = y + 12, tabs = 5, sw = 32 + 4 * 30 + 80;
  cr.setSourceRGBA(1, 1, 1, C.FILL2); rr(sx, sy, sw, 32, 16); cr.fill();
  cr.setSourceRGBA(1, 1, 1, C.FILL3); rr(sx + 3, sy + 3, 82, 26, 13); cr.fill();
  cr.setSourceRGB(1, 1, 1); rr(sx + 14, sy + 9, 14, 14, 3); cr.fill(); text('Home', sx + 34, sy + 7, 9.5, 600, W1);
  for (let k = 0; k < tabs - 1; k++) { cr.setSourceRGBA(1, 1, 1, C.FG_MUTED); rr(sx + 92 + k * 30, sy + 9, 14, 14, 3); cr.fill(); }
  cr.setDash([2, 2], 0); cr.setSourceRGBA(1, .45, .45, .6); cr.arc(x + R, y + R, R - .5, Math.PI, 1.5 * Math.PI); cr.stroke();
  cr.arc(sx + 16, sy + 16, 16, Math.PI, 1.5 * Math.PI); cr.stroke(); cr.setDash([], 0);
  guides(x, y, EW, [56, 88, 120, 152, 184, 216, 248]);
  const rows = [['sec', 'Now'], ['row', 'Lumen Coast', 'Harbor Lights', '1:24'], ['row', 'Claude Code · buoy', 'Waiting for approval', 'now'],
    ['sec', 'Up next'], ['row', 'Weekly sync with design team', '3:00 PM – 4:00 PM', 'in 25 min'], ['row', 'Dentist', '5:30 PM', ''], ['row', 'Missed · 2', 'Download finished · Copied', '']];
  rows.forEach(([k, a, b, c], i) => { const ry = y + 56 + i * 32;
    if (k === 'sec') { text(a, x + 20, ry + 10, 8.5, 600, W1, .55); return; }
    tile(x + 20, ry + 4, 24, 6, [.95, .55, .35], [.35, .25, .75]);
    text(a, x + 54, ry + 2, 9.5, 600, W1); text(b, x + 54, ry + 16, 8, 400, G); if (c) right(c, x + EW - 20, ry + 9, 8.5, W1, .5); });
}
{
  const x = 600, y = 210, h = 88; panel(x, y, 380, h);
  text('Lời chào (greeting, transient, không tab) — 88, chỉ phần đầu', x, 188, 9, 600, W1, .85);
  bu(x + 19, y + 19, 5);   // Bu straight on the island's black, no tile (design/colours: Bu only on black)
  text('Good afternoon, Ethan', x + 88, y + 25, 14, 700, W1);
}
// notes
['• Cao = nội dung, luôn thuộc 56 + 16n như compact; Home 56 + 32n vì mỗi hàng 32', '• Cao tối đa = rộng/2 làm tròn xuống 56 + 16n: 280 · 344 · 376 (1920 · 2560 · 3440)',
 '• Expanded chỉ khi bấm (có tab) hoặc transient; alert và ask ở cỡ compact',
 '• Tab strip 32 ở lề 12 → bo 16 đồng tâm với góc r 28', '• Không tab: leading 56 ở lề 16 → bo 12 đồng tâm với r 28']
  .forEach((t, i) => text(t, 600, 40 + i * 20, 9, 400, W1, .85));
surf.writeToPNG(ARGV[0]);
