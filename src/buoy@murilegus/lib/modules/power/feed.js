import GLib from 'gi://GLib';

import {batteryToggle, profilesOf, profilesToggle, setProfile, stopWaiting, whenQuickSettings} from '../../kit/services/power.js';
import {plugged, timeLine} from '../../kit/model/power.js';
import {readBattery} from './adapter.js';
import {WINDOW_MS} from './idle.js';

/**
 * The battery plan's feed (kit/services/idle.js, idle.js): made while the plan is in use, gone
 * with it. It reads the objects GNOME's Quick Settings already holds, as the power source does
 * (source.js): the power toggle's UPower DisplayDevice (ui/status/system.js PowerToggle
 * `_proxy`) and the power-mode toggle's power-profiles-daemon proxy
 * (ui/status/powerProfiles.js PowerProfilesToggle `_proxy`). No proxy of its own, no polling:
 * every read is on their `g-properties-changed`.
 *
 * A plug in or an unplug starts the plan's minute (idle.js WINDOW_MS): `plugAt`, the first
 * estimate UPower gives after it (10–15 s later, design/compact "Pin và chế độ năng lượng"), and
 * one timer that re-presents when the minute is over, so `auto` lets the pill go. A button of its
 * compact switches the mode as GNOME's menu does, silently (the buttons show it).
 */
export class PowerFeed {
    /** @param {function(): void} onChanged  the state changed: present again */
    constructor(onChanged) {
        this._onChanged = onChanged;
        this._last = null;          // readBattery(), the last reading
        this._plugAt = null;        // ms, the last plug in or unplug
        this._estimate = null;      // the first estimate after it
        this._windowId = 0;
        this.state = null;
        // a first reading made now is the state the kit reads once it holds this feed: telling
        // it now would present before the feed is in its map (kit/services/idle.js _syncFeeds)
        this._made = false;
        whenQuickSettings(this, () => this._watch());
        this._made = true;
    }

    _watch() {
        this._toggle = batteryToggle();
        this._proxy = this._toggle?._proxy ?? null;
        this._toggle?.connectObject('notify::visible', () => this._sync(), this);
        this._proxy?.connectObject('g-properties-changed', () => this._sync(), this);
        // the power-mode toggle shows while the daemon is on the bus (PowerProfilesToggle _sync)
        this._modes = profilesToggle();
        this._modes?.connectObject('notify::visible', () => this._sync(), this);
        this._modes?._proxy?.connectObject('g-properties-changed', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        const p = this._proxy;
        if (!p)
            return;
        const cur = readBattery({
            present: p.IsPresent, state: p.State, percentage: p.Percentage,
            timeToFull: p.TimeToFull, timeToEmpty: p.TimeToEmpty,
        });
        // a plug in or an unplug (not the first reading): the plan's minute starts again
        if (this._last?.present && cur.present && plugged(this._last.state) !== plugged(cur.state)) {
            this._plugAt = Date.now();
            this._estimate = null;
            this._armWindow();
        }
        this._last = cur;
        if (this._plugAt !== null && !this._estimate && timeLine(cur, 'full in'))
            this._estimate = {state: cur.state, timeToFull: cur.timeToFull, timeToEmpty: cur.timeToEmpty};
        this.state = {battery: cur, modes: profilesOf(this._modes), plugAt: this._plugAt, estimate: this._estimate};
        if (this._made)
            this._onChanged();
    }

    // one timer per plug: when the minute is over, present again (relevance drops, the time goes)
    _armWindow() {
        if (this._windowId)
            GLib.source_remove(this._windowId);
        this._windowId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WINDOW_MS, () => {
            this._windowId = 0;
            this._plugAt = null;
            this._estimate = null;
            if (this.state)
                this.state = {...this.state, plugAt: null, estimate: null};
            this._onChanged();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** @param {string} id  a power mode, from the compact's buttons */
    act(id) {
        if (profilesOf(this._modes)?.list.includes(id))
            setProfile(id, {silent: true});
    }

    /** Signals only: nothing to fetch when the pill shows. */
    shown() {}

    destroy() {
        stopWaiting(this);
        if (this._windowId)
            GLib.source_remove(this._windowId);
        this._windowId = 0;
        this._toggle?.disconnectObject(this);
        this._proxy?.disconnectObject(this);
        this._modes?.disconnectObject(this);
        this._modes?._proxy?.disconnectObject(this);
        this._toggle = this._proxy = this._modes = null;
        this._onChanged = () => {};
        this.state = null;
    }
}
