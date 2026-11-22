/**
 * The timers, shared by the source (pill, end, Clocks, keep-awake) and the tab (FEATURES M4
 * "Timer"). Kept at module level: disable / enable (a screen lock does it, session-mode) must not
 * stop a timer; `timer-state` keeps them over a Shell restart (source.js). No GLib here.
 */
export const store = {
    loaded: false,          // `timer-state` read once in this Shell
    timers: [],             // model.js timers, running or paused
    ended: [],              // ended ones whose card waits: {id, name, seconds, at, pomodoro, clocks}
    presets: [],            // GNOME Clocks' saved timers: [{seconds, name}]
    clocks: false,          // GNOME Clocks' settings are there (its schema installed)
    last: 300,              // the length last started, seconds
    pomodoro: null,         // {work, break, long, rounds}: prefs
    selected: null,         // the timer the tab shows on its ring
    /** @type {?object} the source's actions, while it runs (source.js) */
    actions: null,
    _listeners: new Set(),

    /**
     * @param {function():void} fn  called on every change
     * @returns {function():void} to stop listening
     */
    listen(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    },

    changed() {
        for (const fn of [...this._listeners])
            fn();
    },
};
