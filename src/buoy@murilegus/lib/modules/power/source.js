import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/services/source.js';
import {batteryToggle, profilesOf, profilesToggle, setProfile, stopWaiting, takeSilent, whenQuickSettings} from '../../kit/services/power.js';
import {STATE, powerEvents, readBattery} from './adapter.js';

const FLASH = 'flash';
const LOW = 'low';
const MODE = 'mode';

/**
 * The laptop's battery (FEATURES M4 "Power", adapter.js), read from the proxy GNOME's
 * Quick Settings already holds — the power toggle's UPower DisplayDevice
 * (ui/status/system.js PowerToggle `_proxy`), as Home's battery glance: no proxy of Buoy's,
 * no polling, every read on its `g-properties-changed`.
 *
 * - EnergyRate and WarningLevel are not in Shell's interface XML
 *   (data/dbus-interfaces/org.freedesktop.UPower.Device.xml), but GDBusProxy caches every
 *   property UPower sends: they are read with get_cached_property.
 * - Quick Settings builds its indicators asynchronously (ui/panel.js QuickSettings
 *   _setupIndicators), and the proxy loads its properties after it is made: the source
 *   waits for the system indicator on the indicator box, then reads again when the
 *   toggle shows or hides (PowerToggle _sync sets `visible` from IsPresent).
 * - No battery (a desktop): no battery pill.
 * - The power mode, from the power-mode toggle GNOME's Quick Settings holds
 *   (ui/status/powerProfiles.js PowerProfilesToggle `_proxy`): a change flashes, whoever made
 *   it, but not the first reading (Buoy turned on) nor one Home's list made
 *   (kit/services/power.js setProfile silent). Without power-profiles-daemon: nothing.
 */
export class PowerSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._last = null;          // readBattery(), the last reading
        this._lowLevel = null;      // the low warning shown: 'low' | 'critical' | 'action'
        this._flash = null;         // the last flash: 'charging' | 'battery' | 'full'
        this._profile = undefined;  // the power mode last read (undefined: not read yet)
        whenQuickSettings(this, () => this._watch());
    }

    disable() {
        stopWaiting(this);
        this._toggle?.disconnectObject(this);
        this._proxy?.disconnectObject(this);
        this._modes?.disconnectObject(this);
        this._modes?._proxy?.disconnectObject(this);
        this._toggle = this._proxy = this._modes = null;
        for (const key of [FLASH, LOW, MODE])
            this._stack?.end(this._id(key));
        this._last = this._lowLevel = this._flash = null;
        this._profile = undefined;
        super.disable();
    }

    _watch() {
        const toggle = batteryToggle();
        this._toggle = toggle;
        this._proxy = toggle?._proxy ?? null;
        toggle?.connectObject('notify::visible', () => this._sync(), this);
        this._proxy?.connectObject('g-properties-changed', () => this._sync(), this);
        // the power-mode toggle shows while the daemon is on the bus (PowerProfilesToggle _sync)
        this._modes = profilesToggle();
        this._modes?.connectObject('notify::visible', () => this._syncMode(), this);
        this._modes?._proxy?.connectObject('g-properties-changed', () => this._syncMode(), this);
        this._sync();
        this._syncMode();
    }

    // the power mode: a flash when it changes (design/compact "Đổi chế độ")
    _syncMode() {
        if (!this._stack)
            return;
        const modes = profilesOf(this._modes);
        const profile = modes?.active ?? null;
        const first = this._profile === undefined;
        const changed = profile !== this._profile;
        this._profile = profile;
        if (!profile) {
            this._stack.end(this._id(MODE));
            return;
        }
        if (first || !changed || takeSilent(profile))
            return;
        this._showMode(modes);
    }

    _showMode(modes) {
        this._show(MODE, {
            what: 'mode', profile: modes.active, profiles: modes.list,
            percentage: this._last?.percentage ?? null, state: this._last?.state ?? 0,
            setProfile: p => setProfile(p),
        });
    }

    _cached(name) {
        try {
            return this._proxy?.get_cached_property(name)?.deepUnpack() ?? null;
        } catch {
            return null;
        }
    }

    _sync() {
        const p = this._proxy;
        if (!this._stack || !p)
            return;
        const cur = readBattery({
            present: p.IsPresent, state: p.State, percentage: p.Percentage,
            timeToFull: p.TimeToFull, timeToEmpty: p.TimeToEmpty,
            rate: this._cached('EnergyRate'), warning: this._cached('WarningLevel'),
        });
        const {flash, low} = powerEvents(this._last, cur);
        this._last = cur;

        if (low)
            this._show(LOW, {what: 'low', level: low, ...cur}, {alert: low !== this._lowLevel});
        else if (this._lowLevel)
            this._stack.end(this._id(LOW));

        this._lowLevel = low;

        if (flash) {
            this._show(FLASH, {what: flash, ...cur}, {fresh: true});
            this._flash = flash;
        } else if (this._flash && this._stack.has(this._id(FLASH)) && plugAgain(this._flash, cur)) {
            // the estimate and the rate come a few seconds after the plug: the flash takes them
            this._show(FLASH, {what: this._flash, ...cur});
        }
    }

    _id(key) {
        return `power:system:${key}`;
    }

    // one pill per key: a new flash replaces the last (and starts its 3 s again); the low
    // warning is updated in place, its card opening again only when the level rises
    _show(key, ev, {alert = false, fresh = false} = {}) {
        const a = this._registry?.build('power', 'system', {id: key, open: openPanel, ...ev});
        if (!a)
            return;
        if (alert)
            a.alert = true;
        if (!fresh && this._stack.has(a.id) && this._stack.update(a.id, a, {alert}))
            return;
        this._stack.surface(a);
    }
}

// still the same flash: charging stays charging (its estimate may come late); the others
// say nothing new
function plugAgain(flash, cur) {
    return flash === 'charging' && cur.state === STATE.CHARGING;
}

// Settings → Power, as Quick Settings' own battery button (ui/status/system.js
// PowerToggle: Shell.AppSystem lookup_app('gnome-power-panel.desktop'))
function openPanel(desktopId) {
    const app = Shell.AppSystem.get_default().lookup_app(desktopId);
    if (!app)
        return;
    Main.overview.hide();
    app.activate();
}
