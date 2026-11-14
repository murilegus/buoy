import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {readProfiles} from '../model/power.js';

/**
 * GNOME's own power objects, reached through Quick Settings (FEATURES M4 "Power"): Buoy
 * makes no proxy of its own (design/compact "Pin và chế độ năng lượng").
 *   battery  the power toggle's UPower DisplayDevice (ui/status/system.js PowerToggle `_proxy`)
 *   modes    the power-mode toggle's power-profiles-daemon proxy
 *            (ui/status/powerProfiles.js PowerProfilesToggle `_proxy`)
 * Quick Settings builds its indicators asynchronously (ui/panel.js QuickSettings
 * _setupIndicators): whenQuickSettings() waits for them on the indicator box.
 */

// Shell internals: QuickSettings._system / _powerProfiles (panel.js), Indicator._systemItem
// (status/system.js), Indicator._powerProfilesToggle (status/powerProfiles.js)
const qs = () => Main.panel.statusArea.quickSettings ?? null;

/** @returns {?object} GNOME's battery toggle (its `_proxy` is UPower's DisplayDevice) */
export function batteryToggle() {
    return qs()?._system?._systemItem?.powerToggle ?? null;
}

/** @returns {?object} GNOME's power-mode toggle (its `_proxy` is power-profiles-daemon's) */
export function profilesToggle() {
    // the toggle is the indicator's private field: @girs types the indicator without it
    return /** @type {any} */ (qs()?._powerProfiles)?._powerProfilesToggle ?? null;
}

/**
 * Call `then` once both toggles are made: now, or when Quick Settings adds its indicators.
 *
 * @param {object} owner  the signal's owner (disconnected with stopWaiting(owner))
 * @param {function():void} then
 */
export function whenQuickSettings(owner, then) {
    if (batteryToggle() && profilesToggle()) {
        then();
        return;
    }
    const box = qs()?._indicators ?? null;
    box?.connectObject('child-added', () => {
        if (!batteryToggle() || !profilesToggle())
            return;
        box.disconnectObject(owner);
        then();
    }, owner);
}

/** @param {object} owner  as given to whenQuickSettings */
export function stopWaiting(owner) {
    qs()?._indicators?.disconnectObject(owner);
}

/**
 * @param {?object} toggle  profilesToggle()
 * @returns {?{active: ?string, list: string[]}} model/power.js readProfiles
 */
export function profilesOf(toggle) {
    const p = toggle?._proxy;
    if (!p)
        return null;
    let profiles = [];
    try {
        profiles = (p.Profiles ?? []).map(d => d?.Profile?.unpack?.()).filter(Boolean);
    } catch {
        profiles = [];
    }
    return readProfiles({available: p.g_name_owner !== null && toggle.visible !== false, active: p.ActiveProfile, profiles});
}

// A change Buoy made where it is already seen (Home's list, design/home: "flash đổi chế độ
// không hiện"): the power source lets it pass without a flash. Held 2 s at most, so a
// change the daemon refused does not silence a later one.
let quiet = null;
const QUIET_US = 2 * GLib.USEC_PER_SEC;

/**
 * Switch the power mode as GNOME's own menu does (PowerProfilesToggle: `ActiveProfile = …`).
 *
 * @param {string} profile
 * @param {object} [opts]
 * @param {boolean} [opts.silent]  no flash for it (Home's list)
 */
export function setProfile(profile, {silent = false} = {}) {
    const p = profilesToggle()?._proxy;
    if (!p || p.ActiveProfile === profile)
        return;
    quiet = silent ? {profile, at: GLib.get_monotonic_time()} : null;
    p.ActiveProfile = profile;
}

/**
 * @param {string} profile  the mode just read
 * @returns {boolean} Buoy switched to it silently just now (taken: asked once)
 */
export function takeSilent(profile) {
    const q = quiet;
    quiet = null;
    return !!q && q.profile === profile && GLib.get_monotonic_time() - q.at < QUIET_US;
}
