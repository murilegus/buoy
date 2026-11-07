import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

/**
 * Which app's window a bus peer belongs to (2026-11-07): the peer's pid from the bus
 * (`GetConnectionUnixProcessID`), then its parents up `/proc/<pid>/stat` until Shell
 * knows a window of that pid (`Shell.WindowTracker.get_app_from_pid`). For callers that
 * say nothing usable about their app: a Claude Code hook (CODING-AGENTS.md §6) or an MPRIS
 * player without `DesktopEntry` (Chrome's). A handful of reads, on demand only.
 */

const MAX_WALK = 32;

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

/**
 * @param {number} pid
 * @returns {?Shell.App} the app owning a window of `pid` or of one of its parents
 *   (GNOME Terminal and Ptyxis run every window in one process, shells under it)
 */
export function appOfPid(pid) {
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
 * @param {string} name  a unique or well-known bus name
 * @param {object} [opts]
 * @param {Gio.DBusConnection} [opts.bus]
 * @returns {Promise<{pid: number, app: ?Shell.App}>} pid 0 when the bus did not say (the
 *   peer gone already)
 */
export function appOfBusName(name, {bus = Gio.DBus.session} = {}) {
    return new Promise(resolve => {
        bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'GetConnectionUnixProcessID', new GLib.Variant('(s)', [name]), new GLib.VariantType('(u)'),
            Gio.DBusCallFlags.NONE, 1000, null, (conn, res) => {
                try {
                    const [pid] = conn.call_finish(res).deepUnpack();
                    resolve({pid, app: appOfPid(pid)});
                } catch {
                    resolve({pid: 0, app: null});
                }
            });
    });
}
