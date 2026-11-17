import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {bluetoothBattery, btKind} from '../model/bluetooth.js';

/**
 * GNOME's Bluetooth client, reached through Quick Settings (FEATURES M4 "Bluetooth device"): Buoy
 * makes no client of its own. Quick Settings' Bluetooth indicator holds a BtClient
 * (ui/status/bluetooth.js) over a GnomeBluetooth.Client: `devices-changed` (a device added,
 * removed, paired, connected…), `getDevices()` (paired or trusted, none while the adapter is off),
 * `toggleDevice()` (connect / disconnect, as its menu). Each GnomeBluetooth.Device carries the
 * battery gnome-bluetooth reads from UPower (`battery-type`, `-percentage`, `-level`).
 * No gi://GnomeBluetooth import: Shell loads it only where it is installed (ui/panel.js
 * QuickSettings._setupIndicators); without it there is no client and nothing to show.
 */

// Shell internals: QuickSettings._bluetooth (panel.js), Indicator._client (status/bluetooth.js)
const qs = () => Main.panel.statusArea.quickSettings ?? null;

// GnomeBluetooth.AdapterState.ON (bluetooth-enums.h)
const ADAPTER_ON = 1;

/** @returns {?object} Quick Settings' BtClient */
export function btClient() {
    return /** @type {any} */ (qs()?._bluetooth)?._client ?? null;
}

/**
 * Call `then(client)` once Quick Settings has its Bluetooth indicator: now, or when it adds it
 * (its indicators are built asynchronously, ui/panel.js QuickSettings._setupIndicators).
 *
 * @param {object} owner  the signal's owner (stopWaitingBluetooth(owner))
 * @param {function(object):void} then
 */
export function whenBluetooth(owner, then) {
    const now = btClient();
    if (now) {
        then(now);
        return;
    }
    const box = qs()?._indicators ?? null;
    box?.connectObject('child-added', () => {
        const c = btClient();
        if (!c)
            return;
        box.disconnectObject(owner);
        then(c);
    }, owner);
}

/** @param {object} owner  as given to whenBluetooth */
export function stopWaitingBluetooth(owner) {
    qs()?._indicators?.disconnectObject(owner);
}

/**
 * @param {?object} client  btClient()
 * @returns {boolean} the adapter is on and settled (not turning on or off): devices coming and
 *   going now are news, not the adapter's own switch
 */
export function bluetoothOn(client) {
    return client?.active === true && client.adapter_state === ADAPTER_ON;
}

/**
 * @param {?object} client  btClient()
 * @returns {Array<{id: string, name: string, kind: string, address: ?string, connected: boolean, battery: ?object, bluetooth: boolean, device: object}>}
 *   the devices Quick Settings lists (paired or trusted), model/bluetooth.js's shape
 */
export function readBluetooth(client) {
    if (!client)
        return [];
    const out = [];
    for (const d of client.getDevices()) {
        const kind = btKind(d.type);
        out.push({
            id: d.get_object_path(), name: d.alias || d.name || '', kind, address: d.address ?? null,
            connected: d.connected === true, battery: bluetoothBattery(d.battery_type, d.battery_percentage, d.battery_level),
            bluetooth: true, device: d,
        });
    }
    return out;
}

/**
 * Disconnect a device, as Quick Settings' list does (BtClient.toggleDevice → connect_service).
 *
 * @param {?object} client
 * @param {string} id  its object path
 */
export function disconnectDevice(client, id) {
    const d = readBluetooth(client).find(x => x.id === id && x.connected);
    if (d)
        client.toggleDevice(d.device);      // async; it logs its own failure
}
