// Power (decided 2026-11-14, Ethan): the battery tile and the power-mode list in Home, the
// flashes and the power-mode compact on the pill, the power-mode icons. One script for the
// three pages (as compact/render/anatomy-compact.js draws alerts-and-asks images too).
//   tile     home: the battery tile, narrow and wide, the mode in the top right corner
//   list     home: a click on the tile → the three modes in place of the card and the row
//   flash    compact: the 3 s flashes at the pill's real width
//   compact  compact: the power-mode compact, its three buttons
//   icons    icons: the mode icons, at 3×, 1× and in the pill
// gjs -m power.js out.png <mode>
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon, t} from '../../render/lib.js';

const [out, MODE = 'tile'] = ARGV;
const W1 = C.WHITE, SUB = 9.35, BIG = 16.5, TILE_H = 100;
const SIZE = {tile: [1040, 140], list: [420, 300], flash: [1000, 136], compact: [700, 180], icons: [960, 104]}[MODE];
const [W, H] = SIZE;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, rgb = W1, a = 1, right = false, centre = false, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1); const e = L.get_pixel_extents()[1];
    if (measure)
        return e;
    cr.setSourceRGBA(...rgb, a); cr.moveTo(right ? x - e.width : centre ? x - e.width / 2 : x, y); PangoCairo.show_layout(cr, L);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (rgba, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgba); cr.fill(); };
const icon = (n, x, y, s = 16, rgb = W1, a = 1) => gicon(cr, n, x, y, s, rgb, a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});

// the mode icons (design/icons "Chế độ năng lượng", Ethan 2026-11-14): GNOME's leaf / scales /
// gauge — Gravity's scales-balanced; the leaf ours, the gauge Gravity's speedometer at full
// (icons/render/draw-own.js)
const MODES = {saver: 'power-saver', balanced: 'scales-balanced', perf: 'power-performance'};
const NAMES = {saver: t('Tiết kiệm pin', 'Power Saver'), balanced: t('Cân bằng', 'Balanced'), perf: t('Hiệu năng', 'Performance')};
const draw = (name, x, y, s = 16, a = 1) => icon(name, x, y, s, W1, a);

// a battery tile (design/home "Kích thước": leading 20 at 12, value 1.5em 600, caption 0.85em
// fg-muted; from 200 a detail column 0.85em fg-subtle); the mode in the top right corner
function tile(x, y, w, {ic, val, cap, m, det = []}) {
    fill([1, 1, 1, C.FILL1], x, y, w, TILE_H, 16);
    icon(ic, x + 14, y + 14, 16);
    draw(MODES[m], x + w - 12 - 16, y + 14, 16, C.FG_SUBTLE);
    text(val, x + 12, y + 40, {sz: BIG, wt: 600});
    text(cap, x + 12, y + 68, {sz: SUB, a: C.FG_MUTED});
    if (w >= 200)
        det.forEach((d, i) => d && text(d, x + w - 14, y + 44 + i * 18, {sz: SUB, a: C.FG_SUBTLE, right: true}));
}
// a pill at its real width (design/tokens): 8 + leading 24 + 6 + text + 6 + trailing + 8, at least 131
function pill(x, y, lead, t, trail = null) {
    const te = text(t, 0, 0, {wt: 600, measure: true}), pe = trail ? text(trail, 0, 0, {wt: 600, measure: true}) : null;
    const w = Math.max(131, 8 + 24 + 6 + te.width + (pe ? 6 + pe.width : 0) + 8);
    fill([0, 0, 0, 1], x, y, w, 32, 16);
    icon(lead, x + 12, y + 8, 16);
    text(t, x + 38, y + 16 - te.height / 2 - 1, {wt: 600});
    if (pe)
        text(trail, x + w - 8 - pe.width, y + 16 - pe.height / 2 - 1, {wt: 600, a: C.FG_MUTED});
    return w;
}

if (MODE === 'tile') {
    const T = [
        {ic: 'battery-charging', val: '82%', cap: t('Đang sạc', 'Charging'), m: 'balanced', det: [t('đầy sau 42 phút', 'Full in 42 min'), t('Cân bằng', 'Balanced')]},
        {ic: 'battery', val: '64%', cap: t('Pin', 'Battery'), m: 'balanced', det: [t('còn 3 giờ 20 phút', '3 h 20 min left'), t('Cân bằng', 'Balanced')]},
        {ic: 'battery-low', val: '18%', cap: t('Pin yếu', 'Low battery'), m: 'saver', det: [t('còn 25 phút', '25 min left'), t('Tiết kiệm pin', 'Power Saver')]},
        {ic: 'battery-full', val: '100%', cap: t('Đã sạc đầy', 'Fully charged'), m: 'perf', det: ['', t('Hiệu năng', 'Performance')]},
    ];
    T.forEach((t, i) => tile(16 + i * 136, 16, 128, t));
    note(t('ô hẹp 128: chế độ là icon ở góc trên phải (fg-subtle)', 'narrow tile 128: the mode is an icon top right (fg-subtle)'), 16, 16 + TILE_H + 8);
    T.slice(0, 2).forEach((t, i) => tile(16 + 4 * 136 + 8 + i * 228, 16, 220, t));
    note(t('ô rộng (từ 200): thêm thời gian và tên chế độ', 'wide tile (from 200): adds the time and the mode name'), 16 + 4 * 136 + 8, 16 + TILE_H + 8);
} else if (MODE === 'list') {
    const AX = 16, AW = 388, ay = 16, AH = 236;
    fill([0, 0, 0, 1], AX, ay, AW, AH, 28);
    fill([1, 1, 1, C.FILL2], AX + 12, ay + 12, 32, 32, 16); icon('chevron-left', AX + 20, ay + 20);
    text(t('Pin · 82% · đang sạc', 'Battery · 82% · charging'), AX + 54, ay + 19, {wt: 600});
    text(t('đầy sau 42 phút', 'full in 42 min'), AX + AW - 16, ay + 20, {sz: SUB, a: C.FG_SUBTLE, right: true});
    ['saver', 'balanced', 'perf'].forEach((m, i) => {
        const ry = ay + 56 + i * 40, on = m === 'balanced';
        if (on)
            fill([1, 1, 1, C.FILL3], AX + 12, ry, AW - 24, 36, 18);
        draw(MODES[m], AX + 26, ry + 10, 16, on ? 1 : C.FG_MUTED);
        text(NAMES[m], AX + 52, ry + 9, {wt: on ? 600 : 400, a: on ? 1 : C.FG_MUTED});
        if (on)
            icon('check', AX + AW - 40, ry + 10, 16);
    });
    fill([1, 1, 1, C.FILL1], AX + 12, ay + 184, AW - 24, 36, 18);
    icon('gear', AX + 26, ay + 194, 16, W1, C.FG_MUTED); text(t('Cài đặt nguồn', 'Power Settings'), AX + 52, ay + 193, {a: C.FG_MUTED});
    icon('arrow-up-right-from-square', AX + AW - 40, ay + 194, 16, W1, C.FG_SUBTLE);
    note(t('hàng 36 bo 18, cách 4; chọn xong vẫn ở danh sách, ‹ về Home', 'rows 36, radius 18, gap 4; after a choice it stays on the list, ‹ back to Home'), AX, ay + AH + 8);
} else if (MODE === 'flash') {
    const F = [['battery-charging', t('Đang sạc', 'Charging'), '72%'], ['battery-charging', t('18 W · sạc chậm', '18 W · slow charger'), '40%'],
        ['battery', t('Dùng pin', 'On battery'), '64%'], ['battery-full', t('Đã sạc đầy', 'Fully charged'), '100%'], ['battery-low', t('Pin yếu', 'Low battery'), '18%']];
    let x = 16;
    F.forEach(([ic, t, p]) => { const w = pill(x, 16, ic, t, p); text(`${Math.round(w)}`, x + w / 2, 52, {sz: 8, a: .55, centre: true}); x += w + 16; });
    x = 16;
    ['saver', 'balanced', 'perf'].forEach(m => { const w = pill(x, 72, MODES[m], NAMES[m]); x += w + 16; });
    note(t('pin: 3 s khi cắm, rút, đầy; sạc chậm thêm một lần khi tốc độ đến; pin yếu ở lại tới khi cắm sạc · chế độ: 3 s khi đổi, cả khi máy tự đổi', 'battery: 3 s on plug, unplug, full; slow charging once more when the rate arrives; low battery stays until plugged in · mode: 3 s on a change, also when the system changes it'), 16, 116);
} else if (MODE === 'compact') {
    const CX = 16, cy = 16, kw = 404;
    fill([0, 0, 0, 1], CX, cy, kw, 104, 28);
    fill([1, 1, 1, C.FILL2], CX + 14, cy + 8, 40, 40, 20); draw(MODES.balanced, CX + 26, cy + 20, 16);
    text(t('Chế độ năng lượng', 'Power Mode'), CX + 66, cy + 9, {wt: 600}); text(t('Cân bằng · pin 82%, đang sạc', 'Balanced · battery 82%, charging'), CX + 66, cy + 29, {sz: SUB, a: C.FG_MUTED});
    const bwd = (kw - 24 - 16) / 3;
    ['saver', 'balanced', 'perf'].forEach((m, i) => {
        const bx = CX + 12 + i * (bwd + 8), on = m === 'balanced';
        fill([1, 1, 1, on ? C.FILL3 : C.FILL2], bx, cy + 60, bwd, 32, 16);
        draw(MODES[m], bx + 14, cy + 68, 16, on ? 1 : C.FG_MUTED);
        text(NAMES[m], bx + 36, cy + 68, {sz: SUB, wt: on ? 600 : 400, a: on ? 1 : C.FG_MUTED});
    });
    note(t('104 = 56 + 4 + 32 + 12: phần đầu 56, hàng nút 32 cách mép 12 (như card)', '104 = 56 + 4 + 32 + 12: head 56, button row 32, 12 from the edge (as card)'), CX, cy + 112);
    note(t('nút đang chọn fill-3, chữ 600; các nút khác fill-2, fg-muted', 'the chosen button fill-3, text 600; the other buttons fill-2, fg-muted'), CX, cy + 126);
    note(t('đổi chế độ → compact này tự mở (alert, giữ 5 s lúc bạn có mặt); bấm một nút: đổi ngay', 'mode change → this compact opens by itself (alert, held 5 s while you are there); click a button: changes at once'), CX, cy + 140);
    // the mode flash it comes from
    pill(CX + kw + 40, cy + 8, MODES.balanced, t('Cân bằng', 'Balanced'));
    note('flash 3 s', CX + kw + 40, cy + 46);
} else if (MODE === 'icons') {
    Object.entries(MODES).forEach(([m, n], i) => {
        const x = 16 + i * 150;
        fill([0, 0, 0, 1], x, 16, 56, 56, 12); draw(n, x + 4, 20, 48); draw(n, x + 70, 36, 16);
        text(NAMES[m], x + 70, 56, {sz: 8.5, a: .75});
    });
    let x = 480;
    Object.entries(MODES).forEach(([m, n]) => { x += pill(x, 28, n, NAMES[m]) + 16; });
    note(t('lá / cân / đồng hồ như GNOME: cân của Gravity (scales-balanced); lá tự vẽ; đồng hồ là speedometer của Gravity, kim hết cỡ', 'leaf / scales / gauge as in GNOME: Gravity\'s scales (scales-balanced); the leaf our own; the gauge Gravity\'s speedometer, needle at full'), 16, 84);
}
surf.writeToPNG(out);
