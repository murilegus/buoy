import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/services/source.js';
import {SharingWatch} from '../../kit/services/sharing.js';

const KIND = 'attention';

/**
 * A window that asks for attention (FEATURES M4 "Attention on another workspace"; design/compact
 * "Cửa sổ cần chú ý", 2026-11-19, Ethan), from the same signals as Shell's own handler
 * (ui/windowAttentionHandler.js): Mutter's `window-demands-attention` and `window-marked-urgent`,
 * not for a focused window nor one off the taskbar. One pill per app: its newest window asking,
 * "+N" for the others; its workspace's number when it is not the one shown (on this workspace,
 * none). It comes as an alert (a card, as a notification), then stays till the window is
 * focused, stops asking or goes; × lets those windows be till they ask again. Signals only.
 *
 * Shell's handler says the same with its "“…” is ready" notification: while this runs it is
 * disconnected — it was connected bound at construction (`connectObject` with itself as owner),
 * so overriding its method would not reach it — and connected again the same way on disable.
 */
export class AttentionSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._apps = new Map();             // app id → {app, windows (oldest first), id, at}
        this._dismissed = new WeakSet();    // windows whose pill was dismissed while asking
        this._tracker = Shell.WindowTracker.get_default();
        this._sharing = new SharingWatch(() => this._redrawAll());
        this._handler = Main.windowAttentionHandler ?? null;
        if (this._handler)
            global.display.disconnectObject(this._handler);
        global.display.connectObject(
            'window-demands-attention', (_d, w) => this._ask(w),
            'window-marked-urgent', (_d, w) => this._ask(w), this);
        global.workspace_manager.connectObject('active-workspace-changed', () => this._redrawAll(), this);
        // windows asking already (Buoy turned on): their pills, without a card
        for (const actor of global.get_window_actors()) {
            const w = actor.meta_window;
            if (w?.demands_attention || w?.urgent)
                this._ask(w, false);
        }
    }

    _ask(w, alert = true) {
        if (!w || !this._stack || w.has_focus() || w.is_skip_taskbar())
            return;
        const app = this._tracker.get_window_app(w);
        const key = app?.get_id() ?? `window:${w.get_id()}`;
        let e = this._apps.get(key);
        if (!e) {
            e = {key, app, windows: [], id: null, at: Date.now()};
            this._apps.set(key, e);
        }
        if (!e.windows.includes(w)) {
            const again = () => this._show(e);
            w.connectObject(
                'notify::demands-attention', () => this._sync(w),
                'notify::urgent', () => this._sync(w),
                'focus', () => this._drop(w),
                'unmanaged', () => this._drop(w),
                'notify::title', again,
                'workspace-changed', again, this);
        }
        e.windows = [...e.windows.filter(x => x !== w), w];
        e.at = Date.now();
        this._dismissed.delete(w);
        this._show(e, alert);
    }

    // it stopped asking (focused elsewhere, the app said so)
    _sync(w) {
        if (!w.demands_attention && !w.urgent)
            this._drop(w);
    }

    _drop(w) {
        w.disconnectObject(this);
        for (const e of [...this._apps?.values() ?? []]) {
            if (!e.windows.includes(w))
                continue;
            e.windows = e.windows.filter(x => x !== w);
            this._show(e);
        }
    }

    _show(e, alert = false) {
        if (!this._stack || this._apps.get(e.key) !== e)
            return;
        const list = e.windows.filter(w => !this._dismissed.has(w));
        if (!list.length) {
            this._end(e, !e.windows.length);
            return;
        }
        const w = list.at(-1);
        const ws = w.get_workspace();
        const here = !ws || w.is_on_all_workspaces() || ws === global.workspace_manager.get_active_workspace();
        this._syncSharing();
        const a = this._registry?.build(KIND, e.key, {
            id: e.key, appName: e.app?.get_name() ?? w.get_wm_class() ?? '', appIcon: e.app?.get_icon() ?? null,
            title: w.get_title() ?? '', workspace: here ? null : ws.index() + 1, more: list.length - 1, at: e.at,
            shared: this._sharing.shared,
            activate: () => Main.activateWindow(w),
            dismiss: () => {
                list.forEach(x => this._dismissed.add(x));
                this._show(e);
            },
        });
        if (!a)
            return;
        if (e.id && this._stack.has(e.id) && this._stack.update(e.id, a, {alert}))
            return;
        e.id = this._stack.surface({...a, alert});
    }

    // its pill goes; `forget`: no window of it asks any more
    _end(e, forget) {
        if (e.id && this._stack?.has(e.id))
            this._stack.end(e.id);
        e.id = null;
        if (forget)
            this._apps.delete(e.key);
        this._syncSharing();
    }

    // the shared screen is watched while a pill is up (only the app is named then)
    _syncSharing() {
        if ([...this._apps.values()].some(e => e.windows.length))
            this._sharing.start();
        else
            this._sharing.stop();
    }

    _redrawAll() {
        for (const e of this._apps?.values() ?? [])
            this._show(e);
    }

    disable() {
        global.display.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        for (const e of [...this._apps?.values() ?? []]) {
            e.windows.forEach(w => w.disconnectObject(this));
            if (e.id && this._stack?.has(e.id))
                this._stack.end(e.id);
        }
        this._apps = null;
        this._sharing?.stop();
        this._sharing = null;
        // Shell's own "“…” is ready" again, connected as it connects itself (ui/windowAttentionHandler.js)
        const h = this._handler;
        if (h) {
            global.display.connectObject(
                'window-demands-attention', h._onWindowDemandsAttention.bind(h),
                'window-marked-urgent', h._onWindowDemandsAttention.bind(h), h);
        }
        this._handler = null;
        super.disable();
    }
}
