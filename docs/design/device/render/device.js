// The Device tab (decided 2026-11-16, Ethan; FEATURES M4 "Device tab"): the expanded panel at
// 1920 (560 × 280), a column per group (layout B).
//   columns  three cases: the laptop now, a desktop (no battery), many devices ("+N")
//   pages    what a click opens: a group's whole list ("+N"), a display's ways to be used
// gjs -m device.js out.png <mode>
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import {SCALE as SC, C, icon as gicon} from '../../render/lib.js';

const [out, MODE = 'columns'] = ARGV;
const W1 = C.WHITE, SUB = 9.35, PW = 560, PH = 280, GAP = 40;
const N = MODE === 'columns' ? 3 : 2;
const W = N * PW + (N + 1) * GAP - 40, H = 40 + PH + (MODE === 'columns' ? 102 : 60);
const surf = new cairo.ImageSurface(cairo.Format.ARGB32, W * SC, H * SC), cr = new cairo.Context(surf);
cr.scale(SC, SC); cr.setSourceRGB(...C.WALL); cr.paint();
const L = PangoCairo.create_layout(cr); PangoCairo.context_set_resolution(L.get_context(), 96);
function text(t, x, y, {sz = 11, wt = 400, a = 1, right = false, max = 0} = {}) {
    const d = Pango.FontDescription.from_string('SF Pro Display'); d.set_size(sz * Pango.SCALE); d.set_weight(wt);
    L.set_font_description(d); L.set_text(t, -1);
    L.set_width(max > 0 ? max * Pango.SCALE : -1); L.set_ellipsize(max > 0 ? Pango.EllipsizeMode.END : Pango.EllipsizeMode.NONE);
    const e = L.get_pixel_extents()[1];
    cr.setSourceRGBA(1, 1, 1, a); cr.moveTo(right ? x - e.width : x, y); PangoCairo.show_layout(cr, L);
    L.set_width(-1);
    return e;
}
function rr(x, y, w, h, r) {
    cr.newSubPath(); cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0); cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI); cr.closePath();
}
const fill = (a, x, y, w, h, r) => { cr.newPath(); rr(x, y, w, h, r); cr.setSourceRGBA(1, 1, 1, a); cr.fill(); };
const icon = (n, x, y, s = 16, a = 1) => gicon(cr, n, x, y, s, W1, a);
const note = (t, x, y) => text(t, x, y, {sz: 8.5, a: .7});

// the panel, the tab strip with Devices chosen (design/tabs), ⚙
function panel(x, y) {
    cr.newPath(); rr(x, y, PW, PH, 28); cr.setSourceRGB(0, 0, 0); cr.fill();
    fill(C.FILL1, x + 12, y + 12, 268, 32, 16);
    ['house', 'music-note', 'bell', 'calendar'].forEach((n, i) => icon(n, x + 24 + i * 36, y + 20, 16, C.FG_MUTED));
    fill(C.FILL3, x + 160, y + 14, 112, 28, 14);
    icon('display', x + 170, y + 20, 16); text('Thiết bị', x + 192, y + 19, {sz: SUB, wt: 600});
    fill(C.FILL1, x + PW - 44, y + 12, 32, 32, 16); icon('gear', x + PW - 36, y + 20, 16, C.FG_MUTED);
}
// a column per group shown: its title and count; cells 58, r 16, 6 apart; 3 fit at 1920, the
// last of a longer group is "+N" with the names it holds
const ROWS = 3;
function columns(x, y, groups) {
    panel(x, y);
    const shown = groups.filter(g => g.rows.length);
    const n = shown.length, cw = (PW - 24 - (n - 1) * 8) / n;
    shown.forEach((g, i) => {
        const cx = x + 12 + i * (cw + 8);
        text(`${g.title.toUpperCase()}  ${g.rows.length}`, cx + 10, y + 58, {sz: 7.5, wt: 600, a: C.FG_SUBTLE});
        const over = g.rows.length > ROWS;
        (over ? g.rows.slice(0, ROWS - 1) : g.rows).forEach((r, j) => {
            const ry = y + 76 + j * 64;
            fill(C.FILL1, cx, ry, cw, 58, 16);
            icon(r[0], cx + 12, ry + 12, 16);
            if (r[2])
                text(r[2], cx + cw - 12, ry + 11, {wt: 600, right: true});
            text(r[1], cx + 12, ry + 34, {sz: SUB, a: C.FG_MUTED, max: cw - 24});
        });
        if (over) {
            const ry = y + 76 + (ROWS - 1) * 64;
            fill(C.FILL1, cx, ry, cw, 58, 16);
            text(`+${g.rows.length - ROWS + 1}`, cx + 12, ry + 11, {wt: 600});
            text(g.rows.slice(ROWS - 1).map(r => r[1]).join(', '), cx + 12, ry + 34, {sz: SUB, a: C.FG_MUTED, max: cw - 24});
        }
    });
}
// a page in place of the columns, ‹ back (as Home's battery page, design/home)
function page(x, y, head, end, rows, settings) {
    panel(x, y);
    const AX = x + 12, AW = PW - 24;
    fill(C.FILL2, AX, y + 56, 32, 32, 16); icon('chevron-left', AX + 8, y + 64);
    text(head, AX + 42, y + 63, {wt: 600});
    if (end)
        text(end, AX + AW - 4, y + 64, {sz: SUB, a: C.FG_SUBTLE, right: true});
    rows.forEach((r, i) => {
        const ry = y + 96 + i * 40;
        if (r.on)
            fill(C.FILL3, AX, ry, AW, 36, 18);
        else if (r.plain)
            fill(C.FILL1, AX, ry, AW, 36, 18);
        icon(r.ic, AX + 14, ry + 10, 16, 1, r.on || r.plain ? 1 : C.FG_MUTED);
        const ne = text(r.name, AX + 40, ry + 9, {wt: r.on ? 600 : 400, a: r.on || r.plain ? 1 : C.FG_MUTED});
        if (r.detail)
            text(r.detail, AX + 40 + ne.width + 8, ry + 10, {sz: SUB, a: C.FG_SUBTLE});
        if (r.value)
            text(r.value, AX + AW - 14, ry + 9, {a: C.FG_MUTED, right: true});
        if (r.on)
            icon('check', AX + AW - 30, ry + 10, 16);
    });
    if (settings) {
        const ry = y + 96 + rows.length * 40 + 4;
        fill(C.FILL1, AX, ry, AW, 36, 18);
        icon('gear', AX + 14, ry + 10, 16, C.FG_MUTED); text(settings, AX + 40, ry + 9, {a: C.FG_MUTED});
        icon('arrow-up-right-from-square', AX + AW - 30, ry + 10, 16, C.FG_SUBTLE);
    }
}

if (MODE === 'columns') {
    const LAPTOP = [
        {title: 'Máy này', rows: [['battery', 'Pin · dùng 11 W', '76%'], ['scales-balanced', 'Chế độ năng lượng', 'Cân bằng']]},
        {title: 'Không dây', rows: []},
        {title: 'Đang cắm', rows: [['display', 'ViewSonic 27″', 'Nối'], ['headphones', 'Logi USB Headset', '64%']]},
    ];
    const DESKTOP = [
        {title: 'Máy này', rows: [['battery-full', 'UPS · còn 25 phút', '100%'], ['scales-balanced', 'Chế độ năng lượng', 'Cân bằng']]},
        {title: 'Không dây', rows: [['keyboard', 'MX Keys', '30%'], ['headphones', 'Galaxy Buds2', '70%']]},
        {title: 'Đang cắm', rows: [['display', 'Dell U2723QE', 'Nối'], ['display', 'ViewSonic 27″', 'Nối']]},
    ];
    const MANY = [
        {title: 'Máy này', rows: [['battery-charging', 'Pin · sạc 31 W', '88%'], ['scales-balanced', 'Chế độ năng lượng', 'Hiệu năng']]},
        {title: 'Không dây', rows: [['headphones', 'WH-1000XM4', '80%'], ['keyboard', 'MX Keys', '30%'], ['smartphone', 'Điện thoại của Ethan', '54%'], ['headphones', 'Tay cầm Xbox', '45%']]},
        {title: 'Đang cắm', rows: [['display', 'ViewSonic 27″', 'Nối'], ['display', 'Dell U2723QE', 'Nối'], ['camera', 'Logi C920', ''], ['hard-drive', 'USB 64 GB', '41 GB']]},
    ];
    [[LAPTOP, 'Laptop (máy Ethan bây giờ)'], [DESKTOP, 'Máy bàn: chế độ năng lượng, UPS nếu có'], [MANY, 'Nhiều thiết bị: quá 3 thì "+N"']].forEach(([g, t], i) => {
        const x = GAP / 2 + i * (PW + GAP);
        text(t, x, 12, {sz: 12, wt: 600});
        columns(x, 40, g);
    });
    const ny = 40 + PH + 12;
    note('Mỗi nhóm có thiết bị là một cột; nhóm trống ẩn, các cột còn lại chia đều bề ngang. Số lượng cạnh tiêu đề nhóm (0.7em 600, fg-subtle).', GAP / 2, ny);
    note('Ô 58, bo 16, fill-1, cách 6: icon 16 ở 12, giá trị 600 bên phải, tên 0.85em fg-muted (cắt "…" khi dài). Ở 1920 vừa 3 ô mỗi cột, ở 2560 vừa 4.', GAP / 2, ny + 14);
    note('Quá số đó: ô cuối là "+N" kèm tên các thiết bị còn lại; bấm mở cả nhóm (ảnh dưới). Máy bàn: chế độ năng lượng, cùng UPS cắm USB nếu có (UPower); không có gì thì nhóm ẩn.', GAP / 2, ny + 28);
    note('Ô pin: dưới tên là công suất từ UPower (EnergyRate): "dùng 11 W" khi chạy pin, "sạc 31 W" khi sạc; không đọc được thì chỉ "Pin". Máy bàn không có số này (RAPL chỉ root đọc được).', GAP / 2, ny + 56);
    note('Không dây và ổ USB, webcam trong mẫu đến với các mục của chúng (Bluetooth device, Phone via GSConnect, USB / phone / webcam plugged).', GAP / 2, ny + 42);
} else {
    let x = GAP / 2;
    text('Bấm "+N": cả nhóm thành danh sách', x, 12, {sz: 12, wt: 600});
    page(x, 40, 'Đang cắm · 4', null, [
        {ic: 'display', name: 'ViewSonic 27″', detail: '2560 × 1440', value: 'Nối', plain: true},
        {ic: 'display', name: 'Dell U2723QE', detail: '3840 × 2160', value: 'Nối', plain: true},
        {ic: 'camera', name: 'Logi C920', plain: true},
        {ic: 'hard-drive', name: 'USB 64 GB', value: '41 GB trống', plain: true},
    ], null);
    x += PW + GAP;
    text('Bấm một màn hình: các cách dùng hai màn', x, 12, {sz: 12, wt: 600});
    page(x, 40, 'ViewSonic 27″', '2560 × 1440', [
        {ic: 'layout-split-columns', name: 'Nối', on: true},
        {ic: 'copy', name: 'Nhân bản'},
        {ic: 'display', name: 'Chỉ màn ngoài'},
    ], 'Cài đặt màn hình');
    const ny = 40 + PH + 12;
    note('Trang thay chỗ các cột, ‹ về lại; hàng 36 bo 18 cách 4, như danh sách chế độ năng lượng trong Home. Danh sách dài hơn chỗ thì cuộn.', GAP / 2, ny);
    note('Pin và chế độ năng lượng mở đúng trang pin của Home (design/home); tai nghe, loa mở Cài đặt → Âm thanh; ổ USB mở trong Files.', GAP / 2, ny + 14);
}
surf.writeToPNG(out);
