// Run: gjs -m tests/meeting.test.js   (pure: FEATURES M4 "Meeting in 5 min · Join"; design/compact "Sắp họp")
import adapter, {DISMISS, JOIN, LEAD, REMINDER, STAY, dueMeetings, eventIdParts, icsValues, meetingLink, nextWake, placeOf, reminderSaid}
    from '../src/buoy@murilegus/lib/modules/calendar/meeting.js';
import {planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {tierOf, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const MIN = 60 * 1000;
const T = new Date(2026, 10, 20, 15, 0).getTime();     // 15:00 local
const day = new Date(2026, 10, 20).getTime();
const sprint = {id: 'cal\nuid-1\n', title: 'Họp sprint tuần 47', start: T, end: T + 30 * MIN, startText: '15:00', endText: '15:30'};
const allDay = {id: 'cal\nuid-2\n', title: 'Holiday', start: day, end: day + 24 * 60 * MIN, startText: '00:00', endText: '00:00'};

// --- when ----------------------------------------------------------------------------------------------
eq(LEAD, 5 * MIN, 'it comes 5 min before');
eq(STAY, 10 * MIN, 'it stays 10 min after');
eq(dueMeetings([sprint], T - 6 * MIN), [], 'six minutes before: nothing');
eq(dueMeetings([sprint], T - 5 * MIN).map(e => e.phase), ['soon'], 'five minutes before: soon');
eq(dueMeetings([sprint], T).map(e => e.phase), ['now'], 'at the start: now');
eq(dueMeetings([sprint], T + 10 * MIN - 1).length, 1, 'till 10 min after');
eq(dueMeetings([sprint], T + 10 * MIN), [], '10 min after: gone');
eq(dueMeetings([{...sprint, end: T + 5 * MIN}], T + 5 * MIN), [], 'a 5-min event: gone when it ends');
eq(dueMeetings([{...sprint, end: T}], T + 2 * MIN).length, 1, 'no length: the 10 min after its start');
eq(dueMeetings([allDay], day + 1), [], 'an all-day event: never');
eq(dueMeetings(null, T), [], 'no events');
eq(dueMeetings([{...sprint, start: 'x'}], T), [], 'a bad start is dropped');
eq(dueMeetings([sprint, {...sprint, id: 'b', title: 'Gặp khách'}], T - MIN).length, 2, 'two at once: two');

eq(nextWake([sprint], T - 60 * MIN), T - 5 * MIN, 'next: when it comes');
eq(nextWake([sprint], T - 5 * MIN), T - 4.5 * MIN, 'counting down: when "in 5 min" becomes "in 4 min"');
eq(nextWake([sprint], T - 30 * 1000), T, 'last half minute: the start');
eq(nextWake([sprint], T), T + 10 * MIN, 'started: when it goes');
eq(nextWake([sprint], T + 30 * MIN), null, 'over: nothing ahead');
eq(nextWake([allDay], day - MIN), null, 'all-day only: no timer');
eq(nextWake([], T), null, 'no events: no timer');

// --- GNOME's reminder ------------------------------------------------------------------------------------
eq(REMINDER, 15 * MIN, 'reminders within 15 min are Buoy\'s');
eq(reminderSaid('Họp sprint tuần 47\n20/11/2026 15:00 (30 phút)', [sprint], T - 10 * MIN), true, 'Google\'s 10-min reminder: said by Buoy');
eq(reminderSaid('Họp sprint tuần 47\nThis is an event reminder\n15:00', [sprint], T - 10 * MIN), true, 'with the alarm\'s own line too');
eq(reminderSaid('Họp sprint tuần 47\n15:00', [sprint], T - 30 * MIN), false, 'a 30-min reminder stays');
eq(reminderSaid('Họp sprint tuần 47\n15:00', [sprint], T + 2 * MIN), true, 'a reminder at the start: said');
eq(reminderSaid('Other\n15:00', [sprint], T - 10 * MIN), false, 'another event\'s reminder stays');
eq(reminderSaid('Holiday\n', [allDay], day - 5 * MIN), false, 'an all-day event\'s reminder stays');
eq(reminderSaid('', [sprint], T), false, 'empty body');
eq(reminderSaid(null, [sprint], T), false, 'no body');

// --- the link ------------------------------------------------------------------------------------------
const google = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:uid-1', 'SUMMARY:Họp sprint',
    'DESCRIPTION:-::~:~::~:~\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\n',
    'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
    'LOCATION:Tầng 3\\, phòng A', 'BEGIN:VALARM', 'DESCRIPTION:This is an event reminder', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
].join('\r\n');
eq(meetingLink(google), {url: 'https://meet.google.com/abc-defg-hij', service: 'Google Meet'}, 'Google Meet from its own field');
eq(placeOf(google), 'Tầng 3, phòng A', 'the place, unescaped');
eq(icsValues(google, 'description').length, 1, 'the VALARM\'s description is not the event\'s… (first VEVENT only, before END)');
const zoom = 'BEGIN:VEVENT\r\nLOCATION:https://us02web.zoom.us/j/8123456789?pwd=abc\r\nEND:VEVENT';
eq(meetingLink(zoom), {url: 'https://us02web.zoom.us/j/8123456789?pwd=abc', service: 'Zoom'}, 'Zoom in the place');
eq(placeOf(zoom), '', 'a link is not a place');
const teams = 'BEGIN:VEVENT\r\nDESCRIPTION:Join: https://teams.microsoft.com/l/meetup-j\r\n oin/19%3ameeting_x/0?context=y.\r\nEND:VEVENT';
eq(meetingLink(teams), {url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=y', service: 'Teams'}, 'Teams, folded line joined, trailing dot off');
eq(meetingLink('BEGIN:VEVENT\r\nURL:https://meet.jit.si/BuoyStandup\r\nEND:VEVENT')?.service, 'Jitsi', 'Jitsi in URL');
eq(meetingLink('BEGIN:VEVENT\r\nDESCRIPTION:https://acme.webex.com/meet/ethan\r\nEND:VEVENT')?.service, 'Webex', 'Webex');
eq(meetingLink('BEGIN:VEVENT\r\nDESCRIPTION:see https://example.com/doc\r\nEND:VEVENT'), null, 'another link: none');
eq(meetingLink('BEGIN:VEVENT\r\nDESCRIPTION:http://meet.google.com/abc-defg-hij\r\nEND:VEVENT'), null, 'http: none');
eq(meetingLink(''), null, 'empty');
eq(meetingLink(null), null, 'null');

eq(eventIdParts('cal\nuid-1\n20261120T080000Z'), {source: 'cal', uid: 'uid-1', rid: '20261120T080000Z'}, 'Shell\'s id: source, uid, rid');
eq(eventIdParts('cal\nuid-1\n'), {source: 'cal', uid: 'uid-1', rid: ''}, 'no rid');
eq(eventIdParts('cal'), null, 'no uid: null');
eq(eventIdParts(7), null, 'not a string');

// --- the adapter --------------------------------------------------------------------------------------
const did = [];
const ev = o => ({
    ...sprint, link: {url: 'https://meet.google.com/abc-defg-hij', service: 'Google Meet'}, location: '',
    phase: 'soon', now: T - 5 * MIN, shared: false, join: () => did.push('join'), dismiss: () => did.push('dismiss'), ...o,
});
const soon = adapter.calendar(ev());
const a = validate({...soon, id: 'calendar:x', kind: 'calendar', source: 'calendar'});
eq(soon.text, 'Họp sprint tuần 47', 'pill: the title');
eq(soon.trailing, {until: T}, 'pill: counting down to the start');
eq(soon.compact.card.app, '15:00 – 15:30 · in 5 min', 'card line: range and how soon');
eq(soon.actions, [{id: JOIN, label: 'Join Google Meet', icon: 'camera-video-symbolic', main: true}], 'Join, the main button');
eq(soon.ttl, 0, 'the source ends it');
eq(tierOf(a), 2, 'not "needs you"');
eq(planCompact(a)?.card?.title, 'Họp sprint tuần 47', 'compact is a card');
eq(planCompact(a)?.actions?.[0]?.main, true, 'the plan keeps main');
eq(planMinimal(a).trailing?.type, 'until', 'minimal counts down');
eq(adapter.calendar(ev({now: T - 3 * MIN})).compact.card.app, '15:00 – 15:30 · in 3 min', 'in 3 min');

const now = adapter.calendar(ev({phase: 'now', now: T + MIN}));
eq(now.trailing, {text: 'now', color: '#30d158'}, 'started: "now" in green');
eq(now.compact.card.app, '15:00 – 15:30 · now', 'card line: now');

const plain = adapter.calendar(ev({link: null, location: 'Tầng 3', title: 'Gặp khách ở văn phòng', end: T + 60 * MIN, endText: '16:00'}));
eq(plain.actions, [], 'no link: no button');
eq(plain.compact.card.app, '15:00 – 16:00 · in 5 min · Tầng 3', 'the place at the end');

const shared = adapter.calendar(ev({shared: true, location: 'Tầng 3'}));
eq([shared.text, shared.compact.card.title, shared.compact.card.app], ['Event', 'Event', '15:00 – 15:30 · in 5 min'], 'screen shared: no title, no place');
eq(adapter.calendar(ev({title: '  '})).text, 'Event', 'no title: Event');
eq(adapter.calendar(ev({link: {url: 'https://x', service: ''}})).actions[0].label, 'Join Meeting', 'no service name: Join Meeting');
eq(adapter.calendar(ev({link: {url: ''}})).actions, [], 'an empty link: no button');
eq(adapter.calendar(ev({endText: '', end: T})).compact.card.app, '15:00 · in 5 min', 'no length: the start only');
eq(adapter.calendar(ev({title: 'A '.repeat(80)})).text.length, 159, 'a long title is not cut here');

soon.onAction(JOIN);
soon.onAction(DISMISS);
soon.onAction('other');
eq(did, ['join', 'dismiss'], 'Join and × reach the source');

print('meeting: ok');
