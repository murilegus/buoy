# Lời chào — Bu chào, chào mừng trở lại và hẹn gặp lại

Mọi lúc Buoy tự lên tiếng: khi nào, nói gì, cỡ nào, bao lâu, dáng nào (SPEC §2d).
Một thời điểm, câu chào hay ngày lễ mới thì sửa file này trước. Quyết cùng Ethan, 2026-11-06.

## Nguyên tắc

1. **Theo thời điểm, không theo ngày.** Chào ở mỗi sự kiện (bật máy, thức dậy sau ngủ lâu, đăng
   nhập, kết thúc phiên). Không có luật mỗi ngày một lần.
2. **Ngắn và có ích.** Một điều thân thiện, nhiều nhất hai điều có ích (giờ và ngày, thời tiết
   hoặc mang ô). Không bao giờ hỏi xin gì.
3. **Đúng cỡ.** Một dòng ngắn → minimal; hai ý, hoặc một dòng quá dài cho pill 1 lúc nghỉ →
   compact. Expanded chỉ cho lần bật máy mới (§2).
4. **Không cản đường.** Một activity transient (SPEC §2, CONTRACT.md §1): không đè lên cửa sổ toàn
   màn hình, không bao giờ chiếm bàn phím, activity thật nào cũng cắt ngang nó, bấm ra ngoài thì đóng.
5. **Bu là gương mặt.** Mọi lời chào mở đầu bằng Bu, dáng theo từng thời điểm (§6). Không icon nào khác.
6. **Chữ ở một chỗ.** Mọi chuỗi nằm trong `modules/greeting/adapter.js` (thuần), tiếng Anh
   trước; ngôn ngữ khác qua gettext (M5).
7. **Gõ dần** (2026-11-08, Ethan). Chữ hiện từng ký tự một trên một timer, gỡ khi xong, khi đóng
   và khi disable. `enable-animations` tắt → hiện cả một lần. Hover giữ lời chào lại; chữ vẫn gõ
   tiếp.

## 0. Phạm vi theo bản phát hành

- **v0.1** (FEATURES M3 "greeting: first run and What's new", 2026-11-08, Ethan): chỉ §11.
  §1–§10 là M4 "greeting". Mỗi bản phát hành thêm ghi chú của nó vào What's new (§11).
- **M4 chia ba phần** (2026-11-25, Ethan; design/expanded "Lời chào"), cả ba trong 2026-11-26:
  (1) §1, §3 luật 3–6, §4–§6, prefs `greeting-style`, `greeting-farewell`, `greeting-name`;
  (2) thời tiết và mưa (§8), client chuyển vào kit; (3) ngày đặc biệt và sinh nhật (§7, §3
  luật 2a–2b). Dòng 3 chỉ có chữ (vùng center của expanded không có icon cho từng dòng). Đăng
  nhập lại nói sinh nhật như một dịp ăn mừng; sinh nhật là tháng và ngày trong prefs.

## 1. Các thời điểm

| Thời điểm | Nhận biết bằng | Cỡ | Ở lại |
|---|---|---|---|
| **Bật máy** (Start) — máy đã tắt hoặc khởi động lại | `/proc/sys/kernel/random/boot_id` khác `greeting-boot` | expanded (§2) | ~8 s, giữ khi hover; Bu vẫy tay 5 s |
| **Thức dậy** (Wake) — trở lại sau khi ngủ (sleep hoặc hibernate) từ 3 giờ trở lên | thời gian ngủ từ lần disable trước ≥ 3 giờ (dưới) | expanded (§2) | như Bật máy |
| **Đăng nhập lại** (Welcome back) — một lần đăng nhập mới, cùng lần bật máy | phiên logind khác `greeting-session`, cùng lần bật máy | minimal, hoặc compact khi có ghi chú (§4) | 4 s, giữ khi hover |
| **Rời đi** (Leaving) — tắt máy, khởi động lại hoặc đăng xuất từ hộp thoại của Shell | `Main.endSessionDialog` `_confirm(signal)` (dưới) | minimal, hoặc compact khi có ghi chú (§5) | đến khi phiên kết thúc (~1.5 s) |
| Khoá màn hình, ngủ ngắn, tắt rồi bật lại extension | — | không gì | — |
| Một cửa sổ toàn màn hình đang có focus | `global.display.focus_window.is_fullscreen()` | không gì (không thử lại) | — |
| `greeting-style = off` | — | không gì; Rời đi theo `greeting-farewell` | — |

Tất cả đọc lúc `enable`, không poll gì:

- **Lần bật máy.** `boot_id` mới mỗi lần bật máy (thời điểm bật máy vẫn giữ qua hibernate). Lưu
  một lần khi một lời chào Bật máy đã hiện.
- **Phiên.** `misc/loginManager.js` `getCurrentSessionProxy` `Id` (dự phòng
  `XDG_SESSION_ID`).
- **Ngủ.** Shell disable extension khi khoá, enable khi mở khoá (không có `session-modes`,
  `ui/extensionSystem.js`); suspend thì khoá trước. Thời gian ngủ từ lúc bật máy = `CLOCK_BOOTTIME −
  CLOCK_MONOTONIC` (`/proc/uptime` trừ `GLib.get_monotonic_time()`), `disable` lưu vào
  `greeting-asleep` (s), `enable` đem ra so. Suspend và hibernate tính như nhau. 3 giờ, cố định.
- **Rời đi.** `ui/endSessionDialog.js` đóng hộp thoại, rồi gọi `_confirm(signal)`
  (`ConfirmedLogout`, `ConfirmedShutdown`, `ConfirmedReboot`; `_type` cho biết khởi động lại để
  cập nhật). Buoy bọc `_confirm` (InjectionManager), hiện câu chào, chạy bản gốc không đổi gì.
  Không có hộp thoại (nút nguồn, `systemctl poweroff`, crash) → không gì.
- **Cài lần đầu.** `greeting-intro-shown` false → lần Bật máy hoặc Thức dậy kế tiếp là lời giới
  thiệu (§3 luật 1); từ v0.1 đó là lần chạy đầu của §11, ở lần enable đầu tiên.

## 2. Bật máy và Thức dậy: lời chào expanded

```
┌──────────────────────────────────────────────────────────────────┐
│        Good morning, Ethan.                                      │
│ [Bu]   It's 07:42 on Friday, 6 November 2026.                    │
│        ☁ Ho Chi Minh City: 28 °C, partly cloudy, light breeze.   │
└──────────────────────────────────────────────────────────────────┘
 leading   center (grows)
```

- **Bố cục** (2026-11-07, Ethan; CONTRACT.md §2): Bu ở `leading`, các dòng ở `center`
  (`grow: 'center'`), không có `trailing`. Bu cao bằng khối chữ (80 px cho ba dòng, 60 cho
  hai) và căn giữa theo nó. Độ rộng như mọi activity (SPEC §4).
- **Dòng 1**: câu chào (§3), là tiêu đề expanded, lớn hơn các tiêu đề khác.
- **Dòng 2**: "It's 07:42 on Friday, 6 November 2026." (`clock-format`; ngày dạng dài của
  locale). Một ngày kỷ niệm (§7) thêm "Today is Teachers' Day." vào sau; dài quá → nó chiếm dòng 3
  và dòng thời tiết bị bỏ.
- **Dòng 3**: dòng thời tiết hoặc mang ô (§8). Chưa có → bỏ đi (Bu 60 px), điền vào chỗ nếu
  tới sau; source chờ ~3 s trước đã.
- **Lời giới thiệu** (cài lần đầu): các dòng của §11, không có dòng 3.
- **Thời gian.** ~8 s, giữ khi hover (SPEC §2e); bấm ra ngoài thì đóng; Esc không làm gì.
- `greeting-style = minimal`: chỉ dòng 1 trong 4 s (compact khi có ghi chú, như Đăng nhập lại).

## 3. Dòng 1: câu chào nào

Luật đầu tiên khớp thì thắng. `name` là `greeting-name`, hoặc `GLib.get_real_name()`, hoặc tên
người dùng.

| # | Khi nào (giờ địa phương lúc đó) | Dòng 1 | Bu |
|---|---|---|---|
| 1 | Cài lần đầu (`greeting-intro-shown` false) | "Hi, I'm Bu." | wave |
| 2a | **Sinh nhật** (`greeting-birthday` = `MM-DD` của hôm nay) | "Happy birthday, {name}!" | party |
| 2b | **Một dịp ăn mừng** (§7, kind `celebrate`) | câu của nó, vd. "Merry Christmas, {name}!" | party |
| 3 | Từ 01:00 đến đầu buổi dawn (`daypart-starts`) | "Still up, {name}? Don't stay too late." | wave |
| 4 | Thứ Hai, dawn hoặc morning | "New week, {name}." | wave |
| 5 | Thứ Bảy, từ dawn đến noon | "Happy Saturday, {name}." | wave |
| 5 | Chủ nhật, từ dawn đến noon | "Easy Sunday, {name}." | wave |
| 5 | Thứ Bảy hoặc Chủ nhật, từ afternoon đến night | "Enjoy your weekend, {name}." | wave |
| 6 | Còn lại, theo buổi (`kit/model/daypart.js`) | dawn, morning → "Good morning, {name}." · noon → "Good day, {name}." · afternoon → "Good afternoon, {name}." · evening → "Good evening, {name}." · night → "Still up, {name}?" | wave |

Ngày kỷ niệm (§7) không bao giờ chiếm dòng 1; chúng nằm ở dòng 2.

## 4. Đăng nhập lại

| Khi nào | Tiêu đề | Phụ đề (→ compact) | Bu |
|---|---|---|---|
| Một lần đăng nhập mới trong cùng lần bật máy | "Welcome back, {name}." | — | wave |
| … và sắp mưa (§8) | "Welcome back, {name}." | "Rain around 17:00, take an umbrella." | wave |
| … vào một dịp ăn mừng | câu của nó (§7) | — | party |

## 5. Rời đi

Luật đầu tiên thắng cho tiêu đề; nhiều nhất một phụ đề, mưa trước.

| # | Khi nào | Tiêu đề | Bu |
|---|---|---|---|
| 1 | Khởi động lại để cập nhật (hộp thoại loại `UPDATE_RESTART`, hoặc ô cài cập nhật được tick) | "Updating. Back in a moment." | busy |
| 2 | Khởi động lại | "Be right back." | wave |
| 3 | Đăng xuất | "Catch you later, {name}." | wave |
| 4 | Tắt máy vào buổi tối của một dịp ăn mừng (§7) | câu của nó, vd. "Merry Christmas, {name}." | party |
| 5 | Tắt máy, thứ Sáu từ afternoon đến night | "Have a good weekend, {name}." | done |
| 6 | Tắt máy, evening hoặc night | "Good night, {name}." | sleep |
| 7 | Tắt máy, còn lại | "See you soon, {name}." | wave |

| Phụ đề (→ compact) | Khi nào |
|---|---|
| "Rain around 17:00, take an umbrella." | tắt máy hoặc đăng xuất, mưa trong 3 giờ tới, trước buổi tối (§8) |
| "Long day. Rest well." | tắt máy sau hơn 10 giờ thức trong lần bật máy này (`/proc/uptime` trừ thời gian ngủ) |

## 6. Cỡ và Bu

| Cỡ | Khi nào | Bu | Chữ |
|---|---|---|---|
| **minimal** | một dòng tối đa ~24 ký tự (vừa pill 1 lúc nghỉ) | 20 px | dòng đó |
| **compact** | một tiêu đề và một phụ đề, hoặc một dòng quá dài cho minimal | 40 px | tiêu đề trên phụ đề |
| **expanded** | Bật máy và Thức dậy (§2), trừ khi `greeting-style = minimal` | 80 / 60 px, ở `leading` | ba hoặc hai dòng ở `center`, vùng này giãn ra |

Dáng (MASCOT.md § Poses): `wave` 5 s (Ethan, 2026-11-06), rồi `idle`; `party` một lần, rồi
`done`; `sleep`, `done` đứng yên; `busy` lặp. Đèn của Bu là màu riêng của dáng (INDICATORS § Bu's
lamp).

## 7. Ngày đặc biệt

Một bảng có sẵn, chỉ là dữ liệu (ARCHITECTURE luật 7), `modules/greeting/holidays.js`, có test.

- **celebrate** — chiếm dòng 1 (§3 luật 2b), Bu `party`; cũng là tiêu đề Rời đi vào buổi tối hôm đó.
- **observe** — dòng 1 giữ nguyên; dòng 2 thêm "Today is {name}."

Vùng lấy từ **múi giờ**, không phải locale:
`GLib.TimeZone.new_local().get_identifier()`, vd. `Asia/Ho_Chi_Minh` (hoặc `Asia/Saigon`) →
Việt Nam. `greeting-holidays`: `auto` (toàn cầu + vùng) · `global` · `off`. Thêm một vùng bằng
một PR kèm dữ liệu của nó.

| Vùng | Ngày | Kind | Câu |
|---|---|---|---|
| global | 1 tháng 1 | celebrate | "Happy New Year, {name}!" |
| global | 14 tháng 2 | observe | "Today is Valentine's Day." |
| global | 8 tháng 3 | observe | "Today is International Women's Day." |
| global | Easter Sunday (tính ra, computus theo lịch Gregory) | celebrate | "Happy Easter, {name}!" |
| global | 1 tháng 5 | observe | "Today is Labour Day." |
| global | Mother's Day, Chủ nhật thứ 2 của tháng 5 | observe | "Today is Mother's Day." |
| global | Father's Day, Chủ nhật thứ 3 của tháng 6 | observe | "Today is Father's Day." |
| global | 31 tháng 10 | celebrate | "Happy Halloween, {name}!" |
| global | 24 tháng 12 | celebrate | "Merry Christmas Eve, {name}!" |
| global | 25 tháng 12 | celebrate | "Merry Christmas, {name}!" |
| global | 31 tháng 12 | celebrate | "Last day of the year, {name}." |
| Vietnam | Tết, mùng 1–3 tháng Giêng âm lịch | celebrate | "Happy Lunar New Year, {name}!" |
| Vietnam | Rằm tháng Giêng, 15 tháng 1 âm lịch | observe | "Today is the First Full Moon Festival." |
| Vietnam | 27 tháng 2 | observe | "Today is Vietnamese Doctors' Day." |
| Vietnam | Giỗ Tổ Hùng Vương, mùng 10 tháng 3 âm lịch | observe | "Today is Hùng Kings' Day." |
| Vietnam | 30 tháng 4 | observe | "Today is Reunification Day." |
| Vietnam | Phật đản, 15 tháng 4 âm lịch | observe | "Today is Vesak." |
| Vietnam | 1 tháng 6 | observe | "Today is Children's Day." |
| Vietnam | 28 tháng 6 | observe | "Today is Vietnamese Family Day." |
| Vietnam | Vu Lan, 15 tháng 7 âm lịch | observe | "Today is Vu Lan." |
| Vietnam | 2 tháng 9 | observe | "Today is National Day." |
| Vietnam | Trung thu, 15 tháng 8 âm lịch | celebrate | "Happy Mid-Autumn, {name}!" |
| Vietnam | 20 tháng 10 | observe | "Today is Vietnamese Women's Day." |
| Vietnam | 20 tháng 11 | observe | "Today is Teachers' Day." |
| Vietnam | ông Công ông Táo, 23 tháng 12 âm lịch | observe | "Today is Kitchen Gods' Day." |

- **Ngày âm lịch** (2026-11-07, Ethan): ngày dương lịch cho 2026–2099 của mỗi dòng âm lịch (mùng 2
  và mùng 3 Tết tính theo; ông Công ông Táo rơi vào năm dương lịch sau), ~6 KB, sinh bằng tay với
  `gjs -m scripts/lunar.js --write` (UTC+7, thuật toán Hồ Ngọc Đức); không tính gì lúc chạy. Sau
  2099: bỏ qua. Mốc: Tết 2026 = 17 tháng 2.
- **Mother's Day và Father's Day** (2026-11-16, cùng các ngày kỷ niệm khác thêm khi đó): Chủ nhật
  thứ n, tính như Easter; là ngày Việt Nam và phần lớn các nước dùng (không phải ngày của Anh).
- **Hai dịp cùng một ngày**: sinh nhật › dịp ăn mừng › ngày kỷ niệm (vẫn ở dòng 2); hai ngày kỷ
  niệm: lấy cái của vùng (2026-11-16).
- Hiện lúc Bật máy, Thức dậy, Đăng nhập lại, và làm tiêu đề Rời đi cho các dịp ăn mừng.

## 8. Thời tiết

Từ client của chính GNOME, cái của date menu (`dateMenu.js` WeatherSection `_weatherClient`),
đọc qua các helper thời tiết dùng chung của kit (`kit/model/weather.js`, thuần; phía Shell
`kit/services/weather.js`) như plan thời tiết đọc, không qua module thời tiết (ARCHITECTURE
luật 1). Cùng nơi và đơn vị với plan (SPEC §2a, `org.gnome.GWeather4`).

- **Dòng**: "{place}: {temp} {unit}, {condition}, {wind}." — vd. "Ho Chi Minh City: 28 °C,
  partly cloudy, light breeze."; nơi gọi như date menu gọi, nhiệt độ làm tròn, tình trạng trời
  viết thường, gió theo thang Beaufort: 0 "calm", 1–3 "light breeze", 4–5 "breezy", 6+
  "strong wind".
- **Sắp mưa**: bây giờ đang khô, dự báo ướt (`isWet` của plan) trong 3 giờ tới → "Rain around
  17:00, take an umbrella." (tuyết: "Snow around 17:00, dress warm."; bão: "Storms around
  17:00, stay dry."), giờ ướt đầu tiên theo định dạng giờ của GNOME.
- **Không có dữ liệu**: không có dòng thời tiết, không nhắc mang ô, không bao giờ báo lỗi.

## 9. Setting

| Key | Kiểu | Mặc định | Prefs | Nghĩa |
|---|---|---|---|---|
| `modules-greeting` | b | true | Modules, nhóm Bu | module này |
| `greeting-style` | s | `expanded` | có | `expanded` · `minimal` · `off` — Bật máy và Thức dậy |
| `greeting-farewell` | b | true | có | các câu Rời đi (§5) |
| `greeting-name` | s | `''` | có, điền sẵn tên thật | `''` = tên thật |
| `greeting-birthday` | s | `''` | có, một tháng và ngày | `MM-DD`, `''` = không có |
| `greeting-holidays` | s | `auto` | có | `auto` · `global` · `off` (§7) |
| `greeting-intro-shown` | b | false | "Show Bu's introduction again" của About đặt nó về false (§11) | lời giới thiệu đã hiện một lần (§11) |
| `greeting-version-seen` | i | 0 | không (ghi sổ nội bộ) | phiên bản cuối mà What's new đã nói tới (§11) |
| `prefs-page` | s | `''` | không (ghi sổ nội bộ) | trang prefs cần mở, rồi xoá đi (`whats-new`, §11) |
| `greeting-boot` | s | `''` | không (ghi sổ nội bộ) | lần bật máy của lời chào Bật máy gần nhất |
| `greeting-session` | s | `''` | không (ghi sổ nội bộ) | phiên logind của lời chào gần nhất |
| `greeting-asleep` | i | 0 | không (ghi sổ nội bộ) | số giây đã ngủ từ lúc bật máy, ở lần disable gần nhất |

`greeting-last-day` (SPEC 2026-11-03) đã bỏ.

## 10. Code và test

- `modules/greeting/`: `index.js` (kind `greeting`); `adapter.js` (thuần: các dòng và cỡ từ
  `{moment, now, daypart, weekday, name, special?, weather?, rain?, longDay?, intro?}`);
  `holidays.js` (dữ liệu + hàm thuần `specialDay(date, region, birthday)`); `source.js` (§1, phần
  chờ thời tiết, phần inject vào `_confirm`).
- Kit: `kit/model/weather.js` / `kit/services/weather.js`, dùng chung với plan thời tiết
  (2026-11-26); một leading `{mascot}` ở expanded có thể cao bằng khối chữ (80 / 60 px, không phải
  50); một pill expanded vẫn báo hover cho stack.
- Test (`tests/greeting.test.js`): mọi dòng và độ ưu tiên của §3–§5, các buổi, cuối tuần, 01:00
  so với dawn, cỡ (24 ký tự; tên dài vẫn giữ nguyên, renderer cắt bằng dấu …), các trường hợp
  thời tiết và chữ Beaufort, ngày lễ (Easter 2026–2030, Mother's Day 2026 = 10 tháng 5, Father's
  Day 2026 = 21 tháng 6, các mốc âm lịch, thứ tự ưu tiên, `auto`/`global`/`off`, múi giờ → vùng);
  không có số đo trong đầu ra.
- Trong Shell (headless): giả lập từng thời điểm (`boot_id`, tổng thời gian ngủ, id phiên, lệnh
  confirm của hộp thoại), toàn màn hình, `off`, thời tiết điền vào chỗ, hover giữ lại, một
  activity thật cắt ngang.

## 11. Lần chạy đầu và What's new

*v0.1, 2026-11-08, Ethan.* Một cơ chế, đọc lúc `enable` và so với `version` trong `metadata.json`
(số nguyên của EGO):

| Trường hợp | Khi nào | Bu nói gì |
|---|---|---|
| **Lần chạy đầu** (First run) | `greeting-intro-shown` false (vừa cài mới) | lời giới thiệu: Bu là ai và cách dùng Buoy cơ bản — là "what's new" của v0.1, vì mọi thứ đều mới |
| **What's new** | `greeting-version-seen` nhỏ hơn phiên bản đang chạy, lời giới thiệu đã hiện | ghi chú của phiên bản đó: có gì mới, sửa gì |
| Không cái nào | phiên bản đã thấy rồi | không gì |

- **Khi nào.** Lần `enable` đầu tiên gặp trường hợp đó, khi island đã thấy được (không đè lên
  cửa sổ toàn màn hình: nó chờ; không bao giờ lúc đang khoá). Cả hai key được ghi một lần khi đã
  hiện; lần chạy đầu cũng đặt `greeting-version-seen`. Một bản cập nhật từ EGO rồi đăng nhập lại
  là một lần `enable` bình thường.
- **Dạng.** Transient expanded (nguyên tắc 4), Bu `wave` 5 s rồi `idle`, gõ dần (nguyên tắc 7).
  Giữ khi hover; ở lại đến khi đóng hoặc ~12 s sau khi dòng cuối đã hiện xong.
- **Các dòng của lần chạy đầu.** "Hi, I'm Bu." rồi mỗi dòng một điều cơ bản: hover để xem thêm;
  bấm để mở Home; phím tắt, `keybind-focus` của người dùng ("Super+B" mặc định; nói đúng như đã
  đặt, không có → bỏ dòng đó; 2026-11-08, Ethan); cuộn trên pill idle để xem nó còn hiện gì; ⚙
  trong Home để vào setting. Chữ chính xác ở `adapter.js`.
- **Các dòng của What's new.** "New in Buoy {version}" (`version-name` nếu `metadata.json` có,
  không thì số EGO ghi), rồi tối đa 4 dòng, cái mới trước, rồi các bản sửa; nhiều hơn → "…and
  more", mở prefs ở About → What's new (2026-11-08, Ethan). Ghi chú đóng gói sẵn, không bao giờ
  tải về: `modules/greeting/notes.js`, `{version, name, added: [], fixed: []}` cho mỗi bản phát
  hành. Không có mục → không nói gì, vẫn tính là đã thấy. Bỏ qua nhiều phiên bản: chỉ ghi chú mới
  nhất.
- **About → What's new** (2026-11-08, Ethan): một trang con, ghi chú của mọi phiên bản, mới nhất
  trước (của v0.1 là lời giới thiệu). Tiêu đề "Buoy 0.2 — this version", "Buoy 0.1 — 8 November 2026"
  (`date` trong notes.js, dữ liệu thuần để prefs import được). Để mở nó, phía Shell đặt
  `prefs-page` = `whats-new` và gọi `Main.extensionManager.openExtensionPrefs`; prefs hiện trang
  đó và xoá key (một cửa sổ đang mở cũng đi theo thay đổi). Dùng key, vì
  `OpenExtensionPrefs` chỉ chuyển tiếp `modal` (`js/dbusServices/extensions/extensionsService.js`).
- **About → "Show Bu's introduction again"** (2026-11-08, Ethan): đặt `greeting-intro-shown`
  về false; source thấy thay đổi, hiện lần chạy đầu ngay trong pill, đặt lại true.
  `greeting-version-seen` giữ nguyên.
- **Test.** Các trường hợp (mới, cập nhật, như cũ, hạ phiên bản → không gì, không có ghi chú);
  các dòng; giới hạn và "…and more"; các bước gõ và lúc kết thúc (thuần: chữ sau n ms); tắt hiệu
  ứng → hiện cả một lần.

### Một bản Buoy mới hơn

*2026-11-13, Ethan.* Bu báo khi có phiên bản mới hơn sẵn sàng, một lần cho mỗi bản phát hành,
như What's new (expanded, gõ dần, ~12 s). `greeting-updates` (mặc định bật, một hàng dưới
Greeting) tắt nó đi.

| Cài từ | Buoy biết bằng cách nào | Bu nói gì |
|---|---|---|
| extensions.gnome.org | Shell kiểm tra lúc bắt đầu phiên và mỗi ngày, tải bản cập nhật về (`ui/extensionDownloader.js` `checkForUpdates`), rồi đặt `hasUpdate` của Buoy và phát `extension-state-changed` (`notifyExtensionUpdate`). Buoy đọc cái đó: **không tự gửi request nào** | "A newer Buoy is ready." / "Log out and back in to use it." (Shell cài nó ở lần đăng nhập sau, `_installExtensionUpdates`) |
| `install.sh` | một GET tới `api.github.com/repos/murilegus/buoy/releases/latest`, **lệnh gọi mạng duy nhất Buoy thực hiện** (FEATURES M3) | "Buoy 0.2 is out." / "You have 0.1.1." / "Paste the command in a terminal to update." với **Copy command** (dòng `--update` của install.sh, vào clipboard) và **Release notes** (trang của bản phát hành, trong trình duyệt) |
| một bản checkout để phát triển (một link) | không gì | không gì |

- **Cài kiểu nào.** `install.sh` để lại một file rỗng `.check-updates` trong thư mục của
  extension; chỉ khi đó mới hỏi GitHub. Một bản cập nhật từ EGO thay cả thư mục, nên dấu này mất.
- **Khi nào.** Một lần `enable` không có lần chạy đầu hay What's new, sau khi Shell khởi động xong:
  `hasUpdate` trước; không thì, nếu có dấu, hỏi GitHub nhiều nhất mỗi ngày một lần
  (`greeting-update-checked`, epoch s; câu trả lời nào cũng tính, không có → hỏi lại ở lần enable
  sau). Không poll, không timer (luật 8).
- **Gửi đi**: request trần, user agent "Buoy". Buoy không bao giờ tự cập nhật (luật 7).
- **Đọc**: chỉ tag, dưới dạng version-name (một đến bốn số, `adapter.js` `versionName`); cái gì
  khác thì bỏ. Địa chỉ ghi chú được dựng từ nó, không bao giờ lấy từ mạng.
- **Một lần.** `greeting-update-told`: version-name (GitHub) hoặc `shell:<running version>`
  (Shell). Chờ hết toàn màn hình, như lời chào.
- **Test.** Tag và không phải tag; mới hơn/như cũ/cũ hơn ("0.10" sau "0.9"); mọi câu trả lời của
  GitHub; đến hạn hằng ngày và đồng hồ lùi lại; một lần cho mỗi bản phát hành từ cả hai nguồn; các
  dòng và nút.
