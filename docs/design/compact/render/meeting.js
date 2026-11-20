// Meeting in 5 min · Join (design/compact "Sắp họp", 2026-11-20, Ethan): a timed event about to start,
// with Join when it has a meeting link (read from EDS for that one event).
// gjs -m meeting.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, KW = 404;
const W = 1200, H = 610;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, rgb = [1, 1, 1], right = false, max = 0, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
    const at = new Pango.AttrList(); at.insert(Pango.attr_font_features_new('tnum')); L.set_attributes(at);
    L.set_width(max > 0 ? max * Pango.SCALE : -1); L.set_ellipsize(max > 0 ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    const e = L.get_pixel_extents()[1];
    L.set_width(-1);
    if (measure)
        return e;
    cr.setSourceRGBA(...rgb, a); cr.moveTo(right ? x - e.width : x, y); PangoCairo.show_layout(cr, L);
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
// the leading: the calendar glyph (x-office-calendar), as the idle pill's next event
const lead = (x, y, s) => icon('calendar', x + 4, y + 4, s > 24 ? s - 8 : 16);

function pill(x, y, t, tail, {rgb = [1, 1, 1], a = C.FG_MUTED} = {}) {
    const e = text(t, 0, 0, {wt: 600, measure: true, max: 240});
    const te = text(tail, 0, 0, {wt: 600, measure: true});
    const w = 8 + 24 + 6 + e.width + 12 + te.width + 12;
    fill(1, x, y, w, 32, 16, [0, 0, 0]);
    lead(x + 4, y + 4, 24);
    text(t, x + 38, y + 8, {wt: 600, max: 240});
    text(tail, x + w - 12, y + 8, {wt: 600, a, rgb, right: true});
    return w;
}
function card(x, y, t, sub, buttons) {
    const h = buttons.length ? 104 : 64;
    cr.newPath(); rr(x, y, KW, h, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    lead(x + 14, y + 8 + (buttons.length ? 0 : 4), 40);
    text(t, x + 66, y + 10 + (buttons.length ? 0 : 4), {wt: 600, max: KW - 120});
    text(sub, x + 66, y + 30 + (buttons.length ? 0 : 4), {sz: SUB, a: C.FG_MUTED});
    fill(C.FILL2, x + KW - 46, y + 12 + (buttons.length ? 0 : 4), 32, 32, 16);
    icon('xmark', x + KW - 38, y + 20 + (buttons.length ? 0 : 4), 16, C.FG_MUTED);
    const gap = 8, bw = (KW - 24 - gap * (buttons.length - 1)) / Math.max(1, buttons.length);
    buttons.forEach(([ic, label, accent], i) => {
        const bx = x + 12 + i * (bw + gap);
        fill(accent ? 1 : C.FILL2, bx, y + 60, bw, 32, 16, accent ? C.CREAM : [1, 1, 1]);
        const e = text(label, 0, 0, {sz: SUB, wt: 600, measure: true});
        const fg = accent ? [0, 0, 0] : [1, 1, 1];
        icon(ic, bx + (bw - e.width - 22) / 2, y + 68, 16, 1, fg);
        text(label, bx + (bw - e.width - 22) / 2 + 22, y + 68, {sz: SUB, wt: 600, rgb: fg});
    });
    return h;
}
const PX = 16 + KW + 32;

// --- 1. five minutes before ---------------------------------------------------------------------------
let y = 40;
title('1 · Còn 5 phút: card như thông báo, rồi pill đếm ngược', 16, y - 26);
card(16, y, 'Họp sprint tuần 47', '15:00 – 15:30 · còn 5 phút', [['video', 'Tham gia Google Meet', true]]);
pill(PX, y + 8, 'Họp sprint tuần 47', '4:59');
note('5 phút trước một sự kiện có giờ (không phải cả ngày), từ lịch của GNOME (cùng nguồn với pill nghỉ và tab Lịch).', PX, y + 50);
note('Pill: tiêu đề, đếm ngược tới giờ bắt đầu ở cuối. Bấm pill: mở card (Tham gia, ×).', PX, y + 64);
note('"Tham gia Google Meet" (nút chính, kem như câu trả lời của ask): mở link họp, rồi pill tắt.', PX, y + 86);
note('Link đọc từ EDS chỉ cho sự kiện sắp bắt đầu này: Google Meet, Zoom, Teams, Webex, Jitsi', PX, y + 100);
note('(trong địa điểm, mô tả, URL của sự kiện).', PX, y + 114);

// --- 2. it starts -------------------------------------------------------------------------------------------
y += 104 + 72;
title('2 · Đến giờ: card lần nữa, pill ở lại 10 phút', 16, y - 26);
card(16, y, 'Họp sprint tuần 47', '15:00 – 15:30 · bây giờ', [['video', 'Tham gia Google Meet', true]]);
pill(PX, y + 8, 'Họp sprint tuần 47', 'bây giờ', {rgb: C.CAM, a: 1});
note('Đến giờ: card hiện lại một lần ("bây giờ", màu xanh như cuộc gọi). Pill ở lại tới 10 phút sau giờ bắt đầu,', PX, y + 50);
note('hoặc tới khi bấm Tham gia hay ×. Hover giữ nó; Esc, ×: tắt, không nhắc lại.', PX, y + 64);
note('Không "cần bạn" (không đèn đỏ). Thứ tự: kind calendar (25, đã có trong bảng ưu tiên), card như thông báo.', PX, y + 86);
note('Đã bấm × hay Tham gia thì không hiện lại, kể cả sau khi khoá rồi mở máy.', PX, y + 100);

// --- 3. no link ---------------------------------------------------------------------------------------------
y += 104 + 72;
title('3 · Không có link họp', 16, y - 26);
const h3 = card(16, y, 'Gặp khách ở văn phòng', '15:00 – 16:00 · còn 5 phút · Tầng 3', []);
note('Không có link: không nút; địa điểm (nếu có) ở cuối dòng phụ. Pill như trên.', 16, y + h3 + 12);

title('4 · Hai sự kiện cùng giờ', PX, y - 26);
pill(PX, y, 'Họp sprint tuần 47', '4:59');
pill(PX, y + 40, 'Gặp khách ở văn phòng', '4:59');
note('Mỗi sự kiện một pill (như hai thông báo).', PX, y + 82);

// --- 5. GNOME's reminder ------------------------------------------------------------------------------------
y += 104 + 40;
title('5 · Nhắc của GNOME ("Reminders")', 16, y - 26);
note('Sự kiện Google mặc định có nhắc 10 phút trước; evolution-alarm-notify hiện thông báo "Reminders" lúc đó', 16, y);
note('(app Evolution Alarm Notify, đã qua card thông báo của Buoy).', 16, y + 14);
note('Thay (Ethan, 2026-11-20): nhắc của một sự kiện có giờ bắt đầu trong 15 phút tới bị gỡ ngay khi tới — không', 16, y + 36);
note('banner, không nằm trong danh sách — như "“…” is ready" và "Low Battery". Nhắc sớm hơn (30 phút, 1 ngày) vẫn giữ.', 16, y + 50);
surf.writeToPNG(out);
