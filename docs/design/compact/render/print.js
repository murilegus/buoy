// Print job progress (design/compact "Lệnh in", 2026-11-23, Ethan): a print job in the pill from CUPS's
// own D-Bus signals, its end, the printer's problems, in place of gsd's "Printers" notifications. gjs -m print.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon, t} from '../../render/lib.js';

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
title(t('1 · Đang in: pill ở lại tới khi xong', '1 · Printing: the pill stays until done'), 16, y - 26);
card(16, y, P, 'Báo cáo quý 3.pdf', t('HP LaserJet M15 · trang 3', 'HP LaserJet M15 · Page 3'), [{label: t('Máy in', 'Printers')}]);
pill(NX, y + 8, P, 'Báo cáo quý 3.pdf', t('trang 3', 'Page 3'));
pill(NX + 290, y + 8, P, 'Báo cáo quý 3.pdf', '+1');
note(t('Pill: máy in, tên tài liệu, "trang 3" khi CUPS đã báo số trang in xong (không có: không gì). Không có thanh tiến độ:', 'Pill: printer, document name, "Page 3" once CUPS has told the pages printed (none: nothing). No progress bar:'), NX, y + 50);
note(t('tín hiệu của CUPS chỉ có số trang đã in, không có tổng. Hai lệnh in: lệnh đang in, "+1".', 'CUPS\'s signal has only the pages printed, no total. Two print jobs: the one printing, "+1".'), NX, y + 64);
note(t('Hover: card "HP LaserJet M15 · trang 3", nút "Máy in" mở Cài đặt → Máy in (huỷ lệnh in ở đó).', 'Hover: card "HP LaserJet M15 · Page 3", the "Printers" button opens Settings → Printers (cancel a job there).'), NX, y + 86);
note(t('Đang chờ (máy in bận, lệnh trước chưa xong): "đang chờ" thay cho số trang.', 'Waiting (printer busy, the job before not done): "Waiting" in place of the page number.'), NX, y + 100);

let x = 16;
// --- 2. the end -------------------------------------------------------------------------------------
y += 104 + 60;
title(t('2 · Xong, huỷ, lỗi', '2 · Done, cancelled, failed'), 16, y - 26);
x = 16;
x += pill(x, y, P, t('Đã in Báo cáo quý 3.pdf', 'Printed Báo cáo quý 3.pdf'), t('3 trang', '3 pages')) + 14;
x += pill(x, y, P, t('Đã huỷ Báo cáo quý 3.pdf', 'Cancelled Báo cáo quý 3.pdf')) + 14;
note(t('Xong: flash 3 s, số trang ở cuối (khi biết). Huỷ: flash 3 s.', 'Done: a 3 s flash, the page count at the end (when known). Cancelled: a 3 s flash.'), 16, y + 40);
card(16, y + 70, P, t('Không in được Báo cáo quý 3.pdf', 'Couldn\'t Print Báo cáo quý 3.pdf'), t('HP LaserJet M15 · máy in dừng', 'HP LaserJet M15 · Printer Stopped'), [{label: t('Máy in', 'Printers'), main: true}]);
note(t('Lỗi (CUPS: aborted, hay lệnh in bị dừng): card ở lại tới khi bấm, nút "Máy in" (kem); × tắt.', 'Failed (CUPS: aborted, or the job stopped): the card stays until clicked, "Printers" button (cream); × closes.'), NX, y + 78);
note(t('Lệnh in cần mật khẩu (held for authentication): để thông báo của GNOME, vì nó có nút nhập mật khẩu.', 'A job that needs a password (held for authentication): left to GNOME\'s notification, as it has the password button.'), NX, y + 92);

// --- 3. the printer --------------------------------------------------------------------------------
y += 70 + 104 + 60;
title(t('3 · Máy in có vấn đề (printer-state-reasons)', '3 · A printer with a problem (printer-state-reasons)'), 16, y - 26);
card(16, y, P, t('Hết giấy', 'Out of Paper'), t('HP LaserJet M15 · Báo cáo quý 3.pdf đang chờ', 'HP LaserJet M15 · Báo cáo quý 3.pdf waiting'), [{label: t('Máy in', 'Printers')}]);
x = NX;
x += pill(x, y + 8, P, t('Sắp hết mực', 'Ink Low'), 'HP LaserJet M15') + 14;
note(t('Cần anh (in không tiếp được): hết giấy, kẹt giấy, mở nắp / cửa, hết mực, máy in ngoại tuyến, lỗi máy in —', 'Needs you (printing cannot go on): out of paper, paper jam, cover / door open, out of ink, printer offline, printer error —'), NX, y + 50);
note(t('card rồi pill ở lại tới khi máy in hết lỗi đó. Sắp hết giấy, sắp hết mực: flash 3 s, mỗi lần một.', 'card, then the pill stays until the printer clears it. Paper low, ink low: a 3 s flash, one at a time.'), NX, y + 64);
note(t('Chữ như của GNOME (gsd print-notifications, giống system-config-printer).', 'Words as GNOME\'s (gsd print-notifications, same as system-config-printer).'), NX, y + 78);

// --- 4. GNOME, limits --------------------------------------------------------------------------------
y += 104 + 60;
title(t('4 · Thay GNOME, và giới hạn', '4 · In place of GNOME, and limits'), 16, y - 26);
note(t('Thông báo "Printers" của gsd (Printing, Printing completed, stopped / cancelled / aborted, toner, paper…) không hiện khi Buoy đang nói về nó;', 'gsd\'s "Printers" notifications (Printing, Printing completed, stopped / cancelled / aborted, toner, paper…) do not show while Buoy is telling it;'), 16, y);
note(t('"Printer added", "Printer removed" và lệnh cần mật khẩu vẫn là thông báo của GNOME.', '"Printer added", "Printer removed" and jobs that need a password stay GNOME notifications.'), 16, y + 14);
note(t('Chỉ có khi gsd đăng ký với CUPS (phiên GNOME, CUPS trên máy này); Buoy chỉ nghe tín hiệu, không đăng ký thêm, không dò.', 'Only when gsd subscribes to CUPS (a GNOME session, CUPS on this computer); Buoy only listens to signals, no subscription of its own, no polling.'), 16, y + 28);
note(t('Tín hiệu không nói lệnh in của ai: máy dùng chung nhiều người thì thấy cả lệnh in của người khác (gsd hỏi CUPS thêm, Buoy không).', 'The signal does not say whose job it is: on a shared computer you also see other people\'s jobs (gsd asks CUPS more, Buoy does not).'), 16, y + 42);
note(t('Không có máy in nào: module không làm gì. Icon: printer của Gravity.', 'No printer at all: the module does nothing. Icon: Gravity\'s printer.'), 16, y + 56);
surf.writeToPNG(out);
