# Buoy — spec v0.1 (bản thử)

uuid `buoy@murilegus`. Mỗi dòng là một quyết định cho bản thử; dòng nào cũng có thể đổi sau khi
dùng thử.

## 0. Buoy là gì, và không là gì

**Một pill sống, không phải trợ lý trong notch.** Một pill nổi kiểu iPhone, phản ứng với những gì
hệ thống làm. Không phải chỗ để nói chuyện với AI, thả file hay duyệt công cụ. Expanded có thể chứa
vài tab công cụ (mặc định tắt, §2b); không gì trong pill đến từ chúng.

- Extension GNOME Shell thuần trên extensions.gnome.org; không daemon, không binary. `install.sh`
  (README) là cách duy nhất đi vòng EGO, từ một bản release trên GitHub.
- Không polling khi đóng, không blur, không gì chuyển động khi idle.
- Chỉ API của chính GNOME Shell cùng GLib/Gio/Soup.

**Ngoài phạm vi** (cần daemon, root hoặc một helper GTK): trợ lý giọng nói, kệ file, giới hạn sạc
pin, chạy hay cài phần mềm, mức dùng gói AI, lời bài hát khắp màn hình. Bên thứ ba có thể thêm
chúng qua D-Bus API; Buoy không bao giờ có daemon.

Liên quan: Isle (notch + trợ lý, daemon Rust), NexNotch, Islet (Quickshell), Notchy (macOS).

## 1. Bố cục thanh trên cùng

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▣ Firefox              ( ● 31° )              ◯ vi ▪   [ ᯤ ⌁ ▮ Fri 2:13 ]      │
│ left cluster           island (pill)          tray     system cluster          │
│ (bare; bg on hover)    idle: weather plan     (bare,   QS indicators + clock   │
│                                                each     (bare; bg on hover)     │
│                                                alone)                           │
└──────────────────────────────────────────────────────────────────────────────┘
  hover left:  [▣ Firefox · ⊞ 2]        hover pill: ( ● 31° · feels 35° / wind, humidity )
  no app:      [⊞ 2]                    click pill: Home · click left: Overview
```

- Panel: trong suốt, 40 px; hai cụm và island. Island chỉ chứa **activity**; trạng thái hệ thống
  ở lại cụm hệ thống.
- **Overview mở trên toàn bộ hình nền** (2026-11-04, Ethan). Shell cắt nền workspace của Overview
  theo vùng làm việc (`shell-workspace-background.c` allocate; `workspace.js`
  `_updateRoundedClipBounds`), nên dưới một thanh nhìn xuyên được, dải phía sau nó vẫn tối.
  `reach.js` nới cả hai vùng cắt qua mọi strut thêm `strut × (1 − state)`: đúng như GNOME khi đã
  hiện, cả màn hình ở desktop. `state` là adjustment của controls (`overviewControls.js`, 0 ẩn,
  1 cửa sổ, 2 lưới app), kẹp về 1. Chữ dưới thanh lấy độ tương phản của hình nền khi dưới 0.5, chữ
  sáng từ 0.5.
- **Nền cụm** (2026-11-04, Ethan): `cluster-background = never | hover | always`, mặc định `hover`
  — icon nằm trần trên hình nền, một nền bo tròn (không blur) bọc cụm khi hover. `cluster-radius`
  0–16, mặc định 16; `cluster-opacity` 5–100 %, mặc định 17. Tô như GNOME tô một nút panel: màu chữ
  của bên đó ở `cluster-opacity`, +11 điểm khi menu hệ thống mở, +15 khi mở và đang hover
  (`_drawing.scss` `panel_button` .17/.28/.32). Cụm trống không có nền; cụm cách mép màn hình 4 px.
- **Tương phản trên hình nền sáng** (2026-11-04, Ethan): chữ đổi màu, không phải nền.
  `cluster-contrast = auto | dark-text | light-text` (prefs "Icons and text"); các giá trị gọi tên
  màu chữ, không phải kiểu sáng/tối của GNOME.
  - Mỗi bên riêng: hộp trái; hộp phải, khay và cụm hệ thống chung. Class `buoy-dark-text` /
    `buoy-light-text` trên hộp đó.
  - Đo: file Shell vẽ (`background.js` `getBackground`, `picture-uri-dark` khi prefer-dark), đặt
    như Mutter đặt (`meta-background.c` `get_texture_area`) cùng màu xung quanh; độ sáng WCAG trung
    bình của 40 px trên cùng dưới bên đó; chữ tối khi nó dễ đọc hơn chữ trắng (hai bên gặp nhau
    quanh 0.2).
  - Chỉ theo signal (các key nền, `color-scheme`); giải mã một lần mỗi lần đổi (GdkPixbuf, async,
    rộng 512 px), chỉ khi `auto`. Không biết (đang giải mã, thiếu file, slideshow `.xml`): chữ
    sáng. Overview từ state 0.5: chữ sáng.
  - Chỉ màu chữ: nhãn và icon symbolic, trắng (`$transparent_panel_fg_color`) hoặc `#1a1a1a`; icon
    đủ màu, menu và các chỉ báo quay/chia sẻ màn hình tô đặc giữ như GNOME. Không bóng chữ, như
    panel GNOME. Đã loại: bóng 1 px theo tông hình nền (trông như mép đúp).
  - Highlight của một nút khay là màu chữ ở .17 / .28 / .32 (`panel_button`; Yaru biên dịch một màu
    xám cố định). panel.js đánh dấu các nút khay thường là `buoy-tray-button` để các chỉ báo tô đặc
    giữ highlight của chúng. Nó lấp cả nút 32 px: viền trong suốt 3 px của GNOME bị bỏ, phần tô là
    nền (St chỉ vẽ inset shadow lên trên một nền).
  - Icon bitmap một màu trên khay tính là glyph: app Electron gửi một PNG trắng qua AppIndicator
    (`appIndicator.js`, nơi `color` của FileIcon không với tới). Một icon ≥ 97 % gần trắng được vẽ
    bằng màu chữ ở bên chữ tối (`Clutter.ColorizeEffect`); logo giữ nguyên dáng. Đọc một lần ở
    32 px, chỉ sau khi bên đó lần đầu chuyển sang chữ tối.
- **Cụm trái** (2026-10-30):
  - Icon + tên của app đang focus (`Shell.WindowTracker` `notify::focus-app`); theme không có icon:
    `<icon>-symbolic`, rồi `window-symbolic` / `focus-windows-symbolic`.
  - Hover nối thêm workspace: icon lưới + số hoặc tên của nó ("Firefox · ⊞ 2").
  - Không có cửa sổ focus: chỉ workspace ("⊞ 2"; trình đọc màn hình nghe "Workspace 2").
    `left-cluster-empty = workspace | hidden`.
  - Bấm → Overview (thay Activities). Bấm phải → menu app. Cuộn → đổi workspace.
- **Khay** (icon bên thứ ba: AppIndicator, bộ gõ…): trần, mỗi cái riêng, thứ tự, hover và màu của
  GNOME; chữ và icon symbolic theo tương phản. Mỗi nút một ô vuông 32 px (nội dung 16 px), nhãn bộ
  gõ ở giữa.
- **Cụm hệ thống** (2026-11-02): các chỉ báo quick settings của GNOME và **đồng hồ** (`dateMenu`,
  dời từ giữa) thành **một nút** với nền hover chung; bấm bất cứ đâu, cả đồng hồ, đều mở quick
  settings.
  - Đồng hồ không có bấm, hover hay focus riêng (trả lại khi disable); nó vẫn reactive vì
    `Panel.toggleCalendar` (Super+V) không làm gì nếu khác đi (`ui/panel.js` `_toggleMenu`), và
    hover nó khi một menu đang mở không trượt sang lịch. Chấm chưa đọc của nó rời khỏi bố cục —
    đèn phao (§2a) báo "nhỡ". Các phần bỏ highlight và padding riêng; đồng hồ cách chỉ báo cuối
    12 px.
  - Định dạng đồng hồ là các key của GNOME (`clock-show-weekday/-date/-seconds`, `clock-format`,
    `show-weekdate`), hiện trên trang Panel của Buoy để Settings luôn khớp. Mặc định của Buoy, chỉ
    giờ dạng 24 giờ (`14:05`), được ghi một lần vào các key người dùng chưa từng đặt
    (`clock-defaults-applied`), không bao giờ hoàn lại.
  - **Dock** (Ubuntu Dock, 2026-11-04, Ethan): trang Panel có Auto-hide, Panel Mode, Icon Size,
    Show on, Position, Show Trash, Show Volumes trên chính các key của `dash-to-dock` (đồng bộ hai
    chiều). Mặc định của Buoy — dưới cùng, tự ẩn, không tràn mép, 32 px, màn hình chính, không thùng
    rác hay ổ đĩa — ghi một lần (`dock-defaults-applied`), không bao giờ hoàn lại. "Show on" gọi tên
    màn hình như Settings (`DisplayConfig` GetCurrentState). Ẩn khi không có dock.
  - Popover lịch không còn tới được bằng chuột; Super+V / Super+M vẫn mở nó. Nội dung của nó dời
    đi: lịch sử thông báo → tab thông báo (§6), lịch và thời tiết → Home (§3) và các idle plan, DND
    → nút bật tắt nhanh. Đồng hồ thế giới: sau.

### 1a. Cửa sổ sát thanh trên cùng: bo hai góc trên

*2026-11-02; tiled và mép trên 2026-11-04.* Adwaita bỏ bo góc cửa sổ (15 px) khi maximize hay
tile, nên sát một thanh trong suốt mép trên trông như bị cắt. Buoy bo **hai góc trên** của các cửa
sổ có mép trên chạm thanh; đáy vẫn vuông.

- `window-corners` (b, `true`), `window-corners-radius` (i, 15, 0–32), trên trang prefs
  **Windows**; áp dụng ngay.
- **Cửa sổ nào**: mọi cửa sổ thường, không fullscreen, toolkit nào cũng được, có đỉnh nằm trên đỉnh
  vùng làm việc (`kit/model/rounded.js` `onTopEdge`): maximize theo chiều dọc (đầy đủ, tiled, chỉ
  chiều dọc — Mutter ghim đỉnh, `window.c` `update_edge_constraints`) hoặc một frame bắt đầu trên
  đường đó (các góc tư của tiling-assistant, một cửa sổ kéo sát thanh). Cả hai góc đều bo, cả các
  góc trong của một cặp tiled. Trên cửa sổ nổi chỉ cắt các pixel bên trong frame (bóng của nó còn).
  Một cửa sổ maximize theo chiều dọc còn mất phần phía trên frame và, trong các ô vuông ở góc, phần
  bên cạnh nó: client vẫn vẽ một viền vuông 1 px ở đó (2026-11-12, #196).
- **Cách làm** (`corners.js`): một `Shell.GLSLEffect` trên `Meta.WindowActor` bỏ các pixel ngoài
  hai cung tròn (như `ui/lightbox.js` RadialShaderEffect). Chỉ theo signal (`window-created`,
  `workareas-changed`, `notify::maximized-*`, `notify::fullscreen`, `position-changed`,
  `size-changed`). Khi bỏ maximize, effect ở lại tới `size-changed` (Shell đóng băng actor trước
  khi trạng thái đổi). Một cửa sổ trả về đúng bằng vùng làm việc giữ góc tới lần đổi cỡ sau.
- **Chi phí, chấp nhận**: cửa sổ vẽ qua một offscreen và Mutter thôi cull phía sau nó
  (`meta-cullable.c` `has_active_effects`). Đo (2026-11-04): một cửa sổ maximize trên bốn cửa sổ
  nổi 1.23 ms một frame (1.00 khi tắt); năm cửa sổ maximize 1.01 (1.06 khi tắt).
- Đã loại: nắp góc vẽ một bản sao hình nền (sai khi có cửa sổ phía sau, phải ẩn trong mọi
  animation).

## 2. Các trạng thái của island

Ba bậc theo cỡ (2026-11-05, Ethan): **minimal** < **compact** < **expanded** — từ của Apple, không
phải cách Apple gán (CONTRACT.md §2).
- **minimal** — nằm trên thanh: một dòng, 32 px ở 1em (lớn theo font), một tới ba pill.
- **compact** — khi hover: pill được hover nở tại chỗ thành một bảng ngắn, 56–120 px, đè lên các
  cửa sổ (và cụm hệ thống nếu cần).
- **expanded** — khi bấm hoặc do stack mở: bảng có tab, cho những gì compact không đủ chỗ (media:
  chọn player, âm lượng của app, shuffle/repeat).

| Trạng thái | Khi nào | Hình | Tương tác |
|---|---|---|---|
| **Idle** | không có activity | 132×32 r16 ở 1× (đồng hồ ở độ dài lớn nhất, §4); nội dung theo `idle-content` (§2a) | hover → rộng thêm 0.75em, cao thêm 2; có đèn hổ phách thì danh sách nhỡ dưới dạng compact, có đèn đỏ thì card của ask đang chờ (2026-11-13); nhấn → một nhịp đập; **bấm → Home** (khi mắt Bu đang hiện: lúc nhả, và giữ ≥ 0.5 s thì chọc Bu, MASCOT § Expressions) |
| **Minimal** | một hay nhiều activity | pill 1 (độ ưu tiên cao nhất) ở giữa màn hình, vừa nội dung; tối đa hai pill phụ bên phải, cỡ idle, vừa bao nhiêu thì bấy nhiêu (§2c) | hover 300 ms → compact của nó; **bấm → tab của activity**; Home trên huy hiệu `+N` hoặc khi danh sách nhỡ đang hiện |
| **Compact** | con trỏ dừng trên một pill; một alert (5 s); một ask cho tới khi được trả lời | nở tại chỗ: giữ mép trên, rộng min(28em, 0.72 × expanded) (2026-11-12, Ethan); cao 56 + 16n tới 152 (§4, design/compact); card lựa chọn của một ask cao tới chiều cao của expanded | nội dung compact của activity (media: ảnh 72, thanh của nó, equaliser bay vào ô ⏸, design/compact "Nhạc"), hoặc danh sách nhỡ màu hổ phách (INDICATORS.md); nút chạy hành động của nó, bấm chỗ khác = bấm pill; thu lại 200 ms sau khi con trỏ rời đi; compact của alert ở 5 s (lâu hơn khi hover), của ask tới khi được trả lời (phím dùng được sau Super+B) |
| **Expanded** | bấm từ idle, minimal hay compact; stack mở cho một transient | `EXPANDED` (§4) | chỉ bấm ra ngoài (hoặc Esc sau khi mở bằng bấm) mới đóng, đóng ngay; nút chạy hành động của nó (2026-11-01) |

Luật:
- Đóng = chỉ các activity đang sống, không khung. Expanded mở **Home** từ idle, **tab của activity**
  từ pill của nó. Tab chỉ có trong expanded.
- Một activity kết thúc thì bị gỡ ngay; `ttl` cho các activity ngắn hạn (§2e, thông báo).
- **Cái chỉ chờ thì đi sau `activity-linger`** (5/10/20/30 min, mặc định 5; 2026-11-07, Ethan): một
  activity `linger` (player đang dừng, agent đã xong hay đang chờ) kết thúc sau ngần ấy thời gian
  không có gì mới; mỗi lần cập nhật bắt đầu lại thời gian chờ, con trỏ trên pill của nó giữ nó lại.
  Một yêu cầu quyền chưa được trả lời bị từ chối sau cùng thời gian chờ đó.
- **Pill nào đứng đầu: [PRIORITY.md](PRIORITY.vi.md)** — trạng thái (cần bạn › đang chạy › đang
  chờ), độ ưu tiên của kind, mới trước stale, mới nhất trước. Feedback (§2e) và transient chen vào,
  rồi cái trước trở lại. Transient (`style: 'transient'` của Apple: lời chào, một bộ chọn) mở
  expanded; feedback không bao giờ.
- **Alert** (2026-11-12, design/alerts-and-asks): activity đang hiện mở compact của nó tại chỗ trong
  5 s (giữ khi hover), hoặc đập một nhịp nếu không có compact; một alert trên activity bị che đưa nó
  lên trong 5 s, rồi cái đầu trở lại (activity có pill riêng thì alert ở đó, §2c). Một **ask** là
  một card cỡ compact (Bu, câu hỏi, các nút), mở trên pill của nó tới khi được trả lời.
- Mở bằng bấm thì lấy bàn phím (modal, Esc dùng được); mở tự động (alert, ask, transient) không bao
  giờ lấy.
- **Fullscreen** (2026-11-03): island ẩn cùng thanh trên màn hình đó (`trackFullscreen`; hiện lại
  trong Overview) và đóng. Khi ẩn, không gì mở hay alert; cái kết thúc tính là nhỡ (hổ phách), ask
  chưa trả lời bật đèn đỏ; hiện lại thì ask hay transient đang ở đầu mở như mới. Super+B không làm
  gì khi ẩn.
- **Vắng mặt và Không làm phiền** (2026-11-13): cái kết thúc khi vắng (phiên idle sau `idle-delay`)
  hoặc trong DND cũng tính là nhỡ (`stack.setAway`); alert và ask vẫn tới island, island giữ một
  card critical hoặc một ask tới khi bạn quay lại. Màn hình khoá disable Buoy (không có
  `session-modes`).

### 2a. Nội dung idle

*2026-10-30.* `idle-content`, mặc định `auto`. Mỗi giá trị là một **idle plan** từ một module
(`modules/<id>/idle.js`), nên danh sách theo các module đang bật; `auto` và `none` là của kit.

| giá trị | pill hiện | module | làm mới |
|---|---|---|---|
| `auto` | plan quan trọng lúc này, xoay theo ngữ cảnh (§2a-iii) | core | signal của plan + một timer xếp lại khi idle |
| `none` | pill đen + **đèn phao** (xám, hổ phách hoặc đỏ; §2a-i) | core | sự kiện |
| `clock` | một đồng hồ *thứ hai*, khác của cụm: một icon buổi (`kit/model/daypart.js`, §2d; sáu SVG màu ở 20 px — mặt trời trên một cung, màu đào `#FFB889` lúc rạng sáng và chiều tối, vàng `#FFD23F` ban ngày, rồi mặt trăng; `scripts/icons.js` palette A) + giờ in đậm số đều, định dạng của GNOME (`clock-format`, locale, `clock-show-seconds`). `idle-clock-style` (2026-11-08, Ethan): icon + buổi bằng chữ ("Afternoon", mặc định) · icon + giờ · icon · chữ · giờ | `clock` | `GnomeDesktop.WallClock` (như màn hình khoá), chỉ khi pill idle đang hiện |
| `weather` | icon thời tiết + nhiệt độ ("31°", đơn vị của người dùng, làm tròn như date menu). Compact: "31° · Partly cloudy" trên "Feels like 34° · Wind NE 12 km/h · Humidity 75%", phần nào không biết thì bỏ. Icon màu riêng của Buoy, mỗi điều kiện của GNOME một cái (13, có bản đêm), symbolic làm dự phòng (2026-11-06, Ethan). Nơi, đơn vị, làm mới: bên dưới | `weather` | `WeatherClient` của date menu (`misc/weather.js`), chỉ khi đang hiện: ngay lập tức nếu cũ hơn `idle-weather-refresh` (30 min / 1 h), rồi theo chu kỳ đó |
| `next-event` (`calendar`) | sự kiện tiếp theo hôm nay: icon, tiêu đề, giờ ở cuối ("3:00 PM", "until 4:00 PM", "all day"; tiêu đề bị cắt bằng dấu …), nở tới giới hạn của minimal. Compact: tiêu đề trên "3:00 PM – 4:00 PM · in 25 min". Sự kiện bắt đầu trong 30 min thắng sự kiện đang diễn ra; rồi tới cả ngày (`idle-calendar-all-day`); không còn gì → chỉ đèn. Không có Join (máy chủ lịch của Shell chỉ gửi id, tiêu đề, giờ) | `calendar` | nguồn sự kiện của date menu; phút của wall clock |
| `power` | icon pin của Buoy và số %, chế độ năng lượng là icon mờ ở cuối; trong phút sau khi cắm hoặc rút, ước tính đầu tiên nói đủ ("72% · full in 1 h 10 min"). Compact: pin ở trên, ba chế độ năng lượng là nút (design/pill "Idle plan Pin", 2026-11-27, Ethan) | `power` (trong stack của Automatic, sau weather) | proxy UPower và power-profiles của Quick Settings (signal); một timer 60 s mỗi lần cắm |
| `mascot` | mắt Bu, các chế độ idle · sleep · missed · waiting; khi idle chúng dạo theo bước pixel, một nhịp mỗi vài giây (`idle-mascot-stroll`); ngủ vào ban đêm, sau 60 s không có thao tác, ở chế độ tiết kiệm điện, khi tắt animation (MASCOT.md § Eyes) | `mascot` (bật, cuối stack của Automatic, 2026-11-14, Ethan) | đèn, buổi, idle monitor, power profile; một timer nhịp chỉ khi đang dạo |

**Nơi cho thời tiết** (2026-11-06, Ethan; GNOME Weather không cài sẵn trên Ubuntu, nên client của
Shell không bao giờ định vị): nơi đầu tiên trong `locations` của `org.gnome.shell.weather`. "Use my
location" (`idle-weather-automatic`, bật): mỗi lần hỏi thì hỏi Geoclue một lần dưới tên
`org.gnome.Shell` (không hộp thoại, trong giới hạn của Location Services), đặt thành phố GWeather
gần nhất lên đầu, rồi dừng Geoclue.
- Một fix ≥ 20 km, hoặc không có độ chính xác, là chỉ theo IP (#188: sau đăng nhập fix IP báo Hà
  Nội ở 25 km trong khi Wi-Fi báo TP. Hồ Chí Minh). Lần hỏi chờ tới 15 s để có fix tốt hơn; một fix
  IP không bao giờ thay một nơi từ fix tốt hay từ người dùng, chỉ lấp chỗ chưa có nơi hoặc một
  phỏng đoán IP trước đó (`kit/model/weather.js` nextFix).
- Mỗi lúc một lần hỏi, chung cho mọi feed. Không có fix Wi-Fi → hỏi lại một lần 2 min sau, không
  bao giờ khi pill đã thôi hiện thời tiết (`shouldRetry`; 2026-11-13, Ethan: không quét Wi-Fi ngay
  sau đăng nhập hay khi máy thức dậy).
- Khi client của date menu tự định vị (có cài GNOME Weather, `_useAutoLocation`) và nơi của nó cách
  nơi của Buoy > 15 km, Buoy đọc GWeather.Info riêng cho nơi của mình (`useOwnInfo`), một cái cho
  mọi feed, giữ tới khi đổi nơi hoặc disable, lấy lại theo chu kỳ tính từ thời điểm của chính dữ
  liệu thời tiết.
- Một lần lấy thất bại làm trống số đọc của GWeather (`gweather-info.c` gweather_info_update →
  gweather_info_reset), nên Buoy giữ số đọc tốt gần nhất, hiện trong lúc lấy và sau khi thất bại nếu
  cùng nơi, cùng đơn vị và cũ ≤ 2 × `idle-weather-refresh` (`keptReading`; 2026-11-13, Ethan).
- **Làm mới** (2026-11-12, Ethan): hàng nơi ghi "Current location" với ⟳; prefs ghi
  `idle-weather-locate-now`, Shell định vị và lấy dữ liệu một lần (công tắc tắt: chỉ lấy dữ liệu).
  Hàng nói kết quả — "by Wi-Fi · 2 min ago", "guessed from the network, about 25 km", "no Wi-Fi fix,
  kept this place" (icon cảnh báo), "weather just now", một spinner (`idle-weather-located`,
  `-located-at`, `-updated-at`; `kit/model/settings.js` placeStatus). Công tắc tắt: một thành phố
  tìm trên trang Island (thành phố GWeather, bỏ qua dấu). Location Services tắt → "Location Services
  is off" với Open Settings.
- **Đơn vị** (2026-11-06, Ethan): các key của GNOME Weather `org.gnome.GWeather4` `temperature-unit`
  / `speed-unit`; lần enable đầu tiên đặt °C và km/h nơi chưa từng chọn (`weather-defaults-applied`);
  prefs dùng chung chúng, Automatic (theo locale) ở cuối. Không có nơi hay dữ liệu → chỉ đèn, hàng
  nói lý do.

Luật: một idle plan chỉ là phần trình bày (dạng dữ liệu của một adapter), không bao giờ đưa lên một
activity, và bị thay ngay khi một activity xuất hiện. Không gì chuyển động khi idle: một thay đổi
(phút, `auto` đổi plan) là một chuyển (§5), rồi đứng yên. Setting của mỗi plan nằm dưới nó trên
trang **Island** (luật 9 của ARCHITECTURE). Có plan thì đèn xám không được vẽ; hổ phách và đỏ thì
có.

Cấu trúc pill ở mọi trạng thái: `[light] leading · text · trailing [dot]`. Hai đầu là đèn trạng thái
của Buoy; các vùng thuộc về plan (idle) hoặc adapter (minimal). **Đèn ở hai đầu pill 1**
(2026-11-10, Ethan; design/pill "Đèn ở hai đầu"): một chấm 8 px ở giữa phần bo của đầu đó (cách mép
16 ở 1×); pill nở ở **cả hai** đầu thêm 20 (idle 132 → 172), nên nội dung không bao giờ dời. Không
đèn, không nở. Giới hạn rộng đã tính cả đèn; chữ bị cắt bằng dấu …. Một đèn xuất hiện hay biến mất
là một morph nhỏ. Pill phụ, compact, card và expanded không có đèn. Đèn xám chỉ ở `none`.

### 2a-i. Đèn phao (đầu trái của pill 1, idle và minimal)

Tĩnh, không bao giờ nhấp nháy. Tắt (xám mờ, chỉ ở `none`) · **hổ phách** = có gì đó kết thúc khi bị
ẩn, khi vắng hoặc trong DND (hover gọi tên nó, mở Home thì xoá), hoặc thông báo GNOME chưa ai xem
(xoá khi tab Notifications hoặc danh sách của GNOME đã hiện chúng; NOTIFICATIONS.md §2) · **đỏ** =
một `ask` đang chờ mà không hiện được. Đỏ › hổ phách. Vẽ bởi `kit/ui/pill.js`, không bao giờ nằm
trong các vùng. Không có trên pill phụ, compact, card hay expanded (Home liệt kê những gì đã nhỡ).

**Đèn của Bu không phải đèn phao** (2026-11-08, Ethan): một pill do Bu dẫn đầu vẫn vẽ chấm ở đầu
như mọi pill khác; đèn của Bu giữ màu theo tư thế (INDICATORS § Bu's lamp).

### 2a-ii. Chấm riêng tư (đầu phải của pill 1, idle và minimal)

Một chấm ở giữa đầu phải của pill 1, idle hay không: **tím** micro, **xanh lá** camera, **đỏ** màn
hình đang chia sẻ hay quay; mỗi lúc một chấm, đỏ › xanh lá › tím (design/colours "Chấm riêng tư",
2026-11-11). Hai đầu nở như với đèn (§2a). Pill vẽ nó; module `privacy` báo cho stack
(`stack.setPrivacy`). Micro tắt tiếng thì không có chấm (`ui/status/volume.js`
`_updatePrivacyIndicator`). Bấm → Home.
- Một lần quay hay chia sẻ cũng là một activity với đồng hồ và Stop (design/compact "Chia sẻ và quay
  màn hình", 2026-11-14).
- Các chỉ báo riêng của GNOME cho những thứ này bị ẩn khi module bật: `privacy-dot = pill | system
  | both`, mặc định `pill`.
- Camera và micro cùng bật 10 s thành một cuộc gọi (2026-11-27, design/compact "Đang gọi"): "In a
  call" với đồng hồ, Mute và app đang thu âm; Không làm phiền trong suốt cuộc gọi
  (`privacy-call-dnd`), chỉ trả lại nếu Buoy đã bật nó và không gì đổi nó. Phần nhìn nhanh đầu tiên
  của Home, "in use", gọi tên các app đang thu âm (mixer biết chúng; không gì gọi tên app dùng
  camera).

### 2a-iii. `auto`: một smart stack các idle plan

*2026-11-03.* Như Smart Stack của iOS: pill hiện thứ có ích tiếp theo.

- **Mức liên quan.** Mỗi `idle.js` export `relevance(ctx, opts)` → `{score: 0–100}` hoặc `null`
  (không có gì để hiện); rẻ, đồng bộ, đọc trạng thái plan đang giữ. `ctx` = `{now, clock, starts, data}`.

  | plan | điểm |
  |---|---|
  | `next-event` | bắt đầu trong ≤ 30 min **90** (giữ) · đang diễn ra 80 · trong 2 h 50 · muộn hơn trong ngày 25 · không có `null` |
  | `weather` | giờ đầu tiên của buổi sáng 70 · thay đổi trong giờ tới (mưa, chênh ≥ 5 °C) 75 · còn lại 35 · không có nơi `null` |
  | tin tức (M5) | 40; 55 cho tin < 1 h tuổi từ nguồn đang theo dõi |
  | tỷ giá / chứng khoán (M5) | 30; 70 khi vượt ngưỡng của người dùng |
  | `power` | phút sau khi cắm hoặc rút **80** (giữ) · dùng pin dưới 30 % 60 · dùng pin 30 · đang sạc 25 · đầy hoặc giữ ở ngưỡng 15 · không có pin `null` |
  | `clock` | 10, luôn có |
  | `mascot` | 10, chỉ khi có trong `idle-auto-plans` |

- **Chọn** (2026-11-08, Ethan: "an idle pill just rotates"): mọi plan có gì để hiện lần lượt tới
  lượt theo thứ tự `idle-auto-plans`, mỗi `idle-auto-switch` một plan; plan hiện đầu tiên là plan
  điểm cao nhất; `null` bị bỏ qua. Điểm ≥ 80 **giữ** pill và hiện ngay.
- **Xếp lại** khi một plan báo `changed` và theo một timer của kit, `idle-auto-switch` 5 (mặc
  định)/10/20/30 min, chỉ sống khi idle với `auto`. Giữa các lượt, một lần xếp lại giữ plan đang
  hiện khi nó còn gì để hiện.
- **Mối quan tâm**: `idle-auto-plans` (as), mặc định `['calendar', 'weather', 'power', 'clock', 'mascot']`.
  Prefs **Island**: một danh sách sắp xếp lại được, có công tắc, key của mỗi plan nằm dưới nó; plan
  có module đang tắt bị làm mờ ("Turn on in Modules") và không tồn tại (luật 6) — Show đặt vào nó
  thì pill trống, hàng của nó nói vậy. Một module chỉ là một plan (clock, weather) không có công tắc
  trong Modules (2026-11-08, Ethan): feed của nó chỉ chạy khi plan của nó được dùng. "Switch every"
  chỉ hiện khi chọn Automatic.
- **Tương tác**: hover → compact của plan đang hiện; cuộn trên pill idle → plan tiếp/trước (giữ một
  chu kỳ; mỗi cử chỉ một bước, cách nhau 400 ms; khi `auto` tắt thì thành cuộn workspace của panel);
  bấm → Home.
- **Chuyển động**: một lần đổi là một chuyển nội dung (ra 100 ms / vào 200 ms, cùng morph độ rộng).
- **Đã làm** (2026-11-08): `kit/model/smartstack.js` (`choose`, `scrollTo`, `stackOrder`,
  `intervalMs`), `kit/services/idle.js`. Khi `auto`, mọi plan trong stack đều có feed.
- **Plan sau này** (tin tức, tỷ giá, chứng khoán): mỗi cái một module, mặc định tắt, lấy dữ liệu qua
  Soup nhiều nhất 30 min một lần, chỉ khi có trong `idle-auto-plans`.

### 2b. Tab

*2026-10-30.*

- Thanh tab chỉ có trong expanded, chỉ sau khi mở bằng bấm; các lần stack mở hiện dạng expanded của
  activity mà không có nó. Tab = các module có `tab.js`; Home đầu tiên.
- **Thanh tab** (2026-11-13, Ethan): `[Home] [fixed] [pinned] [live] [slot] [⋯]`.
  - **Cố định** (fixed): mọi module đang bật có kind, chạy hay không, theo thứ tự module (§6); trước
    khi có `tab.js` tab hiện dạng expanded của các activity của nó. Module chỉ có feedback (osd,
    copied; §2e) không có tab.
  - **Ghim** (pinned): các tab độc lập trong `tabs-pinned` (mặc định Calendar và Devices).
  - **Live**: tab của module `tabWhileLive` chỉ khi một activity của nó đang có mặt (Claude Code,
    Transfers); kind không ai nhận (người gọi D-Bus) có một tab khi một activity có dạng expanded.
  - **Trong ⋯**: một module `tabInMore` giữ tab của nó trong ⋯ (Timer); có cả `tabWhileLive` thì
    tab live khi đang hoạt động (Phone trong cuộc gọi, 2026-11-18, Ethan).
- **Dáng** (2026-11-02, theo Notchy): một nhóm bo tròn; tab đang chọn có icon + tiêu đề trên một
  pill sáng hơn, các tab khác chỉ icon (tiêu đề làm tên cho trợ năng). Icon: `icon` của module, icon
  activity của một kind không ai nhận, không thì icon chung.
- **Tab nào mở**: idle hay `+N` → Home; một pill hay compact của nó → tab của kind đó; kind không có
  tab (osd, copied) → `onPress` của activity (ví dụ đưa player lên), không thì Home. `pressFirst`
  chạy `onPress` trước; tab chỉ mở khi nó không làm gì (terminal của agent, 2026-11-07). Tab cuối
  không được nhớ. Một tab mà activity cuối cùng kết thúc thì quay về Home.
- **Tab độc lập** (2026-10-30, theo ⋯ của Notchy): `tab.js` với `kinds: []` — không source,
  activity hay idle plan; các trang công cụ (Clipboard, Launcher, Files, Notes) tách khỏi pill.
  - **Slot** là ô cuối, vẽ như mọi tab: tab độc lập được chọn gần nhất từ ⋯ (`tabs-slot`), không thì
    tab bật đầu tiên. ⋯ mở một menu nổi trên tab (nền và viền riêng, không blur), mép phải thẳng mép
    phải của ⋯, liệt kê các tab độc lập khác rồi các tab `tabInMore`, đánh dấu tab của slot. Nhấn
    bên cạnh menu chỉ đóng nó. Một tab đã ghim không bao giờ ở slot hay ⋯ (2026-11-13).
  - Chỉ tới được qua slot, ⋯ hoặc phím tắt — không bao giờ do một sự kiện. Dựng ở lần chọn đầu,
    huỷ khi expanded đóng: khi đóng không tốn gì. Được dùng API của Shell; không polling khi đóng.
  - Bản cài mới: Home, các tab kind, Calendar, Devices, slot với Clipboard, ⋯. Không dự định:
    Calculator, Emoji (tìm kiếm của GNOME đã có).

### 2c. Nhiều pill

*2026-10-30; hình và hover 2026-11-05.*

- **Pill 1**: độ ưu tiên cao nhất, giữa màn hình, vừa nội dung như khi đứng một mình (120 … 0.6 ×
  expanded, `wide` 0.8; §4); không bao giờ bị thu hẹp vì pill khác.
- **Pill phụ 2 và 3**: cỡ idle (132 × 32 ở 1×): leading, một trailing ngắn (equaliser, `40%`,
  `4:59`) và `+N`; không có text, nên giá trị ngắn nằm trong `trailing` (CONTRACT.md §3). Leading ở
  mép trái, trailing ở bên phải, `+N` ở mép phải trước nó (2026-11-12, Ethan, design/pill "Pill
  phụ"). Nội dung đầy đủ của chúng là compact.
- **Bao nhiêu**: vừa bao nhiêu trước cụm hệ thống (lề 12 px) thì bấy nhiêu, tối đa hai, đo lại khi
  cụm đổi cỡ; pill phụ bị bỏ trước khi pill 1 bị thu hẹp. Pill 1 rộng nhất, cụm 300 px: 1366 → một,
  1920+ → hai.
- `+N` trên pill cuối được hiện mở Home với danh sách đầy đủ (phần còn lại của pill đó: tab của nó).
- **Hover → compact** (2026-11-05): sau 300 ms pill nở **tại chỗ** (§2, §4): giữ mép trên, căn giữa
  theo pill, chỉ dời để nằm trong màn hình 4 px (có thể che cụm hệ thống). Nâng lên trên các pill
  bên cạnh, chúng mờ đi tại chỗ: không gì trượt. Pill 1 rộng nhất: compact trên pill 3 không cần dời
  từ 1920 tới 3440; ở 1366 compact của pill 2 che ~60 px của cụm.
- **Rời đi**: compact ở lại khi con trỏ còn trên pill hay compact, thu lại 200 ms sau, các pill bên
  cạnh hiện lại. Sang một pill khác: đổi ngay, như `ui/popupMenu.js` `PopupMenuManager`
  `_changeMenu`. Một pill xuất hiện dưới con trỏ đang dừng thì mở compact của nó; một alert hay ask
  đóng compact của pill khác.
- Bấm vào một pill hay compact của nó mở expanded ở tab của nó: các pill **gộp lại** (pill chính nở
  ra, các pill khác trượt vào và mờ đi, 300 ms); đóng thì tách ra. Khi một pill kết thúc, các pill
  còn lại trượt vào lấp chỗ.
- **Bàn phím** (2026-11-03): `Super+B` (`keybind-focus`) lấy bàn phím (modal) và đặt vòng focus lên
  pill giữa: viền 1 px của nó chuyển thành `-st-accent-color` (keyline của activity nhường chỗ). Nút,
  tab và hàng bên trong giữ vòng accent 2 px ở 80 % của GNOME (`_drawing.scss` `focus_ring`). ←/→
  dời vòng (không quay vòng; đi theo activity của nó); Enter/Space mở nó như một cú bấm; Esc,
  `Super+B` hoặc bấm ra ngoài thì nhả. Khi mở: ←/→ đi dọc thanh tab, Esc hoặc `Super+B` đóng. Chạy
  được ở các mode NORMAL, OVERVIEW và POPUP. Một lần mở do stack không lấy bàn phím; `Super+B` lấy nó
  cho pill đó, pill đó rồi ở lại như khi mở bằng bấm. Nút của một ask trả lời theo một phím in trên
  nhãn: chữ cái đầu của nhãn (bỏ dấu, Đồng ý → D); chữ đầu trùng nhau hoặc không phải chữ cái thì
  lấy vị trí 1–9 (Deny · Allow · Always → D · 2 · 3). Bỏ qua khi một popup khác đang giữ bàn phím.

### 2d. Lời chào

*2026-11-03; các khoảnh khắc 2026-11-06.* Chào khi máy khởi động hoặc thức dậy sau một giấc ngủ dài
(expanded: Bu, lời chào, giờ, ngày, thời tiết), chào mừng trở lại khi đăng nhập mới, hẹn gặp lại
khi phiên kết thúc (minimal, hoặc compact có một ghi chú) — mỗi lần, không phải mỗi ngày một lần.
**[GREETING.md](GREETING.vi.md) là tài liệu tham chiếu**: các khoảnh khắc, câu chào và độ ưu tiên
của chúng, cỡ, tư thế, ngày đặc biệt, thời tiết, setting.

- **Buổi trong ngày** (`kit/model/daypart.js`, dùng chung với clock plan và `auto`): `dawn · morning ·
  noon · afternoon · evening · night` từ `daypart-starts` (ai, mặc định `[5, 7, 11, 13, 18, 22]`,
  quay vòng). Mọi phép xoay của sáu giờ khác nhau theo thứ tự vòng; khác đi thì dùng mặc định. Một
  buổi đổi vào đầu giờ; nơi dùng đặt một timer tại `nextBoundary()`. Trang Island → Parts of the
  day: icon của mỗi buổi và một danh sách thả xuống các giờ nó có thể bắt đầu, 12/24 h của GNOME,
  Reset (2026-11-13). Lời chào: dawn, morning "Good morning" · noon "Good day" · afternoon "Good
  afternoon" · evening "Good evening" · night "Still up".

### 2e. Feedback: chỉ minimal

*2026-11-05, Ethan.* Feedback — phản hồi cho việc bạn vừa làm: `osd` từ `hud`, nguồn nhập từ
`input`, `copied` từ `copied`.

- **Chỉ minimal**: không compact, expanded hay tab; không bao giờ là alert, không bao giờ nhỡ. Bấm →
  `onPress` của nó (Sound settings), không thì Home.
- **Pill 1 trong thời gian ttl của nó**, trên mọi kind trừ `ask` (dưới một ask thì nó là pill 2);
  pill bị che quay lại đúng chỗ, pill phụ và `+N` giữ chỗ của chúng (`stack.js` `pillWindow`). Cái
  mới nhất che cái cũ hơn.
- **ttl** ~1.5 s (cả copied, 2026-11-06). Lặp lại thì cập nhật cùng activity đó và bắt đầu lại ttl
  (giữ phím âm lượng thì vẫn một pill). Con trỏ trên bất kỳ pill nào tạm dừng nó; rời đi thì được
  một ttl mới (`stack.hold`). Khi Home đang mở nó là một hàng trong Now.
- **Cỡ theo loại**, vừa nội dung với gợi ý, không bao giờ px (luật 11): mức thì icon + thanh
  (`wide`); Caps Lock và input thì icon + một từ ngắn; copied thì icon + đoạn trích hoặc ảnh thu nhỏ,
  cắt bằng dấu … ở độ rộng lớn nhất của pill 1.

**input** (2026-11-05; gồm IBus): nguồn vừa chuyển sang, gọi tên như chỉ báo của Shell — ký hiệu
`InputMode` của engine IBus khi dài 1–2 ký tự (V / E của Bamboo), không thì tên ngắn — rồi tên của
nó: "EN · English (US)". Cũng flash khi một engine tự đổi mode; không gì lúc enable, lúc IBus khởi
động hay khi không gì đang hiện thay đổi. Bấm → Keyboard settings. Bộ chuyển của Super+Space được
thay (`input-replace-switcher`, bật): nhấn một lần chuyển ngay sang nguồn trước; mỗi lần nhấn Space
tiếp khi vẫn giữ Super dời thêm một bước trong danh sách gần đây. Tắt: danh sách của GNOME.

**hud = mọi OSD của GNOME** ("Volume & keys"; sự kiện phần cứng là `device` / `power`): tất cả đi
qua `Main.osdWindowManager` `show` / `showAll`, bị ghi đè khi `hud-replace-osd` bật.
- Mức — icon + thanh + phần trăm (`72%`, `130%` khi khuếch đại): âm lượng (gsd gọi tên một đầu ra
  ngoài: "Headphones"), micro, độ sáng, đèn bàn phím (phím và Fn của firmware qua UPower
  `BrightnessChangedWithSource`), phím pin. Tắt tiếng: icon tắt tiếng, thanh và số mờ đi.
- Bật tắt — icon + một từ ngắn: touchpad, chế độ máy bay (cả công tắc phần cứng), Bluetooth, khoá
  xoay, màn hình riêng tư, eject, "Nothing playing" (⊘ của gsd cho một phím media khi không có
  player, `do_multimedia_player_action`). Nhãn của gsd giữ nguyên như khi đến; Buoy tự đặt chữ cho
  phần còn lại.
- Caps Lock, Num Lock (từ keymap) và Fn Lock (bên dưới): của riêng Buoy; chúng vẫn còn khi công tắc
  tắt.
- Thanh trượt âm lượng và micro của Quick Settings hiện mức khi chúng di chuyển (GNOME không hiện
  gì).
- Bấm vào một mức mở panel Settings của nó.

**Fn Lock** (2026-11-05) nằm trong firmware; Buoy hiện nó khi driver phơi ra một LED
`<device>::fnlock` có `brightness_hw_changed` (một watch POLLPRI, không polling).

| Máy (driver) | Fn Lock | Vì sao |
|---|---|---|
| **Lenovo IdeaPad** có sự kiện WMI của phím Fn (`ideapad-laptop` + `ideapad_wmi`, WMI `8FC0DE0C-B4E4-43FD-B0F3-8871711C1294`) | **có** — đã thử trên IdeaPad Slim 3 15IRH10 (83K1), kernel 7.0 | `platform::fnlock` có `LED_BRIGHT_HW_CHANGED`, được báo từ sự kiện đó (`ideapad_fn_lock_led_notify`) |
| IdeaPad không có sự kiện đó | không | không gì báo một lần nhấn phím |
| driver bất kỳ dùng `*::fnlock` | có, chưa thử | cùng giao diện |
| Huawei (`huawei-wmi`), LG (`lg-laptop`), Uniwill (`uniwill-laptop`) | không | chỉ có một file `fn_lock`: đọc nó nghĩa là polling (luật 8) |
| ASUS (`asus-wmi`), ThinkPad, Dell, HP, bàn phím ngoài | không | xử lý trong firmware hoặc trong bàn phím |

**Copied và Clipboard** (hai module, 2026-11-07, Ethan): "Copied" trong Quick Feedback
(`modules-copied`, Show what was copied), "Clipboard" trong Tabs (`modules-clipboard`). `copied`
nghe `Meta.Selection` `owner-changed` (`meta-selection.c`); lịch sử Clipboard (M5) tự theo dõi riêng
với `clipboard-history`; tắt thì không lưu gì.
- Im lặng với clipboard do chính Shell đặt (`Meta.SelectionSourceMemory`, `st-clipboard.c`: ảnh chụp
  màn hình, một hàng được đặt lại, một trình quản lý clipboard khôi phục), với clipboard từ xa
  (`Meta.SelectionSourceRemote`: mutter-devkit, gnome-remote-desktop), với PRIMARY, và với chữ bị
  làm trống.
- Hiện gì (2026-11-06), khớp đầu tiên: bí mật của trình quản lý mật khẩu
  (`x-kde-passwordManagerHint`) → "Copied · hidden", không bao giờ đọc; file
  (`x-special/gnome-copied-files`, `text/uri-list`) → tên hoặc "3 items"; ảnh → ảnh thu nhỏ
  (`Gio.BytesIcon`, không ghi gì) và "Copied image"; chữ → đoạn trích trên một dòng (đọc ≤ 500 ký
  tự).
- App là app đang focus, nên `apps-hidden` và profile áp dụng; không có `.desktop` → `system`.
  `copied-show-preview` tắt: chỉ "Copied", không đọc gì. Bấm → Home.

**Ảnh chụp màn hình** (chốt 2026-11-08, NOTIFICATIONS.md §7): không phải feedback mà là thông báo
"Screenshot captured" của chính Shell (`ui/screenshot.js` `_storeScreenshot`), hiện như mọi thông
báo — ảnh thu nhỏ, "Show in Files", bấm thì mở ảnh; mất khi pill của nó kết thúc. Mỗi lần chụp một
pill (phía clipboard im lặng). "Screencast recorded" cũng vậy; bản thân việc quay là một activity
(§2a-ii).

## 3. Expanded: Home

Một **thẻ chính** trên **một hàng ô** (design/home, 2026-11-11/12, Ethan), được sắp lại mỗi lần mở
và mỗi lần stack đổi: không bao giờ trống, không bao giờ cuộn (`kit/model/home.js` planHome,
`kit/ui/home.js`).

```
┌ ⌂ Home · ♪ · 🔔 · ⤓ · ⏱ · [ ▣ Calendar ] · ⋯ ───────────────────── ⚙ ┐  head 56
│ ┌ main card: the stack's first activity, or the greeting ────────────┐ │
│ │ [cover]  Sóng Ngoài Khơi                          ⏮  ⏯  ⏭        │ │  the rest of
│ │          Hải Đăng · Spotify   ━━━━━━━━━━──────── 1:24 / −2:11      │ │  the height
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌ 🔔 7 ──┐ ┌ Bu 2/3 ──────┐ ┌ ☁ 31° ────────────┐ ┌ ▭ 82% ─┐            │  row 100
│ │ Missed │ │ Claude Code  │ │ Partly cloudy      │ │ Battery │            │
│ └────────┘ └──────────────┘ └────────────────────┘ └─────────┘            │
└────────────────────────────────────────────────────────────────────────┘
  ⚙ (round 32, right of the strip) closes the island and opens prefs. No system indicators here (§1).
```

- **Phần đầu** 56 (thanh tab và ⚙ 32, cách đỉnh 12); thẻ chính; 8; ô 100; 12 ở đáy và hai bên. Thẻ
  chính lấy phần còn lại: 104 / 168 / 200 ở 1920 / 2560 / 3440; không có ô thì lấy hết.
- **Thẻ chính**: activity đầu tiên của stack cùng các nút của nó; không có thì là **lời chào** (Bu
  vẫy tay, "Good afternoon, Ethan", ngày). Player có thẻ riêng (`modules/media/home.js`: bìa cao
  bằng thẻ trừ 16, ≤ 184; ⏯ ở góc trên phải, equaliser, thanh ở chân; từ 160 thì tiêu đề lớn hơn).
  Một ask: card của nó, nút ở góc dưới phải. Còn lại: compact của chúng (hoặc leading, text, giá
  trị). Bấm thì mở tab của nó.
- **Ô** (fill-1, bo 16): N = floor((row + 8) / 128) — 4 ở 1920, 5 ở 2560 và 3440. **Missed** đầu
  tiên, rồi các activity (leading, một giá trị cỡ 1.5em, một chú thích: "2 / 3 · Claude Code");
  nhiều hơn N → N − 1 và **+K**. Còn chỗ: **phần nhìn nhanh** theo thứ tự — in use (§2a-ii), thời
  tiết, Up next, pin, điện thoại, hẹn giờ — bị bỏ khi không vừa (không bao giờ vào +K). Vẫn còn chỗ:
  thời tiết, rồi Up next, chiếm hai đơn vị; rồi các ô rộng ra. Rộng ≥ 200 thì hiện một cột chi tiết.
  Một ô mở tab của nó; ô không có tab thì đưa lên thẻ chính.
- **Missed** (tô hổ phách 16 %): lịch sử nhỡ của stack và những gì chưa xem của chính các source
  (`stack.flagMissed`). Danh sách của nó thay thẻ và hàng: ‹ (hoặc Esc), "Missed · N", × xoá hết;
  "Notifications · 3" mở tab đó; các việc mới nhất trước, mỗi việc mở tab của nó. Hiện Home thì xoá
  đèn hổ phách; ô ở lại tới khi mọi hàng được mở hoặc xoá.
- **+K** mở "Ongoing": mọi activity theo thứ tự stack, hàng 32, cuộn khi quá 5.

Phần nhìn nhanh và thẻ module chỉ sống trong lần mở (luật 8). Mọi tab mở ở chiều cao tối đa của
expanded (2026-11-08, Ethan): cao hơn thì cuộn bên trong; tab trống căn giữa chữ dưới Bu (kit
`EmptyState`). Buoy không tự đăng thông báo nào.

- **Lịch** — `ui/calendar.js` (nguồn EDS của dateMenu). Lịch của Online Accounts tự vào (GOA → EDS,
  `calendar-sources.c`); bỏ chọn trong GNOME Calendar thì ở ngoài. Buoy không bao giờ nói chuyện với
  các dịch vụ đó; prefs có "Online Accounts" (2026-11-06, Ethan).
- **Phần nhìn nhanh thời tiết** — icon của Buoy, nhiệt độ, điều kiện; dạng rộng: icon 48, nơi, chi
  tiết của compact. Không có cao/thấp (GWeather không có khoảng theo ngày). Bấm → GNOME Weather nếu
  có cài. Không hiện khi không có nơi hay số đọc; số đọc stale được lấy lại một lần khi mở.
- **Up next** — sự kiện tiếp theo hôm nay, giờ của nó ("3:00 PM", "Now", "All day") trên tiêu đề;
  dạng rộng, hai sự kiện tới, mỗi cái một thanh (accent khi đang diễn ra; máy chủ của Shell không
  cho màu lịch) với "3:00 PM · in 25 min". Bấm → tab Calendar. Không hiện khi hôm nay không còn gì.
- **Tab Calendar** (2026-11-08, Ethan): tháng ở một bên (vòng tròn 26–40 px theo chỗ, chữ số 12–16;
  tên tháng màu accent, năm xám, cuối tuần mờ, hôm nay tô đặc, chấm accent ở ngày có sự kiện), sự
  kiện của ngày được chọn ở bên kia (hôm nay: tuần tới) thành các thẻ màu của lịch (EDS `Color`).
  Một hàng mở trang của sự kiện trong cột đó (2026-11-20, design/tabs "Chi tiết sự kiện"). Chỉ đọc.
  Không có lịch → Bu với "Add an Online Account".
- **Phần nhìn nhanh pin** (2026-11-12, Ethan) — proxy UPower DisplayDevice của chính Quick Settings
  (`ui/status/system.js` PowerToggle): phần trăm, "Battery" hoặc "Charging"; không có trên máy để
  bàn. Icon chế độ năng lượng ở góc trên phải; bấm thì liệt kê ba chế độ tại chỗ, Settings → Power ở
  cuối (2026-11-14); không có chế độ thì mở Settings → Power.
- **Hẹn giờ, điện thoại** — design/home; các mục M4 của chúng.

## 4. Kích thước

*Suy ra, không cố định (2026-10-30).* Các con số được quyết trong [Thiết kế](design/index.vi.md)
(tokens). Tất cả tính bằng px logic. `kit/model/shapes.js` `shapesFor()` suy ra mọi thứ từ độ rộng
logic `W` của màn hình, chiều cao thanh và **em** (cỡ font × độ phân giải / 72, như St: 14.67 px ở
11 pt; Large Text phóng nó), tính lại khi `monitors-changed`, khi đổi theme hay font, đổi chiều cao
thanh, có tỷ lệ mới, hoặc `expanded-width`. Số px thiết kế tính ở 1em, nhân em / 14.67, làm tròn.
Một hàm, không phải breakpoint. Mọi độ rộng là số px nguyên chẵn (căn giữa trên pixel nguyên); bo
⌊h/2⌋. Expanded (iOS): rộng theo màn hình, cao vừa nội dung theo 56 + 16n tới width/2.

| Thứ | Luật | 1920 | 2560 | 3440 |
|---|---|---|---|---|
| thanh | 2.75em (`#panel.buoy`) | 40 | 40 | 40 |
| pill `h` | thanh − 2 × 0.25em; hộp nội dung h − 2 × 0.25em = ô của leading | 32 (ô 24) | 32 | 32 |
| idle | 8 + ô + 6 + chữ rộng nhất của đồng hồ idle + 8, đo khi chạy (chữ số rộng nhất, `88∶88∶88`, cái rộng hơn của AM/PM; design/pill "Idle") | 132×32 (Ubuntu Sans 126, DejaVu 146) | | |
| hover / nhấn | rộng thêm +0.75em / +1.25em, cao thêm +2 / +4 | 144×34 / 150×36 | | |
| minimal, pill 1 | nội dung + 2 × 8, trong [idle, min(24em, 0.6 × expanded)] (`wide` 0.8); có đèn + 2 × 20, ít nhất idle + 40, giới hạn không đổi | ≤ 336 | ≤ 352 | ≤ 352 |
| đèn | chấm 8 px ở giữa phần bo; mỗi đầu + 20 | idle 172 khi có đèn | | |
| pill 2–3 | cỡ idle | 132×32 | 132×32 | 132×32 |
| compact | rộng min(28em, 0.72 × expanded); 56 + 16n tới 152: phần đầu 56 (leading 40, 14 hai bên, nút 32), media 88 (ảnh 72), ≤ 3 hàng 120, một **card** (NOTIFICATIONS.md §3) 136 / 152 với một / hai dòng tin, 104 khi không có nút; card lựa chọn hàng 32 tới chiều cao của expanded (280 ở 1920); r 28 (`compactMetrics`) | 404 × 56…152 | 410 | 410 |
| expanded | `clamp(0.28 × W, 560, 760)` hoặc `expanded-width` (≤ W − 40); cao 56 + 16n ≤ width/2; r 28; phần đầu 56; không tab (lời chào) 88 | 560 × ≤280 | 716 × ≤344 | 760 × ≤376 |
| Home | phần đầu 56, thẻ chính, 8, ô 100, 12; N = floor((w − 24 + 8) / 128), mỗi ô ≥ 120, r 16 (§3) | thẻ 104, N 4 | 168, N 5 | 200, N 5 |
| container | độ rộng màn hình, cao bằng giới hạn của expanded + 40; không bao giờ reactive khi nghỉ (`clutter_actor_should_pick`) | 1920 | 2560 | 3440 |

Leading theo bậc: minimal một ô 24 ở 1em (30 với Large Text), bìa hay icon màu lấp đầy ô, icon
symbolic 16, Bu 20; compact 40; expanded 56; Bu 20 / 40 / 50 (lưới 10 ô của nó). Khoảng cách ở
minimal 6, 8 trước một nút; chữ 1em, đậm 600, số đều. Hành động: 1 ở minimal, 3 ở compact và
expanded. Adapter không bao giờ thấy các số này (luật 11): chỉ nội dung và nhiều nhất một gợi ý
(`size: 'wide'`).

## 5. Chuyển động

*2026-11-13 (M4 "Motion"); đường cong, thời gian và từng chuyển trong [Thiết kế](design/index.vi.md)
(Chuyển động), số trong tokens của nó.*

- **Lò xo** cho mọi chuyển, cỡ và hình (`kit/model/motion.js`, chạy bởi `kit/ui/spring.js`: một
  Clutter.Timeline mỗi actor, dừng khi đã yên). Mỗi lò xo có một thời lượng cảm nhận và độ nảy:
  `snap` (hover, nhấn, dấu tab), `size`, `move` (vào compact, trượt, gộp), `open` (expanded, alert,
  ask), `close` (mọi lần thu nhỏ, không bao giờ vượt quá). Chỉ khi nở ra mới nảy.
- **Bị cắt ngang**, một chuyển đi tiếp từ chỗ nó đang ở, với tốc độ của nó.
- **Bo góc** trên đường đi: cái lớn hơn giữa cũ và mới, ≤ nửa chiều cao; cuối cùng là bo của chính
  hình đó.
- **Phần chung bay** (2026-11-13): leading và tiêu đề mà một activity có ở cả hai dạng (pill ↔
  compact hay card, thẻ của Home ↔ tab Media, ô ↔ tab của nó) bay theo lò xo của nền dưới dạng bản
  sao ở cỡ cuối, được dời và phóng, không bao giờ sắp lại; phần cũ ẩn trong lúc đó; tìm theo dấu của
  chúng (`kit/ui/present/flight.js` markShared). Phần còn lại, khi mở ra, vào compact và mọi lần nở hơn
  25 %: ở chỗ cuối của nó, cắt theo nền mỗi frame, độ mờ đi theo (đầy đủ từ nửa đường); thu lại
  cũng cắt y như vậy. Một lần trượt dời nội dung cùng với nền.
- **Fade** ra 100 ms, vào 200 ms; màu hover, nhấn, checked 120 ms (`transition-duration`).
- **Nhấn**: nhỏ đi 4 px mỗi chiều theo `snap`, giữ 90 ms, rồi trở lại.
- **Đổi tab**: dấu tab nhảy tới tab mới theo `snap`, các tab ở giữa theo sau, tiêu đề hiện dần; thân
  cũ mờ đi và lùi 12 px, thân mới đến từ 12 px phía bên của nó. Các danh sách tại chỗ của Home
  (Missed, +K) đến từ 24 px bên phải theo `move`; quay lại thì từ bên trái.
- **Tắt animation** (`enable-animations`): mọi chuyển tới đích ngay; `slow-down-factor` kéo dài lò
  xo như `ease()` của Shell (`misc/animationUtils.js` `adjustAnimationTime`).

## 6. Module cho v0.1

1. **media** — MPRIS, mỗi player một pill từ lúc nó phát (2026-11-05, Ethan).
   - Minimal: ảnh + tiêu đề · nghệ sĩ + equaliser khi đang phát, theo màu chính của bìa (sáu thanh
     2 × 14 mọc từ giữa, trắng khi không có màu; design/pill "Equaliser", 2026-11-13) — chuyển động
     khi đang trên màn hình, kể cả khi tắt animation; khi dừng, một đường gần phẳng (4 · 6 · 4 ·
     2 px), không nút, `linger` (§2).
   - Compact: ảnh 40, tiêu đề / nghệ sĩ · app (tiêu đề dài cuộn từ phải sang trái: dừng 2 s,
     30 px/s, hai bản cách nhau 40 px; đứng yên và bị cắt bằng dấu … khi tắt animation), ⏮ ⏯ ⏭, vị
     trí với thời gian đã qua và còn lại (chỉ hiển thị). Không có khi `media-compact-on-hover`
     ("Controls on hover") tắt.
   - Tab (design/media, 2026-11-13): một thẻ như của Home — ảnh, tiêu đề / "artist · player" /
     album, ↗ Open app, thanh tua có thời gian, shuffle · ⏮ ⏯ ⏭ · repeat (cái nào không hỗ trợ thì
     bị vô hiệu) — dưới các chip của player (logo, tên, equaliser khi đang phát). Không có âm lượng
     (tab Sound, §6b).
   - Open app đưa cửa sổ lên (app lấy từ pid trên bus của player), rồi MPRIS `Raise()`: Firefox
     chuyển sang tab đang phát; Chrome không làm được (`CanRaise` false, không có `DesktopEntry`),
     nên cửa sổ của nó hiện lên ở tab nào đang hiển thị. Mỗi trình duyệt một player (tab phát gần
     nhất của nó).
   - Góc ảnh nằm trong góc pill: bo trừ đi khoảng lề (compact 24 − 14 = 10; minimal 2, nâng lên 6);
     vuông trong expanded (2026-11-05, Ethan). Quảng cáo Spotify: "Ad" và đếm ngược, không bỏ qua.
     Player dừng hẳn hoặc rời bus thì activity của nó kết thúc.
2. **hud** — mọi OSD của GNOME thành feedback (§2e).
3. **home** — §3.
4. **appname** — cụm trái (§1).
5. **greeting: lần chạy đầu và What's new** (2026-11-08, Ethan) — lời chào của Bu ở lần chạy đầu với
   những điều cơ bản, và sau mỗi bản cập nhật là những gì mới (GREETING.md §11).
6. **idle `auto`** — smart stack (§2a-iii).
7. **notifications** (NOTIFICATIONS.md là tài liệu tham chiếu) — banner của GNOME thành một pill ở
   chỗ GNOME sẽ hiện banner (`notification-replace-banners`, bật), một compact với hành động riêng
   và ×; DND là công tắc của GNOME. **Tab thông báo** liệt kê lịch sử từ `Main.messageTray`
   (`getSources()` + `source-added`, `notification-added`) — Buoy không có kho riêng; bỏ ở chỗ nào
   thì mất ở cả hai.

## 6b. Lộ trình sau v0.1 (toàn JS thuần)

1. **dbus** — `org.gnome.Shell.Extensions.Buoy`: `Show/Update/End`, `Ask(question, options) →
   answer`; hook gọi nó bằng `gdbus call` (DBUS.md).
2. **agents** — duyệt quyền Claude Code / Codex trong pill (Deny · Allow · Always), alert khi xong;
   hook cài từ prefs. Mỗi phiên một activity `agent` do **Bu** dẫn, tư thế theo các sự kiện hook
   (MASCOT.md § Agents), tên agent đứng đầu (CODING-AGENTS.md).
Mỗi mục dưới đây được quyết đầy đủ trên trang thiết kế của nó; ở đây chỉ nói nó là gì và đọc từ đâu.

3. **timer** (2026-11-22, Ethan; design/compact "Hẹn giờ") — vòng và đếm ngược, Pomodoro, tab Timer;
   hẹn giờ đã lưu là của GNOME Clocks (`org.gnome.clocks timers`), hai chiều, và "Time is up!" của
   Clocks thành card của Buoy. `timer-keep-awake`. Bấm giờ: sau.
4. **power** (2026-11-14, Ethan; design/compact "Pin và chế độ năng lượng") — cắm sạc, rút sạc, đầy,
   pin yếu (thay thông báo của gsd) và chế độ năng lượng, từ proxy UPower của chính Quick Settings.
   **bluetooth** (2026-11-17, Ethan; design/device "Không dây") — flash khi kết nối/ngắt kết nối kèm
   pin của thiết bị, từ client của Quick Settings.
5. **calendar** (2026-11-20, Ethan; design/compact "Sắp họp") — một cuộc họp trước 5 min với Join;
   link đọc qua D-Bus của EDS (`Calendar.GetObject`) chỉ cho sự kiện sắp bắt đầu, không dùng
   `gi://ECal`; lời nhắc của evolution-alarm-notify trong vòng 15 min bị gỡ đi
   (`calendar-meeting-alert`); `calendar-refresh` yêu cầu EDS làm mới lịch trực tuyến
   (`Calendar.Refresh`; EDS tự làm mỗi 60 min).
6. **usb** (2026-11-17, Ethan; design/device) — ổ đĩa đã mount với Open và Eject, thay thông báo của
   GNOME; webcam thì flash.
6b. **attention** (2026-11-19, Ethan; design/compact "Cửa sổ cần chú ý") — một cửa sổ đòi chú ý (như
   `ui/windowAttentionHandler.js`) ở trên pill tới khi được focus hoặc im; "“…” is ready" của GNOME
   không hiện trong lúc đó.
6e. **print** (2026-11-23, Ethan; design/compact "Lệnh in") — signal của chính CUPS
   (`org.cups.cupsd.Notifier`, cho subscription của gsd; Buoy không có subscription nào); các thông
   báo "Printers" tương ứng của gsd bị ẩn.
6d. **network** (2026-11-23, Ethan; design/compact "Mạng") — NM.Client của Shell: kết nối, offline,
   VPN, không có Internet, captive portal. Không có hàng hay công tắc.
6c. **terminal** (2026-11-21, Ethan; design/compact "Lệnh terminal xong") — "Command completed" của
   Ptyxis thành một pill; mã thoát, thời gian và thư mục từ `hooks/shell.sh` (một dòng trong
   ~/.zshrc hoặc ~/.bashrc, cài từ prefs; file trong `$XDG_RUNTIME_DIR` chỉ đọc khi thông báo tới).
7. **privacy / recording** — các chấm, quay và chia sẻ màn hình, "In a call" (§2a-ii).
8. **several pills** — §2c.
9. **clipboard** — feedback copied (§2e) và, với `clipboard-history`, tab Clipboard (M5): chữ, link,
   màu, ảnh (`St.Clipboard.get_content`); tìm, ghim, xoá, xoá hết, 1–9 để dán; một hàng đặt
   clipboard, đóng island và dán (Ctrl+V bằng bàn phím ảo của Clutter, Ctrl+Shift+V trong terminal);
   bỏ qua `x-kde-passwordManagerHint`, một công tắc tạm dừng, app loại trừ, giới hạn cỡ và số lượng;
   trong bộ nhớ, chỉ lưu dưới `~/.cache/buoy/` nếu được chọn.
10. **Sound tab** (2026-11-05, Ethan) — một tab độc lập: mỗi app đang phát với âm lượng riêng, và
    thiết bị đầu ra, từ `ui/status/volume.js` `getMixerControl`.
11. **greeting** (FEATURES M4; lần chạy đầu và What's new là mục 5) — §2d, GREETING.md.

## 6c. Tab Transfers

*2026-11-03.* Những gì nó hiện bị giới hạn bởi các source của nó. `com.canonical.Unity.LauncherEntry`
chỉ đến từ **Files trên Ubuntu** (`12_unity_launcher_support.patch` của Ubuntu) và từ **Chrome chỉ
trên Unity hoặc KDE** (nó dlopen libunity theo `XDG_CURRENT_DESKTOP`; kiểm tra 2026-11-06). **Firefox
không gửi gì.** Nên trên GNOME trình duyệt đi vào qua việc theo dõi file (`downloads`).

**Chỉ có vòng khi source cho một tỷ lệ** — Buoy không bao giờ tự bịa ra:

| Biết | Leading | Text | ví dụ |
|---|---|---|---|
| một tỷ lệ (LauncherEntry) | vòng xác định | % | `◔ Chrome · 2 downloads  72 %` |
| chỉ một file đang lớn (`.part`, `.crdownload`) | icon tải xuống tĩnh | tên · cỡ · tốc độ | `⤓ report.pdf · 12 MB · 2.1 MB/s` |
| đã xong (đổi tên) | icon loại file | tên · thư mục | `report.pdf → Downloads` |

Không spinner hay vòng vô tận (nó sẽ chuyển động suốt và gợi ý có tiến độ). Tốc độ tính từ cỡ giữa
hai sự kiện `changed` của `Gio.FileMonitor` (khoảng một lần mỗi giây): Buoy không có timer nào. Khi
LauncherEntry của một app ứng với đúng **một** file đang lớn, hàng file có vòng; nhiều hơn thì hàng
app giữ %.

- **`progress` (M3).** libunity chỉ gửi khi `com.canonical.Unity` có chủ: Buoy cũng xin tên đó,
  nhường cho Ubuntu Dock (2026-11-05). LauncherEntry chỉ nói app nào đang bận (0–1, có thể một số
  đếm, urgent): mỗi app một pill và một hàng, cộng gộp (hai lần chép của Files là một "Files 55 %").
  - **Running** (đang chạy): icon, tên, số đếm khi có ("2 downloads"), %, một thanh mảnh.
  - **Done** (xong): "Name · Done" trong 3 s (mọi flash 3 s, 2026-11-16), rồi một hàng giữ 10 min,
    nhiều nhất 5. Done = ẩn ở ≥ 99 %; sớm hơn (bị huỷ) hoặc rời bus thì kết thúc không có Done.
  - Bấm thì focus cửa sổ của app (`Shell.AppSystem.lookup_app(id).activate()`). Thanh của compact
    ≥ 160 px.
  - Files đóng giữa chừng (2026-11-06, Ethan) thôi gửi và đăng "N file operations active"
    (GNotification `progress`), rồi `transfer-complete`: pill thành "Files · in background" (không
    vòng, không %), rồi "Files · Done"; mở lại, "Files · working" khi cửa sổ của nó mở. "In
    background" mờ đi sau 10 min.
- **`downloads` (M3).** Mỗi `.part` / `.crdownload` trong một thư mục được theo dõi là một hàng
  **Running** và một pill khi đã được ghi vào (tên, cỡ, tốc độ); file chưa từng được ghi trong lúc
  theo dõi thì không bao giờ hiện; 30 s không có byte thì mờ đi. `Unconfirmed 123456.crdownload` của
  Chrome (chữ + dấu cách + ≤ 6 chữ số, không đuôi; có bản dịch) hiện tên trình duyệt tới khi đổi
  tên. Trình duyệt là app đang chạy ghi các file như vậy (họ Chromium `.crdownload`, họ Firefox
  `.part`). Đổi tên rồi: "name → folder" trong 4 s, rồi một hàng **Downloaded** (giữ một giờ, nhiều
  nhất 5; file bị xoá thì rời đi): icon loại, tên, thư mục · app · giờ; bấm thì mở; "Open" chỉ icon
  (`document-open-symbolic`) và "Show in Files" (`folder-open-symbolic`,
  `org.freedesktop.FileManager1.ShowItems`); khi hover hay focus, tên nút thay dòng chi tiết (St
  không có tooltip). Bị xoá hay dời trước khi xong: không có hàng.
  - Thao tác trên một hàng đóng island và hàng Done/Downloaded rời danh sách (2026-11-06, Ethan); mỗi
    danh sách có một **×** chỉ icon làm trống nó, không bao giờ đụng tới file. Mọi hành động trong
    tab đưa một cửa sổ lên đều đóng island (kit `new Tab({close})`).
  - Theo dõi: thư mục Downloads (`GLib.get_user_special_dir(DIRECTORY_DOWNLOAD)`), luôn luôn; tới 10
    thư mục nữa trong `progress-folders` ("More download folders", bộ chọn thư mục của portal), mỗi
    cái một `Gio.FileMonitor` không đệ quy với WATCH_MOVES (mỗi cái một watch inotify, nên có giới
    hạn). Đã loại: Recent files (trình duyệt không bao giờ ghi vào đó).
- **Không dự định:** "nguồn → đích" cho một lần chép của Files (Nautilus không báo tên qua D-Bus).

Lộ trình: FEATURES.md. Dấu trạng thái: INDICATORS.md. Contract: CONTRACT.md. Mascot: MASCOT.md. Ghi
chú về đối thủ để ở máy trong `docs/notes/` (không commit).

## 7. BuoyKit

*2026-10-30.* Framework trước, tính năng sau (CONTRACT.md).

- **Lõi**: vòng đời activity (`surface / update / end / schedule / ask`), độ ưu tiên, ttl và stale,
  ba bậc, Home, chuyển động, D-Bus API.
- **Adapter mặc định** (`adapter.js` của mỗi module) vẽ mọi `kind` đủ tốt để một app lạ vẫn trông
  đúng.
- **Adapter theo app** (`modules/<id>/apps/<slug>.js`) chỉ ghi đè chỗ khác (đếm ngược quảng cáo của
  Spotify, avatar của Telegram). Adapter trả về dữ liệu trình bày, không bao giờ trả actor.
- Người gọi D-Bus gửi thẳng dữ liệu trình bày.

## 8. Không thương lượng

Không polling khi đóng; không blur; không bóng đổ nhoè; actor được dùng lại, không tạo lại; không gì
chuyển động khi idle (một thay đổi nội dung là một chuyển, §2a; equaliser đang phát là một activity,
§6); một module tắt không tốn gì.
