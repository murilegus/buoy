// Attention on another workspace (design/compact "Cửa sổ cần chú ý", 2026-11-19, Ethan): a window that
// asks for attention (Mutter's demands-attention / urgent) as a pill that stays till you go to it.
// gjs -m attention.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon, t, LANG} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, KW = 404;
const W = 1200, H = LANG === 'en' ? 416 : 400; // en: room for 4's second note, cut off at 400
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
// a sample app's logo: a round square in its colour with a letter
const logo = (x, y, s, rgb, ch) => {
    fill(1, x, y, s, s, s * .25, rgb);
    const e = text(ch, 0, 0, {sz: s * .42, wt: 700, measure: true});
    text(ch, x + (s - e.width) / 2, y + (s - e.height) / 2 - .5, {sz: s * .42, wt: 700});
};
const BROWSER = [.95, .45, .15], CHAT = [.29, .1, .37], TERM = [.2, .2, .2];
// the workspace it is on: its number in a square outline (as the overview's workspace thumbnails)
function workspace(x, cy, n, a = 1) {
    cr.newPath(); rr(x + .75, cy - 7.25, 14.5, 14.5, 4); cr.setLineWidth(1.5); cr.setSourceRGBA(1, 1, 1, a); cr.stroke();
    const e = text(String(n), 0, 0, {sz: 8, wt: 700, measure: true});
    text(String(n), x + 8 - e.width / 2, cy - e.height / 2 - .5, {sz: 8, wt: 700, a});
    return 16;
}
function pill(x, y, lead, t, ws = null, more = null) {
    const e = text(t, 0, 0, {wt: 600, measure: true, max: 240});
    const extra = (more ? text(more, 0, 0, {wt: 600, measure: true}).width + 8 : 0) + (ws ? 16 + 6 : 0);
    const w = Math.max(131, 8 + 24 + 6 + e.width + (extra ? 12 + extra : 0) + 12);
    fill(1, x, y, w, 32, 16, [0, 0, 0]);
    lead(x + 4, y + 4);
    text(t, x + 38, y + 8, {wt: 600, max: 240});
    let tx = x + w - 12;
    if (ws) {
        tx -= 16;
        workspace(tx, y + 16, ws, C.FG_MUTED);
        tx -= 8;
    }
    if (more)
        text(more, tx, y + 8, {wt: 600, a: C.FG_MUTED, right: true});
    return w;
}
function card(x, y, logoArgs, t, sub, button) {
    cr.newPath(); rr(x, y, KW, 104, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    logo(x + 14, y + 8, 40, ...logoArgs);
    text(t, x + 66, y + 10, {wt: 600, max: KW - 120});
    text(sub, x + 66, y + 30, {sz: SUB, a: C.FG_MUTED});
    fill(C.FILL2, x + KW - 46, y + 12, 32, 32, 16); icon('xmark', x + KW - 38, y + 20, 16, C.FG_MUTED);
    fill(C.FILL2, x + 12, y + 60, KW - 24, 32, 16);
    const e = text(button, 0, 0, {sz: SUB, wt: 600, measure: true});
    icon('arrow-right', x + 12 + (KW - 24 - e.width - 22) / 2, y + 68, 16);
    text(button, x + 12 + (KW - 24 - e.width - 22) / 2 + 22, y + 68, {sz: SUB, wt: 600});
}
const PX = 16 + KW + 32;

// --- 1. it asks: a card, then the pill stays ---------------------------------------------------------
let y = 40;
title(t('1 · Cửa sổ ở workspace khác cần chú ý: card như thông báo, rồi pill ở lại', '1 · A window on another workspace needs attention: the card like a notification, then the pill stays'), 16, y - 26);
card(16, y, [BROWSER, 'F'], 'Pull request #284 — GitHub', t('Firefox · Workspace 2 · bây giờ', 'Firefox · Workspace 2 · now'), t('Chuyển tới cửa sổ', 'Go to Window'));
pill(PX, y + 8, (x, yy) => logo(x, yy, 24, BROWSER, 'F'), 'Pull request #284 — GitHub', 2);
note(t('pill: logo app, tiêu đề cửa sổ, số workspace của nó ở cuối (ô vuông như hình workspace trong overview);', 'pill: app logo, window title, its workspace number at the end (a square like a workspace in the overview);'), PX, y + 50);
note(t('ở lại tới khi cửa sổ được focus, thôi đòi chú ý hay đóng (như GNOME gỡ thông báo của nó), không tắt sau 8 s.', 'stays until the window gets focus, stops asking for attention or closes (as GNOME takes its notification back), not gone after 8 s.'), PX, y + 64);
note(t('Bấm pill hay "Chuyển tới cửa sổ": sang workspace đó và focus (Main.activateWindow).', 'Click the pill or "Go to Window": moves to that workspace and focuses it (Main.activateWindow).'), PX, y + 86);
note(t('Thay thông báo "“…” is ready" của GNOME (ui/windowAttentionHandler.js): không hiện thêm cái đó.', 'In place of GNOME\'s "“…” is ready" notification (ui/windowAttentionHandler.js): that one does not show as well.'), PX, y + 100);

// --- 2. on this workspace ---------------------------------------------------------------------------------
y += 104 + 64;
title(t('2 · Cùng workspace, chỉ không có focus', '2 · Same workspace, just no focus'), 16, y - 26);
pill(16, y, (x, yy) => logo(x, yy, 24, CHAT, 'S'), 'Slack — Quỳnh Trâm', null);
note(t('Cùng workspace: không có ô số; pill và card như trên ("Slack · bây giờ").', 'Same workspace: no number square; pill and card as above ("Slack · now").'), 16, y + 44);
note(t('Vẫn báo (Ethan, 2026-11-19): cửa sổ không có focus cũng cần anh, dù ở ngay đây.', 'Still told (Ethan, 2026-11-19): a window with no focus needs you too, even right here.'), 16, y + 58);

// --- 3. several -------------------------------------------------------------------------------------------
title(t('3 · Nhiều cửa sổ', '3 · Several windows'), PX, y - 26);
pill(PX, y, (x, yy) => logo(x, yy, 24, BROWSER, 'F'), 'Pull request #284 — GitHub', 2, '+1');
note(t('Một pill mỗi app: cửa sổ mới nhất, "+1" khi app đó còn cửa sổ khác cần chú ý; bấm: cửa sổ mới nhất.', 'One pill per app: the newest window, "+1" while that app has other windows needing attention; click: the newest window.'), PX, y + 44);
note(t('Hai app khác nhau: hai pill (như hai thông báo).', 'Two different apps: two pills (like two notifications).'), PX, y + 58);

// --- 4. a terminal's bell ---------------------------------------------------------------------------------
y += 32 + 100;
title(t('4 · Terminal kêu bell (cờ urgent) khi cửa sổ không có focus', '4 · A terminal bell (urgent flag) in an unfocused window'), 16, y - 26);
pill(16, y, (x, yy) => { logo(x, yy, 24, TERM, '>'); }, 'pnpm verify — ~/works/buoy', 3);
note(t('Ptyxis, GNOME Terminal bật cờ urgent khi bell kêu ở cửa sổ không có focus: cùng pill (Ethan, 2026-11-19).', 'Ptyxis, GNOME Terminal set the urgent flag when the bell rings in a window with no focus: the same pill (Ethan, 2026-11-19).'), 16, y + 44);
note(t('Mục "Terminal command finished" sau này nói lệnh nào xong, mất bao lâu, mã thoát; khi đó nó thay pill này.', 'The later item "Terminal command finished" says which command is done, how long it took, the exit code; then it replaces this pill.'), 16, y + 58);

// --- 5. the priority -------------------------------------------------------------------------------------
title(t('5 · Thứ tự', '5 · Order'), PX, y - 26);
note(t('kind attention (50, đã có trong bảng ưu tiên): sau thông báo, cuộc gọi, ask; trước tải về, nhạc.', 'kind attention (50, already in the priority table): after notifications, calls, asks; before downloads, music.'), PX, y);
note(t('Không "cần bạn" (không đèn đỏ): nó chờ, không gấp. ×: tắt pill, cửa sổ vẫn đòi chú ý; đòi lại thì pill lại.', 'Not "needs you" (no red light): it waits, not urgent. ×: closes the pill, the window still asks; asks again, the pill again.'), PX, y + 14);
note(t('Chia sẻ màn hình: chỉ tên app, không tiêu đề cửa sổ (như thông báo).', 'Sharing the screen: app name only, no window title (like notifications).'), PX, y + 28);
surf.writeToPNG(out);
