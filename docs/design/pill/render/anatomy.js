// The idle pill with every measure: 133 without lights, 173 with (2026-11-10: an 8 px gap after the leading box). gjs -m anatomy.js out.png
// Everything is drawn at 3× (sharp). Text laid out at 3× is wider than at 1× (unhinted: 85 px at 1×
// is wider at 3×), which pushed the M past the box; so the clock's width is measured at 1× (as on
// a scale-1 screen) and the 3× text is fitted to it with a tiny letter-spacing (≈ −0.25 px a glyph).
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {C} from '../../render/lib.js';
const SC = 3, W = 300, H = 150;
const SUN = ['....Y.....','.Y..Y..Y..','..Y...Y...','....YY....','YY.YYYY.YY','...YYYY...','....YY....','..Y...Y...','.Y..Y..Y..','....Y.....'];
const W1 = [1, 1, 1], CY = [.4, .85, 1], RD = [1, .5, .5];
let cr, L;
function begin(surface, scale) { cr = new cairo.Context(surface); if (scale !== 1) cr.scale(scale, scale);
  L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96); }
function text(t, x, y, pt, wt, col, a = 1, measure = false) { const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(pt * Pango.SCALE); d.set_weight(wt);
  L.set_font_description(d); const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
  L.set_text(t, -1); PangoCairo.update_layout(cr, L); if (!measure) { cr.setSourceRGBA(...col, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); }
  return L.get_pixel_extents()[1]; }
function rr(x, y, w, h, r) { cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath(); }

// the clock's width at 1× (hinted), the width a scale-1 screen gives it
const m1 = new cairo.ImageSurface(cairo.Format.ARGB32, 4, 4); begin(m1, 1);
const CLOCK = '88:88:88 AM', TARGET = text(CLOCK, 0, 0, 11, 600, W1, 1, true).width;

const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
begin(surf, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
// letter-spacing that fits the 3× clock to TARGET (two passes are enough)
function fitted(x, y) {
  let ls = 0, wNow = 0;
  for (let pass = 0; pass < 3; pass++) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(11 * Pango.SCALE); d.set_weight(600); L.set_font_description(d);
    const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); at.insert(Pango.attr_letter_spacing_new(Math.round(ls * Pango.SCALE)));
    L.set_attributes(at); L.set_text(CLOCK, -1); PangoCairo.update_layout(cr, L);
    const [, log] = L.get_extents(); wNow = log.width / Pango.SCALE;
    ls += (TARGET - wNow) / CLOCK.length;
  }
  const [, log] = L.get_extents();
  cr.setSourceRGB(1, 1, 1); cr.moveTo(x, y + Math.round((32 - log.height / Pango.SCALE) / 2)); PangoCairo.show_layout(cr, L);
}
function pill(px, py, lit) {
  const side = lit ? 28 : 8, pw = side + 117 + side;
  rr(px + .5, py + .5, pw - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
  if (lit) { cr.setSourceRGB(...C.AMBER); cr.arc(px + 16, py + 16, 4, 0, 2 * Math.PI); cr.fill(); cr.setSourceRGB(...C.CAM); cr.arc(px + pw - 16, py + 16, 4, 0, 2 * Math.PI); cr.fill(); }
  const x0 = px + side, by = py + 4;
  SUN.forEach((r, yy) => [...r].forEach((c, xx) => { if (c === 'Y') { cr.setSourceRGB(1, .82, .4); cr.rectangle(x0 + 2 + xx * 2, by + 2 + yy * 2, 2, 2); cr.fill(); } }));
  fitted(x0 + 32, py);
  return {px, py, pw, x0, tw: TARGET};
}
const P1 = pill(30, 22, false), P2 = pill(30, 92, true);
L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function box({x0, py}) { cr.setSourceRGBA(...CY, .55); cr.setLineWidth(.5); cr.rectangle(x0 - .25, py + 4 - .25, 117 + .5, 24 + .5); cr.stroke(); }
function dim(a, b, y, t, col = CY, below = false) { cr.setSourceRGBA(...col, .9); cr.setLineWidth(.5);
  cr.moveTo(a, y); cr.lineTo(b, y); cr.moveTo(a, y - 2); cr.lineTo(a, y + 2); cr.moveTo(b, y - 2); cr.lineTo(b, y + 2); cr.stroke();
  const e = text(t, 0, 0, 5, 600, col, 1, true); text(t, (a + b) / 2 - e.width / 2, below ? y + 1 : y - e.height - 1, 5, 600, col); }
function vdim(x, a, b, t) { cr.setSourceRGBA(...RD, .9); cr.setLineWidth(.5); cr.moveTo(x, a); cr.lineTo(x, b); cr.moveTo(x - 2, a); cr.lineTo(x + 2, a); cr.moveTo(x - 2, b); cr.lineTo(x + 2, b); cr.stroke();
  text(t, x + 2, (a + b) / 2 - 4, 5, 600, RD); }
{ const {px, py, pw, x0, tw} = P1; box(P1);
  dim(px, x0, py - 4, '8'); dim(x0, x0 + 24, py - 4, '24'); dim(x0 + 24, x0 + 32, py - 4, '8'); dim(x0 + 32, x0 + 117, py - 4, `${tw}`); dim(x0 + 117, px + pw, py - 4, '8');
  dim(px, px + pw, py + 38, '133 = 8 + 117 + 8  (≈ 9em)', W1, true); vdim(px + pw + 6, py, py + 4, '4'); vdim(px + pw + 6, py + 4, py + 28, '24'); vdim(px + pw + 6, py + 28, py + 32, '4');
  text('← lề ngang 8 (hiện tại 14) →', px + pw + 22, py + 12, 5.5, 400, W1, .8); }
{ const {px, py, pw, x0} = P2; box(P2);
  dim(px, px + 16, py - 4, '16'); dim(px + 16 + 4, x0, py - 4, '8'); dim(x0, x0 + 117, py - 4, 'nội dung 117, không dịch'); dim(px + pw - 16, px + pw, py - 4, '16');
  dim(px, px + pw, py + 38, '173 = 28 + 117 + 28; chấm 8 ở tâm hình tròn đầu', W1, true); }
surf.writeToPNG(ARGV[0]);
