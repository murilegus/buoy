# Coding agents — Claude Code in the pill

The reference for showing a coding agent's sessions on the island: how the events get
there, one pill per session, which pose Bu takes for each event, the permission prompt
with Deny · Allow · Always, when Buoy stays quiet, and how the hooks are installed.
FEATURES M3 "Claude Code: ask + agent activity" points here; MASCOT.md § Agents keeps
the pose colours. Decided with Ethan, 2026-11-07. Claude Code first; Codex later in the
same module (§10).

Not named `AGENTS.md`: that file name is the convention coding agents read as their own
instructions.

Sources: Claude Code's hooks reference (code.claude.com/docs/en/hooks), read 2026-11-07;
the field names below were checked against it when the code landed (§13 says what is
checked and what still waits for a real session).

## Principles

1. **The session, not the prompt.** One pill per Claude Code session, alive from the
   first prompt to the session's end. It says which project, what Claude is doing and
   for how long; Bu's pose says how it is going.
2. **Never slow Claude down.** Every hook that only reports runs in the background
   (`async`). The permission prompt waits, because a person has to answer it; and
   `PostToolUse` waits a few ms for Buoy's answer, so the compact's ■ can stop the turn
   (2026-11-12, Ethan: as Desktop's Stop). If Buoy is off or missing, the hook returns at
   once and Claude Code goes on as without Buoy.
3. **The terminal stays the source of truth.** Buoy shows and answers; it never stores
   prompts, transcripts or permissions of its own. "Always" writes the rule Claude Code
   itself suggested, where Claude Code keeps it.
4. **Quiet when you are already there.** While the terminal of a session is focused the
   pill does not jump open: you are looking at the same prompt in the terminal.
5. **Nothing sensitive by default.** The prompt you typed is never shown. While the
   screen is shared, commands and file names are hidden too.

## 1. The path of an event

```
Claude Code ──hook, JSON on stdin──► hooks/claude.js (gjs) ──D-Bus Agent()──► Buoy
                                            ◄── reply: the decision (PermissionRequest only)
```

- **The hook** is a gjs script shipped in the extension, `hooks/claude.js`, run by Claude
  Code (never by Buoy: ARCHITECTURE "no subprocess" holds). gjs because the JSON goes to
  D-Bus through `Gio` — no shell quoting — and gjs is on every GNOME system. It reads
  stdin, cuts strings longer than 4 KiB (a Write's content, an Edit's strings: never
  shown, and the bus stays light), calls `Agent`, prints the reply if there is one, exits
  0. About 70 ms a run (2026-11-07). Buoy finds the process itself (§6), so the script
  sends nothing of its own.
- **D-Bus** (DBUS.md): a new method `Agent(s source, s event) → s reply`; `source` is
  `claude` (later `codex`), `event` the hook's JSON as text. Buoy parses it in the module's
  pure adapter. `reply` is `''`, or for a permission prompt the whole stdout JSON Claude
  Code expects (§5), so the script stays dumb. `Version` goes to 2.
- **Buoy not there** (disabled, logged out, another desktop): the call fails fast (2 s
  D-Bus timeout for reports) and the script exits 0 with nothing on stdout — for a
  permission prompt that means "no decision": Claude Code asks in the terminal as usual.
  An event over 256 KiB is refused (InvalidArgs): the same.
- Unknown events and fields are ignored, never an error (Claude Code adds events often).

## 2. One pill per session

- **id** `agent:claude:<session_id>`; several sessions are several pills (side by side up
  to 3, then `+N`, SPEC §2c).
- **Order** ([PRIORITY.md](PRIORITY.md), 2026-11-07): the adapter sets no priority, only
  facts. Working is tier 2 at the kind's **35** (with `device`: over a transfer, under a
  notification). Waiting for you (`turn`) sets `needsYou`: tier 1, over everything that
  only runs. A permission prompt is an `ask`: tier 1 at **90**. Done (and stopped with an
  error) alerts once and keeps its place until it dims after **10 s** (`SETTLE_MS`); then,
  being `linger`, it steps back to tier 3 behind whatever runs. Among sessions in one
  tier the one that finished last leads (re-surfaced on `Stop`), and a stale one goes
  after a fresh one.
- **Subagents** are no pills of their own: they share the parent's `session_id` (only
  `agent_id` differs); the parent's compact counts them, "Working with 2 subagents", from
  `SubagentStart` / `SubagentStop`. A session started apart (a new `session_id`) is its
  own pill.
- **Claude Desktop** (its Code tab) runs the same `claude` CLI with
  `--setting-sources=user,project,local` (seen on this machine, CLI 2.1.317, 2026-11-07),
  so the hooks of `~/.claude/settings.json` run for its sessions too; each is a pill like a
  terminal's. Sessions are stored in one place (`~/.claude/projects/…`) and can be
  resumed from either: a resumed session keeps its `session_id`, so its pill.
- **Label**: "Claude · {project}", the project being the git repository Claude works in:
  up from `cwd` to the folder with `.git`, a git worktree's main repository (its `.git`
  file), so `buoy/src` and `buoy/.claude/worktrees/<slug>` are both "buoy" (2026-11-12,
  Ethan: the last part of `cwd` said "src"); no repository, the last part of `cwd`. The agent's
  name always leads the text (MASCOT.md: Bu does not say which agent it is). Sessions of
  one project share it in the minimal pill: no number there (Ethan, 2026-11-07).
  A Claude Desktop session opened on no folder runs in Desktop's own scratch workspace
  (`~/.config/Claude/scratch-workspaces/<id>/<id>/scratch-2026-11-06-38687f`): no project,
  so the label is "Claude" alone and the hover says "New session" until the session has
  a title (Ethan, 2026-11-07). Moved to a folder, its next event names the project
  ("Claude · buoy", seen 2026-11-07).
- **The session's name**, on hover only (kept off the pill again 2026-11-12, Ethan: the
  project stays short there and the step keeps its room): its title when Claude Code sends one
  (`session_title`, on `SessionStart` and later events once the session has a title:
  Claude Desktop names every session, the CLI after `/rename` — both seen 2026-11-07), whole — "Buoy — Optimization and security
  check" as it is (Ethan, 2026-11-07); else its worktree's slug; else the label. Titles seen on this machine are 4–44 characters; none
  is cut by Buoy, the renderer ellipsizes.
- **Minimal** (2026-11-12, Ethan, design/pill "Claude Code ở pill 1", C + D): Bu (the pose,
  §3) · "{project} · {what it does}" — the compact's subtitle, "buoy · Running pnpm test",
  "buoy · Waiting for you", "buoy · Done in 4 min" (no project: "Claude · …") — · elapsed
  since the prompt, "4 min" (the kit element `{since}`: "<1 min", "4 min", "1 h 5 min"; read
  every 20 s only while shown). With a task list: the task being done ("buoy · Run pnpm
  test") and the list's progress, "2 / 5", for the time. Done: no time beside it, it is in
  the words. A side pill keeps Bu and the time (or progress) at its two ends.
- **Compact** (hover): title — which session (its name, else the label); subtitle — what
  it is doing, in one line ("Thinking", "Running pnpm test", "Editing src/…/pill.js",
  "Fetching example.com", "Waiting for you", "Done in 4 min"); commands, paths and URLs
  give way to "Running a command", "Editing a file"… while the screen is shared (§7).
- **Expanded**: only for a permission prompt (§4).
- **Click** on a session's pill (Ethan, 2026-11-07): its terminal — or Claude Desktop —
  comes to the front (the app found in §6, `Shell.App.activate`) and nothing opens.
  Claude Desktop shows one session at a time, so for its sessions the click opens that
  very session: `claude://code/continue?session=local_<uuid>`, the id read from the
  Desktop file whose `cliSessionId` is the hook's `session_id`
  (`~/.config/Claude/claude-code-sessions/<id>/<id>/local_<uuid>.json`, searched as text
  on the click only, newest first). Both the files and the route are Desktop's own,
  undocumented (seen in Desktop 4.23118, 2026-11-07): no match, and Desktop comes up as
  for a terminal. When you are looking at the session already — its terminal in front,
  or Desktop in front showing that very session (`lastPrimaryCodeSession.id` in
  Desktop's `claude_desktop_config.json`, written as you switch; undocumented) — the
  click opens the Claude Code tab instead; Desktop in front on another session, the
  click switches to the pill's (Ethan, 2026-11-07). A row of the tab always opens its
  session. No
  window known (a remote shell, an unknown launcher), or that window already in front (a
  click from Claude Desktop on its own session; Ethan, 2026-11-07): the Claude Code tab
  opens. The kit's
  `pressFirst` (tabs.js `pressTarget`): onPress before the kind's tab, the tab when it
  returns false.
- **The Claude Code tab** (`tab.js`; its icon Claude's tray glyph, the white one Claude
  Desktop installs at `/usr/lib/claude-desktop/resources/TrayIconLinux-Dark.png` — read
  from there, never shipped with Buoy; the strip's generic icon without it): one row per session the island
  shows — Bu in its pose, the session's name, what it is doing, the elapsed time; dimmed
  when stale — and a permission prompt's Deny · Allow · Always under its session's row.
  A row's click brings that session's terminal up and closes the island. A stale session
  with no prompt has a × (as a notification's) that takes it off the island until its next
  event. The tab is in two parts, Active (working, asking) and Idle (done, or quiet past their
  staleAfter), each head with its count while that part has rows — clearing Idle takes its
  head, Active's stays; Idle's head has Clear, which takes them all (2026-11-13, Ethan;
  adapter.js canDismiss, `onAction('dismiss')` → source.js `_forget`). In the strip
  only while a session or a prompt is there (kit `tabWhileLive`, Ethan 2026-11-07). Kind
  `ask` is the module's too, so a click on a prompt's pill opens this tab, and other
  callers' `Ask()` get a row of their own there.
- **Starts** on the first `UserPromptSubmit` of a session: a session that is open but
  idle takes no room. A tool, a subagent or a permission prompt before any prompt was
  seen (the hooks installed mid-run) starts it too, its clock from then. **Ends** on
  `SessionEnd`, or after `Stop` once `activity-linger` (5 min by default) passes with no
  new prompt: done, it only waits (kit `linger`, SPEC §2: one rule for every waiting
  activity); the pointer on it holds it, the next prompt brings it back (Ethan,
  2026-11-07: 30 s, 2 min, 5 min, then the common rule). So does a session waiting for
  you (`turn`).
- **Stale**: working, one minute without news dims the pill and Bu takes `stale` — nothing
  came for a minute: a long command sends no event until it ends, a crashed session none
  at all; it stays in tier 2. Done, it dims after 10 s and steps back with it
  (PRIORITY.md; was one minute, 2026-11-07). Waiting for you (`turn`, `ask`) never dims.

## 3. Events → Bu and the pill

| Hook event | Bu | Compact title | Notes |
|---|---|---|---|
| `SessionStart` | — | — | remembered (cwd, model), nothing shown |
| `UserPromptSubmit` | `think` | "Thinking" | surfaces the pill; the elapsed time restarts |
| `PreToolUse` | `busy` | by tool: "Running {command}", "Editing {path}", "Reading {path}", "Searching for {pattern}", "Fetching {host}", "Searching the web for {query}", "Starting a subagent: {description}" (`Agent`, once `Task`), "Using {server} {tool}" (MCP), "Using {tool}" | the compact's subtitle; inside a subagent (`agent_id`) the parent keeps "Working with N subagents" |
| `PostToolUse` | `busy` | unchanged | clears an `error`; `TaskCreate` (its `subject`, the result's `id`) and `TaskUpdate` (`taskId`, `status`) keep the session's task list: the compact reads "Claude Code" over "{project} · 2 / 5" with up to 3 tasks as rows — done ✓, being done ▶, to do ○ dimmed; with more, the one just done, the one being done, the next — and none while the screen is shared (§7). Met in its middle, Buoy reads `~/.claude/tasks/<session_id>/*.json` once (2026-11-12, design/compact). Claude Code Desktop keeps its plan in its own MCP tool, `mcp__ccd_turn__update_plan` — `items` [{content, status}] (the whole plan), `advance`, or `done` [n] / `start` n — which the hooks see as any MCP tool; Buoy reads it as the task list too, beside any TaskCreate tasks (2026-11-13, Ethan: the Desktop's plan was not shown). The turn's end, `mcp__ccd_turn__wrap_up`, checks the whole list off in the app without an `update_plan`: Buoy then marks every task done (2026-11-13, Ethan) |
| `PostToolUseFailure` | `error` | "Something failed" | until the next event |
| `SubagentStart` / `SubagentStop` | `busy` | "Working with a subagent", "… with 2 subagents"; "Working" when the last stops | the parent keeps working |
| `PermissionRequest` | `ask` | "Needs your OK · Run: pnpm test" | §4; after the prompt, with no other news: `busy` "Working" (so it can go stale) |
| `Notification` `permission_prompt` | `ask` | "Needs your OK" | the terminal's own prompt; no buttons (the hook of §4 carries them) |
| `Notification` `idle_prompt`, `agent_needs_input`, `elicitation_dialog`, `elicitation_url_dialog` | `turn` | "Waiting for you" | alert once; `needsYou` (tier 1); never after `Stop` (the pill is ending). Other types ignored |
| `PreCompact` | `compact` | "Compacting" | `PostCompact` → `busy` "Working"; a `/compact` between prompts takes no room |
| `Stop` | `done`, alert; `party` first when the run took > 10 min | "Done", "Done in {n} min" from a minute | keeps its place 10 s, then dims and steps back (PRIORITY.md); ends after `activity-linger` (5 min) |
| `StopFailure` | `error`, alert | "Stopped with an error" | the same |
| no event for 1 min while `busy` / `think` / `compact` | `stale` | unchanged | `staleAfter`: the renderer dims it and draws Bu `stale` (kit, any stale activity led by Bu) |
| `SessionEnd` | — | — | `end()` at once |

Poses and lamp colours: MASCOT.md § Poses and § Agents. The `ask` lamp is red as every
waiting ask (INDICATORS: the red light when it cannot show). An alert on a session's pill
is a pulse where it stands: the pill has no expanded presentation (kit island.js render,
`expandable`).

## 4. The permission prompt

- `PermissionRequest` → `stack.ask` (the same kit ask as D-Bus `Ask()`, with two new
  options: `look`, the ask's leading / compact / expanded, and `quiet`): an `ask` activity
  `agent:claude:<session_id>:ask`, priority 90, Bu `ask` leading, opens expanded (never
  takes the keyboard unless clicked). Meanwhile the session's own pill is hidden (kit
  `hidden`: live, timed, never drawn or missed) — the prompt's pill stands for it, one
  pill per session (Ethan, 2026-11-07: two pills of one session were one too many); it
  comes back when the prompt ends. In the Claude Code tab the prompt's row carries the
  session's name and what it wants. One open prompt per session: a second one ends the
  first without an answer.
- **Expanded content**: title "Claude · {project} needs your OK"; subtitle what it wants:
  "Run: pnpm test", "Edit: src/…/pill.js", "Fetch: example.com", "Use: {mcp_server}
  {tool}" — the command or path on one line, ellipsized, after the session's name when it
  has one ("Buoy — Weather icons · Run: pnpm test"); buttons **Deny · Allow · Always** (Always
  only when Claude Code sent `permission_suggestions`). Its compact is a card held on the
  pill until answered (2026-11-12, design/alerts-and-asks "Ask"): Bu; "Claude Code wants to
  run" over "{project} · Bash" with the command as its body (2 lines), "Allow edits to
  {file}?" for an edit, else the question with what it wants; the buttons, Allow cream.
- **The answer** (Buoy builds the stdout, the script prints it):

  | Button | stdout |
  |---|---|
  | Allow | `{"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}` |
  | Always | the same with `"updatedPermissions": [<the first of permission_suggestions, unchanged>]` — Claude Code's own suggestion, kept where it says (usually the project's `.claude/settings.local.json`) |
  | Deny | `{… "decision": {"behavior": "deny", "message": "Denied in Buoy"}}` |
  | timeout (`activity-linger`, 5 min; was its own 10 min) | Deny, message "No answer in Buoy" (seen with 1 min, 2026-11-07) |
  | answered in the terminal first, ended, Buoy disabled | `''` — no decision: Claude Code's own flow stands |

- **Answered elsewhere** (the terminal, Desktop's card): the ask ends and the hook returns
  `''` when (adapter.js `settles`) the same call's `PostToolUse` / `PostToolUseFailure`
  arrives (same tool and input: PermissionRequest has no `tool_use_id`), or a new prompt,
  `Stop`, `StopFailure`, `SessionEnd`. Not on any event: reports run in the background, so
  one sent before the prompt (the previous tool's result, this tool's own `PreToolUse`)
  may arrive after it, and a `Notification` `permission_prompt` is the terminal's own
  dialog while the hook waits. And when the waiting hook leaves the bus (Claude Code
  dropped it, the session was interrupted; a D-Bus name watch on the caller). Whether the
  terminal shows its own dialog while the hook waits is not documented — to be seen in a
  real session (§13). **Claude Desktop** asks through `--permission-prompt-tool=stdio`;
  the hooks reference says the hooks run alongside the host and whichever decides first
  applies — the pill or Desktop's own card.
- **Answered elsewhere, with more** (2026-11-08, Ethan: Submit in Claude left the pill
  asking for an OK). The tool's result settles the prompt when every field asked for is
  still in its input — the answer may add some (Desktop's card adds `answers`).
- **A question is answered in Buoy** (2026-11-12, design/alerts-and-asks "Hỏi nhiều lựa
  chọn"; replaces "A question is not a permission", 2026-11-08). Claude Code's
  `AskUserQuestion` comes as a `PermissionRequest` whose hook waits, as a permission's does:
  Buoy shows a card of choices at the compact's width — Bu, the question, "Claude Code ·
  buoy · 1 / 3"; a row of 32 per choice (round mark for one, square for many) and Other
  last, typed in place (a click in it takes the keyboard: the island's modal grab, Esc lets
  go and the text stays); Skip · Next before the last question, Back · Submit on it (Skip ·
  Submit for one). Up to expanded's height (280 at 1920). What is chosen and typed stays in
  the source, in memory, till Submit sends it all at once: `allow` with `updatedInput` = the
  input plus `answers` = {question: answer} (one choice its label, many joined by ", ",
  Other's text after them; a question left empty left out). Skip, the `activity-linger`
  timeout, nothing chosen, or an answer in Claude's own card: the hook prints `''` and the
  question stays Claude's — the session's own pill asks as before (Bu's hand up, "Needs
  your answer", the `ask` kind's priority, a click brings the session up). While the screen
  is shared (§7) — or for a question Buoy cannot show (no options) — no card: Claude's own;
  a card open when sharing starts closes, what was chosen dropped (Ethan, 2026-11-13).
  Tried 2026-11-13 in an interactive session (Claude Code 2.1.319): the terminal shows its
  own dialog while the hook waits; Submit in Buoy closes it and Claude reads the answers,
  free text and labels mixed (design/alerts-and-asks "Đã thử").
- **Hook timeout**: the `PermissionRequest` entry gets `timeout` 1810 s, above the longest
  `activity-linger` (30 min), so Buoy always answers before Claude Code gives up.
- **Not opened** (the red light instead, INDICATORS): fullscreen, Do Not Disturb, the
  island hidden. **Not jumping open** while the session's terminal is focused (§6,
  `agent-quiet-focused`): the ask is `quiet` — no alert, no expand, also not when the
  island is seen again — and waits in the pill, its buttons in the compact (hover) and
  expanded (click). When another app takes the focus while it waits, it opens as an ask
  arriving would (kit `stack.wake`; Ethan, 2026-11-07). No window focused (the terminal
  minimized, the bare desktop) is not "another app": it keeps waiting. The focus is
  watched (`Shell.WindowTracker` `notify::focus-app`) only while such an ask waits.

## 5. Keyboard

As every ask (SPEC §2c, `kit/model/keys.js`): when the island holds the keyboard (a click, or
Super+B), the buttons carry their key — `d` for Deny; Allow and Always share their first
letter, so they take their position, `2` and `3` (kit `mnemonics`; Deny · Allow alone is
`d` · `a`) — Esc closes without answering (the ask stays). Never takes the keyboard on its
own.

## 6. The session's terminal

Claude Code does not say which terminal runs a session (the hooks reference documents
`cwd`, `session_id`, `CLAUDE_PROJECT_DIR`, no window or TTY). Buoy finds it:

- Buoy asks the bus for the hook's pid (kit `apps.js`: `GetConnectionUnixProcessID` of the caller, while
  the hook is still connected: the reply waits for it, a few ms in the background) and
  walks `/proc/<pid>/stat` up the parents (hook → `sh -c` → Claude Code → shell →
  terminal; a handful of reads, once per session) until Shell knows a window of that pid
  (`Shell.WindowTracker.get_app_from_pid`): the terminal app. Looked up again with the
  next event only if the pid could not be had.
- **Focused** = that app is `Shell.WindowTracker` `focus_app`. GNOME Terminal and Ptyxis
  run one process for all their windows and tabs, so this is per app, not per tab: any
  window of that terminal counts. A terminal in VS Code is VS Code.
- Claude Desktop's sessions walk up to its window (`claude` → `disclaimer` →
  `claude-desktop`, seen 2026-11-07 with `ps` and with the Shell's own walk from a
  command this session ran): Desktop focused = quiet, as a terminal.
- Not found (a remote shell, an unknown launcher): never "focused"; the prompt opens as
  normal.

## 7. Privacy

- The prompt you typed (`UserPromptSubmit.prompt`) is never shown or kept.
- Commands, paths and URLs show in the compact and the ask's subtitle — you need them to
  decide; a URL only by its host. While the screen is shared or recorded (Shell's own
  indicators, `Main.panel.statusArea.screenSharing` / `screenRecording` `visible`,
  watched only while a session is shown; the privacy rule of notifications, SPEC §6) they
  are replaced by the tool's name: "Run a command", "Edit a file", "Editing a file".
- Nothing is written anywhere by Buoy except, on Always, the rule Claude Code suggested,
  through Claude Code.

## 8. Installing the hooks (prefs)

A row **Claude Code** in Modules (group "Live in the Pill"), and inside it a switch "Show
my Claude Code sessions", its subtitle the state ("Hooks installed in
~/.claude/settings.json", "Claude Code not found", "Part of Buoy's hooks are in …",
"… could not be read (not valid JSON): Buoy leaves it alone"). The file is
`$CLAUDE_CONFIG_DIR/settings.json` when that is set, as Claude Code does. Prefs imports
`modules/agent/hooks.js` for this: pure, no Shell import (ARCHITECTURE rule 9).

- **On**: Buoy's prefs adds its entries to `~/.claude/settings.json` (created if
  missing), keeping everything else in it — other hooks, permissions, comments are not
  supported by JSON so none are lost. Each entry's command is
  `gjs -m '<extension>/hooks/claude.js'`; Buoy recognises its own entries by
  `buoy@murilegus/hooks/claude.js` in the command, wherever the extension is installed.
  Reporting events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`,
  `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Notification`, `PreCompact`,
  `PostCompact`, `Stop`, `StopFailure`, `SessionEnd`) get `"async": true`; `PostToolUse` is
  synchronous with `timeout` 5 (the stop, below); `PermissionRequest` synchronous with
  `timeout` 1810. An older install (its `PostToolUse` in the background) reads as partly
  installed: the switch offers to update it, and the compact shows no ■ until then.
- **■, stop the turn** (2026-11-12, Ethan): as Claude Desktop's Stop or Esc, not the
  session. Pressed, the session's pill says "Stopping…"; the next `PostToolUse` answers
  `{"continue": false, "stopReason": "Stopped from Buoy"}` (hooks.md: Claude stops, the
  session stays), and the pill says "Stopped". A long command or a turn of text only
  without a tool call runs to its end first: hooks cannot reach into a turn, and no
  signal or API stops one from outside (a SIGINT or SIGTERM ends the whole process,
  checked in a PTY). Only while a turn runs (`think`, `busy`, `compact`); never in the pill. No matcher: every tool. A
  file that is not a JSON object (comments, a typo) is never written.
- **Off**: removes exactly Buoy's entries (and an event's list left empty), nothing else.
- Claude Code reloads the file by itself: running sessions pick the change up.
- The switch reflects the file, not a Buoy key: it reads the entries on open and when the
  file changes while prefs is open (a file monitor). Turning the module off in Modules
  leaves the hooks in place (they then return at once, §1); the switch is inside the
  module's row, so it is reached with the module on.
- The file is written atomically (`Gio.File.replace_contents`, a backup `settings.json.bak`
  of the previous version the first time Buoy touches it).

## 9. Settings

| Key | Type | Default | Prefs | Meaning |
|---|---|---|---|---|
| `modules-agent` | b | true | Modules, row "Claude Code" | the module (replaces the stub `modules-ask`) |
| `activity-linger` | s | `5m` | the Island page's Pill group, "Waiting pills go after": 5, 10, 20, 30 min | the kit's, not the module's: no answer → Deny after it; a done or waiting session ends after it (was `agent-ask-timeout`, 10 min) |
| `agent-quiet-focused` | b | true | in the row, "Quiet in its terminal" | §6: no jump open while the terminal is focused |

The hooks' presence is in `~/.claude/settings.json`, not in a key (§8).

## 10. Codex (later, same module)

Codex has one hook, `notify`, at the end of a turn: `agent-turn-complete` → `done`, or
`turn` when it waits for input. No permission hook, so no Deny · Allow · Always. Same
pill shape, "Codex · {project}". Its own row in prefs when it lands.

## 11. Code and tests

- `modules/agent/` (replaces the stub `modules/ask/`): `tab.js` (the Claude Code tab),
  `index.js` (kinds `agent`, `ask`; `tabWhileLive`),
  `adapter.js` (pure: event JSON → `{pose, title, detail, start?, end?, alert?}`, and the
  permission reply), `source.js` (the D-Bus `Agent` calls, one record per session, the
  end after `Stop` (`activity-linger`), stale, the terminal lookup of §6), `hooks.js` (pure: add and
  remove Buoy's entries in a settings object), `hooks/claude.js` (the script, at the
  extension's top level: Claude Code runs it).
- Kit: the `{since}` element (§2); D-Bus `Agent` (DBUS.md, `Version` 2; a source gets the
  `BuoyDBus` in `enable(…, {dbus})` and answers with `setAgent`); `stack.ask` `look` and
  `quiet`, `stack.wake`; a stale activity's Bu takes the pose `stale`; `pressFirst` and
  `tabWhileLive` (tabs.js); `buildElement` (kit/ui/present/elements.js, for a tab.js); an icon may be an
  absolute path (kit/ui/present/elements.js `iconProps`), and falls back to the generic one when missing.
- Tests (`tests/agent.test.js`): every row of §3 (pose, title, detail per tool), the run
  > 10 min `party`, stale, two sessions, subagents counted in the parent (no pill),
  priorities 35 / 60 / 90, unknown events ignored; the three replies and the
  timeout reply, Always only with suggestions; the project name from `cwd`; privacy —
  prompt never in the output, details hidden when sharing; `hooks.js` — install into an
  empty, a missing and a busy file, idempotent, uninstall leaves others untouched.
- In the Shell (headless): `Agent` driven with recorded hook JSON; the ask answered by a
  click, by keys, by timeout, by a later event; fullscreen → red light; focused terminal
  → no jump open; disable while a hook waits → `''`.
- In a real Claude Code session (Ethan's machine): install from prefs, run a session,
  answer a permission in the pill and in the terminal.

### The fragile part

The click's Claude Desktop path (§2) leans on three things Desktop never documented: its
session files (`local_<uuid>.json` with `cliSessionId`), `lastPrimaryCodeSession.id` in
`claude_desktop_config.json`, and the `claude://code/continue?session=` route. Kept on
purpose (Ethan, 2026-11-07: it does what a click is expected to do), and each failure
falls back to bringing Desktop up — silently, so the jump to the session is simply gone.
After a Desktop update, check this first: two Desktop sessions, click each pill from
another app and from inside Desktop.

## 12. extensions.gnome.org

The review guidelines (gjs.guide, "Scripts and Binaries", read 2026-11-07): external
scripts are "strongly discouraged", allowed when the extension needs them, if written in
GJS, under an OSI license, spawned carefully. `hooks/claude.js` is GJS, GPL-2.0-or-later
(SPDX line), starts with a `gjs -m` shebang (the guide's `#!@GJS@ -m` is a build-time
placeholder; Buoy has no build step), and Buoy never spawns it — Claude Code does. Not
covered by the guidelines: writing another app's config (prefs, on the user's switch
only, Buoy's entries only, a `.bak` first) and a D-Bus method. A reviewer could still
cite "Don't include unnecessary files" (the extension never runs the script): the answer
is that the module does nothing without it. To say in the EGO submission notes.

## 13. Verified, and what still waits for a real session

Checked 2026-11-07 against the hooks reference (when the code landed):

- Common fields `session_id`, `cwd`, `hook_event_name`; `agent_id` / `agent_type` inside a
  subagent. `PostToolUseFailure` (`error`, `is_interrupt`) and `StopFailure` (`error`)
  exist; `PostCompact` exists. `PermissionRequest` has `tool_name`, `tool_input`,
  `permission_suggestions` (objects like `{type: 'addRules', rules, behavior,
  destination}`), no `tool_use_id`. `notification_type`: `permission_prompt`,
  `idle_prompt`, `agent_needs_input`, `elicitation_dialog`, `elicitation_url_dialog`
  (used), others ignored. The agent tool is `Agent` (`Task` kept).
- The reply shape (`hookSpecificOutput.decision.behavior`, `message` for deny,
  `updatedPermissions` for allow); exit 0 with nothing printed is no decision.
- `async: true` is a command hook's key; default timeout 600 s; settings files are
  watched, so running sessions pick the hooks up. Hooks run through `sh -c` (the walk of
  §6 goes through it).

Driven in headless Shell 50.1 with the real script and recorded events (2026-11-07):
the table of §3, Deny · Allow · Always by click and by keys, the timeout, an answer from
the terminal (the same call's result), the hook killed, disable while it waits, the
screen shared, a focused "terminal" (a GTK window whose child ran the hook) and another
app taking the focus from it (the ask opened), prefs
install / remove / a partly installed and a non-JSON file.

Seen on Ethan's machine (2026-11-07, Claude Desktop and the CLI in a terminal): the
hooks installed from prefs; a session's pill, its compact and the Claude Code tab;
`session_title` arrives for a Desktop session ("Buoy — Implementation" on hover); a click
from the session's own window opens the tab; a long command (`sleep 90` in a terminal
session) dims the working pill after a minute and its result brings it back; `/rename`
in a CLI session shows on hover at once ("TrungPT's home"): the title rides on later
events too, not only `SessionStart`, and the adapter takes it from any event. While the
`PermissionRequest` hook waits, the terminal shows its own dialog too (CLI, default
mode); Deny in the pill wins: the dialog goes and the transcript says "Denied by
PermissionRequest hook · Reason: Denied in Buoy". While a session asks, its prompt's pill
is its only pill, and after the answer the session's pill is back ("Done"). Answered
"Yes" in the terminal first, the pill's prompt ended by itself and the command ran. Allow
from the Claude Code tab's row: "Allowed by PermissionRequest hook", and the command ran. A
Claude Desktop session's prompt shows in the pill beside Desktop's own card (the hook
runs there too), and an answer on either ends the other.

Still to see in a real Claude Code session:
- Nothing left from the list above.
