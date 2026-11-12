// Home (design/home, decided 2026-11-11, Ethan: H5): one main card over a row of tiles, laid out
// again at every open and stack change so the tab is never empty and never scrolls.
//   states  — four moments at 1920: music, Claude asks, nothing running, missed and a full row
//   anatomy — 1920 with every measure, then 2560 and 3440
//   fill    — how the row fills: activities, then the glance, then wide tiles
//   lists   — the Missed tile and +K open a list in place of the card and the row
//   screen  — screen recording in Home: the main card, or a tile
// gjs -m home.js out.png <states|anatomy|fill|lists|screen>
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Rsvg from 'gi://Rsvg?version=2.0';
import GLib from 'gi://GLib';
import cairo from 'cairo';
import {SCALE as SC, C, drawBu, icon as gicon} from '../../render/lib.js';
const [out, MODE] = ARGV;
// Buoy's colour icons (weather, daypart), the ones the extension ships
const COLOUR = GLib.build_filenamev([GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]),
    '..', '..', '..', '..', 'src', 'buoy@murilegus', 'icons', 'color']);

// ---- the rules ------------------------------------------------------------------------------------
const PAD = 12, HEAD = 56, GAP = 8, TILE_H = 100, TILE_MIN = 120, WIDE = 200, TALL = 160, ART_MAX = 160;
// tiles a row holds, each at least TILE_MIN with gaps of 8: 4 at 1920, 5 at 2560 and 3440
const fitN = cw => Math.floor((cw + GAP) / (TILE_MIN + GAP));
// the row: activities first (Missed leading), one unit each, N − 1 and "+K" when they overflow;
// then the glance, one unit each while units remain (the rest dropped, never in +K); then spare
// units widen the weather, then up next, to two
function plan(N, acts, glance) {
    const row = [];
    if (acts.length > N) {
        acts.slice(0, N - 1).forEach(k => row.push({k, u: 1}));
        row.push({more: acts.length - N + 1, u: 1});
        return row;
    }
    acts.forEach(k => row.push({k, u: 1}));
    let free = N - row.length;
    for (const k of glance) if (free > 0) { row.push({k, u: 1}); free--; }
    for (const o of row) if (free > 0 && ITEMS[o.k]?.wide) { o.u = 2; free--; }
    return row;
}

// ---- drawing ----------------------------------------------------------------------------------------
const CY = [.4, .85, 1], RD = [1, .45, .45], W1 = C.WHITE, SUB = 9.35, BIG = 16.5;
let cr, L;
function canvas(W, H) {
    const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
    cr = new cairo.Context(surf); cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
    L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
    return surf;
}
function text(t, x, y, {sz = 11, wt = 400, rgb = W1, a = 1, measure = false, right = false, maxW = 0} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
    L.set_width(maxW ? maxW * Pango.SCALE : -1); L.set_ellipsize(maxW ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    const e = L.get_pixel_extents()[1];
    if (!measure) { cr.setSourceRGBA(...rgb, a); cr.moveTo(right ? x - e.width : x, y); PangoCairo.show_layout(cr, L); }
    L.set_width(-1);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (rgba, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgba); cr.fill(); };
const icon = (name, x, y, s = 16, rgb = W1, a = 1) => gicon(cr, name, x, y, s, rgb, a);
function colour(name, x, y, s) {
    const v = new Rsvg.Rectangle(); v.x = x; v.y = y; v.width = s; v.height = s;
    Rsvg.Handle.new_from_file(`${COLOUR}/${name}.svg`).render_document(cr, v);
}
function round(cx, cy, name, main = false) {
    cr.newPath(); if (main) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2);
    cr.arc(cx, cy, 16, 0, 2 * Math.PI); cr.fill(); icon(name, cx - 8, cy - 8, 16, main ? C.BLACK : W1);
}
function pillBtn(x, y, w, label, main = false) {
    cr.newPath(); rr(x, y, w, 32, 16);
    if (main) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2);
    cr.fill();
    const e = text(label, 0, 0, {wt: 600, measure: true});
    text(label, x + (w - e.width) / 2, y + (32 - e.height) / 2, {wt: 600, rgb: main ? C.BLACK : W1});
}
function art(x, y, s, r) {
    const g = new cairo.LinearGradient(x, y, x + s, y + s); g.addColorStopRGB(0, .95, .55, .35); g.addColorStopRGB(1, .35, .25, .75);
    cr.newPath(); rr(x, y, s, s, r); cr.setSource(g); cr.fill();
}
function bar(x, y, w, f = .38) { fill([1, 1, 1, C.FILL3], x, y, w, 4, 2); fill([1, 1, 1, 1], x, y, w * f, 4, 2); }
function dim(a, b, y, t, col = CY, below = false) {
    cr.newPath(); cr.setSourceRGBA(...col, .9); cr.setLineWidth(.5);
    cr.moveTo(a, y); cr.lineTo(b, y); cr.moveTo(a, y - 2); cr.lineTo(a, y + 2); cr.moveTo(b, y - 2); cr.lineTo(b, y + 2); cr.stroke();
    const e = text(t, 0, 0, {sz: 6.5, wt: 600, measure: true});
    text(t, (a + b) / 2 - e.width / 2, below ? y + 2 : y - e.height - 2, {sz: 6.5, wt: 600, rgb: col});
}
function vdim(x, a, b, t, col = RD) {
    cr.newPath(); cr.setSourceRGBA(...col, .9); cr.setLineWidth(.5);
    cr.moveTo(x, a); cr.lineTo(x, b); cr.moveTo(x - 2, a); cr.lineTo(x + 2, a); cr.moveTo(x - 2, b); cr.lineTo(x + 2, b); cr.stroke();
    const e = text(t, 0, 0, {sz: 6.5, wt: 600, measure: true});
    text(t, x + 4, (a + b) / 2 - e.height / 2, {sz: 6.5, wt: 600, rgb: col});
}
// the panel: r 28, the strip (Home, the always-shown tabs, ⋯) and ⚙ alone at the right
function panel(x, y, EW, EH, title, {bellDot = false} = {}) {
    if (title) text(title, x, y - 22, {sz: 9, wt: 700, a: .9});
    cr.newPath(); rr(x + .5, y + .5, EW - 1, EH - 1, 28); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke();
    const tabs = ['music-note', bellDot ? 'bell-dot' : 'bell', 'calendar', 'smartphone', 'ellipsis-vertical'], sx = x + 12, sy = y + 12;
    fill([1, 1, 1, C.FILL2], sx, sy, 86 + tabs.length * 36 + 4, 32, 16);
    fill([1, 1, 1, C.FILL3], sx + 4, sy + 4, 80, 24, 12);
    icon('house', sx + 12, sy + 8); text('Home', sx + 34, sy + 7, {sz: 9.5, wt: 600});
    tabs.forEach((n, k) => icon(n, sx + 96 + k * 36, sy + 8, 16, W1, C.FG_MUTED));
    round(x + EW - 12 - 16, sy + 16, 'gear');
}

// ---- the main card: fill-1, r 16; low under 160, tall from 160 ----------------------------------------
function heroMusic(x, y, w, h) {
    fill([1, 1, 1, C.FILL1], x, y, w, h, 16);
    const s = Math.min(h - 16, ART_MAX), ay = y + (h - s) / 2;
    art(x + 8, ay, s, 8);
    const tx = x + 8 + s + 12, x1 = x + w - 14;
    if (h < TALL) {   // low: the buttons top right, the bar at the foot of the text column
        text('Lumen Coast', tx, y + 12, {wt: 600}); text('Harbor Lights · Spotify', tx, y + 32, {sz: SUB, a: C.FG_MUTED});
        [['forward-step-fill', 0], ['pause-fill', 1], ['backward-step-fill', 0]].forEach(([n, m], i) => round(x + w - 28 - i * 40, y + 28, n, m));
        bar(tx, y + h - 34, x1 - tx);
        text('1:24', tx, y + h - 26, {sz: SUB, a: C.FG_SUBTLE}); text('-2:11', x1, y + h - 26, {sz: SUB, a: C.FG_SUBTLE, right: true});
    } else {          // tall: the title larger, the bar, the buttons centred under it
        text('Lumen Coast', tx, ay + 6, {sz: 14, wt: 700}); text('Harbor Lights · Spotify', tx, ay + 32, {sz: SUB, a: C.FG_MUTED});
        const by = ay + s - 40;
        bar(tx, by - 30, x1 - tx);
        text('1:24', tx, by - 22, {sz: SUB, a: C.FG_SUBTLE}); text('-2:11', x1, by - 22, {sz: SUB, a: C.FG_SUBTLE, right: true});
        const mid = (tx + x1) / 2;
        [['backward-step-fill', 0], ['pause-fill', 1], ['forward-step-fill', 0]].forEach(([n, m], i) => round(mid + (i - 1) * 44, by + 20, n, m));
    }
}
function heroAsk(x, y, w, h) {
    fill([1, 1, 1, C.FILL1], x, y, w, h, 16);
    drawBu(cr, 'ask', x + 12, y + 8, 4);
    text('Cho chạy lệnh này?', x + 64, y + 10, {wt: 600});
    text('Claude Code · buoy · Bash', x + 64, y + 30, {sz: SUB, a: C.FG_MUTED});
    text('pnpm test -- shapes', x + 64, y + 52, {sz: SUB, a: .85});
    pillBtn(x + w - 12 - 104, y + h - 12 - 32, 104, 'Cho phép', true);
    pillBtn(x + w - 12 - 216, y + h - 12 - 32, 104, 'Từ chối');
}
function heroGreet(x, y, w, h) {
    fill([1, 1, 1, C.FILL1], x, y, w, h, 16);
    const cell = h >= TALL ? 6 : 5, bs = cell * 10;
    drawBu(cr, 'wave', x + 20, y + (h - bs) / 2, cell);
    const tx = x + 20 + bs + 22, lines = h >= TALL ? 3 : 1, top = y + h / 2 - (28 + lines * 18) / 2;
    text('Chào buổi chiều, Ethan', tx, top, {sz: 14, wt: 700});
    text('Thứ Tư, 11 tháng 11', tx, top + 28, {sz: SUB, a: C.FG_MUTED});
    if (h >= TALL) {
        text('Tiếp theo: Design review lúc 3:00', tx, top + 46, {sz: SUB, a: C.FG_MUTED});
        text('Không có gì đang chạy', tx, top + 64, {sz: SUB, a: C.FG_SUBTLE});
    }
}
// an activity without a card of its own: its compact (here the head 56) in the card, centred
function heroRec(x, y, w, h) {
    fill([1, 1, 1, C.FILL1], x, y, w, h, 16);
    const hy = y + (h - 56) / 2;
    cr.newPath(); cr.setSourceRGBA(1, 1, 1, C.FILL2); cr.arc(x + 34, hy + 28, 20, 0, 2 * Math.PI); cr.fill();
    icon('video', x + 24, hy + 18, 20);
    text('Đang quay màn hình', x + 66, hy + 11, {wt: 600}); text('0:42 · từ 14:03', x + 66, hy + 31, {sz: SUB, a: C.FG_SUBTLE});
    round(x + w - 14 - 16, hy + 28, 'stop-fill', true);
}
const HEROES = {music: heroMusic, ask: heroAsk, greet: heroGreet, rec: heroRec};

// ---- tiles: a leading 20 at 12 (a symbolic 16 in its middle, Bu 20 filling it, a colour icon 24 over
// it by 2), a value 1.5em 600, a caption 0.85em fg-muted; a detail column on the right from 200 wide ----
const ITEMS = {
    missed: {ic: 'bell', val: '7', cap: 'Bị nhỡ', det: ['3 thông báo', '4 việc'], amber: true},
    claude: {ic: 'bu', val: '2 / 3', cap: 'Claude Code', det: ['Run pnpm test', 'buoy']},
    dl: {ic: 'arrow-down-to-line', val: '42%', cap: 'report.pdf', det: ['2.1 MB/s', 'còn 30 s']},
    timer: {ic: 'alarm', val: '12:40', cap: 'Pomodoro', det: ['vòng 2 / 4', '']},
    call: {ic: 'smartphone', val: '3:12', cap: 'Mira Vale', det: ['đang gọi', '']},
    music: {ic: 'music-note', val: '1:24', cap: 'Lumen Coast', det: ['Harbor Lights', '']},
    wx: {ic: 'weather-few-clouds', val: '31°', cap: 'Ít mây', det: ['cảm giác 34°', 'gió 12 km/h'], wide: true},
    up: {ic: 'calendar', val: '3:00', cap: 'Design review', det: ['25 phút nữa', 'phòng 3'], wide: true},
    bat: {ic: 'battery-charging', val: '82%', cap: 'Pin', det: ['đang sạc', 'còn 4 giờ']},
    rec: {ic: 'video', val: '0:42', cap: 'Đang quay', det: ['từ 14:03', '']},
};
function lead(x, y, ic, amber) {
    if (ic === 'bu') drawBu(cr, 'busy', x + 12, y + 12, 2);
    else if (ic.startsWith('weather-')) colour(ic, x + 10, y + 10, 24);
    else icon(ic, x + 14, y + 14, 16, amber ? C.AMBER : W1);
}
function small(x, y, w, key, more = 0) {
    if (more) {
        fill([1, 1, 1, C.FILL1], x, y, w, TILE_H, 16); lead(x, y, 'ellipsis-vertical');
        text(`+${more}`, x + 12, y + 40, {sz: BIG, wt: 600}); text('xem tất cả', x + 12, y + 68, {sz: SUB, a: C.FG_MUTED});
        return;
    }
    const it = ITEMS[key], am = it.amber;
    fill(am ? [...C.AMBER, .16] : [1, 1, 1, C.FILL1], x, y, w, TILE_H, 16);
    lead(x, y, it.ic, am);
    text(it.val, x + 12, y + 40, {sz: BIG, wt: 600, rgb: am ? C.AMBER : W1});
    text(it.cap, x + 12, y + 68, {sz: SUB, a: C.FG_MUTED, maxW: w - 24});
    if (w >= WIDE) it.det.forEach((d, i) => d && text(d, x + w - 14, y + 44 + i * 18, {sz: SUB, a: C.FG_SUBTLE, right: true}));
}
// the wide weather: the colour icon at 48, the reading large, the condition, the place
function wideWx(x, y, w) {
    fill([1, 1, 1, C.FILL1], x, y, w, TILE_H, 16);
    colour('weather-few-clouds', x + 14, y + 26, 48);
    const tx = x + 76;
    text('31°', tx, y + 14, {sz: 22, wt: 600});
    text('Ít mây', tx, y + 48, {sz: SUB, wt: 600});
    text('TP.HCM · cảm giác 34°', tx, y + 66, {sz: SUB, a: C.FG_MUTED, maxW: w - (tx - x) - 12});
}
// the wide up next: two events, each with its calendar's colour; "+1" when more are left today
function wideUp(x, y, w) {
    fill([1, 1, 1, C.FILL1], x, y, w, TILE_H, 16);
    icon('calendar', x + 14, y + 14); text('Sắp tới', x + 38, y + 14, {sz: SUB, wt: 600, a: C.FG_MUTED});
    text('+1', x + w - 14, y + 14, {sz: SUB, a: C.FG_SUBTLE, right: true});
    [['Design review', '3:00 · 25 phút nữa', [.75, .45, .95]], ['Gym', '5:30', [.3, .8, .45]]].forEach(([t, v, c], i) => {
        const ry = y + 40 + i * 28;
        fill([...c, 1], x + 14, ry + 1, 3, 20, 1.5);
        text(t, x + 24, ry + 2, {sz: SUB, wt: 600, maxW: w - 150});
        text(v, x + w - 14, ry + 3, {sz: SUB, a: C.FG_SUBTLE, right: true});
    });
}
// a whole Home: the main card's kind, the activities and the glance, in order
function home(x, y, EW, EH, hero, acts, glance, title, opts) {
    panel(x, y, EW, EH, title, opts);
    const cw = EW - 2 * PAD, ch = EH - HEAD - PAD, N = fitN(cw), row = plan(N, acts, glance);
    const units = row.reduce((a, o) => a + o.u, 0), heroH = row.length ? ch - GAP - TILE_H : ch;
    const cx = x + PAD, cy = y + HEAD;
    HEROES[hero](cx, cy, cw, heroH);
    // fewer units than N and nothing left to widen: every unit grows so the row stays full
    const u = (cw - (row.length - 1) * GAP) / units, ty = cy + heroH + GAP;
    let tx = cx;
    row.forEach(o => {
        const w = o.u * u;
        if (o.more) small(tx, ty, w, null, o.more);
        else if (o.u === 2 && o.k === 'wx') wideWx(tx, ty, w);
        else if (o.u === 2 && o.k === 'up') wideUp(tx, ty, w);
        else small(tx, ty, w, o.k);
        tx += w + GAP;
    });
    return {N, heroH, cw};
}
const note = (x, y, lines, a = .75) => lines.forEach((l, i) => text(l, x, y + i * 15, {sz: 8, a}));

// a list in place of the card and the row: a head row (‹, the title, an action), rows of 32 on one
// line (leading 20, the title 1em 600, a detail 0.85em after it, the time or value at the end)
function list(x, y, EW, EH, title, head, rows, {amber = false, action = null, bellDot = false} = {}) {
    panel(x, y, EW, EH, title, {bellDot});
    const cx = x + PAD, cw = EW - 2 * PAD, cy = y + HEAD;
    round(cx + 16, cy + 16, 'chevron-left');
    text(head, cx + 44, cy + 7, {wt: 600, rgb: amber ? C.AMBER : W1});
    if (action) round(cx + cw - 16, cy + 16, action);
    rows.forEach(([ic, t, det, end, sub], i) => {
        const ry = cy + 40 + i * 32;
        if (i % 2 === 0) fill([1, 1, 1, C.FILL1], cx, ry, cw, 32, 12);
        if (ic === 'bu') drawBu(cr, 'busy', cx + 10, ry + 6, 2); else icon(ic, cx + 12, ry + 8, 16);
        const e = text(t, cx + 40, ry + 7, {wt: 600, maxW: cw - 200});
        if (det) text(det, cx + 40 + e.width + 8, ry + 9, {sz: SUB, a: C.FG_MUTED, maxW: cw - e.width - 150});
        if (end) text(end, cx + cw - 12, ry + 9, {sz: SUB, a: C.FG_SUBTLE, right: true});
    });
}

// ---- states ---------------------------------------------------------------------------------------------
if (MODE === 'states') {
    const EW = 560, EH = 280, GX = 40, GY = 84, W = 24 + 2 * EW + GX + 24, H = 50 + 2 * (EH + GY) - 20;
    const surf = canvas(W, H), G = ['wx', 'up', 'bat'];
    const S = [
        [24, 50, 'music', ['claude'], G, 'A · Đang phát nhạc: thẻ chính là nhạc',
            ['Thẻ chính = activity đứng đầu stack, kèm nút của nó.', 'Ô = các activity còn lại, rồi phần nhìn nhanh.']],
        [24 + EW + GX, 50, 'ask', ['music'], G, 'B · Claude Code hỏi: thẻ chính chuyển sang câu hỏi',
            ['Ask đứng trước nhạc trong stack nên lên thẻ chính, có nút trả lời;', 'nhạc lùi xuống thành một ô.']],
        [24, 50 + EH + GY, 'greet', [], G, 'C · Không có gì chạy: lời chào và ngày',
            ['Thẻ chính thành lời chào, không bao giờ trống;', 'ô dư cho thời tiết nở rộng.']],
        [24 + EW + GX, 50 + EH + GY, 'music', ['missed', 'claude', 'dl', 'timer', 'call'], G, 'D · Bị nhỡ và nhiều việc: Bị nhỡ đầu tiên, dư thì +K',
            ['Bị nhỡ: nền amber 16 %; mở Home thì đèn amber tắt.', 'Nhiều activity hơn N: N − 1 ô và +K; phần nhìn nhanh nhường chỗ.']],
    ];
    S.forEach(([x, y, hero, acts, gl, t, n], i) => { home(x, y, EW, EH, hero, acts, gl, t, {bellDot: i === 3}); note(x, y + EH + 8, n); });
    surf.writeToPNG(out);
}

// ---- lists: Missed and +K ---------------------------------------------------------------------------------
if (MODE === 'lists') {
    const EW = 560, EH = 280, GX = 40, W = 24 + 3 * EW + 2 * GX + 24, H = 50 + EH + 90;
    const surf = canvas(W, H), G = ['wx', 'up', 'bat'], x0 = 24, x1 = 24 + EW + GX, x2 = 24 + 2 * (EW + GX);
    home(x0, 50, EW, EH, 'music', ['missed', 'claude', 'dl', 'timer', 'call'], G, '1 · Home: ô Bị nhỡ đầu hàng, ô +K cuối hàng', {bellDot: true});
    list(x1, 50, EW, EH, '2 · Bấm Bị nhỡ: danh sách thay thẻ chính và hàng ô', 'Bị nhỡ · 7', [
        ['bell', 'Thông báo · 3', 'Slack, Zalo, Gmail', '2:41 PM'],
        ['smartphone', 'Cuộc gọi nhỡ', 'Mira Vale · Điện thoại', '2:40 PM'],
        ['arrow-down-to-line', 'report.pdf đã tải xong', 'Tải về', '2:38 PM'],
        ['alarm', 'Pomodoro hết giờ', 'Hẹn giờ', '2:30 PM'],
        ['bu', 'Claude Code xong', 'buoy · 3 / 3', '2:12 PM']], {amber: true, action: 'xmark', bellDot: true});
    list(x2, 50, EW, EH, '3 · Bấm +K: mọi activity đang chạy, theo stack', 'Đang diễn ra · 5', [
        ['music-note', 'Lumen Coast', 'Harbor Lights', '1:24'],
        ['bu', 'Claude Code', 'Run pnpm test', '2 / 3'],
        ['arrow-down-to-line', 'report.pdf', '2.1 MB/s', '42%'],
        ['alarm', 'Pomodoro', 'vòng 2 / 4', '12:40'],
        ['smartphone', 'Mira Vale', 'đang gọi', '3:12']]);
    note(x1, 50 + EH + 8, ['Hàng 32 một dòng; bấm hàng mở chỗ của nó (thông báo → tab Thông báo, mục Nhỡ khi vắng)', 'và hàng rời danh sách; × xoá hết; ‹ hoặc Esc về Home.']);
    note(x2, 50 + EH + 8, ['Cùng khuôn danh sách; bấm hàng mở tab của activity đó.', 'Dài hơn 5 hàng thì danh sách cuộn, chỉ ở đây.']);
    note(x0, 50 + EH + 8, ['Bị nhỡ đếm cả thông báo chưa xem và việc kết thúc lúc không thấy.']);
    surf.writeToPNG(out);
}

// ---- screen recording in Home -----------------------------------------------------------------------------
if (MODE === 'screen') {
    const EW = 560, EH = 280, GX = 40, W = 24 + 2 * EW + GX + 24, H = 50 + EH + 70;
    const surf = canvas(W, H), G = ['wx', 'up', 'bat'];
    home(24, 50, EW, EH, 'rec', ['music'], G, 'A · Đang quay và nghe nhạc: bản ghi (55) là thẻ chính');
    home(24 + EW + GX, 50, EW, EH, 'ask', ['rec', 'music'], G, 'B · Claude Code hỏi lúc đang quay: bản ghi thành một ô');
    note(24, 50 + EH + 8, ['Bản ghi chưa có thẻ riêng: dùng compact của nó (leading 40, tiêu đề, đồng hồ, Dừng) đặt trong thẻ.', 'Nhạc lùi thành ô.']);
    note(24 + EW + GX, 50 + EH + 8, ['Ô: icon video, đồng hồ chạy, "Đang quay". Không có tab: bấm ô thì nó lên thẻ chính, có nút Dừng.', 'Chấm đỏ vẫn ở pill, không lặp lại trong Home.']);
    surf.writeToPNG(out);
}

// ---- anatomy --------------------------------------------------------------------------------------------
if (MODE === 'anatomy') {
    const W = 40 + 560 + 150 + 760 + 40, H = 40 + 376 + 70 + 344 + 120;
    const surf = canvas(W, H), ax = 40, ay = 70, ACTS = ['claude'], G = ['wx', 'up', 'bat'];
    const g = home(ax, ay, 560, 280, 'music', ACTS, G, '1920 · 560 × 280: N = 4');
    const vx = ax + 570;
    vdim(vx, ay, ay + 12, '12'); vdim(vx, ay + 12, ay + 44, '32 thanh tab'); vdim(vx, ay + 44, ay + 56, '12');
    vdim(vx, ay + 56, ay + 56 + g.heroH, `${g.heroH} thẻ chính = phần còn lại`);
    vdim(vx, ay + 56 + g.heroH, ay + 64 + g.heroH, '8');
    vdim(vx, ay + 64 + g.heroH, ay + 164 + g.heroH, '100 hàng ô');
    vdim(vx, ay + 268, ay + 280, '12');
    dim(ax, ax + 12, ay + 292, '12', CY, true); dim(ax + 12, ax + 548, ay + 292, '536 = 4 × 128 + 3 × 8', CY, true);
    // inside a tile: the leading box and the two lines
    const tY = ay + 56 + g.heroH + 8, tX = ax + 12;
    cr.newPath(); cr.setSourceRGBA(...CY, .6); cr.setLineWidth(.5);
    [[tX + 12, tY + 12, 20, 20], [tX + 12, tY + 40, 54, 22], [tX + 12, tY + 68, 80, 14]].forEach(r => cr.rectangle(...r)); cr.stroke();
    note(ax, ay + 314, ['Ô: leading 20 ở 12 (icon 16 ở giữa; Bu 20 lấp đầy; icon màu 24 lố 2 mỗi bên) · số 1.5em 600 ở 40 ·',
        'chú thích 0.85em fg-muted ở 68. Ô rộng từ 200: thêm cột chi tiết bên phải. Thẻ và ô: fill-1, bo 16 = 28 − 12.',
        'Ảnh bìa của thẻ nhạc: cạnh = cao thẻ − 16, tối đa 160, cách mép 8, bo 8.'], .85);
    const rx = ax, ry = ay + 380;
    ['Tính lại mỗi lần Home mở và mỗi khi stack đổi:',
     '1. N = floor((rộng nội dung + 8) / 128): số ô một hàng, mỗi ô ≥ 120.',
     '2. Thẻ chính = activity đứng đầu stack; không có → lời chào. Luôn có.',
     '3. Thẻ chính cao = nội dung − 8 − 100; dưới 160 dạng thấp, từ 160 dạng cao.',
     '4. Không có ô nào: thẻ chính cao hết phần nội dung.',
     'Không cuộn, không chỗ trống: chiều rộng chia đều cho các ô, chiều cao do thẻ chính.'].forEach((l, i) =>
        text(l, rx, ry + i * 17, {sz: 8.5, a: i ? .85 : 1, wt: i ? 400 : 700}));
    const bx = ax + 560 + 150;
    home(bx, ay, 716, 344, 'music', ACTS, G, '2560 · 716 × 344: N = 5, thẻ chính 168 (dạng cao)');
    home(bx, ay + 344 + 70, 760, 376, 'music', ACTS, G, '3440 · 760 × 376: N = 5, thẻ chính 200, ảnh bìa 160');
    surf.writeToPNG(out);
}

// ---- fill -----------------------------------------------------------------------------------------------
if (MODE === 'fill') {
    const EW = 560, EH = 280, GX = 36, GY = 80, W = 24 + 2 * EW + 760 + 2 * GX + 24, H = 50 + 2 * (EH + GY) - 10;
    const surf = canvas(W, H), c0 = 24, c1 = 24 + EW + GX, c2 = 24 + 2 * (EW + GX), r0 = 50, r1 = 50 + EH + GY;
    const S = [
        [c0, r0, EW, EH, 'greet', [], [], 'a · Không việc, không nhìn nhanh: lời chào cao hết', 'Máy bàn, không vị trí, không lịch: vẫn đầy.'],
        [c1, r0, EW, EH, 'greet', [], ['wx', 'up'], 'b · Không việc, máy bàn: thời tiết và sắp tới đều rộng', 'Sắp tới rộng: 2 sự kiện, vạch màu của lịch.'],
        [c2, r0, 760, 376, 'music', ['claude'], ['wx', 'up', 'bat'], 'c · 3440, N = 5: ô dư cho thời tiết rộng', 'Cùng quy tắc ở mọi cỡ, chỉ N đổi.'],
        [c0, r1, EW, EH, 'music', [], ['wx'], 'd · Nhạc + chỉ thời tiết: thời tiết rộng, kéo cho đầy hàng', 'Hết thứ để nở thì các ô rộng ra; ô nhỏ từ 200 thêm cột chi tiết.'],
        [c1, r1, EW, EH, 'music', ['claude'], ['wx', 'up', 'bat'], 'e · Nhạc + Claude: đủ 4 ô, không ô nào rộng', 'Thời tiết nhỏ vẫn là icon màu (24).'],
    ];
    S.forEach(([x, y, w, h, hero, acts, gl, t, n]) => { home(x, y, w, h, hero, acts, gl, t); note(x, y + h + 8, [n]); });
    const ny = r0 + 376 + 44;
    ['Cách lấp hàng ô (N ô một hàng):',
     '1. Activity trước (Bị nhỡ đầu tiên), mỗi cái một ô; nhiều hơn N: N − 1 ô và +K, nên activity luôn tới được.',
     '2. Còn chỗ: phần nhìn nhanh theo thứ tự thời tiết, sắp tới, pin, điện thoại, hẹn giờ…, mỗi cái một ô; hết chỗ thì bỏ (không vào +K).',
     '3. Còn dư: thời tiết rồi sắp tới nở thành ô rộng (2 phần). Ít hơn N phần mà không còn gì để nở: các ô rộng ra cho đầy hàng.'].forEach((l, i) =>
        text(l, c2, ny + i * 17, {sz: 8.5, wt: i ? 400 : 700, a: i ? .85 : 1, maxW: 760}));
    surf.writeToPNG(out);
}
