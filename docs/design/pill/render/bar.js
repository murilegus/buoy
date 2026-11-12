// The whole bar, drawn at 3× (zoom in for detail): pill 1 at its widest, side pills, compact and expanded caps (2026-11-09).
// gjs -m bar.js out.png <screen width> [sym|-] [leftC rightC]. Default clusters: measured on Ethan's machine.
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC} from '../../render/lib.js';
const [out, scrW, sym] = [ARGV[0], Number(ARGV[1]), ARGV[2] === 'sym'];   // sym: pill 2 left, pill 3 right
const W = scrW, H = 190, EM = 14.667;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
const bg = new cairo.LinearGradient(0, 0, W, H); bg.addColorStopRGB(0, .22, .2, .38); bg.addColorStopRGB(1, .14, .26, .36); cr.setSource(bg); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, pt, wt, col, a = 1, measure = false) { const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(pt * Pango.SCALE); d.set_weight(wt);
  L.set_font_description(d); const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
  L.set_text(t, -1); if (!measure) { cr.setSourceRGBA(...col, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); } return L.get_pixel_extents()[1]; }
function rr(x, y, w, h, r) { cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath(); }
const W1 = [1, 1, 1], even = v => 2 * Math.round(v / 2);
const expW = even(Math.min(760, Math.max(560, W * .28)));
// cluster widths measured on Ethan's machine (Looking Glass, 2026-11-09): _leftBox 93, _rightBox 293
const leftC = Number(ARGV[3] ?? 93), rightC = Number(ARGV[4] ?? 293), MARGIN = 12, GAP = 8;
const measured = ARGV[3] === undefined;
const idle = 131, minMax = Math.min(even(24 * EM), even(expW * .6)), cmpMax = Math.min(even(28 * EM), even(expW * .72));
for (const [x, w, t] of [[4, leftC, `cụm trái ${leftC}${measured ? '' : ' (giả định)'}`], [W - 4 - rightC, rightC, `_rightBox ${rightC}${measured ? '' : ' (giả định)'}`]]) {
  cr.setSourceRGBA(1, 1, 1, .1); rr(x, 4, w, 32, 16); cr.fill(); text(t, x + 14, 12, 8.5, 400, W1, .7); }
const cx = W / 2, p1x = cx - minMax / 2;
function pill(x, w, label, sub) { rr(x + .5, 4.5, w - 1, 31, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
  cr.setSourceRGB(.95, .6, .4); rr(x + 8, 8, 24, 24, 7); cr.fill(); text(label, x + 38, 11, 11, 600, W1); if (sub) { const e = text(sub, 0, 0, 11, 600, W1, 1, true); text(sub, x + w - 8 - e.width, 11, 11, 600, W1, .55); } }
pill(p1x, minMax, 'Weekly sync with design team', '3:00 PM');
let x = p1x + minMax, lx = p1x;
if (sym) {
  lx = p1x - GAP - idle; if (lx >= 4 + leftC + MARGIN) pill(lx, idle, '', '4:59'); else lx = p1x;
  x += GAP; if (x + idle <= W - 4 - rightC - MARGIN) { pill(x, idle, '', '62%  +2'); x += idle; } else x -= GAP;
} else
  for (let k = 0; k < 2; k++) { x += GAP; if (x + idle > W - 4 - rightC - MARGIN) break; pill(x, idle, '', k === 1 ? '62%  +2' : '4:59'); x += idle; }
cr.setSourceRGBA(1, 1, 1, .5); cr.setLineWidth(1);
const ruler = (a, b, y, t) => { cr.moveTo(a, y + .5); cr.lineTo(b, y + .5); cr.moveTo(a + .5, y - 3); cr.lineTo(a + .5, y + 3); cr.moveTo(b - .5, y - 3); cr.lineTo(b - .5, y + 3); cr.stroke();
  const e = text(t, 0, 0, 8, 400, W1, 1, true); text(t, (a + b) / 2 - e.width / 2, y + 3, 8, 400, W1, .8); };
ruler(p1x, p1x + minMax, 44, `pill 1 rộng tối đa ${minMax} (${(minMax / EM).toFixed(1)}em)`);
ruler(x, W - 4 - rightC, 44, `dư ${W - 4 - rightC - x}`);
ruler(4 + leftC, lx, 44, `dư ${lx - 4 - leftC}`);
text(sym ? 'pill 2 bên trái · pill 3 bên phải' : 'pill 2, 3 bên phải (hiện tại)', W / 2 - 60, H - 34, 9, 600, W1, .85);
cr.setDash([4, 3], 0); cr.setSourceRGBA(1, 1, 1, .55); rr(cx - cmpMax / 2 + .5, 70.5, cmpMax - 1, 87, 27.5); cr.stroke(); cr.setDash([], 0);
text(`compact rộng tối đa ${cmpMax} (${(cmpMax / EM).toFixed(1)}em) × 56 + 16n, tối đa 152`, cx - cmpMax / 2 + 20, 106, 9, 400, W1, .8);
cr.setDash([2, 4], 0); cr.setSourceRGBA(1, .5, .5, .5); rr(cx - expW / 2 + .5, 64.5, expW - 1, H - 66, 27.5); cr.stroke(); cr.setDash([], 0);
text(`expanded rộng ${expW}`, cx - expW / 2 + 12, H - 18, 8.5, 400, [1, .7, .7], .8);
text(`${W} px`, 8, H - 18, 9, 600, W1, .8);
surf.writeToPNG(out);
