import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {GSCONNECT_APP, GSCONNECT_SETTINGS, GSCONNECT_UUID, batteryState, callOf, phoneNote, replyOf} from '../model/phone.js';

/**
 * The phone through GSConnect (FEATURES M4 "Phone via GSConnect"): GSConnect runs its own
 * service on the session bus, and its Shell side reads it the same way (src/utils/remote.js) —
 * an ObjectManager listing each device (org.gnome.Shell.Extensions.GSConnect.Device: Name,
 * Connected, Paired) and each device's GActions over D-Bus: `battery`'s state (bsii: charging,
 * icon, level, time; src/service/plugins/battery.js), `ring` (findmyphone.js). Buoy reads
 * them while something needs them (the Device tab while it lives, the notification module),
 * signals only; the service may come and go (GSConnect turned off, on).
 */

const BUS = 'org.gnome.Shell.Extensions.GSConnect';
const PATH = '/org/gnome/Shell/Extensions/GSConnect';
const DEVICE = 'org.gnome.Shell.Extensions.GSConnect.Device';

const ManagerProxy = Gio.DBusProxy.makeProxyWrapper(`<node>
<interface name="org.freedesktop.DBus.ObjectManager">
  <method name="GetManagedObjects"><arg type="a{oa{sa{sv}}}" direction="out"/></method>
  <signal name="InterfacesAdded"><arg type="o"/><arg type="a{sa{sv}}"/></signal>
  <signal name="InterfacesRemoved"><arg type="o"/><arg type="as"/></signal>
</interface>
</node>`);
const DeviceProxy = Gio.DBusProxy.makeProxyWrapper(`<node>
<interface name="${DEVICE}">
  <property type="b" name="Connected" access="read"/>
  <property type="s" name="Id" access="read"/>
  <property type="s" name="Name" access="read"/>
  <property type="b" name="Paired" access="read"/>
</interface>
</node>`);

/** @returns {{installed: boolean, state: ?number}} GSConnect's extension, as Shell knows it */
export function gsconnectExtension() {
    const ext = Main.extensionManager.lookup(GSCONNECT_UUID);
    return {installed: !!ext, state: ext?.state ?? null};
}

/** GSConnect's own settings, where a phone is paired: its app, else its extension prefs. */
export function openGsconnect() {
    const app = Shell.AppSystem.get_default().lookup_app(GSCONNECT_SETTINGS);
    if (app) {
        Main.overview.hide();
        app.activate();
        return;
    }
    try {
        Main.extensionManager.openExtensionPrefs(GSCONNECT_UUID, '', {});
    } catch (e) {
        console.debug(`Buoy: GSConnect prefs: ${e.message}`);
    }
}

/**
 * @param {?MessageTray.Source} src
 * @returns {boolean} GSConnect's own source: the phone's notifications (its app's policy id)
 */
export function isGsconnectSource(src) {
    return src?.policy instanceof MessageTray.NotificationApplicationPolicy && src.policy.id === GSCONNECT_APP;
}

/**
 * The phone's notifications in GNOME's list, as the Phone tab reads them: each under its phone
 * app (model/phone.js phoneNote), a call by its id (callOf), one that can be answered (replyOf).
 *
 * @returns {Array<{n: MessageTray.Notification, id: string, app: string, title: string, body: string, at: number, call: ?object, reply: ?object, gicon: ?Gio.Icon}>}
 */
export function phoneNotes() {
    const out = [];
    for (const src of Main.messageTray.getSources().filter(isGsconnectSource)) {
        for (const n of src.notifications) {
            // a GTK notification's id (GtkNotificationDaemonNotification), not in Notification's type
            const gtkId = /** @type {any} */ (n).id;
            const id = typeof gtkId === 'string' ? gtkId : '';
            const call = callOf(id);
            const themed = n.gicon instanceof Gio.ThemedIcon ? n.gicon.get_names()[0] ?? null : null;
            const p = call ? {app: 'Phone', title: call.caller, body: n.body ?? ''} : phoneNote(n.title ?? '', n.body ?? '', themed);
            const at = n.datetime ? n.datetime.to_unix_usec() / 1000 : 0;
            out.push({n, id: id || `${src.title}:${at}`, ...p, at, call, reply: replyOf(id), gicon: n.gicon ?? null});
        }
    }
    return out;
}

export class Phones {
    /** @param {?function():void} changed  a phone came, went, connected or its battery moved */
    constructor(changed) {
        this._changed = changed;
        this._alive = true;
        this._devices = new Map();      // object path → {proxy, actions, id}
        this._cancel = null;
        this._watch = Gio.bus_watch_name(Gio.BusType.SESSION, BUS, Gio.BusNameWatcherFlags.NONE,
            () => this._appeared(), () => this._vanished());
    }

    _appeared() {
        this._cancel?.cancel();
        this._cancel = new Gio.Cancellable();
        const cancel = this._cancel;
        // @ts-expect-error -- a makeProxyWrapper() wrapper is called with new, as in Shell's mpris.js; @girs types a plain function
        new ManagerProxy(Gio.DBus.session, BUS, PATH, (manager, error) => {
            if (error || cancel.is_cancelled() || !this._alive)
                return;
            this._manager = manager;
            this._signals = [
                manager.connectSignal('InterfacesAdded', (_p, _s, [path, ifaces]) => {
                    if (DEVICE in ifaces)
                        this._add(path);
                }),
                manager.connectSignal('InterfacesRemoved', (_p, _s, [path, ifaces]) => {
                    if (ifaces.includes(DEVICE))
                        this._remove(path);
                }),
            ];
            manager.GetManagedObjectsRemote(([objects], e) => {
                if (e || cancel.is_cancelled())
                    return;
                for (const [path, ifaces] of Object.entries(objects)) {
                    if (DEVICE in ifaces)
                        this._add(path);
                }
            }, cancel);
        }, cancel);
    }

    _vanished() {
        this._cancel?.cancel();
        this._cancel = null;
        this._unwatchManager();
        for (const path of [...this._devices.keys()])
            this._remove(path, false);
        this._changed?.();
    }

    _unwatchManager() {
        for (const id of this._signals ?? [])
            this._manager?.disconnectSignal(id);
        this._signals = null;
        this._manager = null;
    }

    _add(path) {
        if (this._devices.has(path))
            return;
        const entry = {proxy: null, actions: null};
        this._devices.set(path, entry);
        const again = () => this._changed?.();
        // the device's actions: `battery` (its state), `ring`; list_actions() starts the fetch
        entry.actions = Gio.DBusActionGroup.get(Gio.DBus.session, BUS, path);
        entry.actions.connectObject('action-added', again, 'action-removed', again, 'action-state-changed', again, this);
        entry.actions.list_actions();
        // @ts-expect-error -- as ManagerProxy above
        new DeviceProxy(Gio.DBus.session, BUS, path, (proxy, error) => {
            if (error || this._devices.get(path) !== entry)
                return;
            entry.proxy = proxy;
            proxy.connectObject('g-properties-changed', again, this);
            again();
        }, this._cancel);
    }

    _remove(path, notify = true) {
        const entry = this._devices.get(path);
        if (!entry)
            return;
        entry.proxy?.disconnectObject(this);
        entry.actions?.disconnectObject(this);
        this._devices.delete(path);
        if (notify)
            this._changed?.();
    }

    /**
     * @returns {Array<{id: string, name: string, connected: boolean, paired: boolean, battery: ?{percentage: number, charging: boolean}}>}
     */
    list() {
        const out = [];
        for (const {proxy, actions} of this._devices.values()) {
            if (!proxy)
                continue;
            let battery = null;
            try {
                if (actions?.has_action('battery'))
                    battery = batteryState(actions.get_action_state('battery')?.deepUnpack() ?? null);
            } catch {
                battery = null;
            }
            out.push({id: proxy.Id ?? '', name: proxy.Name ?? '', connected: proxy.Connected === true, paired: proxy.Paired === true, battery});
        }
        return out;
    }

    /** @param {string} id  a phone's Id: it rings, even silenced (GSConnect's findmyphone `ring`) */
    ring(id) {
        for (const {proxy, actions} of this._devices.values()) {
            if (proxy?.Id === id && actions?.has_action('ring')) {
                actions.activate_action('ring', null);
                return;
            }
        }
    }

    /** @param {string} device  a phone's Id  @returns {boolean} its ringing can be silenced */
    canMute(device) {
        return [...this._devices.values()].some(({proxy, actions}) =>
            proxy?.Id === device && proxy.Connected && actions?.has_action('muteCall'));
    }

    /**
     * Silence the phone's ringing, as GSConnect's Mute does (plugins/telephony.js muteCall:
     * `kdeconnect.telephony.request_mute`), through the device's action, not the notification's
     * button: Shell destroys a notification once one of its buttons ran (ui/messageTray.js
     * addAction), and the call is still there.
     *
     * @param {string} device  a phone's Id
     * @returns {boolean} asked
     */
    muteCall(device) {
        for (const {proxy, actions} of this._devices.values()) {
            if (proxy?.Id === device && actions?.has_action('muteCall')) {
                actions.activate_action('muteCall', null);
                return true;
            }
        }
        return false;
    }

    /**
     * Answer a phone notification with text, as GSConnect's own reply dialog does
     * (plugins/notification.js replyNotification: a `kdeconnect.notification.reply` packet with
     * the notification's reply id), without the dialog.
     *
     * @param {string} device  the phone's Id (the notification id's first part, model/phone.js replyOf)
     * @param {string} uuid  its reply id
     * @param {string} text
     * @returns {boolean} handed to GSConnect (the phone not there, no reply action: false)
     */
    reply(device, uuid, text) {
        for (const {proxy, actions} of this._devices.values()) {
            if (proxy?.Id !== device || !proxy.Connected || !actions?.has_action('replyNotification'))
                continue;
            try {
                actions.activate_action('replyNotification', new GLib.Variant('(ssa{ss})', [uuid, text, {}]));
                return true;
            } catch (e) {
                console.debug(`Buoy: GSConnect reply: ${e.message}`);
                return false;
            }
        }
        return false;
    }

    destroy() {
        this._alive = false;
        this._changed = null;
        Gio.bus_unwatch_name(this._watch);
        this._cancel?.cancel();
        this._unwatchManager();
        for (const path of [...this._devices.keys()])
            this._remove(path, false);
    }
}
