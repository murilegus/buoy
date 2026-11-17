import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/services/source.js';
import {bluetoothOn, readBluetooth, stopWaitingBluetooth, whenBluetooth} from '../../kit/services/bluetooth.js';
import {connectedOf, diffConnected} from '../../kit/model/bluetooth.js';

const KEY = 'device';

/**
 * Bluetooth devices connecting and going (FEATURES M4 "Bluetooth device", adapter.js), from Quick
 * Settings' own client (kit/services/bluetooth.js), signals only:
 *
 * - `devices-changed` (BtClient: a device added, removed, connected…): the connected ones read
 *   again; one that came flashes, one that went flashes "Disconnected …".
 * - Nothing on the first reading (Buoy turned on), nor while the adapter is off or switching
 *   (the HUD says "Bluetooth off"; getDevices() is empty then): the next reading starts again.
 * - The battery comes a moment after the connection (BlueZ's Battery1, then UPower): each
 *   connected device's battery is watched, and the flash still up takes it without restarting.
 *
 * Bluetooth headphones are said here, with their battery; the plugged module stays quiet for
 * them while this one runs (its _bluetoothSays).
 */
export class BluetoothSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._client = null;
        this._known = null;         // connected devices last read, by path (null: none yet)
        this._watched = new Map();  // path → GnomeBluetooth.Device whose battery is watched
        this._shown = null;         // the device the flash is about, while it connects
        whenBluetooth(this, client => this._attach(client));
    }

    disable() {
        stopWaitingBluetooth(this);
        this._client?.disconnectObject(this);
        for (const d of this._watched.values())
            d.disconnectObject(this);
        this._watched.clear();
        this._stack?.end(this._id());
        this._client = this._known = this._shown = null;
        super.disable();
    }

    _attach(client) {
        if (!this._stack)
            return;
        this._client = client;
        client.connectObject(
            'devices-changed', () => this._sync(),
            'notify::active', () => this._sync(),
            'notify::adapter-state', () => this._sync(),
            this);
        this._sync();
    }

    _sync() {
        if (!this._stack || !this._client)
            return;
        const list = readBluetooth(this._client);
        this._watch(list);
        if (!bluetoothOn(this._client)) {
            this._known = null;     // off or switching: the devices go quietly
            return;
        }
        const cur = connectedOf(list);
        const {connected, disconnected} = diffConnected(this._known, cur);
        this._known = cur;
        const d = connected.at(-1);
        if (d) {
            this._shown = d.id;
            this._show({what: 'connected', name: d.name, kind: d.kind, battery: d.battery}, true);
        } else if (disconnected.length) {
            const g = disconnected.at(-1);
            this._shown = null;
            this._show({what: 'disconnected', name: g.name, kind: g.kind}, true);
        }
    }

    // each connected device's battery: the flash still up for it takes the new figure
    _watch(list) {
        const now = new Map(list.filter(x => x.connected).map(x => [x.id, x.device]));
        for (const [path, dev] of this._watched) {
            if (now.get(path) !== dev) {
                dev.disconnectObject(this);
                this._watched.delete(path);
            }
        }
        for (const [path, dev] of now) {
            if (this._watched.has(path))
                continue;
            this._watched.set(path, dev);
            const again = () => this._battery(path);
            dev.connectObject('notify::battery-type', again, 'notify::battery-percentage', again,
                'notify::battery-level', again, this);
        }
    }

    _battery(path) {
        if (path !== this._shown || !this._stack?.has(this._id()))
            return;
        const d = readBluetooth(this._client).find(x => x.id === path && x.connected);
        if (d)
            this._show({what: 'connected', name: d.name, kind: d.kind, battery: d.battery}, false);
    }

    _id() {
        return `bluetooth:system:${KEY}`;
    }

    // one pill: a new device replaces the last and starts its 3 s again; a battery arriving
    // updates it in place (no `ttl` in the patch: kit/model/stack.js keeps the time it has)
    _show(ev, fresh) {
        const a = this._registry?.build('bluetooth', 'system', {id: KEY, open: openPanel, ...ev});
        if (!a)
            return;
        if (!fresh && this._stack.has(a.id)) {
            const {ttl: unusedTtl, ...patch} = a;
            if (this._stack.update(a.id, patch))
                return;
        }
        this._stack.surface(a);
    }
}

// Settings → Bluetooth, as Shell opens its panels (Shell.AppSystem lookup_app)
function openPanel(desktopId) {
    const app = Shell.AppSystem.get_default().lookup_app(desktopId);
    if (!app)
        return;
    Main.overview.hide();
    app.activate();
}
