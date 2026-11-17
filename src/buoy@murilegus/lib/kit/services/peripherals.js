/** @import GLib from 'gi://GLib' */
import Gio from 'gi://Gio';

import {LEVEL, upKind} from '../model/bluetooth.js';

/**
 * UPower's peripherals with a battery (FEATURES M4 "Bluetooth device", design/device "Không
 * dây"): a 2.4 GHz mouse or keyboard reports it through its receiver (Logitech Unifying / Bolt,
 * the kernel's hidpp_battery); a Bluetooth one, through BlueZ. Shell holds UPower's display
 * device only (ui/status/system.js), so these are proxies of Buoy's — made while the Device tab
 * lives, signals only.
 *
 * Plain D-Bus proxies, as Shell's own (status/system.js makeProxyWrapper), all async: libupower-glib
 * enumerates and makes each device synchronously, and its get_devices2() hands GJS devices already
 * finalized (UPower 1.91, 2026-11-17).
 */

const BUS = 'org.freedesktop.UPower';
const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(`<node>
<interface name="org.freedesktop.UPower">
  <method name="EnumerateDevices"><arg name="devices" direction="out" type="ao"/></method>
  <signal name="DeviceAdded"><arg name="device" type="o"/></signal>
  <signal name="DeviceRemoved"><arg name="device" type="o"/></signal>
</interface>
</node>`);
// the device's properties Buoy reads (upower src/org.freedesktop.UPower.Device.xml)
const DeviceProxy = Gio.DBusProxy.makeProxyWrapper(`<node>
<interface name="org.freedesktop.UPower.Device">
  <property name="NativePath" type="s" access="read"/>
  <property name="Vendor" type="s" access="read"/>
  <property name="Model" type="s" access="read"/>
  <property name="Serial" type="s" access="read"/>
  <property name="Type" type="u" access="read"/>
  <property name="PowerSupply" type="b" access="read"/>
  <property name="IsPresent" type="b" access="read"/>
  <property name="Percentage" type="d" access="read"/>
  <property name="BatteryLevel" type="u" access="read"/>
</interface>
</node>`);

export class Peripherals {
    /** @param {function():void} changed  a device came, went or its battery moved */
    constructor(changed) {
        this._changed = changed;
        this._cancel = new Gio.Cancellable();
        this._devices = new Map();      // object path → its proxy (null while it is made)
        this._signals = [];
        // @ts-expect-error -- a makeProxyWrapper() wrapper is called with new, as in Shell's system.js; @girs types a plain function
        this._up = new UPowerProxy(Gio.DBus.system, BUS, '/org/freedesktop/UPower', (p, /** @type {?GLib.Error} */ error) => {
            if (error || !this._changed) {
                if (error && !error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.debug(`Buoy: UPower: ${error.message}`);
                return;
            }
            this._signals = [
                p.connectSignal('DeviceAdded', (_p, _s, [path]) => this._add(path)),
                p.connectSignal('DeviceRemoved', (_p, _s, [path]) => this._remove(path)),
            ];
            p.EnumerateDevicesRemote(([paths], e) => {
                if (e || !this._changed)
                    return;
                for (const path of paths)
                    this._add(path);
            }, this._cancel);
        }, this._cancel);
    }

    _add(path) {
        if (this._devices.has(path))
            return;
        this._devices.set(path, null);
        // @ts-expect-error -- as UPowerProxy above
        new DeviceProxy(Gio.DBus.system, BUS, path, (p, error) => {
            if (error || !this._changed || !this._devices.has(path))
                return;
            this._devices.set(path, p);
            p.connectObject('g-properties-changed', () => this._changed?.(), this);
            if (upKind(p.Type) && !p.PowerSupply)
                this._changed();
        }, this._cancel);
    }

    _remove(path) {
        if (!this._devices.has(path))
            return;
        const p = this._devices.get(path);
        p?.disconnectObject(this);
        this._devices.delete(path);
        if (p && upKind(p.Type) && !p.PowerSupply)
            this._changed?.();
    }

    /**
     * @returns {Array<{id: string, name: string, kind: string, nativePath: ?string, serial: ?string, battery: ?object, bluetooth: boolean}>}
     *   the peripherals present, model/bluetooth.js's shape (not the computer's battery, a charger, a UPS)
     */
    list() {
        const out = [];
        for (const [path, p] of this._devices) {
            const kind = p ? upKind(p.Type) : null;
            if (!kind || p.PowerSupply || !p.IsPresent)
                continue;
            const coarse = p.BatteryLevel > LEVEL.NONE;
            out.push({
                id: path, name: p.Model || p.Vendor || '', kind, nativePath: p.NativePath || null, serial: p.Serial || null,
                battery: coarse ? {level: p.BatteryLevel} : {percentage: p.Percentage}, bluetooth: false,
            });
        }
        return out;
    }

    destroy() {
        this._changed = null;
        this._cancel.cancel();
        for (const id of this._signals)
            this._up?.disconnectSignal(id);
        this._signals = [];
        for (const p of this._devices.values())
            p?.disconnectObject(this);
        this._devices.clear();
        this._up = null;
    }
}
