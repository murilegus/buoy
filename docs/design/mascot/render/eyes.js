// Bu's eyes in the idle pill (131 × 32): the expressions, and the sleep and hold sequences
// (design/mascot "Biểu cảm của mắt", 2026-11-14). Coordinates as kit/model/mascot.js eyesShapes:
// x about the pill's centre, y from its top, px at 1em.
// gjs -m eyes.js out.png expressions|sequences
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C} from '../../render/lib.js';

const [out, mode = 'expressions'] = ARGV;
const PW = 131, PH = 32, STROKE = 2.4, EL = -8.5, ER = 8.5;   // eye centres

let cr;
function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}
const bar = (x, y, w, h, r) => { rr(x, y, w, h, r); cr.fill(); };
function stroke(pts, w = STROKE) {
    cr.setLineWidth(w); cr.setLineCap(cairo.LineCap.ROUND); cr.setLineJoin(cairo.LineJoin.ROUND);
    cr.moveTo(...pts[0]);
    for (const p of pts.slice(1))
        cr.lineTo(...p);
    cr.stroke();
}
// a quadratic through (mid, cy), as motion.js eyes() draws `arcs`
function arc(x1, x2, y, cy) {
    const mx = (x1 + x2) / 2, k = 2 / 3;
    cr.setLineWidth(STROKE); cr.setLineCap(cairo.LineCap.ROUND);
    cr.moveTo(x1, y);
    cr.curveTo(x1 + k * (mx - x1), y + k * (cy - y), x2 + k * (mx - x2), y + k * (cy - y), x2, y);
    cr.stroke();
}
// a half-closed eye: flat top (the lid), round bottom
function lid(x, y, w, h) {
    const r = w / 2;
    cr.moveTo(x, y); cr.lineTo(x + w, y); cr.lineTo(x + w, y + h - r);
    cr.arc(x + r, y + h - r, r, 0, Math.PI); cr.closePath(); cr.fill();
}
function spiral(cx, cy, r, turns, sign) {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
        const t = i / 80, a = sign * t * turns * 2 * Math.PI - Math.PI / 2, rr2 = r * (1 - t * 0.85);
        pts.push([cx + rr2 * Math.cos(a), cy + rr2 * Math.sin(a)]);
    }
    stroke(pts, 1.8);
}
const ring = (cx, cy, r) => { cr.setLineWidth(2.2); cr.newSubPath(); cr.arc(cx, cy, r, 0, 2 * Math.PI); cr.stroke(); };

const EYES = {
    idle: () => { bar(-11, 11, 4.5, 10, 2.2); bar(6, 11, 4.5, 10, 2.2); },
    smile: () => { arc(-13.5, -4, 18, 11.5); arc(3.5, 13, 18, 11.5); },
    wink: () => { bar(-11, 11, 4.5, 10, 2.2); arc(ER - 4.5, ER + 4.5, 18, 11.5); },
    content: () => { arc(EL - 4.5, EL + 4.5, 14, 21); arc(ER - 4.5, ER + 4.5, 14, 21); },
    startled: () => { ring(EL, 16, 3.8); ring(ER, 16, 3.8); },
    drowsy: () => { lid(-11.5, 15, 5.5, 6); lid(5.5, 15, 5.5, 6); },
    sleep: () => { bar(-14, 16, 9, 2.4, 1.2); bar(5, 16, 9, 2.4, 1.2); },
    squeeze: () => {
        stroke([[EL - 3.5, 11.5], [EL + 2.5, 16], [EL - 3.5, 20.5]]);
        stroke([[ER + 3.5, 11.5], [ER - 2.5, 16], [ER + 3.5, 20.5]]);
    },
    dizzy: () => { spiral(EL, 16, 5.2, 1.75, 1); spiral(ER, 16, 5.2, 1.75, -1); },
    knocked: () => {
        for (const c of [EL, ER]) {
            stroke([[c - 3, 13], [c + 3, 19]]); stroke([[c + 3, 13], [c - 3, 19]]);
        }
    },
};

// [eyes, symbol, name, when]
const SHEET = [
    ['idle', '| |', 'đi dạo', 'có sẵn'],
    ['smile', '^ ^', 'cười', 'có sẵn · nhịp 6'],
    ['wink', '| ^', 'nháy mắt', 'nhịp 6, xen với cười'],
    ['content', 'u u', 'hài lòng', 'đèn vàng tắt'],
    ['startled', 'o o', 'giật mình', 'đang ngủ, có input lại'],
    ['drowsy', '_ _', 'lim dim', 'ngay trước khi ngủ'],
    ['sleep', '- -', 'ngủ', 'có sẵn'],
    ['squeeze', '> <', 'nheo', 'nhấn vào pill'],
    ['dizzy', '@ @', 'chóng mặt', 'giữ 1.5 s'],
    ['knocked', 'x x', 'choáng', 'giữ 3 s'],
];
const SEQ = [
    ['Ngủ — 60 s không dùng máy, hoặc đêm', [
        ['idle', 'đang đi dạo'], ['drowsy', 'lim dim · 1 s'], ['sleep', 'ngủ · đến khi có input'],
        ['startled', 'giật mình · 0.6 s'], ['idle', 'đi dạo lại từ nhịp 1']]],
    ['Giữ chuột trên pill — cắt ngang đi dạo ngay; thả trước 0.5 s là click, mở Home', [
        ['squeeze', 'nhấn · 0 s'], ['dizzy', 'giữ 1.5 s'], ['knocked', 'giữ 3 s'],
        ['knocked', 'thả · còn 1 s, không mở Home'], ['idle', 'đi dạo lại từ nhịp 1']]],
];

const GAP = 18, M = 16;
const COLS = mode === 'sequences' ? 5 : 5;
const W = M * 2 + COLS * PW + (COLS - 1) * GAP;
const H = mode === 'sequences' ? M + SEQ.length * 96 : M + Math.ceil(SHEET.length / COLS) * 84;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, sz, wt, a, centre = true) {
    const d = Pango.FontDescription.from_string('SF Pro Display');
    d.set_size(sz * Pango.SCALE); d.set_weight(wt); L.set_font_description(d);
    L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    const w = L.get_pixel_extents()[1].width;
    cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(centre ? x - w / 2 : x, y); PangoCairo.show_layout(cr, L);
}
function pill(x, y, eyes) {
    rr(x, y, PW, PH, 16); cr.setSourceRGB(...C.BLACK); cr.fill();
    cr.save(); cr.translate(x + PW / 2, y); cr.setSourceRGB(...C.CREAM); EYES[eyes](); cr.restore();
}
function arrow(x, cy) {
    cr.setSourceRGBA(1, 1, 1, C.FG_SUBTLE); cr.setLineWidth(1.2);
    cr.moveTo(x - 4, cy); cr.lineTo(x + 2, cy); cr.stroke();
    cr.moveTo(x + 4, cy); cr.lineTo(x, cy - 3); cr.lineTo(x, cy + 3); cr.closePath(); cr.fill();
}

if (mode === 'sequences') {
    SEQ.forEach(([title, steps], r) => {
        const y0 = M + r * 96;
        text(title, M, y0, 10, 600, C.FG, false);
        steps.forEach(([eyes, label], i) => {
            const x = M + i * (PW + GAP), py = y0 + 22;
            pill(x, py, eyes);
            if (i)
                arrow(x - GAP / 2, py + PH / 2);
            text(label, x + PW / 2, py + PH + 7, 8.5, 400, C.FG_MUTED);
        });
    });
} else {
    SHEET.forEach(([eyes, sym, name, when], i) => {
        const x = M + (i % COLS) * (PW + GAP), y = M + Math.floor(i / COLS) * 84;
        pill(x, y, eyes);
        text(`${sym}   ${name}`, x + PW / 2, y + PH + 6, 9.5, 600, C.FG);
        text(when, x + PW / 2, y + PH + 21, 8.5, 400, C.FG_SUBTLE);
    });
}
surf.writeToPNG(out);
