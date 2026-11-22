import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {Source} from '../../kit/services/source.js';
import {SharingWatch} from '../../kit/services/sharing.js';
import {listNames, readText} from '../../kit/services/files.js';
import {PTYXIS_APPS, RECORD_PREFIX, dirText, matchRecord, parseRecord} from './finished.js';

const KIND = 'terminal';
const KEY = 'ptyxis';

/**
 * A terminal command that finished in a tab you are not in (FEATURES M4 "Terminal command
 * finished in an unfocused tab"; design/compact "Lệnh terminal xong", 2026-11-21, Ethan).
 *
 * Ptyxis says it itself: when a command of 250 ms or more ends and its window is not active, it
 * sends "Command completed" with the command line as body, the tab's uuid as id and
 * `app.focus-tab-by-uuid` as default action; it takes the notification back when the tab gets
 * the focus (ptyxis-tab-notify.h ptyxis_tab_notify_show_notification, ptyxis-tab.c
 * ptyxis_tab_notify_contains_focus_cb). Buoy hears it as it is added to Ptyxis's tray source and
 * marks it read: no banner, no pill of the notification module (ui/messageTray.js
 * Source.addNotification, MessageTray._onNotificationRequestBanner); GNOME's list keeps it.
 *
 * Its exit code, time and directory come from Buoy's shell hook (hooks/shell.sh), written
 * before Ptyxis is told; read then, once, from $XDG_RUNTIME_DIR (finished.js matchRecord). No
 * hook: the command alone.
 *
 * One pill for Ptyxis: the newest, "+N" for the other tabs. It comes as an alert (a card), then
 * stays till Ptyxis takes the notification back, it is dismissed in GNOME's list, or ×. A click
 * or Go to Tab activates the notification: Ptyxis shows the tab. Signals and one read per
 * notification; no timer.
 */
export class TerminalSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._entries = [];             // {n, app, cmd, exit, duration, dir, at, ready}, oldest first
        this._id = null;
        this._cancel = new Gio.Cancellable();
        this._home = GLib.get_home_dir();
        this._sharing = new SharingWatch(() => this._show());
        const tray = Main.messageTray;
        tray.connectObject('source-added', (_t, src) => this._watch(src), this);
        tray.getSources().forEach(src => this._watch(src));
    }

    _watch(src) {
        const policy = src.policy;
        if (!(policy instanceof MessageTray.NotificationApplicationPolicy) || !PTYXIS_APPS.includes(policy.id))
            return;
        const app = Shell.AppSystem.get_default().lookup_app(`${policy.id}.desktop`);
        src.connectObject('notification-added', (_s, n) => this._add(n, app), this);
    }

    _add(n, app) {
        // read now: no banner, and the notification module never takes it (it takes banners)
        n.acknowledged = true;
        const at = Date.now();
        const e = {n, app, cmd: n.body ?? '', exit: null, duration: null, dir: '', at, ready: false};
        n.connectObject('destroy', (_n, reason) => this._gone(e, reason), this);
        this._entries.push(e);
        this._read(n.body, at).then(r => {
            if (!this._entries?.includes(e))
                return;
            if (r) {
                Object.assign(e, {exit: r.exit, duration: r.end - r.start, dir: dirText(r.dir, this._home)});
                if (r.cmd)
                    e.cmd = r.cmd;
            }
            e.ready = true;
            this._show(true);
        });
    }

    // the hook's record of this command, or null (no hook, not found)
    async _read(body, at) {
        const dir = Gio.File.new_for_path(GLib.get_user_runtime_dir());
        const cancel = this._cancel;
        let names;
        try {
            names = (await listNames(dir, cancel)).filter(x => x.startsWith(RECORD_PREFIX));
        } catch {
            return null;
        }
        const texts = await Promise.all(names.map(x => readText(dir.get_child(x), cancel)));
        return matchRecord(texts.map(parseRecord), body, at);
    }

    _gone(e, reason) {
        e.n.disconnectObject(this);
        if (!this._entries)
            return;
        this._entries = this._entries.filter(x => x !== e);
        // Ptyxis sends the tab's next one under the same id: Shell replaces the old in the same
        // call (ui/notificationDaemon.js GtkNotificationDaemonAppSource.addNotification), so the
        // pill stays for it
        if (reason !== MessageTray.NotificationDestroyedReason.REPLACED)
            this._show();
    }

    _show(alert = false) {
        if (!this._stack || !this._entries)
            return;
        const ready = this._entries.filter(e => e.ready);
        if (!ready.length) {
            if (this._id && this._stack.has(this._id))
                this._stack.end(this._id);
            this._id = null;
            this._sharing.stop();
            return;
        }
        this._sharing.start();
        const e = ready.at(-1);
        const a = this._registry?.build(KIND, KEY, {
            id: KEY, cmd: e.cmd, exit: e.exit, duration: e.duration, dir: e.dir,
            appName: e.app?.get_name() ?? 'Ptyxis', appIcon: e.app?.get_icon() ?? null,
            more: ready.length - 1, at: e.at, shared: this._sharing.shared,
            activate: () => e.n.activate(),
            dismiss: () => ready.forEach(x => x.n.destroy(MessageTray.NotificationDestroyedReason.DISMISSED)),
        });
        if (!a)
            return;
        if (this._id && this._stack.has(this._id) && this._stack.update(this._id, a, {alert}))
            return;
        this._id = this._stack.surface({...a, alert});
    }

    disable() {
        this._cancel?.cancel();
        this._cancel = null;
        Main.messageTray.disconnectObject(this);
        for (const src of Main.messageTray.getSources())
            src.disconnectObject(this);
        for (const e of this._entries ?? [])
            e.n.disconnectObject(this);
        this._entries = null;
        if (this._id && this._stack?.has(this._id))
            this._stack.end(this._id);
        this._id = null;
        this._sharing?.stop();
        this._sharing = null;
        super.disable();
    }
}
