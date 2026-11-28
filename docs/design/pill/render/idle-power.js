// The battery idle plan (design/pill "Idle plan Pin", decided 2026-11-27, Ethan: A + Y): the
// battery and its percentage in the idle pill, the power mode a subtle icon at the end; the
// minute after a plug in or an unplug; the compact over the three power modes.
//   pill     the pill in four moments, then the minute after a plug
//   compact  the compact: with power modes, and without
// gjs -m idle-power.js out.png <pill|compact>
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon, t} from '../../render/lib.js';

const [out, MODE = 'pill'] = ARGV;
const W1 = C.WHITE, SUB = 9.35;
const [W, H] = {pill: [1180, 250], compact: [880, 190]}[MODE];
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(s, x, y, {sz = 11, wt = 400, a = 1, centre = false, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(s, -1); const e = L.get_pixel_extents()[1];
    if (measure)
        return e;
    cr.setSourceRGBA(...W1, a); cr.moveTo(centre ? x - e.width / 2 : x, y); PangoCairo.show_layout(cr, L);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (rgba, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgba); cr.fill(); };
const icon = (n, x, y, s = 16, a = 1) => gicon(cr, n, x, y, s, W1, a);
const note = (s, x, y) => text(s, x, y, {sz: 8.5, a: .7});
const head = (s, x, y) => text(s, x, y, {sz: 10.5, wt: 700});
const MODE_IC = {saver: 'power-saver', balanced: 'scales-balanced', perf: 'power-performance'};
const MODE_NAME = {saver: t('Tiết kiệm pin', 'Power Saver'), balanced: t('Cân bằng', 'Balanced'), perf: t('Hiệu năng', 'Performance')};

// the idle pill at its real width: 8 + leading 24 + 6 + text + 6 + the mode's icon 16 + 8, at
// least 131 (the idle room, design/pill "Idle")
function pill(x, y, lead, s, mode) {
    const te = text(s, 0, 0, {wt: 600, measure: true});
    const w = Math.max(131, 8 + 24 + 6 + te.width + (mode ? 6 + 16 : 0) + 8);
    fill([0, 0, 0, 1], x, y, w, 32, 16);
    icon(lead, x + 12, y + 8, 16);
    text(s, x + 38, y + 16 - te.height / 2 - 1, {wt: 600});
    if (mode)
        icon(MODE_IC[mode], x + w - 8 - 16, y + 8, 16, C.FG_SUBTLE);
    text(`${Math.round(w)}`, x + w / 2, y + 36, {sz: 7.5, a: .5, centre: true});
    return w;
}

if (MODE === 'pill') {
    head(t('Idle plan Pin: pin và %, chế độ là icon nhỏ ở cuối (fg-subtle)', 'Battery idle plan: battery and %, the mode a small icon at the end (fg-subtle)'), 16, 12);
    [[t('Dùng pin', 'On battery'), 'battery', '64%', 'balanced'], [t('Đang sạc', 'Charging'), 'battery-charging', '82%', 'balanced'],
        [t('Cắm sạc, giữ ở 80%', 'Plugged in, held at 80%'), 'battery-full', '80%', 'perf'], [t('Tiết kiệm pin', 'Power Saver'), 'battery', '31%', 'saver'],
    ].forEach(([cap, ic, pct, m], j) => {
        note(cap, 16 + j * 250, 36);
        pill(16 + j * 250, 54, ic, pct, m);
    });
    const y = 128;
    head(t('Một phút sau khi cắm hoặc rút: auto giữ pill', 'The minute after a plug in or an unplug: auto holds the pill'), 16, y);
    note(t('0–3 s: flash của mục Power', '0–3 s: the Power flash'), 16, y + 24);
    const fw = text(t('Đang sạc', 'Charging'), 0, 0, {wt: 600, measure: true}).width, pw = text('72%', 0, 0, {wt: 600, measure: true}).width;
    const w0 = 8 + 24 + 6 + fw + 6 + pw + 8;
    fill([0, 0, 0, 1], 16, y + 40, w0, 32, 16); icon('battery-charging', 28, y + 48, 16);
    text(t('Đang sạc', 'Charging'), 54, y + 47, {wt: 600}); text('72%', 16 + w0 - 8 - pw, y + 47, {wt: 600, a: C.FG_MUTED});
    note(t('đến 60 s: chưa có ước tính', 'to 60 s: no estimate yet'), 230, y + 24);
    pill(230, y + 40, 'battery-charging', '72%', 'balanced');
    note(t('10–15 s: UPower có ước tính, nói đủ', '10–15 s: UPower has its estimate, said in full'), 470, y + 24);
    pill(470, y + 40, 'battery-charging', t('72% · đầy sau 1 giờ 10 phút', '72% · full in 1 h 10 min'), 'balanced');
    note(t('rút sạc', 'unplugged'), 840, y + 24);
    pill(840, y + 40, 'battery', t('64% · còn 3 giờ 20 phút', '64% · 3 h 20 min left'), 'balanced');
    note(t('Ước tính đầu tiên được giữ trong phút đó, nên chữ không đổi theo mỗi lần UPower cập nhật; hết 60 s thì về %.',
        'The first estimate is kept for that minute, so the text does not change with every UPower update; after 60 s, back to %.'), 16, y + 92);
} else {
    head(t('Rê chuột: phần đầu nói về pin, ba chế độ là nút (cao 104)', 'Hover: the head speaks of the battery, the three modes as buttons (104 high)'), 16, 12);
    const kw = 404, x = 16, y = 40;
    fill([0, 0, 0, 1], x, y, kw, 104, 28);
    fill([1, 1, 1, C.FILL2], x + 14, y + 8, 40, 40, 20); icon('battery-charging', x + 26, y + 20, 16);
    text(t('Pin · 82% · đang sạc', 'Battery · 82% · charging'), x + 66, y + 9, {wt: 600});
    text(t('Đầy sau 42 phút · Cân bằng', 'Full in 42 min · Balanced'), x + 66, y + 29, {sz: SUB, a: C.FG_MUTED});
    const bwd = (kw - 24 - 16) / 3;
    ['saver', 'balanced', 'perf'].forEach((m, i) => {
        const bx = x + 12 + i * (bwd + 8), on = m === 'balanced';
        fill([1, 1, 1, on ? C.FILL3 : C.FILL2], bx, y + 60, bwd, 32, 16);
        icon(MODE_IC[m], bx + 14, y + 68, 16, on ? 1 : C.FG_MUTED);
        text(MODE_NAME[m], bx + 36, y + 68, {sz: SUB, wt: on ? 600 : 400, a: on ? 1 : C.FG_MUTED});
    });
    note(t('Bấm nút: đổi chế độ ngay, compact ở lại, không flash.', 'A button: switches the mode at once, the compact stays, no flash.'), x, y + 112);
    note(t('Bấm pill ngoài nút: mở Home, như mọi idle plan.', 'The pill outside the buttons: opens Home, as every idle plan.'), x, y + 128);
    const x2 = 460;
    fill([0, 0, 0, 1], x2, y, kw, 56, 28);
    fill([1, 1, 1, C.FILL2], x2 + 14, y + 8, 40, 40, 20); icon('battery', x2 + 26, y + 20, 16);
    text(t('Pin · 64%', 'Battery · 64%'), x2 + 66, y + 9, {wt: 600});
    text(t('còn 3 giờ 20 phút', '3 h 20 min left'), x2 + 66, y + 29, {sz: SUB, a: C.FG_MUTED});
    note(t('Không có power-profiles-daemon: chỉ phần đầu, cao 56.', 'No power-profiles-daemon: the head alone, 56 high.'), x2, y + 64);
}
surf.writeToPNG(out);
