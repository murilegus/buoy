# Thông báo — thông báo của GNOME trên island

Thông báo của desktop trên Buoy: pill thay cho banner của GNOME, card của nó, Không làm phiền,
chia sẻ màn hình, tab Notifications, thông báo chụp màn hình của Shell. FEATURES M3
"notifications" trỏ tới đây. Quyết cùng Ethan, 2026-11-07; ba bước (§8). Nguồn Shell
(gnome-50): `ui/messageTray.js`, `ui/notificationDaemon.js`, `ui/messageList.js`,
`ui/status/doNotDisturb.js`, `ui/panel.js`.

## Nguyên tắc

1. **GNOME quyết, Buoy vẽ.** Một thông báo có được banner hay không (Không làm phiền, mức
   khẩn, toàn màn hình, màn hình khoá, công tắc "show banners" của app) là việc Shell quyết.
   Buoy hiện pill đúng ở chỗ GNOME sẽ hiện banner.
2. **Thông báo là của Shell, không bao giờ là bản sao.** Pill thao tác trên object thật, nên
   danh sách của GNOME và Buoy luôn khớp nhau. Buoy không tự đăng thông báo nào.
3. **Ngắn, trừ khi cần bạn.** Pill 1 trong vài giây; chỉ thông báo critical là ở lại.
4. **Không có gì riêng tư trên màn hình đang chia sẻ.** Pill nêu tên app, không nêu nội dung.

## 1. Chỗ Buoy tiếp quản

Các luật của GNOME trước banner giữ nguyên: `_onNotificationRequestBanner` bỏ một thông báo
đã xem, một thông báo `LOW`, và một thông báo mà app không được hiện banner
(`policy.showBanners`: Không làm phiền, công tắc của app) trừ khi critical; `_updateState` giữ
hàng đợi khi toàn màn hình hoặc bận, và không hiện gì khi không có
`sessionMode.hasNotifications` (khoá). Rồi `_showNotification()` dựng banner
(`_updateShowingNotification`: đã xem, âm thanh).

Khi `notification-replace-banners` bật, Buoy ghi đè `_showNotification` trên prototype
(`InjectionManager`, như module hud): mỗi banner thành một alert trên pill của app, kèm âm
thanh của nó. Chỉ đánh dấu đã xem (`acknowledged = true`) theo luật ở §2 (2026-11-12). Tắt:
banner của GNOME, không có pill (tab vẫn liệt kê tất cả, §6).

**Bị giữ, vẫn chưa xem** (2026-11-08): một thông báo đã chờ trong hàng đợi của Shell (≥ 2 s,
đóng dấu ở `queue-changed`; toàn màn hình, bận, khoá) hiện thành pill kèm âm thanh khi màn
hình trở lại, nhưng vẫn chưa xem: nhìn thoáng 3 s không phải là một banner chờ bạn. Nhỡ (§6).

**Sau màn hình khoá** (2026-11-13): Buoy tắt khi khoá, và lúc mở khoá Shell cập nhật khay thông báo
trước (`ui/messageTray.js` `_sessionUpdated` chạy ngay, `ui/extensionSystem.js`
`_sessionUpdated` async). Nên khi enable (cả sau đăng nhập) Buoy đóng dấu hàng đợi là đã chờ
và gỡ banner đang hiện (`_notificationRemoved`, vẫn giữ thông báo), đánh dấu chưa đọc và cho
nó chạy qua phần ghi đè một cách lặng lẽ: bị giữ, chưa xem, đèn hổ phách, không có card. Một
thông báo critical (`notify-send -u critical`, GTK `urgent`) được card ở lại kèm nút
(2026-11-13, Ethan).

Đã loại: `Main.messageTray.bannerBlocked` (Shell đặt lại nó mỗi khi menu ngày đóng,
`ui/panel.js`; khi bị chặn, hàng đợi chỉ đầy lên).

Cập nhật đến cùng một đường: daemon freedesktop đặt `acknowledged = false` khi có
`replaces_id`; một thông báo GTK cùng id thay object cũ. Pill cập nhật theo.

## 2. Pill

M4 "Notifications as alerts" (2026-11-12, Ethan; [Thiết kế](design/index.vi.md), alerts and
asks):

- **Một alert, như banner của GNOME 50** (`_showNotification`, `_expandBanner`): card (§3)
  trên pill của app trong 5 s, nút chỉ hiện dưới con trỏ (`actionsOnHover`); rồi về pill.
  Critical: nút hiện ngay, card ở lại (`alertStays`).
- **Chỉ tính là đã xem khi bạn có mặt**: card có đủ 5 s trong lúc bạn có mặt, hoặc bạn đã
  hover hay click nó (kit `onSeen`). Có mặt = có thao tác trong giây vừa qua (`IDLE_TIME` của
  Shell; `kit/services/presence.js`). Card đến khi bạn đang idle thì chờ và bắt đầu 5 s ở
  thao tác kế tiếp của bạn (`add_user_active_watch`); nó đóng lại, thành nhỡ, khi session
  chuyển sang idle (`idle-delay`, org.gnome.SessionManager.Presence) hoặc khoá. Vắng mặt hoặc
  đang khoá: không có card.
- **Nhỡ** (đèn hổ phách): mọi thông báo chưa xem — card bị cắt ngang, không có card, bị giữ
  (§1), Không làm phiền.
- **Một loạt** (`adapter.js` `Turns`): card theo thứ tự đến; các thông báo liên tiếp của cùng
  một app là một lượt ("Slack · 4 messages"). Mỗi lượt ≥ 1 s (`ALERT_TURN_MS`), lượt cuối 5 s;
  tối đa 2 lượt chờ (`MAX_NOTIFICATIONS_IN_QUEUE` của Shell = 3), số còn lại chỉ có pill.
  Critical đi trước, không bao giờ bị thay. Card cross-fade giữa các lượt (100 ms ra, 200
  vào); các pill phía sau giữ chỗ, rồi mỗi app một pill, mới nhất trước.
- **Hover** tạm dừng một loạt: nút hiện, tính là đã xem, cùng app thì tăng số đếm; chạy tiếp
  200 ms sau khi rời chuột (`HIDE_TIMEOUT` của Shell). Card mở ra dưới con trỏ đang đứng yên
  thì chưa tính là hover cho tới khi con trỏ rời đi rồi quay lại
  (`_onNotificationHoverChanged`). Click mở app, × bỏ thông báo; loạt vẫn tiếp tục.
- **Khi chia sẻ hoặc quay màn hình** (§5): một thông báo là một card nêu tên app; từ thông báo
  thứ hai, **một compact** (`sharedBurst`: logo xếp chồng, "6 new notifications", "Slack 3 ·
  Telegram 2 · Gmail 1"), 5 s, số đếm tăng; không có nút, click không làm gì, × đóng; app nào
  cũng giữ pill của mình. Tất cả là nhỡ.

Mỗi app một pill (desktop id, nếu không thì tên được gửi; không theo `Source`, vì notify-send
tạo mỗi process một source); thông báo mới thay nội dung của pill.

| Phần | Hiện gì |
|---|---|
| leading | icon của app (`icon` của source) |
| chữ | tiêu đề của thông báo; tên app khi không có tiêu đề |
| trailing | số thông báo nó đã hiện mà còn trong danh sách của GNOME, từ 2 trở lên |

- **Bao lâu:** card 5 s, rồi pill 3 s (`TTL` 8 s; 2026-11-16, Ethan), giữ nguyên khi card
  hoặc con trỏ đang ở trên nó; thông báo mới thì đếm lại.
- **Critical** (`Urgency.CRITICAL`): không có ttl, `needsYou` (bậc 1, PRIORITY.md §2) cho tới
  khi được kích hoạt, bị bỏ hoặc bị rút lại.
- **Độ ưu tiên:** 70 của kind; profile có thể dời nó.
- **Click:** `notification.activate()`, như banner của GNOME
  (`NotificationMessage.vfunc_clicked`). Kit `pressFirst`: không bao giờ mở tab trước.
- **Rời khỏi danh sách** (được kích hoạt, bị bỏ, bị rút, bị thay): hiện thông báo trước đó
  của app, hoặc kết thúc. Bản thay của GTK đến trong lời gọi kết thúc của bản cũ, nên pill
  chờ lời gọi đó xong (không chớp).
- **Toàn màn hình:** không có pill khi bị ẩn; sau đó hàng đợi hiện thành các pill chưa xem,
  không có card (§1).
- **Đèn hổ phách** (2026-11-08, Ethan): bật khi danh sách của GNOME còn thông báo chưa xem —
  `unseenCount` trừ hàng đợi, như menu ngày (`ui/dateMenu.js`
  `MessagesIndicator._updateCount`). Tắt khi đã xem (tab, danh sách của GNOME), không tắt khi
  Home hiện. Source bật cờ (`stack.flagMissed`, tách khỏi lịch sử nhỡ của stack) với một hàng
  Missed trên Home "Notifications · 3", các app, mở tab (`adapter.js` missedRow, 2026-11-12,
  design/home). Vẫn bật trong lúc Không làm phiền, khác với chấm của GNOME.

## 3. Compact (hover): một card

Compact của một thông báo là một **card** (2026-11-07, Ethan: "at least like GNOME's banner"
— ít nhất phải bằng banner của GNOME), hình dạng kit `compact.card`
(`kit/model/presentation.js` planCard, `kit/ui/present/compact.js`), §7 cũng dùng. Bố cục:
design/compact "Card thông báo" (2026-11-12) — phần đầu (ảnh 40, logo app ở góc ảnh, người
gửi trên "App · time", × tròn 32), nội dung rộng hết (2 dòng 16), nút cách mép 12; cao 104 khi
không có nút, 136 / 152 khi có; rộng bằng compact, ≤ 160.

| Phần | Hiện gì |
|---|---|
| header | icon app, tên, thời gian đã trôi ("now", "3 min", "1 h"; đọc lại mỗi phút khi đang hiện), × |
| ảnh | ảnh của thông báo (avatar, thumbnail; bo góc như ảnh bìa), nếu không thì icon riêng của nó; nếu không thì không có gì |
| tiêu đề | một dòng; nếu không thì phần đầu của body; nếu không thì tên app |
| body | bỏ markup, xuống dòng, ≤ 2 dòng, rồi … |
| action | của chính app, ≤ 3 theo thứ tự của app, rộng bằng nhau; không có thì không có hàng |

- Click bất cứ đâu trừ nút thì kích hoạt nó (§2). × là `destroy(DISMISSED)`, cũng mất khỏi
  danh sách của GNOME.
- Một nút chạy `Action.activate()` (kèm activation token); thông báo biến mất trừ khi
  `resident`. **Reply** mở app: Shell 50 không có trả lời tại chỗ (spec freedesktop không có
  ô nhập chữ), nên Buoy cũng không.
- Nhiều hơn ba action: ba cái đầu; danh sách của GNOME và tab có đủ.

## 4. Không làm phiền

Công tắc của GNOME (`org.gnome.desktop.notifications show-banners` false,
`ui/status/doNotDisturb.js`): tất cả ở lại trong danh sách, không có banner trừ khi critical.
Buoy theo nó (§1): không có pill; critical vẫn có pill `needsYou`. Công tắc nằm trong tab
(§6). Đèn đỏ cho một `ask` trong lúc đó: SPEC §2a-i.

## 5. Riêng tư

- **Khi chia sẻ hoặc quay màn hình** (`ui/status/remoteAccess.js` ScreenSharingIndicator /
  ScreenRecordingIndicator `visible`, qua `kit/services/sharing.js`): chữ trên pill là tên
  app; header của card giữ nguyên, tiêu đề "New notification" ("N notifications"), không có
  body hay ảnh; action vẫn còn (label của app). Từ thông báo thứ hai, một compact (§2), chưa
  xem. Chỉ theo dõi khi có pill thông báo đang hiện; thay đổi thì vẽ lại ngay.
- **Profile** (PROFILES.md): `hideBody` bỏ body; `skip` bỏ pill (danh sách của GNOME vẫn
  giữ, không có banner).
- Màn hình khoá: không banner, không pill (§1).

## 6. Tab Notifications (bước 2)

Chính thông báo của Shell (`Main.messageTray.getSources()`, `notifications` của mỗi source),
cập nhật trực tiếp qua `source-added` / `source-removed` / `notification-added` /
`notification-removed` khi đang mở; Buoy không có kho riêng. Card xếp thành chồng theo app
(2026-11-07, Ethan).

- **Icon:** cái chuông của GNOME với một chấm ở góc trên bên phải khi danh sách không trống
  (2026-11-08, Ethan), do kit vẽ (`badge()` của module, `kit/model/tabs.js`): màu xám của icon
  (trắng trên tab đang mở; không có hổ phách), viền bằng màu của dải tab, giống
  `message-indicator-symbolic` của Yaru nhưng không phải icon đó (một kiểu trên mọi theme).
  Đọc khi dải tab được sắp xếp; hỏi lại sau Clear hoặc ×.
- **Thanh:** "N missed" (hổ phách, có chấm), "N notifications", một chip Không làm phiền (màu
  nhấn khi bật; `show-banners` đảo ngược, đồng bộ với quick toggle), Clear. Màn hình app: ‹ app
  · N (quay lại), Dismiss all.
- **Mỗi app một chồng**, mới nhất trước: card mới nhất của app, một hoặc hai lớp bên dưới, số
  đếm khi nhiều hơn. Click: nhiều cái → màn hình của app; một cái → click của card.
- **Card:** ô #1c1c1e, r 16: logo 32, "app · time" (đọc lại mỗi phút) trên một tiêu đề đậm và
  một dòng body, chấm hổ phách khi chưa xem. Hover hoặc focus: hai action đầu và × thay cho số
  đếm; × của một chồng bỏ hết thông báo của app đó. Click hoặc action thì kích hoạt và đóng
  island (SPEC §3).
- **Icon** (2026-11-07, Ethan): các chồng hiện logo của app; màn hình app hiện ảnh của thông
  báo (`image-data` / `image-path`, icon bytes của GTK), nếu không thì icon riêng của nó nếu
  khác, nếu không thì logo.
- **Nhỡ khi vắng mặt:** `acknowledged` false (Không làm phiền, hàng đợi đầy, bị giữ, §1). Mở
  tab đánh dấu chúng là đã xem (như `ui/messageList.js` `vfunc_map`); chấm của chúng còn tới
  khi tab đóng. Thông báo đến khi tab đang mở là đã xem, không có pill. Thông báo không bao
  giờ vào lịch sử nhỡ của stack; Missed của Home giữ các kind khác (2026-11-07, thay cho kế
  hoạch 2026-11-03 ở SPEC §3).
- **Bỏ thông báo đồng bộ hai chiều:** × huỷ (DISMISSED); bị bỏ hoặc rút trong GNOME thì rời
  tab ngay. **Clear** huỷ tất cả (`ui/messageList.js` clear()).
- **Trống:** Bu ngủ trên dòng "All caught up" (kit EmptyState), chip Không làm phiền ở trên.
- **Khi chia sẻ:** "New notification", không có ảnh (§5).

## 7. Thông báo chụp màn hình của Shell (bước 3)

"Screenshot captured" / "Screencast recorded" (`ui/screenshot.js` `_storeScreenshot`) là
thông báo bình thường: pill "Screen Capture", card có thumbnail (`gicon`), "Show in Files",
click mở file. Không ghi đè (2026-11-08, Ethan). Đã loại: pill ~3 s, thumbnail ở minimal,
Delete.

**Thông báo tạm thời đi khi pill của nó kết thúc.** Shell gửi cả hai với
`isTransient: true`, và GNOME huỷ loại thông báo này khi banner của nó ẩn đi
(`_hideNotificationCompleted`: EXPIRED). Nên stack gọi `onExpire()` khi ttl kết thúc activity
(không bao giờ ở `end()`) và source huỷ các thông báo tạm thời của app (EXPIRED); cũng vậy với
hint `transient` của freedesktop. Hover giữ cả hai. Không bao giờ thành nhỡ.

## 8. Các bước

1. **Pill** (merge 2026-11-07, #143): §1–§5; `notification-replace-banners`.
2. **Tab** (merge 2026-11-08, #144): §6.
3. **Thông báo chụp màn hình** (2026-11-08): §7.

## 9. Setting

| Key | Mặc định | |
|---|---|---|
| `modules-notification` | on | module: pill và tab |
| `notification-replace-banners` | on | banner của GNOME thành pill; tắt thì GNOME hiện banner của mình và Buoy chỉ liệt kê |

## 10. Thông báo mà module khác hiện

"N file operations active" / "All file operations have been completed" của Files (id GTK
`progress`, `transfer-complete`) là pill Transfers (FEATURES M3 "progress"): khi module
progress bật, không có pill hay banner; tắt thì như mọi thông báo.

Thông báo của chính Claude (2026-11-13, Ethan): đăng theo session ("Buoy — Implementation")
khi một lượt kết thúc hoặc chờ. Nếu app id của nó là Claude và có một agent activity mang tên
session đó trên island (`stack.find`, adapter.js `agentShows`): không có pill, đánh dấu đã đọc
(không hổ phách); danh sách của GNOME vẫn giữ. Các thông báo Claude khác như mọi thông báo.

## 11. Test

- `tests/notification.test.js`: fallback tiêu đề / tên app; số đếm từ 2; critical →
  `needsYou`, không có ttl; bỏ markup, khoảng trắng về một dòng; ≤ 3 action rồi ×, không có →
  chỉ ×; chia sẻ → tên app, không ảnh, dòng số đếm; `hideBody`; chữ dài không bị cắt; id của
  Files chỉ bị bỏ qua khi progress bật; `agentShows`.
- Headless Shell: `notify-send` có action và critical; app GTK (`gapplication`); click kích
  hoạt; × bỏ khỏi danh sách của GNOME; thay theo id; Không làm phiền → không có pill, critical
  vẫn có; setting tắt → banner của GNOME; disable → không còn gì, `_showNotification` gốc trở
  lại.
