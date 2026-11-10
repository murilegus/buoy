# Bảng màu

**Mở.** CSS của Buoy chỉ được dùng các màu có tên ở trang này, mỗi màu có một vai trò; không có
màu chọn riêng cho một chỗ. Bảng màu chưa thiết kế; dưới đây là hiện trạng, để biết phải gom gì.

## Đã chốt

- Pill và mọi dạng của island: nền **đen** `#000`. **Chốt**
- Viền: **trắng 12 %**, cả island và menu. GNOME dùng 10 % cho viền ở chế độ tối
  (gnome-shell-sass `_default-colors.scss` `$border_opacity: .9`); 15 % đã cân nhắc và bỏ.
  **Chốt** (Ethan, 2026-11-10)
- Màu nhấn: `-st-accent-color` của GNOME (dấu chọn, ô nhập, vòng focus), không tự chọn. **Chốt**
- Màu đèn và màu chữ trên thanh theo [INDICATORS](../INDICATORS.md) và SPEC §1 (`cluster-contrast`).

## Hiện trạng

*`stylesheet.css`, `main` 2026-11-10.*

**54 giá trị màu khác nhau** trong 497 dòng:

- **Trắng trong suốt, 20 mức:** 0.07 · 0.08 · 0.10 · 0.11 · 0.12 · 0.13 · 0.16 · 0.17 · 0.18 · 0.20 ·
  0.24 · 0.25 · 0.28 · 0.32 · 0.40 · 0.45 · 0.50 · 0.55 · 0.70 · 0.75. Nhiều mức chỉ khác nhau
  1 % (0.10 / 0.11, 0.12 / 0.13, 0.16 / 0.17 / 0.18), cho cùng một việc (nền nút, nền chip, hover).
- **Xám đặc, 21 mã:** `#0e0e10` `#141416` `#1a1a1a` `#1c1c1e` `#1f1f1f` `#242424` `#2a2a2d`
  `#2c2c2c` `#2c2c2e` `#3a3a3a` `#3a3a3c` `#424242` `#48484a` `#8a8a8a` `#8e8e93` `#b0b0b5`
  `#b8b8b8` `#ccc` `#cfcfcf` `#d0d0d0` `#ddd`.
- **Màu:** `#EF9F27` (đèn missed), `#E24B4A` (đèn waiting), `#f1efe8` (thân Bu), `#2a1f0c`.
- **Tối trong suốt** cho chữ tối trên hình nền sáng: `rgba(26, 26, 26, …)` với 0.17 · 0.28 · 0.32 ·
  0.75 — đúng các mức .17 / .28 / .32 GNOME dùng cho nút trên thanh (CLAUDE.md, "Don't").

## Còn mở

- Các bậc trắng trong suốt: gom 20 mức về vài bậc có tên theo vai trò (viền, nền nút, hover,
  nhấn, chữ phụ…).
- Các bậc xám đặc: gom 21 mã, và quyết định khi nào dùng xám đặc, khi nào dùng trắng trong suốt.
- Màu cho trạng thái (đèn, lỗi, xong) và cho chế độ tương phản cao.
- Cách viết trong CSS: St không đọc biến CSS (`st-theme-node.c` của Shell 50 không xử lý
  `var()`), nên bảng màu cần một cách giữ một nguồn — sinh CSS từ bảng, hay quy ước tên class mà
  mọi chỗ khác dùng chung.
