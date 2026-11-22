// Timer (design/compact "Hẹn giờ", 2026-11-22, Ethan): the tab, the pill and its card, the end,
// Pomodoro, Home's tile, and what is shared with GNOME Clocks. gjs -m timer.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, KW = 404;
const W = 1240, H = 1340;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, rgb = [1, 1, 1], right = false, center = false, max = 0, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
    const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
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
const icon = (n, x, y, s = 16, a = 1, rgb = [1, 1, 1]) => gicon(cr, n, x, y, s, rgb, a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});
const title = (t, x, y) => text(t, x, y, {sz: 12, wt: 600});
const CREAM = [0.945, 0.937, 0.91];
// the time left as a ring: the track fill-3, the part left fg, from 12 o'clock, clockwise as it goes
function ring(cx, cy, r, left, w = 2.5, a = 1) {
    cr.newPath(); cr.arc(cx, cy, r, 0, 2 * Math.PI); cr.setLineWidth(w); cr.setSourceRGBA(1, 1, 1, C.FILL3); cr.stroke();
    if (left > 0) {
        cr.newPath(); cr.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * left);
        cr.setLineCap(cairo.LineCap.ROUND); cr.setSourceRGBA(1, 1, 1, a); cr.stroke(); cr.setLineCap(cairo.LineCap.BUTT);
    }
}
function pill(x, y, t, time, left, {w0 = 0, more = null} = {}) {
    const e = text(t, 0, 0, {wt: 600, measure: true, max: 220});
    const te = text(time, 0, 0, {wt: 600, measure: true}).width;
    const me = more ? text(more, 0, 0, {wt: 600, measure: true}).width + 6 : 0;
    const w = w0 || Math.max(131, 8 + 24 + 6 + e.width + 12 + me + te + 12);
    fill(1, x, y, w, 32, 16, [0, 0, 0]);
    ring(x + 16, y + 16, 8.5, left, 2.5);
    if (t)
        text(t, x + 38, y + 8, {wt: 600, max: 220});
    text(time, x + w - 12, y + 8, {wt: 600, a: C.FG_MUTED, right: true});
    if (more)
        text(more, x + w - 12 - te - 6, y + 8, {wt: 600, a: C.FG_MUTED, right: true});
    return w;
}
function button(x, y, w, label, ic, {main = false} = {}) {
    fill(main ? 1 : C.FILL2, x, y, w, 32, 16, main ? CREAM : [1, 1, 1]);
    const rgb = main ? [0, 0, 0] : [1, 1, 1];
    const e = label ? text(label, 0, 0, {sz: SUB, wt: 600, measure: true}).width : 0;
    const full = (ic ? 16 : 0) + (ic && label ? 6 : 0) + e;
    let bx = x + (w - full) / 2;
    if (ic) {
        icon(ic, bx, y + 8, 16, 1, rgb);
        bx += 22;
    }
    if (label)
        text(label, bx, y + 8, {sz: SUB, wt: 600, rgb});
}
function card(x, y, head, sub, buttons, {left = .55, ic = null} = {}) {
    cr.newPath(); rr(x, y, KW, 104, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    if (ic) {
        fill(C.FILL2, x + 14, y + 8, 40, 40, 20); icon(ic, x + 26, y + 20, 16);
    } else {
        ring(x + 34, y + 28, 17, left, 3.5);
    }
    text(head, x + 66, y + 10, {wt: 600, max: KW - 120});
    text(sub, x + 66, y + 30, {sz: SUB, a: C.FG_MUTED});
    fill(C.FILL2, x + KW - 46, y + 12, 32, 32, 16); icon('xmark', x + KW - 38, y + 20, 16, C.FG_MUTED);
    const bw = (KW - 24 - (buttons.length - 1) * 8) / buttons.length;
    buttons.forEach((b, i) => button(x + 12 + i * (bw + 8), y + 60, bw, b.label, b.icon, b));
}
// the island's expanded frame with its strip, the Timer tab selected (in ⋯)
function expanded(x, y, w = 560, h = 280) {
    fill(1, x, y, w, h, 28, [0, 0, 0]);
    fill(C.FILL2, x + 12, y + 12, 236, 32, 16);
    ['house', 'music-note', 'bell'].forEach((n, i) => icon(n, x + 24 + i * 34, y + 20, 16, C.FG_MUTED));
    fill(C.FILL3, x + 12 + 3 * 34 + 2, y + 15, 104, 26, 13);
    icon('alarm', x + 24 + 3 * 34, y + 20, 16); text('Hẹn giờ', x + 24 + 3 * 34 + 22, y + 20, {sz: SUB, wt: 600});
    fill(C.FILL2, x + w - 44, y + 12, 32, 32, 16); icon('gear', x + w - 36, y + 20, 16, C.FG_MUTED);
}
// a preset's row: its name, its length, ▶
function preset(x, y, w, name, len, {chip = null} = {}) {
    fill(C.FILL1, x, y, w, 36, 18);
    text(name, x + 14, y + 10, {wt: 600, max: w - 120});
    if (chip)
        text(chip, x + 14 + text(name, 0, 0, {wt: 600, measure: true}).width + 8, y + 11, {sz: SUB, a: C.FG_SUBTLE});
    text(len, x + w - 44, y + 10, {a: C.FG_MUTED, right: true});
    fill(C.FILL2, x + w - 34, y + 4, 28, 28, 14); icon('play-fill', x + w - 27, y + 10, 14);
}

// --- 1. the tab, none running --------------------------------------------------------------------------
let y = 40;
title('1 · Tab Hẹn giờ (trong ⋯), chưa chạy cái nào', 16, y - 26);
expanded(16, y);
{
    const lx = 16 + 12, ty = y + 56, lw = 232;
    // left: the length to start, as Clocks' setup: hours:minutes:seconds, − / +, quick lengths, Start
    text('0:05:00', lx + lw / 2, ty + 10, {sz: 25, wt: 600, center: true});
    fill(C.FILL2, lx + 4, ty + 14, 32, 32, 16); icon('minus', lx + 12, ty + 22, 16);
    fill(C.FILL2, lx + lw - 36, ty + 14, 32, 32, 16); icon('plus', lx + lw - 28, ty + 22, 16);
    ['1', '3', '5', '10', '15', '30'].forEach((m, i) => {
        const cw = 34, cx = lx + i * (cw + 5.6);
        fill(m === '5' ? C.FILL3 : C.FILL1, cx, ty + 66, cw, 26, 13);
        text(m, cx + cw / 2, ty + 71, {sz: SUB, wt: m === '5' ? 600 : 400, center: true, a: m === '5' ? 1 : C.FG_MUTED});
    });
    text('phút', lx + lw / 2, ty + 98, {sz: 8.5, a: C.FG_SUBTLE, center: true});
    button(lx, ty + 122, lw, 'Bắt đầu', 'play-fill', {main: true});
    // right: presets, GNOME Clocks' own list, and Pomodoro
    const rx = 16 + 12 + lw + 16, rw = 560 - 12 - lw - 16 - 12;
    text('ĐÃ LƯU · CHUNG VỚI ĐỒNG HỒ', rx + 4, ty, {sz: 8, wt: 700, a: C.FG_SUBTLE});
    preset(rx, ty + 18, rw, 'Pomodoro', '25 + 5', {chip: '×4'});
    preset(rx, ty + 58, rw, 'Luộc trứng', '7:00');
    preset(rx, ty + 98, rw, 'Pha trà', '3:00');
    preset(rx, ty + 138, rw, '10 phút', '10:00');
}
const NX = 16 + 560 + 24;
note('Trái: chọn thời gian như ở Đồng hồ (giờ:phút:giây, −/+ một phút), bấm số để chọn nhanh; Bắt đầu (kem).', NX, y);
note('Phải: các hẹn giờ đã lưu — chính danh sách của GNOME Đồng hồ (org.gnome.clocks timers):', NX, y + 14);
note('thêm, sửa, xoá ở đây thì Đồng hồ thấy, và ngược lại. ▶ chạy luôn.', NX, y + 28);
note('Pomodoro là của Buoy (Đồng hồ không có vòng): 25 phút làm, 5 phút nghỉ, 4 lượt rồi nghỉ 15.', NX, y + 50);
note('Hàng: chuột phải hay giữ để sửa tên / thời gian, xoá; "Lưu" cạnh Bắt đầu khi chọn một thời gian mới.', NX, y + 64);
note('Phím: Enter bắt đầu, ↑↓ chọn hàng, Delete xoá.', NX, y + 78);

// --- 2. the tab, running ----------------------------------------------------------------------------
y += 280 + 56;
title('2 · Tab khi đang chạy', 16, y - 26);
expanded(16, y);
{
    const lx = 16 + 12, ty = y + 56, lw = 232, cx = lx + lw / 2, cy = ty + 66;
    ring(cx, cy, 58, .66, 6);
    text('3:18', cx, cy - 22, {sz: 26, wt: 600, center: true});
    text('Luộc trứng', cx, cy + 12, {sz: SUB, a: C.FG_MUTED, center: true});
    text('xong lúc 15:42', cx, cy + 26, {sz: 8.5, a: C.FG_SUBTLE, center: true});
    const bw = (lw - 16) / 3;
    button(lx, ty + 146, bw, null, 'pause-fill', {main: true});
    button(lx + bw + 8, ty + 146, bw, '+1 phút', null);
    button(lx + 2 * (bw + 8), ty + 146, bw, null, 'stop-fill');
    const rx = 16 + 12 + lw + 16, rw = 560 - 12 - lw - 16 - 12;
    text('ĐANG CHẠY', rx + 4, ty, {sz: 8, wt: 700, a: C.FG_SUBTLE});
    fill(C.FILL3, rx, ty + 18, rw, 36, 18); ring(rx + 18, ty + 36, 7, .66, 2.5);
    text('Luộc trứng', rx + 34, ty + 28, {wt: 600}); text('3:18', rx + rw - 14, ty + 28, {a: C.FG_MUTED, right: true});
    fill(C.FILL1, rx, ty + 58, rw, 36, 18); ring(rx + 18, ty + 76, 7, .3, 2.5);
    text('Pomodoro · làm 2/4', rx + 34, ty + 68, {wt: 600}); text('17:40', rx + rw - 14, ty + 68, {a: C.FG_MUTED, right: true});
    text('ĐÃ LƯU', rx + 4, ty + 106, {sz: 8, wt: 700, a: C.FG_SUBTLE});
    preset(rx, ty + 124, rw, 'Pha trà', '3:00');
}
note('Vòng to: phần còn lại (fg) trên nền fill-3, chạy ngược chiều kim đồng hồ khi giảm; số còn lại, tên, giờ xong.', NX, y);
note('Nút: ⏸ / ▶ (kem), +1 phút, ■ dừng. Nhiều hẹn giờ cùng lúc như Đồng hồ: danh sách "Đang chạy" ở phải,', NX, y + 14);
note('bấm một hàng để nó lên vòng to. Esc: về danh sách (không dừng).', NX, y + 28);
note('Tắt Buoy, khoá máy, Shell khởi động lại (X11): hẹn giờ vẫn chạy — Buoy giữ giờ xong, không đếm tick.', NX, y + 50);
note('Không timer mỗi giây khi island đóng: pill dùng {until} của kit (đếm khi đang hiện), một timeout tới giờ xong.', NX, y + 64);

// --- 3. the pill and its card -----------------------------------------------------------------------
y += 280 + 56;
title('3 · Pill và card', 16, y - 26);
pill(16, y, 'Luộc trứng', '3:18', .66);
pill(16 + 190, y, '', '3:18', .66, {w0: 120});
pill(16 + 330, y, 'Luộc trứng', '3:18', .66, {more: '+1'});
note('pill: vòng còn lại ở đầu (thay icon), tên (không tên: "Hẹn giờ"), số đếm ngược ở cuối (fg-muted).', 16, y + 40);
note('pill phụ: vòng và số. Hai hẹn giờ: cái sắp xong trước, "+1". kind timer (20): trên nhạc, dưới thông báo.', 16, y + 54);
card(16, y + 80, 'Luộc trứng', '7 phút · xong lúc 15:42', [{icon: 'pause-fill', main: true}, {label: '+1 phút'}, {icon: 'stop-fill'}]);
note('hover: card với vòng 40, tên, "7 phút · xong lúc 15:42"; ⏸ (kem), +1 phút, ■; × tắt pill, hẹn giờ vẫn chạy (tab còn).', 16, y + 192);
note('Tạm dừng: số và vòng đứng yên, ▶ thay ⏸; pill đưa hẹn giờ đang chạy lên trước, cái tạm dừng thành "+1".', 16, y + 206);

// --- 4. the end ---------------------------------------------------------------------------------------
title('4 · Hết giờ', NX, y - 26);
card(NX, y, 'Hết giờ · Luộc trứng', '7 phút · 15:42', [{label: 'Chạy lại', icon: 'arrow-rotate-left'}, {label: 'Xong', main: true}], {ic: 'alarm'});
note('Card đến và ở lại tới khi bấm (như cuộc gọi đến, không tự tắt); âm "complete" của Đồng hồ một lần,', NX, y + 112);
note('(Không làm phiền: không tiếng, card vẫn hiện). Hết giờ lúc Buoy tắt hay khoá máy: card hiện khi quay lại.', NX, y + 126);
note('Hẹn giờ chạy trong Đồng hồ hết giờ: thay thông báo "Time is up!" của nó bằng card này (không có Chạy lại).', NX, y + 140);

// --- 5. Pomodoro ------------------------------------------------------------------------------------
y += 270;
title('5 · Pomodoro', 16, y - 26);
card(16, y, 'Nghỉ 5 phút', 'Xong lượt 2/4 · 25 phút', [{label: 'Nghỉ', main: true}, {label: 'Làm tiếp'}, {label: 'Thôi'}], {ic: 'alarm'});
pill(16 + KW + 16, y + 8, 'Làm 2/4', '17:40', .7);
pill(16 + KW + 16, y + 48, 'Nghỉ', '4:12', .84);
note('Hết lượt làm: card "Nghỉ 5 phút" (sau lượt 4: "Nghỉ 15 phút"); hết nghỉ: card "Làm lượt 3/4". Không tự chạy tiếp:', 16, y + 112);
note('mỗi lượt chờ anh bấm. Pill: "Làm 2/4" / "Nghỉ". Độ dài sửa ở prefs (25 / 5 / 15, 4 lượt).', 16, y + 126);

// --- 6. Home's tile -------------------------------------------------------------------------------------
title('6 · Ô Hẹn giờ ở Home (sau ô điện thoại)', NX, y - 26);
const tile = (x, ty, val, cap, ic, left = null) => {
    fill(C.FILL1, x, ty, 128, 100, 16);
    if (left === null)
        icon(ic, x + 14, ty + 14, 16);
    else
        ring(x + 22, ty + 22, 8, left, 2.5);
    text(val, x + 12, ty + 40, {sz: 16.5, wt: 600});
    text(cap, x + 12, ty + 68, {sz: SUB, a: C.FG_MUTED, max: 104});
};
tile(NX, y, '5:00', 'Hẹn giờ', 'alarm');
note('Không chạy: lần trước dùng ("5:00"), bấm: mở tab với thời gian đó chọn sẵn.', NX + 144, y + 6);
note('Đang chạy: Home có ô của chính hẹn giờ (như mọi hoạt động),', NX + 144, y + 20);
note('nên ô này nhường chỗ.', NX + 144, y + 34);

// --- 7. GNOME --------------------------------------------------------------------------------------------
y += 190;
title('7 · Đồng bộ với GNOME', 16, y - 26);
note('Chung: danh sách hẹn giờ đã lưu (org.gnome.clocks timers: thời gian + tên). Đồng hồ chỉ lưu danh sách này.', 16, y);
note('Không chung được: hẹn giờ đang chạy trong Đồng hồ — nó chỉ nằm trong tiến trình Đồng hồ, không có D-Bus, đóng cửa sổ là dừng.', 16, y + 14);
note('Nên Buoy không hiện được đếm ngược của Đồng hồ; chỉ thay thông báo "Time is up!" khi nó hết giờ (4). Hẹn giờ của Buoy cũng không hiện trong Đồng hồ.', 16, y + 28);
note('GNOME Shell 50 không có hẹn giờ riêng (lịch, Quick Settings đều không).', 16, y + 42);

// --- 8. open choices ----------------------------------------------------------------------------------
y += 96;
title('8 · Đã chốt (Ethan, 2026-11-22)', 16, y - 26);
note('a. Giữ máy thức: khi hẹn giờ chạy, chặn ngủ (suspend) để chuông kêu đúng giờ — màn hình vẫn tắt, khoá như thường. Bật mặc định, tắt ở prefs.', 16, y);
note('    Chỉ chặn ngủ (gnome-session Inhibit, cờ suspend).', 16, y + 14);
note('b. Bấm giờ (stopwatch, SPEC §6b): làm sau, không trong mục này.', 16, y + 28);
surf.writeToPNG(out);
