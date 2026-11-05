import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/source.js';
import {slugOf} from '../../kit/registry.js';
import {appIdOf, applyUpdate, transition} from './adapter.js';
import {doneHistory} from './history.js';

const IFACE = 'com.canonical.Unity.LauncherEntry';
const UNITY = 'com.canonical.Unity';

/**
 * Unity's LauncherEntry on the session bus (SPEC §6c): apps broadcast
 * `com.canonical.Unity.LauncherEntry.Update(app_uri, properties)` — Files on Ubuntu
 * through its libunity patch, Chrome — with progress 0–1, progress-visible, count,
 * count-visible, urgent. Subscribed as Ubuntu Dock does (ubuntu-dock launcherAPI.js
 * LauncherEntryRemoteModel).
 *
 * libunity only sends while some launcher owns `com.canonical.Unity` on the bus: with
 * nobody there Files says nothing, and if the owner leaves mid-copy it stops reporting —
 * the pill stuck where it was (seen in headless Shell, 2026-11-05). So Buoy asks for the
 * name too, as Ubuntu Dock does, but yielding: ALLOW_REPLACEMENT and queued. With the
 * dock running the dock keeps it (it asks with REPLACE); without it, or when it goes,
 * Buoy holds it and the signals keep coming.
 * One state per app; transition() turns each update into start / update / done / stop.
 * A sender leaving the bus (NameOwnerChanged) stops its apps. Signals only.
 */
export class LauncherEntrySource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._apps = new Map();     // appId → {state, sender, id (stack)}
        const bus = Gio.DBus.session;
        this._unityId = Gio.bus_own_name_on_connection(bus, UNITY, Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT,
            null, null);
        this._updateId = bus.signal_subscribe(null, IFACE, 'Update', null, null,
            Gio.DBusSignalFlags.NONE, (_c, sender, _p, _i, _s, params) => {
                const [uri, props] = params.deepUnpack();
                this._update(sender, appIdOf(uri), unpack(props));
            });
        this._ownerId = bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus',
            'NameOwnerChanged', '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (_c, _s, _p, _i, _n, params) => {
                const [name, , owner] = params.deepUnpack();
                if (!owner)
                    this._gone(name);
            });
    }

    _update(sender, appId, props) {
        if (!sender || !appId || !this._stack)
            return;
        const entry = this._apps.get(appId);
        const state = applyUpdate(entry?.state, props);
        const what = transition(entry?.state, state);
        this._apps.set(appId, {...entry, state, sender});
        this._act(appId, what);
    }

    // The sender left the bus (the app quit or crashed): its progress stops.
    _gone(sender) {
        for (const [appId, entry] of this._apps) {
            if (entry.sender !== sender)
                continue;
            this._act(appId, transition(entry.state, null));
            this._apps.delete(appId);
        }
    }

    _act(appId, what) {
        const entry = this._apps.get(appId);
        if (!what || !entry)
            return;
        if (what === 'stop') {
            this._end(entry);
            return;
        }
        const app = Shell.AppSystem.get_default().lookup_app(appId);
        const name = app?.get_name() ?? '';
        const icon = app?.get_icon() ?? null;
        if (what === 'done')
            doneHistory.add({appId, name: name || appId, icon, at: Date.now(), focus: focusOf(app)});
        const a = this._registry?.build('progress', appId, {
            id: appId, slug: slugOf(appId), name, icon,
            progress: entry.state.progress, count: entry.state.count, countVisible: entry.state.countVisible,
            phase: what === 'done' ? 'done' : 'running', focus: focusOf(app),
        });
        if (!a) {
            this._end(entry);
            return;
        }
        if (entry.id && this._stack.update(entry.id, a))
            return;
        entry.id = this._stack.surface(a);
    }

    _end(entry) {
        if (entry.id && this._stack?.has(entry.id))
            this._stack.end(entry.id);
        entry.id = null;
    }

    disable() {
        if (this._unityId)
            Gio.bus_unown_name(this._unityId);
        this._unityId = 0;
        const bus = Gio.DBus.session;
        for (const id of [this._updateId, this._ownerId]) {
            if (id)
                bus.signal_unsubscribe(id);
        }
        this._updateId = this._ownerId = 0;
        for (const entry of this._apps?.values() ?? [])
            this._end(entry);
        this._apps = null;
        doneHistory.clear();
        super.disable();
    }
}

// a{sv} values unpacked one level, as the adapter reads them
function unpack(props) {
    const out = {};
    for (const [k, v] of Object.entries(props ?? {}))
        out[k] = v instanceof GLib.Variant ? v.recursiveUnpack() : v;
    return out;
}

// A click (pill or row) brings the app's window forward, as the dock does.
function focusOf(app) {
    return app ? () => {
        Main.overview.hide();
        app.activate();
    } : null;
}
