# Kiến trúc

*Quyết 2026-10-30.*

Tổ chức **theo module/tính năng**, như Isle và GSConnect. Đã loại: theo lớp (khó tắt một tính
năng), theo app (source của hệ thống không có app), mỗi module một extension (Để sau), adapter
chỉ có dữ liệu (engine sẽ phình thành một ngôn ngữ).

## Bố cục

```
src/buoy@murilegus/
├── metadata.json
├── stylesheet.css      kit and panel CSS, in sections (Stylesheets)
├── extension.js        enable(): panel → kit → enabled modules
├── panel.js            top bar: left cluster (app/workspace), bare tray, system cluster (QS + clock)
├── wallpaper.js        Shell's wallpaper, decoded once per change, for cluster-contrast
├── glyphs.js           one-colour bitmap tray icons (Electron's white glyphs), tinted like text
├── reach.js            Overview backgrounds reach under the see-through bar
├── corners.js          rounded top corners on maximized windows (SPEC §1a)
├── prefs.js            Adw pages: Island, Modules (grouped by kit/model/settings.js MODULE_GROUPS),
│                       Apps, Panel, Windows, About (version, Bu, `donations`, `dev-mode`)
├── schemas/            GSettings: the one source of every key, summary and range
├── hooks/              claude.js: Claude Code's hook (run by Claude Code), installed from prefs:
│                       stdin → D-Bus `Agent` (CODING-AGENTS.md); shell.sh: the shell hook for
│                       the terminal module (a line in ~/.zshrc or ~/.bashrc, from prefs)
├── icons/color/        daypart and weather SVGs, from scripts/icons.js
├── icons/symbolic/     `<theme name>-symbolic.svg` (Gravity UI and Buoy's own), from
│                       scripts/symbolic-icons.js (design/icons)
└── lib/
    ├── kit/            FRAMEWORK, the only thing modules import; three layers (2026-11-12),
    │   │               imports checked by `eslint.config.js`, tested in `tests/boundaries.mjs`
    │   ├── settings.js re-exports model/settings.js; 0.1's install.sh imports this path: keep it
    │   ├── model/      pure, GLib only (timer, variant); imports model/ only; tested with plain gjs
    │   │   ├── activity.js     contract (CONTRACT.md §1): validate, normalise
    │   │   ├── stack.js        injected clock; surface/update/end/schedule/ask; order (PRIORITY.md);
    │   │   │                   ttl, stale, transient, alert; `apps-hidden`; missed; `pillWindow`
    │   │   ├── presentation.js presentation data → render plan
    │   │   ├── shapes.js       pill sizes from monitor and em (rule 11)
    │   │   ├── home.js, tabs.js, keys.js   Home's plan (design/home); which tabs, where an open
    │   │   │                   starts; an ask's keys, ←/→
    │   │   ├── motion.js, flight.js        springs and fades; shared parts in flight (design/motion)
    │   │   ├── settings.js     each key's prefs page, samples
    │   │   ├── cluster.js, contrast.js, rounded.js   left cluster; text contrast; window corners
    │   │   ├── palette.js, cover.js        colour roles, high contrast, state colours
    │   │   │                   (design/colours); a cover's colour lifted for black
    │   │   ├── daypart.js, smartstack.js   hour → part from `daypart-starts`; `auto` by `relevance()`
    │   │   ├── weather.js, power.js, displays.js, audio.js, devices.js, bluetooth.js, drives.js,
    │   │   │   phone.js        plain state for those modules and the Device tab (design/device)
    │   │   └── mascot.js       Bu: 13 pose grids, lamp, frame timing (source: MASCOT.md)
    │   ├── services/   Shell side, no actors: buses, files, Shell objects, the one wall clock;
    │   │   │           imports model/ and services/, never ui/, St, Clutter
    │   │   ├── registry.js     app-id slugs, adapter resolution, app profiles
    │   │   ├── source.js       base class of a module's source.js
    │   │   ├── dbus.js         org.gnome.Shell.Extensions.Buoy
    │   │   ├── files.js        async reads: readText, listInfos/listNames, ppidOf, readPixels
    │   │   ├── apps.js         a bus peer's app: pid, /proc parents, window
    │   │   ├── presence.js     input in the last second, away (idle, locked), DND
    │   │   ├── idle.js         picks the idle plan; wall clock only while the idle pill shows
    │   │   ├── devtools.js     `dev-mode` hot swap
    │   │   └── sharing.js, weather.js, power.js, displays.js, audio.js, bluetooth.js,
    │   │       peripherals.js, drives.js, cameras.js, gsconnect.js   readers of GNOME's own
    │   │                       objects (Quick Settings, Gvc, Mutter, UPower, Gio, date menu)
    │   └── ui/         actors; imports anything in kit/, never a module
    │       ├── island.js       the pills together: capacity, slots, merge/split, grab, alert
    │       ├── pill.js         one pill: content, sizing, hover → compact, morph
    │       ├── spring.js       springs on the frame clock, one Clutter.Timeline per actor
    │       ├── strip.js        choices with a sliding fill (tab strip, Media chips)
    │       ├── home.js         what a click opens: tab strip + body
    │       ├── styles.js       a module's stylesheet.css while it runs
    │       └── present/        render plan → St actors, the ONLY place content actors are made:
    │                           parts.js, motion.js (rule 8), lists.js, flight.js, elements.js,
    │                           minimal.js, compact.js, expanded.js
    └── modules/<id>/   FEATURES, one self-contained folder each (files below)
```

Ảnh bìa (`present/elements.js`) là một St.Icon nạp async và bo góc bằng một Shell.GLSLEffect,
không phải CSS background-image, thứ mà St giữ trong texture cache của nó.

| File của module | Vai trò |
|---|---|
| `index.js` | `export default {id, kinds, source, adapter, tab?, title?, icon?, tabWhileLive?, tabInMore?, noTab?, badge?, home?, feed?}`. `title`, `icon`: tab của nó. `tabWhileLive`: chỉ có tab khi activity của nó còn đó, đứng trước slot. `tabInMore`: tab nằm trong ⋯; đi cùng `tabWhileLive` thì live khi activity của nó còn đó (Phone). `noTab`: activity tự mở (greeting). `badge()`: một chấm trên icon của tab. `home`: `{Card}` hoặc `{Glance, order, wide}` |
| `source.js` | theo dõi một phần của hệ thống, gọi `stack.surface/update/end`; `enable(stack, registry, settings, {dbus, extension})`; key của nó là `<id>-…` |
| `adapter.js` | presentation mặc định cho các kind của nó |
| `tab.js` | tuỳ chọn. `new Tab({close, from})` → `{actor, destroy(), update?(activities), choose?(id)}`. `from`: activity của pill đã mở nó; `update`: các activity của một tab theo kind, ngay từ đầu và mỗi khi đổi; `choose`: activity của nó được bấm trên Home; `close()`: sau một thao tác đưa một cửa sổ lên. Dựng ở lần chọn đầu, huỷ khi expanded đóng |
| `home.js` | tuỳ chọn (SPEC §3, design/home). `new Card({open, close})` → `{actor, show(activity, {height, form, width}), destroy()}` (media). `new Glance({open, close, changed, settings})` → `{ready, tile: {icon, value, caption, detail?}, wide?(width), activate(), refresh?(), destroy()}`, `changed()` khi ô đổi (weather, calendar, battery). Tạo khi Home hiện lần đầu, huỷ khi expanded đóng |
| `idle.js` | idle plan tuỳ chọn, thuần: `keys` (`idle-<id>-…`), `present(ctx, opts)` → presentation data (`compact` = bậc hover của pill idle), `seconds(opts)` (nhịp mỗi giây), `ticks: false` (không cần đồng hồ thực), `relevance(ctx, opts)` cho `auto` (SPEC §2a-iii); `ctx = {now, clock, starts, data}` |
| `feed.js` | phần phía Shell tuỳ chọn cho dữ liệu của một idle plan: `feed` trong index.js, `new Feed(onChanged)` → `{state, shown(shown, opts), destroy()}`, `state` = `ctx.data`. kit/services/idle.js tạo nó khi plan của nó đang được dùng và báo cho nó khi pill idle hiện, nên nó chỉ lấy dữ liệu lúc đó (luật 8) |
| `stylesheet.css` | tuỳ chọn: CSS cho tab và khối Home của nó (Stylesheets) |
| `apps/<slug>.js` | override theo app, cùng các method như `adapter.js` |

Một module có thể thêm các file thuần đáng test riêng (`agenda.js`, `month.js` của calendar;
`layout.js` của media) và một bộ đọc phía Shell mà feed và tab của nó dùng chung (`events.js`
của calendar). Thứ mà hai module cùng cần thì thuộc về kit (luật 1), như weather đã chuyển vào
đó (2026-11-26, GREETING.md §8).

### Stylesheets

*2026-11-12.* Các phần của `stylesheet.css`, theo thứ tự: panel, pill và nội dung, compact, card,
Home và thanh tab. CSS riêng của một module (tab, khối Home) là `lib/modules/<id>/stylesheet.css`,
do `kit/ui/styles.js` nạp khi module chạy (luật 6: tắt thì không có gì của nó được nạp), như
Shell nạp stylesheet của một extension (`ui/extensionSystem.js` `_loadExtensionStylesheet`, không
`@import`); nạp lại theme vẫn giữ nó (`ui/main.js` `loadTheme`).

- Cùng độ đặc hiệu thì **`stylesheet.css` thắng stylesheet của module** (`st-theme.c`
  `st_theme_load_stylesheet` chèn vào đầu, `_st_theme_get_matched_properties` sắp xếp ổn định;
  Shell nạp của Buoy trước). Rule CSS của module muốn đổi kiểu một class của kit thì ghi cả
  container của chính nó (`.buoy-agents-line .buoy-agents-time` thay cho `.buoy-label`).
- Class của một module là `buoy-<từ của nó>-…`, chỉ nó dùng; class của kit chỉ được tạo kiểu
  trong `stylesheet.css`.

Màu: trong island mọi màu là một vai trò của `kit/model/palette.js` (design/colours), viết bằng
giá trị của nó, tên vai trò ghi trong comment (St không có biến CSS); thanh giữ màu của GNOME.
`tests/palette.test.js` báo lỗi khi gặp màu không thuộc vai trò nào hoặc sai vai trò. Tương phản
cao (`St.Settings` `high-contrast`) thêm `buoy-hc` vào island; mỗi stylesheet kết thúc bằng các
rule `.buoy-hc` nâng `border`, `border-strong`, `fg-subtle`, `fg-disabled` ở mọi chỗ chúng được
dùng (có test), rồi tới các rule vẫn phải thắng (`.buoy-media-on`, trong calendar).

### Các loại module

| Loại | Có | Ví dụ |
|---|---|---|
| **source module** | `kinds`, `source.js`, `adapter.js`; tuỳ chọn `tab.js`, `apps/` | media, hud, progress, agent (hỏi qua `ask` của kit), copied |
| **idle plan** | `idle.js` (có thể đồng thời là source module: calendar) | clock, weather, calendar, mascot |
| **standalone tab** | chỉ `tab.js`, `kinds: []`; không bao giờ surface activity | launcher; tab của một module chỉ có feedback (phản hồi cho việc bạn vừa làm) (`clipboard`, SPEC §2b) |

Module của v0.1: `media`, `hud`, `home`, `progress`, `copied` và `clipboard` (hai công tắc,
2026-11-07, Ethan), `input`, `agent`; stub `notification`, `timer` để tab của chúng hiện
(2026-11-02); idle plan `clock`, `weather`, `calendar`; standalone tab `calendar`, rồi
`clipboard`; `greeting`: lần chạy đầu và What's new, phần còn lại ở M4 (2026-11-08).

## Ngoài extension

*2026-11-08.*

- `install.sh` cài, cập nhật, gỡ Buoy không qua EGO (release, zip hoặc clone) và để lại
  `.check-updates`: chỉ khi đó greeting mới hỏi GitHub xem có release không (GREETING.md §11).
  Gỡ cài dùng `hooks.js` và `lib/kit/settings.js` đã cài; cả hai đường dẫn được giữ cho mọi
  install.sh từ 0.1.
- Một tag `v<version-name>` phát hành một release (`.github/workflows/release.yml`,
  `scripts/release-check.sh`, ghi chú ở `docs/releases/<version-name>.md`).
  `tests/metadata.test.js` giữ tên phiên bản giống nhau trong metadata.json, notes.js,
  package.json và kiểm tra `settings-schema` (`enable()` ném lỗi khi thiếu nó).
- `README.md` dành cho người dùng; `CONTRIBUTING.md` chứa cây repo, cách cài môi trường và các
  bước release.

**Docs và site của chúng** (2026-11-10, FEATURES M4 "Design docs and site"). `docs/` song ngữ:
`page.md` tiếng Anh, `page.vi.md` tiếng Việt. Trang thiết kế được quyết bằng tiếng Việt trước;
các docs khác giữ tiếng Anh làm bản gốc (dịch 2026-11-27; sửa một bản thì sửa bản kia trong cùng PR; FEATURES chỉ có tiếng Anh). `mkdocs.yml` dựng
site (MkDocs Material, mkdocs-static-i18n) chỉ trong CI (`.github/workflows/docs.yml` → GitHub
Pages; phiên bản trong `requirements-docs.txt`), không bao giờ trong extension hay `package.json`.

```
docs/design/
├── index.vi.md       units and rules for every part (em, 56 + 16n, concentric radii); index.md in English
├── tokens.vi.md      the one table of numbers: sizes, radii, gaps, type
├── render/lib.js     shared by render scripts: draws at 3×, fits text to its 1× width, t(vi, en)
└── <part>/           colours, pill, compact, alerts-and-asks, expanded, home, media, device, tabs,
    │                 icons, mascot, motion
    ├── index.vi.md   purpose, anatomy, sizes, states, decisions (date, who), open, code
    ├── images/       x.vi.png, x.en.png (x.png when it has no words); the site serves each as x.png
    ├── clips/        x.vi.png, x.en.png: motion as animated PNG, 30 fps (scripts/apng.js)
    └── render/       gjs scripts drawing the images; scripts/render-design.sh runs them all
```

Script và `render/` nằm ngoài site (`exclude_docs`).

## Luồng dữ liệu

```
source.js ──ev──► registry.build(kind, app, ev) ──activity──► stack ──► island/present
                      │
                      ├─ ~/.config/buoy/apps/<slug>.json   (user, data only)
                      ├─ modules/<m>/apps/<slug>.js[kind]   (repo, code)
                      └─ modules/<m>/adapter.js[kind]        (default)
D-Bus callers send presentation data: no adapter, but the app is slugged and the profile
applied (Registry.present). API: DBUS.md.
```

### Profile của app

*2026-11-02.* `~/.config/buoy/apps/<app>.json`, chỉ có dữ liệu (luật 7), registry áp cho mọi
adapter và nạp lại khi file đổi; adapter không bao giờ thấy chúng. [PROFILES.md](PROFILES.vi.md).

## Luật

1. **Module chỉ import `kit/`**, không bao giờ import module khác; chúng nói chuyện với nhau qua
   activity. Trong kit, `model/` chỉ import model/ và GLib, `services/` không bao giờ import
   `ui/`, St hay Clutter, không phần nào import một module. `pnpm lint` kiểm tra
   (`eslint.config.js`, các trường hợp trong `tests/boundaries.mjs`, 2026-11-12).
2. **`kit/` được import `Main`/Shell. `adapter.js` và `apps/*.js` thì không**: không `St`,
   `Main`, timer; thuần `event → presentation data`, test được bằng `gjs`. `source.js`, `tab.js`
   được dùng API của Shell. `adapter.js`, `apps/*.js`, `idle.js`, `hooks.js` chỉ import file
   trong module của chúng và `kit/model/`; prefs.js không import gì cần tới Shell (`kit/ui/`,
   `St`, `Main`, source, tab, home, feed của một module). Lint kiểm tra cùng luật 1.
3. **Adapter trả dữ liệu, không bao giờ trả actor**, theo hình dạng mà `presentation.js` quy
   định: `{leading,
   text, trailing, expanded:{leading,trailing,center,bottom}, actions, ttl, priority, keyline,
   style, sizeHint, onPress, compact}` (`compact` = bậc hover, SPEC §2); override cũng vậy. Tên
   trong code theo các bậc (2026-11-05): `shapes.minimal`/`planMinimal`/`buildMinimal` (pill
   trên thanh), `planCompact`/`buildCompact` (hover), `shapes.side` (pill phụ 120 px).
4. **Override theo app nằm trong module của kind mà nó override.** Một app ở hai kind có hai
   file nhỏ; không có `apps/<app>/` chung.
5. **Mỗi app một slug** trên mọi source (tên bus MPRIS, desktop id, tên app của thông báo), lấy
   từ bảng trong `kit/services/registry.js`; module chỉ thấy slug.
6. **Module tắt = không được import** (`modules-<id>` false): không signal, không actor, không
   tốn gì. Ẩn một app (`apps-hidden`) là bộ lọc của stack, không phải việc của adapter.
7. **Không nạp code lúc chạy** (EGO). Người dùng chỉ tuỳ biến bằng profile JSON (icon, mẫu tiêu
   đề, ẩn nội dung, độ ưu tiên, ttl, regex đơn giản); logic cần một PR. Cũng vì việc review của
   EGO: không IO file đồng bộ trong Shell (`kit/services/files.js` là async; trừ việc nạp
   stylesheet của St, vì Shell cũng làm vậy); signal gắn bằng
   `connectObject`/`disconnectObject`; đối tượng Extension được truyền xuống từ `extension.js`,
   không bao giờ tra theo URL.
8. **Không polling khi đóng; không blur; không gì chuyển động khi idle.** Source nào buộc phải
   poll (vị trí tiến trình) chỉ poll khi activity của nó đang hiện. Chuyển động = chuyển động
   lặp hoặc liên tục; một thay đổi nội dung idle (phút của đồng hồ, `auto` đổi plan) là một lần
   chuyển, rồi đứng yên (2026-11-03). Được phép, nhưng không bao giờ khi hoạt ảnh bị tắt:
   - Mắt của Bu: một nhịp theo kịch bản vài giây một lần, vài khung hình nhảy bậc, chỉ khi đang
     hiện và đang dùng; ngủ sau 60 s không có thao tác và khi ở chế độ tiết kiệm điện
     (`MASCOT.md` § Eyes, 2026-11-03).
   - Các dáng chuyển động của Bu: hai khung hình mỗi 500 ms khi pill của nó đang hiện (mapped);
     đứng yên sau `mascot-rest-after` (60 s) không có thao tác (`MASCOT.md` § Drawing rules,
     2026-11-04).
   - Equaliser của media: chỉ khi đang hiện và đang phát (dừng: các thanh thấp đứng yên,
     `eq-paused`), mỗi thanh một `scale-y` không dứt; không nghỉ khi không có thao tác, nhạc vốn
     phát khi không ai đụng tới (2026-11-05, Ethan).
   - Tiêu đề quá dài so với compact hoặc tab Media thì chạy chữ khi đang hiện: một
     Clutter.Timeline, chỉ dịch chuyển (2026-11-05, Ethan).
9. Mọi setting là một key trong `schemas/…gschema.xml` có `<summary>` và `<description>` (prefs
   hiển thị chúng; `<range>`/`<choices>` giới hạn giá trị). Không có key xem trước: hàng của một
   module có "Show a sample", gửi qua D-Bus `Surface`. Key của một module là `<id>-…` trong hàng
   Modules của nó, **trừ key của idle plan**: `idle-<plan>-…` nằm dưới plan của chúng trên trang
   **Island** (2026-11-04, Ethan); module chỉ là idle plan (clock, weather) có công tắc ở đó và
   không có hàng Modules (2026-11-06, Ethan). `kit/model/settings.js` cho mỗi key một chỗ và
   liệt kê các idle plan, vì prefs.js không import được index.js của module (2026-11-03); ngoại
   lệ là `modules/agent/hooks.js`, thuần, cho setting của Claude Code (2026-11-07).
   `tests/settings.test.js` báo lỗi khi một key không có chỗ hoặc không có chữ, hoặc
   `idle-<plan>-…` nằm chỗ khác. Một key vào cùng với mục làm ra nó. Key cấp Shell (cụm, góc cửa
   sổ) có trang riêng; code của chúng nằm cạnh `panel.js`.
10. Standalone tab (SPEC §2b, 2026-11-13): Calendar và Devices được ghim mặc định
    (`tabs-pinned`); slot hiện standalone tab khác đầu tiên (Clipboard) cho tới khi tab khác
    được chọn; ⋯ liệt kê các tab không ghim, tab đang ở slot được đánh dấu.
    Mỗi tab dựng actor ở lần chọn đầu và huỷ nó khi expanded đóng; khi đóng thì không tốn gì.
11. **Adapter không bao giờ trả số đo**: không `width`, `height`, `x`, px hay truy vấn màn hình,
    chỉ nội dung và gợi ý rời rạc (`size: 'wide'`, `priority` của vùng). `kit/model/shapes.js`
    suy ra cỡ từ màn hình; renderer làm nội dung vừa chỗ (rút gọn bằng dấu …, bỏ các vùng có độ
    ưu tiên thấp). Adapter viết trên một màn hình chạy được trên mọi màn hình.

## Mô hình setting

Liệt kê cả các key dự kiến; schema chứa các key đã có. Mọi key áp dụng ngay (prefs hoặc
`gsettings`); `modules-<id>` chỉ bật hoặc tắt riêng module đó.

| Key | Kiểu | Tác dụng |
|---|---|---|
| `modules-<id>` | b | module chạy (công tắc ở hàng của nó) |
| `apps-hidden` | as | các app có activity không bao giờ hiện; id bất kỳ, được slug (2026-11-02) |
| `apps-plain` | as | các app dùng adapter mặc định, không dùng override của nó; id bất kỳ, được slug |
| `idle-content` | s | `auto` (mặc định) \| `none` \| id của một idle plan |
| `idle-auto-plans` | as | các plan mà `auto` hiện, lần lượt; mặc định `calendar`, `weather`, `clock`, `mascot` (mắt của Bu bật mặc định, 2026-11-14) |
| `idle-auto-switch` | s | số phút mỗi lượt `auto`: `5m` (mặc định), `10m`, `20m`, `30m` (2026-11-13, Ethan) |
| `daypart-starts` | ai | giờ bắt đầu của rạng sáng, sáng, trưa, chiều, tối, đêm; mặc định `[5, 7, 11, 13, 18, 22]`, sai → mặc định. Island → When Idle → Parts of the day: icon màu của mỗi buổi và một danh sách thả xuống các giờ bắt đầu, không bao giờ trống hay sai thứ tự (2026-11-13) |
| `tabs-pinned` | as | các standalone tab hiện cố định; mặc định `['calendar', 'device']`; không có hàng trong prefs |
| `tabs-slot` | s | tab ở slot, đặt từ ⋯; trống = tab bật đầu tiên (2026-11-02) |
| `dev-mode` | b | mở hot swap `stateObj.reload(id)` |
| `cluster-background` | s | never \| hover \| always; mặc định `hover` (2026-11-04) |
| `cluster-radius`, `cluster-opacity` | i | bo góc của nó 0–16 px, mặc định `16`; độ đục 5–100 % của màu chữ trên panel, mặc định `17` |
| `cluster-contrast` | s | auto \| dark-text \| light-text (gọi theo màu chữ); mặc định `auto` |
| `left-cluster-empty` | s | workspace \| hidden |
| `clock-`, `dock-`, `weather-defaults-applied` | b | lần bật đầu tiên đặt, ở chỗ chưa được đặt: đồng hồ của GNOME (chỉ giờ, 24 h); Ubuntu Dock `dash-to-dock` (ở dưới, tự ẩn, không kéo hết cạnh, 32 px, màn hình chính, không thùng rác hay ổ đĩa) (2026-11-04); `org.gnome.GWeather4` `temperature-unit`, `speed-unit` °C, km/h (2026-11-06). Hàng prefs của chúng là key riêng của các app đó |
| `window-corners` | b | bo góc trên của cửa sổ chạm thanh (maximize, xếp cạnh, kéo lên); mặc định `true` (2026-11-04) |
| `window-corners-radius` | i | px logic, 0–32; mặc định `15` (Adwaita `--window-radius`) |
| `idle-clock-style`, `idle-weather-refresh`, `idle-weather-automatic`, `idle-mascot-stroll` | — | do các module đó: refresh `30m` \| `1h`, mặc định `30m`; automatic mặc định `true`: vị trí từ Geoclue, không được thì thành phố trong prefs (2026-11-06); stroll mặc định `true`: mắt Bu nhìn quanh (2026-11-14) |
| `greeting-style`, `-farewell`, `-name`, `-birthday`, `-holidays`; ghi chép nội bộ `-intro-shown`, `-boot`, `-session`, `-asleep` | — | do `greeting` (GREETING.md §9) |
| `expanded-width` | i | px logic; `0` (mặc định) = theo màn hình. Không có key chiều cao: chiều cao vừa nội dung, tối đa width/2, như iOS (2026-11-01) |
| `progress-folders` | as | thư mục tải về ngoài XDG Downloads, ≤ 10, không đệ quy (SPEC §6c) |
| `keybind-focus` | as | lấy bàn phím: vòng focus trên pill giữa, ←/→, Enter, Esc; mặc định Super+B (SPEC §2c) |
| `mascot-rest-after` | i | số giây không có thao tác trước khi Bu đang chuyển động đứng yên, 10–600, mặc định 60; của kit; Island → Pill (2026-11-07) |
| `activity-linger` | s | `5m` \| `10m` \| `20m` \| `30m`, mặc định `5m`: một activity `linger` (player đang dừng, agent đã xong hoặc đang chờ) ở lại bao lâu khi không có tin mới, và một yêu cầu cấp quyền chờ bao lâu trước khi Deny (SPEC §2, 2026-11-07, Ethan); Island → Pill |
| `notification-replace-banners` | — | do notification (NOTIFICATIONS.md §9): banner thành pill, mặc định `true`; tắt thì dùng banner của GNOME (2026-11-07) |
| `agent-quiet-focused` | — | do agent (CODING-AGENTS.md §9): không tự mở khi terminal của phiên đang được focus, mặc định `true`. Hook đã cài hay chưa: `~/.claude/settings.json` |
| `privacy-dot` | — | do privacy (INDICATORS "Chấm riêng tư", 2026-11-14): `pill` (mặc định) chấm, ẩn icon camera, micro, truy cập từ xa và nút quay/chia sẻ màn hình của GNOME; `system` chỉ của GNOME; `both` |
| key theo module | — | do module khai báo |

## Để sau

- Extension vệ tinh (`buoy-<module>@…`) qua D-Bus khi contract đã ổn định.
- Activity hẹn giờ cần được lưu lại qua các lần khởi động lại Shell.
