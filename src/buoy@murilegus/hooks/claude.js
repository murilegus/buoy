// Claude Code's hook for Buoy (docs/CODING-AGENTS.md §1). Claude Code runs it, never
// Buoy: `gjs -m '<extension>/hooks/claude.js'`, installed from Buoy's prefs into
// ~/.claude/settings.json. It reads the event's JSON on stdin, hands it to Buoy over
// D-Bus `Agent` untouched and prints Buoy's reply — '' for every event but a permission
// prompt. Buoy disabled, logged out or another desktop: the call fails, nothing is
// printed, exit 0, and Claude Code goes on as without Buoy.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const SOURCE = 'claude';
// Reports run in the background (`async`): a short wait. A permission prompt waits for
// a person, as long as the hook may run (hooks.js ASK_HOOK_TIMEOUT, 30 min 10 s).
const REPORT_MS = 2000;
const ASK_MS = (30 * 60 + 10) * 1000;

// GioUnix.InputStream since GLib 2.80; Gio.UnixInputStream before
let GioUnix = null;
try {
    ({default: GioUnix} = await import('gi://GioUnix'));
} catch {}

function readStdin() {
    const stream = GioUnix
        ? new GioUnix.InputStream({fd: 0, close_fd: false})
        : new Gio.UnixInputStream({fd: 0, close_fd: false});
    const out = Gio.MemoryOutputStream.new_resizable();
    out.splice(stream, Gio.OutputStreamSpliceFlags.CLOSE_TARGET, null);
    return new TextDecoder().decode(out.steal_as_bytes().toArray());
}

// Long strings cut to their start: a Write's content, an Edit's strings, a tool's
// output are never shown (CODING-AGENTS.md §7), and the event stays small on the bus.
const MAX_STRING = 4096;
function slim(v) {
    if (typeof v === 'string')
        return v.length > MAX_STRING ? v.slice(0, MAX_STRING) : v;
    if (Array.isArray(v))
        return v.map(slim);
    if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, slim(x)]));
    return v;
}

function main() {
    let text;
    try {
        text = readStdin();
    } catch {
        return;
    }
    let event;
    try {
        event = JSON.parse(text);
    } catch {
        return;                       // not an event: nothing to say
    }
    const asks = event?.hook_event_name === 'PermissionRequest';
    try {
        const res = Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell/Extensions/Buoy',
            'org.gnome.Shell.Extensions.Buoy', 'Agent', new GLib.Variant('(ss)', [SOURCE, JSON.stringify(slim(event))]),
            new GLib.VariantType('(s)'), Gio.DBusCallFlags.NO_AUTO_START, asks ? ASK_MS : REPORT_MS, null);
        const [reply] = res.deepUnpack();
        if (reply)
            print(reply);
    } catch {
        // Buoy is not there (or too old for `Agent`): no decision
    }
}

main();
