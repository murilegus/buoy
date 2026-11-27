# Profile của app

*Quyết 2026-11-02.*

Profile đổi cách một app hiện trên pill, không cần code: mỗi app một file JSON trong
`~/.config/buoy/apps/`. Nó là của bạn: Buoy không kèm profile nào; hành vi theo app của dự án là
code trong `modules/<m>/apps/<slug>.js` (ARCHITECTURE luật 4). Ví dụ:
[`docs/examples/apps/`](examples/apps/).

## Ở đâu và khi nào

- Mỗi app một file, đặt theo tên app và được slug như mọi id app: `com.spotify.Client.json`,
  `Spotify.json` và `spotify.json` là cùng một app. Giữ một file; có hai thì file nào thắng là
  không xác định.
- Đọc khi bật và mỗi khi một file trong thư mục đổi (file monitor: lưu là đủ). Thư mục có thể là
  symlink.
- File có lỗi bị bỏ qua cả file, kèm một cảnh báo nêu tên nó:
  `journalctl -f -o cat /usr/bin/gnome-shell | grep 'app profile'`.

## Key

Tất cả đều tuỳ chọn. Key lạ là lỗi, nên gõ sai sẽ được báo, không bị lờ đi.

| Key | Kiểu | Tác dụng |
|---|---|---|
| `icon` | chuỗi | tên icon; thay phần tử bên trái của pill |
| `title` | chuỗi | mẫu cho chữ của pill, dựa trên các trường của sự kiện: `"{artist} — {title}"`; trường không có thì để trống |
| `hideBody` | boolean | `body` của sự kiện không bao giờ tới adapter (nội dung thông báo) |
| `priority` | số 0–100 | thay mặc định của kind trong bậc của activity: không bao giờ đưa một activity đang chờ lên trên một activity đang chạy ([PRIORITY.md](PRIORITY.vi.md)) |
| `ttl` | số, ms | activity sống bao lâu; vẫn bị giới hạn ở 8 h |
| `replace` | danh sách | `{field, pattern, with, flags?}` thay bằng regex trên một trường chuỗi, theo thứ tự, trước adapter; `with` có thể dùng `$1` |
| `skip` | object | `{field, pattern, flags?}`: sự kiện có trường khớp thì không hiện gì |

`flags` có thể chứa `i` (không phân biệt hoa thường), `m` (nhiều dòng), `s` (`.` khớp cả ký tự
xuống dòng). Pattern là biểu thức chính quy JavaScript trong chuỗi JSON (`\s` là `"\\s"`).

## Trường của sự kiện

`title`, `replace` và `skip` làm việc trên các trường mà source gửi:

| Kind | Trường | Từ |
|---|---|---|
| `media` | `title`, `artist`, `art`, `status`, `length` | MPRIS (M3) |
| `notification` | `title`, `body`, … | khay thông báo (M4) |
| bất kỳ, qua D-Bus | `attributes` của bên gọi | [DBUS.md](DBUS.vi.md) |

## Cách kết hợp

1. `skip` của profile, rồi `hideBody` và `replace`, đổi sự kiện.
2. Override của app (`modules/<m>/apps/<slug>.js`) dựng pill, hoặc adapter mặc định của module
   khi không có override hoặc app nằm trong `apps-plain`.
3. `title`, `icon`, `priority`, `ttl` của profile đặt lên trên cùng.

Profile vẫn áp dụng trong `apps-plain`; `apps-hidden` ẩn app bất kể profile của nó nói gì. Bên
gọi D-Bus gửi thẳng pill của họ; profile của họ coi `attributes` là sự kiện, kể cả qua các update
(2026-11-03, [DBUS.md](DBUS.vi.md)).
