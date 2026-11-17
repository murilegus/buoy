import {MODES} from './displays.js';
import {PROFILES, STATE, batteryIcon, duration} from './power.js';

/**
 * The Device tab (design/device, 2026-11-16, Ethan; FEATURES M4 "Device tab"): a column per
 * group — This Computer, Wireless, Plugged In — of cells 58 high; a group past what a column
 * holds ends in "+N", and a click opens a page in place. Pure: the tab (modules/device/tab.js)
 * reads the facts through kit/services and draws what this plans.
 *
 * A cell: {id, icon, value: ?string, name, page?: 'battery'|'display'|null, open?: ?string,
 *   detail?: ?string} — `page`: what a click shows; `open`: a .desktop it starts instead.
 */

export const CELL_H = 58;
export const CELL_GAP = 6;
export const TITLE_H = 18;      // the group's title over its column

/** The groups, in their order; one with no cell is not shown. */
export const GROUPS = Object.freeze([
    {id: 'computer', title: 'This Computer'},
    {id: 'wireless', title: 'Wireless'},
    {id: 'plugged', title: 'Plugged In'},
]);

const POWER_PANEL = 'gnome-power-panel.desktop';
const DISPLAY_PANEL = 'gnome-display-panel.desktop';
const SOUND_PANEL = 'gnome-sound-panel.desktop';

/**
 * @param {number} height  the tab's body under the strip
 * @returns {number} cells a column holds: 3 at 1920 (212), 4 at 2560 (276); at least 1
 */
export function rowsFit(height) {
    if (!Number.isFinite(height))
        return 1;
    return Math.max(1, Math.floor((height - TITLE_H + CELL_GAP) / (CELL_H + CELL_GAP)));
}

/**
 * The columns: the groups with cells, each with what fits and, past that, "+N" holding the rest.
 *
 * @param {Array<{id: string, cells: object[]}>} groups
 * @param {number} rows  rowsFit()
 * @returns {Array<{id: string, title: string, count: number, cells: object[], more: ?{count: number, names: string, cells: object[]}}>}
 */
export function planDevices(groups, rows) {
    const byId = new Map((groups ?? []).map(g => [g.id, Array.isArray(g.cells) ? g.cells.filter(Boolean) : []]));
    const n = Math.max(1, rows | 0);
    const out = [];
    for (const {id, title} of GROUPS) {
        const cells = byId.get(id) ?? [];
        if (!cells.length)
            continue;
        if (cells.length <= n) {
            out.push({id, title, count: cells.length, cells, more: null});
            continue;
        }
        const rest = cells.slice(n - 1);
        out.push({
            id, title, count: cells.length, cells: cells.slice(0, n - 1),
            more: {count: rest.length, names: rest.map(c => c.name).join(', '), cells: rest},
        });
    }
    return out;
}

const watts = rate => typeof rate === 'number' && rate >= 0.5 ? `${Math.round(rate)} W` : null;
const pct = v => `${Math.max(0, Math.min(100, Math.round(v)))}%`;

/**
 * The battery's cell, or a UPS's on a desktop (UPower's DisplayDevice: Type 3): its percentage,
 * and under the name what it draws — "using 11 W" on battery, "charging 31 W" — from EnergyRate;
 * a UPS says its time left.
 *
 * @param {?{present: boolean, percentage: number, state: number, type?: number, rate?: ?number, timeToEmpty?: number}} b
 * @returns {?object} a cell; null without one
 */
export function batteryCell(b) {
    if (b?.present !== true || !Number.isFinite(b.percentage))
        return null;
    const ups = b.type === 3;
    let name = ups ? 'UPS' : 'Battery';
    if (ups) {
        const left = b.state === STATE.DISCHARGING ? duration(b.timeToEmpty) : null;
        if (left)
            name = `UPS · ${left} left`;
    } else {
        const w = watts(b.rate);
        if (w && b.state === STATE.CHARGING)
            name = `Battery · charging ${w}`;
        else if (w && b.state === STATE.DISCHARGING)
            name = `Battery · using ${w}`;
    }
    return {id: 'battery', icon: batteryIcon(b), value: pct(b.percentage), name, page: 'battery', open: POWER_PANEL};
}

/**
 * @param {?{active: ?string, list: string[]}} modes  kit/model/power.js readProfiles
 * @returns {?object} the power mode's cell; null without power-profiles-daemon
 */
export function modeCell(modes) {
    const p = modes?.active ? PROFILES[modes.active] : null;
    if (!p)
        return null;
    return {id: 'mode', icon: p.icon, value: p.name, name: 'Power Mode', page: 'battery', open: POWER_PANEL};
}

/**
 * @param {{key: string, name: string, size?: ?string, mode?: ?string}} d  an external display
 * @returns {object} its cell: the way it is used as the value
 */
export function displayCell(d) {
    const mode = MODES[d.mode] ? MODES[d.mode] : null;
    return {
        id: `display:${d.key}`, icon: 'video-display-symbolic', value: mode ? mode.label : null,
        name: d.name || 'Display', detail: d.size ?? null, page: 'display', open: DISPLAY_PANEL,
    };
}

/**
 * Wired sound in use: headphones or a headset on a jack or USB (not Bluetooth: Wireless).
 *
 * @param {?{output: string, name: string, wired?: boolean, level?: ?number, muted?: boolean}} out
 *   kit/model/audio.js outputOf, with `wired` and the level
 * @returns {?object} its cell; null when the sound is not on wired headphones
 */
export function audioCell(out) {
    if (out?.output !== 'headphones' || out.wired !== true)
        return null;
    let value = null;
    if (out.muted === true)
        value = 'Muted';
    else if (typeof out.level === 'number' && Number.isFinite(out.level))
        value = `${Math.max(0, Math.round(out.level * 100))}%`;
    return {id: 'audio', icon: 'audio-headphones-symbolic', value, name: out.name || 'Headphones', page: null, open: SOUND_PANEL};
}

/**
 * @param {?string} sinkName  Gvc's sink name (PipeWire's node name)
 * @returns {boolean} not a Bluetooth sink (bluez_output.…)
 */
export function isWired(sinkName) {
    return typeof sinkName === 'string' && sinkName !== '' && !sinkName.startsWith('bluez');
}

/**
 * The groups from what is known now: This Computer (the battery or UPS, the power mode),
 * Plugged In (external displays, wired sound); Wireless comes with its own items.
 *
 * @param {object} facts
 * @param {?object} [facts.battery]  batteryCell's
 * @param {?object} [facts.modes]  modeCell's
 * @param {object[]} [facts.displays]  displayCell's, external displays only
 * @param {?object} [facts.audio]  audioCell's
 * @returns {Array<{id: string, cells: object[]}>}
 */
export function deviceGroups({battery = null, modes = null, displays = [], audio = null} = {}) {
    return [
        {id: 'computer', cells: [batteryCell(battery), modeCell(modes)].filter(Boolean)},
        {id: 'wireless', cells: []},
        {id: 'plugged', cells: [...(displays ?? []).map(displayCell), audioCell(audio)].filter(Boolean)},
    ];
}

/**
 * A display's page: the ways to use two displays, the one in use chosen, Display Settings.
 *
 * @param {{name: string, size?: ?string, mode?: ?string, modes?: string[]}} d
 * @returns {?object} {title, end, rows, settings}; null when Mutter cannot switch
 */
export function displayPage(d) {
    const modes = (d?.modes ?? []).filter(m => MODES[m]);
    if (!modes.length)
        return null;
    return {
        title: d.name || 'Display', end: d.size ?? null,
        rows: modes.map(id => ({id, icon: MODES[id].icon, name: MODES[id].label, selected: id === d.mode})),
        settings: {name: 'Display Settings'},
    };
}

/**
 * "+N": the whole group as a list.
 *
 * @param {{title: string, count: number, cells: object[], more: ?object}} column  planDevices'
 * @returns {{title: string, rows: object[]}}
 */
export function groupPage(column) {
    return {title: `${column.title} · ${column.count}`, rows: [...column.cells, ...column.more?.cells ?? []]};
}
