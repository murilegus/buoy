import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as GnomeSession from 'resource:///org/gnome/shell/misc/gnomeSession.js';

/**
 * Whether you are at the screen (design/alerts-and-asks "Khi nào đã xem, khi nào bị nhỡ",
 * 2026-11-12), as Shell decides it for its banners (ui/messageTray.js):
 *
 * - **present**: input in the last second (`IDLE_TIME`, the core idle monitor's idle time);
 *   not present, a one-shot `add_user_active_watch` says when you are back
 *   (`_showNotification`, `_onIdleMonitorBecameActive`);
 * - **away**: GNOME's session idle — the screen turned off after `idle-delay` (Settings →
 *   Power), org.gnome.SessionManager.Presence `IDLE` (misc/gnomeSession.js, as
 *   ui/messageTray.js and ui/screenShield.js read it) — or the screen locked
 *   (`Main.sessionMode.isLocked`);
 * - **Do Not Disturb**: `show-banners` off (org.gnome.desktop.notifications, Shell's own
 *   switch, ui/status/doNotDisturb.js).
 *
 * Signals only: nothing polls. A watch is one-shot (Mutter's), and every watch and handler
 * goes with destroy().
 */
export class Presence {
    /**
     * @param {object} [opts]
     * @param {function(boolean):void} [opts.onAway]  called when away starts (true) or ends
     */
    constructor({onAway = null} = {}) {
        this._idle = global.backend.get_core_idle_monitor();
        this._onAway = onAway;
        this._watches = new Set();
        this._sessionIdle = false;
        this._cancel = new Gio.Cancellable();
        this._proxy = GnomeSession.Presence((proxy, error) => {
            if (error || !this._proxy)
                return;
            this._sessionIdle = proxy.status === GnomeSession.PresenceStatus.IDLE;
            this._statusId = proxy.connectSignal('StatusChanged', (_p, _s, [status]) => {
                const was = this.away;
                this._sessionIdle = status === GnomeSession.PresenceStatus.IDLE;
                if (this.away !== was)
                    this._onAway?.(this.away);
            });
        }, this._cancel);
        this._locked = Main.sessionMode.isLocked;
        Main.sessionMode.connectObject('updated', () => {
            const was = this.away;
            this._locked = Main.sessionMode.isLocked;
            if (this.away !== was)
                this._onAway?.(this.away);
        }, this);
        this._notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
    }

    /** @returns {boolean} input in the last second, not away */
    get present() {
        return !this.away && this._idle.get_idletime() <= IDLE_TIME;
    }

    /** @returns {boolean} the session idle (the screen off) or the screen locked */
    get away() {
        return this._sessionIdle || this._locked;
    }

    /** @returns {boolean} Do Not Disturb: GNOME shows no banners */
    get doNotDisturb() {
        return !this._notifications.get_boolean('show-banners');
    }

    /**
     * Call `fn` once at the next input (Mutter's user-active watch). It may never come.
     *
     * @param {function():void} fn
     * @returns {number} the watch, for cancel()
     */
    whenActive(fn) {
        const id = this._idle.add_user_active_watch(() => {
            this._watches.delete(id);
            fn();
        });
        this._watches.add(id);
        return id;
    }

    /** @param {number} id  whenActive()'s */
    cancel(id) {
        if (id && this._watches.delete(id))
            this._idle.remove_watch(id);
    }

    destroy() {
        for (const id of this._watches)
            this._idle.remove_watch(id);
        this._watches.clear();
        this._cancel.cancel();
        if (this._proxy && this._statusId)
            this._proxy.disconnectSignal(this._statusId);
        this._proxy = null;
        Main.sessionMode.disconnectObject(this);
        this._onAway = null;
    }
}

/** Shell's own: input this recent means you are there (ui/messageTray.js IDLE_TIME). */
export const IDLE_TIME = 1000;
