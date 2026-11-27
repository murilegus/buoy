/**
 * What the microphone and the camera are doing, for Home's "in use" tile (glance.js), written by
 * the source as GNOME's indicators change. No GLib here.
 */
export const inUse = {
    mic: false,
    cam: false,
    apps: [],
    _listeners: new Set(),

    /**
     * @param {function():void} fn
     * @returns {function():void} to stop listening
     */
    listen(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    },

    /** @param {{mic: boolean, cam: boolean, apps: string[]}} next */
    set(next) {
        const key = s => JSON.stringify([s.mic, s.cam, s.apps]);
        if (key(next) === key(this))
            return;
        Object.assign(this, {mic: next.mic, cam: next.cam, apps: next.apps});
        for (const fn of [...this._listeners])
            fn();
    },
};
