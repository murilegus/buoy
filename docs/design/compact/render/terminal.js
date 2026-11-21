// Terminal command finished (design/compact "Lệnh terminal xong", 2026-11-21, Ethan): Ptyxis's "Command completed" as a pill,
// the exit code and the time from Buoy's shell hook. gjs -m terminal.js out.png
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out] = ARGV;
const SUB = 9.35, KW = 404;
const W = 1200, H = 690;
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, rgb = [1, 1, 1], right = false, max = 0, measure = false, mono = false} = {}) {
    const d = Pango.FontDescription.from_string(mono ? 'Ubuntu Mono' : 'SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
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
// Ptyxis's logo, as a sample: a dark round square with ">_"
const logo = (x, y, s) => {
    fill(1, x, y, s, s, s * .25, [.22, .22, .24]);
    const e = text('>_', 0, 0, {sz: s * .4, wt: 700, measure: true, mono: true});
    text('>_', x + (s - e.width) / 2, y + (s - e.height) / 2 - .5, {sz: s * .4, wt: 700, mono: true});
};
// trailing: ✓ or ✕ and the time, fg-muted; none without the hook
function pill(x, y, t, end = null, more = null) {
    const e = text(t, 0, 0, {wt: 600, measure: true, max: 240});
    const te = end ? text(end.time, 0, 0, {wt: 600, measure: true}).width + 20 : 0;
    const me = more ? text(more, 0, 0, {wt: 600, measure: true}).width + 8 : 0;
    const w = Math.max(131, 8 + 24 + 6 + e.width + (te + me ? 12 + te + me : 0) + 12);
    fill(1, x, y, w, 32, 16, [0, 0, 0]);
    logo(x + 4, y + 4, 24);
    text(t, x + 38, y + 8, {wt: 600, max: 240});
    let tx = x + w - 12;
    if (end) {
        const r = text(end.time, tx, y + 8, {wt: 600, a: C.FG_MUTED, right: true});
        tx -= r.width + 4;
        icon(end.ok ? 'check' : 'xmark', tx - 16, y + 8, 16, C.FG_MUTED);
        tx -= 24;
    }
    if (more)
        text(more, tx, y + 8, {wt: 600, a: C.FG_MUTED, right: true});
    return w;
}
function card(x, y, t, sub, button = 'Về tab') {
    cr.newPath(); rr(x, y, KW, 104, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    logo(x + 14, y + 8, 40);
    text(t, x + 66, y + 10, {wt: 600, max: KW - 120});
    text(sub, x + 66, y + 30, {sz: SUB, a: C.FG_MUTED, max: KW - 120});
    fill(C.FILL2, x + KW - 46, y + 12, 32, 32, 16); icon('xmark', x + KW - 38, y + 20, 16, C.FG_MUTED);
    fill(C.FILL2, x + 12, y + 60, KW - 24, 32, 16);
    const e = text(button, 0, 0, {sz: SUB, wt: 600, measure: true});
    icon('arrow-right', x + 12 + (KW - 24 - e.width - 22) / 2, y + 68, 16);
    text(button, x + 12 + (KW - 24 - e.width - 22) / 2 + 22, y + 68, {sz: SUB, wt: 600});
}
const PX = 16 + KW + 32;

// --- 1. done -------------------------------------------------------------------------------------
let y = 40;
title('1 · Lệnh xong khi cửa sổ Ptyxis không có focus: card như thông báo, rồi pill ở lại', 16, y - 26);
card(16, y, 'cargo build --release', 'exit 0 · 48 s · ~/works/song-ngoai-khoi · bây giờ');
pill(PX, y + 8, 'cargo build --release', {ok: true, time: '48 s'});
note('pill: logo Ptyxis, dòng lệnh, ✓ và thời gian chạy ở cuối (fg-muted).', PX, y + 50);
note('Ở lại tới khi anh về tab đó (Ptyxis tự gỡ thông báo khi tab có focus), như "Cửa sổ cần chú ý".', PX, y + 64);
note('Bấm pill hay "Về tab": Ptyxis mở đúng tab (hành động của chính thông báo, app.focus-tab-by-uuid).', PX, y + 86);
note('Thay thông báo "Command completed" của Ptyxis: không hiện thêm cái đó.', PX, y + 100);

// --- 2. failed -----------------------------------------------------------------------------------
y += 104 + 64;
title('2 · Lệnh lỗi', 16, y - 26);
card(16, y, 'pnpm verify', 'exit 1 · 2 phút 3 s · ~/works/buoy · bây giờ');
pill(PX, y + 8, 'pnpm verify', {ok: false, time: '2:03'});
note('✕ thay ✓, mã thoát trong card. Không xanh, không đỏ: xong hay lỗi nói bằng icon và chữ (design/colours).', PX, y + 50);
note('Thời gian: "48 s", "2:03", "1:05:10" trên pill; card nói đủ "2 phút 3 s".', PX, y + 64);
note('Ctrl+C (130) cũng là lỗi; lệnh bị dừng bằng Ctrl+Z thì không báo.', PX, y + 78);

// --- 3. no hook ----------------------------------------------------------------------------------
y += 104 + 64;
title('3 · Chưa có hook (bash có vte.sh)', 16, y - 26);
pill(16, y, 'rsync -a ảnh/ nas:/backup');
note('Chỉ có thông báo của Ptyxis: pill không có ✓/✕ và thời gian; card "Terminal · bây giờ" (tên Ubuntu đặt cho Ptyxis).', 16, y + 44);
note('zsh của Ubuntu không nạp vte.sh, nên Ptyxis không báo gì; hook của Buoy nạp nó.', 16, y + 58);

title('4 · Nhiều lệnh xong', PX, y - 26);
pill(PX, y, 'cargo build --release', {ok: true, time: '48 s'}, '+1');
note('Một pill cho Ptyxis: lệnh mới nhất, "+1" cho các tab khác cũng xong; bấm: tab mới nhất.', PX, y + 44);
note('Thứ tự như "Cửa sổ cần chú ý" (attention): sau thông báo, cuộc gọi, ask. Không đèn đỏ.', PX, y + 58);

// --- 5. prefs ------------------------------------------------------------------------------------
y += 32 + 100;
title('5 · Prefs: cài hook', 16, y - 26);
const PW = 620;
fill(1, 16, y, PW, 112, 12, [.19, .19, .2]);
text('Lệnh terminal xong', 32, y + 12, {wt: 600});
text('Thêm dòng này vào ~/.zshrc hoặc ~/.bashrc để Buoy biết mã thoát và thời gian chạy.', 32, y + 30, {sz: SUB, a: C.FG_MUTED});
fill(C.FILL1, 32, y + 56, PW - 32 - 16 - 44, 36, 8);
text('source ~/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/shell.sh', 44, y + 67, {sz: 9, mono: true, a: C.FG_MUTED});
fill(C.FILL2, 16 + PW - 16 - 36, y + 56, 36, 36, 8); icon('copy', 16 + PW - 16 - 26, y + 66, 16);
note('Nút chép, như chép link họp. Buoy không tự sửa file của shell.', 16, y + 122);
note('Hook: nạp vte.sh nếu chưa có, ghi mã thoát, thời gian và thư mục của lệnh vừa xong', PX + 220, y + 6);
note('vào một file nhỏ trong $XDG_RUNTIME_DIR (lệnh có sẵn của shell, không chạy thêm', PX + 220, y + 20);
note('tiến trình, không D-Bus). Buoy chỉ đọc file đó khi thông báo của Ptyxis đến.', PX + 220, y + 34);
note('Không có Buoy: hook không làm gì khác, shell chạy như cũ.', PX + 220, y + 56);
surf.writeToPNG(out);
