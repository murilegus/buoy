import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {formatTime} from 'resource:///org/gnome/shell/misc/dateUtils.js';

import {HORIZON_DAYS, dayStart} from './agenda.js';

/**
 * The calendar's events, read from the date menu's own event source (ui/dateMenu.js
 * DateMenuButton `_eventSource`, a ui/calendar.js DBusEventSource): the same events the
 * clock's popover lists, from every calendar Evolution Data Server knows (GNOME Online
 * Accounts register theirs there; SPEC §3). No second source: Shell's calendar server
 * keeps one time range for every client (src/calendar-server/gnome-shell-calendar-server.c
 * SetTimeRange sets `app->since` / `until`), so a second DBusEventSource asking for its own
 * range would take the date menu's away.
 *
 * - The range is the date menu's: its calendar asks for the six weeks around the month it
 *   shows (ui/calendar.js `_rebuildCalendar` → requestRange). `show(day)` moves that
 *   calendar to a day (Calendar.setDate, a no-op on the same day), so the month the tab
 *   shows is the one loaded; `ensureToday()` is `show(today)`. The date menu selects today
 *   again whenever it opens (dateMenu.js `open-state-changed`).
 * - Event-driven: the source's `changed` and `notify::has-calendars` re-read; nothing
 *   polls. A session mode change replaces the date menu's source (`_sessionUpdated`: the
 *   lock screen has none), so `Main.sessionMode` `updated` binds the current one again, and
 *   every read follows the date menu's source first (`_follow`: it drops the old one before
 *   this reader hears the change).
 * - The state is plain (agenda.js's events): today and the six days after, as far as the
 *   loaded range reaches; the times written as GNOME writes them (12/24 h).
 */
export class EventReader {
    /**
     * @param {function(): void} onChanged  the state changed
     * @param {object} [opts]
     * @param {boolean} [opts.everyChange]  call on every change of the source, not only of
     *   the week's state (the tab shows other months)
     */
    constructor(onChanged, {everyChange = false} = {}) {
        this._onChanged = onChanged;
        this._everyChange = everyChange;
        this._source = null;
        this.state = {hasCalendars: false, events: []};
        Main.sessionMode.connectObject('updated', () => this._bind(), this);
        this._bind(false);
    }

    get _menu() {
        return Main.panel.statusArea.dateMenu ?? null;
    }

    _bind(notify = true) {
        this._follow();
        this._read(notify);
    }

    // Holds the date menu's source as it is now. At a session mode change the date menu
    // destroys the old one, its proxy disposed (ui/dateMenu.js `_sessionUpdated` →
    // `_setEventSource`; ui/calendar.js DBusEventSource `destroy`), before this reader hears
    // `updated`: Shell connected first (ui/main.js builds the panel before the extension
    // manager). When the change disables Buoy (the lock screen) it never hears it, and a read
    // during disable() — the idle pill shown as the last pills end — touched the dead proxy
    // (Gjs-CRITICAL "already disposed", 2026-11-13). So every read follows first.
    _follow() {
        const source = this._menu?._eventSource ?? null;
        if (source === this._source)
            return;
        this._source?.disconnectObject(this);
        this._source = source;
        source?.connectObject(
            'changed', () => this._read(),
            'notify::has-calendars', () => this._read(), this);
    }

    _read(notify = true) {
        this._follow();
        const source = this._source;
        const hasCalendars = Boolean(source?.hasCalendars);
        let events = [];
        if (hasCalendars) {
            const now = Date.now();
            events = this.eventsIn(dayStart(now), dayStart(now, HORIZON_DAYS));
        }
        const state = {hasCalendars, events};
        const same = JSON.stringify(state) === JSON.stringify(this.state);
        this.state = state;
        if (notify && (!same || this._everyChange))
            this._onChanged();
    }

    /**
     * @param {number} from  ms
     * @param {number} to  ms
     * @returns {object[]} the loaded events overlapping [from, to), plain (agenda.js)
     */
    eventsIn(from, to) {
        this._follow();
        if (!this._source?.hasCalendars)
            return [];
        return this._source.getEvents(new Date(from), new Date(to)).map(e => ({
            id: e.id,
            title: e.summary ?? '',
            start: e.date.getTime(),
            end: e.end.getTime(),
            startText: formatTime(e.date, {timeOnly: true}),
            endText: formatTime(e.end, {timeOnly: true}),
        }));
    }

    /**
     * @param {number} day  ms
     * @returns {boolean} a loaded event touches that day (the grid's dot)
     */
    hasEvents(day) {
        this._follow();
        return Boolean(this._source?.hasCalendars && this._source.hasEvents(new Date(day)));
    }

    /** @returns {number} GNOME's first day of the week, 0 Sunday … 6 Saturday */
    get weekStart() {
        const s = this._menu?._calendar?._weekStart;
        return Number.isInteger(s) ? s : Shell.util_get_week_start();
    }

    /**
     * That day's month in the date menu's range (its events arrive as `changed`), then read.
     *
     * @param {number} day  ms
     */
    show(day) {
        try {
            this._menu?._calendar?.setDate(new Date(day));
        } catch (e) {
            console.warn(`Buoy: calendar: ${e.message}`);
        }
        this._read();
    }

    /** Today's month in the date menu's range, then read. */
    ensureToday() {
        this.show(Date.now());
    }

    destroy() {
        Main.sessionMode.disconnectObject(this);
        this._source?.disconnectObject(this);
        this._source = null;
        this._onChanged = () => {};
    }
}
