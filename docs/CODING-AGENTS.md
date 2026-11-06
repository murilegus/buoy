# Coding agents — Claude Code in the pill

The reference for showing a coding agent's sessions on the island: how the events get
there, one pill per session, which pose Bu takes for each event, the permission prompt
with Deny · Allow · Always, when Buoy stays quiet, and how the hooks are installed.
FEATURES M3 "Claude Code: ask + agent activity" points here; MASCOT.md § Agents keeps
the pose colours. Decided with Ethan, 2026-11-07. Claude Code first; Codex later in the
same module (§10).

Not named `AGENTS.md`: that file name is the convention coding agents read as their own
instructions.

Sources: Claude Code's hooks reference (code.claude.com/docs/en/hooks), read 2026-11-07
through a summary — every field name below is checked against the live page and a real
session before the code relies on it (§12).

## Principles

1. **The session, not the prompt.** One pill per Claude Code session, alive from the
   first prompt to the session's end. It says which project, what Claude is doing and
   for how long; Bu's pose says how it is going.
2. **Never slow Claude down.** Every hook that only reports runs in the background
   (`async`). Only the permission prompt waits, because a person has to answer it. If
   Buoy is off or missing, the hook returns at once and Claude Code goes on as without
   Buoy.
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
  D-Bus untouched through `Gio` — no shell quoting — and gjs is on every GNOME system.
  It reads stdin, adds `ppid` (its parent: the Claude Code process, for §6), calls
  `Agent`, prints the reply if there is one, exits 0.
- **D-Bus** (DBUS.md): a new method `Agent(s source, s event) → s reply`; `source` is
  `claude` (later `codex`), `event` the hook's JSON as text. Buoy parses it in the module's
  pure adapter. `reply` is `''`, or for a permission prompt the whole stdout JSON Claude
  Code expects (§5), so the script stays dumb. `Version` goes to 2.
- **Buoy not there** (disabled, logged out, another desktop): the call fails fast (2 s
  D-Bus timeout for reports) and the script exits 0 with nothing on stdout — for a
  permission prompt that means "no decision": Claude Code asks in the terminal as usual.
- Unknown events and fields are ignored, never an error (Claude Code adds events often).

## 2. One pill per session

- **id** `agent:claude:<session_id>`; several sessions are several pills (side by side up
  to 3, then `+N`, SPEC §2c). Priority as other running activities.
- **Name**: "Claude · {project}", the project being the last part of `cwd` (or of
  `CLAUDE_PROJECT_DIR`). The agent's name always leads the text (MASCOT.md: Bu does not
  say which agent it is).
- **Minimal**: Bu (the pose, §3) · "Claude · buoy" · elapsed since the prompt, "4 min"
  (a new kit element `{since}`, the twin of `{until}`: minutes, ticking once a minute,
  only while shown).
- **Compact** (hover): title — what it is doing ("Thinking", "Running a command",
  "Editing pill.js", "Waiting for you", "Done"); subtitle — the tool's detail ("Bash ·
  pnpm test", "Edit · src/…/pill.js"), hidden while the screen is shared (§7).
- **Expanded**: only for a permission prompt (§4).
- **Starts** on the first `UserPromptSubmit` of a session: a session that is open but
  idle takes no room. **Ends** on `SessionEnd`, or 2 min after `Stop` if no new prompt
  came (the next prompt brings it back).

## 3. Events → Bu and the pill

| Hook event | Bu | Compact title | Notes |
|---|---|---|---|
| `SessionStart` | — | — | remembered (cwd, model), nothing shown |
| `UserPromptSubmit` | `think` | "Thinking" | surfaces the pill; the elapsed time restarts |
| `PreToolUse` | `busy` | by tool: "Running a command", "Editing {file}", "Reading {file}", "Searching", "Fetching a page", "Using {tool}" | |
| `PostToolUse` | `busy` | unchanged | clears an `error` |
| `PostToolUseFailure` | `error` | "Something failed" | until the next event |
| `SubagentStart` / `SubagentStop` | `busy` | "Working with a subagent" | the parent keeps working |
| `PermissionRequest` | `ask` | "Needs your OK" | §4 |
| `Notification` `permission_prompt` | `ask` | "Needs your OK" | the terminal's own prompt; no buttons (the hook of §4 carries them) |
| `Notification` `idle_prompt`, `agent_needs_input`, `elicitation_dialog` | `turn` | "Waiting for you" | alert once |
| `PreCompact` | `compact` | "Compacting" | `PostCompact` → back to `busy` |
| `Stop` | `done`, alert; `party` first when the run took > 10 min | "Done in {n} min" | the pill ends 2 min later |
| `StopFailure` | `error`, alert | "Stopped with an error" | ends 2 min later |
| no event for 2 min while `busy` / `think` | `stale` | unchanged | the renderer dims it (`staleAfter`) |
| `SessionEnd` | — | — | `end()` at once |

Poses and lamp colours: MASCOT.md § Poses and § Agents. The `ask` lamp is red as every
waiting ask (INDICATORS: the red light when it cannot show).

## 4. The permission prompt

- `PermissionRequest` → `stack.ask` (the same kit ask as D-Bus `Ask()`): an `ask`
  activity `agent:claude:<session_id>:ask`, Bu `ask` leading, transient (opens expanded,
  never takes the keyboard unless clicked), the session's pill in pose `ask` meanwhile.
- **Expanded content**: title "Claude · {project} needs your OK"; subtitle what it wants:
  "Run: pnpm test", "Edit: src/…/pill.js", "Fetch: example.com", "Use: {mcp_server}
  {tool}" — the command or path on one line, ellipsized; buttons **Deny · Allow ·
  Always** (Always only when Claude Code sent `permission_suggestions`).
- **The answer** (Buoy builds the stdout, the script prints it):

  | Button | stdout |
  |---|---|
  | Allow | `{"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}` |
  | Always | the same with `"updatedPermissions": [<the first of permission_suggestions, unchanged>]` — Claude Code's own suggestion, kept where it says (usually the project's `.claude/settings.local.json`) |
  | Deny | `{… "decision": {"behavior": "deny", "message": "Denied in Buoy"}}` |
  | timeout (`agent-ask-timeout`, 10 min) | Deny, message "No answer in Buoy" |
  | answered in the terminal first, ended, Buoy disabled | `''` — no decision: Claude Code's own flow stands |

- **Answered in the terminal**: the next event of that session (any) ends the open ask and
  the hook returns `''`. Whether the terminal shows its own dialog while the hook waits
  is not documented — to be seen in a real session (§12).
- **Hook timeout**: the `PermissionRequest` entry gets `timeout` 610 s, just above
  `agent-ask-timeout`, so Buoy always answers before Claude Code gives up.
- **Not opened** (the red light instead, INDICATORS): fullscreen, Do Not Disturb, the
  island hidden. **Not jumping open** while the session's terminal is focused (§6): the
  ask waits in the pill, its buttons in the compact (hover) and expanded (click).

## 5. Keyboard

As every ask (SPEC §2c, `kit/keys.js`): when the island holds the keyboard (a click, or
Super+B), the buttons carry their key — D(eny), A(llow), Al(w)ays by mnemonic — Enter
the first, Esc closes without answering (the ask stays). Never takes the keyboard on its
own.

## 6. The session's terminal

Claude Code does not say which terminal runs a session (the hooks reference documents
`cwd`, `session_id`, `CLAUDE_PROJECT_DIR`, no window or TTY). Buoy finds it:

- The hook sends `ppid`, the Claude Code process. Buoy walks `/proc/<pid>/stat` up the
  parents (a handful of reads, once per session) until a process owns a window
  (`Shell.WindowTracker.get_app_from_pid`, or a `Meta.Window.get_pid()` match): the
  terminal app.
- **Focused** = that app's window has focus. GNOME Terminal and Ptyxis run one process
  for all their windows and tabs, so this is per app, not per tab: any window of that
  terminal counts. A terminal in VS Code is VS Code.
- Not found (a remote shell, an unknown launcher): never "focused"; the prompt opens as
  normal.

## 7. Privacy

- The prompt you typed (`UserPromptSubmit.prompt`) is never shown or kept.
- Commands, paths and URLs show in the compact and the ask's subtitle — you need them to
  decide. While the screen is shared or recorded (the privacy rule of notifications,
  SPEC §6) they are replaced by the tool's name: "Run a command", "Edit a file".
- Nothing is written anywhere by Buoy except, on Always, the rule Claude Code suggested,
  through Claude Code.

## 8. Installing the hooks (prefs)

A row **Claude Code** in Modules (group "Live in the Pill"): a switch "Show my Claude Code
sessions", its subtitle the state ("Hooks installed in ~/.claude/settings.json", "Claude
Code not found").

- **On**: Buoy's prefs adds its entries to `~/.claude/settings.json` (created if
  missing), keeping everything else in it — other hooks, permissions, comments are not
  supported by JSON so none are lost. Each entry's command is
  `gjs -m '<extension>/hooks/claude.js'`; Buoy recognises its own entries by that path.
  Reporting events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
  `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Notification`, `PreCompact`,
  `PostCompact`, `Stop`, `StopFailure`, `SessionEnd`) get `"async": true`;
  `PermissionRequest` is synchronous with `timeout` 610.
- **Off**: removes exactly Buoy's entries (and an event's list left empty), nothing else.
- Claude Code reloads the file by itself: running sessions pick the change up.
- The switch reflects the file, not a Buoy key: it reads the entries on open and when the
  file changes while prefs is open. Turning the module off in Modules leaves the hooks in
  place (they then return at once, §1); the row says so.
- The file is written atomically (`Gio.File.replace_contents`, a backup `settings.json.bak`
  of the previous version the first time Buoy touches it).

## 9. Settings

| Key | Type | Default | Prefs | Meaning |
|---|---|---|---|---|
| `modules-agent` | b | true | Modules, row Claude Code | the module (replaces the stub `modules-ask`) |
| `agent-ask-timeout` | i | 600 | under the row, minutes 1–30 | no answer → Deny (was `ask-timeout`) |
| `agent-quiet-focused` | b | true | under the row | §6: no jump open while the terminal is focused |

The hooks' presence is in `~/.claude/settings.json`, not in a key (§8).

## 10. Codex (later, same module)

Codex has one hook, `notify`, at the end of a turn: `agent-turn-complete` → `done`, or
`turn` when it waits for input. No permission hook, so no Deny · Allow · Always. Same
pill shape, "Codex · {project}". Its own row in prefs when it lands.

## 11. Code and tests

- `modules/agent/` (replaces the stub `modules/ask/`): `index.js` (kinds `agent`, `ask`),
  `adapter.js` (pure: event JSON → `{pose, title, detail, start?, end?, alert?}`, and the
  permission reply), `source.js` (the D-Bus `Agent` calls, one record per session, the
  2-minute end after `Stop`, stale, the terminal lookup of §6), `hooks.js` (pure: add and
  remove Buoy's entries in a settings object), `hooks/claude.js` (the script, at the
  extension's top level: Claude Code runs it).
- Kit: the `{since}` element (§2); D-Bus `Agent` (DBUS.md, `Version` 2).
- Tests (`tests/agent.test.js`): every row of §3 (pose, title, detail per tool), the run
  > 10 min `party`, stale, two sessions, unknown events ignored; the three replies and the
  timeout reply, Always only with suggestions; the project name from `cwd`; privacy —
  prompt never in the output, details hidden when sharing; `hooks.js` — install into an
  empty, a missing and a busy file, idempotent, uninstall leaves others untouched.
- In the Shell (headless): `Agent` driven with recorded hook JSON; the ask answered by a
  click, by keys, by timeout, by a later event; fullscreen → red light; focused terminal
  → no jump open; disable while a hook waits → `''`.
- In a real Claude Code session (Ethan's machine): install from prefs, run a session,
  answer a permission in the pill and in the terminal.

## 12. To verify before the code relies on it

- Exact field names (`notification_type` values, `PostToolUseFailure` fields,
  `permission_suggestions` shape) against the live hooks reference.
- What the terminal shows while a `PermissionRequest` hook waits, and which answer wins.
- What Claude Code does when a `PermissionRequest` hook times out.
- That a hook's parent process is Claude Code (for `ppid`, §6).
