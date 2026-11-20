/**
 * A meeting about to start (FEATURES M4 "Meeting in 5 min · Join"; design/compact "Sắp họp",
 * 2026-11-20, Ethan), pure: when it comes and goes, its meeting link read from the event's
 * iCalendar, GNOME's own reminder it replaces, and the adapter. source.js reads the events
 * (events.js, the date menu's) and the iCalendar (eds.js).
 *
 * Event: {id, title, start, end, startText, endText, link, location, phase, shared, join, dismiss}
 *   link       {url, service} or null (meetingLink)
 *   location   the event's place when it is not a link, or ''
 *   phase      'soon' (counting down to the start) or 'now' (it started)
 *   now        ms, for the card's "in 4 min"
 *   shared     the screen is shared or recorded: the title is not shown
 *   join()     opens the link; dismiss() the pill goes, not asked again
 */
import {isAllDay, normalise, spanText} from './agenda.js';

const MIN = 60 * 1000;

/** It comes this long before the start, */
export const LEAD = 5 * MIN;
/** and stays this long after it. */
export const STAY = 10 * MIN;
/**
 * GNOME's reminder for an event starting within this is Buoy's to say (B, 2026-11-20, Ethan:
 * Google's default one is 10 min before); one earlier (30 min, a day) is the user's own and
 * stays.
 */
export const REMINDER = 15 * MIN;

/** evolution-alarm-notify's app id: its "Reminders" notifications (src/services/evolution-alarm-notify/e-alarm-notify.c). */
export const REMINDER_APP = 'org.gnome.Evolution-alarm-notify';

export const ICON = 'x-office-calendar-symbolic';
export const JOIN = 'join';
export const DISMISS = 'dismiss';
const GREEN = '#30d158';

/**
 * @param {*} events  events.js's list
 * @param {number} now  ms
 * @returns {object[]} the timed events on the pill now: from LEAD before their start to
 *   STAY after it, while they last; each with its `phase`
 */
export function dueMeetings(events, now) {
    return normalise(events)
        .filter(e => !isAllDay(e) && e.start - LEAD <= now && now < e.start + STAY && (now < e.end || e.end === e.start))
        .map(e => ({...e, phase: now < e.start ? 'soon' : 'now'}));
}

/**
 * @param {*} events
 * @param {number} now
 * @returns {?number} the next moment something changes, ms (one comes, starts, goes); while
 *   one counts down, the next minute too, for the card's "in 4 min"; null: nothing ahead
 */
export function nextWake(events, now) {
    const marks = normalise(events)
        .filter(e => !isAllDay(e))
        .flatMap(e => [e.start - LEAD, e.start, e.start + STAY, e.end])
        .filter(t => t > now);
    // "in 4 min" is spanText's rounding: it turns to "in 3 min" at 3.5 min before
    for (const e of dueMeetings(events, now).filter(m => m.phase === 'soon')) {
        const k = Math.round((e.start - now) / MIN);
        if (k > 1)     // "in 1 min" stays to the start
            marks.push(Math.max(now + 1, e.start - (k - 0.5) * MIN));
    }
    return marks.length ? Math.min(...marks) : null;
}

/**
 * @param {*} body  evolution-alarm-notify's notification body: the event's summary on the
 *   first line (libecal e-reminder-watcher.c e_reminder_watcher_describe_data)
 * @param {*} events
 * @param {number} now
 * @returns {boolean} it is the reminder of a timed event starting within REMINDER (or begun,
 *   and still on the pill): Buoy says it
 */
export function reminderSaid(body, events, now) {
    const first = typeof body === 'string' ? body.split('\n')[0].trim().replace(/\s+/g, ' ') : '';
    if (!first)
        return false;
    return normalise(events).some(e => !isAllDay(e) && e.title === first &&
        e.start - REMINDER <= now && now < e.start + STAY);
}

// --- the meeting link ------------------------------------------------------------------------

/** @type {[RegExp, string][]} */
const SERVICES = [
    [/^https:\/\/meet\.google\.com\/[a-z]+-[a-z]+-[a-z]+/i, 'Google Meet'],
    [/^https:\/\/([\w-]+\.)*zoom\.us\/(j|my|w)\/[\w?=.&-]+/i, 'Zoom'],
    [/^https:\/\/teams\.(microsoft|live)\.com\/(l\/meetup-join|meet)\/[^\s]+/i, 'Teams'],
    [/^https:\/\/([\w-]+\.)*webex\.com\/[^\s]+/i, 'Webex'],
    [/^https:\/\/meet\.jit\.si\/[^\s]+/i, 'Jitsi'],
];

/**
 * @param {string} ics  an iCalendar text
 * @param {string} name  a property's name
 * @returns {string[]} its values in the first VEVENT, unfolded and unescaped (RFC 5545 §3.1,
 *   §3.3.11), parameters dropped
 */
export function icsValues(ics, name) {
    if (typeof ics !== 'string')
        return [];
    const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const head = name.toUpperCase();
    const found = [];
    // the first VEVENT's own lines: not those of a VALARM inside it
    let depth = 0;
    for (const l of lines) {
        const up = l.toUpperCase();
        if (up.startsWith('BEGIN:')) {
            if (depth || up === 'BEGIN:VEVENT')
                depth++;
            continue;
        }
        if (up.startsWith('END:') && depth) {
            depth--;
            if (!depth)
                break;
            continue;
        }
        if (depth === 1 && up.split(/[;:]/, 1)[0] === head)
            found.push(l);
    }
    return found
        .map(l => l.slice(l.indexOf(':') + 1)
            .replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1'));
}

/**
 * The meeting's link, as the services write it: Google's own field first
 * (X-GOOGLE-CONFERENCE), then the event's URL, its place, its description.
 *
 * @param {string} ics
 * @returns {?{url: string, service: string}}
 */
export function meetingLink(ics) {
    const fields = ['X-GOOGLE-CONFERENCE', 'URL', 'LOCATION', 'DESCRIPTION'];
    for (const f of fields) {
        for (const v of icsValues(ics, f)) {
            for (const [url] of v.matchAll(/https:\/\/[^\s<>"')\]]+/g)) {
                const hit = SERVICES.find(([re]) => re.test(url));
                if (hit)
                    return {url: url.replace(/[.,;]+$/, ''), service: hit[1]};
            }
        }
    }
    return null;
}

/**
 * @param {string} ics
 * @returns {string} the event's place, when it is a place (not a link), on one line
 */
export function placeOf(ics) {
    const v = (icsValues(ics, 'LOCATION')[0] ?? '').replace(/\s+/g, ' ').trim();
    return /^https?:\/\//i.test(v) ? '' : v;
}

/**
 * @param {*} id  Shell's event id: the calendar's uid, the event's uid and its recurrence id,
 *   a line each (src/calendar-server/gnome-shell-calendar-server.c create_event_id)
 * @returns {?{source: string, uid: string, rid: string}}
 */
export function eventIdParts(id) {
    if (typeof id !== 'string')
        return null;
    const [source = '', uid = '', rid = ''] = id.split('\n');
    return source && uid ? {source, uid, rid} : null;
}

// --- the adapter -----------------------------------------------------------------------------

export default {
    calendar(ev) {
        const own = typeof ev.title === 'string' ? ev.title.trim().replace(/\s+/g, ' ') : '';
        const title = ev.shared === true || !own ? 'Event' : own;
        const now = Number.isFinite(ev.now) ? ev.now : Date.now();
        const soon = ev.phase !== 'now';
        const range = ev.startText && ev.endText && ev.end > ev.start ? `${ev.startText} – ${ev.endText}` : ev.startText || null;
        const when = soon && Number.isFinite(ev.start) ? `in ${spanText(ev.start - now)}` : 'now';
        const place = ev.shared === true || typeof ev.location !== 'string' ? '' : ev.location.trim();
        const link = ev.link && typeof ev.link.url === 'string' && ev.link.url ? ev.link : null;
        const service = link && typeof link.service === 'string' && link.service ? link.service : 'Meeting';
        return {
            text: title,
            leading: ICON,
            // counting down to the start, then "now" in green (as a call going on)
            trailing: soon && Number.isFinite(ev.start) ? {until: ev.start} : {text: 'now', color: GREEN},
            compact: {
                card: {
                    icon: ICON, app: [range, when, place || null].filter(Boolean).join(' · '),
                    picture: null, title, body: null, close: DISMISS, actionsOnHover: false, tight: true,
                },
            },
            expanded: null,
            actions: link ? [{id: JOIN, label: `Join ${service}`, icon: 'camera-video-symbolic', main: true}] : [],
            minimalAction: false,
            // it stays from 5 min before to 10 min after the start (the source ends it)
            ttl: 0,
            onAction: id => {
                if (id === JOIN)
                    ev.join?.();
                else if (id === DISMISS)
                    ev.dismiss?.();
            },
            attributes: {title, start: ev.start ?? null, phase: soon ? 'soon' : 'now', link: link?.url ?? null},
        };
    },
};

// --- refreshing online calendars -------------------------------------------------------------

/**
 * `calendar-refresh` (2026-11-20, Ethan: an event made on the web 20 min before did not come;
 * EDS refreshes a remote calendar every 60 min, libedataserver/e-source-refresh.c
 * `interval-minutes`): 'gnome' leaves it to EDS; else Buoy asks EDS to refresh that often.
 *
 * @param {*} value  the key's value
 * @returns {?number} minutes, or null: as GNOME
 */
export function refreshMinutes(value) {
    const m = typeof value === 'string' ? /^(\d+)m$/.exec(value) : null;
    const n = m ? Number(m[1]) : 0;
    return n >= 1 ? n : null;
}

// calendars on this computer: nothing to fetch
const LOCAL_BACKENDS = new Set(['local', 'contacts', 'weather']);

/**
 * @param {*} sources  [{uid, data}]: EDS's sources, `data` the key file each one is
 *   (org.gnome.evolution.dataserver.Source `Data`)
 * @returns {string[]} the uids of the online calendars GNOME shows: a [Calendar] whose
 *   backend fetches (CalDAV, Google, Microsoft, a web calendar), enabled and selected (Shell's
 *   calendar server reads only selected ones: src/calendar-server/calendar-sources.c)
 */
export function onlineCalendars(sources) {
    if (!Array.isArray(sources))
        return [];
    return sources.filter(s => {
        if (!s || typeof s.uid !== 'string' || !s.uid || typeof s.data !== 'string')
            return false;
        const sections = {};
        let at = null;
        for (const line of s.data.split('\n')) {
            const head = /^\[(.+)\]\s*$/.exec(line);
            if (head) {
                at = sections[head[1]] = {};
                continue;
            }
            const kv = /^([\w-]+)=(.*)$/.exec(line);
            if (at && kv)
                at[kv[1]] = kv[2].trim();
        }
        const cal = sections['Calendar'];
        if (!cal || LOCAL_BACKENDS.has(cal.BackendName ?? ''))
            return false;
        // GNOME's own defaults: enabled and selected unless the file says false
        return sections['Data Source']?.Enabled !== 'false' && cal.Enabled !== 'false' && cal.Selected !== 'false';
    }).map(s => s.uid);
}
