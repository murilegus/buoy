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
 * Fully charged as the pill says it: UPower's FULL at 100 %. A battery its firmware calls full
 * below that (the kernel's "Full" at 96 %, UPower's percentage being energy over energy-full) is
 * only plugged in (Ethan, 2026-11-16: "Fully charged 96%" read wrong).
 *
 * @param {{state: number, percentage: ?number}} b
 * @returns {boolean}
 */
export function fullyCharged({state, percentage}) {
    return state === STATE.FULL && (typeof percentage !== 'number' || Math.round(percentage) >= 100);
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

const pctOf = v => Math.max(0, Math.min(100, Math.round(v)));

/**
 * The battery's icon, Buoy's own (design/icons): charging; full (and plugged in, held at a limit,
 * from 80 %); low under 20 % on battery; good otherwise.
 *
 * @param {{percentage: number, state: number}} b
 * @returns {string}
 */
export function batteryIcon({percentage, state}) {
    const pct = pctOf(percentage);
    if (state === STATE.CHARGING)
        return 'battery-good-charging-symbolic';
    if (state === STATE.FULL || pct >= 80)
        return 'battery-full-symbolic';
    if (state !== STATE.PENDING_CHARGE && pct < 20)
        return 'battery-low-symbolic';
    return 'battery-good-symbolic';
}

/**
 * "Full in 42 min" / "3 h 20 min left"; null when full or not known.
 *
 * @param {{state: number, timeToFull?: number, timeToEmpty?: number}} b
 * @param {string} fullIn  "Full in" or "full in"
 * @returns {?string}
 */
export function timeLine({state, timeToFull = 0, timeToEmpty = 0}, fullIn) {
    if (state === STATE.FULL)
        return null;
    if (state === STATE.CHARGING) {
        const t = duration(timeToFull);
        return t ? `${fullIn} ${t}` : null;
    }
    const t = duration(timeToEmpty);
    return t ? `${t} left` : null;
}

/**
 * The page its click opens: the power modes, the one in use chosen, then Power Settings.
 * Without power modes, none (the click opens Settings → Power as before).
 *
 * @param {object} b  as batteryTile
 * @param {?{active: ?string, list: string[]}} modes
 * @returns {?{title: string, end: ?string, rows: object[], settings: {name: string}}}
 */
export function batteryPage(b, modes) {
    if (!modes?.list?.length || b?.present !== true || !Number.isFinite(b.percentage))
        return null;
    const charging = b.state === STATE.CHARGING;
    return {
        title: `Battery · ${pctOf(b.percentage)}%${charging ? ' · charging' : ''}`,
        end: timeLine(b, 'full in'),
        rows: modes.list.map(id => ({id, icon: PROFILES[id].icon, name: PROFILES[id].name, selected: id === modes.active})),
        settings: {name: 'Power Settings'},
    };
}
