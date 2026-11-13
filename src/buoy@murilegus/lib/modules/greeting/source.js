import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/services/source.js';
import {caseOf, noteFor, updateOf, latestOf, due, versionName, LATEST_URL, RELEASES, UPDATE_COMMAND, MARKER} from './adapter.js';
import notes from './notes.js';

const KIND = 'greeting';
const UPDATE_ID = 'greeting-update';
const TIMEOUT = 15;     // s, the one request

/**
 * The first run and What's new (GREETING.md §11), decided at `enable` from
 * `greeting-intro-shown`, `greeting-version-seen` and the running `metadata.json` `version`:
 *
 * - First run (a fresh install): Bu's introduction. What's new (an update): the running
 *   version's notes (notes.js). Neither: nothing; a newer version without notes still
 *   counts as seen.
 * - It waits for Shell's startup to finish (`Main.layoutManager` `startup-complete`) and
 *   for the island to be seen (stack.whenSeen: not over a fullscreen window), then shows
 *   once — a transient activity, expanded on its own — and writes both keys.
 * - About's "Show Bu's introduction again" sets `greeting-intro-shown` false: the
 *   introduction shows again at once.
 * - "…and more" writes `prefs-page` = `whats-new` and opens prefs, which shows About →
 *   What's new (Shell's OpenExtensionPrefs passes no page on, GREETING.md §11).
 * - No timer of its own: the greeting's time is its ttl, the typing is the kit's.
 *
 * A newer Buoy (GREETING.md §11 "A newer Buoy", `greeting-updates`), on an enable that has
 * no first run or What's new to show:
 *
 * - From extensions.gnome.org: Shell looks itself (ui/extensionSystem.js `init`: at the
 *   session's start and each day) and downloads the update; Buoy only reads the result —
 *   its own entry's `hasUpdate`, and `extension-state-changed` for one found later. No
 *   request of Buoy's.
 * - From install.sh (it leaves MARKER in the folder; an update from EGO replaces the
 *   folder, so the mark goes with it): one GET of GitHub's latest release, at most once a
 *   day (`greeting-update-checked`), at enable only — nothing polled. The answer is read
 *   as a version-name or dropped (adapter.js latestOf).
 * - Bu says it once per release (`greeting-update-told`), when the island is seen.
 */
export class GreetingSource extends Source {
    enable(stack, registry = null, settings = null, opts = {}) {
        super.enable(stack, registry, settings, opts);
        this._ext = opts.extension ?? null;   // extension.js passes itself (EGO review)
        this._version = this._ext?.metadata?.version ?? 0;
        this._id = null;
        this._cancelSeen = null;
        this._writing = false;
        this._updateId = null;
        this._cancelUpdateSeen = null;
        this._cancellable = null;
        this._session = null;
        settings?.connectObject('changed::greeting-intro-shown', () => {
            if (!this._writing && !settings.get_boolean('greeting-intro-shown'))
                this._schedule();          // About asked for the introduction again
        }, 'changed::greeting-updates', () => {
            if (settings.get_boolean('greeting-updates'))
                this._lookForUpdate();
            else
                this._stopUpdate();
        }, this);
        // an update Shell finds while Buoy runs (its daily look)
        Main.extensionManager.connectObject('extension-state-changed', (_m, extension) => {
            if (extension?.uuid === this._ext?.uuid && extension.hasUpdate)
                this._tellUpdate();
        }, this);
        this._schedule();
    }

    disable() {
        this._cancelSeen?.();
        this._cancelSeen = null;
        this._stopUpdate();
        Main.extensionManager.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._settings?.disconnectObject(this);
        if (this._id && this._stack?.has(this._id))
            this._stack.end(this._id);
        this._id = null;
        this._ext = null;
        super.disable();
    }

    _case() {
        return caseOf({
            introShown: this._settings.get_boolean('greeting-intro-shown'),
            versionSeen: this._settings.get_int('greeting-version-seen'),
            version: this._version,
        });
    }

    // Once Shell has started and the island is seen
    _schedule() {
        this._cancelSeen?.();
        this._cancelSeen = null;
        Main.layoutManager.disconnectObject(this);
        if (!this._case()) {
            this._markSeen();              // a newer version with nothing to say, or a downgrade
            this._lookForUpdate();         // nothing of Buoy's own to say: is a newer one out?
            return;
        }
        if (Main.layoutManager._startingUp) {
            Main.layoutManager.connectObject('startup-complete', () => {
                Main.layoutManager.disconnectObject(this);
                this._schedule();
            }, this);
            return;
        }
        this._cancelSeen = this._stack.whenSeen(() => {
            this._cancelSeen = null;
            this._show();
        });
    }

    _show() {
        if (!this._stack)
            return;
        const kind = this._case();
        const note = kind === 'whats-new' ? noteFor(notes, this._version) : null;
        if (!kind || (kind === 'whats-new' && !note)) {
            this._markSeen();
            return;
        }
        const a = this._registry?.build(KIND, 'buoy', {
            id: 'greeting',
            case: kind,
            note,
            animations: St.Settings.get().enable_animations,
            shortcut: this._settings.get_strv('keybind-focus')[0] ?? '',
            onMore: () => this._openWhatsNew(),
        });
        if (a)
            this._id = this._stack.surface(a);
        this._markSeen();
    }

    // Both keys once it showed: the first run counts as this version seen, so a later
    // update speaks only of what came after it (GREETING.md §11)
    _markSeen() {
        const s = this._settings;
        if (!s)
            return;
        this._writing = true;
        try {
            if (!s.get_boolean('greeting-intro-shown'))
                s.set_boolean('greeting-intro-shown', true);
            if (Number.isInteger(this._version) && s.get_int('greeting-version-seen') < this._version)
                s.set_int('greeting-version-seen', this._version);
        } finally {
            this._writing = false;
        }
    }

    // --- a newer Buoy ---------------------------------------------------------------------

    _stopUpdate() {
        this._cancelUpdateSeen?.();
        this._cancelUpdateSeen = null;
        this._cancellable?.cancel();
        this._cancellable = null;
        this._session?.abort();
        this._session = null;
        if (this._updateId && this._stack?.has(this._updateId))
            this._stack.end(this._updateId);
        this._updateId = null;
    }

    // Shell's answer first (it costs nothing); GitHub's only for an install.sh install,
    // once a day
    _lookForUpdate() {
        const s = this._settings;
        if (!s?.get_boolean('greeting-updates') || !this._ext)
            return;
        if (Main.layoutManager._startingUp) {
            Main.layoutManager.connectObject('startup-complete', () => {
                Main.layoutManager.disconnectObject(this);
                this._lookForUpdate();
            }, this);
            return;
        }
        if (Main.extensionManager.lookup(this._ext.uuid)?.hasUpdate) {
            this._tellUpdate();
            return;
        }
        if (this._cancellable || !due(GLib.get_real_time() / 1e6, s.get_int64('greeting-update-checked')))
            return;
        const cancellable = this._cancellable = new Gio.Cancellable();
        const done = () => {
            if (this._cancellable === cancellable)
                this._cancellable = null;
        };
        this._ext.dir.get_child(MARKER).query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT, cancellable, (file, res) => {
                try {
                    file.query_info_finish(res);
                } catch {
                    done();                // no mark: not install.sh's, or cancelled
                    return;
                }
                this._askGitHub(cancellable, done);
            });
    }

    _askGitHub(cancellable, done) {
        const session = this._session = new Soup.Session({user_agent: 'Buoy', timeout: TIMEOUT});
        const message = Soup.Message.new('GET', LATEST_URL);
        message.get_request_headers().append('Accept', 'application/vnd.github+json');
        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (_s, res) => {
            let latest = null;
            let answered = false;
            try {
                const bytes = session.send_and_read_finish(res);
                answered = true;
                if (message.get_status() === Soup.Status.OK)
                    latest = latestOf(new TextDecoder().decode(bytes.get_data() ?? new Uint8Array()));
            } catch (e) {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.debug(`Buoy: no word of a newer version: ${e.message}`);
            }
            if (this._session === session)
                this._session = null;
            done();
            if (cancellable.is_cancelled() || !this._settings)
                return;
            // an answer of any kind counts as asked today; offline, the next enable asks again
            if (answered)
                this._settings.set_int64('greeting-update-checked', Math.floor(GLib.get_real_time() / 1e6));
            if (latest)
                this._tellUpdate(latest);
        });
    }

    // Once per release, when the island is seen
    _tellUpdate(latest = null) {
        const state = () => updateOf({
            shell: Main.extensionManager.lookup(this._ext?.uuid)?.hasUpdate === true,
            latest,
            running: String(this._ext?.metadata?.['version-name'] ?? ''),
            version: this._version,
            told: this._settings?.get_string('greeting-update-told') ?? '',
        });
        if (!this._stack || !this._settings?.get_boolean('greeting-updates') || !state() ||
            this._cancelUpdateSeen || (this._id && this._stack.has(this._id)))
            return;
        this._cancelUpdateSeen = this._stack.whenSeen(() => {
            this._cancelUpdateSeen = null;
            const update = state();
            if (!update || !this._stack)
                return;
            const a = this._registry?.build(KIND, 'buoy', {
                id: UPDATE_ID,
                case: 'update',
                update,
                running: String(this._ext?.metadata?.['version-name'] ?? ''),
                animations: St.Settings.get().enable_animations,
                onCopy: () => {
                    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, UPDATE_COMMAND);
                    this._endUpdate();
                },
                onNotes: () => {
                    const name = versionName(update.name);
                    if (name)
                        Gio.AppInfo.launch_default_for_uri(`${RELEASES}/tag/v${name}`, global.create_app_launch_context(0, -1));
                    this._endUpdate();
                },
            });
            if (!a)
                return;
            if (this._updateId && this._stack.has(this._updateId))
                this._stack.end(this._updateId);
            this._updateId = this._stack.surface(a);
            this._settings.set_string('greeting-update-told', update.key);
        });
    }

    _endUpdate() {
        if (this._updateId && this._stack?.has(this._updateId))
            this._stack.end(this._updateId);
        this._updateId = null;
    }

    _openWhatsNew() {
        this._settings?.set_string('prefs-page', 'whats-new');
        if (this._id && this._stack?.has(this._id))
            this._stack.end(this._id);
        this._ext?.openPreferences();
    }
}
