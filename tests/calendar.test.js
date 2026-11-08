// Run: gjs -m tests/calendar.test.js   (no Shell needed: agenda.js and idle.js are pure)
import {
    HORIZON_DAYS, SOON, dayStart, isAllDay, normalise, nextEvent, relevance, whenText, spanText, relativeText,
    rangeText, dayLabel, agenda, dayRows, detailText, upNext, upNextDetail, UP_NEXT_MAX, NEAR,
} from '../src/buoy@murilegus/lib/modules/calendar/agenda.js';
import {monthDays, weekdayInitials, monthTitle, stepDay, pickedTitle, isWeekend} from '../src/buoy@murilegus/lib/modules/calendar/month.js';
import plan, {present, ICON, keys, ticks} from '../src/buoy@murilegus/lib/modules/calendar/idle.js';
import {planIdle} from '../src/buoy@murilegus/lib/kit/presentation.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const MIN = 60 * 1000;
// Wednesday 2026-11-11, local time
const at = (h, m = 0, day = 11) => new Date(2026, 10, day, h, m).getTime();
const ev = (id, start, end, extra = {}) => ({
    id, title: id, start, end,
    startText: new Date(start).toTimeString().slice(0, 5), endText: new Date(end).toTimeString().slice(0, 5), ...extra,
});
const allDay = (id, day, days = 1) => ev(id, at(0, 0, day), at(0, 0, day + days));

// --- days and all-day --------------------------------------------------------------------
eq(dayStart(at(15, 30)), at(0), 'midnight of the day');
eq(dayStart(at(15, 30), 1), at(0, 0, 12), 'the next day');
eq(dayStart(new Date(2026, 9, 25, 12).getTime(), 1), new Date(2026, 9, 26).getTime(), 'a local date step (DST-safe)');
eq([isAllDay(allDay('h', 11)), isAllDay(allDay('h', 11, 3)), isAllDay(ev('x', at(0), at(10)))], [true, true, false],
    'all-day: midnight to midnight, one day or several');
eq(isAllDay(ev('z', at(0), at(0))), false, 'zero length at midnight: not all-day');

// --- normalise: what events.js may hand over -----------------------------------------------
{
    const n = normalise([
        ev('b', at(14), at(15)), ev('a', at(9), at(10)), {id: 'bad', start: 'x', end: 1},
        {id: 'neg', start: at(10), end: at(9)}, null, ev('', at(8), at(9), {title: '  \n '}),
        ev('long', at(11), at(12), {title: 'x'.repeat(500)}),
    ]);
    eq(n.map(e => e.title.length > 20 ? 'long' : e.title), ['Untitled event', 'a', 'long', 'b'],
        'invalid dropped, sorted by start, an empty title named, a long one kept whole');
    eq(normalise('nope'), [], 'not a list: none');
    eq(normalise([ev('w', at(9), at(10), {title: 'a\n\tb'})])[0].title, 'a b', 'whitespace on one line');
}

// --- the idle pill's event ----------------------------------------------------------------
{
    const day = [allDay('holiday', 11), ev('standup', at(9), at(9, 15)), ev('review', at(15), at(16)), ev('gym', at(17, 30), at(18, 15))];
    eq(nextEvent(day, at(8)), {event: normalise(day)[1], when: 'later'}, 'morning: the first timed one, later');
    eq(nextEvent(day, at(8, 40)).when, 'soon', '20 min before: soon');
    eq(nextEvent(day, at(8, 30)).when, 'soon', 'exactly 30 min before: soon');
    eq(nextEvent(day, at(8, 29)).when, 'later', '31 min before: later');
    eq([nextEvent(day, at(9, 5)).event.id, nextEvent(day, at(9, 5)).when], ['standup', 'now'], 'running: now');
    eq(nextEvent(day, at(9, 15)).event.id, 'review', 'ended at its end: the next one');
    const clash = [ev('long', at(14), at(17)), ev('review', at(15), at(16))];
    eq([nextEvent(clash, at(14, 40)).event.id, nextEvent(clash, at(14, 40)).when], ['review', 'soon'],
        'one soon beats one running (90 over 80)');
    eq(nextEvent(clash, at(15, 10)).event.id, 'review', 'two running: the one ending first');
    eq(nextEvent(day, at(19)), {event: normalise(day)[0], when: 'allday'}, 'evening, timed ones over: the all-day one');
    eq(nextEvent(day, at(19), {allDay: false}), null, 'All-day events off: nothing then');
    eq(nextEvent(day, at(8), {allDay: false}).event.id, 'standup', 'All-day events off: timed ones as before');
    eq(nextEvent([ev('tomorrow', at(9, 0, 12), at(10, 0, 12))], at(23, 50)), null, 'tomorrow\'s, even 70 min away: none');
    eq(nextEvent([ev('late', at(22, 0, 10), at(1, 0, 11))], at(0, 30)).when, 'now', 'from yesterday into today: running now');
    eq(nextEvent([], at(9)), null, 'nothing: none');
    eq(nextEvent(undefined, at(9)), null, 'no list: none');
}

// --- relevance (SPEC §2a-iii) --------------------------------------------------------------
{
    const data = {hasCalendars: true, events: [ev('a', at(15), at(16)), ev('b', at(20), at(21))]};
    const r = h => relevance({now: new Date(h), data})?.score ?? null;
    eq([r(at(14, 40)), r(at(15, 30)), r(at(13, 30)), r(at(16, 30)), r(at(21, 30))], [90, 80, 50, 25, null],
        'soon 90 · running 80 · within 2 h 50 · later today 25 · nothing left null');
    eq(relevance({now: new Date(at(18, 1)), data: {events: [ev('c', at(20), at(21))]}}).score, 50, 'exactly 2 h: 50');
    eq(relevance({now: new Date(at(10)), data: {events: [allDay('h', 11)]}}).score, 25, 'only an all-day one: 25');
    eq(relevance({now: new Date(at(10)), data: {events: [allDay('h', 11)]}}, {'idle-calendar-all-day': false}), null,
        'All-day events off: an all-day one alone is nothing');
    eq(relevance({now: new Date(at(10)), data: null}), null, 'no data: null');
}

// --- words ---------------------------------------------------------------------------------
{
    const e = normalise([ev('r', at(15), at(16), {startText: '3:00 PM', endText: '4:00 PM'})])[0];
    eq([whenText({event: e, when: 'soon'}), whenText({event: e, when: 'later'}), whenText({event: e, when: 'now'}),
        whenText({event: e, when: 'allday'})], ['3:00 PM', '3:00 PM', 'until 4:00 PM', 'all day'], 'the pill\'s time');
    eq(whenText({event: {...e, endText: ''}, when: 'now'}), 'now', 'running with no end text: now');
    eq([spanText(0), spanText(MIN), spanText(25 * MIN), spanText(60 * MIN), spanText(80 * MIN), spanText(150 * MIN)],
        ['1 min', '1 min', '25 min', '1 h', '1 h 20 min', '2 h 30 min'], 'spans');
    eq([relativeText({event: e, when: 'soon'}, at(14, 35)), relativeText({event: e, when: 'now'}, at(15, 45)),
        relativeText({event: e, when: 'allday'}, at(9))], ['in 25 min', 'ends in 15 min', null], 'relative');
    eq(rangeText(e, at(0)), '3:00 PM – 4:00 PM', 'a range');
    eq(rangeText({...e, end: e.start}, at(0)), '3:00 PM', 'no length: the start');
    eq(rangeText(normalise([allDay('h', 11)])[0], at(0)), 'All day', 'all-day');
    const late = normalise([ev('late', at(23, 0, 10), at(2, 0, 11), {startText: '11:00 PM', endText: '2:00 AM'})])[0];
    eq([rangeText(late, at(0, 0, 10)), rangeText(late, at(0, 0, 11))], ['From 11:00 PM', 'Until 2:00 AM'],
        'past midnight: from on its first day, until on the next');
    const trip = normalise([ev('trip', at(9, 0, 10), at(18, 0, 12))])[0];
    eq(rangeText(trip, at(0, 0, 11)), 'All day', 'a day in the middle of a longer one: all day');
    eq([dayLabel(at(0), at(9)), dayLabel(at(0, 0, 12), at(9)), dayLabel(at(0, 0, 13), at(9)), dayLabel(at(0, 0, 17), at(9))],
        ['Today', 'Tomorrow', 'Friday', 'Tuesday'], 'day labels');
}

// --- the tab's agenda -------------------------------------------------------------------
{
    const list = [
        ev('standup', at(9), at(9, 15)), ev('review', at(15), at(16)), allDay('holiday', 11),
        ev('fri', at(10, 0, 13), at(11, 0, 13)), ev('trip', at(9, 0, 14), at(18, 0, 15)),
        ev('far', at(9, 0, 18), at(10, 0, 18)), ev('past-week', at(9, 0, 4), at(10, 0, 4)),
    ];
    const a = agenda(list, at(15, 30));
    eq(a.today.map(e => e.id), ['holiday', 'standup', 'review'], 'today: all-day first, then by time');
    eq(a.today.map(e => [e.past, e.now]), [[false, false], [true, false], [false, true]], 'over: past; running: now');
    eq(a.upcoming.map(g => g.label), ['Friday', 'Saturday', 'Sunday'], 'the week\'s days that have any, by name');
    eq(a.upcoming[1].events[0].time, 'From 09:00', 'a two-day event on its first day');
    eq(a.upcoming[2].events.map(e => [e.id, e.allDay]), [['trip', false]], 'and on its last');
    eq(a.upcoming.some(g => g.events.some(e => e.id === 'far')), false, `beyond ${HORIZON_DAYS} days: not listed`);
    eq(agenda([], at(9)), {today: [], upcoming: []}, 'nothing: empty');
    eq(agenda([ev('t', at(9, 0, 12), at(10, 0, 12))], at(9)).today, [], 'nothing today, tomorrow listed');
    eq(SOON, 30 * MIN, 'soon is 30 min');
}

// --- one picked day, and its rows' second line -------------------------------------------
{
    const list = [ev('review', at(15), at(15, 45), {startText: '3:00 PM', endText: '3:45 PM'}), allDay('holiday', 12),
        ev('late', at(23, 0, 12), at(2, 0, 13), {startText: '11:00 PM', endText: '2:00 AM'}), ev('dot', at(9), at(9))];
    eq(dayRows(list, at(0, 0, 12), at(9)).map(e => e.id), ['holiday', 'late'], 'a picked day: all-day first, then by time');
    const today = dayRows(list, at(0), at(15, 10));
    eq(today.map(e => detailText(e)), ['9:00', 'Now · until 3:45 PM'].map((t, i) => i ? t : today[0].startText),
        'no length: the start; running: until its end');
    eq(detailText(dayRows(list, at(0), at(9, 30))[1]), '3:00 PM · 45 min', 'start · how long');
    eq(detailText(dayRows(list, at(0, 0, 12), at(9))[0]), 'All day', 'all-day');
    eq(detailText(dayRows(list, at(0, 0, 13), at(9))[0]), 'Until 2:00 AM', 'past midnight: its range for that day');
}

// --- the month ------------------------------------------------------------------------------
{
    const sun = monthDays(2026, 10, {weekStart: 0});
    eq(sun.length, 42, 'six weeks');
    eq([new Date(sun[0].day).getDay(), sun[0].date, sun[0].inMonth], [0, 1, true], 'Nov 2026 starts on a Sunday: no lead-in');
    eq(sun.filter(d => d.inMonth).length, 30, 'thirty days in the month');
    eq([sun[30].date, sun[30].inMonth, sun[41].date], [1, false, 12], 'then December\'s first days');
    const mon = monthDays(2026, 10, {weekStart: 1});
    eq([mon[0].date, mon[0].inMonth, mon[6].date], [26, false, 1], 'Monday first: Oct 26–31 lead in');
    eq(monthDays(2026, 10, {weekStart: 9})[0].date, 1, 'a bad week start: Sunday');
    eq(new Set(sun.map(d => d.day)).size, 42, 'no day twice');
    const march = monthDays(2026, 2, {weekStart: 1});
    eq(march.every(d => new Date(d.day).getHours() === 0), true, 'DST spring: every day at local midnight');
    eq(march.filter(d => d.inMonth).map(d => d.date).join(), Array.from({length: 31}, (_, i) => i + 1).join(), 'March: 1–31, DST or not');
    eq([weekdayInitials(0).join(''), weekdayInitials(1).join(''), weekdayInitials(6).join('')], ['SMTWTFS', 'MTWTFSS', 'SSMTWTF'],
        'column heads from the week start');
    eq([monthTitle(2026, 10), monthTitle(2027, 0)], [{month: 'November', year: '2026'}, {month: 'January', year: '2027'}],
        'month titles: the name and the year apart');
    eq([at(0, 0, 7), at(0, 0, 8), at(0, 0, 9)].map(isWeekend), [true, true, false], 'Saturday and Sunday are the weekend');
    const d = (y, m, n) => new Date(y, m, n).getTime();
    eq([stepDay(d(2026, 10, 9), 1), stepDay(d(2026, 10, 9), -1)], [d(2026, 11, 9), d(2026, 9, 9)], '‹ ›: the same date a month away');
    eq([stepDay(d(2026, 0, 31), 1), stepDay(d(2028, 0, 31), 1), stepDay(d(2026, 2, 31), -1)],
        [d(2026, 1, 28), d(2028, 1, 29), d(2026, 1, 28)], 'a shorter month: its last day (leap years too)');
    eq([stepDay(d(2026, 11, 15), 1), stepDay(d(2026, 0, 15), -1)], [d(2027, 0, 15), d(2025, 11, 15)], 'across the year');
    eq([pickedTitle(at(0), at(9)), pickedTitle(at(0, 0, 12), at(9)), pickedTitle(at(0, 0, 10), at(9)), pickedTitle(at(0, 0, 18), at(9))],
        ['Today, 11 November', 'Tomorrow, 12 November', 'Yesterday, 10 November', 'Wednesday, 18 November'], 'the list\'s title');
    eq(pickedTitle(new Date(2027, 0, 4).getTime(), at(9)), 'Monday, 4 January 2027', 'another year: with it');
}

// --- the plan ----------------------------------------------------------------------------
{
    eq([keys, ticks, plan.present === present, typeof plan.relevance], [['idle-calendar-all-day'], true, true, 'function'],
        'its key All-day events, the minute clock, present and relevance');
    const data = {hasCalendars: true, events: [ev('Design review', at(15), at(16), {startText: '3:00 PM', endText: '4:00 PM'})]};
    const p = present({now: new Date(at(14, 35)), data});
    eq([p.leading, p.text, p.trailing], [ICON, 'Design review', {text: '3:00 PM'}],
        'the icon, the title, the time at the end (a long title ellipsizes, the time stays)');
    eq(p.compact, {leading: ICON, text: 'Design review', subtitle: '3:00 PM – 4:00 PM · in 25 min'}, 'compact');
    eq(p.accessibleName, 'Design review, 3:00 PM – 4:00 PM, in 25 min', 'accessible name');
    eq(present({now: new Date(at(15, 20)), data}).trailing, {text: 'until 4:00 PM'}, 'running: until its end');
    eq(present({now: new Date(at(16, 1)), data}), null, 'over and nothing else today: null (only the light)');
    eq(present({now: new Date(at(9)), data: {hasCalendars: false, events: []}}), null, 'no calendars: null');
    eq(present({}), null, 'no ctx: null');
    const holiday = {hasCalendars: true, events: [allDay('Holiday', 11)]};
    eq([present({now: new Date(at(10)), data: holiday}).trailing, present({now: new Date(at(10)), data: holiday}, {'idle-calendar-all-day': false})],
        [{text: 'all day'}, null], 'All-day events: shown by default, off leaves the pill to the light');
    const idle = planIdle({light: 'off', plan: p});
    eq([idle.leading.type, idle.text, idle.trailing?.text ?? idle.trailing], ['icon', 'Design review', '3:00 PM'],
        'the kit draws it as an idle plan');
    eq(Object.keys(p).filter(k => /size|width|height/i.test(k)), [], 'no measurements');
}

// --- Home's Up next (2026-11-08) -----------------------------------------------------------
{
    const now = at(14, 35);
    const list = [
        ev('standup', at(9), at(9, 15)),              // over
        ev('review', at(15), at(16)),                 // in 25 min
        allDay('holiday', 11),
        ev('gym', at(17, 30), at(18, 15)),            // later, 45 min
        ev('call', at(14), at(15)),                   // running
        ev('late', at(23), at(1, 0, 12)),             // goes past midnight
        ev('tomorrow', at(9, 0, 12), at(10, 0, 12)),  // another day
    ];
    const up = upNext(list, now, {max: 10});
    eq(up.rows.map(r => r.id), ['call', 'review', 'gym', 'late', 'holiday'],
        'Up next: running and coming timed events by start, then all-day; over and other days out');
    eq(up.more, 0, 'Up next: nothing left out under the cap');
    eq(up.rows.map(r => r.detail), ['Now · until 15:00', '15:00 · in 25 min', '17:30 · 45 min', 'From 23:00', 'All day'],
        'Up next: each row\'s second line');
    const capped = upNext(list, now);
    eq([capped.rows.length, capped.more, UP_NEXT_MAX], [3, 2, 3], 'Up next: at most 3, the rest counted');
    eq(capped.rows.map(r => r.id), ['call', 'review', 'gym'], 'Up next: the cap keeps the soonest');
    eq(upNext(list, now, {max: 0}), {rows: [], more: 5}, 'Up next: max 0 → no rows');
    eq(upNext(list, now, {max: 1.7}).rows.length, 1, 'Up next: a fractional max is floored');
    eq(upNext([], now), {rows: [], more: 0}, 'Up next: no events → nothing (Home leaves the block out)');
    eq(upNext(undefined, now), {rows: [], more: 0}, 'Up next: no list → nothing');
    eq(upNext([ev('standup', at(9), at(9, 15))], now).rows, [], 'Up next: only events already over → nothing');
    eq(upNext([ev('ping', at(10), at(10))], now).rows, [], 'Up next: a zero-length event already past → out');
    eq(upNext([ev('ping', at(16), at(16))], now).rows.map(r => r.detail), ['16:00 · in 1 h 25 min'],
        'Up next: a zero-length event to come stays, with how far away');
    eq(upNext([ev('x', at(17), at(18))], now).rows[0].detail, '17:00 · 1 h', 'Up next: beyond 2 h → its length, not how far');
    eq(upNext([ev('x', at(16, 35), at(17))], now).rows[0].detail, '16:35 · in 2 h', 'Up next: exactly 2 h away still says how far');
    eq(upNext([ev('y', at(22), at(3, 0, 12))], at(23)).rows[0].detail, 'Now · until 03:00',
        'Up next: running past midnight → until its end, as the tab says');
    eq(upNext([ev('y', at(22), at(3, 0, 12))], at(19)).rows[0].detail, 'From 22:00',
        'Up next: to come and past midnight → its range for today');
    eq(upNext([ev('z', at(20, 0, 10), at(16))], now).rows[0].detail, 'Now · until 16:00',
        'Up next: began yesterday, running → until its end');
    const long = 'A very long meeting title that goes on and on past any width the block could give it';
    eq(upNext([ev('l', at(15), at(16), {title: long})], now).rows[0].title, long, 'Up next: a long title is kept whole (the block ellipsizes)');
    eq(upNext([ev('u', at(15), at(16), {title: '  '})], now).rows[0].title, 'Untitled event', 'Up next: no title → Untitled event');
    eq(upNextDetail({allDay: false, now: false, start: at(15), end: at(16), startText: '', endText: '', time: ''}, now), '',
        'Up next: no start text → the tab\'s line, never "· in"');
    eq(NEAR, 2 * 60 * MIN, 'Up next: near is 2 h');
}

print('calendar: ok');
