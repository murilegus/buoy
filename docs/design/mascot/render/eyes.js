// Bu's eyes in the idle pill (131 × 32): the expressions, and the sleep and hold sequences
// (design/mascot "Biểu cảm của mắt", 2026-11-14), from the extension's own eyesShapes.
// gjs -m eyes.js out.png expressions|sequences
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, t} from '../../render/lib.js';
import {eyesShapes} from '../../../../src/buoy@murilegus/lib/kit/model/mascot.js';

const [out, mode = 'expressions'] = ARGV;
const PW = 131, PH = 32;

let cr;
function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}
// the extension's own shapes (kit/model/mascot.js eyesShapes), drawn as motion.js eyes() does
function draw(mode, eyes) {
    const s = eyesShapes(mode, {eyes});
    for (const b of s.bars) {
        if (b.lid) {
            const r = b.w / 2;
            cr.moveTo(b.x, b.y); cr.lineTo(b.x + b.w, b.y); cr.lineTo(b.x + b.w, b.y + b.h - r);
            cr.arc(b.x + r, b.y + b.h - r, r, 0, Math.PI); cr.closePath();
        } else {
            rr(b.x, b.y, b.w, b.h, b.r);
        }
        cr.fill();
    }
    cr.setLineCap(cairo.LineCap.ROUND); cr.setLineJoin(cairo.LineJoin.ROUND);
    cr.setLineWidth(2.4);
    for (const a of s.arcs) {
        const mx = (a.x1 + a.x2) / 2, k = 2 / 3;
        cr.moveTo(a.x1, a.y);
        cr.curveTo(a.x1 + k * (mx - a.x1), a.y + k * (a.cy - a.y), a.x2 + k * (mx - a.x2), a.y + k * (a.cy - a.y), a.x2, a.y);
        cr.stroke();
    }
    for (const l of s.lines) {
        cr.setLineWidth(l.w); cr.moveTo(...l.pts[0]);
        for (const p of l.pts.slice(1))
            cr.lineTo(...p);
        cr.stroke();
    }
    for (const g of s.rings) {
        cr.setLineWidth(g.w); cr.newSubPath(); cr.arc(g.cx, g.cy, g.r, 0, 2 * Math.PI); cr.stroke();
    }
}
const EYES = {
    idle: () => draw('idle', 'open'), smile: () => draw('idle', 'smile'), sleep: () => draw('sleep', 'open'),
    wink: () => draw('idle', 'wink'), content: () => draw('idle', 'content'), startled: () => draw('idle', 'startled'),
    drowsy: () => draw('sleep', 'drowsy'), squeeze: () => draw('idle', 'squeeze'), dizzy: () => draw('idle', 'dizzy'),
    knocked: () => draw('idle', 'knocked'),
};

// [eyes, symbol, name, when]
const SHEET = [
    ['idle', '| |', t('đi dạo', 'stroll'), t('có sẵn', 'exists')],
    ['smile', '^ ^', t('cười', 'smile'), t('có sẵn · nhịp 6', 'exists · beat 6')],
    ['wink', '| ^', t('nháy mắt', 'wink'), t('nhịp 6, xen với cười', 'beat 6, alternating with smile')],
    ['content', 'u u', t('hài lòng', 'content'), t('đèn vàng tắt', 'amber light goes off')],
    ['startled', 'o o', t('giật mình', 'startled'), t('đang ngủ, có input lại', 'asleep, input again')],
    ['drowsy', '_ _', t('lim dim', 'drowsy'), t('ngay trước khi ngủ', 'just before sleep')],
    ['sleep', '- -', t('ngủ', 'asleep'), t('có sẵn', 'exists')],
    ['squeeze', '> <', t('nheo', 'squint'), t('nhấn vào pill', 'press on the pill')],
    ['dizzy', '@ @', t('chóng mặt', 'dizzy'), t('giữ 1.5 s', 'held 1.5 s')],
    ['knocked', 'x x', t('choáng', 'knocked out'), t('giữ 3 s', 'held 3 s')],
];
const SEQ = [
    [t('Ngủ — 60 s không dùng máy, hoặc đêm', 'Sleep — 60 s without using the computer, or at night'), [
        ['idle', t('đang đi dạo', 'strolling')], ['drowsy', t('lim dim · 1 s', 'drowsy · 1 s')], ['sleep', t('ngủ · đến khi có input', 'asleep · until input')],
        ['startled', t('giật mình · 0.6 s', 'startled · 0.6 s')], ['idle', t('đi dạo lại từ nhịp 1', 'strolls again from beat 1')]]],
    [t('Giữ chuột trên pill — cắt ngang đi dạo ngay; thả trước 0.5 s là click, mở Home',
        'Press and hold on the pill — cuts the stroll at once; released before 0.5 s it is a click, opens Home'), [
        ['squeeze', t('nhấn · 0 s', 'press · 0 s')], ['dizzy', t('giữ 1.5 s', 'held 1.5 s')], ['knocked', t('giữ 3 s', 'held 3 s')],
        ['knocked', t('thả · còn 1 s, không mở Home', 'release · 1 s more, no Home')], ['idle', t('đi dạo lại từ nhịp 1', 'strolls again from beat 1')]]],
];

const GAP = 18, M = 16;
const COLS = 5;
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
