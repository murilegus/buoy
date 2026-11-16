import {PROFILES, STATE, batteryIcon, fullyCharged, timeLine} from '../../kit/model/power.js';

export {batteryPage} from '../../kit/model/power.js';

/**
 * home module (design/home): Buoy's own glances on Home. Pure: the battery's tile from the
 * fields of GNOME's battery proxy (UPower's DisplayDevice, ui/status/system.js PowerToggle)
 * and the power modes of its power-mode toggle (ui/status/powerProfiles.js), and the page of
 * modes its click opens (design/home "Ô pin và chế độ năng lượng", 2026-11-14).
 */

export {STATE};

const pctOf = v => Math.max(0, Math.min(100, Math.round(v)));

/**
 * The battery's tile: Buoy's own battery icons (drawn in Gravity's style), the percentage,
 * what it is doing; the power mode's icon in the top right corner; from 200 wide, the time
 * and the mode's name on the right.
 *
 * @param {object} p
 * @param {boolean} p.present  IsPresent: a laptop's battery or a UPS
 * @param {number} p.percentage  0–100
 * @param {number} p.state  STATE
 * @param {number} [p.timeToFull]  s, 0 not known
 * @param {number} [p.timeToEmpty]  s, 0 not known
 * @param {?{active: ?string, list: string[]}} [modes]  kit/model/power.js readProfiles
 * @returns {?{icon: string, value: string, caption: string, cornerIcon?: string, detail: string[]}}
 *   null without a battery
 */
export function batteryTile({present, percentage, state, timeToFull = 0, timeToEmpty = 0}, modes = null) {
    if (present !== true || !Number.isFinite(percentage))
        return null;
    const pct = pctOf(percentage);
    const charging = state === STATE.CHARGING;
    const full = state === STATE.FULL;
    const icon = batteryIcon({percentage, state});
    let caption = 'Battery';
    if (charging)
        caption = 'Charging';
    else if (full)  // UPower's FULL below 100 % is only plugged in (kit/model/power.js fullyCharged)
        caption = fullyCharged({state, percentage}) ? 'Fully charged' : 'Plugged in';
    else if (state === STATE.PENDING_CHARGE)
        caption = 'Plugged in';     // held at a charge limit
    else if (pct < 20)
        caption = 'Low battery';
    const mode = modes?.active ? PROFILES[modes.active] : null;
    return {
        icon, value: `${pct}%`, caption,
        ...mode ? {cornerIcon: mode.icon} : {},
        detail: [timeLine({state, timeToFull, timeToEmpty}, 'Full in'), mode?.name ?? null].filter(Boolean),
    };
}
