/**
 * Displays as Mutter runs them (FEATURES M4 "Headphones / display plugged", "Device tab"): the ways to
 * use two, how they are used now, which came and went. Pure: the plugged module and the Device tab
 * share it (kit/services/displays.js reads Mutter).
 */

/**
 * The ways to use two displays, as GNOME's Super+P switcher names them (js/ui/switchMonitor.js),
 * in its order; "Built-in Only" is left out (Ethan: a display is plugged in to be used).
 * `config` is Meta.MonitorSwitchConfigType's name.
 */
export const MODES = Object.freeze({
    join: {label: 'Join', icon: 'shell-display-extend-all-symbolic', config: 'ALL_LINEAR', word: 'joined'},
    mirror: {label: 'Mirror', icon: 'shell-display-mirror-symbolic', config: 'ALL_MIRROR', word: 'mirrored'},
    external: {label: 'External Only', icon: 'shell-display-external-only-symbolic', config: 'EXTERNAL', word: 'external only'},
});

/**
 * @param {{canSwitch?: boolean, builtin?: boolean}} mm  Mutter's monitor manager: can_switch_config(), has-builtin-panel
 * @returns {string[]} the modes offered (switchMonitor.js: External Only with a built-in panel)
 */
export function modesFor({canSwitch = false, builtin = false} = {}) {
    if (!canSwitch)
        return [];
    return builtin ? ['join', 'mirror', 'external'] : ['join', 'mirror'];
}

/**
 * How the displays are used now, from what Mutter runs (get_switch_config() says UNKNOWN for a
 * layout set in Settings): the built-in panel off is external only, a logical monitor holding
 * two displays is mirrored, else joined.
 *
 * @param {{count?: number, builtinOn?: boolean, builtin?: boolean, mirrored?: boolean}} s
 * @returns {?string} a MODES key; null with one display
 */
export function modeOf({count = 0, builtinOn = true, builtin = false, mirrored = false} = {}) {
    if (count < 2 && !(builtin && !builtinOn))
        return null;
    if (builtin && !builtinOn)
        return 'external';
    return mirrored ? 'mirror' : 'join';
}

/**
 * @param {{connector?: string, vendor?: string, product?: string, serial?: string}} m
 * @returns {string} a display's identity: the same panel on the same port
 */
export function monitorKey(m) {
    return [m.connector, m.vendor, m.product, m.serial].map(v => v ?? '').join('|');
}

/**
 * @param {?Array<{key: string}>} prev  the displays last seen (null: not read yet)
 * @param {Array<{key: string}>} cur
 * @returns {{added: object[], removed: object[]}} nothing on the first reading (Buoy turned
 *   on) nor when only the layout changed (Join / Mirror: the same displays)
 */
export function diffMonitors(prev, cur) {
    if (!prev)
        return {added: [], removed: []};
    const was = new Set(prev.map(m => m.key)), is = new Set(cur.map(m => m.key));
    return {added: cur.filter(m => !was.has(m.key)), removed: prev.filter(m => !is.has(m.key))};
}
