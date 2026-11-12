// Motion (design/motion, 2026-11-12, Ethan: the Dynamic Island style): springs set by a perceived
// duration d and a bounce (WWDC23 "Animate with springs": m 1, k (2π/d)², c (1 − bounce)·4π/d).
// Every frame here is computed from those springs, so the drawings match the table.
//   curves   — the five springs beside today's EASE_OUT_BACK 460 ms
//   compact  — pill → compact (move), compact → pill (close), frame by frame; shared parts travel
//   expanded — pill and two side pills → expanded (open, move), and back (close)
//   tabs     — a tab switch (snap: the selection slides, the body shifts by its direction), a list
//              opened in place (move)
// gjs -m motion.js out.png <curves|compact|expanded|tabs>
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, COVER, icon, SAMPLE} from '../../render/lib.js';
const [out, MODE] = ARGV;
// stills at 3× (lib.js SCALE); the clips at 2×, frames for scripts/render-design.sh to encode
const S = MODE.startsWith('clip-') ? 2 : SC;

// ---- the springs (design/motion "Lò xo và độ mờ") --------------------------------------------------
const SPRING = {
    snap: {d: .24, bounce: .15}, size: {d: .24, bounce: 0}, move: {d: .40, bounce: .20},
    open: {d: .50, bounce: .25}, close: {d: .36, bounce: 0},
};
// position at t s of a spring from 0 to 1, starting at rest
function spring({d, bounce}) {
    const w = 2 * Math.PI / d, z = 1 - bounce;
    if (z >= 1)
        return t => 1 - Math.exp(-w * t) * (1 + w * t);
    const wd = w * Math.sqrt(1 - z * z), k = z / Math.sqrt(1 - z * z);
    return t => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + k * Math.sin(wd * t));
}
const backOut = t => { // Clutter's EASE_OUT_BACK, s = 1.70158
    const u = Math.min(1, t) - 1;
    return u * u * (2.70158 * u + 1.70158) + 1;
};
const easeOut = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const lerp = (a, b, x) => a + (b - a) * x;
const clamp01 = v => Math.min(1, Math.max(0, v));
// fade-out 100 ms, fade-in 200 ms (after a start), ease-out
const fadeOut = ms => 1 - easeOut(ms / 100);
const fadeIn = (ms, from) => easeOut((ms - from) / 200);

// ---- drawing --------------------------------------------------------------------------------------
const W1 = C.WHITE, SUB = 9.35;
let cr, L;
function canvas(W, H) {
    const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * S, H * S);
    cr = new cairo.Context(surf); cr.scale(S, S); cr.setSourceRGB(...C.WALL); cr.paint();
    L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
    if (!PILL.w) {
        TITLE_W = text(SAMPLE.track, 0, 0, {sz: 11, wt: 600, measure: true}).width;
        PILL.w = Math.ceil(PILL.title.x + TITLE_W + text(BY, 0, 0, {sz: 11, wt: 600, measure: true}).width + 6 + 18 + 8);
    }
    return surf;
}
function text(t, x, y, {sz = 11, wt = 400, rgb = W1, a = 1, right = false, centre = false, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
    L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    const e = L.get_pixel_extents()[1];
    if (!measure) {
        cr.setSourceRGBA(...rgb, a);
        cr.moveTo(right ? x - e.width : centre ? x - e.width / 2 : x, y); PangoCairo.show_layout(cr, L);
    }
    return e;
}
function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (rgba, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgba); cr.fill(); };
// the island's shape: black, 1 px border inside; bo follows the height (min(h/2, 28))
function shape(x, y, w, h, alpha = 1) {
    const r = Math.min(h / 2, 28);
    cr.newPath(); rr(x + .5, y + .5, w - 1, h - 1, r - .5); cr.setSourceRGBA(0, 0, 0, alpha); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER * alpha); cr.setLineWidth(1); cr.stroke();
}
function clipTo(x, y, w, h) { cr.newPath(); rr(x, y, w, h, Math.min(h / 2, 28)); cr.clip(); }
const art = (x, y, s, a = 1) => { // the sample cover (lib.js COVER)
    const g = new cairo.LinearGradient(x, y, x + s, y + s); g.addColorStopRGBA(0, ...COVER[0], a); g.addColorStopRGBA(1, ...COVER[1], a);
    cr.newPath(); rr(x, y, s, s, s / 4); cr.setSource(g); cr.fill();
};
const caption = (t, x, y, opts = {}) => text(t, x, y, {sz: 8, a: .8, ...opts});
function title(t, x, y, maxW = 0) {
    if (maxW) { L.set_width(maxW * Pango.SCALE); L.set_wrap(Pango.WrapMode.WORD); }
    text(t, x, y, {sz: 9, wt: 700});
    L.set_width(-1);
}

// ---- curves --------------------------------------------------------------------------------------
function curves() {
    const W = 980, H = 420, surf = canvas(W, H);
    const gx = 60, gy = 48, gw = 600, gh = 300, T = 0.9, lo = -0.08, hi = 1.16;
    const X = t => gx + t / T * gw, Y = v => gy + (hi - v) / (hi - lo) * gh;
    title('Năm lò xo của Buoy (tiến trình theo thời gian), cạnh EASE_OUT_BACK 460 ms đang dùng', 24, 14);
    fill([1, 1, 1, .04], gx, gy, gw, gh, 6);
    cr.setLineWidth(1);
    for (const v of [0, .5, 1]) {
        cr.setSourceRGBA(1, 1, 1, v === 1 ? .35 : .12); cr.moveTo(gx, Y(v)); cr.lineTo(gx + gw, Y(v)); cr.stroke();
        caption(v === 1 ? 'đích' : `${v * 100} %`, gx - 6, Y(v) - 6, {right: true});
    }
    for (let ms = 0; ms <= 900; ms += 100) {
        cr.setSourceRGBA(1, 1, 1, .08); cr.moveTo(X(ms / 1000), gy); cr.lineTo(X(ms / 1000), gy + gh); cr.stroke();
        caption(`${ms}`, X(ms / 1000), gy + gh + 6, {centre: true});
    }
    caption('ms', gx + gw + 10, gy + gh + 6);
    const plot = (f, rgb, a, dash) => {
        cr.newPath(); cr.setSourceRGBA(...rgb, a); cr.setLineWidth(2); cr.setDash(dash ?? [], 0);
        for (let i = 0; i <= 900; i++) { const t = i / 1000, v = f(t); if (i) cr.lineTo(X(t), Y(v)); else cr.moveTo(X(t), Y(v)); }
        cr.stroke(); cr.setDash([], 0);
    };
    // line colours tell the curves apart only (not state colours)
    const LINES = {
        open: [[.45, .75, 1], 1], move: [C.CREAM, 1], snap: [[.55, .95, .85], 1],
        size: [[.8, .7, 1], 1], close: [[1, 1, 1], .55],
    };
    plot(t => backOut(t / .46), [1, 1, 1], .35, [5, 4]);
    for (const [n, [rgb, a]] of Object.entries(LINES))
        plot(spring(SPRING[n]), rgb, a);
    // the legend: name, d, bounce, overshoot, when it settles
    const lx = gx + gw + 36;
    title('Lò xo', lx, gy - 6);
    let ly = gy + 16;
    const settle = s => { const f = spring(s); let last = 0; for (let ms = 0; ms < 3000; ms++) if (Math.abs(1 - f(ms / 1000)) > 1 / 800) last = ms + 1; return last; };
    const peak = s => { const f = spring(s); let p = 0; for (let ms = 0; ms < 3000; ms++) p = Math.max(p, f(ms / 1000)); return p - 1; };
    for (const n of ['open', 'move', 'snap', 'size', 'close']) {
        const [rgb, a] = LINES[n], s = SPRING[n];
        cr.setSourceRGBA(...rgb, a); cr.setLineWidth(2); cr.moveTo(lx, ly + 7); cr.lineTo(lx + 20, ly + 7); cr.stroke();
        text(n, lx + 28, ly, {sz: 9.5, wt: 700});
        caption(`d ${s.d * 1000} ms · bounce ${s.bounce} · vọt ${(peak(s) * 100).toFixed(1)} % · lắng ${settle(s)} ms`, lx + 28, ly + 15);
        ly += 40;
    }
    cr.setSourceRGBA(1, 1, 1, .35); cr.setDash([5, 4], 0); cr.moveTo(lx, ly + 7); cr.lineTo(lx + 20, ly + 7); cr.stroke(); cr.setDash([], 0);
    text('EASE_OUT_BACK', lx + 28, ly, {sz: 9.5, wt: 700, a: .7});
    caption('460 ms · vọt 10 % · đang dùng', lx + 28, ly + 15);
    ['Nở (open, move, snap) nảy nhẹ; thu và đổi cỡ (close, size) không nảy. d là lúc chuyển động trông đã xong;',
        'lắng là khi còn cách đích dưới 0.5 px trên quãng 400 px. Vọt quá: expanded rộng 12 px, compact rộng 4 px.',
    ].forEach((l, i) => caption(l, 24, gy + gh + 32 + i * 14));
    surf.writeToPNG(out);
}

// ---- compact and expanded: shared parts travel ----------------------------------------------------
// Each form lays out the parts it shares with the others (leading, title) relative to its own top
// left; during a morph a shared part goes from its place in one form to its place in the other on
// the same spring as the background (design/motion: "Phần chung đi tới chỗ mới"). The rest fades out
// (what leaves) or is uncovered by the background's edge (what arrives).
// The pill is as wide as its content (minimal is content-fit up to its cap, design/tokens): light and
// art, its text "title · artist" (media/adapter.js), the equaliser, the margin. The title travels;
// " · artist" is the pill's own and fades like the light.
// Measured on the canvas it is drawn on (canvas() sets them once): text laid out at 3× is a little
// wider than hinted at 1×, and " · artist" must start where the drawn title ends.
const BY = ` · ${SAMPLE.artist}`;
let TITLE_W = 0;
const PILL = {w: 0, h: 32, lead: {x: 28, y: 4, s: 24}, title: {x: 58, y: 8, sz: 11}};
const COMPACT = {w: 404, h: 88, lead: {x: 14, y: 8, s: 40}, title: {x: 66, y: 10, sz: 11}};
const EXP = {w: 560, h: 280, lead: {x: 20, y: 64, s: 88}, title: {x: 120, y: 74, sz: 13}};
function shared(cx, y, from, to, x, a = 1) {
    const at = (f, k) => ({x: cx - f.w / 2 + f[k].x, y: y + f[k].y});
    const l0 = at(from, 'lead'), l1 = at(to, 'lead'), t0 = at(from, 'title'), t1 = at(to, 'title');
    art(lerp(l0.x, l1.x, x), lerp(l0.y, l1.y, x), lerp(from.lead.s, to.lead.s, x), a);
    text(SAMPLE.track, lerp(t0.x, t1.x, x), lerp(t0.y, t1.y, x), {sz: lerp(from.title.sz, to.title.sz, x), wt: 600, a});
}
function pillRest(cx, y, a) { // the light, " · artist" and the equaliser: only the pill has them
    if (a <= 0) return;
    const x = cx - PILL.w / 2;
    fill([...C.AMBER, a], x + 12, y + 12, 8, 8, 4);
    text(BY, x + PILL.title.x + TITLE_W, y + PILL.title.y, {sz: 11, wt: 600, a});
    for (let i = 0; i < 4; i++) fill([1, 1, 1, a], x + PILL.w - 26 + i * 5, y + 11 + (i % 2) * 3, 3, 10 - (i % 2) * 3, 1);
}
function compactRest(cx, y, a) { // the subtitle and the bar: only the compact has them
    if (a <= 0) return;
    const x = cx - COMPACT.w / 2;
    text(SAMPLE.sub, x + 66, y + 30, {sz: SUB, a: a * C.FG_MUTED});
    fill([1, 1, 1, .2 * a], x + 66, y + 64, COMPACT.w - 66 - 18, 4, 2);
    fill([1, 1, 1, a], x + 66, y + 64, (COMPACT.w - 84) * .38, 4, 2);
}
const REST = {pill: pillRest, compact: compactRest, expanded: (cx, y, a) => panel(cx, y, a)};
// travel false: today's rule (SPEC §5), the shared parts leave and arrive like the rest
function morph(fx, fy, cw, from, to, x, ms, rest, travel = true) {
    const w = lerp(from.w, to.w, x), h = lerp(from.h, to.h, x), cx = fx + cw / 2;
    shape(cx - w / 2, fy, w, h);
    cr.save(); clipTo(cx - w / 2, fy, w, h);
    const leave = fadeOut(ms), arrive = clamp01((x - .5) / .5);
    rest.from(cx, fy, leave);                     // what only the old form has leaves at once
    rest.to(cx, fy, arrive);                      // what only the new one has is uncovered
    if (travel) {
        shared(cx, fy, from, to, x);              // the shared parts travel with the background
    } else {
        if (leave > 0) shared(cx, fy, from, from, 0, leave);
        if (arrive > 0) shared(cx, fy, to, to, 0, arrive);
    }
    cr.restore();
}
function compact() {
    const CW = 420, W = 24 + 3 * CW + 2 * 12 + 24, H = 2 * (34 + 2 * 140) + 40, surf = canvas(W, H);
    const rows = [
        {t: 'Rê chuột 300 ms → compact: nền nở bằng move (400 ms, bounce 0.2); leading và tên đi tới chỗ mới cùng nền; đèn và equaliser đi bằng fade-out; phụ đề và thanh lộ theo mép nền',
            spring: SPRING.move, from: PILL, to: COMPACT, ms: [0, 60, 120, 200, 300, 450], rest: {from: pillRest, to: compactRest}},
        {t: 'Rời chuột (sau 200 ms ân hạn) → pill: close (360 ms, không nảy); leading và tên về chỗ cũ; phụ đề và thanh đi bằng fade-out; đèn và equaliser hiện lại từ nửa đường',
            spring: SPRING.close, from: COMPACT, to: PILL, ms: [0, 50, 100, 160, 240, 400], rest: {from: compactRest, to: pillRest}},
    ];
    rows.forEach((r, ri) => {
        const y0 = 16 + ri * (34 + 2 * 140 + 20);
        title(r.t, 24, y0, W - 48);
        const f = spring(r.spring);
        r.ms.forEach((ms, i) => {
            const x = f(ms / 1000), fx = 24 + (i % 3) * (CW + 12), fy = y0 + 40 + Math.floor(i / 3) * 140;
            fill([1, 1, 1, .03], fx, fy - 6, CW, 120, 8);
            morph(fx, fy, CW, r.from, r.to, x, ms, r.rest);
            caption(`${ms} ms · ${Math.round(x * 100)} %`, fx + 4, fy + 120);
        });
    });
    surf.writeToPNG(out);
}

// the tab strip and Home (main card over the tiles) at their final place, without the shared parts
function panel(cx, y, a) {
    if (a <= 0) return;
    const x = cx - EXP.w / 2;
    fill([1, 1, 1, .11 * a], x + 12, y + 12, 236, 32, 16);
    fill([1, 1, 1, .20 * a], x + 16, y + 16, 64, 24, 12);
    icon(cr, 'house', x + 24, y + 20, 16, W1, a); text('Home', x + 44, y + 20, {sz: 9.5, wt: 600, a});
    ['music-note', 'bell', 'arrow-down-to-line', 'calendar', 'ellipsis-vertical'].forEach((n, i) =>
        icon(cr, n, x + 92 + i * 30, y + 20, 16, W1, a * C.FG_MUTED));
    fill([1, 1, 1, .12 * a], x + EXP.w - 44, y + 12, 32, 32, 16);
    icon(cr, 'gear', x + EXP.w - 36, y + 20, 16, W1, a);
    fill([1, 1, 1, .08 * a], x + 12, y + 56, EXP.w - 24, 104, 16);
    text(SAMPLE.artist, x + 120, y + 96, {sz: SUB, a: a * C.FG_MUTED});
    for (let i = 0; i < 4; i++) fill([1, 1, 1, .08 * a], x + 12 + i * (128 + 2), y + 168, 128 - 6, 100, 16);
}
function expanded() {
    const CW = 760, W = 24 + 3 * CW + 2 * 12 + 24, H = 2 * (40 + 2 * 330) + 40, surf = canvas(W, H);
    const SIDE = 131, GAP = 8;
    const rows = [
        {t: 'Bấm → expanded: nền nở bằng open (500 ms, bounce 0.25); ảnh và tên của pill đi tới thẻ chính của Home; thanh tab và phần còn lại lộ theo mép nền; hai pill phụ trượt vào giữa bằng move và mờ ở nửa sau',
            spring: SPRING.open, from: PILL, to: EXP, ms: [0, 80, 160, 260, 400, 640], open: true, rest: {from: pillRest, to: REST.expanded}},
        {t: 'Thu về: nền thu bằng close (360 ms, không nảy); ảnh và tên về pill; phần còn lại đi bằng fade-out; đèn và equaliser hiện lại; pill phụ trượt ra và hiện lại',
            spring: SPRING.close, from: EXP, to: PILL, ms: [0, 60, 120, 200, 300, 480], open: false, rest: {from: REST.expanded, to: pillRest}},
    ];
    rows.forEach((r, ri) => {
        const y0 = 16 + ri * (40 + 2 * 330 + 20);
        title(r.t, 24, y0, W - 48);
        const f = spring(r.spring), side = spring(SPRING.move);
        r.ms.forEach((ms, i) => {
            const x = f(ms / 1000), fx = 24 + (i % 3) * (CW + 12), fy = y0 + 46 + Math.floor(i / 3) * 330, cx = fx + CW / 2;
            fill([1, 1, 1, .03], fx, fy - 6, CW, 310, 8);
            // the side pills: from their slots to the centre (merge) or back, fading in their last half
            const s = side(ms / 1000), m = r.open ? s : 1 - s;
            const sa = r.open ? clamp01(1 - (s - .5) / .5) : clamp01((s - .5) / .5);
            for (let k = 0; k < 2; k++) {
                const slot = cx + PILL.w / 2 + GAP + k * (SIDE + GAP) + SIDE / 2;
                const sx = lerp(slot, cx, m);
                if (sa > 0) {
                    shape(sx - SIDE / 2, fy, SIDE, 32, sa);
                    fill([1, 1, 1, .3 * sa], sx - SIDE / 2 + 10, fy + 8, 16, 16, 4);
                }
            }
            morph(fx, fy, CW, r.from, r.to, x, ms, r.rest);
            caption(`${ms} ms · ${Math.round(x * 100)} %`, fx + 4, fy + 296);
        });
    });
    surf.writeToPNG(out);
}

// ---- tabs ----------------------------------------------------------------------------------------
// The strip as design/tabs: 32 high, the chosen tab fill-3 24 high at 4 with icon + name, the
// others icon only in cells of 36.
const TABS = [['house', 'Home'], ['music-note', 'Media'], ['bell', 'Thông báo'], ['arrow-down-to-line', 'Tải về'], ['calendar', 'Lịch']];
function stripLayout(chosen) { // x and width of each tab when `chosen` shows its name
    let x = 4;
    return TABS.map(([, name], i) => {
        const w = i === chosen ? 8 + 16 + 6 + text(name, 0, 0, {sz: 9.5, wt: 600, measure: true}).width + 10 : 36;
        const o = {x, w}; x += w; return o;
    });
}
function strip(x0, y0, from, to, p, ms) {
    const A = stripLayout(from), B = stripLayout(to);
    const total = lerp(A.at(-1).x + A.at(-1).w, B.at(-1).x + B.at(-1).w, p) + 4;
    fill([1, 1, 1, .11], x0, y0, total, 32, 16);
    const sel = {x: lerp(A[from].x, B[to].x, p), w: lerp(A[from].w, B[to].w, p)};
    fill([1, 1, 1, .20], x0 + sel.x, y0 + 4, sel.w, 24, 12);
    TABS.forEach(([ic, name], i) => {
        const tx = lerp(A[i].x, B[i].x, p), tw = lerp(A[i].w, B[i].w, p);
        const on = from === to ? (i === to ? 1 : 0) : i === from ? fadeOut(ms) : i === to ? fadeIn(ms, 0) : 0;
        icon(cr, ic, x0 + tx + (i === from || i === to ? 8 : 10), y0 + 8, 16, W1, lerp(C.FG_MUTED, 1, on));
        if (on > 0) { // the name stays inside its cell as the cell narrows or widens
            cr.save(); cr.newPath(); cr.rectangle(x0 + tx + 28, y0, Math.max(0, tw - 34), 32); cr.clip();
            text(name, x0 + tx + 30, y0 + 8, {sz: 9.5, wt: 600, a: on});
            cr.restore();
        }
    });
}
function body(x, y, w, h, kind, a, dx) {
    if (a <= 0) return;
    cr.save(); cr.translate(dx, 0);
    if (kind === 'home') {
        fill([1, 1, 1, .08 * a], x, y, w, 60, 16); art(x + 8, y + 8, 44, a);
        text(SAMPLE.track, x + 62, y + 14, {sz: 10, wt: 700, a});
        for (let i = 0; i < 3; i++) fill([1, 1, 1, .08 * a], x + i * (w / 3), y + 68, w / 3 - 6, 48, 12);
    } else {
        art(x + 8, y + 4, 96, a);
        text(SAMPLE.track, x + 116, y + 20, {sz: 12, wt: 700, a});
        text(SAMPLE.artist, x + 116, y + 40, {sz: SUB, a: a * C.FG_MUTED});
        fill([1, 1, 1, .2 * a], x + 116, y + 74, w - 124, 4, 2);
    }
    cr.restore();
}
function tabs() {
    const CW = 360, W = 24 + 5 * CW + 4 * 12 + 24, H = 520, surf = canvas(W, H);
    const f = spring(SPRING.snap);
    title('Đổi tab Home → Media: vạch chọn trượt và đổi rộng bằng snap (240 ms); tên đổi bằng fade; thân cũ lùi 12 px sang trái, thân mới tới từ 12 px bên phải', 24, 16);
    [0, 40, 80, 140, 240].forEach((ms, i) => {
        const p = f(ms / 1000), fx = 24 + i * (CW + 12), fy = 50;
        shape(fx, fy, CW, 180);
        strip(fx + 12, fy + 12, 0, 1, p, ms);
        cr.save(); clipTo(fx, fy, CW, 180);
        body(fx + 12, fy + 56, CW - 24, 120, 'home', fadeOut(ms), -12 * p);
        body(fx + 12, fy + 56, CW - 24, 120, 'media', fadeIn(ms, 0) * clamp01(p * 1.2), 12 * (1 - p));
        cr.restore();
        caption(`${ms} ms · ${Math.round(p * 100)} %`, fx + 4, fy + 188);
    });
    title('Danh sách tại chỗ (Bị nhỡ, +K): tới từ 24 px bên phải bằng move và fade-in; ‹ đi ngược lại', 24, 270);
    const g = spring(SPRING.move);
    [0, 60, 120, 200, 400].forEach((ms, i) => {
        const p = g(ms / 1000), fx = 24 + i * (CW + 12), fy = 304;
        shape(fx, fy, CW, 180);
        cr.save(); clipTo(fx, fy, CW, 180);
        body(fx + 12, fy + 56, CW - 24, 120, 'home', fadeOut(ms), 0);
        const a = fadeIn(ms, 0), dx = 24 * (1 - p);
        cr.save(); cr.translate(dx, 0);
        if (a > 0) {
            text('‹', fx + 16, fy + 14, {sz: 13, wt: 700, a});
            text('Bị nhỡ · 7', fx + 32, fy + 16, {sz: 10, wt: 700, a});
            for (let k = 0; k < 4; k++) {
                fill([...C.AMBER, .9 * a], fx + 16, fy + 50 + k * 32, 16, 16, 8);
                text(['Thông báo · 3', 'Tải xong: report.pdf', 'Hẹn giờ: Trà', 'Claude Code xong'][k], fx + 44, fy + 50 + k * 32, {sz: 9.5, wt: 600, a});
            }
        }
        cr.restore(); cr.restore();
        caption(`${ms} ms · ${Math.round(p * 100)} %`, fx + 4, fy + 188);
    });
    surf.writeToPNG(out);
}

// ---- clips: real time at 60 fps, the proposal over today's -------------------------------------
// today: EASE_OUT_BACK for every morph; a shrink whose bounce would pass 12 px stops 12 px short in
// 70 % of the time (ease-out cubic), then settles (ease-in-out) — pill.js _morph, shapes.js shrinkStop
const easeInOutQuad = u => u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
function todayShrink(t, T, dist) {
    const stop = Math.max(0, 1 - 12 / dist), turn = .7 * T;
    if (t < turn) return stop * easeOut(t / turn);
    return stop + (1 - stop) * easeInOutQuad(Math.min(1, (t - turn) / (T - turn)));
}
const FPS = 60;
function frames(seconds, draw) {
    const n = Math.round(seconds * FPS);
    for (let i = 0; i < n; i++) {
        const surf = draw(i / FPS);
        surf.writeToPNG(`${out}/f${String(i).padStart(4, '0')}.png`);
        surf.finish();
    }
}
const rowLabel = (t, y) => text(t, 24, y, {sz: 9, wt: 700, a: .85});
// a two-state cycle: rest in `a`, go to `b` at `t1`, back to `a` at `t2`
function phase(t, t1, t2) {
    if (t < t1) return {dir: 0, ms: 1e6};
    if (t < t2) return {dir: 1, ms: (t - t1) * 1000};
    return {dir: -1, ms: (t - t2) * 1000};
}
function clipCompact() {
    const CW = 480, W = CW + 48, ROW = 150, H = 2 * ROW + 16;
    const grow = spring(SPRING.move), shrink = spring(SPRING.close);
    frames(2.4, t => {
        const surf = canvas(W, H), ph = phase(t, .3, 1.4);
        [[true, 'Đề xuất: lò xo move / close, leading và tên đi tới chỗ mới'],
            [false, 'Hiện nay: EASE_OUT_BACK 460 ms, nội dung mờ đi rồi lộ ra']].forEach(([mine, label], ri) => {
            const y0 = 12 + ri * ROW, fy = y0 + 28;
            rowLabel(label, y0);
            const rest = {from: pillRest, to: compactRest}, back = {from: compactRest, to: pillRest};
            if (ph.dir === 0)
                morph(24, fy, CW, PILL, COMPACT, 0, 1e6, {from: pillRest, to: () => {}});
            else if (ph.dir === 1)
                morph(24, fy, CW, PILL, COMPACT, mine ? grow(ph.ms / 1000) : backOut(ph.ms / 460), ph.ms, rest, mine);
            else
                morph(24, fy, CW, COMPACT, PILL, mine ? shrink(ph.ms / 1000) : todayShrink(ph.ms / 1000, .36, 271), ph.ms, back, mine);
        });
        return cr.getTarget();
    });
}
function clipExpanded() {
    const CW = 760, W = CW + 48, ROW = 330, H = 2 * ROW + 16, SIDE = 131, GAP = 8;
    const grow = spring(SPRING.open), shrink = spring(SPRING.close), slide = spring(SPRING.move);
    frames(2.8, t => {
        const surf = canvas(W, H), ph = phase(t, .3, 1.7);
        [[true, 'Đề xuất: lò xo open / close, ảnh và tên đi tới thẻ chính của Home'],
            [false, 'Hiện nay: EASE_OUT_BACK 460 ms, nội dung mờ đi rồi lộ ra']].forEach(([mine, label], ri) => {
            const y0 = 12 + ri * ROW, fy = y0 + 28, cx = 24 + CW / 2;
            rowLabel(label, y0);
            // the side pills merge into the centre while it is open
            const s = ph.dir === 0 ? 0 : mine ? slide(ph.ms / 1000) : backOut(ph.ms / 360);
            const m = ph.dir === 1 ? s : ph.dir === -1 ? 1 - s : 0;
            const sa = ph.dir === 1 ? clamp01(1 - (s - .5) / .5) : ph.dir === -1 ? clamp01((s - .5) / .5) : 1;
            for (let k = 0; k < 2; k++) {
                const slot = cx + PILL.w / 2 + GAP + k * (SIDE + GAP) + SIDE / 2, sx = lerp(slot, cx, m);
                if (sa > 0) {
                    shape(sx - SIDE / 2, fy, SIDE, 32, sa);
                    fill([1, 1, 1, .3 * sa], sx - SIDE / 2 + 10, fy + 8, 16, 16, 4);
                }
            }
            if (ph.dir === 0)
                morph(24, fy, CW, PILL, EXP, 0, 1e6, {from: pillRest, to: () => {}});
            else if (ph.dir === 1)
                morph(24, fy, CW, PILL, EXP, mine ? grow(ph.ms / 1000) : backOut(ph.ms / 460), ph.ms, {from: pillRest, to: REST.expanded}, mine);
            else
                morph(24, fy, CW, EXP, PILL, mine ? shrink(ph.ms / 1000) : todayShrink(ph.ms / 1000, .46, 427), ph.ms, {from: REST.expanded, to: pillRest}, mine);
        });
        return cr.getTarget();
    });
}
function clipTabs() {
    const CW = 360, W = CW + 48, ROW = 230, H = 2 * ROW + 16;
    const f = spring(SPRING.snap);
    frames(2.2, t => {
        const surf = canvas(W, H);
        // Home → Media at 0.3 s, Media → Home at 1.3 s
        const go = t < 1.3 ? {from: 0, to: 1, ms: (t - .3) * 1000} : {from: 1, to: 0, ms: (t - 1.3) * 1000};
        const kinds = ['home', 'media'];
        [[true, 'Đề xuất: vạch chọn trượt (snap), thân dời theo hướng'], [false, 'Hiện nay: đổi tức thì']].forEach(([mine, label], ri) => {
            const y0 = 12 + ri * ROW, fx = 24, fy = y0 + 28;
            rowLabel(label, y0);
            shape(fx, fy, CW, 180);
            if (go.ms < 0) {
                strip(fx + 12, fy + 12, 0, 0, 1, 1e6);
                cr.save(); clipTo(fx, fy, CW, 180); body(fx + 12, fy + 56, CW - 24, 120, 'home', 1, 0); cr.restore();
                return;
            }
            const p = mine ? f(go.ms / 1000) : 1, ms = mine ? go.ms : 1e6, dir = go.to > go.from ? 1 : -1;
            strip(fx + 12, fy + 12, go.from, go.to, p, ms);
            cr.save(); clipTo(fx, fy, CW, 180);
            if (mine) body(fx + 12, fy + 56, CW - 24, 120, kinds[go.from], fadeOut(ms), -12 * p * dir);
            body(fx + 12, fy + 56, CW - 24, 120, kinds[go.to], mine ? fadeIn(ms, 0) * clamp01(p * 1.2) : 1, mine ? 12 * (1 - p) * dir : 0);
            cr.restore();
        });
        return cr.getTarget();
    });
}

({curves, compact, expanded, tabs, 'clip-compact': clipCompact, 'clip-expanded': clipExpanded, 'clip-tabs': clipTabs})[MODE]();
