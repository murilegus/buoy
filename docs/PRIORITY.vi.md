# Thứ tự pill — activity nào là pill 1

Activity nào chiếm chỗ giữa, activity nào sang pill phụ và activity nào chờ sau `+N`. Một luật,
trong `kit/model/stack.js`, để không module nào phải đoán số (2026-11-07, Ethan). SPEC §2 và
§2c trỏ tới đây.

## Nguyên tắc

1. **Trạng thái trước kind.** Thứ cần bạn, rồi thứ đang chạy, rồi thứ chỉ đang chờ. App chỉ quan
   trọng khi cùng một trạng thái.
2. **Adapter nói trạng thái, không nói con số.** Một module đánh dấu activity `needsYou` hoặc
   `linger`; kit xếp hạng. Một trường hợp đứng thay (2026-11-08, Ethan): khi câu hỏi của một
   agent nằm trong card riêng của Claude (một prompt Buoy không vẽ), pill của phiên đó lấy độ ưu
   tiên của `ask`.
3. **Khoảnh khắc không phải thứ hạng.** Feedback (phản hồi cho việc bạn vừa làm), một alert, một
   ask đang mở phủ lên thứ tự; sau chúng thứ tự vẫn như cũ.

## 1. Thứ tự

Mọi activity đang hiện được xếp theo, lần lượt:

1. **Bậc của nó** (§2): cần bạn › đang chạy › đang chờ.
2. **Độ ưu tiên của nó** trong bậc: của kind (§3), hoặc của profile người dùng hay của bên gọi
   D-Bus.
3. **Còn mới trước stale**: activity đã quá `staleAfter` đứng sau activity chưa quá.
4. **Gần đây nhất trước**: activity được surface sau cùng. Một activity đổi trạng thái hẳn (agent
   dừng, player phát lại) được surface lại, nên được tính là mới.

Activity đầu tiên là pill 1, hai activity kế là pill phụ (SPEC §2c), còn lại là `+N`. Không gì
khác xếp thứ tự pill.

## 2. Bậc

| Bậc | Cờ | Gồm những gì |
|---|---|---|
| **1. Cần bạn** | `needsYou: true`; kind `ask` và `call` luôn luôn | một yêu cầu cấp quyền, một `Ask()` qua D-Bus, một cuộc gọi, một agent đang chờ bạn (`turn`) hoặc đang hỏi trong card của Claude (90 của ask, 2026-11-08) |
| **2. Đang chạy** | không cờ nào | nhạc đang phát, một timer, một lần truyền file, một agent đang làm việc, một thông báo, một thiết bị vừa cắm |
| **3. Đang chờ** | `linger: true`, **khi đã stale** | một player đang dừng, một agent đã xong hoặc dừng vì lỗi |

- **Activity đang chờ lùi lại khi nó mờ đi, không phải trước đó** (2026-11-07, Ethan): cho tới
  `staleAfter` nó được xếp như đang chạy, nên "Done" hay một bài vừa dừng giữ chỗ giữa một lúc,
  rồi mờ đi và rơi xuống bậc 3 trong một lần đổi. Activity đang chờ dùng `staleAfter` **10 s**
  (`SETTLE_MS` trong `kit/model/activity.js`). Một activity đang chạy mà thành stale (một agent
  không có tin trong 1 min) vẫn ở bậc 2, sau các activity còn mới (§1.3).
- `needsYou` thắng `linger`: một agent đang chờ bạn vẫn kết thúc sau `activity-linger` không có
  tin (SPEC §2) nhưng nằm ở bậc 1.
- Không độ ưu tiên nào, dù cao đến đâu, đưa được một activity sang bậc khác.

## 3. Độ ưu tiên trong một bậc

Mặc định của kind (`kit/model/activity.js` `PRIORITY`):

| Kind | Độ ưu tiên | | Kind | Độ ưu tiên |
|---|---|---|---|---|
| `media` | 10 | | `screen` | 55 |
| `timer` | 20 | | `osd`, `input` | 60 |
| `calendar` | 25 | | `notification` | 70 |
| `progress`, `print` | 30 | | `phone` | 75 |
| `device`, `bluetooth`, `usb`, `network`, `agent` | 35 | | `greeting` | 85 |
| `power` | 40 | | `ask` | 90 |
| `copied` | 45 | | `call` | 95 |
| `attention`, `terminal` | 50 | | | |

- Một **profile** (PROFILES.md) có thể đặt `priority` 0–100: nó chỉ di chuyển app trong bậc của
  nó.
- Một **bên gọi D-Bus** (DBUS.md) có thể gửi `priority` theo cùng cách, và `needsYou` / `linger`
  để chọn bậc (`Version` 3).
- Adapter không đặt `priority`.

## 4. Lớp phủ — khoảnh khắc nằm trên thứ tự

| Lớp phủ | Làm gì | Bao lâu |
|---|---|---|
| Feedback (`osd`, `input`, `copied`) | phủ pill 1 tại chỗ; activity bị phủ giữ slot của nó (SPEC §2e, `pillWindow`) | ttl của nó, ~1.5 s; không bao giờ phủ lên một `ask` |
| Alert | đưa một activity chưa hiện ra giữa | 5 s (`ALERT_MS`), lâu hơn khi được hover |
| Ask / transient mở ra | ask mở card của nó trên pill của nó (SPEC §2); transient mở expanded | tới khi được trả lời hoặc đóng; ask `quiet` không mở |

Chúng đổi thứ được vẽ trong một lúc, không đổi thứ hạng.

## 5. Không thuộc thứ tự

- Không bao giờ được vẽ, nên không bao giờ được xếp: `apps-hidden`, `hidden` riêng của một
  activity (phiên của một agent nằm sau prompt của nó), một ask đã dismiss vào đèn đỏ.
- Activity hẹn giờ: được xếp khi bắt đầu.

## 6. Thay đổi so với trước

*Làm 2026-11-07* trong `kit/model/stack.js` (§1), `kit/model/activity.js` (`needsYou`,
`SETTLE_MS`, bậc; stack vẽ lại khi stale), adapter agent (`turn` và phiên của prompt đặt
`needsYou`; xong thì `staleAfter` 10 s), adapter media (đang dừng thì `staleAfter` 10 s) và
source (§1.4), và D-Bus `Version` 3.

## 7. Test

- Bậc: một activity đang chờ 100 nằm dưới một activity đang chạy 10 khi đã stale, nằm trên trước
  đó; `needsYou` 10 trên một activity đang chạy 70; `needsYou` + `linger` ở bậc 1; một activity
  đang chạy đã stale vẫn ở bậc 2.
- Trong một bậc: độ ưu tiên, còn mới, mới nhất. Surface lại: player phát lại đứng trước player
  đang dừng; agent vừa dừng đứng trước agent dừng sớm hơn.
- Lớp phủ: feedback phủ pill 1 rồi trả lại; alert đưa lên giữa trong 5 s.
- Profile và D-Bus: `priority` chỉ di chuyển trong bậc.
