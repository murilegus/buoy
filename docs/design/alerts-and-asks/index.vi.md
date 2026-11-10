# Alert và ask

Hai cách một activity tự mở ra mà không cần bấm: **alert** chỉ báo, **ask** chờ bạn trả lời. Cả
hai ở cỡ compact, không mở expanded (trước đây alert mở expanded rộng 560 — to hơn cả card thông
báo, trong khi alert nhẹ hơn một tin mới). Số dùng chung ở [Bảng số](../tokens.vi.md).

## Alert

- Hiện compact của activity, đúng cái thấy khi rê chuột, **ngay trên pill của nó** (không dời ra
  giữa, không có thanh tab, không giành bàn phím); các pill bên cạnh mờ đi tại chỗ như khi rê chuột
  (SPEC §2c). Hiện **5 s** rồi tự ẩn; rê chuột vào thì giữ lại. Activity không có compact thì phồng
  lên một nhịp như trước. **Chốt** (Ethan, 2026-11-10)
- Nhạc **không alert**, kể cả khi đổi bài. **Chốt** (Ethan, 2026-11-10)

## Ask

- Cũng ở cỡ compact, và **đứng đó đến khi có câu trả lời** (hoặc hết `timeoutMs` thì dùng
  `fallback`). **Chốt** (Ethan, 2026-11-10)
- Bố cục như card: phần đầu 56 (Bu ở leading 40, câu hỏi 1em, "app · việc cần làm" 0.85em), thân
  tùy có (lệnh, chi tiết) theo dòng 16, hàng nút cách mép 12; không có nút ×: phải chọn một nút.
  **Cao theo nội dung**, cùng công thức với card: 56 + 8 + 16 × số dòng + 12 + 32 + 12 = **120**
  không có thân, **136** một dòng, **152** hai dòng. Thân tối đa 2 dòng như card tin nhắn, dài hơn
  thì cắt bằng "…". Số nút theo câu hỏi (3: Deny · Allow · Always, 2: Deny · Allow), trải đều bề
  ngang. **Chốt** (Ethan, 2026-11-10)

![Ask của Claude Code có nút, chờ trả lời: 120 / 136 / 152](images/ask.vi.png)

## Hỏi nhiều lựa chọn

**Chốt** (Ethan, 2026-11-11; đề xuất 2026-11-10). Claude Code AskUserQuestion: hiện Buoy chỉ hiện "Needs your answer" và
để bạn chọn trong card của Claude. Quyết định này cho Buoy trả lời được, nên đổi quyết định "A question
is not a permission" (CODING-AGENTS.md, 2026-11-08).

- Phần đầu 56 (Bu, câu hỏi 1em, "Claude Code · dự án · 1 / 3" 0.85em).
- Mỗi lựa chọn một **hàng 32, một dòng**: nhãn 1em đậm, mô tả 0.85em xám cùng dòng, dài thì cắt
  "…". Hai dòng 1em + 0.85em cần 18 + 16 = 34, không vừa 32; nhỏ hơn thì xuống dưới cỡ nhỏ nhất của
  GNOME, 9pt ≈ 0.82em (`%caption` trong gnome-shell-sass `_common.scss`). (Ethan, 2026-11-10)
- Dấu chọn 16 ở cột leading: tròn khi chọn một, vuông khi chọn nhiều.
- **Other** là hàng cuối: chưa chọn thì ghi "Type your own answer" màu xám; chọn rồi thì hàng thành
  ô nhập ngay trong card (viền màu nhấn như ô nhập của GNOME). Bấm vào ô thì Buoy nhận bàn phím (bấm
  vào island là của bạn, SPEC §2); Enter hoặc Submit gửi đi. (Ethan, 2026-11-10)
- Cao 56 + 8 + 32 × số hàng + 12 + 32 + 12: 2 lựa chọn + Other = 216, 4 + Other = **280** — vượt
  152 của compact, tối đa bằng expanded (rộng/2); rộng như compact lớn nhất (404 ở 1920).
- Nhiều câu hỏi thì lần lượt từng câu, "1 / 3" ở dòng phụ: các câu trước câu cuối có Skip · **Next**,
  câu cuối có **Back** · **Submit**.
- **Lưu**: câu trả lời chỉ nằm trong card, trong bộ nhớ, đến khi gửi hoặc ask kết thúc (Buoy không
  lưu gì, CODING-AGENTS quy tắc 3): mỗi câu giữ các nhãn đã chọn và chữ đã gõ ở Other; Next và Back
  chỉ đổi câu đang hiện, không mất gì.
- **Gửi**: một lần, khi Submit ở câu cuối — hook trả `allow` với `updatedInput` = input cũ cộng
  `answers` = {nội dung câu hỏi: câu trả lời} cho mọi câu: chọn một là nhãn; chọn nhiều là các nhãn
  nối bằng ", "; Other là chữ đã gõ (chọn nhiều có cả Other thì chữ đó nối sau các nhãn). Không gửi
  từng câu được: tài liệu chỉ có một `answers` cho cả lần gọi
  ([hooks reference](https://code.claude.com/docs/en/hooks.md)).
- **Skip**: Buoy không trả lời, câu hỏi ở lại trong Claude Code như hiện nay. Nếu Claude không nhận
  chữ tự do qua đường Buoy dùng: câu nào chọn Other thì Buoy không trả lời cả lần gọi mà đưa Claude
  Code lên để gõ ở đó.

![Hỏi nhiều câu: câu 1 / 3 với Next, câu cuối 3 / 3 chọn nhiều với Submit](images/question.vi.png)

### Đã thử

2026-11-10, Claude Code 2.1.319, Haiku, phiên `-p` cô lập (chỉ nạp settings tạm; một MCP server nhỏ
làm permission host, vì không có host thì `-p` không đưa tool này cho mô hình):

- Hook **PreToolUse** trả `allow` + `updatedInput.answers` thì Claude nhận đúng, gồm cả chữ tự do và
  nhãn trộn chữ ("GJS, TypeScript, Vala cho phần đo chữ"), hai câu trong một lần. Claude nhận chuỗi
  `The user answered: "câu 1"="trả lời 1", "câu 2"="trả lời 2". Read the answers carefully…`.
- `allow` mà không có `answers`: Claude nhận "The user did not answer the questions."
- Dấu phẩy trong chữ không được thoát: Claude chỉ thấy một chuỗi.
- **Chưa thử được** đường **PermissionRequest** (đường Buoy đang dùng): trong `-p`, quyết định của
  hook này bị permission host lấn (host trả deny thì Claude nhận "HOST DENIED" dù hook đã trả lời),
  nên phải thử trong một phiên tương tác thật khi làm code. Thiếu một câu trong `answers` cũng chưa
  rõ.

## Chỗ trong code

- `lib/kit/island.js` — alert mở compact của pill (không `_openPill` ra giữa); ask là card ở cỡ
  compact, giữ đến khi trả lời.
- `lib/modules/media/adapter.js` — bỏ `expanded` (không bao giờ hiện: nhạc không alert, không ask,
  đã có `tab.js`).
- `lib/modules/agent/adapter.js` — ask thành card; câu hỏi nhiều lựa chọn nếu đề xuất được duyệt.
- SPEC §2 (bảng các dạng: alert và ask ở cỡ compact).
