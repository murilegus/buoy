// The decided card (2026-11-09): the compact head (avatar 40 + app badge, sender over "App · time",
// × round 32) and a full-width body: message from the left pad, buttons inset 12, 32 tall, r 16.
// Height = 56 + 8 + lines × 16 + 12 + 32 + 12 (2026-11-10, compact on 56 + 16n): 136 for one line,
// 152 for two; body ≤ 2 lines of 16, 8 under the head and 12 above the buttons in every card.
// gjs -m card-final.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, GREY, icon} from '../../render/lib.js';
const R = 28, PAD = 14, LEAD = 40, TX = PAD + LEAD + 12, PW = 340, W = 760;
const W1 = C.WHITE, G = GREY.MUTED, G2 = GREY.MUTED;   // subtitle and body: fg-muted
const cards = [
  {avatar: true, msg: 'Pushed the pill shapes to the branch — can you review the compact and the card before the 3 PM sync?', buttons: ['Reply', 'Mark as read'], note: 'ảnh đại diện + logo app'},
  {avatar: true, msg: 'On my way, 5 min.', buttons: ['Reply', 'Mark as read'], note: '1 dòng + nút'},
  {avatar: false, app: 'Files', title: 'Download finished', msg: 'buoy-0.1.2.zip — 84 kB', buttons: ['Open', 'Show in folder'], note: 'không có ảnh: logo app 40, không huy hiệu'},
  {avatar: true, msg: 'Pushed the pill shapes to the branch. Can you review the compact, the card and the expanded Home before the 3 PM sync? I left notes in DECISIONS.md and the renders are next to it.', buttons: ['Reply', 'Mark as read'], note: 'tin dài: cắt ở 2 dòng'},
];
// measure at 1× (hinted, as on screen)
const meas = new cairo.Context(new cairo.ImageSurface(cairo.Format.ARGB32, 4, 4));
const ML = PangoCairo.create_layout(meas); PangoCairo.context_set_resolution(ML.get_context(), 96);
function setup(L, pt, wt, wrapW = 0, maxLines = 0) { const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(pt * Pango.SCALE); d.set_weight(wt);
  L.set_font_description(d); L.set_attributes(new Pango.AttrList()); L.set_width(wrapW ? wrapW * Pango.SCALE : -1); L.set_wrap(Pango.WrapMode.WORD_CHAR);
  L.set_ellipsize(maxLines ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE); L.set_height(maxLines ? -maxLines : -1); }
const bodyW = PW - 2 * PAD - 4;
for (const c of cards) { setup(ML, 9.5, 400, bodyW, 2); ML.set_text(c.msg, -1); c.lines = ML.get_line_count(); c.h = 56 + 8 + c.lines * 16 + 12 + 32 + 12; }
const H = cards.reduce((a, c) => a + c.h + 26, 20);
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, pt, wt, col, a = 1, wrapW = 0, maxLines = 0, measure = false) { setup(L, pt, wt, wrapW, maxLines); L.set_text(t, -1);
  if (!measure) { cr.setSourceRGBA(...col, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); } return L.get_pixel_extents()[1]; }
function rr(x, y, w, h, r) { cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath(); }
function grad(x, y, s, r, c0, c1) { const g = new cairo.LinearGradient(x, y, x + s, y + s); g.addColorStopRGB(0, ...c0); g.addColorStopRGB(1, ...c1); cr.setSource(g); rr(x, y, s, s, r); cr.fill(); }
let y = 20;
for (const c of cards) {
  const x = 20, h = c.h;
  rr(x + .5, y + .5, PW - 1, h - 1, R - .5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();
  const lx = x + PAD, ly = y + 8;
  if (c.avatar) {
    grad(lx, ly, LEAD, 10, [.55, .8, .65], [.2, .4, .6]);
    rr(lx + 24, ly + 24, 18, 18, 5); cr.setSourceRGB(0, 0, 0); cr.fill();               // the badge's ring cut from the avatar
    cr.setSourceRGB(.3, .55, .95); rr(lx + 26, ly + 26, 14, 14, 3.5); cr.fill();
  } else {
    grad(lx, ly, LEAD, 10, [.95, .75, .3], [.85, .5, .2]);
  }
  text(c.avatar ? 'Mira Vale' : c.title, x + TX, y + 9, 11, 600, W1);
  text(c.avatar ? 'Slack · 2 min' : `${c.app} · now`, x + TX, y + 29, 9.5, 400, G);
  cr.setSourceRGBA(1, 1, 1, C.FILL2); cr.arc(x + PW - PAD - 16, y + R, 16, 0, 2 * Math.PI); cr.fill();
  icon(cr, 'xmark', x + PW - PAD - 16 - 8, y + R - 8, 16, W1);
  // the body: lines of 16 (Pango's spacing makes up the rest of each line), 8 under the head
  const by = y + h - 12 - 32, bw = (PW - 24 - 8) / 2;
  const lh = text('Ag', 0, 0, 9.5, 400, G2, 1, 0, 0, true).height;
  setup(L, 9.5, 400, bodyW, 2); L.set_spacing(Math.round((16 - lh) * Pango.SCALE)); L.set_text(c.msg, -1);
  cr.setSourceRGBA(...G2, 1); cr.moveTo(x + PAD + 2, y + 56 + 8 + (16 - lh) / 2); PangoCairo.show_layout(cr, L); L.set_spacing(0);
  c.buttons.forEach((t, k) => { cr.setSourceRGBA(1, 1, 1, C.FILL2); rr(x + 12 + k * (bw + 8), by, bw, 32, 16); cr.fill();
    const e = text(t, 0, 0, 9.5, 600, W1, 1, 0, 0, true); text(t, x + 12 + k * (bw + 8) + (bw - e.width) / 2, by + 16 - e.height / 2, 9.5, 600, W1); });
  text(`${c.note}\n${c.lines} dòng · ${PW}×${h}`, x + PW + 16, y + 10, 8.5, 400, W1, .75);
  y += h + 26;
}
surf.writeToPNG(ARGV[0]);
