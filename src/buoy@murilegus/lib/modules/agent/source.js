import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Source} from '../../kit/services/source.js';
import {appOfBusName} from '../../kit/services/apps.js';
import {listInfos, readText} from '../../kit/services/files.js';
import {installed} from './hooks.js';
import {SharingWatch} from '../../kit/services/sharing.js';
import {lingerMs} from '../../kit/model/settings.js';
import {
    AGENTS, DESKTOP_APP, ENTER, NEXT, OTHER_TEXT, SKIP, STOP, STOP_REPLY, SUBMIT, TIMEOUT, answered, answersOf, interrupted, stopping, askOf,
    desktopRoute, desktopShown, isQuestion, newAnswers, parseEvent, pickAnswer, questionLook, questionReply, questionsOf, reply, settles, step,
    tasksFromFiles,
} from './adapter.js';

const KIND = 'agent';
const MAX_SESSIONS = 16;        // records kept; the oldest quiet one goes first
const MAX_TASK_FILES = 100;   // a session's task list, read once when met in its middle

/**
 * Coding agents' sessions in the pill (docs/CODING-AGENTS.md): the hook script calls
 * D-Bus `Agent` (kit/services/dbus.js) with each event; this keeps one record per session, shows
 * it through the registry (adapter.js `agent`), and turns a permission prompt into a
 * kit ask whose answer goes back as the hook's stdout.
 *
 * - No timer of its own: the 30 s end after Stop is the activity's ttl, stale its
 *   staleAfter, the ask's timeout the stack's (kit/model/stack.js).
 * - The session's window (§6): the hook's bus peer's pid (GetConnectionUnixProcessID),
 *   then /proc/<pid>/stat up the parents until Shell knows a window of that pid — once
 *   per session. Focused = that app has the focus: then nothing jumps open.
 * - The screen shared or recorded (Shell's own indicators, ui/status/remoteAccess.js
 *   ScreenSharingIndicator / ScreenRecordingIndicator `visible`, kit/services/sharing.js): commands, paths and URLs
 *   are hidden (§7). Watched only while a session is shown.
 * - A waiting permission hook that goes away (Claude Code answered in the terminal, the
 *   session was interrupted) leaves the bus: its ask ends, no answer.
 */
export class AgentSource extends Source {
    /**
     * @param {object} stack
     * @param {?object} registry
     * @param {?Gio.Settings} settings
     * @param {object} [opts]
     * @param {object} [opts.dbus]  kit/services/dbus.js BuoyDBus: answers `Agent` while enabled
     */
    enable(stack, registry = null, settings = null, {dbus = null} = {}) {
        super.enable(stack, registry, settings);
        this._sessions = new Map();     // `${source}:${session_id}` → record
        this._asks = new Map();         // same key → {event, askId, watch}
        this._apps = new Map();         // same key → Shell.App, or null: none (looked up once)
        this._stopping = new Set();     // keys whose ■ was pressed: the next PostToolUse stops the turn
        this._roots = new Map();        // a cwd → its git repository's name (null: none), read once
        // same key → {uri, shown} for a session in Claude Desktop: its deep link and the
        // session Desktop shows, read ahead without blocking (kit/services/files.js) so a click
        // decides at once (_raise); refreshed on each of its events
        this._desktop = new Map();
        this._reads = new Gio.Cancellable();
        this._sharing = new SharingWatch(() => this._sharingChanged());
        this._dbus = dbus;
        dbus?.setAgent((source, text, info) => this.event(source, text, info));
        this._canStop = false;
        this._checkHooks();
    }

    // ■ shows only when Buoy's hooks stop a turn: this Buoy's, PostToolUse waited on
    // (hooks.js installed(): 'all'); an older install is told to update in prefs. Read now
    // and when a session starts, never more often.
    async _checkHooks() {
        const reads = this._reads;
        const text = await readText(GLib.build_filenamev([GLib.get_home_dir(), '.claude', 'settings.json']), reads);
        if (reads?.is_cancelled())
            return;
        let state = 'none';
        try {
            state = installed(JSON.parse(text ?? ''));
        } catch {}
        this._canStop = state === 'all';
    }

    disable() {
        this._dbus?.setAgent(null);
        this._dbus = null;
        for (const key of [...this._asks.keys()])
            this._settleAsk(key);
        for (const rec of this._sessions?.values() ?? [])
            this._stack?.end(this._activityId(rec));
        this._sessions = null;
        this._apps = null;
        this._reads?.cancel();
        this._reads = null;
        this._desktop = null;
        this._watchSharing(false);
        super.disable();
    }

    /**
     * One hook event (D-Bus `Agent`).
     *
     * @param {string} source  'claude'
     * @param {string} text  the hook's stdin
     * @param {{sender?: string}} [info]  the hook's bus name
     * @returns {string|Promise<string>} what the hook prints
     */
    event(source, text, {sender = null} = {}) {
        if (!this._stack || !AGENTS[source])
            return '';
        const ev = parseEvent(text);
        if (!ev)
            return '';
        const key = `${source}:${ev.session_id}`;
        const old = this._sessions.get(key) ?? null;
        // the ask of this session, answered elsewhere
        const open = this._asks.get(key);
        const settled = !!open && settles(open.event, ev);
        if (settled)
            this._settleAsk(key);

        const res = step(old, ev, Date.now(), source);
        if (res.end) {
            this._forget(key);
            return '';
        }
        // ■ was pressed: this tool call's hook answers the stop (hooks.js STOP_EVENT); a new
        // prompt or the turn's own end drops it
        if (ev.hook_event_name === 'UserPromptSubmit' || ev.hook_event_name === 'Stop')
            this._stopping.delete(key);
        if (ev.hook_event_name === 'PostToolUse' && this._stopping.delete(key)) {
            const done = interrupted(res.rec, Date.now());
            this._remember(key, done);
            this._show(done);
            return STOP_REPLY;
        }
        this._remember(key, res.rec);
        if (res.rec.cwd && res.rec.cwd !== old?.cwd)
            this._nameProject(key, res.rec.cwd);
        // met in its middle (Buoy started after the session did): its task list from
        // Claude's own files, ahead of the next task tool call
        if (!old && source === 'claude') {
            this._readTasks(key);
            this._checkHooks();
        }
        if (res.show) {
            this._show(res.rec, {
                alert: res.alert && !this._quiet(key), renew: res.rec.stopped && !old?.stopped,
            });
        } else if (settled && this._stack.has(this._activityId(res.rec))) {
            this._show(res.rec);          // out from behind its ended prompt
        }

        // the session's window, while the hook is still on the bus: the reply waits for it
        // (a report's hook exits right after; a few ms in the background)
        const lookup = sender && this._apps.get(key) === undefined ? this._lookUpApp(key, sender) : null;
        if (this._apps.get(key)?.get_id() === DESKTOP_APP)
            this._readDesktop(key);
        // a question (AskUserQuestion) is answered in a card of choices (design/alerts-and-asks
        // "Hỏi nhiều lựa chọn"); one Buoy cannot show, or on a shared screen (§7: the question
        // and its choices are the session's content), in Claude's own card: the hook gets no
        // decision at once and the session's pill says it waits
        const qs = isQuestion(ev) && !this._sharing.shared ? questionsOf(ev) : null;
        if (ev.hook_event_name === 'PermissionRequest' && (!isQuestion(ev) || qs)) {
            return (lookup ?? Promise.resolve()).then(() => {
                if (!this._stack || !this._sessions?.has(key))
                    return '';
                const rec = this._sessions.get(key);
                return qs ? this._askQuestion(key, rec, ev, qs, sender) : this._ask(key, rec, ev, sender);
            });
        }
        return lookup ? lookup.then(() => '') : '';
    }

    // --- the session's pill -------------------------------------------------------------

    _activityId(rec) {
        return `${KIND}:${rec.source}:${rec.id}`;
    }

    // renew: surfaced anew, so it counts as the newest of its priority (a session that
    // just finished leads one that finished earlier, Ethan 2026-11-07)
    _show(rec, {alert = false, renew = false} = {}) {
        if (!this._registry)
            return;
        this._watchSharing(true);
        const key = `${rec.source}:${rec.id}`;
        const a = this._registry.build(KIND, rec.source, {...rec, shared: this._sharing.shared, canStop: this._canStop});
        if (!a)
            return;
        a.onPress = opts => this._raise(key, opts);
        a.onAction = id => {
            if (id === STOP)
                this._stop(key);
        };
        // its prompt's pill stands for it meanwhile: one pill per session (§4, Ethan)
        a.hidden = this._asks?.has(key) ?? false;
        if (this._stack.has(a.id) && !renew)
            this._stack.update(a.id, a, {alert});
        else
            this._stack.surface({...a, alert});
    }

    _remember(key, rec) {
        this._sessions.set(key, rec);
        if (this._sessions.size <= MAX_SESSIONS)
            return;
        // too many: the oldest one not on the island goes
        const quiet = [...this._sessions.entries()]
            .filter(([k, r]) => k !== key && !this._stack.has(this._activityId(r)))
            .sort((a, b) => a[1].lastAt - b[1].lastAt)[0];
        if (quiet)
            this._forget(quiet[0]);
    }

    _forget(key) {
        const rec = this._sessions.get(key);
        this._settleAsk(key);
        if (rec)
            this._stack.end(this._activityId(rec));
        this._sessions.delete(key);
        this._apps.delete(key);
        this._stopping.delete(key);
        this._desktop.delete(key);
        if (![...this._sessions.values()].some(r => this._stack.has(this._activityId(r))))
            this._watchSharing(false);
    }

    // --- the permission prompt (§4) -----------------------------------------------------

    _ask(key, rec, ev, sender) {
        this._settleAsk(key);
        const askId = `${this._activityId(rec)}:ask`;
        const {question, options, look} = askOf(rec, ev, {shared: this._sharing.shared});
        // no answer within `activity-linger` (5 min) → deny: the one rule for what waits
        // (Ethan 2026-11-07; was `agent-ask-timeout`, 10 min)
        const waitMs = lingerMs(this._settings?.get_string('activity-linger'));
        const quiet = this._quiet(key);
        const entry = this._newAsk(key, rec, ev, askId, sender);
        const asked = this._stack.ask(askId, question, options, {
            app: rec.source, timeoutMs: waitMs, fallback: TIMEOUT, look, quiet,
        });
        this._watchFocus(key, entry, quiet);
        return asked.then(choice => {
            if (this._asks?.get(key) === entry) {
                this._dropAsk(key);
                this._backToWork(key);
            }
            return reply(choice, ev);
        });
    }

    // The session's open ask: kept while its hook waits; the session's pill hides behind it
    _newAsk(key, rec, ev, askId, sender) {
        const entry = {event: ev, askId, watch: 0, focusId: 0};
        this._asks.set(key, entry);
        this._show(rec);                  // hidden while the prompt stands for it
        // the hook process gone (answered in the terminal, Claude Code interrupted): no answer
        if (sender) {
            entry.watch = Gio.bus_watch_name_on_connection(Gio.DBus.session, sender,
                Gio.BusNameWatcherFlags.NONE, null, () => {
                    if (this._asks?.get(key) === entry) {
                        this._settleAsk(key);
                        this._backToWork(key);
                    }
                });
        }
        return entry;
    }

    // quiet while its terminal is focused; another app focused, it opens (Ethan
    // 2026-11-07). Watched only while such an ask waits.
    _watchFocus(key, entry, quiet) {
        if (!quiet)
            return;
        const tracker = Shell.WindowTracker.get_default();
        const app = this._apps.get(key);
        entry.focusId = tracker.connect('notify::focus-app', () => {
            const now = tracker.focus_app;
            if (!now || now === app || this._asks?.get(key) !== entry)
                return;
            this._unwatchFocus(entry);
            this._stack?.wake(entry.askId);
        });
    }

    // Claude's questions answered in Buoy (design/alerts-and-asks "Hỏi nhiều lựa chọn"): one
    // card, a question at a time; what is chosen and typed stays here, in memory, till Submit
    // sends it all at once as `answers` — or Skip, the timeout, an answer in Claude's own card
    // drop it and the question stays Claude's (its hook gets no decision).
    _askQuestion(key, rec, ev, qs, sender) {
        this._settleAsk(key);
        const askId = `${this._activityId(rec)}:ask`;
        const waitMs = lingerMs(this._settings?.get_string('activity-linger'));
        const quiet = this._quiet(key);
        const entry = this._newAsk(key, rec, ev, askId, sender);
        let state = newAnswers(qs);
        const lookNow = () => questionLook(this._sessions?.get(key) ?? rec, qs, state);
        const first = lookNow();
        const onInput = (id, value) => {
            if (this._asks?.get(key) !== entry)
                return;
            if (id === ENTER) {                  // Enter in Other: Next, or Submit on the last
                if (state.at === qs.length - 1) {
                    this._stack?.answer(askId, SUBMIT);
                    return;
                }
                id = NEXT;
            }
            const next = pickAnswer(qs, state, id, value);
            if (next === state)
                return;
            state = next;
            if (id === OTHER_TEXT)
                return;                          // the entry shows it: no rebuild under the caret
            const l = lookNow();
            this._stack?.update(askId, {text: l.question, actions: l.actions, ...l.look});
        };
        const asked = this._stack.ask(askId, first.question, [SKIP, SUBMIT], {
            app: rec.source, timeoutMs: waitMs, fallback: SKIP, look: first.look, quiet, onInput,
        });
        this._stack.update(askId, {actions: first.actions});   // several: Skip · Next first
        this._watchFocus(key, entry, quiet);
        return asked.then(choice => {
            const out = choice === SUBMIT ? questionReply(ev, answersOf(qs, state)) : '';
            if (this._asks?.get(key) === entry) {
                this._dropAsk(key);
                if (out)
                    this._backToWork(key);        // answered: Claude goes on
                else if (this._sessions?.has(key))
                    this._show(this._sessions.get(key));   // still Claude's: its pill asks
            }
            return out;
        });
    }

    // Ends the open ask of a session without an answer: its hook prints ''.
    _settleAsk(key) {
        const entry = this._asks?.get(key);
        if (!entry)
            return;
        this._dropAsk(key);
        this._stack?.end(entry.askId);
    }

    // The prompt is over without an event saying what came next: back to work (it goes
    // stale if nothing follows)
    _backToWork(key) {
        const rec = this._sessions?.get(key);
        if (!rec)
            return;
        const next = answered(rec, Date.now());
        this._sessions.set(key, next);
        if (this._stack?.has(this._activityId(next)))
            this._show(next);             // and shown again: the prompt is gone
    }

    _dropAsk(key) {
        const entry = this._asks.get(key);
        this._asks.delete(key);
        if (entry?.watch)
            Gio.bus_unwatch_name(entry.watch);
        if (entry)
            this._unwatchFocus(entry);
    }

    _unwatchFocus(entry) {
        if (entry.focusId)
            Shell.WindowTracker.get_default().disconnect(entry.focusId);
        entry.focusId = 0;
    }

    // --- the session's window (§6) ------------------------------------------------------

    // undefined: not known yet (asked again with the next event); null: no window found
    async _lookUpApp(key, sender) {
        const {pid, app} = await appOfBusName(sender);
        if (pid && this._sessions?.has(key)) {
            this._apps.set(key, app);
            if (app?.get_id() === DESKTOP_APP)
                this._readDesktop(key);
        }
    }

    // ■ (Ethan 2026-11-12: as Desktop's Stop): the turn stops at Claude's next tool call —
    // the synchronous PostToolUse hook answers `continue: false` (hooks.js STOP_EVENT) —
    // and the session stays, waiting for you. Meanwhile the compact says it is stopping.
    _stop(key) {
        const rec = this._sessions?.get(key);
        if (!rec || rec.stopped)
            return;
        this._stopping.add(key);
        this._sessions.set(key, stopping(rec));
        this._show(this._sessions.get(key));
    }

    // The project is the git repository Claude works in, not the folder it stands in
    // (Ethan 2026-11-12: `buoy/src` showed "src"): up from the cwd to the folder with `.git`;
    // in a git worktree its `.git` file points into the main repository's .git/worktrees/.
    // No repository: the folder's name (adapter.js projectOf) stays.
    async _nameProject(key, cwd) {
        let name = this._roots.get(cwd);
        if (name === undefined) {
            name = await repoName(cwd, this._reads);
            if (this._reads?.is_cancelled())
                return;
            this._roots.set(cwd, name);
        }
        const rec = this._sessions?.get(key);
        if (!name || !rec || rec.cwd !== cwd || rec.project === name)
            return;
        this._sessions.set(key, {...rec, project: name});
        if (this._stack?.has(this._activityId(rec)))
            this._show(this._sessions.get(key));
    }

    // ~/.claude/tasks/<session_id>/<id>.json (design/compact "Hàng của Claude Code")
    async _readTasks(key) {
        const reads = this._reads;
        const id = this._sessions?.get(key)?.id;
        if (!id || !/^[\w-]+$/.test(id))
            return;
        const dir = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), '.claude', 'tasks', id]));
        let infos;
        try {
            infos = await listInfos(dir, 'standard::name', reads);
        } catch {
            return;                       // no list: rows are its steps, as before
        }
        const names = infos.map(i => i.get_name()).filter(n => n.endsWith('.json')).slice(0, MAX_TASK_FILES);
        const files = await Promise.all(names.map(async name => ({name, text: await readText(dir.get_child(name), reads)})));
        const rec = this._sessions?.get(key);
        if (reads.is_cancelled() || !rec || rec.tasks?.length)
            return;                       // a task tool call came first: it is newer
        const tasks = tasksFromFiles(files);
        if (!tasks.length)
            return;
        this._sessions.set(key, {...rec, tasks});
        if (this._stack?.has(this._activityId(rec)))
            this._show(this._sessions.get(key));
    }

    // Claude Desktop's files for this session (§6), ahead of a click
    async _readDesktop(key) {
        const reads = this._reads;
        const id = this._sessions?.get(key)?.id;
        const [uri, shown] = await Promise.all([desktopSessionUri(id, reads), desktopShownSession(reads)]);
        if (!reads.is_cancelled() && this._sessions?.has(key))
            this._desktop.set(key, {uri, shown});
    }

    // A click on the session's pill (or its compact): its terminal — or its very session
    // in Claude Desktop (a deep link, desktopSessionUri) — comes up. false — no window
    // known, or you are looking at it already: its terminal in front, or Desktop in front
    // showing this very session (Ethan 2026-11-07) — and the caller opens the Claude Code
    // tab (§2). A row of that tab passes {row: true}: then always that session.
    _raise(key, {row = false} = {}) {
        const app = this._apps?.get(key);
        if (!app)
            return false;
        const front = Shell.WindowTracker.get_default().focus_app === app;
        // Claude Desktop shows one session at a time: open this one
        if (app.get_id() === DESKTOP_APP) {
            const {uri = null, shown = null} = this._desktop?.get(key) ?? {};
            this._readDesktop(key);   // fresh for the next click
            if (uri) {
                if (!row && front && uri.endsWith(`=${shown}`))
                    return false;
                try {
                    Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
                    return true;
                } catch (e) {
                    console.debug(`Buoy: agent: ${uri}: ${e.message}`);
                }
            }
        }
        if (!row && front)
            return false;
        app.activate();
        return true;
    }

    // Its window has the focus and `agent-quiet-focused` is on: nothing jumps open (§6)
    _quiet(key) {
        if (!(this._settings?.get_boolean('agent-quiet-focused') ?? true))
            return false;
        const app = this._apps?.get(key);
        return !!app && Shell.WindowTracker.get_default().focus_app === app;
    }

    // --- screen shared or recorded (§7) -------------------------------------------------

    _watchSharing(on) {
        if (on)
            this._sharing.start();
        else
            this._sharing.stop();
    }

    // the screen started or stopped being shared: re-draw what shows
    _sharingChanged() {
        for (const rec of this._sessions?.values() ?? []) {
            if (this._stack?.has(this._activityId(rec)))
                this._show(rec);
        }
    }
}

const DESKTOP_SESSIONS = ['Claude', 'claude-code-sessions'];
const MAX_DESKTOP_FILES = 200;

/**
 * The git repository a folder is in: its name, the main repository's for a worktree.
 *
 * @param {string} cwd
 * @param {?Gio.Cancellable} cancellable
 * @returns {Promise<?string>} null outside a repository (up to the home folder or /)
 */
async function repoName(cwd, cancellable) {
    const home = GLib.get_home_dir();
    for (let dir = cwd, i = 0; dir && dir !== '/' && dir !== home && i < 24; dir = GLib.path_get_dirname(dir), i++) {
        // eslint-disable-next-line no-await-in-loop -- one folder after the other, up
        if (await readText(GLib.build_filenamev([dir, '.git', 'HEAD']), cancellable) !== null)
            return GLib.path_get_basename(dir);
        // eslint-disable-next-line no-await-in-loop
        const link = await readText(GLib.build_filenamev([dir, '.git']), cancellable);
        const main = link?.match(/^gitdir:\s*(.+?)\/\.git\/worktrees\//m)?.[1];
        if (main)
            return GLib.path_get_basename(main);
        if (link !== null)
            return GLib.path_get_basename(dir);      // a submodule's .git file: its own folder
    }
    return null;
}

/**
 * Claude Desktop's deep link to a session (adapter.js desktopRoute), read ahead of a click
 * (AgentSource _readDesktop): its session files, two folders down, the newest first. Null
 * when none is that session.
 *
 * @param {?string} sessionId  the hook's session_id
 * @param {?Gio.Cancellable} cancellable
 * @returns {Promise<?string>}
 */
async function desktopSessionUri(sessionId, cancellable) {
    if (!sessionId)
        return null;
    const root = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_config_dir(), ...DESKTOP_SESSIONS]));
    const files = [];
    const list = async (dir, depth) => {
        let infos;
        try {
            infos = await listInfos(dir, 'standard::name,standard::type,time::modified', cancellable);
        } catch {
            return;
        }
        for (const info of infos) {
            if (files.length >= MAX_DESKTOP_FILES)
                return;
            const child = dir.get_child(info.get_name());
            if (info.get_file_type() === Gio.FileType.DIRECTORY && depth < 2)
                // eslint-disable-next-line no-await-in-loop -- two levels, a few folders
                await list(child, depth + 1);
            else if (depth === 2 && /^local_.*\.json$/.test(info.get_name()))
                files.push({file: child, name: info.get_name(), at: info.get_modification_date_time()?.to_unix() ?? 0});
        }
    };
    await list(root, 0);
    files.sort((a, b) => b.at - a.at);
    for (const f of files) {
        // eslint-disable-next-line no-await-in-loop -- newest first, stop at the first match
        const text = await readText(f.file, cancellable);
        const uri = text === null ? null : desktopRoute(f.name, text, sessionId);
        if (uri)
            return uri;
    }
    return null;
}

/**
 * @param {?Gio.Cancellable} cancellable
 * @returns {Promise<?string>} the session Claude Desktop shows (adapter.js desktopShown)
 */
async function desktopShownSession(cancellable) {
    const text = await readText(GLib.build_filenamev([GLib.get_user_config_dir(), 'Claude', 'claude_desktop_config.json']), cancellable);
    return text === null ? null : desktopShown(text);
}
