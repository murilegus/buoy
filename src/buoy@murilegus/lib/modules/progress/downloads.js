import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/source.js';
import {slugOf} from '../../kit/registry.js';
import {nextRate, ownerOf, partialOf, renameOf, ringFor, watchedFolders} from './adapter.js';
import {downloadHistory} from './history.js';

const FOLDERS_KEY = 'progress-folders';
const SIZE = Gio.FILE_ATTRIBUTE_STANDARD_SIZE;

/**
 * Browser downloads (SPEC §6c, FEATURES M3 "downloads"). On GNOME neither Chrome (it loads
 * libunity only on Unity/KDE) nor Firefox sends LauncherEntry, so the files are the only
 * sign: each browser writes `name.crdownload` / `name.part` while it downloads and renames
 * it at the end. One non-recursive Gio.FileMonitor per watched folder — the user's
 * Downloads (XDG) and up to 10 from `progress-folders` — with WATCH_MOVES, so the final
 * rename is one `renamed` event (gio/glocalfilemonitor.c).
 *
 *   a partial file created or written   a Running pill: name, size so far, speed
 *   renamed to a partial name           the same download (Chrome's "Unconfirmed …")
 *   renamed to a finished name          "name → folder" for a moment, a Downloaded row
 *   deleted / moved out                 cancelled: it ends, no row
 *
 * The speed comes from the size at each `changed` (GFileMonitor sends them at most about
 * once a second, its rate limit): no timer of Buoy's. A partial file only shows once it
 * is written to, so a leftover from an old, broken download never surfaces. Signals only.
 */
export class DownloadSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._files = new Map();      // current path → entry
        this._fractions = new Map();  // browser slug → its LauncherEntry fraction (ringFor)
        this._monitors = [];
        this._next = 0;
        this._cancel = new Gio.Cancellable();
        this._watch();
        settings?.connectObject(`changed::${FOLDERS_KEY}`, () => this._watch(), this);
    }

    /**
     * An app's LauncherEntry, from the LauncherEntry source: where a browser does send one
     * (Chrome on Unity/KDE) and has one file going, the file's row gets its ring.
     *
     * @param {string} slug  the app
     * @param {?number} fraction  its progress while shown, else null
     */
    setFraction(slug, fraction) {
        if (!this._files)
            return;
        if ((this._fractions.get(slug) ?? null) === fraction)
            return;
        if (fraction === null)
            this._fractions.delete(slug);
        else
            this._fractions.set(slug, fraction);
        for (const entry of this._files.values()) {
            if (entry.owner === slug)
                this._act(entry);
        }
    }

    _watch() {
        this._unwatch();
        const downloads = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
        const extra = this._settings?.settings_schema?.has_key(FOLDERS_KEY)
            ? this._settings.get_strv(FOLDERS_KEY) : [];
        for (const path of watchedFolders(downloads, extra)) {
            const dir = Gio.File.new_for_path(path);
            if (dir.query_file_type(Gio.FileQueryInfoFlags.NONE, null) !== Gio.FileType.DIRECTORY)
                continue;
            try {
                const monitor = dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
                monitor.connectObject('changed', (_m, file, other, event) =>
                    this._changed(path, file, other, event), this);
                this._monitors.push(monitor);
            } catch (e) {
                console.warn(`Buoy: cannot watch ${path} for downloads: ${e.message}`);
            }
        }
    }

    _unwatch() {
        for (const monitor of this._monitors) {
            monitor.disconnectObject(this);
            monitor.cancel();
        }
        this._monitors = [];
    }

    _changed(folder, file, other, event) {
        const E = Gio.FileMonitorEvent;
        const path = file.get_path();
        switch (event) {
        case E.CREATED:
        case E.CHANGED:
        case E.CHANGES_DONE_HINT:
        case E.MOVED_IN:
            if (partialOf(file.get_basename()))
                this._sample(this._files.get(path) ?? this._track(folder, file));
            break;
        case E.RENAMED:
            this._renamed(folder, file, other);
            break;
        case E.MOVED_OUT:
        case E.DELETED:
            this._stop(this._files.get(path));
            break;
        }
    }

    _renamed(folder, file, other) {
        const what = renameOf(file.get_basename(), other?.get_basename() ?? null);
        let entry = this._files.get(file.get_path());
        if (what === 'gone') {
            this._stop(entry);
        } else if (what === 'renamed') {
            entry ??= this._track(folder, file);
            this._files.delete(entry.path);
            Object.assign(entry, {path: other.get_path(), file: other, name: nameOf(partialOf(other.get_basename()))});
            this._files.set(entry.path, entry);
            this._sample(entry);
        } else if (what === 'done') {
            // finished before it was ever written to while watched: still a download
            entry ??= this._track(folder, file);
            this._done(entry, other);
        }
    }

    // A new download: its browser is the running one that writes such files.
    _track(folder, file) {
        const partial = partialOf(file.get_basename());
        const running = Shell.AppSystem.get_default().get_running();
        const owner = ownerOf(partial.suffix, running.map(a => slugOf(a.get_id())));
        const entry = {
            id: `download-${++this._next}`, path: file.get_path(), file, name: nameOf(partial), folder,
            owner, app: owner ? running.find(a => slugOf(a.get_id()) === owner) : null,
            rate: null, activity: null,
        };
        this._files.set(entry.path, entry);
        return entry;
    }

    // The size now, off the main loop's back (a watched folder may be on a slow disk).
    _sample(entry) {
        entry.file.query_info_async(SIZE, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT, this._cancel, (file, res) => {
                let info;
                try {
                    info = file.query_info_finish(res);
                } catch {
                    return;               // renamed or deleted since: its event follows
                }
                if (this._files?.get(file.get_path()) !== entry)
                    return;
                entry.rate = nextRate(entry.rate, info.get_size(), GLib.get_monotonic_time());
                this._act(entry);
            });
    }

    _act(entry, done = null) {
        if (!this._stack)
            return;
        const running = [...this._files.values()];
        const ev = {
            id: entry.id, file: true, name: entry.name, folder: folderName(entry.folder),
            app: entry.app?.get_name() ?? null, appIcon: entry.app?.get_icon() ?? null,
            size: entry.rate?.size ?? 0, speed: entry.rate?.speed ?? null,
            fraction: ringFor(running, entry.owner, this._fractions.get(entry.owner) ?? null),
            phase: done ? 'done' : 'running', focus: focusOf(entry.app),
            ...done ?? {},
        };
        const a = this._registry?.build('progress', entry.app?.get_id() ?? 'downloads', ev);
        if (!a) {
            this._end(entry);
            return;
        }
        if (entry.activity && this._stack.update(entry.activity, a))
            return;
        entry.activity = this._stack.surface(a);
    }

    _done(entry, final) {
        this._files.delete(entry.path);
        const path = final.get_path();
        const name = final.get_basename();
        const [type] = Gio.content_type_guess(name, null);
        const icon = Gio.content_type_get_symbolic_icon(type);
        // opened or shown from its row — the row itself or its buttons — the download is
        // seen: the row leaves, as a clicked notification does (2026-11-06, Ethan). The
        // pill's click opens the Transfers tab (tabs.js pressTarget), not the file.
        const open = () => {
            downloadHistory.remove(path);
            openFile(final);
        };
        const show = () => {
            downloadHistory.remove(path);
            showInFiles(final);
        };
        downloadHistory.add({
            key: path, path, name, icon, at: Date.now(), open, show,
            folder: folderName(entry.folder), app: entry.app?.get_name() ?? null,
        });
        this._act({...entry, name}, {icon, open});
        // the pill's ttl ends it; the entry is gone from _files already
    }

    // Cancelled, deleted or moved away: it ends without a Downloaded row.
    _stop(entry) {
        if (!entry)
            return;
        this._files.delete(entry.path);
        this._end(entry);
    }

    _end(entry) {
        if (entry.activity && this._stack?.has(entry.activity))
            this._stack.end(entry.activity);
        entry.activity = null;
    }

    disable() {
        this._settings?.disconnectObject(this);
        this._cancel?.cancel();
        this._cancel = null;
        this._unwatch();
        for (const entry of this._files?.values() ?? [])
            this._end(entry);
        this._files = null;
        this._fractions = null;
        downloadHistory.clear();
        super.disable();
    }
}

// null while Chrome's placeholder stands in for the name (the adapter shows the browser)
function nameOf(partial) {
    return partial.unnamed ? null : partial.final;
}

function folderName(path) {
    return GLib.filename_display_basename(path);
}

function focusOf(app) {
    return app ? () => {
        Main.overview.hide();
        app.activate();
    } : null;
}

// The file in its default app, as Files would open it.
function openFile(file) {
    Main.overview.hide();
    try {
        Gio.AppInfo.launch_default_for_uri(file.get_uri(), global.create_app_launch_context(0, -1));
    } catch (e) {
        Main.notifyError(`Cannot open “${file.get_basename()}”`, e.message);
    }
}

// The file selected in its folder: the file manager's FileManager1 ShowItems (Files
// implements it; so do Nemo, Dolphin and others).
function showInFiles(file) {
    Main.overview.hide();
    Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
        'org.freedesktop.FileManager1', 'ShowItems', new GLib.Variant('(ass)', [[file.get_uri()], '']),
        null, Gio.DBusCallFlags.NONE, -1, null, (bus, res) => {
            try {
                bus.call_finish(res);
            } catch (e) {
                Main.notifyError(`Cannot show “${file.get_basename()}”`, e.message);
            }
        });
}
