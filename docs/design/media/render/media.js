// The Media tab (design/media, 2026-11-13). What a click on a
// music pill or its compact opens: the expanded panel on the Media tab.
//   options — M1 (one card, as Home's main card) and M2 (no card, the art as tall as the body),
//             each with one player and with two (the players' chips above); M1 and the chips
//             chosen (Ethan, 2026-11-13)
//   anatomy — M1 at 1920 with every measure, then 2560 and 3440
//   states  — paused, no length (a stream), no cover, shuffle and repeat-one on, a player with
//             only play/pause, nothing playing
//   players — several players at once: two (one paused), three (two playing, the second
//             chosen), five (the chips past the row's width keep only their logo)
// gjs -m media.js out.png <options|anatomy|states|players>
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon, drawBu, SAMPLE, COVER} from '../../render/lib.js';
const [out, MODE = 'options'] = ARGV;

// ---- sizes (design/expanded, design/home) -----------------------------------------------------------
const HEAD = 56, PAD = 12, GAP = 8, CHIP_H = 32;
const EXP = {1920: {w: 560, h: 280}, 2560: {w: 716, h: 344}, 3440: {w: 760, h: 376}};
const W1 = C.WHITE, SUB = 9.35, CY = [.4, .85, 1];
const ALBUM = 'Ngoài Khơi · Single';

// ---- drawing ----------------------------------------------------------------------------------------
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
// a round button 32: cream for the main action, fill-2 for the others, none for a toggle
function round(cx, cy, name, kind = 'fill') {
    cr.newPath();
    if (kind === 'main') cr.setSourceRGB(...C.CREAM);
    else cr.setSourceRGBA(1, 1, 1, {flat: 0, off: 0, on: C.FILL3, offFill: C.FILL1}[kind] ?? C.FILL2);
    cr.arc(cx, cy, 16, 0, 2 * Math.PI); cr.fill();
    const a = {flat: C.FG_MUTED, off: C.FG_DISABLED, offFill: C.FG_DISABLED}[kind] ?? 1;
    icon(name, cx - 8, cy - 8, 16, kind === 'main' ? C.BLACK : W1, a);
}
function art(x, y, s, r) {
    const g = new cairo.LinearGradient(x, y, x + s, y + s);
    g.addColorStopRGB(0, ...COVER[0]); g.addColorStopRGB(1, ...COVER[1]);
    cr.newPath(); rr(x, y, s, s, r); cr.setSource(g); cr.fill();
}
function bar(x, y, w, f = .38) { fill([1, 1, 1, C.FILL3], x, y, w, 4, 2); fill([1, 1, 1, 1], x, y, w * f, 4, 2); }
function dim(a, b, y, t, col = CY) {
    cr.newPath(); cr.setSourceRGBA(...col, .9); cr.setLineWidth(.5);
    cr.moveTo(a, y); cr.lineTo(b, y); cr.moveTo(a, y - 2); cr.lineTo(a, y + 2); cr.moveTo(b, y - 2); cr.lineTo(b, y + 2); cr.stroke();
    const e = text(t, 0, 0, {sz: 6.5, wt: 600, measure: true});
    text(t, (a + b) / 2 - e.width / 2, y - e.height - 2, {sz: 6.5, wt: 600, rgb: col});
}

// the panel: r 28, the strip of 2026-11-13 with Media chosen, ⚙ alone at the right
function panel(x, y, EW, EH) {
    cr.newPath(); rr(x + .5, y + .5, EW - 1, EH - 1, 28); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke();
    const sx = x + 12, sy = y + 12;
    const tabs = [['house'], ['music-note', 'Media'], ['bell'], ['calendar'], ['display'], ['clipboard'], ['ellipsis-vertical']];
    let w = 4;
    const cells = tabs.map(([n, label]) => {
        const cw = label ? 34 + text(label, 0, 0, {sz: 9.5, wt: 600, measure: true}).width + 14 : 36;
        const c = {n, label, x: w, w: cw}; w += cw; return c;
    });
    fill([1, 1, 1, C.FILL2], sx, sy, w + 4, 32, 16);
    for (const c of cells) {
        if (c.label) {
            fill([1, 1, 1, C.FILL3], sx + c.x, sy + 4, c.w, 24, 12);
            icon(c.n, sx + c.x + 14, sy + 8); text(c.label, sx + c.x + 36, sy + 7, {sz: 9.5, wt: 600});
        } else {
            icon(c.n, sx + c.x + 10, sy + 8, 16, W1, C.FG_MUTED);
        }
    }
    round(x + EW - 12 - 16, sy + 16, 'gear');
}

// the players' chips: one per player, its name; the chosen one fill-3
// a player's logo (the app's icon; drawn here as its colour and initial)
const LOGO = {Spotify: [.11, .73, .33], Firefox: [1, .44, .22], Rhythmbox: [.95, .65, .1], VLC: [1, .53, 0], Chromium: [.26, .52, .96]};
function logo(name, x, y) {
    cr.newPath(); cr.setSourceRGB(...LOGO[name] ?? [.6, .6, .6]); cr.arc(x + 8, y + 8, 8, 0, 2 * Math.PI); cr.fill();
    const e = text(name[0], 0, 0, {sz: 7, wt: 800, measure: true});
    text(name[0], x + 8 - e.width / 2, y + 8 - e.height / 2 - 1, {sz: 7, wt: 800, rgb: C.BLACK});
}
// playing: three bars (they move only while it plays and shows, rule 8)
function eq(x, y, a) {
    [6, 10, 4].forEach((h, k) => fill([1, 1, 1, a], x + k * 4, y + 12 - h, 2.5, h, 1));
}
// The players' chips: one per player, its logo and its app's name, three bars while it plays;
// the chosen one fill-3. Past the row's width, the ones not chosen keep only their logo.
function chips(x, y, players, maxW = 536) {
    const ps = players.map((p, i) => typeof p === 'string' ? {name: p, chosen: i === 0, playing: i === 0} : p);
    const full = p => 12 + 16 + 6 + text(p.name, 0, 0, {sz: 9.5, wt: 600, measure: true}).width + (p.playing ? 8 + 10 : 0) + 14;
    const wide = ps.reduce((n, p) => n + full(p) + 6, -6) <= maxW;
    let cx = x;
    for (const p of ps) {
        const named = wide || p.chosen;
        const w = named ? full(p) : 12 + 16 + (p.playing ? 6 + 10 : 0) + 12;
        fill([1, 1, 1, p.chosen ? C.FILL3 : C.FILL2], cx, y, w, CHIP_H, 16);
        logo(p.name, cx + 12, y + 8);
        let ex = cx + 34;
        if (named) {
            const e = text(p.name, cx + 34, y + 9, {sz: 9.5, wt: 600, a: p.chosen ? 1 : C.FG_MUTED});
            ex = cx + 34 + e.width + 8;
        } else {
            ex = cx + 34;
        }
        if (p.playing)
            eq(ex, y + 10, p.chosen ? 1 : C.FG_MUTED);
        cx += w + 6;
    }
}

// the text column and the controls, from tx to x1, between y0 and y1
// o: {paused, live: false (no length: the bar can't seek), shuffle, repeat: 'off'|'all'|'one',
//     only: play/pause alone}. Every button and the bar always show; what the player can't do is
//     disabled (fg-disabled, no hover) — Ethan, 2026-11-13
function column(tx, x1, y0, y1, o = {}) {
    round(x1 - 16, y0 + 16, 'arrow-up-right-from-square');
    text(o.title ?? SAMPLE.track, tx, y0 + 2, {sz: 14, wt: 700, maxW: x1 - 40 - tx});
    text(o.sub ?? SAMPLE.sub, tx, y0 + 26, {sz: SUB, a: C.FG_MUTED, maxW: x1 - 40 - tx});
    if (o.album !== null)
        text(o.album ?? ALBUM, tx, y0 + 42, {sz: SUB, a: C.FG_SUBTLE, maxW: x1 - 40 - tx});
    const ty = y1 - 32;                                  // the transport row, 32
    const by = ty - 30;                                  // the bar, its times under it
    if (o.live !== false) {
        bar(tx, by, x1 - tx);
        text('1:24', tx, by + 8, {sz: SUB, a: C.FG_SUBTLE}); text('-2:11', x1, by + 8, {sz: SUB, a: C.FG_SUBTLE, right: true});
    } else {      // no length: the bar empty and disabled, no times to tell
        fill([1, 1, 1, C.FILL2], tx, by, x1 - tx, 4, 2);
        text('--:--', tx, by + 8, {sz: SUB, a: C.FG_DISABLED}); text('--:--', x1, by + 8, {sz: SUB, a: C.FG_DISABLED, right: true});
    }
    const mid = (tx + x1) / 2;
    const play = o.paused ? 'play-fill' : 'pause-fill';
    const off = o.only === true;
    const row = [
        ['shuffle', off ? 'off' : o.shuffle ? 'on' : 'flat'], ['backward-step-fill', off ? 'offFill' : 'fill'], [play, 'main'],
        ['forward-step-fill', off ? 'offFill' : 'fill'],
        [o.repeat === 'one' ? 'repeat-1' : 'repeat', off ? 'off' : o.repeat && o.repeat !== 'off' ? 'on' : 'flat'],
    ];
    row.forEach(([n, k], i) => round(mid + (i - (row.length - 1) / 2) * 44, ty + 16, n, k));
    return {ty, by, mid};
}

// M1: one card (fill-1, r 16) as Home's main card, the art 8 in, r 8
function m1(x, y, EW, EH, players, o = {}) {
    panel(x, y, EW, EH);
    if (o.empty) {
        // nothing playing: Bu at rest and one line, centred in the body (EmptyState)
        const cy = y + HEAD + (EH - HEAD - PAD) / 2;
        drawBu(cr, 'idle', x + EW / 2 - 20, cy - 34, 40 / 16);
        const e = text('Nothing playing', 0, 0, {sz: 10, measure: true});
        text('Nothing playing', x + EW / 2 - e.width / 2, cy + 14, {sz: 10, a: C.FG_SUBTLE});
        return {art: 0};
    }
    let by = y + HEAD;
    const bw = EW - 2 * PAD, bh0 = EH - HEAD - PAD;
    if (players.length > 1) { chips(x + PAD, by, players); by += CHIP_H + GAP; }
    const bh = bh0 - (by - y - HEAD);
    fill([1, 1, 1, C.FILL1], x + PAD, by, bw, bh, 16);
    const s = bh - 16;
    if (o.noArt) {          // no cover: fill-2 and the note, the art's size and place
        fill([1, 1, 1, C.FILL2], x + PAD + 8, by + 8, s, s, 8);
        icon('music-note', x + PAD + 8 + s / 2 - 16, by + 8 + s / 2 - 16, 32, W1, C.FG_SUBTLE);
    } else {
        art(x + PAD + 8, by + 8, s, 8);
    }
    const col = column(x + PAD + 8 + s + 16, x + PAD + bw - 12, by + 12, by + bh - 12, o);
    return {art: s, card: {x: x + PAD, y: by, w: bw, h: bh}, tx: x + PAD + 8 + s + 16, x1: x + PAD + bw - 12, ...col};
}

// M2: no card; the art as tall as the body (at most 0.4 of its width), r 16, the column beside it
function m2(x, y, EW, EH, players) {
    panel(x, y, EW, EH);
    let by = y + HEAD;
    const bw = EW - 2 * PAD, bh0 = EH - HEAD - PAD;
    if (players.length > 1) { chips(x + PAD, by, players); by += CHIP_H + GAP; }
    const bh = bh0 - (by - y - HEAD);
    const s = Math.min(bh, Math.floor(bw * .4));
    art(x + PAD, by, s, 16);
    column(x + PAD + s + 16, x + PAD + bw, by + 4, by + bh);
    return {art: s};
}

if (MODE === 'options') {
    const {w: EW, h: EH} = EXP[1920];
    const surf = canvas(40 + EW + 60 + EW + 40, 40 + 2 * (30 + EH) + 40 + 70);
    const cols = [[40, 'M1 — một thẻ như thẻ chính của Home (đề xuất)', m1], [40 + EW + 60, 'M2 — không thẻ, ảnh bìa cao bằng thân (như nay)', m2]];
    for (const [cx, title, draw] of cols) {
        text(title, cx, 24, {sz: 12, wt: 700});
        const a = draw(cx, 56, EW, EH, [SAMPLE.app]);
        text(`Một player: ảnh ${a.art}`, cx, 56 + EH + 8, {sz: 9, a: .75});
        const b = draw(cx, 56 + EH + 50, EW, EH, [SAMPLE.app, 'Firefox']);
        text(`Hai player: chip ở trên, ảnh ${b.art}`, cx, 56 + 2 * EH + 58, {sz: 9, a: .75});
    }
    text('Cả hai ở 1920 (560 × 280, thân 212). Nút ↗ mở cửa sổ player; shuffle và repeat là nút bật/tắt không nền; ⏯ kem. ' +
        'M1 cùng một kiểu với thẻ chính của Home nên pill → Home và pill → tab Media đi tới cùng một dạng (Motion: phần chung).',
    40, 56 + 2 * EH + 84, {sz: 9, a: .8, maxW: 2 * EW + 60});
    surf.writeToPNG(out);
}

const RD = [1, .45, .45];
function vdim(x, a, b, t, col = RD) {
    cr.newPath(); cr.setSourceRGBA(...col, .9); cr.setLineWidth(.5);
    cr.moveTo(x, a); cr.lineTo(x, b); cr.moveTo(x - 2, a); cr.lineTo(x + 2, a); cr.moveTo(x - 2, b); cr.lineTo(x + 2, b); cr.stroke();
    const e = text(t, 0, 0, {sz: 6.5, wt: 600, measure: true});
    text(t, x + 4, (a + b) / 2 - e.height / 2, {sz: 6.5, wt: 600, rgb: col});
}

if (MODE === 'anatomy') {
    const A = EXP[1920], B = EXP[2560], D = EXP[3440], sc = .55;
    const y2 = 70 + A.h + 120;
    const surf = canvas(Math.max(40 + A.w + 80, 40 + B.w * sc + 30 + D.w * sc + 40), y2 + D.h * sc + 50);
    text('1920 (560 × 280): thân 212, thẻ 536 × 212, ảnh 196', 40, 24, {sz: 12, wt: 700});
    const x = 40, y = 70;
    const g = m1(x, y, A.w, A.h, [SAMPLE.app]);
    const c = g.card;
    vdim(c.x + c.w + 18, c.y, c.y + c.h, `${c.h}`);
    vdim(c.x + 4, c.y, c.y + 8, '8', CY);
    dim(c.x + 8 + g.art, g.tx, c.y + 60, '16');
    vdim(g.x1 + 6, c.y, c.y + 12, '12', CY);
    vdim(g.x1 + 6, c.y + c.h - 12, c.y + c.h, '12', CY);
    dim(g.mid + 22 - 16, g.mid + 22 + 16, g.ty - 4, '32');
    dim(c.x + 8, c.x + 8 + g.art, c.y + c.h + 22, `ảnh ${g.art}, bo 8, cách mép 8`);
    dim(c.x, c.x + c.w, c.y + c.h + 44, `thẻ ${c.w}, fill-1, bo 16`);
    text('tên 1.27em 700 · nghệ sĩ · app 0.85em fg-muted · album 0.85em fg-subtle · ↗ tròn 32 góc phải', x, c.y + c.h + 54, {sz: 7.5, a: .8});
    text('thanh cao 4, giờ 0.85em fg-subtle dưới thanh · nút cách nhau 44 (32 + 12), ⏯ kem, ⏮ ⏭ fill-2, shuffle và repeat không nền khi tắt',
        x, c.y + c.h + 68, {sz: 7.5, a: .8});
    text('2560 (716 × 344): ảnh 260', 40, y2 - 22, {sz: 10, wt: 700});
    cr.save(); cr.translate(40, y2); cr.scale(sc, sc); m1(0, 0, B.w, B.h, [SAMPLE.app]); cr.restore();
    const x3 = 40 + B.w * sc + 30;
    text('3440 (760 × 376): ảnh 292', x3, y2 - 22, {sz: 10, wt: 700});
    cr.save(); cr.translate(x3, y2); cr.scale(sc, sc); m1(0, 0, D.w, D.h, [SAMPLE.app]); cr.restore();
    text('Thẻ lấy hết thân (cao − 56 − 12); ảnh = cao thẻ − 16. Cột chữ lấy phần còn lại (300 ở 1920, 408 ở 3440).',
        40, y2 + D.h * sc + 16, {sz: 8.5, a: .8});
    surf.writeToPNG(out);
}

if (MODE === 'states') {
    const {w: EW, h: EH} = EXP[1920];
    const surf = canvas(40 + EW + 60 + EW + 40, 40 + 3 * (30 + EH + 30) + 30);
    const S = [
        ['Tạm dừng: ⏯ thành ▶', {paused: true}],
        ['Không có thời lượng (radio, trực tiếp): thanh rỗng, không kéo được', {live: false, title: 'Radio Mùa Thu', sub: 'VOV3 · Rhythmbox', album: null}],
        ['Không có ảnh bìa: ô fill-2 với nốt nhạc, cùng cỡ và chỗ', {noArt: true}],
        ['Trộn bài bật, lặp một bài: nền fill-3, icon trắng', {shuffle: true, repeat: 'one'}],
        ['Player chỉ có phát/dừng (trang web): các nút khác mờ, không bấm được', {only: true, live: false, title: 'Video không tên', sub: 'Firefox', album: null, noArt: true}],
        ['Không có gì phát', {empty: true}],
    ];
    S.forEach(([cap, o], i) => {
        const x = 40 + (i % 2) * (EW + 60), y = 40 + Math.floor(i / 2) * (30 + EH + 30) + 30;
        text(cap, x, y - 22, {sz: 9.5, wt: 700});
        m1(x, y, EW, EH, [SAMPLE.app], o);
    });
    surf.writeToPNG(out);
}

if (MODE === 'players') {
    const {w: EW, h: EH} = EXP[1920];
    const surf = canvas(40 + EW + 60 + EW + 40, 40 + 2 * (30 + EH + 30) + 70);
    const P = [
        ['Hai player: Spotify đang phát, Firefox đang dừng', [
            {name: 'Spotify', chosen: true, playing: true}, {name: 'Firefox'}], {}],
        ['Ba player, hai đang phát; chọn Firefox (mở từ pill của nó)', [
            {name: 'Spotify', playing: true}, {name: 'Firefox', chosen: true, playing: true}, {name: 'Rhythmbox'}],
        {title: 'Tiếng Sóng Biển 10 Giờ', sub: 'YouTube · Firefox', album: null}],
        ['Năm player: không đủ chỗ, chip không chọn chỉ còn logo', [
            {name: 'Spotify', chosen: true, playing: true}, {name: 'Firefox', playing: true}, {name: 'Rhythmbox'},
            {name: 'VLC'}, {name: 'Chromium', playing: true}], {}],
    ];
    P.forEach(([cap, players, o], i) => {
        const x = 40 + (i % 2) * (EW + 60), y = 40 + Math.floor(i / 2) * (30 + EH + 30) + 30;
        text(cap, x, y - 22, {sz: 9.5, wt: 700});
        panel(x, y, EW, EH);
        // the chips row, then the card 40 lower (m1 draws the card under its own chips; redraw them here)
        m1(x, y, EW, EH, players.map(p => p.name), o);
        fill([0, 0, 0, 1], x + PAD, y + HEAD, EW - 2 * PAD, CHIP_H, 0);
        chips(x + PAD, y + HEAD, players, EW - 2 * PAD);
    });
    const x = 40 + EW + 60, y = 40 + (30 + EH + 30) + 30;
    text('Luật', x, y - 4, {sz: 11, wt: 700});
    [
        'Mỗi player một chip, theo thứ tự của stack: đang phát trước, rồi đang dừng.',
        'Chip: logo app 16, tên app, ba vạch nhỏ khi đang phát (chỉ chạy khi phát và đang hiện).',
        'Chip đang chọn fill-3, chữ trắng; chip khác fill-2, chữ fg-muted.',
        'Mở từ pill nào thì chọn player đó; bấm chip để đổi, thẻ fade-out / fade-in, không đổi cỡ.',
        'Không đủ chỗ: chip không chọn chỉ còn logo (và ba vạch nếu đang phát); chip đang chọn luôn đủ tên.',
        'Một player: không có hàng chip, thẻ cao hết thân.',
    ].forEach((t, k) => text(`• ${t}`, x, y + 22 + k * 30, {sz: 9, a: .85, maxW: EW}));
    surf.writeToPNG(out);
}
