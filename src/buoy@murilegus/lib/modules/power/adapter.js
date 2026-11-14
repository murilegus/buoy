import {PRIORITY} from '../../kit/model/activity.js';
import {PROFILES, STATE, duration, plugged} from '../../kit/model/power.js';

export {STATE, duration, plugged};

/**
 * power adapter (FEATURES M4 "Power", SPEC §6b item 4; decided 2026-11-14, Ethan): the
 * laptop's battery as GNOME's Quick Settings reads it (UPower's DisplayDevice).
 *   charging  plugged in: 3 s — "Full in 42 min", or "18 W · slow charger"
 *   battery   unplugged: 3 s — "3 h 20 min left"
 *   full      fully charged while plugged in: 3 s
 *   low       UPower's warning level low / critical / action on battery: stays until plugged
 *             in; it takes the place of GNOME's own "Low Battery" notification
 *             (notification/adapter.js powerShows)
 *   mode      the power mode changed (by anyone, the system too): 3 s with the mode's icon and
 *             name; its compact (hover) has the modes as buttons, the one in use selected
 * Priority (Ethan, 2026-11-14): a flash keeps the kind's 40; the low warning takes 70, the
 * notification's it replaces, so music or an agent never covers it.
 * Pure: the source reads the proxy and passes its fields.
 *
 * Event: {what, percentage, timeToFull, timeToEmpty, rate, level?, open?}; a mode's
 *   {what: 'mode', profile, profiles: [names], percentage, state, setProfile?(name)}
 */

/** A flash's length (Ethan: 3 s at plug in, unplug and full). */
export const TTL = 3000;

/** Slow: charging below SLOW_W watts while under SLOW_BELOW % (above it every laptop tapers). */
export const SLOW_W = 20;
export const SLOW_BELOW = 80;

// UPower's warning levels (up-types.h UpDeviceLevel); its states are kit/model/power.js STATE
export const WARNING = Object.freeze({NONE: 1, DISCHARGING: 2, LOW: 3, CRITICAL: 4, ACTION: 5});

const LEVELS = {[WARNING.LOW]: 'low', [WARNING.CRITICAL]: 'critical', [WARNING.ACTION]: 'action'};
const POWER_PANEL = 'gnome-power-panel.desktop';

const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * The proxy's fields, checked: a percentage 0–100 rounded as GNOME shows it, times in s
 * (0 = not known yet), the rate in W (null when UPower gives none).
 *
 * @param {object} p  {present, state, percentage, timeToFull, timeToEmpty, rate, warning}
 * @returns {{present: boolean, state: number, percentage: ?number, timeToFull: number,
 *   timeToEmpty: number, rate: ?number, warning: number}}
 */
export function readBattery(p = {}) {
    const pct = num(p.percentage);
    const rate = num(p.rate);
    return {
        present: p.present === true,
        state: Number.isInteger(p.state) ? p.state : 0,
        percentage: pct === null ? null : Math.max(0, Math.min(100, Math.round(pct))),
        timeToFull: Math.max(0, num(p.timeToFull) ?? 0),
        timeToEmpty: Math.max(0, num(p.timeToEmpty) ?? 0),
        rate: rate !== null && rate > 0 ? rate : null,
        warning: Number.isInteger(p.warning) ? p.warning : WARNING.NONE,
    };
}

/**
 * @param {object} b  readBattery()
 * @returns {?string} 'low' | 'critical' | 'action' on battery at UPower's warning, else null
 */
export function lowLevel(b) {
    if (!b?.present || plugged(b.state))
        return null;
    return LEVELS[b.warning] ?? null;
}

/**
 * What changed between two readings: a flash (plug in, unplug, full) and the low warning.
 * The first reading (prev null) flashes nothing; a low battery shows at once.
 *
 * @param {?object} prev  readBattery(), the last one
 * @param {object} cur  readBattery()
 * @returns {{flash: ?string, low: ?string}}
 */
export function powerEvents(prev, cur) {
    if (!cur?.present)
        return {flash: null, low: null};
    const low = lowLevel(cur);
    let flash = null;
    if (prev?.present) {
        const was = plugged(prev.state), is = plugged(cur.state);
        if (!was && is)
            flash = cur.state === STATE.FULL ? 'full' : 'charging';
        else if (was && !is)
            flash = low ? null : 'battery';     // the low warning says it
        else if (is && prev.state !== STATE.FULL && cur.state === STATE.FULL)
            flash = 'full';
    }
    return {flash, low};
}

/**
 * @param {object} b  readBattery()
 * @returns {boolean} charging slower than SLOW_W, below SLOW_BELOW %
 */
export function slow(b) {
    return b?.state === STATE.CHARGING && b.rate !== null && b.rate < SLOW_W &&
        b.percentage !== null && b.percentage < SLOW_BELOW;
}

const ICONS = {
    charging: 'battery-good-charging-symbolic',
    battery: 'battery-good-symbolic',
    full: 'battery-full-symbolic',
    low: 'battery-low-symbolic',
};

function words(ev) {
    const b = readBattery({...ev, present: true});
    switch (ev.what) {
    case 'charging': {
        if (slow(b))
            return {text: `${Math.round(b.rate)} W · slow charger`, sub: duration(b.timeToFull)};
        const t = duration(b.timeToFull);
        return {text: t ? `Full in ${t}` : 'Charging', sub: null};
    }
    case 'battery': {
        const t = duration(b.timeToEmpty);
        return {text: t ? `${t} left` : 'On battery', sub: null};
    }
    case 'full':
        return {text: 'Fully charged', sub: null};
    case 'low': {
        const t = duration(b.timeToEmpty);
        return {text: ev.level === 'low' ? 'Low battery' : 'Battery almost empty', sub: t ? `${t} left` : 'Plug in now'};
    }
    }
    return null;
}

// "Balanced · battery 82%, charging": the mode's compact under its name
function modeLine(ev) {
    const b = readBattery({...ev, present: true});
    if (b.percentage === null)
        return PROFILES[ev.profile].name;
    const how = b.state === STATE.CHARGING ? ', charging' : '';
    return `${PROFILES[ev.profile].name} · battery ${b.percentage}%${how}`;
}

// the power mode changed: 3 s with its icon and name; hovered, the modes as buttons
// (design/compact "Đổi chế độ", Ethan 2026-11-14: option C)
function mode(ev) {
    const p = PROFILES[ev.profile];
    if (!p)
        return null;
    const list = (Array.isArray(ev.profiles) ? ev.profiles : []).filter(n => PROFILES[n]);
    const set = typeof ev.setProfile === 'function' ? ev.setProfile : null;
    return {
        leading: p.icon,
        text: p.name,
        trailing: null,
        sizeHint: 'wide',
        ttl: TTL,
        priority: PRIORITY.power,
        compact: {
            card: {picture: {icon: p.icon, backdrop: true}, title: 'Power Mode', app: modeLine(ev), tight: true},
        },
        expanded: null,
        actions: set ? list.map(n => ({id: n, label: PROFILES[n].name, icon: PROFILES[n].icon, selected: n === ev.profile})) : [],
        minimalAction: false,
        attributes: {profile: ev.profile},
        onAction: set ? id => PROFILES[id] && set(id) : null,
        onPress: typeof ev.open === 'function' ? () => ev.open(POWER_PANEL) : null,
    };
}

export default {
    power(ev) {
        if (ev?.what === 'mode')
            return mode(ev);
        const w = ICONS[ev?.what] ? words(ev) : null;
        if (!w)
            return null;
        const b = readBattery({...ev, present: true});
        const icon = ICONS[ev.what];
        const pct = b.percentage === null ? null : `${b.percentage}%`;
        const low = ev.what === 'low';
        return {
            leading: icon,
            text: w.text,
            trailing: pct ? {text: pct} : null,     // a text, not an icon's name
            sizeHint: 'wide',
            // a flash goes on its own; the low warning stays until plugged in (the source ends it)
            ttl: low ? 0 : TTL,
            priority: low ? PRIORITY.notification : PRIORITY.power,
            compact: low || w.sub ? {leading: icon, text: w.text, subtitle: w.sub} : null,
            expanded: null,
            // the notification it replaces reads this (notification/adapter.js powerShows)
            attributes: low ? {low: ev.level ?? 'low', percentage: b.percentage} : {},
            onPress: typeof ev.open === 'function' ? () => ev.open(POWER_PANEL) : null,
        };
    },
};
