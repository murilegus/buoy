// The network (design/compact "Mạng", 2026-11-23, Ethan; FEATURES M4 "VPN / Wi-Fi / captive portal"):
// the flashes, the sign-in pill in place of GNOME's "Sign in to Network", the icons (B). gjs -m network.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon, t} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, KW = 404;
const W = 1240, H = 730;
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

// --- 1. flashes ---------------------------------------------------------------------------------
let y = 40;
title(t('1 · Flash 3 s khi mạng đổi lúc anh đang dùng máy (Quick Feedback)', '1 · A 3 s flash when the network changes while you use the computer (Quick Feedback)'), 16, y - 26);
let x = 16;
const row = (items, yy) => {
    x = 16;
    items.forEach(([l, t, tr]) => {
        x += pill(x, yy, l, t, tr) + 14;
    });
};
row([['w:3', 'Highlands Coffee'], ['g:plug-connection', t('Có dây', 'Wired')], ['w:0', t('Mất mạng', 'Offline')],
    ['w:2', 'Highlands Coffee', t('Không có Internet', 'No Internet')]], y);
note(t('Wi-Fi nối: tên mạng (SSID), icon theo sóng. Có dây: "Có dây". Mất kết nối chính, không còn mạng nào: "Mất mạng".', 'Wi-Fi connected: the network name (SSID), icon by signal. Wired: "Wired". Main connection lost, no network left: "Offline".'), 16, y + 40);
note(t('Nối mà không ra Internet (NetworkManager: LIMITED / NONE, không phải portal): tên mạng, "Không có Internet" ở cuối.', 'Connected but no Internet (NetworkManager: LIMITED / NONE, not a portal): the network name, "No Internet" at the end.'), 16, y + 54);
y += 96;
row([['g:shield-check', t('VPN · Công ty', 'VPN · Work')], ['g:shield', t('Đã tắt VPN', 'VPN Off')], ['g:circle-exclamation', t('Không nối được Highlands Coffee', 'Couldn\'t Connect to Highlands Coffee')]], y);
note(t('VPN (cả WireGuard) bật: "VPN · <tên>"; tắt: "Đã tắt VPN". Nối thất bại: thay thông báo "Connection failed" của GNOME (status/network.js).', 'VPN (WireGuard too) on: "VPN · <name>"; off: "VPN Off". Failed to connect: in place of GNOME\'s "Connection failed" notification (status/network.js).'), 16, y + 40);
note(t('Chuyển mạng (Wi-Fi A → B): một flash, mạng mới. Đổi qua lại trong 3 s: flash sau cùng thay cái trước, không xếp hàng.', 'Switching networks (Wi-Fi A → B): one flash, the new network. Back and forth within 3 s: the last flash replaces the one before, no queue.'), 16, y + 54);

// --- 2. when not ------------------------------------------------------------------------------------
y += 112;
title(t('2 · Khi nào không flash', '2 · When there is no flash'), 16, y - 26);
note(t('Lúc bật Buoy, mở khoá, thức dậy sau ngủ (NetworkManager nối lại): 15 s đầu không flash — anh không vừa đổi gì.', 'When Buoy starts, on unlock, on waking from sleep (NetworkManager reconnects): no flash in the first 15 s — you did not just change anything.'), 16, y);
note(t('Chia sẻ / quay màn hình: không tên mạng, chỉ "Wi-Fi", "VPN".', 'Sharing / recording the screen: no network name, only "Wi-Fi", "VPN".'), 16, y + 14);
note(t('Đổi điểm phát cùng tên (roaming), mạng cũ nối lại sau chập chờn dưới 3 s: không flash.', 'Moving to an access point with the same name (roaming), the old network back after a drop under 3 s: no flash.'), 16, y + 28);

// --- 3. captive portal ---------------------------------------------------------------------------------
y += 76;
title(t('3 · Mạng cần đăng nhập (captive portal)', '3 · A network that needs sign-in (captive portal)'), 16, y - 26);
card(16, y, 'w:3', t('Đăng nhập mạng', 'Sign In to Network'), 'Highlands Coffee', [{label: t('Đăng nhập', 'Sign In'), main: true}]);
pill(NX, y + 8, 'w:3', t('Đăng nhập mạng', 'Sign In to Network'), 'Highlands Coffee');
note(t('Thay thông báo "Sign in to Network" của GNOME (CaptivePortalHandler): card đến như thông báo, rồi pill ở lại', 'In place of GNOME\'s "Sign in to Network" notification (CaptivePortalHandler): the card comes like a notification, then the pill stays'), NX, y + 50);
note(t('tới khi đăng nhập xong (NetworkManager: FULL) hay rời mạng. "Đăng nhập" (kem): trang đăng nhập của GNOME', 'until signed in (NetworkManager: FULL) or off the network. "Sign In" (cream): GNOME\'s sign-in page'), NX, y + 64);
note(t('(portal helper), như bấm thông báo. ×: ẩn pill, GNOME vẫn chờ. Xong: flash "Highlands Coffee" (đã có Internet).', '(portal helper), like clicking the notification. ×: hides the pill, GNOME still waits. Done: flash "Highlands Coffee" (Internet now).'), NX, y + 78);

// --- 4. icons --------------------------------------------------------------------------------------------
y += 104 + 60;
title(t('4 · Icon: B, Buoy tự vẽ theo kiểu Gravity — chốt (Ethan, 2026-11-23)', '4 · Icons: B, Buoy\'s own in the Gravity style — decided (Ethan, 2026-11-23)'), 16, y - 26);
const sample = (lx, ly, label, specs) => {
    text(label, lx, ly, {sz: 10, wt: 600});
    specs.forEach((sp, i) => {
        fill(1, lx + i * 44, ly + 20, 36, 36, 10, [0, 0, 0]);
        ic(sp, lx + i * 44 + 10, ly + 30, 16);
    });
};
sample(16, y, t('Wi-Fi rất mạnh, mạnh, vừa, yếu, không sóng / mất mạng; có dây, VPN bật, VPN tắt, lỗi', 'Wi-Fi excellent, good, ok, weak, no signal / offline; wired, VPN on, VPN off, error'),
    ['w:4', 'w:3', 'w:2', 'w:1', 'w:0', 'g:plug-connection', 'g:shield-check', 'g:shield', 'g:circle-exclamation']);
note(t('Wi-Fi: chấm và cung nét 1.5 đầu tròn (own/wifi-*); cung chưa sáng bỏ hẳn chứ không mờ: icon symbolic của Buoy một màu,', 'Wi-Fi: a dot and arcs, 1.5 stroke, round caps (own/wifi-*); unlit arcs are left out, not dimmed: Buoy\'s symbolic icons are one colour,'), 16, y + 70);
note(t('St tô lại mọi fill (icons.test.js). Không sóng, mất mạng: đủ ba cung và gạch chéo. Mức sóng như Shell (80, 55, 30, 5).', 'St recolours every fill (icons.test.js). No signal, offline: all three arcs and a slash. Signal levels as in Shell (80, 55, 30, 5).'), 16, y + 84);

// --- 5. not here -----------------------------------------------------------------------------------------
y += 150;
title(t('5 · Ngoài mục này', '5 · Not in this item'), 16, y - 26);
note(t('Không có hàng mạng trong tab Thiết bị, không bật/tắt Wi-Fi hay VPN từ Buoy: Quick Settings của GNOME làm việc đó.', 'No network row in the Device tab, no Wi-Fi or VPN on/off from Buoy: GNOME\'s Quick Settings does that.'), 16, y);
note(t('Đọc từ NM.Client của chính Shell (Quick Settings), chỉ nghe tín hiệu, không dò; không module mới nào chạy khi tắt.', 'Read from Shell\'s own NM.Client (Quick Settings), signals only, no polling; no new module runs when off.'), 16, y + 14);
surf.writeToPNG(out);
