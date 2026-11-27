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
import {SCALE as SC, C, t} from '../../render/lib.js';
import {SYMBOLIC, sourceFile} from './symbolic-map.js';

const out = ARGV[0];
const HERE = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const OURS = new Set(['notifications-unread', 'task-todo', 'caps-lock', 'num-lock', 'fn-lock']);

// [role, file name]; ['#', title] starts a group
const ROWS = [
    ['#', t('Home và thanh tab', 'Home and the tab bar')],
    ['Home', 'go-home'], [t('Tab chung', 'Generic tab'), 'view-app-grid'], [t('Lưới app trong pill', 'App grid in the pill'), 'view-grid'],
    [t('Cài đặt', 'Settings'), 'emblem-system'], [t('Thêm (tab ⋯)', 'More (⋯ tab)'), 'view-more'], [t('Đóng', 'Close'), 'window-close'], [t('Xong', 'Done'), 'object-select'],
    ['#', t('Thông báo', 'Notifications')],
    [t('Thông báo', 'Notifications'), 'preferences-system-notifications'], [t('Có tin chưa đọc', 'Unread'), 'notifications-unread'],
    [t('Quay lại', 'Back'), 'go-previous'], [t('Không làm phiền: bật', 'Do Not Disturb: on'), 'weather-clear-night'], [t('Không làm phiền: tắt', 'Do Not Disturb: off'), 'notifications-disabled'],
    ['#', 'Media'],
    ['Media', 'audio-x-generic'], [t('Lùi', 'Previous'), 'media-skip-backward'], [t('Phát', 'Play'), 'media-playback-start'],
    [t('Dừng', 'Pause'), 'media-playback-pause'], [t('Tiến', 'Next'), 'media-skip-forward'], [t('Dừng hẳn', 'Stop'), 'media-playback-stop'],
    [t('Trộn bài', 'Shuffle'), 'media-playlist-shuffle'], [t('Lặp', 'Repeat'), 'media-playlist-repeat'], [t('Lặp một bài', 'Repeat one'), 'media-playlist-repeat-song'],
    [t('Mở app', 'Open app'), 'external-link'],
    ['#', t('Lịch, giờ, thiết bị', 'Calendar, time, devices')],
    [t('Lịch', 'Calendar'), 'x-office-calendar'], [t('Tháng sau', 'Next month'), 'go-next'], [t('Giờ', 'Time'), 'preferences-system-time'], [t('Hẹn giờ', 'Timer'), 'alarm'],
    [t('Điện thoại', 'Phone'), 'phone'], [t('Tab Thiết bị', 'Devices tab'), 'computer'], [t('Pin', 'Battery'), 'battery-good'], [t('Pin đầy', 'Battery full'), 'battery-full'], [t('Pin yếu', 'Battery low'), 'battery-low'],
    [t('Pin đang sạc', 'Battery charging'), 'battery-good-charging'], [t('Tiết kiệm pin', 'Power saver'), 'power-profile-power-saver'],
    [t('Cân bằng', 'Balanced'), 'power-profile-balanced'], [t('Hiệu năng', 'Performance'), 'power-profile-performance'],
    [t('Màn hình cắm vào', 'Display plugged in'), 'video-display'], [t('Nối màn', 'Join displays'), 'shell-display-extend-all'], [t('Nhân bản màn', 'Mirror displays'), 'shell-display-mirror'],
    [t('Chỉ màn ngoài', 'External display only'), 'shell-display-external-only'], [t('Tai nghe', 'Headphones'), 'audio-headphones'], [t('Loa', 'Speakers'), 'audio-speakers'],
    [t('Chuột', 'Mouse'), 'input-mouse'], [t('Tay cầm chơi game', 'Game controller'), 'input-gaming'], [t('Ổ cắm vào', 'Drive plugged in'), 'drive-removable-media'], ['Webcam', 'camera-web'], [t('Tìm điện thoại', 'Find phone'), 'find-location'], [t('Chuyến xe', 'Ride'), 'route-car'], [t('Cuộc gọi', 'Call'), 'call-start'], [t('Gọi nhỡ', 'Missed call'), 'call-missed'], [t('Trả lời', 'Reply'), 'mail-reply-sender'], [t('Chuyển tới cửa sổ', 'Go to window'), 'go-jump'], [t('Tham gia họp', 'Join meeting'), 'camera-video'], [t('Địa điểm', 'Location'), 'mark-location'], [t('Khách', 'Guests'), 'system-users'], [t('Mô tả', 'Description'), 'format-justify-left'], [t('Nhắc', 'Reminder'), 'appointment-soon'],
    ['#', t('Tải về, chép, nhập', 'Downloads, copy, input')],
    [t('Tải về', 'Download'), 'folder-download'], [t('Mở thư mục', 'Open folder'), 'folder-open'], [t('Mở tệp', 'Open file'), 'document-open'], [t('Tệp chữ', 'Text file'), 'text-x-generic'],
    [t('Đã chép', 'Copied'), 'edit-copy'], [t('Mật khẩu', 'Password'), 'dialog-password'], [t('Ảnh', 'Image'), 'image-x-generic'], ['Clipboard', 'edit-paste'],
    [t('Bàn phím', 'Keyboard'), 'input-keyboard'], [t('Thư (mẫu)', 'Mail (sample)'), 'mail-unread'], [t('Thời tiết (dự phòng)', 'Weather (fallback)'), 'weather-overcast'],
    ['#', t('Claude Code, màn hình', 'Claude Code, screen')],
    [t('Việc chờ', 'Pending task'), 'task-todo'], [t('Gửi', 'Send'), 'mail-send'], [t('Quay màn hình', 'Screen recording'), 'media-record'], [t('Chia sẻ màn hình', 'Screen sharing'), 'screen-shared'],
    ['#', 'HUD / OSD'],
    [t('Tắt tiếng, mức 0', 'Muted, level 0'), 'audio-volume-muted'], [t('Âm lượng ≤ 33 %', 'Volume ≤ 33 %'), 'audio-volume-low'], [t('Âm lượng > 33 % ¹', 'Volume > 33 % ¹'), 'audio-volume-high'],
    [t('Mic tắt tiếng, mức 0', 'Mic muted, level 0'), 'microphone-sensitivity-muted'], ['Mic ²', 'microphone-sensitivity-high'],
    [t('Độ sáng màn hình', 'Screen brightness'), 'display-brightness'], [t('Đèn bàn phím', 'Keyboard backlight'), 'keyboard-brightness'],
    [t('Touchpad bật', 'Touchpad on'), 'input-touchpad'], [t('Touchpad tắt', 'Touchpad off'), 'touchpad-disabled'],
    ['Caps Lock', 'caps-lock'], ['Num Lock', 'num-lock'], ['Fn Lock', 'fn-lock'],
    [t('Khoá xoay', 'Rotation locked'), 'rotation-locked'], [t('Mở khoá xoay', 'Rotation unlocked'), 'rotation-allowed'], [t('Đẩy đĩa', 'Eject'), 'media-eject'],
    [t('Không có gì phát', 'Nothing playing'), 'action-unavailable'], [t('Bluetooth bật', 'Bluetooth on'), 'bluetooth-active'], [t('Bluetooth tắt', 'Bluetooth off'), 'bluetooth-disabled'],
    [t('Máy bay bật', 'Airplane mode on'), 'airplane-mode'], [t('Máy bay tắt', 'Airplane mode off'), 'airplane-mode-disabled'],
    [t('Riêng tư bật', 'Privacy screen on'), 'screen-privacy'], [t('Riêng tư tắt', 'Privacy screen off'), 'screen-privacy-disabled'], [t('Bảng vẽ', 'Drawing tablet'), 'input-tablet'],
];
const DRAWN = [...new Set(Object.values(SYMBOLIC).filter(s => s.startsWith('own:')))];

// two columns, a group title never last in the left one
const MID = Math.ceil(ROWS.length / 2), SPLIT = ROWS[MID - 1][0] === '#' ? MID - 1 : MID;
const COLS = [ROWS.slice(0, SPLIT), ROWS.slice(SPLIT)];
const W = 760, RH = 19, TOP = 40, HALF = Math.max(...COLS.map(c => c.length));
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

text(t('Icon symbolic: tên file theo Yaru/Adwaita, hình của Gravity UI hoặc Buoy tự vẽ', "Symbolic icons: file names after Yaru/Adwaita, drawings from Gravity UI or Buoy's own"), 16, 10, {sz: 10, wt: 700});
panel(16, TOP - 8, W - 32, HALF * RH + 30);
for (const col of [0, 1]) {
    const x0 = 30 + col * 362;
    text(t('Vai trò', 'Role'), x0, TOP, {sz: 6, a: .5}); text('Icon', x0 + 110, TOP, {sz: 6, a: .5});
    text(t('File  <tên>-symbolic.svg', 'File  <name>-symbolic.svg'), x0 + 136, TOP, {sz: 6, a: .5}); text(t('Hình từ', 'Drawing from'), x0 + 262, TOP, {sz: 6, a: .5});
    COLS[col].forEach(([role, file], i) => {
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
        text(own ? t('tự vẽ', 'own drawing') : src, x0 + 262, y + 3, {sz: 5.4, a: own ? .95 : .45, rgb: own ? C.AMBER : C.WHITE});
    });
}
const by = TOP + HALF * RH + 40;
text(t('Buoy tự vẽ, ở 1× (phóng 4)', "Buoy's own drawings, at 1× (magnified 4)"), 16, by, {sz: 10, wt: 700});
DRAWN.forEach((s, i) => {
    const x = 16 + (i % 9) * 82, y = by + 20 + Math.floor(i / 9) * 84;
    pixels(`${HERE}/${sourceFile(s)}`, x, y);
    text(s.slice(4), x, y + 66, {sz: 6, a: .6});
});
const ny = by + 20 + ownRows * 84;
t([' * Theme không có tên cho ý này: tên của Buoy, không có icon theme để dự phòng.',
    ' ¹ cũng audio-volume-medium, -overamplified (cùng hình). ² cũng microphone-sensitivity-low, -medium, audio-input-microphone.',
], [" * The theme has no name for this: Buoy's own name, no theme icon to fall back on.",
    ' ¹ also audio-volume-medium, -overamplified (same drawing). ² also microphone-sensitivity-low, -medium, audio-input-microphone.',
]).forEach((l, i) => text(l, 16, ny + i * 12, {sz: 6.5, a: .7}));
surf.writeToPNG(out);
