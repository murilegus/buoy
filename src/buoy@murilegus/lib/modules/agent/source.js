import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Source} from '../../kit/source.js';
import {appOfBusName} from '../../kit/apps.js';
import {SharingWatch} from '../../kit/sharing.js';
import {lingerMs} from '../../kit/settings.js';
import {AGENTS, DESKTOP_APP, TIMEOUT, answered, askOf, desktopRoute, desktopShown, parseEvent, reply, settles, step} from './adapter.js';

const KIND = 'agent';
const MAX_SESSIONS = 16;        // records kept; the oldest quiet one goes first

/**
 * Coding agents' sessions in the pill (docs/CODING-AGENTS.md): the hook script calls
 * D-Bus `Agent` (kit/dbus.js) with each event; this keeps one record per session, shows
 * it through the registry (adapter.js `agent`), and turns a permission prompt into a
 * kit ask whose answer goes back as the hook's stdout.
 *
 * - No timer of its own: the 30 s end after Stop is the activity's ttl, stale its
 *   staleAfter, the ask's timeout the stack's (kit/stack.js).
 * - The session's window (§6): the hook's bus peer's pid (GetConnectionUnixProcessID),
 *   then /proc/<pid>/stat up the parents until Shell knows a window of that pid — once
 *   per session. Focused = that app has the focus: then nothing jumps open.
 * - The screen shared or recorded (Shell's own indicators, ui/status/remoteAccess.js
 *   ScreenSharingIndicator / ScreenRecordingIndicator `visible`, kit/sharing.js): commands, paths and URLs
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
     * @param {object} [opts.dbus]  kit/dbus.js BuoyDBus: answers `Agent` while enabled
     */
    enable(stack, registry = null, settings = null, {dbus = null} = {}) {
        super.enable(stack, registry, settings);
        this._sessions = new Map();     // `${source}:${session_id}` → record
        this._asks = new Map();         // same key → {event, askId, watch}
        this._apps = new Map();         // same key → Shell.App, or null: none (looked up once)
        this._sharing = new SharingWatch(() => this._sharingChanged());
        this._dbus = dbus;
        dbus?.setAgent((source, text, info) => this.event(source, text, info));
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
        this._remember(key, res.rec);
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
        if (ev.hook_event_name === 'PermissionRequest') {
            return (lookup ?? Promise.resolve()).then(() =>
                this._stack && this._sessions?.has(key) ? this._ask(key, this._sessions.get(key), ev, sender) : '');
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
        const a = this._registry.build(KIND, rec.source, {...rec, shared: this._sharing.shared});
        if (!a)
            return;
        const key = `${rec.source}:${rec.id}`;
        a.onPress = opts => this._raise(key, opts);
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
        const asked = this._stack.ask(askId, question, options, {
            app: rec.source, timeoutMs: waitMs, fallback: TIMEOUT, look, quiet,
        });
        // quiet while its terminal is focused; another app focused, it opens (Ethan
        // 2026-11-07). Watched only while such an ask waits.
        if (quiet) {
            const tracker = Shell.WindowTracker.get_default();
            const app = this._apps.get(key);
            entry.focusId = tracker.connect('notify::focus-app', () => {
                const now = tracker.focus_app;
                if (!now || now === app || this._asks?.get(key) !== entry)
                    return;
                this._unwatchFocus(entry);
                this._stack?.wake(askId);
            });
        }
        return asked.then(choice => {
            if (this._asks?.get(key) === entry) {
                this._dropAsk(key);
                this._backToWork(key);
            }
            return reply(choice, ev);
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
        if (pid && this._sessions?.has(key))
            this._apps.set(key, app);
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
            const uri = desktopSessionUri(this._sessions?.get(key)?.id);
            if (uri) {
                if (!row && front && uri.endsWith(`=${desktopShownSession()}`))
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
 * Claude Desktop's deep link to a session (adapter.js desktopRoute), read on a click only:
 * its session files, two folders down, the newest first. Null when none is that session.
 *
 * @param {?string} sessionId  the hook's session_id
 * @returns {?string}
 */
function desktopSessionUri(sessionId) {
    if (!sessionId)
        return null;
    const root = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_config_dir(), ...DESKTOP_SESSIONS]));
    const files = [];
    const list = (dir, depth) => {
        let e;
        try {
            e = dir.enumerate_children('standard::name,standard::type,time::modified', Gio.FileQueryInfoFlags.NONE, null);
        } catch {
            return;
        }
        for (let info = e.next_file(null); info && files.length < MAX_DESKTOP_FILES; info = e.next_file(null)) {
            const child = dir.get_child(info.get_name());
            if (info.get_file_type() === Gio.FileType.DIRECTORY && depth < 2)
                list(child, depth + 1);
            else if (depth === 2 && /^local_.*\.json$/.test(info.get_name()))
                files.push({file: child, name: info.get_name(), at: info.get_modification_date_time()?.to_unix() ?? 0});
        }
        e.close(null);
    };
    list(root, 0);
    files.sort((a, b) => b.at - a.at);
    for (const f of files) {
        try {
            const [, bytes] = f.file.load_contents(null);
            const uri = desktopRoute(f.name, new TextDecoder().decode(bytes), sessionId);
            if (uri)
                return uri;
        } catch {}
    }
    return null;
}

/** @returns {?string} the session Claude Desktop shows (adapter.js desktopShown), on a click only */
function desktopShownSession() {
    try {
        const path = GLib.build_filenamev([GLib.get_user_config_dir(), 'Claude', 'claude_desktop_config.json']);
        const [, bytes] = GLib.file_get_contents(path);
        return desktopShown(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
}

