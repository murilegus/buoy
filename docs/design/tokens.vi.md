# Bảng số

Bảng số duy nhất của Buoy. Trang khác (SPEC, NOTIFICATIONS, INDICATORS, các trang thiết kế) dẫn
về đây thay vì chép số. Số px tính cho 1em = 11pt ≈ 14.67 px và lớn nhỏ theo em
([Quy tắc chung](index.vi.md#quy-tắc-chung)).

## Thanh và pill

| Tên | Giá trị | Ghi chú | Trạng thái |
|---|---|---|---|
| Thanh (panel) | 2.75em = 40 | | Chốt |
| Pill, cao | 32 = thanh − 2 × 0.25em | idle, minimal, pill phụ | Chốt |
| Pill, bo | 16 | nửa chiều cao | Chốt |
| Khung nội dung | cao 24, trên dưới mỗi bên 4 | | Chốt |
| Lề ngang | 8 | trước là 14 (`PAD`) | Chốt |
| Khoảng leading → chữ, chữ → trailing | 6 | trước là 8: mép tròn làm 8 trông xa hơn lề | Chốt (Ethan, 2026-11-12) |
| Khoảng trailing → nút | 8 | | Chốt |
| Leading | icon 24, đầy khung nội dung 24; Bu 20 giữa ô 24 (lưới 10 × 10) | | Chốt (Ethan, 2026-11-11) |
| Viền | 1 px, trắng 12 %, nằm trong hình | | Chốt |
| Idle | rộng theo plan rộng nhất, đo khi chạy: 131 ở 1×, 136 ở 1.25–2× | 8 + 24 + 6 + chữ + 8; code làm tròn lên số chẵn (132) để pill canh giữa đúng pixel | Chốt |
| Chấm đèn | 8, ở tâm hình tròn đầu (cách mép 16) | chỉ trên pill 1 | Chốt |
| Equaliser | 6 thanh 2 × 14, khe 2, bo 1 | rộng 22; trước là 4 thanh 3 × 12 (rộng 18); dừng: hạ xuống trong 200 ms; trong compact nhạc: giữa ô 32 của nút tròn | Chốt (Ethan, 2026-11-13) |
| Mỗi đầu nở khi có đèn | 20 = bán kính 16 + nửa chấm 4 | idle 131 → 171 | Chốt |
| Pill phụ | 131, bằng idle; tối đa 2, bên phải | | Chốt (Ethan, 2026-11-11) |
| Hover | rộng cộng 0.75em (12), cao cộng 2 như nay (32 → 34) | thay cho × 1.10 | Chốt (Ethan, 2026-11-11) |

## Compact

| Tên | Giá trị | Ghi chú | Trạng thái |
|---|---|---|---|
| Chiều cao | 56 + 16n, tối đa 152 | phần đầu 56, rồi dòng 16 | Chốt |
| Bo | 28 | | Chốt |
| Phần đầu | 56: leading 40, trên dưới 8, hai bên 14 | | Chốt (Ethan, 2026-11-11) |
| Nút tròn | 32, tâm ở y = 28 | | Chốt (Ethan, 2026-11-11) |
| Ảnh bìa (nhạc) | 72, cách mép 8, bo 20 | nhạc 88 | Chốt |
| Hàng (Claude Code, bị nhỡ) | 16, icon 16; trên 8, dưới 8 | 88 / 104 / 120 | Chốt (Ethan, 2026-11-11) |
| Card thông báo | thân cách đầu 8, cách nút 12; nút cách mép 12, cao 32, bo 16 | 136 / 152 | Chốt |
| Ask | như card | 120 / 136 / 152 | Chốt |
| Hỏi nhiều lựa chọn | hàng 28 mỗi lựa chọn, cách 4 (bước 32) | tới 276 | Chốt (Ethan, 2026-11-11; cách 4: 2026-11-13) |
| Rộng | cố định min(28em, 0.72 × expanded); co theo nội dung chỉ ở pill | 404 ở 1920, 410 ở 2560 | Chốt (Ethan, 2026-11-12; trước là 16em … min(…), co theo nội dung) |

## Expanded

| Tên | Giá trị | Ghi chú | Trạng thái |
|---|---|---|---|
| Rộng | clamp(0.28 × màn, 560, 760) | | Chốt |
| Cao | theo nội dung, 56 + 16n, tối đa rộng/2 làm tròn xuống | 280 / 344 / 376 ở 1920 / 2560 / 3440 | Chốt |
| Bo | 28 | | Chốt |
| Thanh tab | cao 32, cách mép trên 12 | bo 16, đồng tâm | Chốt |
| Home: thẻ chính | phần còn lại: 104 / 168 / 200 ở 1920 / 2560 / 3440 | dạng cao từ 160 | Chốt (Ethan, 2026-11-11) |
| Home: ô | cao 100, rộng ≥ 120, cách 8; ô rộng 2 phần | N = 4 / 5 / 5 | Chốt (Ethan, 2026-11-11) |
| Phần đầu không tab | 88 = 16 + leading 56 + 16, leading bo 12 | lời chào 88 | Chốt |

## Độ rộng tối đa trên thanh

Lấy số nhỏ nhất trong ba giới hạn: theo em, theo tỷ lệ của expanded, theo khoảng trống giữa hai
cụm. **Chốt**

| | Nhỏ nhất | Lớn nhất | 1366 / 1920 | 2560 / 3440 |
|---|---|---|---|---|
| Idle, pill phụ | 131 | 131 | 131 | 131 |
| Minimal, pill 1 | 131 | min(24em, 0.6 × expanded, khoảng trống) | 336 | 352 |
| Compact | cố định | min(28em, 0.72 × expanded) | 404 | 410 |
| Expanded | 560 | 760 | 560 | 716 / 760 |

## Chữ

| Tên | Giá trị | Cao dòng | Trạng thái |
|---|---|---|---|
| Chữ trong pill | 1em, đậm 600, số đều | 18 | Chốt |
| Tiêu đề | 1em, đậm 600 | 18 | Chốt |
| Phụ đề, thân, hàng | 0.85em | 16 | Chốt |
| Nhỏ nhất | 0.85em; GNOME không dùng chữ dưới 9pt ≈ 0.82em (`%caption`) | — | Chốt |

Cao dòng đo bằng Pango với SF Pro Display 11pt. Hai dòng 1em + 0.85em cần 34, nên một hàng 32 chỉ
chứa một dòng ([Alert và ask](alerts-and-asks/index.vi.md)).

## Thời gian

| Tên | Giá trị | Trạng thái |
|---|---|---|
| Alert hiện | 5 s, giữ lại khi rê chuột | Chốt |
| Compact hiện sau khi rê chuột | 300 ms | Chốt |

## Chuyển động

Lò xo theo `d` (thời gian cảm nhận) và `bounce`: khối lượng 1, độ cứng (2π / d)², giảm chấn
(1 − bounce) · 4π / d ([Chuyển động](motion/index.vi.md)). Lắng: còn cách đích dưới 0.5 px trên
quãng 400 px.

| Tên | d | bounce | Vọt quá | 95 % lúc | Lắng lúc | Trạng thái |
|---|---|---|---|---|---|---|
| `snap` | 240 ms | 0.15 | 0.6 % | 141 ms | 327 ms | Đề xuất |
| `size` | 240 ms | 0 | 0 | 182 ms | 344 ms | Đề xuất |
| `move` | 400 ms | 0.20 | 1.5 % (compact rộng 4 px) | 216 ms | 532 ms | Đề xuất |
| `open` | 500 ms | 0.25 | 2.8 % (expanded rộng 12, cao 7 px) | 249 ms | 631 ms | Đề xuất |
| `close` | 360 ms | 0 | 0 | 272 ms | 515 ms | Đề xuất |

| Tên | Thời gian | Đường | Trạng thái |
|---|---|---|---|
| `fade-out` | 100 ms | ease-out | Đề xuất |
| `fade-in` | 200 ms | ease-out | Đề xuất |
| `state` | 120 ms | ease-out (CSS) | Đề xuất |
| `idle` | 300 ms | ease-in-out | Đề xuất |
| Ân hạn khi rời compact | 200 ms | | Chốt |
| Một bước khi cuộn trên idle | 400 ms | | Chốt |
| Vạch chọn và thân khi đổi tab | dời 12 px | | Đề xuất |
| Danh sách tại chỗ | tới từ 24 px | | Đề xuất |
| Nhấn pill | co 4 px mỗi chiều | | Đề xuất |
