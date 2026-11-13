// Side pills (2026-11-12, Ethan: "design lại hiển thị của leading và trailing trong pill khi
// không có +N và khi có +N"), and Claude Code on pill 1. Every side pill is 132 × 32 at 1×
// (the idle's width), pad 8, the leading's cell 24, gaps 6 (design/pill). Options side by side,
// the sample content of every drawing (render/lib.js SAMPLE) and Claude Code on "buoy".
//   gjs -m side.js out.png <side|claude>
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, COVER, SAMPLE, EQ, drawEq, icon, drawBu} from '../../render/lib.js';

const [out, MODE] = ARGV;
const W1 = C.WHITE, PAD = 8, CELL = 24, GAP = 6, H = 32, SIDE = 132;
let cr, L;
function canvas(W, Hh) {
    const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, Hh * SC);
    cr = new cairo.Context(surf); cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
    L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
    return surf;
}
function font(pt, wt) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(pt * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
}
function text(t, x, y, {pt = 11, wt = 600, a = 1, rgb = W1, measure = false, maxW = 0} = {}) {
    font(pt, wt); L.set_width(maxW ? Math.floor(maxW * Pango.SCALE) : -1);
    L.set_ellipsize(maxW ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE); L.set_text(t, -1);
    PangoCairo.update_layout(cr, L); const e = L.get_pixel_extents()[1];
    if (!measure) { cr.setSourceRGBA(...rgb, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); }
    L.set_width(-1);
    return e;
}
const tw = (t, pt = 11, wt = 600) => text(t, 0, 0, {pt, wt, measure: true}).width;
function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
function shape(x, y, w) {
    cr.newPath(); rr(x + .5, y + .5, w - 1, H - 1, 15.5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke();
}
const caption = (t, x, y, a = .85) => text(t, x, y, {pt: 7.5, wt: 400, a});
const title = (t, x, y) => text(t, x, y, {pt: 9, wt: 700});

// --- the parts: a leading in its 24 cell, a trailing, the +N badge ------------------------
const LEADS = {
    art: (x, y) => { const g = new cairo.LinearGradient(x, y, x + 24, y + 24); g.addColorStopRGB(0, ...COVER[0]); g.addColorStopRGB(1, ...COVER[1]); cr.newPath(); rr(x, y, 24, 24, 6); cr.setSource(g); cr.fill(); },
    bu: (x, y) => drawBu(cr, 'busy', x + 2, y + 2, 2),
    icon: name => (x, y) => icon(cr, name, x + 4, y + 4, 16),
};
const TRAILS = {
    eq: {w: EQ.width, draw: (x, y) => drawEq(cr, x, y + 16)},
    text: t => ({get w() { return tw(t); }, draw: (x, y) => text(t, x, y + (H - 18) / 2)}),   // measured once drawn
};
const badgeW = n => Math.ceil(tw(`+${n}`, 8.25, 600)) + 12;
function badge(n, x, y) {
    const w = badgeW(n); cr.newPath(); rr(x, y + 7, w, 18, 9); cr.setSourceRGBA(1, 1, 1, C.FILL3); cr.fill();
    text(`+${n}`, x + 6, y + 8.5, {pt: 8.25, wt: 600});
    return w;
}

const CASES = [
    {name: SAMPLE.app, lead: LEADS.art, trail: TRAILS.eq},
    {name: 'Claude Code', lead: LEADS.bu, trail: TRAILS.text('1 min')},
    {name: 'Tải về', lead: LEADS.icon('arrow-down-to-line'), trail: TRAILS.text('42%')},
    {name: 'Hẹn giờ', lead: LEADS.icon('alarm'), trail: TRAILS.text('4:59')},
];

// The options. x is the pill's left edge; each lays out its leading, trailing and +N.
const OPTIONS = [
    {key: 'A', label: 'A — hiện tại: cả nhóm canh giữa', layout: (c, x, y, more) => {
        const parts = [CELL, c.trail.w, ...more ? [badgeW(more)] : []];
        let cx = x + (SIDE - (parts.reduce((s, w) => s + w, 0) + GAP * (parts.length - 1))) / 2;
        c.lead(cx, y + 4); cx += CELL + GAP; c.trail.draw(cx, y); cx += c.trail.w + GAP;
        if (more) badge(more, cx, y);
    }},
    {key: 'B', label: 'B — hai đầu: leading sát lề trái, trailing sát lề phải; +N sau trailing', layout: (c, x, y, more) => {
        c.lead(x + PAD, y + 4);
        let rx = x + SIDE - PAD;
        if (more) rx -= badgeW(more) + GAP, badge(more, rx + GAP, y);
        c.trail.draw(rx - c.trail.w, y);
    }},
    {key: 'C', label: 'C — hai đầu; có +N thì +N thay chỗ trailing (trailing xem ở compact)', layout: (c, x, y, more) => {
        c.lead(x + PAD, y + 4);
        if (more) badge(more, x + SIDE - PAD - badgeW(more), y);
        else c.trail.draw(x + SIDE - PAD - c.trail.w, y);
    }},
];

function side() {
    const COLW = SIDE + 16, LEFT = 24, W = LEFT + 2 * (CASES.length * COLW) + 40, ROW = 64;
    const surf = canvas(W, 60 + OPTIONS.length * ROW + 40);
    title('Pill phụ 132 × 32: không có +N (trái) và có +N, pill phụ cuối (phải)', 24, 12);
    CASES.forEach((c, i) => {
        caption(c.name, LEFT + i * COLW, 32, .7);
        caption(`${c.name} · +2`, LEFT + (CASES.length + i) * COLW + 24, 32, .7);
    });
    OPTIONS.forEach((o, r) => {
        const y = 70 + r * ROW;
        text(o.label, 24, y - 18, {pt: 8, wt: 600, a: .9});
        CASES.forEach((c, i) => {
            shape(LEFT + i * COLW, y, SIDE); o.layout(c, LEFT + i * COLW, y, 0);
            const bx = LEFT + (CASES.length + i) * COLW + 24;
            shape(bx, y, SIDE); o.layout(c, bx, y, 2);
        });
    });
    caption('Pill phụ cố định 132 (bằng idle), lề 8, ô leading 24, khoảng 6; chữ của pill phụ bỏ, chỉ còn giá trị ngắn ở trailing (SPEC §2c).',
        24, 60 + OPTIONS.length * ROW + 12, .75);
    surf.writeToPNG(out);
}

// --- Claude Code on pill 1 ------------------------------------------------------------------
function pill1(x, y, parts, maxW = 336) {
    // [Bu 24] 6 [text …] 6 [trailing] content-fit from 132 up to maxW
    const trail = parts.trail, tGap = trail ? GAP : 0;
    const natural = PAD + CELL + GAP + tw(parts.text) + tGap + (trail ? tw(trail) : 0) + PAD;
    const w = Math.max(132, Math.min(maxW, Math.ceil(natural / 2) * 2));
    shape(x, y, w);
    drawBu(cr, parts.pose ?? 'busy', x + PAD + 2, y + 6, 2);
    const textW = w - PAD - CELL - GAP - tGap - (trail ? tw(trail) : 0) - PAD;
    text(parts.text, x + PAD + CELL + GAP, y + 7, {maxW: textW});
    if (trail)
        text(trail, x + w - PAD - tw(trail), y + 7, {a: parts.trailA ?? 1});
    return w;
}

const CLAUDE = [
    {label: 'A — hiện tại: "Claude · dự án", thời gian chạy', rows: [
        {text: 'Claude · buoy', trail: '1 min'},
        {text: 'Claude · buoy', trail: '12 min', pose: 'think'},
    ]},
    {label: 'B — chỉ dự án (Bu đã là Claude), thời gian chạy', rows: [
        {text: 'buoy', trail: '1 min'},
        {text: 'buoy', trail: '12 min', pose: 'think'},
    ]},
    {label: 'C — dự án · việc đang làm (cắt "…"), thời gian chạy', rows: [
        {text: 'buoy · Running pnpm test', trail: '1 min'},
        {text: 'buoy · Editing src/…/compact.js', trail: '12 min'},
    ]},
    {label: 'D — có danh sách việc: dự án · việc đang làm, tiến độ thay thời gian', rows: [
        {text: 'buoy · Run pnpm test', trail: '2 / 5'},
        {text: 'buoy · Update the docs', trail: '4 / 5'},
    ]},
];

function claude() {
    const LEFT = 24, W = LEFT + 2 * 360 + 40, ROW = 60;
    const surf = canvas(W, 50 + CLAUDE.length * ROW + 40);
    title('Claude Code ở pill 1 (co theo nội dung, 132 … 336 ở 1920)', 24, 12);
    CLAUDE.forEach((o, r) => {
        const y = 56 + r * ROW;
        text(o.label, 24, y - 18, {pt: 8, wt: 600, a: .9});
        o.rows.forEach((p, i) => pill1(LEFT + i * 360, y, p));
    });
    caption('Đèn ở hai đầu và cỡ chữ như pill (design/pill); hover mở compact: "Claude Code", dự án · tiến độ, các việc.',
        24, 50 + CLAUDE.length * ROW + 12, .75);
    surf.writeToPNG(out);
}

({side, claude})[MODE]();
