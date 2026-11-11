// Dots centred in the end-cap circles (Ø32, r 16), sizes 6 / 8 / 10; pad 8, content at 28 when lit (2026-11-09).
// gjs -m dots.js out.png [guides]
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, fit, width1x, C} from '../../render/lib.js';
const [out, guides] = [ARGV[0], ARGV[1] === 'guides'];
const SUN = ['....Y.....','.Y..Y..Y..','..Y...Y...','....YY....','YY.YYYY.YY','...YYYY...','....YY....','..Y...Y...','.Y..Y..Y..','....Y.....'];
const {AMBER, CAM: GREEN, RED, MIC} = C;   // design/colours
const rows = [[0, null, null, 'không đèn — pad 8'], [6, AMBER, GREEN, 'chấm 6'], [8, AMBER, GREEN, 'chấm 8'], [10, AMBER, GREEN, 'chấm 10'],
  [8, RED, MIC, 'chấm 8 — đỏ (ask) · tím (mic)'], [8, AMBER, null, 'chấm 8 — chỉ một đèn']];
const W = 560, ROW = 44, CX = 140, CONTENT = 24 + 8 + 85, PAD = 8, LIT = 28;
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
const rgb = c => c;
rows.forEach(([d, lt, dt, note], i) => {
  const py = i * ROW + 6, side = d ? LIT : PAD, pw = CONTENT + 2 * side, px = Math.round(CX - pw / 2);
  rr(px + .5, py + .5, pw - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
  if (guides && d) { cr.setDash([2, 2], 0); cr.setSourceRGBA(1, .45, .45, .7);
    for (const c of [px + 16, px + pw - 16]) { cr.arc(c, py + 16, 15.5, 0, 2 * Math.PI); cr.stroke(); }
    cr.setDash([], 0); }
  for (const [col, c] of [[lt, px + 16], [dt, px + pw - 16]]) if (col) { cr.setSourceRGB(...rgb(col)); cr.arc(c, py + 16, d / 2, 0, 2 * Math.PI); cr.fill(); }
  const zx = px + side, by = py + 4;
  if (guides) { cr.setSourceRGBA(.4, .8, 1, .8); cr.rectangle(zx + .5, by + .5, CONTENT - 1, 23); cr.stroke(); }
  SUN.forEach((r, yy) => [...r].forEach((c, xx) => { if (c === 'Y') { cr.setSourceRGB(1, .82, .4); cr.rectangle(zx + 2 + xx * 2, by + 2 + yy * 2, 2, 2); cr.fill(); } }));
  font(11, 600); L.set_text('88:88:88 PM', -1); fit(L, cr, width1x(L.get_font_description(), '88:88:88 PM')); const th = L.get_pixel_extents()[1].height;
  cr.setSourceRGB(1, 1, 1); cr.moveTo(zx + 24 + 8, py + Math.round((32 - th) / 2)); PangoCairo.show_layout(cr, L);
  font(8, 400); PangoCairo.update_layout(cr, L); cr.setSourceRGBA(1, 1, 1, .75); L.set_text(`${pw}×32  ${note}`, -1); cr.moveTo(250, py + 9); PangoCairo.show_layout(cr, L);
});
surf.writeToPNG(out);
