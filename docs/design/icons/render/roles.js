// Buoy's symbolic icons by role (design/icons "Icon symbolic", 2026-11-12, Ethan): the icon,
// its file (the theme's name for it; * where the theme has none) and its drawing, Gravity UI's
// or Buoy's own; then Buoy's own drawings at real 1× pixels magnified 4. The drawings and
// names come from symbolic-map.js, the table scripts/symbolic-icons.js ships.
// gjs -m roles.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Rsvg from 'gi://Rsvg?version=2.0';
import GLib from 'gi://GLib';
import cairo from 'cairo';
import {SCALE as SC, C} from '../../render/lib.js';
import {SYMBOLIC, sourceFile} from './symbolic-map.js';

const out = ARGV[0];
const HERE = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const OURS = new Set(['notifications-unread', 'task-todo', 'caps-lock', 'num-lock', 'fn-lock']);

// [role, file name]; ['#', title] starts a group
const ROWS = [
    ['#', 'Home và thanh tab'],
    ['Home', 'go-home'], ['Tab chung', 'view-app-grid'], ['Lưới app trong pill', 'view-grid'],
    ['Cài đặt', 'emblem-system'], ['Thêm (tab ⋯)', 'view-more'], ['Đóng', 'window-close'], ['Xong', 'object-select'],
    ['#', 'Thông báo'],
    ['Thông báo', 'preferences-system-notifications'], ['Có tin chưa đọc', 'notifications-unread'],
    ['Quay lại', 'go-previous'], ['Không làm phiền: bật', 'weather-clear-night'], ['Không làm phiền: tắt', 'notifications-disabled'],
    ['#', 'Media'],
    ['Media', 'audio-x-generic'], ['Lùi', 'media-skip-backward'], ['Phát', 'media-playback-start'],
    ['Dừng', 'media-playback-pause'], ['Tiến', 'media-skip-forward'], ['Dừng hẳn', 'media-playback-stop'],
    ['Trộn bài', 'media-playlist-shuffle'], ['Lặp', 'media-playlist-repeat'], ['Lặp một bài', 'media-playlist-repeat-song'],
    ['Mở app', 'external-link'],
    ['#', 'Lịch, giờ, thiết bị'],
    ['Lịch', 'x-office-calendar'], ['Tháng sau', 'go-next'], ['Giờ', 'preferences-system-time'], ['Hẹn giờ', 'alarm'],
    ['Điện thoại', 'phone'], ['Tab Thiết bị', 'computer'], ['Pin', 'battery-good'], ['Pin đầy', 'battery-full'], ['Pin yếu', 'battery-low'],
    ['Pin đang sạc', 'battery-good-charging'],
    ['#', 'Tải về, chép, nhập'],
    ['Tải về', 'folder-download'], ['Mở thư mục', 'folder-open'], ['Mở tệp', 'document-open'], ['Tệp chữ', 'text-x-generic'],
    ['Đã chép', 'edit-copy'], ['Mật khẩu', 'dialog-password'], ['Ảnh', 'image-x-generic'], ['Clipboard', 'edit-paste'],
    ['Bàn phím', 'input-keyboard'], ['Thư (mẫu)', 'mail-unread'], ['Thời tiết (dự phòng)', 'weather-overcast'],
    ['#', 'Claude Code, màn hình'],
    ['Việc chờ', 'task-todo'], ['Gửi', 'mail-send'], ['Quay màn hình', 'media-record'], ['Chia sẻ màn hình', 'screen-shared'],
    ['#', 'HUD / OSD'],
    ['Tắt tiếng, mức 0', 'audio-volume-muted'], ['Âm lượng ≤ 33 %', 'audio-volume-low'], ['Âm lượng > 33 % ¹', 'audio-volume-high'],
    ['Mic tắt tiếng, mức 0', 'microphone-sensitivity-muted'], ['Mic ²', 'microphone-sensitivity-high'],
    ['Độ sáng màn hình', 'display-brightness'], ['Đèn bàn phím', 'keyboard-brightness'],
    ['Touchpad bật', 'input-touchpad'], ['Touchpad tắt', 'touchpad-disabled'],
    ['Caps Lock', 'caps-lock'], ['Num Lock', 'num-lock'], ['Fn Lock', 'fn-lock'],
    ['Khoá xoay', 'rotation-locked'], ['Mở khoá xoay', 'rotation-allowed'], ['Đẩy đĩa', 'media-eject'],
    ['Không có gì phát', 'action-unavailable'], ['Bluetooth bật', 'bluetooth-active'], ['Bluetooth tắt', 'bluetooth-disabled'],
    ['Máy bay bật', 'airplane-mode'], ['Máy bay tắt', 'airplane-mode-disabled'],
    ['Riêng tư bật', 'screen-privacy'], ['Riêng tư tắt', 'screen-privacy-disabled'], ['Bảng vẽ', 'input-tablet'],
];
const DRAWN = [...new Set(Object.values(SYMBOLIC).filter(s => s.startsWith('own:')))];

const W = 760, RH = 19, TOP = 40, HALF = Math.ceil(ROWS.length / 2);
const ownRows = Math.ceil(DRAWN.length / 9);
const H = TOP + HALF * RH + 40 + ownRows * 84 + 64;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC);
const cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 8, wt = 400, a = 1, rgb = C.WHITE} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1); PangoCairo.update_layout(cr, L);
    cr.setSourceRGBA(...rgb, a); cr.moveTo(x, y); PangoCairo.show_layout(cr, L);
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const panel = (x, y, w, h) => { cr.newPath(); rr(x + .5, y + .5, w - 1, h - 1, 20); cr.setSourceRGB(0, 0, 0); cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, C.BORDER); cr.setLineWidth(1); cr.stroke(); };
// an SVG as a mask in white (vector, at 3×)
function draw(file, x, y, s = 16) {
    const m = new cairo.ImageSurface(cairo.Format.ARGB32, s * SC, s * SC);
    const v = new Rsvg.Rectangle(); v.x = 0; v.y = 0; v.width = s * SC; v.height = s * SC;
    Rsvg.Handle.new_from_file(file).render_document(new cairo.Context(m), v);
    cr.save(); cr.newPath(); cr.scale(1 / SC, 1 / SC); cr.setSourceRGB(1, 1, 1); cr.maskSurface(m, x * SC, y * SC); cr.restore();
}
// at 16 real pixels, magnified 4 with nearest pixels
function pixels(file, x, y) {
    const m = new cairo.ImageSurface(cairo.Format.ARGB32, 16, 16);
    const v = new Rsvg.Rectangle(); v.x = 0; v.y = 0; v.width = 16; v.height = 16;
    Rsvg.Handle.new_from_file(file).render_document(new cairo.Context(m), v);
    cr.save(); cr.translate(x, y); cr.scale(4, 4);
    cr.setSourceRGBA(1, 1, 1, .06); cr.rectangle(0, 0, 16, 16); cr.fill();
    const p = new cairo.SurfacePattern(m); p.setFilter(cairo.Filter.NEAREST);
    cr.setSourceRGB(1, 1, 1); cr.mask(p); cr.restore();
}

text('Icon symbolic: tên file theo Yaru/Adwaita, hình của Gravity UI hoặc Buoy tự vẽ', 16, 10, {sz: 10, wt: 700});
panel(16, TOP - 8, W - 32, HALF * RH + 30);
for (const col of [0, 1]) {
    const x0 = 30 + col * 362;
    text('Vai trò', x0, TOP, {sz: 6, a: .5}); text('Icon', x0 + 110, TOP, {sz: 6, a: .5});
    text('File  <tên>-symbolic.svg', x0 + 136, TOP, {sz: 6, a: .5}); text('Hình từ', x0 + 262, TOP, {sz: 6, a: .5});
    ROWS.slice(col * HALF, col * HALF + HALF).forEach(([role, file], i) => {
        const y = TOP + 14 + i * RH;
        if (role === '#') {
            text(file, x0, y + 3, {sz: 7, wt: 700, a: .9, rgb: C.ACCENT.map(v => Math.min(1, v + .3))});
            return;
        }
        const src = SYMBOLIC[file];
        if (!src)
            throw new Error(`${file}: not in symbolic-map.js`);
        text(role, x0, y + 2, {sz: 7.2, a: .85});
        draw(`${HERE}/${sourceFile(src)}`, x0 + 112, y);
        text(OURS.has(file) ? `${file} *` : file, x0 + 136, y + 3, {sz: 6.2, a: .75});
        const own = src.startsWith('own:');
        text(own ? 'tự vẽ' : src, x0 + 262, y + 3, {sz: 5.4, a: own ? .95 : .45, rgb: own ? C.AMBER : C.WHITE});
    });
}
const by = TOP + HALF * RH + 40;
text('Buoy tự vẽ, ở 1× (phóng 4)', 16, by, {sz: 10, wt: 700});
DRAWN.forEach((s, i) => {
    const x = 16 + (i % 9) * 82, y = by + 20 + Math.floor(i / 9) * 84;
    pixels(`${HERE}/${sourceFile(s)}`, x, y);
    text(s.slice(4), x, y + 66, {sz: 6, a: .6});
});
const ny = by + 20 + ownRows * 84;
[' * Theme không có tên cho ý này: tên của Buoy, không có icon theme để dự phòng.',
 ' ¹ cũng audio-volume-medium, -overamplified (cùng hình). ² cũng microphone-sensitivity-low, -medium, audio-input-microphone.',
].forEach((l, i) => text(l, 16, ny + i * 12, {sz: 6.5, a: .7}));
surf.writeToPNG(out);
