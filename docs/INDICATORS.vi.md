# Chỉ báo — đèn phao và chấm riêng tư

Mọi dấu trạng thái trên pill. Màu hay vị trí mới phải được sửa ở đây trước (SPEC §2a-i,
§2a-ii). Các dấu nằm ở đâu và pill lớn ra quanh chúng thế nào nằm ở [Thiết kế](design/index.vi.md)
(Pill); màu của chúng là các vai trò trong bảng màu (`kit/model/palette.js`, design/colours).

## Nguyên tắc

1. **Hai slot ở hai mép, không gì khác.** Trái = *đèn phao* (về bạn: thứ bạn đã nhỡ hoặc thứ
   đang chờ bạn). Phải = *chấm riêng tư* (về máy: thứ đang ghi nhận lúc này). Không có slot thứ
   ba, không có badge trên icon.
2. **Tĩnh.** Một dấu đổi màu hoặc hiện/biến mất; không bao giờ nhấp nháy, đập hay thở
   (SPEC §8).
3. **Chỉ khi có nghĩa.** Slot trống thì không vẽ. Ngoại lệ: đèn "off" màu xám ở idle `none`, để
   một pill trống không bao giờ trông như bị hỏng.
4. **Giống nhau ở idle, minimal và compact.** Expanded ẩn cả hai (Home và danh sách nhỡ giải
   thích chúng).
5. **Một màu = một nghĩa**, trên mọi module. Module không bao giờ chọn màu.

## Đèn phao (mép trái)

| Màu | Token | Nghĩa | Bật bởi | Tắt bởi | Hiện ở |
|---|---|---|---|---|---|
| trắng 20 % | `light-off` | không có gì | — | — | chỉ idle `none` |
| hổ phách `#FF9F0A` | `light-missed` | lịch sử nhỡ có mục: một activity đã kết thúc hoặc đến khi island bị ẩn (toàn màn hình), khi bạn vắng mặt (session idle của GNOME, sau `idle-delay`), khi màn hình khoá, hoặc khi đang Không làm phiền; hoặc một thông báo chưa bao giờ có đủ 5 s khi bạn có mặt (bị cắt ngang, không còn chỗ trong một loạt) (2026-11-12, Ethan; NOTIFICATIONS §2). Không tính: `osd`, `copied`, `input` (thao tác của chính bạn), `ask` (đỏ), app bị ẩn (2026-11-01) | `stack` (`setUnseen`, `setAway`) | mở Home, hoặc lịch sử được xoá hết; ô Missed của Home ở lại tới khi mọi hàng được mở hoặc xoá | idle, minimal |
| đỏ `#FF453A` | `light-waiting` | một `ask` không lên được (toàn màn hình, bị dismiss) vẫn chưa được trả lời | `stack`, một `ask` đã xếp hàng nhưng chưa hiện | được trả lời, hết giờ (→ deny), hoặc bên gọi end nó | idle, minimal |

Ưu tiên: đỏ › hổ phách › off; chỉ vẽ một đèn.

Không phải trạng thái: icon buổi trong ngày của clock plan (SPEC §2a, 2026-11-04) cạnh đèn có
màu vàng `#FFD23F` và đào `#FFB889`, không bao giờ là hổ phách hay đỏ (`tests/clock.test.js`).

### Đèn của Bu

*2026-11-03; 2026-11-08.*

Đèn của Bu luôn hiện màu của dáng, do kit chọn, đứng yên. Trên pill mà Bu đứng ở leading, đèn
phao vẫn là chấm ở mép: hổ phách/đỏ chỉ tới đèn của Bu dưới dạng màu riêng của dáng
`missed`/`ask` (2026-11-08, Ethan: đèn của Bu quá nhỏ để đọc như đèn phao). Phần còn lại của Bu
theo bảng màu cố định của MASCOT.md, không màu nào là màu trạng thái.

| Màu | Dáng |
|---|---|
| `#C8C6BD` | idle |
| `#444441` | sleep, stale |
| hổ phách `#FF9F0A` | missed |
| đỏ `#FF453A` | ask |
| `#B4E33D` | done, party |
| `#3D9BFF` | busy |
| `#FFE14D` | wave |
| `#FF7EB6` | think (hồng: tím là của micro) |
| `#5AD8F5` | compact |
| `#8A8880` | error (xám, không bao giờ đỏ: đỏ là ask) |
| màu chữ (foreground) | turn |

Hover pill giữa khi đèn hổ phách: compact của nó thành danh sách nhỡ (tối đa 3 hàng, mới nhất
trước: icon, chữ, giờ kết thúc, 2026-11-05); hover không xoá gì. Click → Home, nơi mục Missed
liệt kê chúng và tắt đèn (SPEC §3). Khi có activity đang chạy, danh sách thay compact của nó
(transport của media quay lại khi Home đã được mở); click khi danh sách đang hiện thì mở Home,
trước khi nó hiện (300 ms đầu) thì mở tab của activity (`tabs.js` `pressTarget`, 2026-11-04).
Hover khi đèn đỏ: card riêng của ask đang chờ (ask chưa trả lời mới nhất nằm ngoài màn hình, kèm
các nút) thay compact; trả lời ở đó; rời đi thì nó đóng, đèn vẫn đỏ (2026-11-13, Ethan;
`stack.waiting`).

## Chấm riêng tư (mép phải)

| Màu | Token | Nghĩa | Nguồn | Hiện ở |
|---|---|---|---|---|
| tím `#BF5AF2` | `dot-mic` | micro đang được dùng | các stream source-output của Gvc | idle, minimal |
| xanh lá `#30D158` | `dot-cam` | camera đang được dùng | `Shell.CameraMonitor` | idle, minimal |
| đỏ `#FF453A` | `dot-screen` | màn hình đang được chia sẻ hoặc quay (màu đỏ của chờ, ở phía bên kia) | screencast của Shell (`screenshotUI` `screencast-in-progress`), các handle truy cập từ xa của Mutter | idle, minimal |

Micro và camera lấy từ các chỉ báo Quick Settings của GNOME (thanh trượt input đang hiện và không
tắt tiếng; icon camera gắn với `Shell.CameraMonitor`), nên Buoy đếm đúng những gì GNOME đếm
(`modules/privacy/source.js`, 2026-11-14). Ưu tiên: đỏ › xanh lá › tím, một chấm
(design/colours "Chấm riêng tư", 2026-11-11). Vị trí không có chấm, như GNOME và Apple.

Click → Home. Quay hay chia sẻ màn hình là một activity riêng (kind `screen`, độ ưu tiên 55):
đồng hồ của nó trên pill, nút Stop trong compact của nó và trên card của Home (design/compact).
Camera cùng micro thành một activity "In a call", và phần nhìn nhanh "in use" của Home nêu tên
các app đang ghi âm (2026-11-27, design/compact "Đang gọi"); app dùng camera thì không có tên
(`Shell.CameraMonitor` chỉ đếm).

Khi module `privacy` bật, các chỉ báo riêng của GNOME (camera, micro, truy cập từ xa trong cụm
hệ thống; nút quay và chia sẻ màn hình trên thanh) bị ẩn, để mỗi điều chỉ hiện một lần
(`privacy-dot = pill | system | both`, mặc định `pill`).

## Keyline tint (viền 1 px của pill)

Chỗ duy nhất một app được đặt màu của mình (`keylineTint` của Apple): nó nói **ai** đang nói,
không bao giờ nói **chuyện gì** xảy ra (đó là việc của các slot).

| | Luật |
|---|---|
| mặc định | `rgba(255,255,255,0.12)`: idle luôn luôn, và activity có `keyline: null` |
| activity | adapter có thể đặt `keyline: '#1DB954'` (màu thương hiệu của app), chỉ trong compact và expanded của activity đó |
| idle plan | không được đặt |
| nhiều pill | mỗi pill mang keyline riêng |
| màu ảnh bìa | nếu sau này thêm (đã hoãn), nó cấp màu cho keyline, không bao giờ cho nền |
| màu trạng thái | hổ phách, đỏ, tím, xanh lá là của các slot; không bao giờ là keyline (`kit/model/palette.js` STATE_COLOURS) |
| setting (dự kiến, chưa có key) | `keyline = brand \| none`, mặc định `brand`; `none` = pill đen trơn như iOS |
| màu nhấn của theme | không bao giờ là keyline (nó sẽ kéo mắt cả ngày); chỉ dùng cho vòng focus bàn phím (`Super+B`, SPEC §2c), như GNOME; khi có vòng focus thì viền là màu nhấn và keyline chờ (2026-11-04) |
| chuyển động | không ease (St không làm được); đổi cùng lúc với nội dung |

## Những gì KHÔNG phải chỉ báo

- Media đang phát, tiến trình (một vòng ở trailing): là activity, không phải slot.
- "Charging", "VPN on", "DND on": activity transient hoặc icon trong cụm hệ thống, không bao giờ
  là đèn. Màu thứ tư là một thay đổi SPEC, không phải quyết định của module.

## Bố cục

```
[● ] [leading] [text ………………] [trailing] [ ●]
 light  icon/art  main line     glyph/ring   dot
 (left slot)  ←── adapter / idle plan ──→  (right slot)
```

Các slot là hai đầu của pill 1 (2026-11-10, design/pill "Đèn ở hai đầu"): một chấm 8 px nằm giữa
mỗi đầu tròn; pill lớn ra ở cả hai đầu bằng bán kính đó cộng nửa chấm (20 ở 1×), nên các vùng
không bao giờ dịch chỗ; đầu tròn đã tính cả đèn. `kit/ui/pill.js` vẽ chúng; adapter và idle plan
không vẽ được. Pill phụ, compact, card và expanded không có.

## Trợ năng

Màu không bao giờ là kênh duy nhất: compact gọi tên trạng thái ("2 missed", "Waiting: Claude
Code wants to run `git push`"), và hàng trên Home nêu tên app đứng sau chấm. Tương phản cao nâng
viền và chữ phụ (design/colours "Tương phản cao"); đèn và chấm giữ màu, mỗi màu ≥ 3:1 trên nền
đen.
