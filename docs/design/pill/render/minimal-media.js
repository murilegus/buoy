// The media minimal pill at its max width (336 at 1920): today (pad 14, text 13 px) vs the
// decided pill (pad 8, text 1em, leading in a 24 box) (2026-11-09). gjs -m minimal-media.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC} from '../../render/lib.js';
const W = 600, H = 120, PW = 336;
const TITLE = 'MƯA TUYỆT VỌNG REMIX - KHẢI ĐĂNG X ĐẠT G';
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function setup(size, px, wt, maxW) { const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_weight(wt);
  if (px) d.set_absolute_size(size * Pango.SCALE); else d.set_size(size * Pango.SCALE); L.set_font_description(d); L.set_attributes(new Pango.AttrList());
  L.set_width(maxW ? Math.floor(maxW) * Pango.SCALE : -1); L.set_ellipsize(maxW ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE); }
function rr(x, y, w, h, r) { cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath(); }
function pill(y, {pad, box, art, artR, size, px, gap, label}) {
  const x = 16; rr(x + .5, y + .5, PW - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
  const bx = x + pad, ax = bx + (box - art) / 2, ay = y + (32 - art) / 2;
  const g = new cairo.LinearGradient(ax, ay, ax + art, ay + art); g.addColorStopRGB(0, .3, .35, .6); g.addColorStopRGB(1, .7, .4, .5); cr.setSource(g); rr(ax, ay, art, art, artR); cr.fill();
  const eqW = 3 * 4 + 2 * 2, ex = x + PW - pad - eqW;                    // 4 bars 3 wide, gap 2 (.buoy-eq-bar 3×12)
  [8, 12, 6, 10].forEach((hh, i) => { cr.setSourceRGB(1, 1, 1); rr(ex + i * 4.33, y + 16 - hh / 2, 3, hh, 1.5); cr.fill(); });
  const tx = bx + box + gap, tw = ex - gap - tx;
  setup(size, px, 600, tw); L.set_text(TITLE, -1); const e = L.get_pixel_extents()[1];
  cr.setSourceRGB(1, 1, 1); cr.moveTo(tx, y + Math.round((32 - e.height) / 2)); PangoCairo.show_layout(cr, L);
  const shown = L.get_line(0).length;                                       // bytes, so count chars instead
  setup(8, false, 400, 0); L.set_text(`${label} · chữ có ${Math.round(tw)} px`, -1); cr.setSourceRGBA(1, 1, 1, .8); cr.moveTo(x + PW + 12, y + 9); PangoCairo.show_layout(cr, L);
}
pill(14, {pad: 14, box: 20, art: 20, artR: 6, size: 13, px: true, gap: 8, label: 'hiện tại: lề 14, chữ 13 px'});
pill(66, {pad: 8, box: 24, art: 20, artR: 6, size: 11, px: false, gap: 8, label: 'đã chốt: lề 8, khoảng 8, chữ 1em'});
surf.writeToPNG(ARGV[0]);
