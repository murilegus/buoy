import {PROFILES, STATE, duration} from '../../kit/model/power.js';

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
    let icon = 'battery-good-symbolic', caption = 'Battery';
    if (charging) {
        icon = 'battery-good-charging-symbolic';
        caption = 'Charging';
    } else if (full) {
        icon = 'battery-full-symbolic';
        caption = 'Fully charged';
    } else if (pct >= 80) {
        icon = 'battery-full-symbolic';
    } else if (pct < 20) {
        icon = 'battery-low-symbolic';
        caption = 'Low battery';
    }
    const mode = modes?.active ? PROFILES[modes.active] : null;
    return {
        icon, value: `${pct}%`, caption,
        ...mode ? {cornerIcon: mode.icon} : {},
        detail: [timeLine({state, timeToFull, timeToEmpty}, 'Full in'), mode?.name ?? null].filter(Boolean),
    };
}

// "Full in 42 min" / "3 h 20 min left"; null when full or not known
function timeLine({state, timeToFull = 0, timeToEmpty = 0}, fullIn) {
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
