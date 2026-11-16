# Tab Thiết bị

Tab ghim sau Calendar (SPEC §2b, [Tab](../tabs/index.vi.md)): các thiết bị của máy, gom ba nhóm. Tab
chỉ hiện những gì các module mang đến; mỗi phần làm trong mục của nó (Power, Headphones / display
plugged, Bluetooth device, USB / phone / webcam plugged, Phone via GSConnect). Số dùng chung ở
[Bảng số](../tokens.vi.md). *Ethan, 2026-11-16 (mục M4 "Device tab").*

![Mỗi nhóm một cột: laptop, máy bàn, nhiều thiết bị](images/columns.vi.png)

## Quyết định

- **Mỗi nhóm một cột** (phương án B, trong ba: danh sách theo nhóm, mỗi nhóm một cột, ô như Home).
  Nhìn một lần thấy hết, không cuộn. Nhóm không có thiết bị thì ẩn; các cột còn lại chia đều bề
  ngang. **Chốt** (Ethan, 2026-11-16)
- **Ba nhóm**, theo thứ tự: **Máy này**, **Không dây**, **Đang cắm**. **Chốt**
- **Máy này** chỉ có **Pin** và **Chế độ năng lượng**. Bàn phím, touchpad, màn hình laptop không
  thành ô: chúng luôn có mặt, HUD và Quick Settings đã lo phần thay đổi (đèn bàn phím, độ sáng,
  touchpad bật tắt); màn laptop tắt khi cắm màn ngoài thì ô màn ngoài nói ("Chỉ màn ngoài"). Máy bàn:
  Chế độ năng lượng, cùng **UPS** cắm USB nếu có. Không có gì thì nhóm ẩn. **Chốt** (Ethan, 2026-11-16)
- **Ô pin có công suất**: dưới tên, "dùng 11 W" khi chạy pin, "sạc 31 W" khi sạc (UPower
  `EnergyRate`, số flash "sạc chậm" đang dùng); chưa đọc được thì chỉ "Pin". Máy bàn không có số
  này: công suất CPU (Intel RAPL) chỉ root đọc được từ 2020. **Chốt** (Ethan, 2026-11-16)
- **Không dây**: thiết bị UPower có báo pin (chuột, bàn phím 2.4 GHz kiểu Logitech Unifying / Bolt, và
  Bluetooth), thiết bị Bluetooth đang nối của GNOME, điện thoại qua GSConnect (pin, tìm máy).
  Đầu thu 2.4 GHz không báo pin thì không thấy từng thiết bị. **Chốt**
- **Đang cắm**: màn hình ngoài, âm thanh có dây (tai nghe USB, jack), ổ USB, webcam, điện thoại cắm
  USB. Thứ gắn sẵn trong máy (camera tích hợp, adapter Bluetooth) không tính. **Chốt**
- **Wi-Fi, Ethernet, VPN** không ở tab này: là kết nối, không phải thiết bị; thuộc mục "VPN / Wi-Fi /
  captive portal", mục đó có thể thêm nhóm **Mạng** sau. **Đề xuất**, chờ chốt.

## Kích thước

- Thân dưới phần đầu 56, lề 12 như Home. Cột: (rộng nội dung − 8 × (n − 1)) / n; ở 1920 hai cột 268,
  ba cột 173.
- Trên mỗi cột: tên nhóm 0.7em 600 `fg-subtle`, viết hoa, cùng **số thiết bị** trong nhóm.
- **Ô 58**, bo 16 (= 28 − 12, đồng tâm), nền `fill-1`, cách nhau 6: icon 16 ở 12, **giá trị** chữ 600 bên
  phải (76%, Cân bằng, Nối), **tên** 0.85em `fg-muted` ở dưới, dài thì cắt "…". **Chốt**
- Ở 1920 mỗi cột vừa **3 ô**, ở 2560 vừa 4 (thân cao hơn). Nhóm nhiều hơn: ô cuối là **"+N"** kèm tên
  các thiết bị còn lại; bấm mở cả nhóm thành danh sách, như ô +K của Home. **Chốt**
- Trong nhóm: thứ tự của module mang đến (Máy này: pin rồi chế độ); thiết bị pin yếu lên trước.

## Bấm vào

![Bấm "+N" mở cả nhóm; bấm màn hình mở các cách dùng hai màn](images/pages.vi.png)

- Bấm mở một **trang thay chỗ các cột**, có ‹ về lại, hàng 36 bo 18 cách 4, như trang pin của Home
  ([Home](../home/index.vi.md), "Ô pin và chế độ năng lượng"). Danh sách dài hơn chỗ thì cuộn.
- **Pin, Chế độ năng lượng**: đúng trang pin của Home (các chế độ, chọn là đổi, Cài đặt nguồn).
- **Màn hình**: Nối / Nhân bản / Chỉ màn ngoài, đang dùng có ✓ (như compact cắm màn,
  [Compact](../compact/index.vi.md) "Cắm màn hình và tai nghe"), rồi Cài đặt màn hình.
- **"+N"**: cả nhóm, mỗi thiết bị một hàng với chi tiết (độ phân giải, dung lượng trống…).
- **Tai nghe, loa**: Cài đặt → Âm thanh. **Ổ USB**: mở trong Files. Các thiết bị khác: theo mục của chúng.

## Mục này làm gì

Tab và khuôn của nó, với những gì đã có: **Máy này** (pin, công suất, chế độ năng lượng; UPS) và
**Đang cắm** (màn hình ngoài từ module plugged; âm thanh có dây đang dùng). Không dây, ổ USB, webcam,
điện thoại đến với mục của chúng và chỉ cần thêm ô vào nhóm.

## Chỗ trong code

- `lib/modules/device/tab.js` — các cột, ô, "+N", trang thay chỗ; nhóm trống ẩn; "Coming soon" bỏ.
- Mỗi module mang ô của mình cho tab (pin và chế độ: power; màn hình, âm thanh: plugged), qua một
  phần chung trong `kit/` để module không import nhau.
- `lib/kit/model/power.js` — công suất từ `EnergyRate`; UPS từ UPower (`kind` ups).
- `stylesheet.css` — ô 58, tiêu đề nhóm.
