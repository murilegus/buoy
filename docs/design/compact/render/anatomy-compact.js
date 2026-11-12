// The compact with every measure (2026-11-10), heights on 56 + 16n, one image per group:
//   media     the head alone (56, radio) and the media 88 with the 72 art
//   rows      Claude Code with three rows (120)
//   ask       Claude Code's asks with buttons (120 / 136 / 152)
//   question  a multiple-choice question, 1 / 3 with Next and 3 / 3 with Submit (280 / 248)
//   card      the notification card, one line (136) and two (152)
// No lights in the compact (Ethan, 2026-11-10). Drawn at 3× directly, so text and lines are sharp.
// gjs -m anatomy-compact.js out.png <group>
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {taskState, icon, C, GREY, drawBu} from '../../render/lib.js';

const SC = 3, W = 700, R = 28, PAD = 14, CW = 340, X = 40;
const W1 = C.WHITE, G = GREY.MUTED, G2 = GREY.MUTED, CY = [.4, .85, 1], RD = [1, .5, .5];   // CY, RD: guide marks
const ART = [[.95, .55, .35], [.35, .25, .75]];
const ALL = [
    {group: 'media', kind: 'head', h: 56, title: 'Phần đầu 56: nhạc không có thanh tiến trình (radio, luồng trực tiếp)'},
    {group: 'media', kind: 'media', h: 88, title: 'Nhạc 88: ảnh bìa 72'},
    {group: 'rows', kind: 'rows', h: 120, title: 'Claude Code 120: 3 hàng (88 / 104 / 120 cho 1 / 2 / 3 hàng)'},
    {group: 'ask', kind: 'card', ask: true, h: 120, lines: [], title: 'Ask 120: Claude Code hỏi, không có thân — chờ trả lời'},
    {group: 'ask', kind: 'card', ask: true, h: 136, lines: ['pnpm verify && git push origin docs/m4-redesign-items'], title: 'Ask 136: Claude Code xin chạy lệnh, lệnh là thân 1 dòng — chờ trả lời'},
    {group: 'ask', kind: 'card', ask: true, h: 152, lines: ['rm -rf dist && pnpm build && cp -r dist/* ~/.local/share/', 'gnome-shell/extensions/buoy@murilegus/'], buttons: ['Deny', 'Allow'], title: 'Ask 152: thân 2 dòng, 2 nút — chờ trả lời'},
    {group: 'question', kind: 'question', w: 404, step: '1 / 3', buttons: ['Skip', 'Next'], sel: [0], title: 'Hỏi nhiều câu, câu 1 / 3, chọn một: 56 + 8 + 5 × 32 + 12 + 32 + 12 = 280 — Next sang câu sau',
        q: 'Hôm nay bạn muốn mình giúp việc gì?', options: [['Viết code', 'Viết script, prototype hoặc tính năng mới'], ['Sửa lỗi dự án', 'Debug hoặc review code trong một dự án có sẵn (ví dụ buoy)'],
            ['Tạo tài liệu', 'Soạn tài liệu, báo cáo, slide hoặc trang web'], ['Hỏi đáp', 'Chỉ cần giải thích hoặc trả lời một câu hỏi'], ['Other', '']]},
    {group: 'question', kind: 'question', w: 404, step: '3 / 3', multi: true, buttons: ['Back', 'Submit'], sel: [0, 3], other: 'Vala cho phần đo chữ', title: 'Câu cuối 3 / 3, chọn nhiều, có Other đang gõ: 56 + 8 + 4 × 32 + 12 + 32 + 12 = 248 — Submit gửi cả ba câu',
        q: 'Dùng những công cụ nào?', options: [['GJS', 'Chạy thẳng trong GNOME Shell, không cần build'], ['TypeScript', 'Thêm bước build, kiểu rõ ràng hơn'],
            ['Unit test', 'pnpm test trước khi xong'], ['Other', '']]},
    {group: 'card', kind: 'card', h: 136, lines: ['On my way, 5 min.'], title: 'Card 136: 1 dòng + nút'},
    {group: 'card', kind: 'card', h: 152, lines: ['Pushed the pill shapes to the branch — can you', 'review the compact and the card before the sync?'], title: 'Card 152: 2 dòng + nút'},
];
const ROWS = ALL.filter(r => r.group === ARGV[1]);
if (!ROWS.length) throw new Error(`no group "${ARGV[1]}"`);
for (const r of ROWS) if (r.kind === 'question') r.h = 56 + 8 + 32 * r.options.length + 12 + 32 + 12;
const GAPY = 74, TOP = 40;
const H = ROWS.reduce((a, r) => a + r.h + GAPY, TOP) + 10;

const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC);
cr.setSourceRGB(0.20, 0.17, 0.35); cr.paint();
const L = PangoCairo.create_layout(cr);
PangoCairo.context_set_resolution(L.get_context(), 96);

function text(t, x, y, pt, wt, col, a = 1, wrapW = 0, measure = false, cut = 0) {
    const d = Pango.FontDescription.from_string('SF Pro Display');
    d.set_size(pt * Pango.SCALE); d.set_weight(wt); L.set_font_description(d);
    const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
    L.set_width(cut ? Math.round(cut * Pango.SCALE) : wrapW ? wrapW * Pango.SCALE : -1); L.set_wrap(Pango.WrapMode.WORD);
    L.set_ellipsize(cut ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE); L.set_text(t, -1);
    PangoCairo.update_layout(cr, L);
    if (!measure) { cr.setSourceRGBA(...col, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L); }
    const e = L.get_pixel_extents()[1]; L.set_width(-1); L.set_ellipsize(Pango.EllipsizeMode.NONE); return e;
}
const right = (t, xr, y, pt, a) => { const e = text(t, 0, 0, pt, 400, W1, a, 0, true); text(t, xr - e.width, y, pt, 400, W1, a); };
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
function grad(x, y, s, r, c0, c1) {
    const g = new cairo.LinearGradient(x, y, x + s, y + s); g.addColorStopRGB(0, ...c0); g.addColorStopRGB(1, ...c1);
    cr.setSource(g); rr(x, y, s, s, r); cr.fill();
}
// the head's button (design/icons): its main action (⏸ pause-fill, ■ stop-fill) is fill-inverse,
// cream with a black icon; × (xmark) is fill-2 with a white one; the icon 16 in the middle
const GLYPH = {'⏸': 'pause-fill', '■': 'stop-fill', '×': 'xmark'};
function round(cx, cy, glyph) {
    const main = glyph !== '×';
    cr.newPath(); if (main) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2);
    cr.arc(cx, cy, 16, 0, 2 * Math.PI); cr.fill();
    icon(cr, GLYPH[glyph], cx - 8, cy - 8, 16, main ? C.BLACK : W1);
}
// a measure: horizontal above (or below) y, vertical right of x
function dim(a, b, y, t, col = CY, below = false) {
    cr.setSourceRGBA(...col, .9); cr.setLineWidth(.5);
    cr.moveTo(a, y); cr.lineTo(b, y); cr.moveTo(a, y - 2); cr.lineTo(a, y + 2); cr.moveTo(b, y - 2); cr.lineTo(b, y + 2); cr.stroke();
    const e = text(t, 0, 0, 5.5, 600, col, 1, 0, true);
    text(t, (a + b) / 2 - e.width / 2, below ? y + 1 : y - e.height - 1, 5.5, 600, col);
}
function vdim(x, a, b, t, col = RD) {
    cr.setSourceRGBA(...col, .9); cr.setLineWidth(.5);
    cr.moveTo(x, a); cr.lineTo(x, b); cr.moveTo(x - 2, a); cr.lineTo(x + 2, a); cr.moveTo(x - 2, b); cr.lineTo(x + 2, b); cr.stroke();
    const e = text(t, 0, 0, 5.5, 600, col, 1, 0, true); text(t, x + 2.5, (a + b) / 2 - e.height / 2, 5.5, 600, col);
}
// Bu: the real grids, pose ask (its lamp red, design/colours)
const bu = (x, y, cell) => drawBu(cr, 'ask', x, y, cell);
function guide(x, y, w, h, r = 0) {
    cr.setSourceRGBA(...CY, .5); cr.setLineWidth(.5);
    if (r) rr(x + .25, y + .25, w - .5, h - .5, r); else cr.rectangle(x + .25, y + .25, w - .5, h - .5);
    cr.stroke();
}

let y = TOP;
for (const it of ROWS) {
    const pw = it.w ?? CW, x = X, h = it.h, lx = x + PAD, xr = x + pw - PAD;
    text(it.title, x, y - 34, 7, 600, W1, .85);
    rr(x + .5, y + .5, pw - 1, h - 1, R - .5); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, .12); cr.setLineWidth(1); cr.stroke();

    if (it.kind === 'head') {
        grad(lx, y + 8, 40, 10, ...ART); guide(lx, y + 8, 40, 40);
        const tx = lx + 40 + 12;
        text('Lumen Coast', tx, y + 9, 11, 600, W1); text('Harbor Lights · Spotify', tx, y + 29, 9.5, 400, G);
        round(xr - 16, y + R, '⏸'); guide(xr - 32, y + 12, 32, 32, 16);
        dim(x, lx, y - 4, '14'); dim(lx, lx + 40, y - 4, '40'); dim(lx + 40, tx, y - 4, '12');
        dim(xr - 32, xr, y - 4, '32'); dim(xr, x + pw, y - 4, '14');
        vdim(x + pw + 6, y, y + 8, '8'); vdim(x + pw + 6, y + 8, y + 48, '40'); vdim(x + pw + 6, y + 48, y + 56, '8');
        text('tiêu đề 1em', tx + 110, y + 11, 5.5, 600, CY); text('phụ đề 0.85em', tx + 140, y + 31, 5.5, 600, CY);
        text('nút tròn 32, tâm ở y = 28', xr - 118, y + h + 3, 5.5, 600, CY);
        text('bo 28', x + 4, y + h + 3, 5.5, 600, CY);
    }

    if (it.kind === 'media') {
        const ax = x + 8, tx = ax + 72 + 12;
        grad(ax, y + 8, 72, 20, ...ART); guide(ax, y + 8, 72, 72, 20);
        text('Lumen Coast', tx, y + 10, 11, 600, W1); text('Harbor Lights · Spotify', tx, y + 30, 9.5, 400, G);
        round(xr - 16, y + R, '⏸');
        const by = y + 60;
        cr.setSourceRGBA(1, 1, 1, C.FILL3); rr(tx, by, xr - tx, 4, 2); cr.fill();
        cr.setSourceRGB(1, 1, 1); rr(tx, by, (xr - tx) * .38, 4, 2); cr.fill();
        text('1:24', tx, by + 7, 8.5, 400, W1, .5); right('-2:11', xr, by + 7, 8.5, .5);
        dim(x, ax, y - 4, '8'); dim(ax, ax + 72, y - 4, '72'); dim(ax + 72, tx, y - 4, '12'); dim(xr, x + pw, y - 4, '14');
        vdim(x + pw + 6, y, y + 8, '8'); vdim(x + pw + 6, y + 8, y + 80, '72'); vdim(x + pw + 6, y + 80, y + 88, '8');
        text('bo 20 = 28 − 8, đồng tâm với góc', ax, y + h + 3, 5.5, 600, CY);
    }

    if (it.kind === 'rows') {
        drawBu(cr, 'busy', lx, y + 8, 4);   // Claude Code leads with Bu, as in the code
        const tx = lx + 40 + 12;
        text('Claude Code', tx, y + 9, 11, 600, W1); text('buoy · 2 / 3', tx, y + 29, 9.5, 400, G);
        round(xr - 16, y + R, '■');
        // Claude's task list (2026-11-11): done ✓, doing ▶, to do ○ dimmed with its text; 16 in a row 16
        const steps = [['done', 'Edit shapes.js', '12s'], ['doing', 'Run pnpm test', '4s'], ['todo', 'Update the docs', '']];
        steps.forEach(([k, a, b], j) => {
            const ry = y + 56 + 8 + j * 16, cy = ry + 8;
            taskState(cr, k, lx + 12, ry, 16);
            const t = text(a, 0, 0, 9.5, 400, G2, 1, 0, true);
            text(a, tx, cy - t.height / 2, 9.5, 400, G2, k === 'todo' ? .55 : 1);
            if (b) { const r = text(b, 0, 0, 9.5, 400, W1, .5, 0, true); text(b, xr - r.width, cy - r.height / 2, 9.5, 400, W1, .5); }
            guide(lx + 12, ry, 16, 16);
        });
        dim(x, lx, y - 4, '14'); dim(lx, lx + 40, y - 4, '40'); dim(lx + 40, tx, y - 4, '12');
        dim(lx, lx + 12, y + h + 4, '12', CY, true); dim(lx + 12, lx + 28, y + h + 4, '16', CY, true);
        text('✓ xong · ▶ đang làm · ○ chờ (mờ cùng chữ); 16 trong hàng 16, giữa cột leading; chữ thẳng cột với tiêu đề (0.85em)', lx + 34, y + h + 4, 5.5, 600, CY);
        vdim(x + pw + 6, y, y + 56, '56 phần đầu');
        [[0, '8'], [8, '16'], [24, '16'], [40, '16'], [56, '8']].forEach(([o, t], k, all) => {
            const b = k + 1 < all.length ? all[k + 1][0] : 64;
            vdim(x + pw + 6, y + 56 + o, y + 56 + b, t);
        });
    }

    if (it.kind === 'question') {
        bu(lx, y + 8, 4);
        text(it.q, lx + 52, y + 9, 11, 600, W1); text(`Claude Code · buoy · ${it.step}`, lx + 52, y + 29, 9.5, 400, G);
        const top = y + 56 + 8, tx = lx + 52, ACC = C.ACCENT;
        it.options.forEach(([label, desc], j) => {
            const ry = top + j * 32, cx = lx + 20, cy = ry + 16, sel = it.sel.includes(j);
            if (sel) { cr.setSourceRGBA(1, 1, 1, .08); rr(x + 8, ry, pw - 16, 32, 12); cr.fill(); }
            if (it.multi) {
                cr.newSubPath();
                if (sel) { cr.setSourceRGB(...ACC); rr(cx - 8, cy - 8, 16, 16, 4); cr.fill(); icon(cr, 'check', cx - 7, cy - 7, 14, W1); }
                else { cr.setLineWidth(1.25); cr.setSourceRGBA(1, 1, 1, C.FG_SUBTLE); rr(cx - 7, cy - 7, 14, 14, 3.5); cr.stroke(); }
            } else {
                if (!sel) { cr.newSubPath(); cr.setLineWidth(1.25); cr.setSourceRGBA(1, 1, 1, C.FG_SUBTLE); cr.arc(cx, cy, 7, 0, 2 * Math.PI); cr.stroke(); }
                if (sel) { cr.newSubPath(); cr.setSourceRGB(...ACC); cr.arc(cx, cy, 8, 0, 2 * Math.PI); cr.fill(); cr.newSubPath(); cr.setSourceRGB(1, 1, 1); cr.arc(cx, cy, 3, 0, 2 * Math.PI); cr.fill(); }
            }
            // one line (2026-11-10, Ethan): the label 1em (line 18) in the middle of the 32 row, the
            // description 0.85em grey after it on the same line, cut with "…"
            const field = !desc && sel && it.other;
            const a = text(label, 0, 0, 11, 600, W1, 1, 0, true); if (!field) text(label, tx, cy - a.height / 2, 11, 600, W1);
            if (desc) {
                const cut = xr - tx - a.width - 8;
                const d = text(desc, 0, 0, 9.35, 400, G, 1, 0, true, cut); text(desc, tx + a.width + 8, cy - d.height / 2 + 1, 9.35, 400, G, 1, 0, false, cut);
            } else if (sel && it.other) {
                // Other chosen: the row turns into a field (24 tall, r 12, the accent ring of a
                // focused entry); a click on it takes the keyboard
                cr.setSourceRGBA(1, 1, 1, C.FILL2); rr(tx - 8, ry + 4, xr - tx + 8, 24, 12); cr.fill();
                cr.setSourceRGB(...ACC); cr.setLineWidth(1.5); rr(tx - 8 + .75, ry + 4.75, xr - tx + 8 - 1.5, 22.5, 11.25); cr.stroke();
                const t = text(it.other, 0, 0, 9.35, 400, W1, 1, 0, true); text(it.other, tx, cy - t.height / 2, 9.35, 400, W1);
                cr.setSourceRGB(1, 1, 1); cr.rectangle(tx + t.width + 1, cy - 7, 1, 14); cr.fill();
            } else {
                const o = text('Type your own answer', 0, 0, 9.35, 400, G, 1, 0, true); text('Type your own answer', tx + a.width + 8, cy - o.height / 2 + 1, 9.35, 400, G);
            }
            vdim(x + pw + 6, ry, ry + 32, j ? '32' : '32: dòng 18 ở giữa, 7 trên 7 dưới');
        });
        const by = y + h - 12 - 32, bw = (pw - 24 - 8) / 2;
        it.buttons.forEach((t, k) => {
            if (k) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2); rr(x + 12 + k * (bw + 8), by, bw, 32, 16); cr.fill();
            const e = text(t, 0, 0, 9.5, 600, W1, 1, 0, true);
            text(t, x + 12 + k * (bw + 8) + (bw - e.width) / 2, by + 16 - e.height / 2, 9.5, 600, k ? [0, 0, 0] : W1);
        });
        vdim(x + pw + 6, y, y + 56, '56 phần đầu'); vdim(x + pw + 6, y + 56, top, '8');
        vdim(x + pw + 6, top + 32 * it.options.length, by, '12'); vdim(x + pw + 6, by, by + 32, '32 nút'); vdim(x + pw + 6, by + 32, y + h, '12');
        if (it.step === '1 / 3') {
            text('mỗi lựa chọn một hàng 32, một dòng: nhãn 1em, mô tả 0.85em xám cùng dòng, dài thì "…"; chọn một: tròn, chọn nhiều: vuông; rộng 404 (tối đa compact ở 1920)', x, y + h + 4, 5.5, 600, CY);
            text('cao vượt 152: tối đa bằng expanded (rộng/2 = 280 ở 1920); câu 1, 2: Skip · Next; câu cuối: Back · Submit', x, y + h + 14, 5.5, 600, CY);
        } else {
            text('Back về câu trước, mọi câu trả lời (cả chữ đã gõ) giữ nguyên; Submit gửi mọi câu một lần: answers = {câu hỏi: nhãn},', x, y + h + 4, 5.5, 600, CY);
            text('chọn nhiều nối bằng ", ", Other gửi chữ đã gõ — phần chữ tự do và trộn với nhãn chưa có trong tài liệu hook: phải thử', x, y + h + 14, 5.5, 600, CY);
        }
    }

    if (it.kind === 'card') {
        if (it.ask) {
            bu(lx, y + 8, 4);
            text(it.lines.length ? 'Claude Code wants to run' : 'Allow edits to shapes.js?', lx + 52, y + 9, 11, 600, W1);
            text(it.lines.length ? 'buoy · Bash' : 'buoy · Edit', lx + 52, y + 29, 9.5, 400, G);
        } else {
            grad(lx, y + 8, 40, 10, [.55, .8, .65], [.2, .4, .6]);
            rr(lx + 24, y + 32, 18, 18, 5); cr.setSourceRGB(0, 0, 0); cr.fill();
            cr.setSourceRGB(.3, .55, .95); rr(lx + 26, y + 34, 14, 14, 3.5); cr.fill();
            text('Mira Vale', lx + 52, y + 9, 11, 600, W1); text('Slack · 2 min', lx + 52, y + 29, 9.5, 400, G);
            round(xr - 16, y + R, '×');
        }
        const labels = it.buttons ?? (it.ask ? ['Deny', 'Allow', 'Always'] : ['Reply', 'Mark as read']);
        const by = y + h - 12 - 32, bw = (pw - 24 - 8 * (labels.length - 1)) / labels.length;
        const n = it.lines.length, top = y + 56 + 8;
        it.lines.forEach((t, j) => { const e = text(t, 0, 0, 9.5, 400, G2, 1, 0, true); text(t, x + PAD + 2, top + j * 16 + 8 - e.height / 2, 9.5, 400, G2); });
        if (n) guide(x + PAD + 2, top, pw - 2 * PAD - 4, 16 * n);
        labels.forEach((t, k) => {
            const hi = it.ask && k === 1;
            if (hi) cr.setSourceRGB(...C.CREAM); else cr.setSourceRGBA(1, 1, 1, C.FILL2); rr(x + 12 + k * (bw + 8), by, bw, 32, 16); cr.fill();
            const e = text(t, 0, 0, 9.5, 600, W1, 1, 0, true);
            text(t, x + 12 + k * (bw + 8) + (bw - e.width) / 2, by + 16 - e.height / 2, 9.5, 600, hi ? [0, 0, 0] : W1);
        });
        if (!it.ask) guide(lx + 24, y + 32, 18, 18, 5);
        vdim(x + pw + 6, y, y + 56, '56 phần đầu');
        if (n) {
            vdim(x + pw + 6, y + 56, top, '8');
            vdim(x + pw + 6, top, top + 16 * n, `${16 * n} = ${n} dòng × 16`); vdim(x + pw + 6, top + 16 * n, by, '12');
        } else vdim(x + pw + 6, y + 56, by, '20 = 8 + 12, không thân');
        vdim(x + pw + 6, by, by + 32, '32 nút'); vdim(x + pw + 6, by + 32, y + h, '12');
        dim(x, x + 12, by + 40, '12', CY, true); dim(x + 12 + bw, x + 12 + bw + 8, by + 40, '8', CY, true);
        dim(x + pw - 12, x + pw, by + 40, '12', CY, true);
        text('nút bo 16 = 28 − 12', x + 12 + bw / 2 - 30, by + 50, 5.5, 600, CY);
        if (n === 2 && !it.ask) text('logo app 18 ở góc dưới phải ảnh đại diện 40; tối đa 2 dòng', lx + 52, y + 46, 5.5, 600, CY);
        if (it.ask) text('Bu 40 ở leading; không có ×: phải chọn một nút', lx + 52, y + 46, 5.5, 600, CY);
    }
    y += h + GAPY;
}
text(`Rộng ${ROWS[0].w ?? CW} ở đây; compact rộng 16em … min(28em, 0.72 × expanded) = 240 … 404 ở 1920.`, X, H - 22, 6.5, 400, W1, .75);
surf.writeToPNG(ARGV[0]);
