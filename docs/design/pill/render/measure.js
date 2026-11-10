// Text widths in Pango: the clock, daypart, weather, and next-event titles in the idle cap (2026-11-09).
// gjs -m measure.js   (prints; no image)
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
const L = PangoCairo.create_layout(new cairo.Context(new cairo.ImageSurface(cairo.Format.ARGB32, 4, 4)));
PangoCairo.context_set_resolution(L.get_context(), 96);
function setFont(family, weight, size, px) { const d = Pango.FontDescription.from_string(family); d.set_weight(weight);
  if (px) d.set_absolute_size(size * Pango.SCALE); else d.set_size(size * Pango.SCALE); L.set_font_description(d);
  const a = new Pango.AttrList(); a.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(a); }
const w = t => { L.set_text(t, -1); return L.get_pixel_extents()[1].width; };
print('== Idle texts');
const texts = ['88:88:88 AM', '88:88:88 PM', '3:06:06 PM', '88:88 AM', 'Afternoon', '34°'];
for (const fam of ['SF Pro Display', 'Ubuntu Sans', 'Adwaita Sans'])
  for (const [lbl, wt, sz, px] of [['13px/600', 600, 13, true], ['11pt/600', 600, 11, false], ['11pt/700', 700, 11, false]]) {
    setFont(fam, wt, sz, px); print(fam.padEnd(15), lbl.padEnd(9), texts.map(t => `${t}=${w(t)}`).join('  '));
  }
print('\n== Next event in the idle cap (minimal max): pad 8, box 24, gaps 7, SF Pro 11pt/600');
setFont('SF Pro Display', 600, 11, false);
const titles = ['Weekly sync with design team', 'Họp giao ban tuần với nhóm thiết kế', 'Dentist', 'Q4 planning — roadmap review and budget'];
const perChar = w(titles[0]) / titles[0].length;
function fit(t, space) { if (w(t) <= space) return t; for (let n = t.length; n > 0; n--) if (w(t.slice(0, n) + '…') <= space) return t.slice(0, n) + '…'; return '…'; }
for (const [scr, cap] of [['1366/1920', 336], ['2560', 430], ['3440', 456]])
  for (const time of ['3:00 PM', 'until 12:30 PM'])
    for (const lights of [0, 40]) {
      const space = cap - lights - 16 - 24 - 14 - w(time);
      print(`${scr.padEnd(9)} cap ${cap}${lights ? ' (lights inside)' : ''}`.padEnd(32), `"${time}"`.padEnd(17), `title ${space}px ≈ ${Math.floor(space / perChar)} chars |`, titles.map(t => fit(t, space)).join(' | '));
    }
