// Expanded at 1920 (560 wide, r 28): Home with a 56 head (tab strip 32, concentric), then design/home, w/2 = 280;
// and the transient without tabs (the greeting) with a 88 head (leading 56 at pad 16, concentric) (2026-11-09).
// Heights on 56 + 16n like the compact; ask and alert are compact-sized since 2026-11-10 (Ethan).
// gjs -m expanded.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, GREY, drawBu, icon} from '../../render/lib.js';
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

// A) Home, 560 × 280: the head 56, then design/home's main card and tiles
{
  const x = 20, y = 30, h = 280; panel(x, y, EW, h);
  text('Home (có tab) — 560 × 280 (= rộng/2): phần đầu 56, thẻ chính, hàng ô (design/home)', x, 8, 9, 600, W1, .85);
  // tab strip: 32 high at 12 from the top = concentric with r 28 (28 − 12 = 16 = 32/2)
  // the strip as in design/icons: the chosen tab fill-3 24 high at 4, icon 16 + name; the others
  // icon only at fg-muted, 36 each (Gravity UI)
  const sx = x + 12, sy = y + 12, others = ['music-note', 'bell-dot', 'calendar', 'smartphone'], sw = 86 + others.length * 36 + 14;
  cr.newPath(); cr.setSourceRGBA(1, 1, 1, C.FILL2); rr(sx, sy, sw, 32, 16); cr.fill();
  cr.setSourceRGBA(1, 1, 1, C.FILL3); rr(sx + 4, sy + 4, 80, 24, 12); cr.fill();
  icon(cr, 'house', sx + 12, sy + 8, 16); text('Home', sx + 34, sy + 7, 9.5, 600, W1);
  others.forEach((n, k) => icon(cr, n, sx + 96 + k * 36, sy + 8, 16, W1, C.FG_MUTED));
  // ⚙ alone at the right of the strip row: round 32, fill-2 (design/home)
  cr.newPath(); cr.setSourceRGBA(1, 1, 1, C.FILL2); cr.arc(x + EW - 28, sy + 16, 16, 0, 2 * Math.PI); cr.fill(); icon(cr, 'gear', x + EW - 36, sy + 8, 16);
  cr.setDash([2, 2], 0); cr.setSourceRGBA(1, .45, .45, .6); cr.arc(x + R, y + R, R - .5, Math.PI, 1.5 * Math.PI); cr.stroke();
  cr.arc(sx + 16, sy + 16, 16, Math.PI, 1.5 * Math.PI); cr.stroke(); cr.setDash([], 0);
  // below the head: Home as design/home (decided 2026-11-11): the main card, 8, a row of tiles 100, 12
  guides(x, y, EW, [56, 160, 168, 268]);
  const cx = x + 12, cw = EW - 24, hy = y + 56, hh = 104, ty = hy + hh + 8, tw = (cw - 3 * 8) / 4;
  cr.newPath(); cr.setSourceRGBA(1, 1, 1, C.FILL1); rr(cx, hy, cw, hh, 16); cr.fill();
  tile(cx + 8, hy + 8, 88, 8, [.95, .55, .35], [.35, .25, .75]);
  text('Lumen Coast', cx + 108, hy + 12, 11, 600, W1); text('Harbor Lights · Mira Vale', cx + 108, hy + 32, 9.35, 400, G);
  cr.newPath(); cr.setSourceRGBA(1, 1, 1, C.FILL3); rr(cx + 108, hy + 70, cw - 122, 4, 2); cr.fill();
  cr.setSourceRGB(1, 1, 1); rr(cx + 108, hy + 70, (cw - 122) * .38, 4, 2); cr.fill();
  [['forward-step-fill', 0], ['pause-fill', 1], ['backward-step-fill', 0]].forEach(([n, m], i) => {
    const bx = cx + cw - 28 - i * 40, by = hy + 28;
    cr.newPath(); if (m) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2); cr.arc(bx, by, 16, 0, 2 * Math.PI); cr.fill();
    icon(cr, n, bx - 8, by - 8, 16, m ? C.BLACK : W1);
  });
  [['bu', '2 / 3', 'Claude Code'], ['calendar', '3:00', 'Design review'], ['arrow-down-to-line', '42%', 'report.pdf'], ['ellipsis-vertical', '+2', 'xem tất cả']].forEach(([ic, v, c], i) => {
    const tx = cx + i * (tw + 8);
    cr.newPath(); cr.setSourceRGBA(1, 1, 1, C.FILL1); rr(tx, ty, tw, 100, 16); cr.fill();
    if (ic === 'bu') drawBu(cr, 'busy', tx + 12, ty + 12, 2); else icon(cr, ic, tx + 14, ty + 14, 16);
    text(v, tx + 12, ty + 40, 16.5, 600, W1); text(c, tx + 12, ty + 68, 9.35, 400, G);
  });
}
{
  const x = 600, y = 210, h = 88; panel(x, y, 380, h);
  text('Lời chào (greeting, transient, không tab) — 88, chỉ phần đầu', x, 188, 9, 600, W1, .85);
  bu(x + 19, y + 19, 5);   // Bu straight on the island's black, no tile (design/colours: Bu only on black)
  text('Good afternoon, Ethan', x + 88, y + 25, 14, 700, W1);
}
// notes
['• Cao = nội dung, luôn thuộc 56 + 16n như compact; mọi tab mở ở cao tối đa', '• Cao tối đa = rộng/2 làm tròn xuống 56 + 16n: 280 · 344 · 376 (1920 · 2560 · 3440)',
 '• Expanded chỉ khi bấm (có tab) hoặc transient; alert và ask ở cỡ compact',
 '• Tab strip 32 ở lề 12 → bo 16 đồng tâm với góc r 28', '• Không tab: leading 56 ở lề 16 → bo 12 đồng tâm với r 28']
  .forEach((t, i) => text(t, 600, 40 + i * 20, 9, 400, W1, .85));
surf.writeToPNG(ARGV[0]);
