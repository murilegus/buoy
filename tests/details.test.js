// Run: gjs -m tests/details.test.js   (pure: FEATURES M4 "Event details in the Calendar tab"; design/tabs "Chi tiết sự kiện")
import {DESCRIPTION_LINES, calendarsOf, clampLines, eventPage, guestsOf, hexColour, ownDescription, reminderText, withoutLink}
    from '../src/buoy@murilegus/lib/modules/calendar/details.js';
import {keyFile, parseEvent, unescapeText} from '../src/buoy@murilegus/lib/modules/calendar/ical.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const MIN = 60 * 1000;
const NOW = new Date(2026, 10, 20, 14, 0).getTime();
const T = new Date(2026, 10, 20, 15, 30).getTime();
const ev = {id: 'cal\nuid-1\n', title: 'Meeting Offline', start: T, end: T + 15 * MIN, startText: '15:30', endText: '15:45'};

// Google's event, as EDS gives it (fields from a real one, values made up)
const GOOGLE = [
    'BEGIN:VEVENT',
    'DTSTART;TZID=Asia/Ho_Chi_Minh:20261120T153000',
    'ORGANIZER;CN=tram@example.com:mailto:tram@example.com',
    'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=an@',
    ' example.com;X-NUM-GUESTS=0:mailto:an@example.com',
    'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=tram@example.com;X-NUM-GUESTS=0:mailto:tram@example.com',
    'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
    'DESCRIPTION:Mang hợp đồng bản in.\\n\\n-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\nOr dial: +1 314-735-0348 PIN: 869 845 487#\\n\\nLearn more about Meet at: https://support.google.com/a/users/answer/9282720\\n\\nPlease do not edit this section.\\n-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-',
    'LOCATION:MOSO_F3\\, Tầng 3',
    'STATUS:CONFIRMED',
    'SUMMARY:Meeting Offline',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:This is an event reminder',
    'TRIGGER:-PT10M',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
].join('\r\n');

// --- parsing -----------------------------------------------------------------------------------------
const parsed = parseEvent(GOOGLE);
eq(parsed.props.filter(p => p.name === 'DESCRIPTION').length, 1, 'the VALARM\'s DESCRIPTION is the alarm\'s, not the event\'s');
eq(parsed.alarms.map(a => a.find(p => p.name === 'TRIGGER').value), ['-PT10M', '-P1D'], 'two alarms, apart');
eq(parsed.props.find(p => p.name === 'ATTENDEE').params, {CUTYPE: 'INDIVIDUAL', ROLE: 'REQ-PARTICIPANT', PARTSTAT: 'NEEDS-ACTION', CN: 'an@example.com', 'X-NUM-GUESTS': '0'},
    'a folded line joined, its parameters read');
eq(parseEvent('BEGIN:VEVENT\r\nORGANIZER;CN="Trâm: PM";X=1:mailto:t@x.vn\r\nEND:VEVENT').props[0],
    {name: 'ORGANIZER', params: {CN: 'Trâm: PM', X: '1'}, value: 'mailto:t@x.vn'}, 'a quoted parameter keeps its ":"');
eq(parseEvent(null), {props: [], alarms: []}, 'no text: nothing');
eq(unescapeText('a\\nb\\\\nc\\, d\\;'), 'a\nb\\nc, d;', 'escapes read in one pass: an escaped backslash then n stays so');
eq(parseEvent('SUMMARY:outside\r\n').props, [], 'nothing outside a VEVENT');

// --- the calendars ------------------------------------------------------------------------------------
eq(keyFile('[Data Source]\nDisplayName=Work\n\n[Calendar]\nColor=#9fe1e7\nBackendName=caldav\n'),
    {'Data Source': {DisplayName: 'Work'}, Calendar: {Color: '#9fe1e7', BackendName: 'caldav'}}, 'a key file\'s sections');
eq(keyFile(undefined), {}, 'no data');
eq([hexColour('#9FE1E7'), hexColour('#abc'), hexColour('#ffff80800000'), hexColour('rgb(255,128,0)'), hexColour(''), hexColour('red'), hexColour(null)],
    ['#9fe1e7', '#aabbcc', '#ff8000', '#ff8000', null, null, null], 'EDS colours as #rrggbb');
eq([...calendarsOf([
    {uid: 'g', data: '[Data Source]\nDisplayName=Công việc\n[Calendar]\nColor=#62a0ea\n'},
    {uid: 'mail', data: '[Data Source]\nDisplayName=Mail\n[Mail Account]\n'},
    {uid: 'nocolour', data: '[Data Source]\nDisplayName=Personal\n[Calendar]\nBackendName=local\n'},
    {uid: '', data: '[Calendar]\n'}, null,
])], [['g', {name: 'Công việc', color: '#62a0ea'}], ['nocolour', {name: 'Personal', color: null}]], 'calendars: name and colour');
eq(calendarsOf(null).size, 0, 'no sources');

// --- the description ------------------------------------------------------------------------------------
const desc = parsed.props.find(p => p.name === 'DESCRIPTION').value.replace(/\\n/g, '\n');
eq(ownDescription(desc), 'Mang hợp đồng bản in.', 'Google\'s block between its marks goes');
eq(ownDescription('-::~:~::~:~::-\nJoin with Google Meet: x\n-::~:~::~:~::-'), '', 'only Google\'s block: nothing');
eq(ownDescription('Note\n-::~:~::~:~::-\nJoin with Google Meet: x'), 'Note', 'one mark: what is before it');
eq(ownDescription('A\n\n\n\nB'), 'A\n\nB', 'blank lines: one at most');
eq(ownDescription(7), '', 'not text');
eq(clampLines('1\n2\n3', 2), '1\n2…', 'more lines than room: …');
eq(withoutLink('Agenda\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\n\n\nBring the plan', 'https://meet.google.com/abc-defg-hij'),
    'Agenda\n\nBring the plan', 'the lines carrying the meeting\'s link go: Join says it');
eq(withoutLink('Just text', null), 'Just text', 'no link: as it is');
eq(eventPage(ev, 'BEGIN:VEVENT\r\nX-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij\r\nDESCRIPTION:Join with Google Meet: https://meet.google.com/abc-defg-hij\r\nEND:VEVENT', NOW).description,
    '', 'a description that only says the link: none');
eq(clampLines('1\n2', 2), '1\n2', 'fits');

// --- guests ---------------------------------------------------------------------------------------------
const g = guestsOf(parsed.props);
eq(g.people.map(p => [p.email, p.name, p.status, p.organizer]),
    [['tram@example.com', '', 'yes', true], ['an@example.com', '', 'awaiting', false]], 'organizer first; Google\'s CN is the address: no name');
eq([g.count, g.line], [2, '1 yes, 1 awaiting'], 'how many, who answered');
const others = guestsOf(parseEvent([
    'BEGIN:VEVENT', 'ORGANIZER;CN=Quỳnh Trâm:mailto:tram@x.vn',
    'ATTENDEE;PARTSTAT=DECLINED;CN=Ethan:mailto:ethan@x.vn', 'ATTENDEE;PARTSTAT=TENTATIVE:mailto:an@x.vn', 'END:VEVENT',
].join('\r\n')).props);
eq(others.people.map(p => [p.name || p.email, p.status, p.organizer]),
    [['Quỳnh Trâm', 'yes', true], ['Ethan', 'no', false], ['an@x.vn', 'maybe', false]], 'an organizer not among the attendees is added; real names kept');
eq(others.line, '1 yes, 1 no, 1 maybe', 'no and maybe counted');
eq(guestsOf(parseEvent('BEGIN:VEVENT\r\nORGANIZER:mailto:me@x.vn\r\nEND:VEVENT').props).count, 0, 'an organizer alone: no guests');

// --- reminders ------------------------------------------------------------------------------------------
eq(['-PT10M', '-PT1M', '-PT1H', '-PT90M', '-P1D', '-P2D', '-P1W', 'PT0S', '-PT0S', 'PT15M', '20261120T080000Z', '', null].map(reminderText),
    ['10 minutes before', '1 minute before', '1 hour before', '90 minutes before', '1 day before', '2 days before', '1 week before',
        'At the start', 'At the start', null, null, null, null], 'reminders as Google says them');

// --- the page ----------------------------------------------------------------------------------------------
const page = eventPage(ev, GOOGLE, NOW);
eq([page.title, page.when, page.place, page.description, page.reminders],
    ['Meeting Offline', 'Today, 20 November · 15:30 – 15:45', 'MOSO_F3, Tầng 3', 'Mang hợp đồng bản in.', ['10 minutes before', '1 day before']],
    'the page: title, when, place, own description, reminders');
eq(page.guests.count, 2, 'its guests');
const bare = eventPage(ev, null, NOW);
eq([bare.title, bare.when, bare.place, bare.description, bare.guests, bare.reminders],
    ['Meeting Offline', 'Today, 20 November · 15:30 – 15:45', '', '', null, []], 'not read: the head alone');
const day = new Date(2026, 10, 21).getTime();
eq(eventPage({...ev, start: day, end: day + 24 * 60 * MIN}, null, NOW).when, 'Tomorrow, 21 November · All day', 'an all-day event');
eq(eventPage(ev, 'BEGIN:VEVENT\r\nLOCATION:https://zoom.us/j/1\r\nEND:VEVENT', NOW).place, '', 'a link is not a place');
const long = Array.from({length: 9}, (_, i) => `line ${i}`).join('\\n');
eq(eventPage(ev, `BEGIN:VEVENT\r\nDESCRIPTION:${long}\r\nEND:VEVENT`, NOW).description.split('\n').length, DESCRIPTION_LINES,
    'a long description: its first lines');
eq(eventPage(ev, 'BEGIN:VEVENT\r\nBEGIN:VALARM\r\nTRIGGER;RELATED=END:-PT5M\r\nEND:VALARM\r\nBEGIN:VALARM\r\nTRIGGER;VALUE=DATE-TIME:20261120T080000Z\r\nEND:VALARM\r\nEND:VEVENT', NOW).reminders,
    [], 'a reminder from the end, or at a set time: left out');
eq(eventPage(ev, 'BEGIN:VEVENT\r\nBEGIN:VALARM\r\nTRIGGER:-PT10M\r\nEND:VALARM\r\nBEGIN:VALARM\r\nTRIGGER:-PT10M\r\nEND:VALARM\r\nEND:VEVENT', NOW).reminders,
    ['10 minutes before'], 'the same reminder twice: once');

print('details: ok');
