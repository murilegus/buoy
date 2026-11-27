// In a call (design/compact "Đang gọi", 2026-11-27, Ethan): camera and microphone both on → the pill says
// so, Do Not Disturb while it lasts; Home's tile of what uses the microphone and the camera. gjs -m call.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, KW = 404;
const W = 1240, H = 650;
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

const GREEN = [0x30 / 255, 0xd1 / 255, 0x58 / 255];
// the pill with the privacy dot at its right end (design/pill): green for the camera
function callPill(x, y, t, clock) {
    // room for the dot after the clock: 8 + its 8 px
    const w = pill(x, y, 'g:video', t, `${clock}\u2007\u2007`);
    fill(1, x + w - 12 - 8, y + 12, 8, 8, 4, GREEN);
    return w;
}
const tile = (x, ty, w, ic, val, cap, det = []) => {
    fill(C.FILL1, x, ty, w, 100, 16);
    ic.forEach((n, i) => gicon(cr, n.replace(/^g:/, ''), x + 14 + i * 22, ty + 14, 16, [1, 1, 1], 1));
    text(val, x + 12, ty + 40, {sz: 16.5, wt: 600});
    text(cap, x + 12, ty + 68, {sz: SUB, a: C.FG_MUTED, max: w - 24});
    det.forEach((d, i) => text(d, x + w - 14 - text(d, 0, 0, {sz: SUB, measure: true}).width, ty + 44 + i * 18, {sz: SUB, a: C.FG_SUBTLE}));
};

// --- 1. in a call -----------------------------------------------------------------------------------
let y = 40;
title('1 · Đang gọi: camera và micro cùng bật quá 10 s', 16, y - 26);
card(16, y, 'g:video', 'Đang gọi · Firefox', '12:34 · Không làm phiền đang bật', [{label: 'Tắt micro', main: true}, {label: 'Cho thông báo'}]);
callPill(NX, y + 8, 'Đang gọi', '12:34');
note('Pill: icon camera, "Đang gọi", đồng hồ từ lúc bắt đầu; chấm xanh của camera ở đầu phải như bây giờ.', NX, y + 50);
note('Tên app: app đang ghi âm (micro của GNOME biết, ví dụ Firefox, Zoom, Slack); không biết: chỉ "Đang gọi".', NX, y + 64);
note('Card (hover): Tắt micro / Bật micro (kem, như nút micro của Quick Settings); "Cho thông báo" tắt Không làm phiền', NX, y + 86);
note('cho cuộc gọi này. Không có nút kết thúc cuộc gọi: Buoy không điều khiển được app gọi.', NX, y + 100);

// --- 2. Do Not Disturb --------------------------------------------------------------------------------
y += 104 + 60;
title('2 · Tự bật Không làm phiền', 16, y - 26);
note('Bắt đầu gọi: bật Không làm phiền của GNOME (cùng nút trong lịch / Quick Settings) nếu đang tắt. Hết gọi (camera hay', 16, y);
note('micro tắt quá 10 s): tắt lại — chỉ khi chính Buoy bật nó và anh không đổi gì trong lúc gọi. Đang bật sẵn: không đụng tới.', 16, y + 14);
note('Thông báo trong lúc gọi vẫn vào danh sách, xong cuộc gọi đèn amber báo số bị nhỡ (như Không làm phiền bây giờ).', 16, y + 28);
note('prefs: "Không làm phiền khi đang gọi" (Modules → Privacy & screen), bật mặc định.', 16, y + 42);
note('Chỉ micro (ghi âm, ghi chú giọng nói) hay chỉ camera: không phải cuộc gọi, chỉ có chấm như bây giờ.', 16, y + 56);

// --- 3. Home's tile --------------------------------------------------------------------------------------
y += 112;
title('3 · Ô "Đang dùng" ở Home (chỉ khi micro, camera hay màn hình đang được dùng)', 16, y - 26);
tile(16, y, 128, ['g:microphone', 'g:video'], 'Firefox', 'Micro, camera');
tile(16 + 136, y, 220, ['g:microphone'], 'Zoom, Slack', 'Micro', ['2 app']);
tile(16 + 136 + 228, y, 128, ['g:display-pulse'], 'Chia sẻ', 'Màn hình');
note('Ô đứng đầu phần nhìn nhanh, trước thời tiết, chỉ khi có gì đang dùng (không có: không ô).', NX + 90, y + 6);
note('Icon: cái đang dùng (micro, camera, màn hình). Số lớn: app đang ghi âm (GNOME biết qua micro);', NX + 90, y + 20);
note('camera và màn hình GNOME không nói app nào — chỉ "Camera", "Chia sẻ" / "Quay".', NX + 90, y + 34);
note('Bấm ô: Cài đặt → Quyền riêng tư (micro / camera), hay dừng chia sẻ như nút Stop hiện có.', NX + 90, y + 48);

// --- 4. not here ----------------------------------------------------------------------------------------------
y += 140;
title('4 · Ngoài mục này', 16, y - 26);
note('Buoy không biết app nào dùng camera hay chia sẻ màn hình (Shell.CameraMonitor chỉ đếm camera; handle của Mutter không có tên app).', 16, y);
note('Không tắt camera từ Buoy (GNOME không có công tắc đó).', 16, y + 14);
surf.writeToPNG(out);
