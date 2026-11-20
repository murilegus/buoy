import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {eventIdParts} from './meeting.js';

// Evolution Data Server's calendar factory (EDS 3.56: Calendar8;
// src/private/org.gnome.evolution.dataserver.CalendarFactory.xml / …Calendar.xml)
const BUS = 'org.gnome.evolution.dataserver.Calendar8';
const FACTORY_PATH = '/org/gnome/evolution/dataserver/CalendarFactory';
const FACTORY = 'org.gnome.evolution.dataserver.CalendarFactory';
const CALENDAR = 'org.gnome.evolution.dataserver.Calendar';
const TIMEOUT_MS = 5000;

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
