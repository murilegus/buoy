// Compact/card bodies: indented under the text column (empty under the leading) vs using that column (2026-11-09).
// gjs -m body.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, taskState, icon, C, GREY, drawBu} from '../../render/lib.js';
const R = 28, PAD = 14, LEAD = 40, IND = 12, PW = 340, TX = PAD + LEAD + IND;   // text column at 66
const W = 1120, colX = [20, 520];
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, 760 * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function font(pt, wt) { const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(pt * Pango.SCALE); d.set_weight(wt); L.set_font_description(d);
  const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at); }
function text(t, x, y, pt, wt, col, a = 1, measure = false, wrapW = 0) { font(pt, wt); L.set_width(wrapW ? wrapW * Pango.SCALE : -1); L.set_wrap(Pango.WrapMode.WORD);
  L.set_text(t, -1); if (!measure) { cr.setSourceRGBA(...col, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); }
  const e = L.get_pixel_extents()[1]; const n = L.get_line_count(); L.set_width(-1); return {...e, width: e.width, height: e.height, lines: n}; }
function rr(x, y, w, h, r) { cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath(); }
const W1 = C.WHITE, G = GREY.MUTED, G2 = GREY.MUTED;   // design/colours: fg-muted
const right = (t, xr, y, pt, a) => { const e = text(t, 0, 0, pt, 400, W1, a, true); text(t, xr - e.width, y, pt, 400, W1, a); };
const snap = h => 56 + Math.ceil(Math.max(0, h - 56) / 32) * 32;
function panel(x, y, h) { rr(x + .5, y + .5, PW - 1, h - 1, R - .5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve(); cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke(); }
function waste(x, y, h) { cr.setSourceRGBA(1, .35, .35, .18); cr.rectangle(x + PAD, y + 56, LEAD, h - 56 - 10); cr.fill(); }
function art(x, y, s, r = 10, c = [[.95, .55, .35], [.35, .25, .75]]) { const g = new cairo.LinearGradient(x, y, x + s, y + s); g.addColorStopRGB(0, ...c[0]); g.addColorStopRGB(1, ...c[1]); cr.setSource(g); rr(x, y, s, s, r); cr.fill(); }
function head(x, y, t1, t2, c, btn = '⏸') { if (c === 'bu') drawBu(cr, 'busy', x + PAD, y + 8, 4); else art(x + PAD, y + 8, LEAD, 10, c); text(t1, x + TX, y + 9, 11, 600, W1); text(t2, x + TX, y + 29, 9.5, 400, G);
  roundBtn(x + PW - PAD - 16, y + R, btn); }
// the head's button (design/icons): its main action (⏸ pause-fill, ■ stop-fill) is fill-inverse,
// cream with a black icon; × (xmark) is fill-2 with a white one; the icon 16 in the middle
const GLYPH = {'⏸': 'pause-fill', '■': 'stop-fill', '×': 'xmark'};
function roundBtn(cx, cy, btn) { const main = btn !== '×';
  cr.newPath(); if (main) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2); cr.arc(cx, cy, 16, 0, 2 * Math.PI); cr.fill();
  icon(cr, GLYPH[btn], cx - 8, cy - 8, 16, main ? C.BLACK : W1); }
function bar(x, y, x0, x1) { cr.setSourceRGBA(1, 1, 1, C.FILL3); rr(x0, y, x1 - x0, 4, 2); cr.fill(); cr.setSourceRGB(1, 1, 1); rr(x0, y, (x1 - x0) * .38, 4, 2); cr.fill();
  text('1:24', x0, y + 7, 8.5, 400, W1, .5); right('-2:11', x1, y + 7, 8.5, .5); }
const label = (t, x, y) => text(t, x, y, 9, 600, W1, .85);
const NOTI = 'Pushed the pill shapes to the branch — can you review the compact and the card before the 3 PM sync?';
const CARD = [[.3, .55, .95], [.3, .55, .95]];
let y = 30;
label('Hiện tại — thân thụt theo cột chữ (đỏ = chỗ trống)', colX[0], 8); label('Đề xuất — dùng cột dưới leading', colX[1], 8);
// 1) media + bar
{ const h = 88;
  let x = colX[0]; panel(x, y, h); head(x, y, 'Lumen Coast', 'Harbor Lights · Spotify'); bar(x, y + 64, x + TX, x + PW - PAD); waste(x, y, h);
  x = colX[1]; panel(x, y, h); head(x, y, 'Lumen Coast', 'Harbor Lights · Spotify'); bar(x, y + 64, x + PAD + 6, x + PW - PAD - 6);
  text('thanh dài hết bề ngang', x + PW + 8, y + 60, 8, 400, W1, .6); y += h + 22; }
// 1b) media, big art spanning head + bar
{ const h = 88, x = colX[1]; label('…hoặc ảnh bìa 72 chiếm cả hai hàng', x, y - 16); panel(x, y, h);
  art(x + 8, y + 8, 72, 20); const tx = x + 8 + 72 + 12;   // inset 8 → r 28 − 8 = 20, concentric
  text('Lumen Coast', tx, y + 10, 11, 600, W1); text('Harbor Lights · Spotify', tx, y + 30, 9.5, 400, G);
  roundBtn(x + PW - PAD - 16, y + R, '⏸');
  bar(x, y + 60, tx, x + PW - PAD - 6); y += h + 30; }
// 2) rows: Claude's task list (2026-11-11), on the 16 rhythm: 56 + 8 + 3 × 16 + 8 = 120
{ const h = 120, rows = [['done', 'Edit shapes.js', '12s'], ['doing', 'Run pnpm test', '4s'], ['todo', 'Update the docs', '']];
  const row = (x, ry, a, b, k) => { const e = text(a, 0, 0, 9.5, 400, G2, 1, true); text(a, x + TX, ry + 8 - e.height / 2, 9.5, 400, G2, k === 'todo' ? .55 : 1);
    if (b) { const r = text(b, 0, 0, 9.5, 400, W1, .5, true); right(b, x + PW - PAD, ry + 8 - r.height / 2, 9.5, .5); } };
  let x = colX[0]; panel(x, y, h); head(x, y, 'Claude Code', 'buoy · 2 / 3', 'bu', '■'); waste(x, y, h);
  rows.forEach(([k, a, b], j) => row(x, y + 64 + j * 16, a, b, k));
  x = colX[1]; panel(x, y, h); head(x, y, 'Claude Code', 'buoy · 2 / 3', 'bu', '■');
  rows.forEach(([k, a, b], j) => { const ry = y + 64 + j * 16; taskState(cr, k, x + PAD + LEAD / 2 - 8, ry, 16); row(x, ry, a, b, k); });
  text('check xong · play-fill đang làm · circle chờ, dưới leading', x + PW + 8, y + 76, 8, 400, W1, .6, false, 140); y += h + 22; }
// 3) card
{ let x = colX[0];
  const nI = text(NOTI, 0, 0, 9.5, 400, G2, 1, true, PW - PAD - TX).lines, hI = snap(56 + nI * 16 + 6 + 28 + 12);
  panel(x, y, hI); head(x, y, 'Mira Vale', 'Slack · 2 min', CARD, '×'); waste(x, y, hI);
  text(NOTI, x + TX, y + 56, 9.5, 400, G2, 1, false, PW - PAD - TX);
  { const by = y + hI - 12 - 28, bw = (PW - PAD - TX - 8) / 2;
    ['Reply', 'Mark as read'].forEach((t, k) => { cr.setSourceRGBA(1, 1, 1, C.FILL2); rr(x + TX + k * (bw + 8), by, bw, 28, 14); cr.fill();
      const e = text(t, 0, 0, 9.5, 600, W1, 1, true); text(t, x + TX + k * (bw + 8) + (bw - e.width) / 2, by + 6, 9.5, 600, W1); }); }
  text(`${nI} dòng · ${hI}`, x + PW + 8, y + 10, 8, 400, W1, .6);
  x = colX[1];
  const nF = text(NOTI, 0, 0, 9.5, 400, G2, 1, true, PW - 2 * PAD - 4).lines, hF = snap(56 + nF * 16 + 6 + 32 + 12);
  panel(x, y, hF); head(x, y, 'Mira Vale', 'Slack · 2 min', CARD, '×');
  text(NOTI, x + PAD + 2, y + 56, 9.5, 400, G2, 1, false, PW - 2 * PAD - 4);
  { const by = y + hF - 12 - 32, bw = (PW - 24 - 8) / 2;   // inset 12, h 32, r 16 = concentric with r 28
    ['Reply', 'Mark as read'].forEach((t, k) => { cr.setSourceRGBA(1, 1, 1, C.FILL2); rr(x + 12 + k * (bw + 8), by, bw, 32, 16); cr.fill();
      const e = text(t, 0, 0, 9.5, 600, W1, 1, true); text(t, x + 12 + k * (bw + 8) + (bw - e.width) / 2, by + 8, 9.5, 600, W1); });
    cr.setDash([2, 2], 0); cr.setSourceRGBA(1, .45, .45, .6); cr.setLineWidth(1);
    cr.newSubPath(); cr.arc(x + R, y + hF - R, R - .5, Math.PI / 2, Math.PI); cr.stroke(); cr.newSubPath(); cr.arc(x + 12 + 16, by + 16, 16, Math.PI / 2, Math.PI); cr.stroke(); cr.setDash([], 0); }
  text(`${nF} dòng · ${hF}; nút cách 12, cao 32 → bo 16 đồng tâm góc`, x + PW + 8, y + 10, 8, 400, W1, .6, false, 140);
  y += Math.max(hI, hF) + 20; }
// crop to what was drawn
const out = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, y * SC);
const bc = new cairo.Context(out); bc.setSourceSurface(surf, 0, 0); bc.paint();
out.writeToPNG(ARGV[0]);
