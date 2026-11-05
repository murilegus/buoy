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
     */
    enable(stack, registry = null, settings = null) {
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
