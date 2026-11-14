/**
 * The laptop's power as GNOME shows it (FEATURES M4 "Power"): UPower's battery states, the
 * power modes of power-profiles-daemon, the times. Pure: the power module's adapter and
 * Home's battery tile share it (design/home "Ô pin và chế độ năng lượng", design/compact
 * "Pin và chế độ năng lượng").
 */

/** UPower's DeviceState (up-types.h UpDeviceState, the numbers of the D-Bus API). */
export const STATE = Object.freeze({CHARGING: 1, DISCHARGING: 2, EMPTY: 3, FULL: 4, PENDING_CHARGE: 5, PENDING_DISCHARGE: 6});

/**
 * @param {number} state  UPower's
 * @returns {boolean} on mains: charging, full, or held at a charge limit
 */
export function plugged(state) {
    return state === STATE.CHARGING || state === STATE.FULL || state === STATE.PENDING_CHARGE;
}

/**
 * The power modes, in the order Buoy lists them (low to high). Names as GNOME's Quick
 * Settings (ui/status/powerProfiles.js PROFILE_PARAMS); icons are Buoy's (design/icons
 * "Chế độ năng lượng"), under GNOME's names.
 */
export const PROFILES = Object.freeze({
    'power-saver': {name: 'Power Saver', icon: 'power-profile-power-saver-symbolic'},
    'balanced': {name: 'Balanced', icon: 'power-profile-balanced-symbolic'},
    'performance': {name: 'Performance', icon: 'power-profile-performance-symbolic'},
});
const ORDER = Object.keys(PROFILES);

/**
 * The power modes the daemon offers and the one in use, checked.
 *
 * @param {object} [p]
 * @param {boolean} [p.available]  power-profiles-daemon on the bus (GNOME's toggle `visible`)
 * @param {*} [p.active]  ActiveProfile
 * @param {*} [p.profiles]  the names in Profiles
 * @returns {?{active: ?string, list: string[]}} null without the daemon or a mode Buoy knows;
 *   `active` null when the daemon's is not one of PROFILES
 */
export function readProfiles({available, active, profiles} = {}) {
    if (available !== true)
        return null;
    const offered = new Set(Array.isArray(profiles) ? profiles : []);
    const list = ORDER.filter(p => offered.has(p));
    if (!list.length)
        return null;
    return {active: list.includes(active) ? active : null, list};
}

/**
 * @param {number} s  seconds
 * @returns {?string} "42 min", "2 h 10 min", "3 h"; null when not known (0) or under a minute
 */
export function duration(s) {
    if (!Number.isFinite(s) || s < 60)
        return null;
    const m = Math.round(s / 60);
    const h = Math.floor(m / 60), r = m % 60;
    if (!h)
        return `${r} min`;
    return r ? `${h} h ${r} min` : `${h} h`;
}
