# Thiết kế

Mọi quyết định về hình dạng của Buoy: cỡ, khoảng, bo góc, chữ, màu. SPEC nói Buoy **làm gì** và
khi nào; ở đây nói nó **trông thế nào**. Trang thiết kế viết và chốt bằng tiếng Việt trước, dịch
sang tiếng Anh sau.

**Trạng thái** của mỗi quyết định: **Chốt** = Ethan đã quyết · **Đề xuất** = Claude đề xuất, chờ
Ethan duyệt · **Mở** = chưa quyết. Mỗi dòng Chốt ghi ngày và ai quyết khi có.

Các thay đổi ở đây chưa có trong code: chúng là các mục redesign của M4 (v0.2) trong
[FEATURES](../FEATURES.md). Mỗi trang có mục "Chỗ trong code" ghi những gì phải sửa khi làm.

## Các phần

| Phần | Nội dung |
|---|---|
| [Bảng số](tokens.vi.md) | mọi con số dùng chung: thanh, pill, compact, expanded, bo góc, khoảng, chữ |
| [Bảng màu](colours/index.vi.md) | màu theo vai trò, đèn và chấm, phần theo GNOME |
| [Pill](pill/index.vi.md) | idle, minimal, pill phụ, đèn ở hai đầu, chữ, độ rộng trên thanh |
| [Compact](compact/index.vi.md) | dạng hover: phần đầu, nhạc, hàng Claude Code, card thông báo |
| [Alert và ask](alerts-and-asks/index.vi.md) | alert 5 s, ask có nút, hỏi nhiều câu |
| [Expanded](expanded/index.vi.md) | bảng mở khi bấm, lời chào |
| [Tab](tabs/index.vi.md) | thanh tab, Home, từng tab (đang mở) |
| [Icon](icons/index.vi.md) | icon buổi trong ngày và thời tiết |
| [Bu](mascot/index.vi.md) | cỡ của Bu trong mỗi dạng |

## Quy tắc chung

- **Đơn vị là em.** Ở 11pt, 1em ≈ 14.67 px (font của Ethan: SF Pro Display 11, tỷ lệ màn hình
  1×). Mọi số px trong các trang tính cho 1em = 11pt và lớn nhỏ theo em: bật chữ lớn thì cả
  thanh, pill và khoảng cùng lớn. **Chốt**
- **Đo từ mép ngoài.** Viền 1 px nằm bên trong hình (như `box-sizing: border-box`), nên mọi số đo
  tính từ mép ngoài. **Chốt**
- **Chiều cao theo dòng 16.** Compact và expanded luôn cao **56 + 16n**: phần đầu 56, rồi nội
  dung theo dòng 16 — một bậc bằng một dòng chữ 0.85em. **Chốt** (Ethan, 2026-11-10)
- **Bo đồng tâm.** Một hình nằm trong hình khác, cách mép một khoảng d, thì bo = bo ngoài − d
  (bo 28 của compact, lề 8 → ảnh bìa bo 20; lề 12 → nút bo 16). **Chốt**
- **Độ rộng đo từ chữ thật khi chạy,** không viết cứng: cùng một chữ rộng khác nhau theo font và
  theo tỷ lệ màn hình. **Chốt**
- **Một chuyển dạng là một lần nở ra:** minimal < compact < expanded, ở mọi màn hình. **Chốt**

## Vẽ lại ảnh

Ảnh vẽ bằng gjs + cairo, thẳng ở 3× nên phóng to vẫn nét: `scripts/render-design.sh` vẽ lại tất
cả. Mỗi phần có `images/` (ảnh) và `render/` (script); `render/lib.js` dùng chung (đo chữ ở 1×,
giãn chữ 3× cho khớp). Ảnh có chữ có hai bản: `x.vi.png` (nhãn tiếng Việt) và `x.en.png` (tiếng
Anh, làm khi dịch trang). Chữ giả lập trên giao diện (tên bài, tin nhắn, nút) giữ tiếng Anh như
Buoy hiển thị thật.
