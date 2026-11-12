// Side padding 4 / 6 / 8 / 10 / 14 around the same 115 px content (gap 6 after the leading, 2026-11-12); dashed = 4 px concentric inset (2026-11-09).
// gjs -m pad.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, fit, width1x, colourIcon} from '../../render/lib.js';
const rows = [[4, 'pad 4 — ô 24 đồng tâm đầu bo, đều 4 mọi phía'], [6, 'pad 6'], [8, 'pad 8'], [10, 'pad 10'], [14, 'pad 14 — hiện tại']];
const W = 560, ROW = 44, CX = 140, CONTENT = 24 + 6 + 85;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, ROW * rows.length * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);
function font(sz, wt) { const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt); L.set_font_description(d);
  const a = new Pango.AttrList(); a.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(a); }
function rr(x, y, w, h, r) { cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath(); }
rows.forEach(([p, note], i) => {
  const py = i * ROW + 6, pw = CONTENT + 2 * p, px = Math.round(CX - pw / 2);
  rr(px + .5, py + .5, pw - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
  cr.setDash([2, 2], 0); rr(px + 4.5, py + 4.5, pw - 9, 23, 11.5); cr.setSourceRGBA(1, .45, .45, .8); cr.stroke(); cr.setDash([], 0);
  const zx = px + p, by = py + 4;
  cr.setSourceRGBA(.4, .8, 1, .8); cr.rectangle(zx + .5, by + .5, 23, 23); cr.stroke();
  colourIcon(cr, 'daypart-noon', zx, by, 24);   // the leading fills its 24 box
  font(11, 600); L.set_text('88:88:88 PM', -1); fit(L, cr, width1x(L.get_font_description(), '88:88:88 PM')); const th = L.get_pixel_extents()[1].height;
  cr.setSourceRGB(1, 1, 1); cr.moveTo(zx + 24 + 6, py + Math.round((32 - th) / 2)); PangoCairo.show_layout(cr, L);
  font(8, 400); PangoCairo.update_layout(cr, L); cr.setSourceRGBA(1, 1, 1, .75); L.set_text(`${pw}×32  ${note}`, -1); cr.moveTo(240, py + 9); PangoCairo.show_layout(cr, L);
});
surf.writeToPNG(ARGV[0]);
