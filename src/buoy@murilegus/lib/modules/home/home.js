import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {batteryTile} from './adapter.js';

const POWER_PANEL = 'gnome-power-panel.desktop';

/**
 * Home's battery glance (design/home; Ethan, 2026-11-12: "Lấy pin của GNOME"): the battery
 * GNOME's Quick Settings already reads — the power toggle's UPower DisplayDevice proxy
 * (ui/status/system.js PowerToggle `_proxy`, reached through the panel's system indicator)
 * — no proxy of Buoy's own. Its `g-properties-changed` is watched only while Home is open
 * (the glance lives as long as the open). No battery (a desktop), or Shell's toggle not
 * found → not ready, and Home has no tile for it. A click opens Settings → Power.
 */
export class BatteryGlance {
    /**
     * @param {object} [kit]
     * @param {function():void} [kit.close]  close the island
     * @param {function():void} [kit.changed]  the tile changed: Home lays out again
     */
    constructor({close = null, changed = null} = {}) {
        this._close = close;
        this._changed = changed;
        // Shell internals: QuickSettings._system (panel.js), Indicator._systemItem (status/system.js)
        this._proxy = Main.panel.statusArea.quickSettings?._system?._systemItem?.powerToggle?._proxy ?? null;
        this._tile = this._read();
        this._proxy?.connectObject('g-properties-changed', () => {
            const before = JSON.stringify(this._tile);
            this._tile = this._read();
            if (before !== JSON.stringify(this._tile))
                this._changed?.();
        }, this);
    }

    _read() {
        const p = this._proxy;
        return p ? batteryTile({present: p.IsPresent, percentage: p.Percentage, state: p.State}) : null;
    }

    /** @returns {boolean} a battery to show */
    get ready() {
        return this._tile !== null;
    }

    /** @returns {?object} the tile (kit/ui/home.js) */
    get tile() {
        return this._tile;
    }

    activate() {
        const app = Shell.AppSystem.get_default().lookup_app(POWER_PANEL);
        if (!app)
            return;
        app.activate();
        this._close?.();
    }

    destroy() {
        this._proxy?.disconnectObject(this);
        this._proxy = null;
        this._changed = null;
    }
}
