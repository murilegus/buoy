// Headphones / display plugged (decided 2026-11-15, Ethan; FEATURES M4): the flashes at the pill's real
// width, and the display's compact on hover with its three buttons (as the power-mode compact).
//   flash    the flashes: display in / out, headphones (Bluetooth, jack), back to the speakers
//   compact  the compacts that open on their own (alerts): the display's, Join / Mirror / External
//            only; headphones plugged in the sound does not use yet, Use
// gjs -m plugged.js out.png <mode>
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon, t, LANG} from '../../render/lib.js';

const [out, MODE = 'flash'] = ARGV;
const W1 = C.WHITE, SUB = 9.35;
const [W, H] = {flash: [LANG === 'en' ? 1400 : 1270, 164], compact: [760, 330]}[MODE]; // en: the longer flashes need the room
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, rgb = W1, a = 1, centre = false, measure = false} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1); const e = L.get_pixel_extents()[1];
    if (measure)
        return e;
    cr.setSourceRGBA(...rgb, a); cr.moveTo(centre ? x - e.width / 2 : x, y); PangoCairo.show_layout(cr, L);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (rgba, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(...rgba); cr.fill(); };
const icon = (n, x, y, s = 16, rgb = W1, a = 1) => gicon(cr, n, x, y, s, rgb, a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});

// a pill at its real width (design/tokens): 8 + leading 24 + 6 + text + 6 + trailing + 8, at least 131;
// a volume trails as the HUD's level (2026-11-17): a bar 40, 8, its number (at least 34)
function pill(x, y, lead, t, trail = null) {
    const te = text(t, 0, 0, {wt: 600, measure: true}), pe = trail ? text(trail, 0, 0, {wt: 600, measure: true}) : null;
    const tw = pe ? 40 + 8 + Math.max(34, pe.width) : 0;
    const w = Math.max(131, 8 + 24 + 6 + te.width + (pe ? 6 + tw : 0) + 8);
    fill([0, 0, 0, 1], x, y, w, 32, 16);
    icon(lead, x + 12, y + 8, 16);
    text(t, x + 38, y + 16 - te.height / 2 - 1, {wt: 600});
    if (pe) {
        const bx = x + w - 8 - tw, v = parseInt(trail) / 100;
        fill([1, 1, 1, .25], bx, y + 14, 40, 4, 2); fill([1, 1, 1, 1], bx, y + 14, 40 * v, 4, 2);
        text(trail, x + w - 8 - pe.width, y + 16 - pe.height / 2 - 1, {wt: 600});
    }
    return w;
}

// the display modes, as GNOME's Super+P switcher (switchMonitor.js) offers them on a laptop
const MODES = [['layout-split-columns', t('Nối', 'Join')], ['copy', t('Nhân bản', 'Mirror')], ['display', t('Chỉ màn ngoài', 'External Only')]];

if (MODE === 'flash') {
    let x = 16;
    const row = (items, y) => {
        x = 16;
        items.forEach(([ic, t, p]) => {
            const w = pill(x, y, ic, t, p);
            text(`${Math.round(w)}`, x + w / 2, y + 36, {sz: 8, a: .55, centre: true});
            x += w + 16;
        });
    };
    row([['display', 'ViewSonic 27″'], ['display', t('Đã rút ViewSonic 27″', 'Unplugged ViewSonic 27″')]], 16);
    note(t('màn hình: chờ lần chạm chuột/phím đầu tiên, rồi 3 s (tối đa 30 s); lúc bật Buoy không flash', 'display: waits for the first mouse/key touch, then 3 s (at most 30 s); no flash when Buoy starts'), x + 8, 24);
    row([['headphones', 'Logi USB Headset', '64%'], ['headphones', t('Tai nghe', 'Headphones'), '64%'], ['headphones', t('Đã rút tai nghe', 'Unplugged Headphones'), '62%'],
        ['headphones', t('Đã ngắt Logi USB Headset', 'Disconnected Logi USB Headset'), '62%'], ['volume', t('Loa', 'Speakers'), '62%']], 76);
    note(t('tai nghe: 3 s khi cắm (USB: tên thiết bị; jack: "Tai nghe") và khi rút, trailing là âm lượng như HUD, thanh rồi số (rút: của loa); thay OSD âm lượng GNOME; tai nghe Bluetooth: flash Bluetooth (pin)', 'headphones: 3 s when plugged (USB: device name; jack: "Headphones") and unplugged, trailing is the volume as the HUD, bar then number (unplugged: the speakers\'); replaces GNOME\'s volume OSD; Bluetooth headphones: the Bluetooth flash (battery)'), 16, 128);
    note(t('"Loa": âm thanh chuyển tay sang loa khi tai nghe vẫn cắm', '"Speakers": sound moved by hand to the speakers while the headphones are still plugged'), 16, 142);
} else if (MODE === 'compact') {
    const CX = 16, cy = 16, kw = 404;
    fill([0, 0, 0, 1], CX, cy, kw, 104, 28);
    fill([1, 1, 1, C.FILL2], CX + 14, cy + 8, 40, 40, 20); icon('display', CX + 26, cy + 20, 16);
    text('ViewSonic 27″', CX + 66, cy + 9, {wt: 600}); text(t('2560 × 1440 · đang nối', '2560 × 1440 · joined'), CX + 66, cy + 29, {sz: SUB, a: C.FG_MUTED});
    // each button as wide as its words, the rest shared (design/compact "Đổi chế độ")
    const words = MODES.map(([, t]) => text(t, 0, 0, {sz: SUB, wt: 600, measure: true}).width + 36 + 14);
    const spare = (kw - 24 - 16 - words.reduce((s, v) => s + v, 0)) / 3;
    let bx = CX + 12;
    MODES.forEach(([ic, t], i) => {
        const on = i === 0, bw = words[i] + spare;
        fill([1, 1, 1, on ? C.FILL3 : C.FILL2], bx, cy + 60, bw, 32, 16);
        icon(ic, bx + 14, cy + 68, 16, W1, on ? 1 : C.FG_MUTED);
        text(t, bx + 36, cy + 68, {sz: SUB, wt: on ? 600 : 400, a: on ? 1 : C.FG_MUTED});
        bx += bw + 8;
    });
    note(t('cắm màn → compact này tự mở (alert, giữ 5 s lúc bạn có mặt), như compact chế độ năng lượng (104)', 'display plugged → this compact opens on its own (alert, held 5 s while you are there), as the power-mode compact (104)'), CX, cy + 112);
    note(t('nút là cách dùng hai màn của Super+P: đang dùng fill-3, chữ 600; bấm là đổi ngay (switch_config)', 'the buttons are Super+P\'s ways to use two displays: the current one fill-3, text 600; a click switches at once (switch_config)'), CX, cy + 126);
    note(t('dòng dưới: độ phân giải của màn, cùng cách đang dùng (Mutter không đưa tần số quét)', 'second line: the display\'s resolution, with the current way (Mutter does not give the refresh rate)'), CX, cy + 140);
    note(t('bấm vào pill hay compact: mở Cài đặt → Màn hình', 'click the pill or the compact: opens Settings → Displays'), CX, cy + 154);
    pill(CX + kw + 40, cy + 8, 'display', 'ViewSonic 27″');
    note(t('pill: tới lần chạm đầu tiên, rồi 3 s', 'pill: until the first touch, then 3 s'), CX + kw + 40, cy + 46);
    // headphones plugged in, the sound still on the speakers: Use
    const oy = cy + 180;
    fill([0, 0, 0, 1], CX, oy, kw, 104, 28);
    fill([1, 1, 1, C.FILL2], CX + 14, oy + 8, 40, 40, 20); icon('headphones', CX + 26, oy + 20, 16);
    text(t('Tai nghe', 'Headphones'), CX + 66, oy + 9, {wt: 600}); text(t('Âm thanh đang ở Loa', 'Sound on Speakers'), CX + 66, oy + 29, {sz: SUB, a: C.FG_MUTED});
    fill([1, 1, 1, C.FILL2], CX + 12, oy + 60, kw - 24, 32, 16);
    const ue = text(t('Dùng', 'Use'), 0, 0, {sz: SUB, wt: 600, measure: true});
    icon('headphones', CX + kw / 2 - (ue.width + 22) / 2, oy + 68, 16);
    text(t('Dùng', 'Use'), CX + kw / 2 - (ue.width + 22) / 2 + 22, oy + 68, {sz: SUB, wt: 600});
    note(t('tai nghe cắm mà âm thanh vẫn ra loa → compact này tự mở; Dùng: chuyển đầu ra (change_output)', 'headphones plugged but sound still on the speakers → this compact opens on its own; Use: switches the output (change_output)'), CX, oy + 112);
    pill(CX + kw + 40, oy + 8, 'headphones', t('Tai nghe đã cắm', 'Headphones plugged in'));
    note(t('pill 3 s; rút ra trước khi dùng: nó đi', 'pill 3 s; unplugged before Use: it goes'), CX + kw + 40, oy + 46);
}
surf.writeToPNG(out);
