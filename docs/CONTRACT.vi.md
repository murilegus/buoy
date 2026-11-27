# Contract của activity

Những gì một source, một adapter hay một bên gọi D-Bus đưa cho Buoy, và Buoy làm gì với nó. Mô
phỏng theo Live Activities của Apple; Buoy đóng vai của Apple (vẽ, vòng đời, chỗ đặt) và lo cho
các app không áp dụng gì bằng adapter.

```
Sources  ──►  Adapters  ──►  BuoyKit  ──►  Island renderer
(what the      (default per    (lifecycle,    (minimal / compact /
 system emits)  kind + per-app  priority,      expanded, Home)
                overrides)      ttl, stale)
D-Bus API ──────────────────────┘   apps & scripts that know Buoy skip the adapter layer
```

## 1. Activity

```js
{
  id:        'media:spotify',          // unique per source instance
  kind:      'media',                  // picks the default adapter
  app:       'spotify',                // normalised; picks the override
  attributes:{ title, artist, art },   // static for the activity's life
  state:     { status, position },     // replaced whole on update()
  priority:  10,                       // = relevanceScore, across ALL apps (Apple: per app)
  ttl:       0,                        // ms; 0 = until ended; cap 8 h
  staleAfter:0,                        // ms without update → stale → dimmed/"—"
  style:     'standard' | 'transient', // transient: opens expanded, ends on click-outside
  alert:     false,                    // true on surface/update → its card opens on its pill
  keyline:   null,                     // optional border tint
  onPress, onExpand,
  actions:   [{id, label, icon, selected?, types?, main?}],  // ≤ 1 minimal, ≤ 3 compact/expanded;
             // selected: one of a set, chosen one marked (power modes, 2026-11-14);
             // main: the one to press, cream (Join, 2026-11-20)
  minimalAction: true,                 // false: no button in minimal, compact has them (media)
  onAction(id, value?)                 // button pressed (ask: answers it); a tab may pass a value (seek)
  onExpire()                           // its ttl ended it, not end() (2026-11-08)
  // alert card (design/alerts-and-asks, 2026-11-12): held 5 s of your presence, then closed
  alertStays: false,                   // true: stays until false again (critical notification)
  alertKey:  null,                     // new key = new card; a change closes the card (a burst's turn)
  onSeen()                             // card had its 5 s with you there, or was hovered
  onAlertDone(seen)                    // card closed (or got none: hidden, away, another up)
  onAlertState({mayYield, hovered})    // card had its 1 s, pointer off it: another may replace it
  tile: {value, caption} | {live, caption}  // Home's tile (design/home): value in large figures;
             // live: player position, elapsed; default: text or ring trailing, text as caption
             // (kit/model/home.js tileOf)
  compact.card: {icon, app, at, picture, title, body, close, actionsOnHover, tight}
             // a message's card. actionsOnHover: buttons only under the pointer; picture may be
             // {stack: [icon, …]} (≤ 3 logos); tight: no message, buttons 12 under the picture
             // (104); code (+ codeEnd, an element): one-time code, 2em, instead of the message;
             // tag: short text at its end (licence plate); reply: {state typing|sent|failed,
             // hint, text, textId, sendId, cancelId}: entry and Send instead of the buttons
             // (opened, with the keyboard, by an action with types: true)
  compact: {leading, text, subtitle, trailing, transport, progress, rows}  // hover tier.
             // transport: ≤ 3 actions; progress: 0..1 or live {position, length, at, playing}
             // (ms), running with elapsed and remaining while shown; rows: [{icon, text, detail,
             // dim, rank}] ≤ 16, compact draws the 3 of lowest rank (ties: first) in order, Home's
             // main card as many as fit (2026-11-13); subtitle may run: {elapsed, text} →
             // "0:42 · from 14:03" (2026-11-14)
}
```

Vòng đời (nội bộ và D-Bus): `surface(activity)` · `update(id, patch, {alert})` ·
`end(id, {dismissal: 'immediate' | ms})` · `schedule(activity, startAt)` ·
`ask(id, question, options, {timeoutMs, fallback}) → choice`, được trả lời bằng `answer(id, choice)`
(riêng của Buoy). Một ask mở expanded khi tới pill: chỉ expanded hiện được mọi lựa chọn
(2026-11-01). `dismiss(id)` ẩn một ask nhưng vẫn giữ nó chờ (đèn đỏ); các activity khác thì chỉ
end. Mức trần 8 h áp cho một `ttl` được đặt (`kit/model/stack.js`).

`validate()` ném lỗi khi output của adapter hay của bên gọi sai (registry, `surface`, `update`,
`schedule`). Luật của Apple trong code: trần 8 h, end thì gỡ ngay, relevance quyết thứ gì hiện,
stale thì vẽ mờ, alert = expanded thoáng qua, transient kết thúc khi bấm ra ngoài.

## 2. Bậc

| Apple | Buoy |
|---|---|
| compact leading + trailing | **minimal**, pill 1: các vùng **leading** (icon/ảnh bìa) · **text** · **trailing** (glyph/tiến trình); rộng vừa nội dung, cao 32 |
| compact reduced width / minimal | **minimal**, pill phụ: tối đa hai pill 120 × 32 bên phải pill 1, dính liền trên thanh; leading + trailing ngắn + `+N` (SPEC §2c, 2026-11-05) |
| expanded | rộng theo màn hình (560–760, `expanded-width` ghi đè) × cao vừa nội dung, tối đa width/2, như iOS; các vùng **leading / trailing / center / bottom** có `priority`; mở bằng click; alert mở nó thoáng qua; activity transient bắt đầu ở đây |
| Lock Screen / banner | không có (màn hình khoá của GNOME ngoài phạm vi) |
| Mac menu bar | *chúng ta chính là menu bar* |
| hover (không có) | **compact**: pill được hover lớn lên tại chỗ thành 0.72 × expanded × 56/88, tới 120 với hàng (leading 40, hai dòng, ≤ 3 action, một thanh hoặc ≤ 3 hàng); trước đó, +10 % chiều rộng và +2 chiều cao (SPEC §2, §4, 2026-11-05) |

Tên gọi (2026-11-05): các bậc của Buoy là **minimal < compact < expanded** theo cỡ. Minimal của
Buoy là compact và minimal của Apple; compact của Buoy là một bậc hover mà Apple không có. Từ
của Apple giữ nghĩa của Apple.

Expanded là compact phóng to: adapter đưa cùng các phần tử và renderer xếp chỗ cho chúng; không
có canvas tự do. Expanded còn chứa những gì compact không có chỗ (media: chọn player, âm lượng
của app, shuffle/repeat).

## 3. Adapter

```js
// modules/<id>/adapter.js: one method per kind, returns presentation data, never actors
progress(a) → { leading: appIcon, text: label, trailing: ring(fraction) }
osd(a)      → { leading: icon, text: device | word | null, trailing: {bar, label: '62', off?}, ttl: 1500 }
// modules/media/apps/spotify.js: override only what differs ('Advertisement' → text 'Ad', a countdown)
```

Giá trị của leading/trailing (chuẩn hoá bởi `kit/model/presentation.js#element`):

| Giá trị | Vẽ |
|---|---|
| `'icon-name'` hoặc một `Gio.Icon` | một icon |
| `'eq'` / `'eq-paused'` | equaliser, đang chạy hoặc dừng ở mức thấp |
| `{glyph, color}` | một glyph có tên, theo màu `'#rrggbb'` của activity (equaliser theo màu ảnh bìa); không thì bỏ màu, glyph dùng `fg` |
| `{icon, label?, more?}` | một icon với chữ ngắn bên cạnh, "+k" phía trước (dấu ✓ của một lệnh và thời gian của nó, 2026-11-21) |
| `{art, icon}` | ảnh bìa, dự phòng bằng icon; `round: true` là ảnh tròn của một người (người gửi tin nhắn) |
| `{icon \| text \| since \| elapsed, color: '#rrggbb'}` | theo màu riêng của activity (màu xanh lá của cuộc gọi) |
| `{workspace: n, more?: k}` | workspace của một cửa sổ trong một ô vuông, "+k" phía trước |
| `{progress}` · `{countdown}` / `{text}` | một vòng · chữ |
| `{bar, label?, off?}` | một thanh, con số bên cạnh; `off` làm mờ cả hai (mức đang tắt tiếng, 2026-11-05) |
| `{battery, label?}` | một cục pin ở mức 0..1, con số bên cạnh; không có khi mức chỉ ước lượng thô, để nó không bao giờ trông như âm lượng (2026-11-17) |
| `{until: ms since epoch, more?}` | đếm ngược, chạy mỗi giây khi đang hiện (quảng cáo Spotify, 2026-11-05; "+k" các timer khác, 2026-11-22) |
| `{ring: {from, until}}` | thời gian còn lại dạng vòng, vẽ lại mỗi giây khi đang hiện (một timer, 2026-11-22) |
| `{elapsed: ms since epoch}` | đếm lên, `0:42` (quay màn hình, 2026-11-14) |
| `{icon, backdrop: true}` | icon trên một đĩa tròn fill-2 trong leading 40 của compact (2026-11-14) |
| **`{mascot: '<pose>', icon?}`** | Bu (2026-11-03): một trong 13 dáng trong `MASCOT.md`; không biết → `icon`, không có thì `idle`. Đèn của Bu hiện màu của dáng; đèn phao vẫn ở đầu trái của pill 1 (INDICATORS). Khung hình, timer đổi khung và màu là của kit |

**Một minimal cho mọi chỗ** (2026-11-05): adapter trả một `leading · text · trailing`, không bao
giờ biết pill của nó. Pill 1 hiện cả ba; pill phụ (SPEC §2c) bỏ `text`. Nên **giá trị ngắn quan
trọng nằm ở `trailing`**, còn `text` chứa thứ có thể mất: media `eq` hoặc pause, progress một
vòng, timer `{countdown}`, bước của một agent `{text: '4/7'}`. Không có trailing hữu ích thì
`leading` vẫn cho biết activity là gì.

Thứ tự tìm: `modules/<id>/apps/<slug>.js[kind]` → `adapter.js[kind]` của module. Một app nói
được D-Bus có thể gửi presentation data của riêng nó và bỏ qua adapter (con đường "app adopts
ActivityKit").

## 4. Source

MPRIS → media · LauncherEntry → progress · MessageTray → notification · OSD → osd ·
UPower / Bluetooth / Gvc / GUdev / Keymap → power, device, hud · Mutter urgent → attention ·
Selection → copied · thông báo của GSConnect → phone · D-Bus API → mọi thứ khác.

## 5. Luật

1. Pill đen, đục; màu nằm ở nội dung; keyline tint tuỳ chọn theo từng activity.
2. Bo = h/2 cho pill; bo của expanded 28; lề đồng tâm (8 px với pill, 14 px với expanded).
3. Chữ trong pill 1em, đậm 600 (compact và expanded 13–14 px, medium trở lên, cho tới khi làm
   các mục M4 của chúng); leading của minimal chiếm một ô 24 px ở 1em (ảnh bìa lấp đầy nó), 40 px
   trong compact, 56 px trong expanded (SPEC §4).
4. Compact và expanded = minimal phóng to, cùng thứ tự; chiều cao chỉ tăng theo nội dung.
5. ≤ 1 action trong minimal, ≤ 3 trong compact và expanded; bấm chỗ khác = mở app/cửa sổ.
6. Cho một activity xoay vòng qua các sự kiện con (một activity "downloads" lần lượt qua từng
   file) thay vì chồng nhiều activity.
7. End ngay; chỉ update khi có thay đổi; ít khi alert; không bao giờ bắt đầu bất ngờ (mỗi source
   là một module người dùng tắt được).
8. Chuyển động ≤ 2 s; nội dung fade/trượt, số nhảy; không gì chuyển động khi idle.
9. Không quảng cáo, không hiện nội dung nhạy cảm khi đang chia sẻ màn hình.
