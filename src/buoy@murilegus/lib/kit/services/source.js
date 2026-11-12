/** @import Gio from 'gi://Gio' */
/** @import {ActivityStack} from '../model/stack.js' */
/** @import {Registry} from './registry.js' */

/**
 * Base class for a module's source.js. A source watches one system facility
 * and calls stack.surface / update / end. Event-driven only — never poll
 * while the activity is not visible. disable() ends every activity it surfaced:
 * a module turned off in prefs leaves nothing behind (2026-11-03).
 */
export class Source {
    /**
     * @param {ActivityStack} stack
     * @param {Registry} [registry]  builds an event into an activity (adapter, overrides)
     * @param {Gio.Settings} [settings]  Buoy's; a source reads its module's `<id>-…` keys
     * @param {object} [_opts]  {dbus}: kit/services/dbus.js BuoyDBus, for a source that answers one
     *   of its methods (agent: `Agent`, 2026-11-07); {extension}: Buoy's Extension object,
     *   for its metadata and openPreferences() (the greeting, 2026-11-09)
     */
    enable(stack, registry = null, settings = null, _opts = {}) {
        this._stack = stack;
        this._registry = registry;
        this._settings = settings;
    }

    disable() {
        this._stack = null;
        this._registry = null;
        this._settings = null;
    }
}
