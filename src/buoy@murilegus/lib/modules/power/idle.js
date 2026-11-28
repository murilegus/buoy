/**
 * The battery idle plan (FEATURES M4 "Idle plan `power`", design/pill "Idle plan Pin", Ethan
 * 2026-11-27: option A + Y): the battery's icon and percentage in the idle pill, the power mode as a
 * small icon at its end; its compact (hover) speaks of the battery over the three power modes as
 * buttons. For a minute after a plug in or an unplug `auto` holds it, and once UPower has its
 * estimate the pill says it in full ("72% · full in 1 h 10 min"). Presentation only, pure:
 * feed.js reads GNOME's own objects into `ctx.data`.
 *
 * State (feed.js), null until Quick Settings' battery proxy has loaded:
 *   {battery: adapter.js readBattery(), modes: ?{active, list} (kit/model/power.js readProfiles),
 *    plugAt: ?number (ms, the last plug in or unplug), estimate: ?{state, timeToFull, timeToEmpty}
 *    (the first estimate after it, kept so the pill does not change with every UPower update)}
 */

import {PROFILES, STATE, batteryIcon, fullyCharged, plugged, timeLine} from '../../kit/model/power.js';

/** No keys of its own: the module's switch is on Modules (Quick Feedback). */
export const keys = Object.freeze([]);

/** No wall clock: the battery says when it changes; the minute window ends by the feed's timer. */
export const ticks = false;

/** How long a plug in or an unplug holds the pill (Ethan, 2026-11-14: "30 s – 1 min"). */
export const WINDOW_MS = 60 * 1000;

const isNum = v => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {*} data  the feed's state
 * @param {Date} [now]
 * @returns {boolean} within the minute after a plug in or an unplug
 */
export function inWindow(data, now) {
    const t = now instanceof Date ? now.getTime() : Date.now();
    return isNum(data?.plugAt) && t >= data.plugAt && t - data.plugAt < WINDOW_MS;
}

// a battery to speak of: present, its percentage known
const batteryOf = data => data?.battery?.present === true && isNum(data.battery.percentage) ? data.battery : null;

/**
 * @param {object} b  readBattery()
 * @returns {?string} "charging", "fully charged", "plugged in" (held at a limit, or full below
 *   100 %, design/compact "Pin và chế độ năng lượng"); null on battery
 */
export function stateWord(b) {
    if (b.state === STATE.CHARGING)
        return 'charging';
    if (b.state === STATE.FULL && fullyCharged(b))
        return 'fully charged';
    return plugged(b.state) ? 'plugged in' : null;
}

/**
 * @param {object} [ctx]
 * @param {Date} [ctx.now]
 * @param {?object} [ctx.data]  the feed's state
 * @returns {?object} {leading, text, trailing, compact, actions, accessibleName}; null without a
 *   battery (a desktop: auto passes it by)
 */
export function present({now, data} = {}) {
    const b = batteryOf(data);
    if (!b)
        return null;
    const pct = `${b.percentage}%`;
    const icon = batteryIcon(b);
    const mode = data.modes?.active ? PROFILES[data.modes.active] : null;
    // the minute after a plug: the first estimate, said in full
    const said = inWindow(data, now) && data.estimate ? timeLine(data.estimate, 'full in') : null;
    const word = stateWord(b);
    const title = ['Battery', pct, word].filter(Boolean).join(' · ');
    const time = timeLine(b, 'Full in');
    const sub = [time, mode?.name].filter(Boolean).join(' · ') || null;
    const list = Array.isArray(data.modes?.list) ? data.modes.list.filter(id => PROFILES[id]) : [];
    return {
        leading: icon,
        text: said ? `${pct} · ${said}` : pct,
        trailing: mode ? {icon: mode.icon, subtle: true} : null,
        // with power modes: the battery over the three modes as buttons (the power-mode compact's
        // layout, design/compact); without: the head alone
        compact: list.length
            ? {card: {picture: {icon, backdrop: true}, title, app: sub, tight: true}}
            : {leading: icon, text: title, subtitle: time},
        actions: list.map(id => ({id, label: PROFILES[id].name, icon: PROFILES[id].icon, selected: id === data.modes.active})),
        accessibleName: [title, time, mode?.name].filter(Boolean).join(', '),
    };
}

/**
 * `auto` (SPEC §2a-iii, design/pill "Idle plan Pin"): the minute after a plug in or an unplug
 * 80 (holds the pill); on battery under 30 % 60, on battery 30; charging 25; full or held 15; no
 * battery null. A low battery (under 20 %) is already an activity (priority 70) above the idle pill.
 *
 * @param {object} [ctx]
 * @param {Date} [ctx.now]
 * @param {?object} [ctx.data]  the feed's state
 * @returns {?{score: number}}
 */
export function relevance({now, data} = {}) {
    const b = batteryOf(data);
    if (!b)
        return null;
    if (inWindow(data, now))
        return {score: 80};
    if (!plugged(b.state))
        return {score: b.percentage < 30 ? 60 : 30};
    return {score: b.state === STATE.CHARGING ? 25 : 15};
}

export default {keys, ticks, present, relevance};
