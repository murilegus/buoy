import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * Whether the screen is shared or recorded, from Shell's own indicators
 * (ui/status/remoteAccess.js ScreenSharingIndicator / ScreenRecordingIndicator: each is
 * `visible` while a session runs). Sources hide what is private on a shared screen: an
 * agent's commands and paths (CODING-AGENTS.md §7), a notification's text
 * (NOTIFICATIONS.md §5). Watched only between start() and stop(): a source starts it while
 * it shows something that could hide. Signals only.
 */
export class SharingWatch {
    /**
     * @param {function(boolean):void} onChange  called when it changes while watched
     */
    constructor(onChange) {
        this._onChange = onChange;
        this._indicators = [];
        this._shared = false;
    }

    /** @returns {boolean} shared or recorded now (false while not watched) */
    get shared() {
        return this._shared;
    }

    /** Watch from now on; the value is read at once. Calling it again does nothing. */
    start() {
        if (this._indicators.length)
            return;
        const area = Main.panel.statusArea;
        this._indicators = [area.screenSharing, area.screenRecording].filter(Boolean);
        this._indicators.forEach(i => i.connectObject('notify::visible', () => this._sync(), this));
        this._shared = this._indicators.some(i => i.visible);
    }

    stop() {
        this._indicators.forEach(i => i.disconnectObject(this));
        this._indicators = [];
        this._shared = false;
    }

    _sync() {
        const shared = this._indicators.some(i => i.visible);
        if (shared === this._shared)
            return;
        this._shared = shared;
        this._onChange(shared);
    }
}
