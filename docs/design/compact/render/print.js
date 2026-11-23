// Print job progress (design/compact "Lệnh in", 2026-11-23, Ethan): a print job in the pill from CUPS's
// own D-Bus signals, its end, the printer's problems, in place of gsd's "Printers" notifications. gjs -m print.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, KW = 404;
const W = 1240, H = 760;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, rgb = [1, 1, 1], right = false, center = false, max = 0, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
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
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});
const title = (t, x, y) => text(t, x, y, {sz: 12, wt: 600});
const CREAM = [0.945, 0.937, 0.91];

// an icon: Gravity's (g:name), or Buoy's own Wi-Fi (w:0..4: none, weak, ok, good, excellent)
function ic(spec, x, y, s = 16, a = 1) {
    if (spec.startsWith('w:'))
        gicon(cr, ['wifi-none', 'wifi-weak', 'wifi-ok', 'wifi-good', 'wifi-excellent'][Number(spec.slice(2))], x, y, s, [1, 1, 1], a);
    else
        gicon(cr, spec.replace(/^g:/, ''), x, y, s, [1, 1, 1], a);
}
// a pill at its real width (design/tokens): 8 + leading 24 + 6 + text + 8, at least 131
function pill(x, y, lead, t, trail = null) {
    const te = text(t, 0, 0, {wt: 600, measure: true});
    const tr = trail ? text(trail, 0, 0, {wt: 600, measure: true}).width + 10 : 0;
    const w = Math.max(131, 8 + 24 + 6 + te.width + tr + 12);
    fill(1, x, y, w, 32, 16, [0, 0, 0]);
    ic(lead, x + 12, y + 8, 16);
    text(t, x + 38, y + 8, {wt: 600});
    if (trail)
        text(trail, x + w - 12, y + 8, {wt: 600, a: C.FG_MUTED, right: true});
    return w;
}
function card(x, y, lead, head, sub, buttons) {
    cr.newPath(); rr(x, y, KW, 104, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    fill(C.FILL2, x + 14, y + 8, 40, 40, 20); ic(lead, x + 26, y + 20, 16);
    text(head, x + 66, y + 10, {wt: 600, max: KW - 120});
    text(sub, x + 66, y + 30, {sz: SUB, a: C.FG_MUTED});
    fill(C.FILL2, x + KW - 46, y + 12, 32, 32, 16); gicon(cr, 'xmark', x + KW - 38, y + 20, 16, [1, 1, 1], C.FG_MUTED);
    const bw = (KW - 24 - (buttons.length - 1) * 8) / buttons.length;
    buttons.forEach((b, i) => {
        const bx = x + 12 + i * (bw + 8);
        fill(b.main ? 1 : C.FILL2, bx, y + 60, bw, 32, 16, b.main ? CREAM : [1, 1, 1]);
        text(b.label, bx + bw / 2, y + 68, {sz: SUB, wt: 600, center: true, rgb: b.main ? [0, 0, 0] : [1, 1, 1]});
    });
}
const NX = 16 + KW + 40;

const P = 'g:printer';
// --- 1. printing ---------------------------------------------------------------------------------
let y = 40;
title('1 · Đang in: pill ở lại tới khi xong', 16, y - 26);
card(16, y, P, 'Báo cáo quý 3.pdf', 'HP LaserJet M15 · trang 3', [{label: 'Máy in'}]);
pill(NX, y + 8, P, 'Báo cáo quý 3.pdf', 'trang 3');
pill(NX + 290, y + 8, P, 'Báo cáo quý 3.pdf', '+1');
note('Pill: máy in, tên tài liệu, "trang 3" khi CUPS đã báo số trang in xong (không có: không gì). Không có thanh tiến độ:', NX, y + 50);
note('tín hiệu của CUPS chỉ có số trang đã in, không có tổng. Hai lệnh in: lệnh đang in, "+1".', NX, y + 64);
note('Hover: card "HP LaserJet M15 · trang 3", nút "Máy in" mở Cài đặt → Máy in (huỷ lệnh in ở đó).', NX, y + 86);
note('Đang chờ (máy in bận, lệnh trước chưa xong): "đang chờ" thay cho số trang.', NX, y + 100);

let x = 16;
// --- 2. the end -------------------------------------------------------------------------------------
y += 104 + 60;
title('2 · Xong, huỷ, lỗi', 16, y - 26);
x = 16;
x += pill(x, y, P, 'Đã in Báo cáo quý 3.pdf', '3 trang') + 14;
x += pill(x, y, P, 'Đã huỷ Báo cáo quý 3.pdf') + 14;
note('Xong: flash 3 s, số trang ở cuối (khi biết). Huỷ: flash 3 s.', 16, y + 40);
card(16, y + 70, P, 'Không in được Báo cáo quý 3.pdf', 'HP LaserJet M15 · máy in dừng', [{label: 'Máy in', main: true}]);
note('Lỗi (CUPS: aborted, hay lệnh in bị dừng): card ở lại tới khi bấm, nút "Máy in" (kem); × tắt.', NX, y + 78);
note('Lệnh in cần mật khẩu (held for authentication): để thông báo của GNOME, vì nó có nút nhập mật khẩu.', NX, y + 92);

// --- 3. the printer --------------------------------------------------------------------------------
y += 70 + 104 + 60;
title('3 · Máy in có vấn đề (printer-state-reasons)', 16, y - 26);
card(16, y, P, 'Hết giấy', 'HP LaserJet M15 · Báo cáo quý 3.pdf đang chờ', [{label: 'Máy in'}]);
x = NX;
x += pill(x, y + 8, P, 'Sắp hết mực', 'HP LaserJet M15') + 14;
note('Cần anh (in không tiếp được): hết giấy, kẹt giấy, mở nắp / cửa, hết mực, máy in ngoại tuyến, lỗi máy in —', NX, y + 50);
note('card rồi pill ở lại tới khi máy in hết lỗi đó. Sắp hết giấy, sắp hết mực: flash 3 s, mỗi lần một.', NX, y + 64);
note('Chữ như của GNOME (gsd print-notifications, giống system-config-printer).', NX, y + 78);

// --- 4. GNOME, limits --------------------------------------------------------------------------------
y += 104 + 60;
title('4 · Thay GNOME, và giới hạn', 16, y - 26);
note('Thông báo "Printers" của gsd (Printing, Printing completed, stopped / cancelled / aborted, toner, paper…) không hiện khi Buoy đang nói về nó;', 16, y);
note('"Printer added", "Printer removed" và lệnh cần mật khẩu vẫn là thông báo của GNOME.', 16, y + 14);
note('Chỉ có khi gsd đăng ký với CUPS (phiên GNOME, CUPS trên máy này); Buoy chỉ nghe tín hiệu, không đăng ký thêm, không dò.', 16, y + 28);
note('Tín hiệu không nói lệnh in của ai: máy dùng chung nhiều người thì thấy cả lệnh in của người khác (gsd hỏi CUPS thêm, Buoy không).', 16, y + 42);
note('Không có máy in nào: module không làm gì. Icon: printer của Gravity.', 16, y + 56);
surf.writeToPNG(out);
