# D-Bus API

*Quyết 2026-11-03.*

Script và app biết Buoy gửi pill của riêng chúng. Chúng bỏ qua adapter, không bỏ qua người dùng:
app được slug và [profile](PROFILES.vi.md) của người dùng được áp. Ví dụ:
[`docs/examples/dbus/`](examples/dbus/).

| | |
|---|---|
| Bus | session |
| Đích | `org.gnome.Shell` (Buoy chạy bên trong Shell) |
| Đối tượng | `/org/gnome/Shell/Extensions/Buoy` |
| Interface | `org.gnome.Shell.Extensions.Buoy` |
| Phiên bản | property `Version` (u), hiện là `3` (`Agent` 2, `needsYou` / `linger` 3; 2026-11-07); tăng khi một method hay key thay đổi |

## Method

| Method | Trả về | |
|---|---|---|
| `Surface(a{sv} activity)` | `s id` | hiện nó, thay một `id` đã có; `''` khi profile của người dùng skip nó |
| `Update(s id, a{sv} patch, b alert)` | `b found` | đổi các key được đưa (`state` thay cả khối); `alert` mở rộng nó thoáng qua |
| `End(s id)` | `b found` | gỡ nó ngay |
| `Schedule(a{sv} activity, x startAt)` | `s id` | hiện nó lúc `startAt` (ms tính từ epoch) kèm alert |
| `Ask(s id, s question, as options, a{sv} opts)` | `s choice` | mỗi lựa chọn một nút; trả lời khi một nút được bấm, `opts.fallback` sau `opts.timeoutMs`, `''` khi bị end hoặc Buoy bị tắt. `opts.app` gọi tên bên hỏi |
| `Agent(s source, s event)` | `s reply` | một sự kiện hook của coding agent dưới dạng chữ JSON (`source` `claude`, do hook của Buoy gửi, [CODING-AGENTS.md](CODING-AGENTS.vi.md)); `''` với một báo cáo, stdout của hook với một yêu cầu cấp quyền đã được trả lời, `''` ngay lập tức khi module agent tắt. Tối đa 256 KiB |

Signal `Action(s id, s action)`: một nút của một activity của bạn được bấm. Theo dõi bằng
`gdbus monitor` (`examples/dbus/actions.sh`).

Id là của bạn (chữ cái, chữ số, `. : _ -`, tối đa 64), tách riêng khỏi id của module. Bỏ `id`
trong `Surface` để được tạo một id và trả về.

## Activity (`a{sv}`)

[CONTRACT.md §1](CONTRACT.vi.md) trừ các callback. `kind` bắt buộc, còn lại tuỳ chọn; key lạ là
lỗi.

| Key | Kiểu | |
|---|---|---|
| `id` | s | ở trên |
| `kind` | s | `progress`, `media`, `deploy`… tên bất kỳ; `ask` là của `Ask()`. Chọn tab (SPEC §2b) |
| `app` | s | id bất kỳ mà app dùng; được slug (`com.example.Deploy` → `deploy`) |
| `text` | s | chữ của pill; rút gọn bằng dấu …, không bao giờ cắt cụt |
| `leading`, `trailing` | s hoặc a{sv} | tên icon, hoặc `{'icon'}`, `{'art'}`, `{'progress': 0..1}`, `{'bar'}`, `{'countdown': s}`, `{'text'}`, `{'mascot': s}` (một dáng của Bu, chỉ leading, MASCOT.md; không biết → `icon` nếu có gửi, không thì `idle`) |
| `expanded` | b hoặc a{sv} | `true` = minimal phóng to; hoặc các vùng `leading`, `center` (`{'title', 'subtitle', 'progress'}`), `trailing`, `bottom` (`{'transport': true}`) |
| `actions` | aa{sv} | `[{'id', 'label'?, 'icon'?}]`: 1 hiện trong minimal, 3 trong compact và expanded; bấm → `Action` |
| `compact` | a{sv} | bậc hover (SPEC §2): `{'leading', 'text', 'trailing', 'transport'}` |
| `attributes`, `state` | a{sv} | dữ liệu của bạn; profile đọc `attributes` như một sự kiện |
| `priority` | số 0–100 | trong bậc của nó ([PRIORITY.md](PRIORITY.vi.md)), trên mọi app; mặc định theo kind |
| `needsYou` | b | bậc 1, trên mọi thứ chỉ đang chạy (Version 3) |
| `linger` | b | nó chỉ chờ: kết thúc sau `activity-linger` không có tin; khi đã stale thì lùi sau những gì đang chạy (Version 3) |
| `ttl`, `staleAfter` | số, ms | kết thúc sau `ttl` (tối đa 8 h); mờ đi sau `staleAfter` không có update |
| `style` | s | `standard` hoặc `transient` (mở expanded, kết thúc khi đóng) |
| `alert` | b | mở rộng thoáng qua khi nó xuất hiện |
| `keyline` | s | màu viền, `#rrggbb` (màu trạng thái được giữ riêng: INDICATORS.md) |
| `sizeHint` | s | `normal` hoặc `wide` |

Số có thể là bất kỳ kiểu số nào của D-Bus. Không bao giờ gửi kích thước (ARCHITECTURE luật 11).

## Giới hạn và lỗi

- Tối đa 32 activity của bạn cùng lúc (`LimitsExceeded`), mỗi cái 16 KiB.
- Key hay giá trị sai là `org.freedesktop.DBus.Error.InvalidArgs` kèm tên của nó: `unknown key
  "colour"`, `kind is required`, `priority: a number from 0 to 100`.
- Activity không gắn với kết nối của bạn (một `gdbus call` thoát ngay): dùng `ttl` hoặc `End`.

## Profile

`Registry.present()` (PROFILES.md "Cách kết hợp"): `skip`, `hideBody`, `replace` làm việc trên
`attributes` của bạn; `title` lấy giá trị từ chúng; `icon`, `priority`, `ttl` thay của bạn. Cả qua
`Update`: một update có attributes khớp `skip` sẽ end activity. `apps-hidden` ẩn app của bạn như
mọi app khác.

## Từ shell

```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/Buoy \
  --method org.gnome.Shell.Extensions.Buoy.Surface \
  "{'id': <'deploy'>, 'kind': <'deploy'>, 'app': <'ci'>, 'text': <'Deploying'>,
    'leading': <{'progress': <0.3>}>, 'ttl': <600000>}"
```

`Ask` chặn tới khi được trả lời: cho `gdbus` một `--timeout` dài hơn `timeoutMs`
(`examples/dbus/ask.sh`).
