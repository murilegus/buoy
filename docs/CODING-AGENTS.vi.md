# Coding agent — Claude Code trên pill

Các session của một coding agent trên island: đường đi của event, mỗi session một pill, các tư
thế của Bu, lời xin quyền, các luật im lặng, cài hook. FEATURES M3 "Claude Code: ask + agent
activity" trỏ tới đây; màu các tư thế: MASCOT.md § Agents. Quyết cùng Ethan, 2026-11-07.
Claude Code trước, Codex sau (§10). Không đặt tên `AGENTS.md`: agent đọc file đó như chỉ dẫn
của chính nó. Nguồn: tài liệu tham khảo hook của Claude Code (code.claude.com/docs/en/hooks),
đọc ngày 2026-11-07 (§13).

## Nguyên tắc

1. **Session, không phải prompt.** Mỗi session một pill, từ prompt đầu tới lúc kết thúc: dự
   án, Claude đang làm gì, đã bao lâu; tư thế của Bu cho biết mọi việc ra sao.
2. **Không bao giờ làm Claude chậm lại.** Các hook báo cáo là `async`. Chỉ lời xin quyền phải
   chờ, và `PostToolUse` chờ vài ms để ■ dừng được lượt (2026-11-12, Ethan). Buoy tắt hoặc
   không có: hook trả về ngay.
3. **Terminal vẫn là nguồn sự thật.** Buoy không lưu prompt, transcript hay quyền nào;
   "Always" ghi chính luật Claude Code gợi ý, vào chỗ Claude Code giữ nó.
4. **Im lặng khi bạn đã ở đó.** Terminal của session đang được focus: không bật mở.
5. **Mặc định không có gì nhạy cảm.** Prompt bạn gõ không bao giờ hiện; khi đang chia sẻ màn
   hình, lệnh và tên file cũng bị ẩn.

## 1. Đường đi của một event

```
Claude Code ──hook, JSON on stdin──► hooks/claude.js (gjs) ──D-Bus Agent()──► Buoy
                                            ◄── reply: the decision (PermissionRequest only)
```

- **Hook** `hooks/claude.js`: gjs, đi kèm extension, do Claude Code chạy, không bao giờ do
  Buoy (ARCHITECTURE "no subprocess"). gjs: `Gio` để gọi D-Bus, không phải quote cho shell, có
  trên mọi hệ GNOME. Đọc stdin, cắt chuỗi dài quá 4 KiB (không bao giờ hiện), gọi `Agent`, in
  reply nếu có, thoát 0. ~70 ms. Không gửi gì khác (Buoy tự tìm process, §6).
- **D-Bus** (DBUS.md, `Version` 2): `Agent(s source, s event) → s reply`; `source` là `claude`
  (sau là `codex`), `event` là JSON của hook, được parse trong adapter thuần của module.
  `reply` là `''` hoặc, với lời xin quyền, toàn bộ stdout mà Claude Code chờ (§4).
- **Buoy không có mặt**: lời gọi hỏng nhanh (timeout 2 s cho báo cáo), thoát 0, stdout rỗng —
  với lời xin quyền là "không quyết": terminal hỏi. Event lớn hơn 256 KiB bị từ chối
  (InvalidArgs): cũng vậy.
- Event và trường không biết thì bỏ qua, không bao giờ là lỗi.

## 2. Mỗi session một pill

- **id** `agent:claude:<session_id>`; tối đa 3 pill cạnh nhau, rồi `+N` (SPEC §2c).
- **Thứ tự** ([PRIORITY.md](PRIORITY.vi.md), 2026-11-07): adapter đặt dữ kiện, không đặt độ
  ưu tiên. Đang làm: bậc 2, kind **35** (trên một transfer, dưới một thông báo). Đang chờ bạn
  (`turn`): `needsYou`, bậc 1. Lời xin quyền: `ask`, bậc 1, **90**. Xong hoặc dừng vì lỗi:
  alert một lần, giữ chỗ tới khi mờ đi sau **10 s** (`SETTLE_MS`), rồi (`linger`) bậc 3. Trong
  một bậc, cái xong sau cùng đứng đầu (hiện lại khi `Stop`); stale đứng sau cái mới.
- **Subagent**: không có pill (cùng `session_id`, `agent_id` riêng); pill cha ghi "Working
  with 2 subagents" (`SubagentStart` / `SubagentStop`). Một `session_id` mới là pill riêng.
- **Claude Desktop** (tab Code) chạy CLI `claude` với
  `--setting-sources=user,project,local` (CLI 2.1.317), nên hook trong `~/.claude/settings.json`
  cũng chạy cho nó. Một session được resume (từ bên nào cũng vậy) giữ `session_id`, nên giữ
  pill của nó.
- **Label** "Claude · {project}": git repository — đi ngược từ `cwd` lên tới `.git`, với
  worktree là repository chính, nên `buoy/src` và `buoy/.claude/worktrees/<slug>` đều là
  "buoy" (2026-11-12, Ethan); nếu không thì phần cuối của `cwd`. Tên agent luôn đứng đầu
  (MASCOT.md). Các session của cùng một dự án dùng chung label, không đánh số (2026-11-07,
  Ethan). Workspace nháp của Desktop (`~/.config/Claude/scratch-workspaces/…`): chỉ "Claude",
  hover ghi "New session" cho tới khi có tiêu đề.
- **Tên**, chỉ khi hover (2026-11-12, Ethan): `session_title` (event nào cũng được; Desktop
  đặt tiêu đề cho mọi session, CLI thì sau `/rename`), nguyên vẹn (renderer tự thêm dấu …);
  nếu không thì slug của worktree; nếu không thì label.
- **Minimal** (2026-11-12, Ethan, design/pill "Claude Code ở pill 1", C + D): Bu ·
  "{project} · {việc đang làm}" ("buoy · Running pnpm test", "buoy · Waiting for you",
  "buoy · Done in 4 min"; không có dự án thì "Claude · …") · thời gian đã trôi (kit `{since}`:
  "<1 min", "4 min", "1 h 5 min"; đọc lại mỗi 20 s khi đang hiện). Có task list: task hiện
  tại và "2 / 5" thay cho thời gian. Xong: không có thời gian. Pill bên cạnh giữ Bu và thời
  gian/tiến độ ở hai đầu.
- **Compact** (hover): tiêu đề là tên, nếu không thì label; phụ đề là việc đang làm
  ("Thinking", "Running pnpm test", "Editing src/…/pill.js", "Fetching example.com", "Waiting
  for you", "Done in 4 min"; khi chia sẻ: "Running a command", "Editing a file"…, §7). Các
  hàng (design/compact "Danh sách hàng"): task list (§3), nếu không thì ba bước cuối của lượt
  — ▶ đang chạy, ✓ xong; tất cả ✓ khi Stop, biến mất ở prompt kế tiếp (2026-11-13). Không
  có hàng khi đang chia sẻ.
- **Expanded**: chỉ cho lời xin quyền (§4).
- **Click** (2026-11-07, Ethan): terminal hoặc Desktop của nó hiện lên (§6,
  `Shell.App.activate`); không mở gì. Session Desktop thì mở đúng session đó:
  `claude://code/continue?session=local_<uuid>`, id lấy từ file trong
  `~/.config/Claude/claude-code-sessions/<id>/<id>/local_<uuid>.json` có `cliSessionId` là
  `session_id` (tìm lúc click, mới nhất trước). Đang nhìn nó rồi (terminal của nó ở trước,
  hoặc Desktop đang ở session đó: `lastPrimaryCodeSession.id` trong
  `claude_desktop_config.json`), hoặc không biết cửa sổ nào: tab Claude Code mở; Desktop đang
  ở session khác thì chuyển sang session của pill. Kit `pressFirst` (tabs.js `pressTarget`):
  onPress, rồi tới tab nếu nó trả về false. Xem "Phần mong manh".
- **Tab Claude Code** (`tab.js`; icon đọc từ
  `/usr/lib/claude-desktop/resources/TrayIconLinux-Dark.png`, không bao giờ đóng gói kèm; không
  có thì dùng icon chung): mỗi session một hàng — Bu, tên, việc đang làm, thời gian đã trôi;
  mờ khi stale — và Deny · Allow · Always của một lời xin quyền nằm dưới nó. Click một hàng mở
  session của nó và đóng island. Hàng stale không có lời xin quyền thì có × (rời island cho
  tới event kế tiếp của nó). Hai phần Active (đang làm, đang hỏi) và Idle (xong, hoặc quá
  `staleAfter`), đầu mỗi phần có số đếm; đầu phần Idle có Clear và biến mất khi trống
  (2026-11-13, Ethan; adapter.js `canDismiss`, `onAction('dismiss')` → source.js `_forget`).
  Chỉ có trên dải tab khi còn live (kit `tabWhileLive`). Kind `ask` thuộc module này: pill của
  một lời xin quyền mở tab này; `Ask()` của những bên gọi khác có hàng ở đây.
- **Bắt đầu** ở `UserPromptSubmit` đầu tiên (hoặc một tool, subagent hay prompt trước đó: hook
  được cài giữa chừng). **Kết thúc** ở `SessionEnd`, hoặc sau `Stop` / `turn` khi
  `activity-linger` (5 min) trôi qua mà không có prompt (kit `linger`, SPEC §2). Con trỏ chuột
  giữ nó lại.
- **Stale**: đang làm, 1 min không có tin: mờ đi, Bu `stale`, vẫn ở bậc 2. Xong: mờ sau 10 s.
  Đang chờ (`turn`, `ask`) không bao giờ mờ.

## 3. Event → Bu và pill

| Event của hook | Bu | Tiêu đề compact | Ghi chú |
|---|---|---|---|
| `SessionStart` | — | — | được nhớ (cwd, model) |
| `UserPromptSubmit` | `think` | "Thinking" | đưa pill lên; thời gian đếm lại; task list đã xong hết thì bị xoá (2026-11-13, Ethan) |
| `PreToolUse` | `busy` | "Running {command}", "Editing {path}", "Reading {path}", "Searching for {pattern}", "Fetching {host}", "Searching the web for {query}", "Starting a subagent: {description}" (`Agent`, trước là `Task`), "Using {server} {tool}" (MCP), "Using {tool}" | trong subagent, pill cha giữ "Working with N subagents" |
| `PostToolUse` | `busy` | không đổi | xoá `error`; task list (dưới) |
| `PostToolUseFailure` | `error` | "Something failed" | tới event kế tiếp |
| `SubagentStart` / `SubagentStop` | `busy` | "Working with a subagent", "… with 2 subagents"; "Working" sau cái cuối | |
| `PermissionRequest` | `ask` | "Needs your OK · Run: pnpm test" | §4; sau đó: `busy` "Working" |
| `Notification` `permission_prompt` | `ask` | "Needs your OK" | lời hỏi của terminal; không có nút |
| `Notification` `idle_prompt`, `agent_needs_input`, `elicitation_dialog`, `elicitation_url_dialog` | `turn` | "Waiting for you" | alert một lần; `needsYou`; không bao giờ sau `Stop`. Loại khác bỏ qua |
| `PreCompact` | `compact` | "Compacting" | `PostCompact` → `busy` "Working"; giữa hai prompt thì không chiếm chỗ |
| `Stop` | `done`, alert; `party` trước nếu > 10 min | "Done", "Done in {n} min" | §2 Thứ tự, Kết thúc |
| `StopFailure` | `error`, alert | "Stopped with an error" | như trên |
| 1 min im lặng ở `busy` / `think` / `compact` | `stale` | không đổi | kit `staleAfter`: mờ, Bu `stale` |
| `SessionEnd` | — | — | `end()` ngay |

**Task list** (2026-11-12, design/compact): `TaskCreate` (`subject`, kết quả `id`),
`TaskUpdate` (`taskId`, `status`). Compact: "Claude Code" trên "{project} · 2 / 5", tối đa 3
hàng — ✓ xong, ▶ đang làm, ○ chưa làm thì mờ; nhiều hơn: cái vừa xong, đang làm, kế tiếp. Gặp
giữa session: đọc `~/.claude/tasks/<session_id>/*.json` một lần. Tool kế hoạch của Desktop
`mcp__ccd_turn__update_plan` (`items` [{content, status}], `advance`, `done` [n] /
`start` n) cũng được đọc như task list; `mcp__ccd_turn__wrap_up` đánh dấu tất cả là xong
(2026-11-13, Ethan).

Tư thế, đèn: MASCOT.md § Poses, § Agents; đèn `ask` màu đỏ (INDICATORS). Một alert là một nhịp
đập tại chỗ: không có dạng expanded (kit island.js render, `expandable`).

## 4. Lời xin quyền

- `PermissionRequest` → `stack.ask` (như D-Bus `Ask()`, thêm `look` và `quiet`): activity
  `agent:claude:<session_id>:ask`, độ ưu tiên 90, Bu `ask`, mở expanded (chỉ lấy bàn phím khi
  được click). Pill của session bị `hidden` trong lúc đó — mỗi session một pill (2026-11-07,
  Ethan). Mỗi session một lời xin quyền: cái thứ hai kết thúc cái đầu mà không trả lời.
- **Expanded**: "Claude · {project} needs your OK" trên "Run: pnpm test" / "Edit:
  src/…/pill.js" / "Fetch: example.com" / "Use: {mcp_server} {tool}" (một dòng, sau tên
  session nếu có); **Deny · Allow · Always** (Always chỉ khi có `permission_suggestions`).
  Compact: một card giữ tới khi được trả lời (2026-11-12, design/alerts-and-asks "Ask"): Bu;
  "Claude Code wants to run" trên "{project} · Bash", lệnh làm phần thân (2 dòng); "Allow edits
  to {file}?" cho một lần sửa file; Allow màu kem.
- **Câu trả lời** (Buoy dựng stdout):

  | Nút | stdout |
  |---|---|
  | Allow | `{"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}` |
  | Always | như trên, thêm `"updatedPermissions": [<the first of permission_suggestions, unchanged>]` |
  | Deny | `{… "decision": {"behavior": "deny", "message": "Denied in Buoy"}}` |
  | timeout (`activity-linger`) | Deny, message "No answer in Buoy" |
  | đã trả lời ở nơi khác, đã kết thúc, Buoy bị tắt | `''` — không quyết |

- **Đã trả lời ở nơi khác** (terminal, card của Desktop) kết thúc nó bằng `''` (adapter.js
  `settles`): `PostToolUse` / `PostToolUseFailure` của chính lời gọi đó (cùng tool, mọi trường
  được hỏi vẫn còn trong input — Desktop thêm `answers`; 2026-11-08, Ethan; không có
  `tool_use_id` để khớp), một prompt mới, `Stop`, `StopFailure`, `SessionEnd`, hoặc hook rời
  bus (theo dõi tên). Không event nào khác: báo cáo nền đến muộn và `permission_prompt` của
  terminal không được kết thúc nó. Trong lúc đó terminal hiện dialog riêng của nó; ai trả lời
  trước thì thắng. Desktop hỏi qua `--permission-prompt-tool=stdio`, hook chạy song song:
  quyết định đầu tiên được áp dụng.
- **Câu hỏi được trả lời trong Buoy** (2026-11-12, design/alerts-and-asks "Hỏi nhiều lựa
  chọn"; 2026-11-13, Ethan). `AskUserQuestion` đến dưới dạng một `PermissionRequest` đang chờ.
  Card rộng bằng compact: Bu, câu hỏi, "Claude Code · buoy · 1 / 3"; mỗi lựa chọn một hàng 32
  (dấu tròn cho chọn một, vuông cho chọn nhiều), Other ở cuối, gõ ngay tại chỗ (click lấy bàn
  phím qua modal grab của island; Esc nhả ra, chữ vẫn giữ); Skip · Next, Back · Submit ở câu
  cuối (Skip · Submit khi chỉ có một câu). Cao tới chiều cao của expanded (280 ở 1920). Giữ
  trong bộ nhớ tới khi Submit: `allow`, `updatedInput` = input + `answers` {question: answer}
  (một label; nhiều cái thì nối bằng ", ", chữ của Other ở cuối; câu bỏ trống thì không đưa
  vào). Skip, timeout, không chọn gì, hoặc đã trả lời trong Claude: `''`, và pill của session
  hỏi ("Needs your answer", Bu giơ tay, độ ưu tiên `ask`, click mở session). Đang chia sẻ (§7)
  hoặc không có lựa chọn: không có card; bắt đầu chia sẻ thì đóng card đang mở, bỏ các lựa
  chọn.
- **Timeout của hook** 1810 s, trên `activity-linger` dài nhất (30 min): Buoy trả lời trước.
- **Không mở** (thay vào đó là đèn đỏ, INDICATORS): toàn màn hình, Không làm phiền, island bị
  ẩn. **Im lặng** khi terminal đang được focus (§6, `agent-quiet-focused`): không alert hay mở
  rộng, kể cả khi island hiện lại; có nút ở compact và expanded. Một app khác lấy focus thì mở
  nó (kit `stack.wake`; 2026-11-07, Ethan); không có cửa sổ nào được focus thì không.
  `Shell.WindowTracker` `notify::focus-app` chỉ được theo dõi khi có một ask như vậy đang chờ.

## 5. Bàn phím

Như mọi ask (SPEC §2c, `kit/model/keys.js`), khi island giữ bàn phím (click hoặc Super+B):
`d` Deny; Allow và Always trùng chữ cái, nên dùng `2` và `3` (kit `mnemonics`; chỉ có Deny ·
Allow: `d` · `a`). Esc đóng, ask vẫn còn. Không bao giờ tự lấy bàn phím.

## 6. Terminal của session

Hook không cho biết cửa sổ hay TTY. Buoy hỏi bus pid của hook (kit `apps.js`,
`GetConnectionUnixProcessID`, khi còn kết nối) và đi ngược các process cha qua
`/proc/<pid>/stat` (hook → `sh -c` → Claude Code → shell → terminal; mỗi session một lần; chỉ
thử lại ở event kế tiếp nếu không có pid) cho tới khi `Shell.WindowTracker.get_app_from_pid`
biết một cửa sổ.

- **Được focus** = app đó là `focus_app`: theo app, không theo tab (GNOME Terminal, Ptyxis:
  một process). Terminal trong VS Code là VS Code.
- Session Desktop đi ngược lên tới Desktop (`claude` → `disclaimer` → `claude-desktop`).
- Không tìm thấy (shell từ xa, launcher lạ): không bao giờ được coi là focus.

## 7. Riêng tư

- Prompt bạn gõ (`UserPromptSubmit.prompt`) không bao giờ hiện hay được giữ.
- Lệnh, đường dẫn, host của URL có hiện (bạn cần chúng để quyết). Khi chia sẻ hoặc quay màn
  hình (`Main.panel.statusArea.screenSharing` / `screenRecording` `visible`, chỉ theo dõi khi
  có một session đang hiện; SPEC §6): tên của tool — "Run a command", "Edit a file", "Editing a
  file".
- Buoy không ghi gì ngoài, khi bấm Always, luật của Claude Code, thông qua Claude Code.

## 8. Cài hook (prefs)

Hàng **Claude Code** trong Modules (nhóm "Live in the Pill"), công tắc "Show my Claude Code
sessions"; phụ đề là trạng thái: "Hooks installed in ~/.claude/settings.json", "Claude Code
not found", "Part of Buoy's hooks are in …", "… could not be read (not valid JSON): Buoy
leaves it alone". File: `$CLAUDE_CONFIG_DIR/settings.json` khi biến này được đặt. Dùng
`modules/agent/hooks.js`: thuần, không import Shell (ARCHITECTURE luật 9).

- **Bật**: thêm các mục của Buoy (tạo file nếu chưa có), mọi thứ khác giữ nguyên. Lệnh
  `gjs -m '<extension>/hooks/claude.js'`; mục của Buoy là những mục có
  `buoy@murilegus/hooks/claude.js`. `"async": true` cho `SessionStart`,
  `UserPromptSubmit`, `PreToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`,
  `Notification`, `PreCompact`, `PostCompact`, `Stop`, `StopFailure`, `SessionEnd`;
  `PostToolUse` đồng bộ, `timeout` 5; `PermissionRequest` đồng bộ, `timeout` 1810. Không có
  matcher. Một `PostToolUse` async (bản cài cũ) được coi là cài một phần: công tắc gợi ý cập
  nhật; chưa cập nhật thì chưa có ■.
- **■, dừng lượt** (2026-11-12, Ethan), không phải dừng session: "Stopping…", rồi
  `PostToolUse` kế tiếp trả lời `{"continue": false, "stopReason": "Stopped from Buoy"}`, rồi
  "Stopped".
  Một lệnh dài hoặc một lượt chỉ có chữ sẽ chạy xong trước (hook không chen vào giữa một lượt
  được; SIGINT/SIGTERM kết thúc cả process). Chỉ khi `think`, `busy`, `compact`; không bao giờ
  ở pill.
- **Tắt**: gỡ đúng các mục của Buoy (và các danh sách event đã trống).
- Không bao giờ ghi vào một file không phải object JSON. Ghi nguyên tử
  (`Gio.File.replace_contents`), `settings.json.bak` ở lần đầu.
- Claude Code tự nạp lại file. Công tắc phản ánh file (đọc khi mở, file monitor khi đang mở),
  không phải một key. Module tắt: hook vẫn còn và trả về ngay (§1).

## 9. Setting

| Key | Kiểu | Mặc định | Prefs | Ý nghĩa |
|---|---|---|---|---|
| `modules-agent` | b | true | Modules, hàng "Claude Code" | module (thay cho stub `modules-ask`) |
| `activity-linger` | s | `5m` | trang Island, nhóm Pill, "Waiting pills go after": 5, 10, 20, 30 min | của kit: không trả lời → Deny; session xong hoặc đang chờ thì kết thúc (thay cho `agent-ask-timeout`) |
| `agent-quiet-focused` | b | true | trong hàng, "Quiet in its terminal" | §6: không bật mở khi terminal đang được focus |

Việc có hook hay không: nằm trong `~/.claude/settings.json`, không phải một key (§8).

## 10. Codex (sau, cùng module)

Một hook, `notify`, ở cuối lượt: `agent-turn-complete` → `done`, hoặc `turn` khi nó chờ.
Không có hook xin quyền, không có nút. "Codex · {project}"; hàng prefs riêng.

## 11. Code và test

- `modules/agent/` (thay cho stub `modules/ask/`): `tab.js`; `index.js` (kind `agent`,
  `ask`; `tabWhileLive`); `adapter.js` (thuần: event → `{pose, title, detail, start?, end?,
  alert?}`, reply cho lời xin quyền); `source.js` (lời gọi `Agent`, mỗi session một bản ghi,
  kết thúc, stale, §6); `hooks.js` (thuần: thêm/gỡ mục); `hooks/claude.js` ở thư mục gốc.
- Kit: `{since}`; D-Bus `Agent` (source nhận `BuoyDBus` trong `enable(…, {dbus})`, trả lời
  bằng `setAgent`); `stack.ask` `look`/`quiet`, `stack.wake`; Bu `stale` cho activity stale;
  `pressFirst`, `tabWhileLive` (tabs.js); `buildElement` (kit/ui/present/elements.js); icon
  theo đường dẫn tuyệt đối (`iconProps`), dùng icon chung khi thiếu.
- `tests/agent.test.js`: mọi hàng của §3, > 10 min `party`, stale, hai session, subagent, độ
  ưu tiên 35 / 90, event lạ; ba kiểu reply và timeout, Always chỉ khi có gợi ý; dự án từ
  `cwd`; prompt không bao giờ được xuất ra, chi tiết bị ẩn khi chia sẻ; `hooks.js` cài vào
  file trống / không có / đã có nội dung, idempotent, gỡ thì để nguyên mục của bên khác.
- Headless Shell: JSON hook đã ghi lại; ask được trả lời bằng click, phím, timeout, event đến
  sau; toàn màn hình → đèn đỏ; terminal được focus → im lặng; tắt khi đang chờ → `''`.

### Phần mong manh

Click cho Desktop (§2) dùng ba chi tiết nội bộ không có tài liệu của Desktop (thấy ở bản
4.23118): `local_<uuid>.json` với `cliSessionId`, `lastPrimaryCodeSession.id`, và route
`claude://code/continue?session=`. Cố ý giữ (2026-11-07, Ethan); hỏng bất cứ chỗ nào thì lặng
lẽ quay về việc đưa Desktop lên. Sau một bản cập nhật Desktop, test trước: hai session
Desktop, click từng pill từ một app khác và từ bên trong Desktop.

## 12. extensions.gnome.org

gjs.guide "Scripts and Binaries" (đọc 2026-11-07): script bên ngoài thì "strongly discouraged"
(rất không khuyến khích), được phép nếu cần, viết bằng GJS, giấy phép OSI, được spawn cẩn thận.
`hooks/claude.js`: GJS, GPL-2.0-or-later (SPDX), shebang `gjs -m` (`#!@GJS@ -m` của guide cần
một bước build), không bao giờ do Buoy spawn. Guide không nói tới: ghi config của app khác (theo
công tắc của người dùng, chỉ mục của mình, có `.bak` trước) và một method D-Bus. "Unnecessary
files" (file không cần thiết): thiếu nó thì module không làm gì. Ghi rõ điều này trong ghi chú
nộp lên EGO.

## 13. Đã kiểm, và những gì còn chờ một session thật

Đối chiếu với tài liệu tham khảo hook (2026-11-07): các trường và giá trị trong §1–§4
(`session_id`, `cwd`, `hook_event_name`, `agent_id`/`agent_type`, `PostToolUseFailure` `error` /
`is_interrupt`, `StopFailure`, `PostCompact`, `permission_suggestions` dạng
`{type: 'addRules', rules, behavior, destination}`), dạng reply, `async: true`, timeout mặc định
600 s, các file settings được theo dõi, hook chạy qua `sh -c`.

Đã chạy trong headless Shell 50.1 và trên máy Ethan (CLI và Desktop, 2026-11-07;
`AskUserQuestion` 2026-11-13, Claude Code 2.1.319): mọi đường của §2–§4 và §8.

Còn phải xem trong một session Claude Code thật:
- Không còn gì từ danh sách trên.
