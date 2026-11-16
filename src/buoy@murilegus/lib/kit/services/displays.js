import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MODES, modeOf, modesFor, monitorKey} from '../model/displays.js';

/**
 * The displays as Mutter runs them (`global.backend.get_monitor_manager()`, its public API:
 * meta-monitor-manager.h, meta-monitor.h, meta-logical-monitor.h), for the plugged module and
 * the Device tab (FEATURES M4 "Headphones / display plugged", "Device tab"). Reads only; signals
 * are the caller's (`monitors-changed` on monitorManager()).
 */

/** @returns {Meta.MonitorManager} Mutter's */
export function monitorManager() {
    return global.backend.get_monitor_manager();
}

/**
 * @param {Meta.MonitorManager} mm
 * @returns {Array<{key: string, name: string, builtin: boolean, monitor: Meta.Monitor}>} every
 *   display but the virtual ones (a screen share's, a headless Shell's)
 */
export function readMonitors(mm) {
    return mm.get_monitors().filter(m => !m.is_virtual()).map(m => ({
        key: monitorKey({connector: m.get_connector(), vendor: m.get_vendor(), product: m.get_product(), serial: m.get_serial()}),
        name: m.get_display_name(),
        builtin: m.is_builtin(),
        monitor: m,
    }));
}

/**
 * What a display is to the pill and the tab: its size, how the displays are used, the ways
 * Mutter can switch to.
 *
 * @param {Meta.MonitorManager} mm
 * @param {{monitor: Meta.Monitor}} m  readMonitors'
 * @param {Array<{monitor: Meta.Monitor}>} all  readMonitors', to count the active ones
 * @returns {{size: ?string, mode: ?string, modes: string[]}}
 */
export function displayInfo(mm, m, all) {
    const builtin = mm.has_builtin_panel === true;
    const logical = mm.get_logical_monitors();
    return {
        size: sizeOf(m.monitor, logical),
        mode: modeOf({
            count: all.filter(x => x.monitor.is_active()).length, builtin, builtinOn: mm.get_is_builtin_display_on(),
            mirrored: logical.some(l => l.get_monitors().length > 1),
        }),
        modes: modesFor({canSwitch: mm.can_switch_config(), builtin}),
    };
}

/**
 * Switch the way the displays are used, as GNOME's Super+P switcher does (switchMonitor.js).
 *
 * @param {Meta.MonitorManager} mm
 * @param {string} id  a MODES key
 */
export function switchMode(mm, id) {
    const config = MODES[id]?.config;
    if (config)
        mm.switch_config(Meta.MonitorSwitchConfigType[/** @type {'ALL_LINEAR'|'ALL_MIRROR'|'EXTERNAL'} */ (config)]);
}

// The display's size in pixels: its logical monitor's (Main.layoutManager.monitors, by the
// logical monitor's number) times its scale; Mutter gives no mode or refresh rate to extensions
function sizeOf(monitor, logical) {
    const l = logical.find(x => x.get_monitors().includes(monitor));
    const geo = l ? Main.layoutManager.monitors[l.get_number()] : null;
    if (!geo)
        return null;
    // layout.js Monitor sets geometry_scale (@girs names it geometryScale)
    const own = /** @type {any} */ (geo).geometry_scale;
    const scale = own > 0 ? own : 1;
    return `${Math.round(geo.width * scale)} × ${Math.round(geo.height * scale)}`;
}
