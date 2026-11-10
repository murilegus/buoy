# Icon

Icon buổi trong ngày và thời tiết: 19 SVG màu, một họ, `scripts/icons.js` là nguồn và vẽ ra
[docs/icons.png](../../icons.png) (bảng màu A, mây xanh nhạt; Ethan, 2026-11-06).

## Quyết định

- Vẽ lại trên lưới **20** (`viewBox="0 0 20 20"`; hiện là lưới 16 hiện ở 20), đặt trong ô 24 như Bu.
  Vẫn là SVG vector, không đổi sang kiểu pixel. Ở 20 px mỗi đơn vị đúng 1 px, ở 40 px (card hover)
  đúng 2 px, nên nét căng ở cả hai. **Chốt** (Ethan, 2026-11-10)
- Khi bật chữ lớn, ô lên 30: icon là vector nên lớn theo em, 20 ở 1em, 25 ở 1.25; chỉ nét tuyệt
  đối ở 1em, ở cỡ khác hơi mềm nhưng không vỡ. **Chốt** (Ethan, 2026-11-10)
- Giữ bảng màu A và id từng phần (sun, moon, cloud, rain…), để một tab có thể tách icon thành lớp
  mà chuyển động. **Chốt** (2026-11-06)

## Còn mở

- Các icon symbolic trên thanh và trong tab (đặt ở đâu, vẽ theo lưới nào) chưa thiết kế.

## Chỗ trong code

- `scripts/icons.js` — vẽ lại 19 icon trên lưới 20; chạy lại để ghi
  `src/buoy@murilegus/icons/{daypart,weather}-*.svg` và `docs/icons.png`.
- Cỡ icon trong pill tính bằng em để lớn theo chữ lớn.

`docs/icons.png` và `scripts/icons.js` ở nguyên chỗ cũ cho tới khi các docs ở gốc `docs/` được làm
gọn lại (Ethan, 2026-11-10).
