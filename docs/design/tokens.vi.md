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
| Khoảng giữa các phần | 8 | leading → chữ → trailing → nút | Chốt |
| Leading | icon 24, đầy khung nội dung 24; Bu 20 giữa ô 24 (lưới 10 × 10) | | Chốt (Ethan, 2026-11-11) |
| Viền | 1 px, trắng 12 %, nằm trong hình | | Chốt |
| Idle | rộng theo plan rộng nhất, đo khi chạy: 133 ở 1×, 138 ở 1.25–2× | | Chốt |
| Chấm đèn | 8, ở tâm hình tròn đầu (cách mép 16) | chỉ trên pill 1 | Chốt |
| Mỗi đầu nở khi có đèn | 20 = bán kính 16 + nửa chấm 4 | idle 133 → 173 | Chốt |
| Pill phụ | 133, bằng idle; tối đa 2, bên phải | | Chốt (Ethan, 2026-11-11) |
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
| Hỏi nhiều lựa chọn | hàng 32 mỗi lựa chọn | tới 280 | Chốt (Ethan, 2026-11-11) |
| Rộng | 16em … min(28em, 0.72 × expanded) | 240 … 404 ở 1920 | Chốt |

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
| Idle, pill phụ | 133 | 133 | 133 | 133 |
| Minimal, pill 1 | 133 | min(24em, 0.6 × expanded, khoảng trống) | 336 | 352 |
| Compact | 16em ≈ 240 | min(28em, 0.72 × expanded) | 404 | 410 |
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
