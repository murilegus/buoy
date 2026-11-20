import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {Source} from '../../kit/services/source.js';
import {SharingWatch} from '../../kit/services/sharing.js';
import {EventReader} from './events.js';
import {CalendarRefresher, readEvent} from './eds.js';
import {REMINDER_APP, STAY, dueMeetings, refreshMinutes, meetingLink, nextWake, placeOf, reminderSaid} from './meeting.js';

const KIND = 'calendar';
// Events joined or dismissed: not shown again. Kept across disable (the lock screen turns Buoy
// off and on: a dismissed meeting must not come back at unlock); event id → when it leaves
// the pill (its start + STAY), then it is forgotten — by time, not by the events loaded now:
// right after unlock the list may still be empty.
const DONE = new Map();
const KEY = 'calendar-meeting-alert';
const REFRESH_KEY = 'calendar-refresh';

/**
 * A meeting about to start (FEATURES M4 "Meeting in 5 min · Join"; design/compact "Sắp họp",
 * 2026-11-20, Ethan): a timed event from the date menu's events (events.js) comes 5 min before
 * its start as a card, its pill counting down; at the start the card comes again ("now"), and
 * the pill stays 10 min, till Join or ×. One pill per event. Its meeting link (Join) and place
 * are read from EDS once, as it comes (eds.js).
 *
 * - No polling: one timeout to the next moment something changes (meeting.js nextWake: one
 *   comes, starts, goes; while one counts down, the minute its "in 4 min" changes), set again
 *   on each change of the events. None with no timed event ahead.
 * - GNOME's own reminder (evolution-alarm-notify's "Reminders", Google's default 10 min before)
 *   for an event Buoy says is taken off as it is added, before its banner (B, 2026-11-20, Ethan;
 *   as attention does with "“…” is ready"): read, destroyed, so neither a banner nor a row in
 *   GNOME's list. Shell's message list hears `notification-added` first (it connected first)
 *   and drops the row on `destroy`; the banner is never asked for, as it is read
 *   (ui/messageTray.js Source.addNotification, MessageTray._onNotificationRequestBanner).
 */
export class MeetingSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._meetings = new Map();     // event id → {ev, id, phase, ics: 'reading' | string | null}
        this._timer = 0;
        this._drops = new Set();        // GNOME's reminders to take off (_watch)
        this._dropId = 0;
        this._cancel = new Gio.Cancellable();
        this._sharing = new SharingWatch(() => this._sync());
        this._reader = new EventReader(() => this._sync());
        // online calendars fetched more often than EDS's hour, when asked (`calendar-refresh`)
        this._refresher = new CalendarRefresher();
        const refresh = () => this._refresher.set(refreshMinutes(settings?.get_string(REFRESH_KEY)));
        settings?.connectObject(
            `changed::${KEY}`, () => this._sync(),
            `changed::${REFRESH_KEY}`, refresh, this);
        refresh();
        const tray = Main.messageTray;
        tray.connectObject('source-added', (_t, src) => this._watch(src), this);
        tray.getSources().forEach(src => this._watch(src));
        this._sync();
    }

    get _on() {
        return this._settings?.get_boolean(KEY) !== false;
    }

    _watch(src) {
        const policy = src.policy;
        if (!(policy instanceof MessageTray.NotificationApplicationPolicy) || policy.id !== REMINDER_APP)
            return;
        src.connectObject('notification-added', (_s, n) => {
            if (!this._on || !reminderSaid(n.body, this._reader?.state.events, Date.now()))
                return;
            // read now: no banner (ui/messageTray.js _onNotificationRequestBanner, emitted
            // right after); destroyed once addNotification is done — destroy() disposes it,
            // and the banner request after it would read a disposed one (2026-11-20)
            n.acknowledged = true;
            this._drops.add(n);
            this._dropId ||= GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._dropId = 0;
                for (const x of this._drops)
                    x.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
                this._drops.clear();
                return GLib.SOURCE_REMOVE;
            });
        }, this);
    }

    _sync() {
        if (!this._stack)
            return;
        const now = Date.now();
        const due = this._on ? dueMeetings(this._reader.state.events, now).filter(e => !DONE.has(e.id)) : [];
        const ids = new Set(due.map(e => e.id));
        for (const [key, m] of [...this._meetings]) {
            if (!ids.has(key))
                this._end(key, m);
        }
        for (const e of due) {
            let m = this._meetings.get(e.id);
            if (!m) {
                m = {ev: e, id: null, phase: null, ics: 'reading'};
                this._meetings.set(e.id, m);
                this._read(e.id, m);
            }
            m.ev = e;
            // its card waits for the link (a quick read), so it comes once, with Join
            if (m.ics !== 'reading')
                this._show(e.id, m, now);
        }
        if (this._meetings.size)
            this._sharing.start();
        else
            this._sharing.stop();
        this._schedule(now);
    }

    _read(key, m) {
        readEvent(key, this._cancel).then(ics => {
            m.ics = ics;
        }).catch(e => {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.warn(`Buoy: calendar: ${e.message}`);
            m.ics = null;
        }).finally(() => {
            if (this._meetings?.get(key) === m)
                this._show(key, m, Date.now());
        });
    }

    _show(key, m, now) {
        const e = m.ev;
        const ics = typeof m.ics === 'string' ? m.ics : '';
        const a = this._registry?.build(KIND, key, {
            id: key, title: e.title, start: e.start, end: e.end, startText: e.startText, endText: e.endText,
            link: meetingLink(ics), location: placeOf(ics), phase: e.phase, now, shared: this._sharing.shared,
            join: () => this._join(key),
            dismiss: () => this._dismiss(key),
        });
        if (!a)
            return;
        // a card when it comes and again when it starts; quietly otherwise (the link read,
        // the minute's "in 4 min")
        const alert = m.phase !== e.phase;
        m.phase = e.phase;
        if (m.id && this._stack.has(m.id) && this._stack.update(m.id, a, {alert}))
            return;
        m.id = this._stack.surface({...a, alert});
    }

    _join(key) {
        const ics = this._meetings?.get(key)?.ics;
        const url = typeof ics === 'string' ? meetingLink(ics)?.url : null;
        if (url) {
            try {
                Gio.AppInfo.launch_default_for_uri(url, global.create_app_launch_context(0, -1));
            } catch (e) {
                console.warn(`Buoy: calendar: ${e.message}`);
            }
        }
        this._dismiss(key);
    }

    _dismiss(key) {
        const e = this._meetings?.get(key)?.ev;
        DONE.set(key, e ? e.start + STAY : Date.now() + STAY);
        this._sync();
    }

    _end(key, m) {
        if (m.id && this._stack?.has(m.id))
            this._stack.end(m.id);
        this._meetings.delete(key);
    }

    _schedule(now) {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        for (const [key, until] of [...DONE]) {
            if (until <= now)
                DONE.delete(key);
        }
        const at = this._on ? nextWake(this._reader.state.events, now) : null;
        if (at === null)
            return;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1, Math.min(at - now, 2 ** 31 - 1)), () => {
            this._timer = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        if (this._dropId)
            GLib.source_remove(this._dropId);
        this._dropId = 0;
        this._drops = null;
        this._cancel?.cancel();
        this._cancel = null;
        Main.messageTray.disconnectObject(this);
        for (const src of Main.messageTray.getSources())
            src.disconnectObject(this);
        this._settings?.disconnectObject(this);
        this._refresher?.stop();
        this._refresher = null;
        for (const [key, m] of [...this._meetings ?? []])
            this._end(key, m);
        this._meetings = null;
        this._reader?.destroy();
        this._reader = null;
        this._sharing?.stop();
        this._sharing = null;
        super.disable();
    }
}
