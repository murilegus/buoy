import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Source} from '../../kit/source.js';
import {SharingWatch} from '../../kit/sharing.js';
import {DISMISS, actionIndex, shownElsewhere, waitedInQueue} from './adapter.js';

const KIND = 'notification';
const REPLACE_KEY = 'notification-replace-banners';

/**
 * GNOME's banners as pills (docs/NOTIFICATIONS.md). Shell decides when a notification
 * deserves a banner — Do Not Disturb, urgency, full screen, the lock screen, the app's own
 * switch — and then calls MessageTray `_showNotification()` (ui/messageTray.js
 * `_updateState`). With `notification-replace-banners` on, that call is overridden (on the
 * prototype, through InjectionManager, as the hud module does for the OSD): the
 * notification leaves the queue as a pill instead of a banner, marked seen and its sound
 * played as `_updateShowingNotification` would have (§1). Off, the original runs.
 *
 * - One pill per app (its id, as the registry slugs it; notify-send makes a Shell source
 *   per process); a new notification from it is surfaced anew (§2), an update of the
 *   same one updates the pill.
 * - The pill acts on Shell's own object: activate, an action, × (destroy, DISMISSED). A
 *   notification gone from the list (any reason) leaves the pill to the app's previous
 *   one, or ends it — after the current call, since a GTK app's replacement comes in the
 *   same call as the old one's end (ui/notificationDaemon.js addNotification).
 * - Held: one that waited in Shell's queue (full screen, busy, locked) shows when the
 *   screen is back but stays unseen, so the tab counts it as missed (§1). Its time in the
 *   queue is stamped on the tray's `queue-changed`.
 * - The screen shared or recorded (kit/sharing.js): the text hides (§5), watched only
 *   while a pill is up.
 * - No timer of its own: the pill's 6 s are its ttl.
 */
export class NotificationSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        // app id → {key, list (alive, oldest first), seen, shown, id}
        this._pills = new Map();
        this._serial = 0;
        this._queuedAt = new WeakMap();
        this._sharing = new SharingWatch(() => this._redrawAll());
        this._injections = new InjectionManager();
        // the tray is a singleton, called through `tray` (as hud's `osd`)
        const tray = Main.messageTray;
        this._injections.overrideMethod(Object.getPrototypeOf(tray), '_showNotification', original => () => {
            if (!this._replacing())
                return original.call(tray);
            return this._takeQueue(tray);
        });
        // emitted after each push, before Shell's `_updateState` (ui/messageTray.js
        // `_onNotificationRequestBanner`)
        tray.connectObject('queue-changed', () => this._stamp(tray), this);
        this._stamp(tray);
    }

    disable() {
        this._injections?.clear();
        this._injections = null;
        Main.messageTray.disconnectObject(this);
        this._queuedAt = null;
        for (const [app, pill] of this._pills ?? [])
            this._drop(app, pill);
        this._pills = null;
        this._sharing?.stop();
        this._sharing = null;
        super.disable();
    }

    _replacing() {
        return !!this._stack && this._settings?.get_boolean(REPLACE_KEY) !== false;
    }

    // In place of `_showNotification`: the first queued notification, as Shell picked it,
    // then every next one Shell would show at once too (its own test in `_updateState`:
    // not while busy or full screen, unless critical or feedback) — no banner holds the
    // rest back.
    _takeQueue(tray) {
        const queue = tray._notificationQueue;
        const now = monotonicMs();
        do {
            const n = queue.shift();
            tray.emit('queue-changed');
            this._take(n, waitedInQueue(this._queuedAt.get(n), now));
        } while (queue.length && mayShowNow(tray, queue[0]));
    }

    // When it entered the queue, once: an update already queued keeps its first time.
    _stamp(tray) {
        const now = monotonicMs();
        for (const n of tray._notificationQueue) {
            if (!this._queuedAt.has(n))
                this._queuedAt.set(n, now);
        }
    }

    _take(n, held = false) {
        this._queuedAt.delete(n);
        // what the banner does when it shows (`_updateShowingNotification`); one that
        // waited while nobody could see it stays unseen (§1)
        if (!held)
            n.acknowledged = true;
        n.playSound();
        if (!n.source)
            return;
        // one pill per app, not per Shell source: notify-send makes a source per process
        const app = appIdOf(n.source);
        const progressOn = this._settings?.get_boolean('modules-progress') === true;
        if (shownElsewhere(app, n.id, progressOn))
            return;
        let pill = this._pills.get(app);
        if (pill && !this._live(pill)) {     // its pill ended (the ttl): start afresh
            this._drop(app, pill);
            pill = null;
        }
        if (!pill) {
            pill = {key: ++this._serial, list: [], seen: new WeakSet(), shown: null, id: null};
            this._pills.set(app, pill);
        }
        const fresh = !pill.seen.has(n);
        if (fresh) {
            pill.seen.add(n);
            // a source's end destroys its notifications first (ui/messageTray.js Source.destroy)
            n.connectObject('destroy', () => this._gone(app, n), this);
        }
        pill.list = [...pill.list.filter(x => x !== n), n];
        this._show(app, {anew: fresh});
    }

    _gone(app, n) {
        const pill = this._pills?.get(app);
        if (!pill)
            return;
        pill.list = pill.list.filter(x => x !== n);
        // after the current call: a GTK app's replacement comes in it (§2)
        Promise.resolve().then(() => this._settle(app, pill));
    }

    _settle(app, pill) {
        if (!this._stack || this._pills?.get(app) !== pill)
            return;
        // nothing left, or its pill already ended: an older notification never comes back
        if (!pill.list.length || !this._live(pill))
            this._drop(app, pill);
        else if (pill.shown !== pill.list.at(-1))
            this._show(app, {anew: false});
    }

    _live(pill) {
        return !!pill.id && !!this._stack?.has(pill.id);
    }

    _drop(app, pill) {
        this._pills.delete(app);
        pill.list.forEach(n => n.disconnectObject(this));
        if (this._live(pill))
            this._stack.end(pill.id);
        if (!this._pills.size)
            this._sharing.stop();
    }

    _show(app, {anew}) {
        const pill = this._pills.get(app);
        const n = pill.list.at(-1);
        const src = n.source;
        this._sharing.start();
        const own = n.gicon ?? null;
        const themed = own instanceof Gio.ThemedIcon;
        const a = this._registry?.build(KIND, app, {
            id: String(pill.key),
            title: n.title ?? '',
            body: n.body ?? '',
            markup: n.useBodyMarkup === true,
            appName: src?.title ?? '',
            appIcon: src?.icon ?? null,
            icon: themed ? own : null,
            image: own && !themed ? own : null,
            at: msOf(n.datetime) || Date.now(),
            count: pill.list.length,
            critical: n.urgency === MessageTray.Urgency.CRITICAL,
            shared: this._sharing.shared,
            actions: n.actions.map(x => x.label),
            activate: () => this._activate(pill, n),
            onAction: id => this._act(pill, n, id),
        });
        pill.shown = n;
        const live = this._live(pill);
        if (!a) {                       // a profile's `skip`: GNOME's list keeps it
            if (live)
                this._stack.end(pill.id);
            pill.id = null;
            return;
        }
        if (live && !anew && this._stack.update(pill.id, a))
            return;
        pill.id = this._stack.surface(a);
    }

    // The banner's click (ui/messageList.js NotificationMessage vfunc_clicked).
    _activate(pill, n) {
        if (pill.list.includes(n))
            n.activate();
        return true;
    }

    _act(pill, n, id) {
        if (!pill.list.includes(n))
            return;
        if (id === DISMISS) {
            n.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
            return;
        }
        n.actions[actionIndex(id)]?.activate();
    }

    _redrawAll() {
        for (const [app, pill] of this._pills ?? []) {
            if (this._live(pill))
                this._show(app, {anew: false});
        }
    }
}

function monotonicMs() {
    return GLib.get_monotonic_time() / 1000;
}

// MessageTray `_updateState`'s own test for showing the next banner now.
function mayShowNow(tray, n) {
    const limited = tray._busy || Main.layoutManager.primaryMonitor?.inFullscreen;
    return !limited || n.forFeedback || n.urgency === MessageTray.Urgency.CRITICAL;
}

/**
 * @param {MessageTray.Source} src
 * @returns {string} the app's id as the registry slugs it: an app's policy id (its desktop
 *   id without `.desktop`, ui/messageTray.js NotificationPolicy.newForApp, a GTK app's own),
 *   else the source's title ("System", a notify-send name) — the generic policy's id is
 *   the same `generic` for every such source
 */
export function appIdOf(src) {
    const id = src.policy instanceof MessageTray.NotificationApplicationPolicy ? src.policy.id : null;
    return typeof id === 'string' && id ? id : src.title || 'system';
}

/**
 * @param {?GLib.DateTime} dt  a notification's `datetime`
 * @returns {number} ms since the epoch, to the microsecond (two in one second keep their
 *   order), 0 when unknown
 */
export function msOf(dt) {
    return dt ? dt.to_unix_usec() / 1000 : 0;
}
