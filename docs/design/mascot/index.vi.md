# Bu

Bu, linh vật của Buoy: lưới 10 × 10 ô, 13 dáng, đèn trên đầu. Nguồn là [MASCOT.md](../../MASCOT.md)
(tiếng Anh): `kit/model/mascot.js` và `tests/mascot.test.js` đọc lưới từ đó, ảnh xem trước nằm trong
`docs/mascot/`. MASCOT.md ở nguyên chỗ cũ cho tới khi các docs ở gốc `docs/` được làm gọn lại
(Ethan, 2026-11-10).

## Cỡ trong từng dạng

- Bu vẽ bằng code từ lưới 10 × 10 (`kit/ui/present/motion.js` `mascot()`, mỗi ô `w / 10`, tắt khử răng cưa), nên
  chỉ nét ở bội số của 10: **20** trong pill (mỗi ô 2 px), **40** trong compact và ask, **50** trong
  expanded, **40** trong prefs. **Chốt**
- Trong pill, Bu 20 nằm giữa ô leading 24 ([Pill](../pill/index.vi.md)). **Chốt**
- Khi bật chữ lớn (ô lên 30), Bu giữ 20: lưới 10 cần bội số của 10. **Chốt** (Ethan, 2026-11-10)
- Ở tỷ lệ lẻ (1.25×, 1.5×), St vẽ Bu ở tỷ lệ làm tròn lên rồi Mutter thu nhỏ cả màn hình, nên Bu hơi
  mềm như chữ (`st-drawing-area.c`: bề mặt rộng `ceilf(width × scale_factor)`). Mọi hình pixel đều
  chịu điều này.
