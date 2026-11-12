// Does the idle pill hold with other fonts and sizes? (2026-11-09). gjs -m fonts.js [out.png]
// Prints, per font: clock width with "8" and with each font's widest digit, idle width, line height,
// whether digits are tabular; renders each idle pill straight at 3× when out.png is given (labels fitted to their 1× width).
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE, fit, colourIcon} from '../../render/lib.js';
const FONTS = ['SF Pro Display', 'Ubuntu Sans', 'Noto Sans', 'DejaVu Sans', 'Liberation Sans', 'SF Compact Display'];
const SIZES = [[11, '11pt (1em)'], [13.75, '11pt × 1.25 (chữ lớn)']];
const PT = 96 / 72, EMPX = pt => pt * PT;
const meas = new cairo.Context(new cairo.ImageSurface(cairo.Format.ARGB32, 4, 4));
const ML = PangoCairo.create_layout(meas); PangoCairo.context_set_resolution(ML.get_context(), 96);
function setFont(L, fam, pt) { const d = Pango.FontDescription.from_string(fam); d.set_size(pt * Pango.SCALE); d.set_weight(600); L.set_font_description(d);
  const a = new Pango.AttrList(); a.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(a); }
const w = t => { ML.set_text(t, -1); return ML.get_pixel_extents()[1].width; };
const resolved = fam => { setFont(ML, fam, 11); ML.set_text('8', -1); const f = ML.get_context().load_font(ML.get_font_description()); return f.describe().get_family(); };
// layout in em: pad 0.55em (8), gap 0.41em (6, 2026-11-12), box = 24/14.67 em, the icon filling it (2026-11-11)
const em = pt => EMPX(pt), even = v => 2 * Math.ceil(v / 2);
const rows = [];
for (const [pt, label] of SIZES) for (const fam of FONTS) {
  setFont(ML, fam, pt);
  const digits = [...'0123456789'].map(d => [d, w(d.repeat(6))]);
  const widest = digits.reduce((a, b) => (b[1] > a[1] ? b : a));
  const tabular = digits.every(([, v]) => v === digits[0][1]);
  const clock8 = w('88:88:88 AM'), clockW = w(`${widest[0]}${widest[0]}:${widest[0]}${widest[0]}:${widest[0]}${widest[0]} AM`);
  ML.set_text('Ág', -1); const lineH = ML.get_pixel_extents()[1].height;
  const E = em(pt), pad = Math.round(E * 8 / 14.667), gap = Math.round(E * 6 / 14.667), box = even(E * 24 / 14.667);
  const icon = Math.max(20, Math.floor((box - 4) / 10) * 10);
  const idle = Math.ceil(2 * pad + box + gap + Math.max(clock8, clockW)), h = even(E * 32 / 14.667);
  rows.push({fam, got: resolved(fam), pt, label, clock8, clockW, widest: widest[0], tabular, lineH, pad, gap, box, icon, idle, h});
}
print('font'.padEnd(20), 'size'.padEnd(26), 'clock(8)', 'clock(widest)', 'tnum', 'line', 'box', 'icon', 'idle×h');
for (const r of rows)
  print(`${r.fam}${r.got !== r.fam ? ' →' + r.got : ''}`.padEnd(20), r.label.padEnd(26), String(r.clock8).padEnd(8), `${r.clockW} ('${r.widest}')`.padEnd(13),
    (r.tabular ? 'yes' : 'NO').padEnd(4), String(r.lineH).padEnd(4), String(r.box).padEnd(3), String(r.icon).padEnd(4), `${r.idle}×${r.h}`);
if (ARGV[0]) {
  const SC = SCALE, RH = 50, Wd = 580, Hd = rows.length * RH + 30;
  const s1 = new cairo.ImageSurface(cairo.Format.ARGB32, Wd * SC, Hd * SC); const cr = new cairo.Context(s1); cr.scale(SC, SC);
  cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
  const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
  const rr = (x, y, ww, hh, r) => { cr.newSubPath(); cr.arc(x + ww - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + ww - r, y + hh - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + hh - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath(); };
  rows.forEach((r, i) => {
    const px = 20, py = 10 + i * RH + (RH - r.h) / 2 - 4;
    rr(px + .5, py + .5, r.idle - 1, r.h - 1, r.h / 2 - .5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
    const x0 = px + r.pad, by = py + (r.h - r.box) / 2;
    colourIcon(cr, 'daypart-noon', x0, by, r.box);   // the leading fills its box (design/icons: a vector, grows with em)
    setFont(ML, r.fam, r.pt); const w1 = w('12:59:59 AM');
    setFont(L, r.fam, r.pt); L.set_text('12:59:59 AM', -1); fit(L, cr, w1); const e = L.get_pixel_extents()[1];
    cr.setSourceRGB(1, 1, 1); cr.moveTo(x0 + r.box + r.gap, py + Math.round((r.h - e.height) / 2)); PangoCairo.show_layout(cr, L);
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(8 * Pango.SCALE); L.set_font_description(d); L.set_attributes(new Pango.AttrList()); PangoCairo.update_layout(cr, L);
    L.set_text(`${r.fam}${r.got !== r.fam ? ' → ' + r.got : ''} · ${r.label} · ${r.idle}×${r.h}${r.tabular ? '' : ' · số không đều'}`, -1);
    cr.setSourceRGBA(1, 1, 1, .75); cr.moveTo(px + 230, py + r.h / 2 - 6); PangoCairo.show_layout(cr, L);
  });
  s1.writeToPNG(ARGV[0]);
}
