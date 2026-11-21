import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {eventIdParts, onlineCalendars} from './meeting.js';

// Evolution Data Server's calendar factory (EDS 3.56: Calendar8;
// src/private/org.gnome.evolution.dataserver.CalendarFactory.xml / …Calendar.xml)
const BUS = 'org.gnome.evolution.dataserver.Calendar8';
const FACTORY_PATH = '/org/gnome/evolution/dataserver/CalendarFactory';
const FACTORY = 'org.gnome.evolution.dataserver.CalendarFactory';
const CALENDAR = 'org.gnome.evolution.dataserver.Calendar';
const TIMEOUT_MS = 5000;
const SOURCES = 'org.gnome.evolution.dataserver.Sources5';
const SOURCES_PATH = '/org/gnome/evolution/dataserver/SourceManager';
const SOURCE = 'org.gnome.evolution.dataserver.Source';

/**
 * One event's iCalendar, read from EDS over its own D-Bus (SPEC §6b item 5): Shell's calendar
 * server sends only id, summary and times, so the meeting link is read here, once, for an
 * event about to start. No `gi://ECal` (not installed by default). The calendar is opened for
 * this read and closed after it (`OpenCalendar` gives a new calendar object each call).
 *
 * @param {string} id  Shell's event id (meeting.js eventIdParts)
 * @param {?Gio.Cancellable} [cancellable]
 * @returns {Promise<?string>} the iCalendar text, or null (no such event, EDS away)
 */
export async function readEvent(id, cancellable = null) {
    const parts = eventIdParts(id);
    if (!parts)
        return null;
    const bus = Gio.DBus.session;
    const call = (dest, path, iface, method, args, type) => bus.call(dest, path, iface, method, args,
        type ? new GLib.VariantType(type) : null, Gio.DBusCallFlags.NONE, TIMEOUT_MS, cancellable);
    const [path, name] = /** @type {[string, string]} */ ((await call(BUS, FACTORY_PATH, FACTORY, 'OpenCalendar',
        new GLib.Variant('(s)', [parts.source]), '(ss)')).deepUnpack());
    try {
        await call(name, path, CALENDAR, 'Open', null, '(as)');
        // an instance of a repeating event has no object of its own: its master holds the link
        for (const rid of parts.rid ? [parts.rid, ''] : ['']) {
            try {
                // eslint-disable-next-line no-await-in-loop -- the master only when the instance is not there
                const [ics] = /** @type {[string]} */ ((await call(name, path, CALENDAR, 'GetObject',
                    new GLib.Variant('(ss)', [parts.uid, rid]), '(s)')).deepUnpack());
                return ics;
            } catch (e) {
                if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    throw e;
            }
        }
        return null;
    } finally {
        call(name, path, CALENDAR, 'Close', null, null).catch(() => {});
    }
}

/**
 * EDS's sources, as they are now (its SourceManager's objects): each one's uid and key file.
 *
 * @param {?Gio.Cancellable} [cancellable]
 * @returns {Promise<{uid: string, data: string}[]>}
 */
export async function readSources(cancellable = null) {
    const [objects] = /** @type {[Record<string, Record<string, Record<string, any>>>]} */ ((await Gio.DBus.session.call(
        SOURCES, SOURCES_PATH, 'org.freedesktop.DBus.ObjectManager', 'GetManagedObjects', null,
        new GLib.VariantType('(a{oa{sa{sv}}})'), Gio.DBusCallFlags.NONE, TIMEOUT_MS, cancellable)).recursiveUnpack());
    return Object.values(objects).map(o => o[SOURCE]).filter(Boolean).map(p => ({uid: p.UID, data: p.Data}));
}

/**
 * Buoy asks EDS to fetch the online calendars GNOME shows every `minutes` (`calendar-refresh`,
 * 2026-11-20, Ethan; EDS's own is 60 min). Each calendar is opened once and kept till stop()
 * (`Calendar.Refresh` runs in the backend after its reply: a calendar closed right after might
 * end it). The list is read again at each turn: an account added or a calendar unselected.
 * Nothing else: the events come to Shell's calendar server as any change does.
 */
export class CalendarRefresher {
    constructor() {
        this._open = new Map();      // source uid → {name, path}
        this._timer = 0;
        this._cancel = null;
    }

    /** @param {?number} minutes  null: stop */
    set(minutes) {
        this.stop();
        if (!minutes)
            return;
        this._cancel = new Gio.Cancellable();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, minutes * 60, () => {
            this._turn().catch(e => {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.warn(`Buoy: calendar refresh: ${e.message}`);
            });
            return GLib.SOURCE_CONTINUE;
        });
    }

    _call(dest, path, iface, method, args, type) {
        return Gio.DBus.session.call(dest, path, iface, method, args,
            type ? new GLib.VariantType(type) : null, Gio.DBusCallFlags.NONE, TIMEOUT_MS, this._cancel);
    }

    async _turn() {
        const uids = onlineCalendars(await readSources(this._cancel));
        for (const uid of [...this._open.keys()]) {
            if (!uids.includes(uid))
                this._close(uid);
        }
        await Promise.all(uids.map(async uid => {
            try {
                let c = this._open.get(uid);
                if (!c) {
                    const [path, name] = /** @type {[string, string]} */ ((await this._call(BUS, FACTORY_PATH, FACTORY, 'OpenCalendar',
                        new GLib.Variant('(s)', [uid]), '(ss)')).deepUnpack());
                    c = {name, path};
                    await this._call(name, path, CALENDAR, 'Open', null, '(as)');
                    if (!this._cancel)      // stopped meanwhile
                        return;
                    this._open.set(uid, c);
                }
                await this._call(c.name, c.path, CALENDAR, 'Refresh', null, null);
            } catch (e) {
                if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    throw e;
                // the calendar went away (its backend restarted): opened again next turn
                this._open.delete(uid);
                console.warn(`Buoy: calendar refresh: ${e.message}`);
            }
        }));
    }

    _close(uid) {
        const c = this._open.get(uid);
        this._open.delete(uid);
        if (c) {
            Gio.DBus.session.call(c.name, c.path, CALENDAR, 'Close', null, null,
                Gio.DBusCallFlags.NO_AUTO_START, TIMEOUT_MS, null).catch(() => {});
        }
    }

    stop() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        this._cancel?.cancel();
        this._cancel = null;
        for (const uid of [...this._open.keys()])
            this._close(uid);
    }
}
