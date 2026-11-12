/**
 * home module (design/home): Buoy's own glances on Home. Pure: the battery's tile from the
 * fields of GNOME's battery proxy (UPower's DisplayDevice, ui/status/system.js PowerToggle).
 */

/** UPower's DeviceState (UPower.DeviceState; the numbers of the D-Bus API). */
export const STATE = Object.freeze({CHARGING: 1, DISCHARGING: 2, EMPTY: 3, FULLY_CHARGED: 4, PENDING_CHARGE: 5, PENDING_DISCHARGE: 6});

/**
 * The battery's tile: Buoy's own battery icons (drawn in Gravity's style), the percentage,
 * "Battery" or "Charging".
 *
 * @param {object} p
 * @param {boolean} p.present  IsPresent: a laptop's battery or a UPS
 * @param {number} p.percentage  0–100
 * @param {number} p.state  STATE
 * @returns {?{icon: string, value: string, caption: string}} null without a battery
 */
export function batteryTile({present, percentage, state}) {
    if (present !== true || !Number.isFinite(percentage))
        return null;
    const pct = Math.max(0, Math.min(100, Math.round(percentage)));
    const charging = state === STATE.CHARGING;
    let icon = 'battery-good-symbolic';
    if (charging)
        icon = 'battery-good-charging-symbolic';
    else if (state === STATE.FULLY_CHARGED || pct >= 80)
        icon = 'battery-full-symbolic';
    else if (pct < 20)
        icon = 'battery-low-symbolic';
    return {icon, value: `${pct}%`, caption: charging ? 'Charging' : 'Battery'};
}
