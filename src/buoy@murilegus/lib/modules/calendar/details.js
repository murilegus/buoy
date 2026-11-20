/**
 * An event's page in the Calendar tab (FEATURES M4 "Event details in the Calendar tab"; design/tabs
 * "Chi tiết sự kiện", 2026-11-20, Ethan, after Google Calendar's), pure: what its iCalendar says
 * (read from EDS, eds.js readEvent), and the calendars' names and colours (EDS's sources, eds.js
 * readCalendars). No St: tab.js draws it.
 */
import {isAllDay, rangeText, dayStart} from './agenda.js';
import {pickedTitle} from './month.js';
import {meetingLink} from './meeting.js';
import {keyFile, parseEvent, unescapeText} from './ical.js';

// --- the calendars ---------------------------------------------------------------------------------

/**
 * @param {*} color  EDS's `Color`: #rgb, #rrggbb or #rrrrggggbbbb (GdkRGBA's to_string)
 * @returns {?string} #rrggbb, or null
 */
export function hexColour(color) {
    const c = typeof color === 'string' ? color.trim().toLowerCase() : '';
    let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c);
    if (m)
        return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
    if (/^#[0-9a-f]{6}$/.test(c))
        return c;
    m = /^#([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})$/.exec(c);
    if (m)
        return `#${m[1].slice(0, 2)}${m[2].slice(0, 2)}${m[3].slice(0, 2)}`;
    m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    if (m)
        return `#${[m[1], m[2], m[3]].map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
    return null;
}

/**
 * @param {*} sources  [{uid, data}]: EDS's sources
 * @returns {Map<string, {name: string, color: ?string}>} each calendar's name and colour (its
 *   [Calendar] `Color`, as GNOME Calendar and Evolution draw it)
 */
export function calendarsOf(sources) {
    const out = new Map();
    for (const s of Array.isArray(sources) ? sources : []) {
        if (!s || typeof s.uid !== 'string' || !s.uid)
            continue;
        const k = keyFile(s.data);
        const cal = k['Calendar'];
        if (!cal)
            continue;
        out.set(s.uid, {name: k['Data Source']?.DisplayName ?? '', color: hexColour(cal.Color)});
    }
    return out;
}

// --- the page --------------------------------------------------------------------------------------

/**
 * Google writes its own block into the description: the meeting link, the phone numbers, "Learn
 * more about Meet", between lines of "-::~:~::~…" (Google Calendar's CalDAV). Only what the user
 * wrote is the event's description.
 *
 * @param {*} text  the DESCRIPTION, unescaped
 * @returns {string} the user's own text, trimmed; blank lines no more than one
 */
export function ownDescription(text) {
    if (typeof text !== 'string')
        return '';
    const lines = text.split(/\r?\n/);
    const marks = lines.map((l, i) => /^-::~[:~]+:?-?\s*$/.test(l.trim()) ? i : -1).filter(i => i >= 0);
    let kept = lines;
    if (marks.length >= 2)
        kept = [...lines.slice(0, marks[0]), ...lines.slice(marks.at(-1) + 1)];
    else if (marks.length === 1)
        kept = lines.slice(0, marks[0]);
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The description's most lines on the page (design/tabs "Chi tiết sự kiện"). */
export const DESCRIPTION_LINES = 6;

/**
 * @param {string} text
 * @param {number} max
 * @returns {string} its first `max` lines, "…" after the last when there were more
 */
export function clampLines(text, max) {
    const lines = text.split('\n');
    return lines.length > max ? `${lines.slice(0, max).join('\n')}…` : text;
}

/**
 * @param {string} text  a description
 * @param {?string} [url]  the meeting's link: Join says it
 * @returns {string} without the lines that only carry it ("Join with Google Meet: …", "Join
 *   Zoom Meeting\nhttps://…"), as Google's own block
 */
export function withoutLink(text, url) {
    if (!url)
        return text;
    return text.split('\n').filter(l => !l.includes(url)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const mail = v => (typeof v === 'string' ? v.replace(/^mailto:/i, '') : '').trim();
const STATUS = {ACCEPTED: 'yes', DECLINED: 'no', TENTATIVE: 'maybe'};

/**
 * @param {object[]} props  parseEvent's
 * @returns {{people: {email: string, name: string, status: string, organizer: boolean}[],
 *   count: number, line: string}} the guests, the organizer first; `line` "2 yes, 1 awaiting"
 */
export function guestsOf(props) {
    const organizer = props.find(p => p.name === 'ORGANIZER');
    const orgMail = mail(organizer?.value).toLowerCase();
    const named = (email, cn) => {
        const n = typeof cn === 'string' ? cn.trim() : '';
        // Google sends the address as the name (CN): no name then
        return n && n.toLowerCase() !== email.toLowerCase() ? n : '';
    };
    const people = props.filter(p => p.name === 'ATTENDEE' && mail(p.value)).map(p => {
        const email = mail(p.value);
        return {
            email, name: named(email, p.params.CN), status: STATUS[(p.params.PARTSTAT ?? '').toUpperCase()] ?? 'awaiting',
            organizer: email.toLowerCase() === orgMail,
        };
    });
    if (orgMail && people.length && !people.some(p => p.organizer))
        people.unshift({email: mail(organizer.value), name: named(mail(organizer.value), organizer.params.CN), status: 'yes', organizer: true});
    people.sort((a, b) => Number(b.organizer) - Number(a.organizer));
    const counts = ['yes', 'no', 'maybe', 'awaiting'].map(s => [s, people.filter(p => p.status === s).length]).filter(([, n]) => n);
    return {people, count: people.length, line: counts.map(([s, n]) => `${n} ${s}`).join(', ')};
}

/**
 * @param {*} trigger  a VALARM's TRIGGER relative to the start (-PT10M, -P1D, PT0S)
 * @returns {?string} "10 minutes before", "1 hour before", "1 day before", "At the start"; null
 *   for one at an absolute time or after the start
 */
export function reminderText(trigger) {
    const m = typeof trigger === 'string' ? /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(trigger.trim()) : null;
    if (!m)
        return null;
    const minutes = ((Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * 24 + Number(m[4] ?? 0)) * 60 + Number(m[5] ?? 0);
    if (!minutes)
        return 'At the start';
    if (!m[1])
        return null;
    const unit = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    if (minutes % (7 * 24 * 60) === 0)
        return `${unit(minutes / (7 * 24 * 60), 'week')} before`;
    if (minutes % (24 * 60) === 0)
        return `${unit(minutes / (24 * 60), 'day')} before`;
    if (minutes % 60 === 0)
        return `${unit(minutes / 60, 'hour')} before`;
    return `${unit(minutes, 'minute')} before`;
}

/**
 * The page (design/tabs "Chi tiết sự kiện"): each part only when the event has it.
 *
 * @param {object} e  the list's event (agenda.js: title, start, end, startText, endText)
 * @param {?string} ics  its iCalendar, or null (not read: the head alone)
 * @param {number} now  ms
 * @returns {{title: string, when: string, place: string, description: string,
 *   guests: ?ReturnType<typeof guestsOf>, reminders: string[]}}
 */
export function eventPage(e, ics, now) {
    const {props, alarms} = parseEvent(ics);
    const text = name => unescapeText(props.find(p => p.name === name)?.value ?? '').trim();
    const day = dayStart(e.start);
    const when = `${pickedTitle(day, now)} · ${isAllDay(e) ? 'All day' : rangeText(e, day)}`;
    const place = text('LOCATION').replace(/\s+/g, ' ');
    const guests = guestsOf(props);
    const reminders = [...new Set(alarms
        .map(a => a.find(p => p.name === 'TRIGGER'))
        .filter(t => t && (t.params.RELATED ?? 'START').toUpperCase() === 'START' && !t.params.VALUE)
        .map(t => reminderText(t.value)).filter(Boolean))];
    return {
        title: text('SUMMARY').replace(/\s+/g, ' ') || e.title,
        when,
        // a meeting's link is not a place
        place: /^https?:\/\//i.test(place) ? '' : place,
        description: clampLines(withoutLink(ownDescription(text('DESCRIPTION')), meetingLink(ics)?.url), DESCRIPTION_LINES),
        guests: guests.count ? guests : null,
        reminders,
    };
}
