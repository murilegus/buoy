// Greeting (design/expanded "Lời chào", 2026-11-25, Ethan): GREETING.md §1–§8 drawn — Start and Wake
// (expanded), Welcome back, Leaving, special days, the weather line — and the three parts. gjs -m greeting.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, drawBu, colourIcon} from '../../render/lib.js';

const [out] = ARGV;
const W = 1240, H = 1000;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, max = 0, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
    L.set_width(max > 0 ? max * Pango.SCALE : -1); L.set_ellipsize(max > 0 ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    const e = L.get_pixel_extents()[1];
    L.set_width(-1);
    if (measure)
        return e;
    cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const black = (x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGB(0, 0, 0); cr.fill(); };
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});
const title = (t, x, y) => text(t, x, y, {sz: 12, wt: 600});

// Start / Wake: expanded 560, no tabs; Bu 56 at 16 (design/expanded), the lines beside him; 56 + 16n
function hello(x, y, pose, lines, {weather = null} = {}) {
    const h = lines.length + (weather ? 1 : 0) >= 3 ? 120 : 88;
    black(x, y, 560, h, 28);
    drawBu(cr, pose, x + 16, y + (h - 50) / 2, 5);
    let ty = y + (h === 120 ? 22 : 20);
    text(lines[0], x + 88, ty, {sz: 15, wt: 700});
    ty += 28;
    lines.slice(1).forEach(l => {
        text(l, x + 88, ty, {a: C.FG_MUTED, max: 450});
        ty += 22;
    });
    if (weather) {
        colourIcon(cr, weather.icon, x + 88, ty - 1, 16);
        text(weather.line, x + 110, ty, {a: C.FG_MUTED, max: 430});
    }
    return h;
}
// minimal: Bu 20 (cell 2) and the line; compact: Bu 40 (cell 4), a title over a subtitle
function minimal(x, y, pose, t) {
    const w = Math.max(131, 8 + 24 + 6 + text(t, 0, 0, {wt: 600, measure: true}).width + 12);
    black(x, y, w, 32, 16);
    drawBu(cr, pose, x + 10, y + 6, 2);
    text(t, x + 38, y + 8, {wt: 600});
    return w;
}
function compact(x, y, pose, t, sub) {
    black(x, y, 404, 56, 28);
    drawBu(cr, pose, x + 14, y + 8, 4);
    text(t, x + 66, y + 10, {wt: 600});
    text(sub, x + 66, y + 30, {sz: 9.35, a: C.FG_MUTED});
}

const NX = 16 + 560 + 32;
// --- 1. Start, Wake ---------------------------------------------------------------------------------
let y = 40;
title('1 · Bật máy, thức dậy sau ngủ ≥ 3 giờ: expanded, ~8 s, Bu vẫy tay 5 s', 16, y - 26);
let h = hello(16, y, 'wave', ['Chào buổi sáng, Ethan.', 'Bây giờ là 07:42, thứ Sáu, 6 tháng 11 năm 2026.'],
    {weather: {icon: 'weather-few-clouds', line: 'TP. Hồ Chí Minh: 28 °C, có mây, gió nhẹ.'}});
note('Dòng 1: lời chào theo giờ và thứ (§3). Dòng 2: giờ theo định dạng GNOME, ngày đủ.', NX, y + 4);
note('Dòng 3: thời tiết từ client của GNOME (như lịch trên thanh): nơi, nhiệt độ, trời, gió (Beaufort).', NX, y + 18);
note('Chưa có thời tiết: chờ ~3 s rồi hiện hai dòng (88), dòng 3 điền vào nếu tới lúc đang mở.', NX, y + 32);
note('Hover giữ lại; bấm ra ngoài đóng; không lấy bàn phím; cửa sổ toàn màn hình: không chào.', NX, y + 46);
note('Mưa sắp tới (trong 3 giờ): dòng 3 thành "Khoảng 17:00 có mưa, nhớ mang ô." (tuyết, bão: câu riêng).', NX, y + 68);
y += h + 20;
hello(16, y, 'wave', ['Còn thức à, Ethan? Đừng thức khuya quá nhé.', 'Bây giờ là 01:24, thứ Ba, 24 tháng 11 năm 2026.']);
note('Không có thời tiết: hai dòng, 88. Từ 01:00 tới bình minh: "Còn thức à…".', NX, y + 20);
note('Thứ Hai sáng: "Tuần mới rồi, Ethan." · Thứ Bảy, Chủ nhật sáng: "Thứ Bảy vui vẻ" / "Chủ nhật thư thả" ·', NX, y + 34);
note('chiều tối cuối tuần: "Cuối tuần vui vẻ" · còn lại theo buổi: sáng, trưa, chiều, tối, khuya.', NX, y + 48);

// --- 2. Welcome back ------------------------------------------------------------------------------------
y += 88 + 56;
title('2 · Đăng nhập lại (cùng lần bật máy): minimal 4 s, hoặc compact khi có ghi chú', 16, y - 26);
minimal(16, y + 12, 'wave', 'Chào mừng trở lại, Ethan.');
compact(NX - 180, y, 'wave', 'Chào mừng trở lại, Ethan.', 'Khoảng 17:00 có mưa, nhớ mang ô.');
note('Khoá máy, ngủ ngắn, tắt rồi bật Buoy: không chào gì.', 16, y + 66);

// --- 3. Leaving ---------------------------------------------------------------------------------------------
y += 56 + 70;
title('3 · Tắt máy, khởi động lại, đăng xuất (hộp thoại của GNOME): tới khi phiên kết thúc (~1.5 s)', 16, y - 26);
let x = 16;
[['busy', 'Đang cập nhật. Quay lại ngay.'], ['wave', 'Quay lại ngay.'], ['wave', 'Hẹn gặp lại, Ethan.']].forEach(([p, t]) => {
    x += minimal(x, y, p, t) + 14;
});
x = 16;
[['done', 'Cuối tuần vui vẻ, Ethan.'], ['sleep', 'Chúc ngủ ngon, Ethan.'], ['wave', 'Hẹn sớm gặp lại, Ethan.']].forEach(([p, t]) => {
    x += minimal(x, y + 44, p, t) + 14;
});
compact(NX + 40, y + 10, 'sleep', 'Chúc ngủ ngon, Ethan.', 'Ngày dài rồi. Nghỉ ngơi nhé.');
note('Cập nhật rồi khởi động lại (Bu bận) · khởi động lại · đăng xuất · tắt máy chiều tối thứ Sáu · tắt máy buổi tối, khuya · còn lại.', 16, y + 86);
note('Ghi chú (compact): mưa sắp tới; hoặc đã thức hơn 10 giờ. Nút nguồn không qua hộp thoại, systemctl: không nói gì.', 16, y + 100);

// --- 4. Special days -----------------------------------------------------------------------------------------
y += 100 + 54;
title('4 · Ngày đặc biệt: sinh nhật, lễ (Tết, Trung thu, Giáng sinh…) chiếm dòng 1; ngày kỷ niệm thêm vào dòng 2', 16, y - 26);
h = hello(16, y, 'party', ['Chúc mừng năm mới, Ethan!', 'Bây giờ là 08:10, thứ Tư, 17 tháng 2 năm 2027.'],
    {weather: {icon: 'weather-clear', line: 'TP. Hồ Chí Minh: 31 °C, trời quang, gió nhẹ.'}});
hello(16, y + h + 14, 'wave', ['Chào buổi sáng, Ethan.', 'Bây giờ là 07:42, thứ Sáu, 20 tháng 11 năm 2026. Hôm nay là Ngày Nhà giáo.']);
note('Bu "party" một lần rồi "done". Vùng theo múi giờ (Asia/Ho_Chi_Minh → Việt Nam), không theo ngôn ngữ.', NX, y + 4);
note('Lịch âm (Tết, Rằm tháng Giêng, Giỗ Tổ, Phật đản, Vu Lan, Trung thu, ông Công ông Táo) là bảng 2026–2099', NX, y + 18);
note('sinh sẵn bằng scripts/lunar.js (thuật toán Hồ Ngọc Đức, UTC+7); không tính lúc chạy.', NX, y + 32);
note('Sinh nhật (prefs, tháng-ngày) thắng lễ; lễ thắng ngày kỷ niệm. Đủ danh sách: GREETING.md §7.', NX, y + 46);
note('prefs: kiểu lời chào (expanded / minimal / tắt), lời chào khi tắt máy, tên, sinh nhật, ngày lễ (auto / global / tắt).', NX, y + 60);

// --- 5. parts --------------------------------------------------------------------------------------------------
y += h + 88 + 50;
title('5 · Ba phần (chốt, Ethan, 2026-11-25)', 16, y - 26);
note('Phần 1: bốn thời điểm (bật máy, thức dậy, đăng nhập lại, tắt máy) với lời chào theo giờ / thứ, cỡ, Bu; prefs (kiểu, lời chào khi tắt, tên).', 16, y);
note('Phần 2: dòng thời tiết và báo mưa — chuyển phần đọc thời tiết của GNOME vào kit để module greeting dùng chung (module không import module).', 16, y + 14);
note('Phần 3: ngày đặc biệt — holidays.js, bảng âm lịch 2026–2099 (scripts/lunar.js), Phục sinh, Ngày của Mẹ / Cha, sinh nhật; prefs sinh nhật, ngày lễ.', 16, y + 28);
note('Chữ thật trong code là tiếng Anh như GREETING.md; tiếng Việt khi có gettext (M5).', 16, y + 42);
surf.writeToPNG(out);
