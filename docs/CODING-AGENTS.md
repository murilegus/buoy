# Coding agents — Claude Code in the pill

A coding agent's sessions on the island: event path, one pill per session, Bu's poses, the
permission prompt, quiet rules, hook install. FEATURES M3 "Claude Code: ask + agent
activity" points here; pose colours: MASCOT.md § Agents. Decided with Ethan, 2026-11-07.
Claude Code first, Codex later (§10). Not named `AGENTS.md`: agents read that file as their
own instructions. Source: Claude Code's hooks reference (code.claude.com/docs/en/hooks),
read 2026-11-07 (§13).

## Principles

1. **The session, not the prompt.** One pill per session, first prompt to end: project,
   what Claude does, how long; Bu's pose says how it goes.
2. **Never slow Claude down.** Reporting hooks are `async`. Only the permission prompt
   waits, and `PostToolUse` waits a few ms so ■ can stop the turn (2026-11-12, Ethan).
   Buoy off or missing: the hook returns at once.
3. **The terminal stays the source of truth.** Buoy stores no prompts, transcripts or
   permissions; "Always" writes Claude Code's own suggested rule, where Claude Code keeps it.
4. **Quiet when you are already there.** Session's terminal focused: no jump open.
5. **Nothing sensitive by default.** The typed prompt is never shown; while sharing,
   commands and file names are hidden too.

## 1. The path of an event

```
Claude Code ──hook, JSON on stdin──► hooks/claude.js (gjs) ──D-Bus Agent()──► Buoy
                                            ◄── reply: the decision (PermissionRequest only)
```

- **The hook** `hooks/claude.js`: gjs, shipped in the extension, run by Claude Code, never
  by Buoy (ARCHITECTURE "no subprocess"). gjs: `Gio` to D-Bus, no shell quoting, on every
  GNOME system. Reads stdin, cuts strings over 4 KiB (never shown), calls `Agent`, prints
  the reply if any, exits 0. ~70 ms. Sends nothing else (Buoy finds the process, §6).
- **D-Bus** (DBUS.md, `Version` 2): `Agent(s source, s event) → s reply`; `source` `claude`
  (later `codex`), `event` the hook's JSON, parsed in the module's pure adapter. `reply` is
  `''` or, for a permission prompt, the whole stdout Claude Code expects (§4).
- **Buoy not there**: the call fails fast (2 s timeout for reports), exit 0, empty stdout —
  for a permission prompt, "no decision": the terminal asks. Events over 256 KiB are
  refused (InvalidArgs): the same.
- Unknown events and fields are ignored, never an error.

## 2. One pill per session

- **id** `agent:claude:<session_id>`; up to 3 side by side, then `+N` (SPEC §2c).
- **Order** ([PRIORITY.md](PRIORITY.md), 2026-11-07): the adapter sets facts, not
  priority. Working: tier 2, kind **35** (over a transfer, under a notification). Waiting
  for you (`turn`): `needsYou`, tier 1. Permission prompt: `ask`, tier 1, **90**. Done or
  error-stopped: alerts once, holds its place until it dims after **10 s** (`SETTLE_MS`),
  then (`linger`) tier 3. In a tier, the last to finish leads (re-surfaced on `Stop`);
  stale after fresh.
- **Subagents**: no pill (same `session_id`, own `agent_id`); the parent says "Working with
  2 subagents" (`SubagentStart` / `SubagentStop`). A new `session_id` is its own pill.
- **Claude Desktop** (Code tab) runs the `claude` CLI with
  `--setting-sources=user,project,local` (CLI 2.1.317), so `~/.claude/settings.json` hooks
  run for it too. A resumed session (from either) keeps its `session_id`, so its pill.
- **Label** "Claude · {project}": the git repository — up from `cwd` to `.git`, a
  worktree's main repository, so `buoy/src` and `buoy/.claude/worktrees/<slug>` are both
  "buoy" (2026-11-12, Ethan); else the last part of `cwd`. The agent's name always leads
  (MASCOT.md). One project's sessions share it, no number (2026-11-07, Ethan). Desktop's
  scratch workspace (`~/.config/Claude/scratch-workspaces/…`): "Claude" alone, hover "New
  session" until titled.
- **Name**, hover only (2026-11-12, Ethan): `session_title` (any event; Desktop titles
  every session, the CLI after `/rename`), whole (the renderer ellipsizes); else the
  worktree's slug; else the label.
- **Minimal** (2026-11-12, Ethan, design/pill "Claude Code ở pill 1", C + D): Bu ·
  "{project} · {what it does}" ("buoy · Running pnpm test", "buoy · Waiting for you",
  "buoy · Done in 4 min"; no project "Claude · …") · elapsed (kit `{since}`: "<1 min",
  "4 min", "1 h 5 min"; re-read every 20 s while shown). With a task list: the current task
  and "2 / 5" instead of the time. Done: no time. A side pill keeps Bu and time/progress at
  its ends.
- **Compact** (hover): title the name, else the label; subtitle what it does ("Thinking",
  "Running pnpm test", "Editing src/…/pill.js", "Fetching example.com", "Waiting for you",
  "Done in 4 min"; sharing: "Running a command", "Editing a file"…, §7). Rows
  (design/compact "Danh sách hàng"): the task list (§3), else the turn's last three steps
  — ▶ running, ✓ done; all ✓ at Stop, gone at the next prompt (2026-11-13). No rows while
  sharing.
- **Expanded**: only the permission prompt (§4).
- **Click** (2026-11-07, Ethan): its terminal or Desktop comes up (§6,
  `Shell.App.activate`); nothing opens. A Desktop session opens that very session:
  `claude://code/continue?session=local_<uuid>`, the id from the file in
  `~/.config/Claude/claude-code-sessions/<id>/<id>/local_<uuid>.json` whose `cliSessionId`
  is the `session_id` (searched on click, newest first). Already looking at it (its
  terminal in front, or Desktop on that session: `lastPrimaryCodeSession.id` in
  `claude_desktop_config.json`), or no window known: the Claude Code tab opens; Desktop on
  another session switches to the pill's. Kit
  `pressFirst` (tabs.js `pressTarget`): onPress, then the tab if it returns false. See
  "The fragile part".
- **The Claude Code tab** (`tab.js`; icon read from
  `/usr/lib/claude-desktop/resources/TrayIconLinux-Dark.png`, never shipped; generic
  without it): a row per session — Bu, name, what it does, elapsed; dimmed when stale —
  and a prompt's Deny · Allow · Always under it. A row's click opens its session and
  closes the island. A stale row with no prompt has × (off the island until its next
  event). Parts Active (working, asking) and Idle (done, or past `staleAfter`), heads with
  counts; Idle's head has Clear and goes when empty (2026-11-13, Ethan; adapter.js
  `canDismiss`, `onAction('dismiss')` → source.js `_forget`). In the strip only while live
  (kit `tabWhileLive`). Kind `ask` is this module's: a prompt's pill opens this tab;
  other callers' `Ask()` get rows here.
- **Starts** on the first `UserPromptSubmit` (or a tool, subagent or prompt before one:
  hooks installed mid-run). **Ends** on `SessionEnd`, or after `Stop` / `turn` once
  `activity-linger` (5 min) passes with no prompt (kit `linger`, SPEC §2). The pointer
  holds it.
- **Stale**: working, 1 min without news: dimmed, Bu `stale`, stays tier 2. Done: dims
  after 10 s. Waiting (`turn`, `ask`) never dims.

## 3. Events → Bu and the pill

| Hook event | Bu | Compact title | Notes |
|---|---|---|---|
| `SessionStart` | — | — | remembered (cwd, model) |
| `UserPromptSubmit` | `think` | "Thinking" | surfaces the pill; time restarts; a task list all done is cleared (2026-11-13, Ethan) |
| `PreToolUse` | `busy` | "Running {command}", "Editing {path}", "Reading {path}", "Searching for {pattern}", "Fetching {host}", "Searching the web for {query}", "Starting a subagent: {description}" (`Agent`, once `Task`), "Using {server} {tool}" (MCP), "Using {tool}" | in a subagent the parent keeps "Working with N subagents" |
| `PostToolUse` | `busy` | unchanged | clears `error`; task list (below) |
| `PostToolUseFailure` | `error` | "Something failed" | until the next event |
| `SubagentStart` / `SubagentStop` | `busy` | "Working with a subagent", "… with 2 subagents"; "Working" after the last | |
| `PermissionRequest` | `ask` | "Needs your OK · Run: pnpm test" | §4; after it: `busy` "Working" |
| `Notification` `permission_prompt` | `ask` | "Needs your OK" | the terminal's prompt; no buttons |
| `Notification` `idle_prompt`, `agent_needs_input`, `elicitation_dialog`, `elicitation_url_dialog` | `turn` | "Waiting for you" | alert once; `needsYou`; never after `Stop`. Other types ignored |
| `PreCompact` | `compact` | "Compacting" | `PostCompact` → `busy` "Working"; between prompts takes no room |
| `Stop` | `done`, alert; `party` first after > 10 min | "Done", "Done in {n} min" | §2 Order, Ends |
| `StopFailure` | `error`, alert | "Stopped with an error" | the same |
| 1 min silent in `busy` / `think` / `compact` | `stale` | unchanged | kit `staleAfter`: dimmed, Bu `stale` |
| `SessionEnd` | — | — | `end()` at once |

**Task list** (2026-11-12, design/compact): `TaskCreate` (`subject`, result `id`),
`TaskUpdate` (`taskId`, `status`). Compact: "Claude Code" over "{project} · 2 / 5", up to 3
rows — ✓ done, ▶ doing, ○ to do dimmed; with more: just done, doing, next. Met mid-session:
read `~/.claude/tasks/<session_id>/*.json` once. Desktop's plan tool
`mcp__ccd_turn__update_plan` (`items` [{content, status}], `advance`, `done` [n] /
`start` n) is read as the task list too; `mcp__ccd_turn__wrap_up` marks all done
(2026-11-13, Ethan).

Poses, lamps: MASCOT.md § Poses, § Agents; the `ask` lamp is red (INDICATORS). An alert is
a pulse in place: no expanded presentation (kit island.js render, `expandable`).

## 4. The permission prompt

- `PermissionRequest` → `stack.ask` (as D-Bus `Ask()`, plus `look` and `quiet`): activity
  `agent:claude:<session_id>:ask`, priority 90, Bu `ask`, opens expanded (keyboard only
  when clicked). The session's pill is `hidden` meanwhile — one pill per session
  (2026-11-07, Ethan). One prompt per session: a second ends the first unanswered.
- **Expanded**: "Claude · {project} needs your OK" over "Run: pnpm test" / "Edit:
  src/…/pill.js" / "Fetch: example.com" / "Use: {mcp_server} {tool}" (one line, after the
  session's name if any); **Deny · Allow · Always** (Always only with
  `permission_suggestions`). Compact: a card held until answered (2026-11-12,
  design/alerts-and-asks "Ask"): Bu; "Claude Code wants to run" over "{project} · Bash",
  the command as body (2 lines); "Allow edits to {file}?" for an edit; Allow cream.
- **The answer** (Buoy builds the stdout):

  | Button | stdout |
  |---|---|
  | Allow | `{"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}` |
  | Always | the same with `"updatedPermissions": [<the first of permission_suggestions, unchanged>]` |
  | Deny | `{… "decision": {"behavior": "deny", "message": "Denied in Buoy"}}` |
  | timeout (`activity-linger`) | Deny, message "No answer in Buoy" |
  | answered elsewhere, ended, Buoy disabled | `''` — no decision |

- **Answered elsewhere** (terminal, Desktop's card) ends it with `''` (adapter.js
  `settles`): the same call's `PostToolUse` / `PostToolUseFailure` (same tool, every
  field asked still in the input — Desktop adds `answers`; 2026-11-08, Ethan; no
  `tool_use_id` to match), a new prompt, `Stop`, `StopFailure`, `SessionEnd`, or the hook
  leaving the bus (name watch). No other event: late background reports and the
  terminal's `permission_prompt` must not end it. The terminal shows its own dialog
  meanwhile; first answer wins. Desktop asks via `--permission-prompt-tool=stdio`, hooks
  alongside: first decision applies.
- **A question is answered in Buoy** (2026-11-12, design/alerts-and-asks "Hỏi nhiều lựa
  chọn"; 2026-11-13, Ethan). `AskUserQuestion` arrives as a waiting `PermissionRequest`.
  Card at the compact's width: Bu, the question, "Claude Code · buoy · 1 / 3"; a 32 row per
  choice (round mark single, square multi), Other last, typed in place (click takes the
  keyboard via the island's modal grab; Esc lets go, text kept); Skip · Next, Back · Submit
  on the last (Skip · Submit for one). Up to expanded's height (280 at 1920). Held in
  memory until Submit: `allow`, `updatedInput` = input + `answers` {question: answer} (a
  label; several joined by ", ", Other's text last; empty questions left out). Skip,
  timeout, nothing chosen, or answered in Claude: `''`, and the session's pill asks
  ("Needs your answer", Bu's hand up, `ask` priority, click opens the session). Sharing
  (§7) or no options: no card; sharing starting closes an open one, choices dropped.
- **Hook timeout** 1810 s, above the longest `activity-linger` (30 min): Buoy answers first.
- **Not opened** (red light instead, INDICATORS): fullscreen, Do Not Disturb, island
  hidden. **Quiet** while the terminal is focused (§6, `agent-quiet-focused`): no alert or
  expand, even when the island is seen again; buttons in compact and expanded. Another app
  taking focus opens it (kit `stack.wake`; 2026-11-07, Ethan); no focused window does not.
  `Shell.WindowTracker` `notify::focus-app` is watched only while such an ask waits.

## 5. Keyboard

As every ask (SPEC §2c, `kit/model/keys.js`), when the island holds the keyboard (click or
Super+B): `d` Deny; Allow and Always share a letter, so `2` and `3` (kit `mnemonics`; Deny ·
Allow alone: `d` · `a`). Esc closes, the ask stays. Never takes the keyboard by itself.

## 6. The session's terminal

Hooks give no window or TTY. Buoy asks the bus for the hook's pid (kit `apps.js`,
`GetConnectionUnixProcessID`, while connected) and walks `/proc/<pid>/stat` parents (hook →
`sh -c` → Claude Code → shell → terminal; once per session; retried next event only if no
pid) until `Shell.WindowTracker.get_app_from_pid` knows a window.

- **Focused** = that app is `focus_app`: per app, not per tab (GNOME Terminal, Ptyxis: one
  process). A VS Code terminal is VS Code.
- Desktop sessions walk up to Desktop (`claude` → `disclaimer` → `claude-desktop`).
- Not found (remote shell, unknown launcher): never focused.

## 7. Privacy

- The typed prompt (`UserPromptSubmit.prompt`) is never shown or kept.
- Commands, paths, URL hosts show (you need them to decide). While shared or recorded
  (`Main.panel.statusArea.screenSharing` / `screenRecording` `visible`, watched only while
  a session shows; SPEC §6): the tool's name — "Run a command", "Edit a file", "Editing a
  file".
- Buoy writes nothing but, on Always, Claude Code's rule, through Claude Code.

## 8. Installing the hooks (prefs)

Modules row **Claude Code** (group "Live in the Pill"), switch "Show my Claude Code
sessions"; subtitle the state: "Hooks installed in ~/.claude/settings.json", "Claude Code
not found", "Part of Buoy's hooks are in …", "… could not be read (not valid JSON): Buoy
leaves it alone". File: `$CLAUDE_CONFIG_DIR/settings.json` when set. Uses
`modules/agent/hooks.js`: pure, no Shell import (ARCHITECTURE rule 9).

- **On**: adds Buoy's entries (file created if missing), all else kept. Command
  `gjs -m '<extension>/hooks/claude.js'`; Buoy's entries are those with
  `buoy@murilegus/hooks/claude.js`. `"async": true` for `SessionStart`,
  `UserPromptSubmit`, `PreToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`,
  `Notification`, `PreCompact`, `PostCompact`, `Stop`, `StopFailure`, `SessionEnd`;
  `PostToolUse` sync, `timeout` 5; `PermissionRequest` sync, `timeout` 1810. No matcher.
  An async `PostToolUse` (older install) reads as partly installed: the switch offers an
  update; no ■ until then.
- **■, stop the turn** (2026-11-12, Ethan), not the session: "Stopping…", then the next
  `PostToolUse` answers `{"continue": false, "stopReason": "Stopped from Buoy"}`, then
  "Stopped".
  A long command or a text-only turn finishes first (hooks cannot reach into a turn;
  SIGINT/SIGTERM end the process). Only while `think`, `busy`, `compact`; never in the pill.
- **Off**: removes exactly Buoy's entries (and emptied event lists).
- Never writes a file that is not a JSON object. Atomic (`Gio.File.replace_contents`),
  `settings.json.bak` the first time.
- Claude Code reloads the file itself. The switch reflects the file (read on open, file
  monitor while open), not a key. Module off: hooks stay and return at once (§1).

## 9. Settings

| Key | Type | Default | Prefs | Meaning |
|---|---|---|---|---|
| `modules-agent` | b | true | Modules, row "Claude Code" | the module (replaces the stub `modules-ask`) |
| `activity-linger` | s | `5m` | Island page, Pill group, "Waiting pills go after": 5, 10, 20, 30 min | the kit's: no answer → Deny; a done or waiting session ends (replaces `agent-ask-timeout`) |
| `agent-quiet-focused` | b | true | in the row, "Quiet in its terminal" | §6: no jump open while the terminal is focused |

Hooks' presence: in `~/.claude/settings.json`, not a key (§8).

## 10. Codex (later, same module)

One hook, `notify`, at a turn's end: `agent-turn-complete` → `done`, or `turn` when it
waits. No permission hook, no buttons. "Codex · {project}"; its own prefs row.

## 11. Code and tests

- `modules/agent/` (replaces stub `modules/ask/`): `tab.js`; `index.js` (kinds `agent`,
  `ask`; `tabWhileLive`); `adapter.js` (pure: event → `{pose, title, detail, start?, end?,
  alert?}`, the permission reply); `source.js` (`Agent` calls, a record per session, end,
  stale, §6); `hooks.js` (pure: add/remove entries); `hooks/claude.js` at the top level.
- Kit: `{since}`; D-Bus `Agent` (a source gets `BuoyDBus` in `enable(…, {dbus})`, answers
  with `setAgent`); `stack.ask` `look`/`quiet`, `stack.wake`; Bu `stale` for stale
  activities; `pressFirst`, `tabWhileLive` (tabs.js); `buildElement`
  (kit/ui/present/elements.js); absolute-path icons (`iconProps`), generic when missing.
- `tests/agent.test.js`: every §3 row, > 10 min `party`, stale, two sessions, subagents,
  priorities 35 / 90, unknown events; the three replies and the timeout, Always only
  with suggestions; project from `cwd`; prompt never output, details hidden when sharing;
  `hooks.js` install into empty / missing / busy file, idempotent, uninstall leaves others.
- Headless Shell: recorded hook JSON; ask answered by click, keys, timeout, later event;
  fullscreen → red light; focused terminal → quiet; disable while waiting → `''`.

### The fragile part

The Desktop click (§2) uses three undocumented Desktop internals (seen in 4.23118):
`local_<uuid>.json` with `cliSessionId`, `lastPrimaryCodeSession.id`, and the
`claude://code/continue?session=` route. Kept on purpose (2026-11-07, Ethan); any failure
silently falls back to raising Desktop. After a Desktop update, test first: two Desktop
sessions, click each pill from another app and from inside Desktop.

## 12. extensions.gnome.org

gjs.guide "Scripts and Binaries" (read 2026-11-07): external scripts "strongly
discouraged", allowed if needed, GJS, OSI-licensed, spawned carefully. `hooks/claude.js`:
GJS, GPL-2.0-or-later (SPDX), `gjs -m` shebang (the guide's `#!@GJS@ -m` needs a build
step), never spawned by Buoy. Not covered: writing another app's config (on the user's
switch, own entries, `.bak` first) and a D-Bus method. "Unnecessary files": the module does
nothing without it. Say so in the EGO submission notes.

## 13. Verified, and what still waits for a real session

Against the hooks reference (2026-11-07): the fields and values in §1–§4 (`session_id`,
`cwd`, `hook_event_name`, `agent_id`/`agent_type`, `PostToolUseFailure` `error` /
`is_interrupt`, `StopFailure`, `PostCompact`, `permission_suggestions` as
`{type: 'addRules', rules, behavior, destination}`), the reply shape, `async: true`,
default timeout 600 s, watched settings files, hooks run via `sh -c`.

Run in headless Shell 50.1 and on Ethan's machine (CLI and Desktop, 2026-11-07;
`AskUserQuestion` 2026-11-13, Claude Code 2.1.319): every path of §2–§4 and §8.

Still to see in a real Claude Code session:
- Nothing left from the list above.
