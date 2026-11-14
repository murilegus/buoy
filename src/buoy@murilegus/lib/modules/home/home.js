import Shell from 'gi://Shell';

import {batteryToggle, profilesOf, profilesToggle, setProfile} from '../../kit/services/power.js';
import {batteryPage, batteryTile} from './adapter.js';

const POWER_PANEL = 'gnome-power-panel.desktop';

/**
 * Home's battery glance (design/home; Ethan, 2026-11-12: "Lấy pin của GNOME"; the power
 * modes 2026-11-14): the battery GNOME's Quick Settings already reads — the power toggle's
 * UPower DisplayDevice proxy (ui/status/system.js PowerToggle `_proxy`) — and its power-mode
 * toggle (ui/status/powerProfiles.js PowerProfilesToggle `_proxy`), through
 * kit/services/power.js: no proxy of Buoy's own. Both are watched only while Home is open
 * (the glance lives as long as the open). No battery (a desktop), or Shell's toggle not
 * found → not ready, and Home has no tile for it.
 * A click shows the power modes in place of Home's card and row (design/home "Ô pin và chế
 * độ năng lượng"); choosing one switches at once, without the mode's flash (Home is in view),
 * and keeps the page open. Without power modes, a click opens Settings → Power.
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
        this._proxy = batteryToggle()?._proxy ?? null;
        this._modesToggle = profilesToggle();
        this._key = '';
        this._read();
        const sync = () => {
            const before = this._key;
            this._read();
            if (before !== this._key)
                this._changed?.();
        };
        this._proxy?.connectObject('g-properties-changed', sync, this);
        this._modesToggle?.connectObject('notify::visible', sync, this);
        this._modesToggle?._proxy?.connectObject('g-properties-changed', sync, this);
    }

    _read() {
        const p = this._proxy;
        this._battery = p ? {
            present: p.IsPresent, percentage: p.Percentage, state: p.State,
            timeToFull: p.TimeToFull, timeToEmpty: p.TimeToEmpty,
        } : null;
        this._modes = profilesOf(this._modesToggle);
        this._tile = this._battery ? batteryTile(this._battery, this._modes) : null;
        this._key = JSON.stringify([this._tile, this._modes]);
    }

    /** @returns {boolean} a battery to show */
    get ready() {
        return this._tile !== null;
    }

    /** @returns {?object} the tile (kit/ui/home.js) */
    get tile() {
        return this._tile;
    }

    /** @returns {?object} the power modes' page (kit/ui/home.js), null without them */
    page() {
        const page = this._battery ? batteryPage(this._battery, this._modes) : null;
        return page ? {...page, choose: id => setProfile(id, {silent: true})} : null;
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
        this._modesToggle?.disconnectObject(this);
        this._modesToggle?._proxy?.disconnectObject(this);
        this._proxy = this._modesToggle = null;
        this._changed = null;
    }
}
