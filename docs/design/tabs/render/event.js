// An event's details in the Calendar tab (design/tabs "Chi tiết sự kiện", 2026-11-20, Ethan, after
// Google Calendar's): a click on a row opens its page in the tab's right column, read from EDS for
// that event (as Join is).
// gjs -m event.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon} from '../../render/lib.js';

const [out] = ARGV;
const IW = 560, IH = 284;
const W = 16 + IW + 32 + IW + 16, H = 860;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, rgb = [1, 1, 1], right = false, center = false, max = 0, measure = false, caps = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(caps ? t.toUpperCase() : t, -1);
    const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum'));
    if (caps)
        at.insert(Pango.attr_letter_spacing_new(Pango.SCALE * .8));
    L.set_attributes(at);
    L.set_width(max > 0 ? max * Pango.SCALE : -1); L.set_ellipsize(max > 0 ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    const e = L.get_pixel_extents()[1];
    L.set_width(-1);
    if (measure)
        return e;
    cr.setSourceRGBA(...rgb, a); cr.moveTo(right ? x - e.width : center ? x - e.width / 2 : x, y); PangoCairo.show_layout(cr, L);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (a, x, y, w, h, r, rgb = [1, 1, 1]) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgb, a); cr.fill(); };
const dot = (x, y, r, rgb, a = 1) => { cr.newPath(); cr.arc(x, y, r, 0, 2 * Math.PI); cr.setSourceRGBA(...rgb, a); cr.fill(); };
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});
const title = (t, x, y) => text(t, x, y, {sz: 12, wt: 600});
const ACCENT = [.89, .33, .15];       // the sample session's accent (Yaru orange)
const WORK = [.62, .88, .91];         // the calendar's own colour (EDS source Color)

// the island with its tab bar and the month on the left (as it is today)
function island(x, y) {
    fill(1, x, y, IW, IH, 28, [0, 0, 0]);
    cr.newPath(); rr(x + .5, y + .5, IW - 1, IH - 1, 28); cr.setLineWidth(1); cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.stroke();
    fill(C.FILL1, x + 12, y + 12, 326, 32, 16);
    const tabs = ['house', 'music-note', 'bell', null, 'display', 'smartphone', 'ellipsis-vertical'];
    let tx = x + 16;
    for (const t of tabs) {
        if (!t) {
            fill(C.FILL3, tx, y + 14, 104, 28, 14);
            icon(cr, 'calendar', tx + 12, y + 20, 16);
            text('Calendar', tx + 34, y + 20, {wt: 500});
            tx += 108;
            continue;
        }
        icon(cr, t, tx + 6, y + 20, 16, [1, 1, 1], C.FG_MUTED);
        tx += 36;
    }
    fill(C.FILL1, x + IW - 44, y + 12, 32, 32, 16); icon(cr, 'gear', x + IW - 36, y + 20, 16, [1, 1, 1], C.FG_MUTED);
    // the month
    text('NOVEMBER', x + 22, y + 62, {sz: 10, wt: 700, rgb: ACCENT});
    text('2026', x + 98, y + 62, {sz: 10, wt: 700, a: C.FG_MUTED});
    fill(C.FILL2, x + 170, y + 58, 24, 24, 12); icon(cr, 'chevron-left', x + 174, y + 62, 16);
    fill(C.FILL2, x + 200, y + 58, 24, 24, 12); icon(cr, 'chevron-right', x + 204, y + 62, 16);
    const cx = c => x + 32 + c * 30;
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, c) => text(d, cx(c), y + 90, {sz: 8.5, a: C.FG_SUBTLE, center: true}));
    const first = [1, 8, 15, 22, 29, 6];
    first.forEach((f, r) => {
        for (let c = 0; c < 7; c++) {
            const n = f + c > 30 && r >= 4 ? f + c - 30 : f + c;
            const other = r === 5 || (r === 4 && c >= 2);
            const weekend = c === 0 || c === 6;
            const cy = y + 120 + r * 30;
            if (n === 20 && !other) {
                dot(cx(c), cy, 13, ACCENT);
                dot(cx(c), cy + 9, 1.5, [1, 1, 1]);
            }
            text(String(n).padStart(2, '0'), cx(c), cy - 8, {sz: 10, wt: n === 20 && !other ? 700 : 400, center: true,
                a: other ? C.FG_DISABLED : weekend ? C.FG_SUBTLE : 1});
            if (!other && [21, 22].includes(n))
                dot(cx(c), cy + 10, 1.5, ACCENT);
        }
    });
}
const RX = 240, RW = 302;      // the right column

// an event's page in the right column, after Google Calendar's (2026-11-20, Ethan's sample): an icon
// column, the text after it; `scroll` px scrolled
const TOP = 54, BOTTOM = 14;
function page(x, y, ev, scroll = 0) {
    const rx = x + RX, tx = rx + 30;
    cr.save();
    cr.rectangle(rx - 4, y + TOP, RW + 8, IH - TOP - BOTTOM); cr.clip();
    let ty = y + TOP + 4 - scroll;
    // back, then the calendar's colour as a square and the title, the day and time under it
    fill(C.FILL2, rx, ty, 24, 24, 12); icon(cr, 'chevron-left', rx + 4, ty + 4, 16);
    ty += 32;
    fill(1, rx + 4, ty + 3, 12, 12, 3, WORK);
    text(ev.title, tx, ty - 1, {sz: 13.5, wt: 700, max: RW - 30});
    text(ev.when, tx, ty + 21, {sz: 9.35, a: C.FG_MUTED});
    ty += 46;
    if (ev.join) {
        icon(cr, 'video', rx + 2, ty + 8, 16, [1, 1, 1], C.FG_MUTED);
        const e = text(ev.join, 0, 0, {sz: 9.35, wt: 600, measure: true});
        fill(1, tx, ty, e.width + 40, 32, 16, C.CREAM);
        text(ev.join, tx + 20, ty + 8, {sz: 9.35, wt: 600, rgb: [0, 0, 0]});
        fill(C.FILL2, rx + RW - 32, ty, 32, 32, 16); icon(cr, 'copy', rx + RW - 24, ty + 8, 16);
        text(ev.link, tx, ty + 38, {sz: 8.5, a: C.FG_SUBTLE});
        ty += 64;
    }
    for (const row of ev.rows) {
        icon(cr, row.icon, rx + 2, ty, 16, [1, 1, 1], C.FG_MUTED);
        if (row.square)
            fill(1, rx + 4, ty + 2, 12, 12, 3, WORK);
        text(row.text, tx, ty, {sz: 9.35, max: RW - 30});
        ty += 18;
        for (const l of row.sub ?? []) {
            text(l, tx, ty, {sz: 8.5, a: C.FG_MUTED, max: RW - 30});
            ty += 14;
        }
        for (const [who, role, ok] of row.people ?? []) {
            ty += 4;
            dot(tx + 12, ty + 12, 12, [1, 1, 1], C.FILL2);
            text(who[0].toUpperCase(), tx + 12, ty + 4, {sz: 10, wt: 600, center: true});
            dot(tx + 21, ty + 21, 5, ok ? C.CREAM : [1, 1, 1], ok ? 1 : C.FILL4);
            if (ok)
                icon(cr, 'check', tx + 17, ty + 17, 8, [0, 0, 0], 1);
            else
                text('?', tx + 21, ty + 15.5, {sz: 6.5, wt: 700, center: true});
            text(who, tx + 32, ty + (role ? -1 : 5), {sz: 9.35, max: RW - 62});
            if (role)
                text(role, tx + 32, ty + 13, {sz: 8.5, a: C.FG_MUTED});
            ty += 28;
        }
        ty += 12;
    }
    cr.restore();
    // a scrolled page: GNOME's scrollbar at the column's right
    if (ev.bar)
        fill(.4, rx + RW + 8, y + TOP + ev.bar[0], 4, ev.bar[1], 2);
}

const MEETING = {
    title: 'Họp sprint tuần 47', when: 'Hôm nay, thứ Sáu 20/11 · 15:00 – 15:30',
    join: 'Tham gia Google Meet', link: 'meet.google.com/abc-defg-hij',
    rows: [
        {icon: 'map-pin', text: 'Tầng 3, phòng A'},
        {icon: 'persons', text: '3 khách', sub: ['2 đồng ý, 1 chưa trả lời'], people: [
            ['tram@example.com', 'Người tổ chức', true], ['ethan@example.com', null, true], ['an@example.com', null, false]]},
        {icon: 'bell', text: '10 phút trước'},
        {icon: 'calendar', text: 'Công việc'},
    ],
};

// --- 1. a meeting, its top ----------------------------------------------------------------------------
let y = 40;
title('1 · Bấm một sự kiện: trang của nó ở cột phải, theo Google Calendar', 16, y - 26);
island(16, y);
page(16, y, {...MEETING, bar: [0, 120]});

// --- 2. scrolled ---------------------------------------------------------------------------------------
const X2 = 16 + IW + 32;
title('2 · Cuộn xuống: khách, nhắc, lịch', X2, y - 26);
island(X2, y);
page(X2, y, {...MEETING, bar: [96, 120]}, 150);

// --- 3. no link, a description ---------------------------------------------------------------------------
y += IH + 64;
title('3 · Không có link họp, có mô tả của anh', 16, y - 26);
island(16, y);
page(16, y, {
    title: 'Gặp khách ở văn phòng', when: 'Ngày mai, thứ Bảy 21/11 · 10:00 – 11:00', join: null,
    rows: [
        {icon: 'map-pin', text: 'Văn phòng Quận 1'},
        {icon: 'text-align-left', text: 'Mang hợp đồng bản in và bảng giá mới.', sub: ['Hỏi lại lịch giao hàng tháng 12.']},
        {icon: 'bell', text: '30 phút trước'},
        {icon: 'calendar', text: 'Công việc'},
    ],
});

// --- notes ---------------------------------------------------------------------------------------------------
const nl = (lines, x, y0) => lines.forEach((l, i) => note(l, x, y0 + i * 15));
nl([
    'Bấm hàng sự kiện (trước đây: mở app lịch; máy không có app thì không làm gì): cột phải thành trang của nó, tháng',
    'giữ nguyên. ← hay Esc: về danh sách; chọn ngày khác: danh sách ngày đó. Trang dài thì cuộn trong cột.',
    '',
    'Như Google Calendar, mỗi hàng một icon ở cột trái, chỉ hiện khi có:',
    '· tiêu đề với ô màu của lịch; ngày và giờ ("Cả ngày" cho sự kiện cả ngày)',
    '· Tham gia (nút chính, kem) và Chép link, link nhỏ ở dưới — như card "Sắp họp"; đã qua thì không có',
    '· địa điểm · mô tả của anh (tối đa 6 dòng; dòng chỉ chứa link họp thì bỏ, đã có Tham gia)',
    '· khách: số người, đồng ý / từ chối / chưa trả lời, từng người với dấu ✓ (kem) hay ? (không xanh: bảng màu),',
    '  người tổ chức',
    '· nhắc (VALARM) · tên lịch',
], X2, y);
nl([
    'Khác Google (EDS không có, hay ngoài phạm vi):',
    '· tên khách: Google chỉ gửi địa chỉ email qua CalDAV, không có tên và ảnh — chữ cái đầu',
    '· "Join by phone", số PIN, "Take meeting notes": bỏ — khối Google tự thêm vào mô tả cũng bỏ',
    '· sửa, xoá, "Going? Yes / No / Maybe": không — ghi vào lịch là mục M5',
    '',
    'Đọc từ EDS khi bấm (như Join), không đọc trước cả danh sách. Lỗi hay lâu hơn 5 s: tiêu đề, giờ, tên lịch.',
], X2, y + 10 * 15 + 24);

// --- 4. the row's dot ---------------------------------------------------------------------------------------
let ny = y + IH + 50;
title('4 · Chấm ở mỗi hàng của danh sách mang màu của lịch (Ethan, 2026-11-20)', 16, ny);
ny += 22;
fill(C.FILL1, 16, ny, RW, 32, 10);
dot(30, ny + 16, 4, WORK);
text('Họp sprint tuần 47', 44, ny + 8, {wt: 600});
text('15:00 – 15:30', 16 + RW - 12, ny + 8, {sz: 9.35, a: C.FG_MUTED, right: true});
fill(C.FILL1, 16 + RW + 16, ny, RW, 32, 10);
dot(30 + RW + 16, ny + 16, 4, [.7, .7, .7]);
text('Họp sprint tuần 47', 44 + RW + 16, ny + 8, {wt: 600});
text('15:00 – 15:30', 16 + RW * 2 + 4, ny + 8, {sz: 9.35, a: C.FG_MUTED, right: true});
note('màu của lịch, như ô màu trên trang (Google Calendar làm vậy)', 16, ny + 40);
note('trước đây: xám cho mọi lịch', 16 + RW + 16, ny + 40);
surf.writeToPNG(out);
