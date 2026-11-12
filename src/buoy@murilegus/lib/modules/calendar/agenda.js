/**
 * The calendar's events, pure (FEATURES M3 "calendar", SPEC §2a / §2a-iii / §3): which one
 * the idle pill shows next, how much it matters to `auto`, and the Calendar tab's Today and
 * Upcoming. No St, no Shell: events.js reads the date menu's event source into the plain
 * list below.
 *
 * Event: {id, title, start, end, startText, endText}
 *   start, end            ms since the epoch (Shell's CalendarEvent `date` / `end`)
 *   startText, endText    the times as GNOME writes them (12/24 h, misc/dateUtils.js
 *                         formatTime, time only)
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** How far the tab looks ahead: today and the six days after it. */
export const HORIZON_DAYS = 7;
/** An event this close is "soon": the idle pill holds it (SPEC §2a-iii, 90). */
export const SOON = 30 * MIN;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const str = v => typeof v === 'string' ? v.trim() : '';

/**
 * @param {number} ms
 * @param {number} [days]  whole days after (DST-safe: a local date, not 24 h steps)
 * @returns {number} local midnight of that day, ms
 */
export function dayStart(ms, days = 0) {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

const atMidnight = ms => dayStart(ms) === ms;

/**
 * @param {object} e  an event
 * @returns {boolean} it fills whole days: starts and ends at local midnight (an all-day
 *   event, as the date menu reads one: `_formatEventTime`)
 */
export function isAllDay(e) {
    return e.end > e.start && atMidnight(e.start) && atMidnight(e.end);
}

/**
 * @param {*} list  events.js's list
 * @returns {object[]} the valid ones (numbers for times, end not before start), a title
 *   always ("Untitled event" for none), sorted by start then end
 */
export function normalise(list) {
    return (Array.isArray(list) ? list : [])
        .filter(e => e && isNum(e.start) && isNum(e.end) && e.end >= e.start)
        .map(e => ({
            id: String(e.id ?? ''),
            title: str(e.title).replace(/\s+/g, ' ') || 'Untitled event',
            start: e.start, end: e.end,
            startText: str(e.startText), endText: str(e.endText),
        }))
        .sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * The event the idle pill shows (SPEC §2a): one starting within 30 min comes first, then
 * one running now (the one ending first), then the next one later today; with none of
 * those, an all-day event of today. Events of other days never.
 *
 * @param {*} events  events.js's list
 * @param {number} now  ms
 * @param {object} [opts]
 * @param {boolean} [opts.allDay]  `idle-calendar-all-day`: an all-day event when nothing
 *   timed is left (true by default)
 * @returns {?{event: object, when: 'soon'|'now'|'later'|'allday'}}
 */
export function nextEvent(events, now, {allDay = true} = {}) {
    const today = dayStart(now), tomorrow = dayStart(now, 1);
    const list = normalise(events).filter(e => e.start < tomorrow && e.end > today);
    const timed = list.filter(e => !isAllDay(e));
    const upcoming = timed.find(e => e.start > now);
    if (upcoming && upcoming.start - now <= SOON)
        return {event: upcoming, when: 'soon'};
    const running = timed.filter(e => e.start <= now && e.end > now).sort((a, b) => a.end - b.end)[0];
    if (running)
        return {event: running, when: 'now'};
    if (upcoming)
        return {event: upcoming, when: 'later'};
    const day = allDay ? list.find(isAllDay) : null;
    return day ? {event: day, when: 'allday'} : null;
}

/**
 * `auto` (SPEC §2a-iii): starts within 30 min 90 (holds), running now 80, within 2 h 50,
 * later today 25 (an all-day one too); nothing today → null.
 *
 * @param {object} [ctx]
 * @param {Date} [ctx.now]
 * @param {?object} [ctx.data]  the feed's state {hasCalendars, events}
 * @param {object} [opts]  the plan's keys' values (`idle-calendar-all-day`)
 * @returns {?{score: number}}
 */
export function relevance({now, data} = {}, opts = {}) {
    const t = now instanceof Date ? now.getTime() : Date.now();
    const next = nextEvent(data?.events, t, {allDay: opts['idle-calendar-all-day'] !== false});
    if (!next)
        return null;
    if (next.when === 'soon')
        return {score: 90};
    if (next.when === 'now')
        return {score: 80};
    if (next.when === 'later' && next.event.start - t <= 2 * HOUR)
        return {score: 50};
    return {score: 25};
}

/**
 * @param {{event: object, when: string}} next  nextEvent's
 * @returns {string} the idle pill's time: "3:00 PM", "until 4:00 PM", "all day"
 */
export function whenText({event, when}) {
    if (when === 'allday')
        return 'all day';
    if (when === 'now')
        return event.endText ? `until ${event.endText}` : 'now';
    return event.startText;
}

/**
 * @param {number} ms  a span, ≥ 0
 * @returns {string} "1 min", "25 min", "1 h", "1 h 20 min"
 */
export function spanText(ms) {
    const total = Math.max(1, Math.round(ms / MIN));
    const h = Math.floor(total / 60), m = total % 60;
    if (!h)
        return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * @param {{event: object, when: string}} next  nextEvent's
 * @param {number} now  ms
 * @returns {?string} the compact's "in 25 min", "ends in 15 min"; null for an all-day one
 */
export function relativeText({event, when}, now) {
    if (when === 'soon' || when === 'later')
        return `in ${spanText(event.start - now)}`;
    if (when === 'now')
        return `ends in ${spanText(event.end - now)}`;
    return null;
}

/**
 * An event's time on a given day's row (the tab): "All day", "3:00 PM – 4:00 PM", "Until
 * 2:00 AM" (began the day before), "From 11:00 PM" (goes on past midnight), "3:00 PM" (no
 * length).
 *
 * @param {object} e  a normalised event
 * @param {number} day  that day's local midnight, ms
 * @returns {string}
 */
export function rangeText(e, day) {
    const next = dayStart(day, 1);
    const before = e.start < day, after = e.end > next;
    if (isAllDay(e) || (before && after))
        return 'All day';
    if (before)
        return `Until ${e.endText}`;
    if (after)
        return `From ${e.startText}`;
    if (e.end === e.start || !e.endText)
        return e.startText;
    return `${e.startText} – ${e.endText}`;
}

/**
 * A row's second line in the tab: "3:00 PM · 45 min"; "All day"; across midnight its
 * range for that day ("Until 2:00 AM", "From 11:00 PM"); running "Now · until 4:00 PM".
 *
 * @param {object} row  a dayRows row
 * @returns {string}
 */
export function detailText(row) {
    if (row.now && !row.allDay && row.endText)
        return `Now · until ${row.endText}`;
    if (row.allDay || row.time !== `${row.startText} – ${row.endText}`)
        return row.time;
    return `${row.startText} · ${spanText(row.end - row.start)}`;
}

/**
 * @param {number} day  a local midnight, ms
 * @param {number} now  ms
 * @returns {string} "Today", "Tomorrow", else the weekday ("Wednesday"): the tab looks a
 *   week ahead, so a weekday names one day
 */
export function dayLabel(day, now) {
    const diff = Math.round((day - dayStart(now)) / (24 * HOUR));
    if (diff === 0)
        return 'Today';
    if (diff === 1)
        return 'Tomorrow';
    return DAYS[new Date(day).getDay()];
}

/**
 * One day's rows (the tab's list for a picked day): every event that touches the day,
 * all-day ones first (as the date menu sorts them), then by start.
 *
 * @param {*} events  events.js's list
 * @param {number} day  that day's local midnight, ms
 * @param {number} now  ms
 * @returns {object[]} the event plus {allDay, past, now, time}
 */
export function dayRows(events, day, now) {
    const next = dayStart(day, 1);
    return normalise(events)
        .filter(e => e.start < next && (e.end > day || (e.end === e.start && e.start >= day)))
        .map(e => ({
            ...e, allDay: isAllDay(e) || (e.start < day && e.end > next),
            past: e.end <= now && e.end > e.start, now: e.start <= now && e.end > now && !isAllDay(e),
            time: rangeText(e, day),
        }))
        .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
}

/**
 * The Calendar tab (SPEC §3 "Up next"): today's events — every one, the ones already over
 * marked `past`, the running ones `now` — then the next six days that have any, each a
 * group under its label. An event over several days is listed on each.
 *
 * @param {*} events  events.js's list
 * @param {number} now  ms
 * @returns {{today: object[], upcoming: {day: number, label: string, events: object[]}[]}}
 *   rows: the event plus {allDay, past, now, time} (time: rangeText for that day)
 */
export function agenda(events, now) {
    const list = normalise(events);
    const rows = day => dayRows(list, day, now);
    const today = dayStart(now);
    const upcoming = [];
    for (let i = 1; i < HORIZON_DAYS; i++) {
        const day = dayStart(now, i);
        const ofDay = rows(day);
        if (ofDay.length)
            upcoming.push({day, label: dayLabel(day, now), events: ofDay});
    }
    return {today: rows(today), upcoming};
}

/** Home's Up next: at most this many events (SPEC §3, 2026-11-08). */
export const UP_NEXT_MAX = 3;
/** An event starting this close says how far away it is ("in 25 min"). */
export const NEAR = 2 * HOUR;

/**
 * An Up next row's second line: "3:00 PM · in 25 min" when it starts within 2 h, else as
 * the tab's (detailText): "Now · until 4:00 PM", "5:30 PM · 45 min", "All day",
 * "From 11:00 PM".
 *
 * @param {object} row  a dayRows row
 * @param {number} now  ms
 * @returns {string}
 */
export function upNextDetail(row, now) {
    if (!row.allDay && !row.now && row.start > now && row.start - now <= NEAR && row.startText)
        return `${row.startText} · in ${spanText(row.start - now)}`;
    return detailText(row);
}

/**
 * Home's Up next (SPEC §3, 2026-11-08): what is left of today — the timed events running
 * or still to come, by start, then the all-day ones — at most `max`; the ones already over
 * are left out (the Calendar tab keeps them). Nothing left → no rows, and Home leaves the
 * block out.
 *
 * @param {*} events  events.js's list
 * @param {number} now  ms
 * @param {object} [opts]
 * @param {number} [opts.max]  at most this many rows
 * @returns {{rows: object[], more: number}} rows: dayRows' plus `detail` (upNextDetail);
 *   more: how many were left out
 */
export function upNext(events, now, {max = UP_NEXT_MAX} = {}) {
    const left = dayRows(events, dayStart(now), now)
        .filter(r => !r.past && !(r.end === r.start && r.start < now));
    const all = [...left.filter(r => !r.allDay), ...left.filter(r => r.allDay)];
    const n = Math.max(0, Math.floor(max));
    return {
        rows: all.slice(0, n).map(r => ({...r, detail: upNextDetail(r, now)})),
        more: Math.max(0, all.length - n),
    };
}

/**
 * Home's Up next tile (design/home, 2026-11-11): the next row's time as the value — "Now"
 * while it runs, "All day", else its start ("3:00 PM") — and its title as the caption.
 *
 * @param {?object} row  an upNext row
 * @returns {?{value: string, caption: string}}
 */
export function upNextTile(row) {
    if (!row)
        return null;
    let value = row.startText || '';
    if (row.allDay)
        value = 'All day';
    else if (row.now)
        value = 'Now';
    return {value, caption: row.title || ''};
}
