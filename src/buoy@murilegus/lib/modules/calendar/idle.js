/**
 * The next-event idle plan (SPEC §2a `next-event`, FEATURES M3 "calendar"): the calendar
 * icon, the event's title, its time at the end so a long title ellipsizes and the time
 * stays. Its compact (hover): the title over its times and how far away it is. Presentation
 * only, pure: feed.js reads the date menu's event source into `ctx.data`
 * ({hasCalendars, events}, agenda.js), and the kit's wall clock re-presents on the minute,
 * so an event that starts or ends changes the pill at that minute (one transition, §5).
 *
 * Nothing today (or no calendars) → null: the pill keeps only the light, as with Show set
 * to nothing. No Join glyph: Shell's calendar server sends only id, title and times
 * (FEATURES M4 "Meeting in 5 min · Join").
 */

import {nextEvent, whenText, relativeText, rangeText, dayStart, relevance} from './agenda.js';

export const ICON = 'x-office-calendar-symbolic';

/** No keys of its own (ARCHITECTURE rule 9: nothing to show under it on the Island page). */
export const keys = Object.freeze([]);

/** The wall clock's minute: an event starting or ending changes what the pill says. */
export const ticks = true;

/**
 * @param {object} ctx
 * @param {Date} ctx.now
 * @param {?object} ctx.data  the feed's state {hasCalendars, events}
 * @returns {?object} {leading, text, trailing, compact, accessibleName}; null with nothing
 *   to show today
 */
export function present({now, data} = {}) {
    const t = now instanceof Date ? now.getTime() : Date.now();
    const next = nextEvent(data?.events, t);
    if (!next)
        return null;
    const {event} = next;
    const when = whenText(next);
    const relative = relativeText(next, t);
    const range = rangeText(event, dayStart(t));
    return {
        leading: ICON,
        text: event.title,
        trailing: when ? {text: when} : null,
        compact: {
            leading: ICON,
            text: event.title,
            subtitle: [range, relative].filter(Boolean).join(' · ') || null,
        },
        accessibleName: [event.title, range, relative].filter(Boolean).join(', '),
    };
}

export {relevance};

export default {keys, ticks, present, relevance};
