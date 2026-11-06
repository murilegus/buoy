import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/source.js';
import {AGENTS, TIMEOUT, answered, askOf, parseEvent, reply, settles, step} from './adapter.js';

const KIND = 'agent';
const MAX_SESSIONS = 16;        // records kept; the oldest quiet one goes first
const MAX_WALK = 32;            // parents walked up from the hook to a window (§6)

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
 *   ScreenSharingIndicator / ScreenRecordingIndicator `visible`): commands, paths and URLs
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
        this._shared = false;
        this._sharing = [];
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
        if (open && settles(open.event, ev))
            this._settleAsk(key);

        const res = step(old, ev, Date.now(), source);
        if (res.end) {
            this._forget(key);
            return '';
        }
        this._remember(key, res.rec);
        if (res.show)
            this._show(res.rec, {alert: res.alert && !this._quiet(key)});

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

    _show(rec, {alert = false} = {}) {
        if (!this._registry)
            return;
        this._watchSharing(true);
        const a = this._registry.build(KIND, rec.source, {...rec, shared: this._shared});
        if (!a)
            return;
        if (this._stack.has(a.id))
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
        const {question, options, look} = askOf(rec, ev, {shared: this._shared});
        const minutes = this._settings?.get_int('agent-ask-timeout') ?? 10;
        const quiet = this._quiet(key);
        const entry = {event: ev, askId, watch: 0, focusId: 0};
        this._asks.set(key, entry);
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
            app: rec.source, timeoutMs: minutes * 60 * 1000, fallback: TIMEOUT, look, quiet,
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
        const next = answered(rec, Date.now());
        if (!rec || next === rec)
            return;
        this._sessions.set(key, next);
        if (this._stack?.has(this._activityId(next)))
            this._show(next);
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
    _lookUpApp(key, sender) {
        return new Promise(resolve => {
            Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
                'GetConnectionUnixProcessID', new GLib.Variant('(s)', [sender]), new GLib.VariantType('(u)'),
                Gio.DBusCallFlags.NONE, 1000, null, (conn, res) => {
                    try {
                        const [pid] = conn.call_finish(res).deepUnpack();
                        if (this._sessions?.has(key))
                            this._apps.set(key, appOfProcess(pid));
                    } catch {
                        // gone already: the next event asks again
                    }
                    resolve();
                });
        });
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
        if (on === this._sharing.length > 0)
            return;
        if (!on) {
            this._sharing.forEach(i => i.disconnectObject(this));
            this._sharing = [];
            this._shared = false;
            return;
        }
        const area = Main.panel.statusArea;
        this._sharing = [area.screenSharing, area.screenRecording].filter(Boolean);
        const sync = () => {
            const shared = this._sharing.some(i => i.visible);
            if (shared === this._shared)
                return;
            this._shared = shared;
            for (const rec of this._sessions?.values() ?? []) {
                if (this._stack?.has(this._activityId(rec)))
                    this._show(rec);
            }
        };
        this._sharing.forEach(i => i.connectObject('notify::visible', sync, this));
        this._shared = this._sharing.some(i => i.visible);
    }
}

/**
 * The app owning a window of `pid` or of one of its parents (§6): GNOME Terminal and
 * Ptyxis run every window in one process, the shell and Claude Code under it.
 *
 * @param {number} pid
 * @returns {?Shell.App}
 */
function appOfProcess(pid) {
    const tracker = Shell.WindowTracker.get_default();
    for (let i = 0, p = pid; i < MAX_WALK && p > 1; i++) {
        const app = tracker.get_app_from_pid(p);
        if (app)
            return app;
        p = parentOf(p);
    }
    return null;
}

/**
 * @param {number} pid
 * @returns {number} its parent's pid, 0 when unknown
 */
export function parentOf(pid) {
    try {
        const [, bytes] = GLib.file_get_contents(`/proc/${pid}/stat`);
        // "pid (comm) state ppid …": comm may hold spaces and parentheses
        const text = new TextDecoder().decode(bytes);
        return Number(text.slice(text.lastIndexOf(')') + 2).split(' ')[1]) || 0;
    } catch {
        return 0;
    }
}
