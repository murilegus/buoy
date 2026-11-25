// Run: gjs -m tests/moments.test.js   (pure: FEATURES M4 "Greeting" part 1; GREETING.md §1–§6)
import adapter, {HELLO_MS, LEAVE_MS, LONG_DAY_S, MINIMAL_MAX, WAKE_S, WELCOME_MS, helloLine, leavingLine, momentOf, nameOf, sizeOf, whenLine}
    from '../src/buoy@murilegus/lib/modules/greeting/adapter.js';
import {planExpanded, planMinimal, planCompact} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// 2026-11-20 is a Friday; 23 a Monday; 21 a Saturday; 22 a Sunday
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
const N = 'Ethan';

eq([WAKE_S, LONG_DAY_S, MINIMAL_MAX, HELLO_MS, WELCOME_MS], [10800, 36000, 24, 8000, 4000], 'the numbers of GREETING.md');

// --- the moment (§1) --------------------------------------------------------------------------------
const f = o => ({boot: 'b2', lastBoot: 'b1', session: '3', lastSession: '2', asleep: 0, lastAsleep: 0, ...o});
eq(momentOf(f()), 'start', 'a new boot: Start');
eq(momentOf(f({lastBoot: 'b2', asleep: 4 * 3600, lastAsleep: 600})), 'wake', 'the same boot, asleep 3 h or more since: Wake');
eq(momentOf(f({lastBoot: 'b2', asleep: 3 * 3600, lastAsleep: 600})), 'welcome', 'a shorter sleep, another session: Welcome back');
eq(momentOf(f({lastBoot: 'b2', asleep: WAKE_S, lastAsleep: 0, lastSession: '3'})), 'wake', 'exactly 3 h: Wake');
eq(momentOf(f({lastBoot: 'b2', lastSession: '3', asleep: 1200, lastAsleep: 600})), null, 'a lock, a short sleep, Buoy off and on: nothing');
eq(momentOf(f({boot: '', lastBoot: 'b1', lastSession: '3'})), null, 'boot unread: not a Start');
eq(momentOf(f({lastBoot: 'b2', session: '', asleep: NaN})), null, 'nothing read: nothing');

eq([nameOf(' Ethan ', 'Trung Pham', 'trungpt'), nameOf('', 'Trung Pham', 'trungpt'), nameOf('', 'Unknown', 'trungpt'), nameOf('', '', '')],
    ['Ethan', 'Trung', 'trungpt', 'there'], 'the name: set, the real name\'s first word, the user name');

// --- line 1 (§3) -----------------------------------------------------------------------------------------
const hello = (d, h, m = 0, starts) => helloLine({now: at(d, h, m), starts, name: N}).title;
eq(hello(20, 1, 30), 'Still up, Ethan? Don\'t stay too late.', '01:00 to dawn: still up');
eq(hello(20, 0, 30), 'Still up, Ethan?', 'just past midnight: night\'s line (before 01:00)');
eq(hello(20, 4, 59, [6, 7, 11, 13, 18, 22]), 'Still up, Ethan? Don\'t stay too late.', 'dawn later in the prefs: still up longer');
eq(hello(23, 6), 'New week, Ethan.', 'Monday dawn');
eq(hello(23, 9), 'New week, Ethan.', 'Monday morning');
eq(hello(23, 14), 'Good afternoon, Ethan.', 'Monday afternoon: the daypart');
eq([hello(21, 8), hello(21, 12), hello(22, 9), hello(22, 15), hello(21, 20)],
    ['Happy Saturday, Ethan.', 'Happy Saturday, Ethan.', 'Easy Sunday, Ethan.', 'Enjoy your weekend, Ethan.', 'Enjoy your weekend, Ethan.'],
    'the weekend: Saturday, Sunday till noon, then the weekend');
eq([hello(20, 6), hello(20, 8), hello(20, 11), hello(20, 15), hello(20, 19), hello(20, 23)],
    ['Good morning, Ethan.', 'Good morning, Ethan.', 'Good day, Ethan.', 'Good afternoon, Ethan.', 'Good evening, Ethan.', 'Still up, Ethan?'],
    'each daypart');
eq(helloLine({now: at(20, 8), name: N}).pose, 'wave', 'Bu waves');

// --- line 2 (§2) ---------------------------------------------------------------------------------------------
eq(whenLine(at(20, 7, 42)), 'It\'s 07:42 on Friday, 20 November 2026.', 'the time and the date, 24-hour');
eq([whenLine(at(20, 19, 5), '12h'), whenLine(at(20, 0, 5), '12h'), whenLine(at(20, 12, 0), '12h')],
    ['It\'s 7:05 PM on Friday, 20 November 2026.', 'It\'s 12:05 AM on Friday, 20 November 2026.', 'It\'s 12:00 PM on Friday, 20 November 2026.'],
    '12-hour as GNOME\'s clock-format');

// --- Leaving (§5) ---------------------------------------------------------------------------------------------
const leave = (kind, d = 20, h = 10) => leavingLine({leave: kind, now: at(d, h), name: N});
eq(leave('update'), {title: 'Updating. Back in a moment.', pose: 'busy'}, 'a restart for updates');
eq(leave('restart'), {title: 'Be right back.', pose: 'wave'}, 'a restart');
eq(leave('logout'), {title: 'Catch you later, Ethan.', pose: 'wave'}, 'a log out');
eq(leave('shutdown', 20, 15), {title: 'Have a good weekend, Ethan.', pose: 'done'}, 'shut down Friday afternoon');
eq(leave('shutdown', 20, 23), {title: 'Have a good weekend, Ethan.', pose: 'done'}, 'Friday night too');
eq(leave('shutdown', 19, 20), {title: 'Good night, Ethan.', pose: 'sleep'}, 'shut down in the evening');
eq(leave('shutdown', 19, 10), {title: 'See you soon, Ethan.', pose: 'wave'}, 'shut down otherwise');

// --- sizes (§6) -------------------------------------------------------------------------------------------------
eq([sizeOf('Be right back.'), sizeOf('Welcome back, Ethan.'), sizeOf('Welcome back, Nguyễn Thị Thanh.'), sizeOf('Good night, Ethan.', 'Long day. Rest well.')],
    ['minimal', 'minimal', 'compact', 'compact'], 'one short line minimal; long, or with a note, compact');

// --- the activity ---------------------------------------------------------------------------------------------
const ev = o => ({id: 'greeting-moment', now: at(20, 7, 42), starts: null, clock: '24h', name: N, style: 'expanded', animations: false, ...o});
const start = adapter.greeting(ev({case: 'start'}));
eq([start.style, start.expanded.center.title, start.expanded.center.lines, start.expanded.leading.mascot, start.ttl],
    ['transient', 'Good morning, Ethan.', ['It\'s 07:42 on Friday, 20 November 2026.'], 'wave', HELLO_MS],
    'Start: expanded, the greeting and when, Bu waving, ~8 s');
eq(adapter.greeting(ev({case: 'start', animations: true})).ttl > HELLO_MS, true, 'typed in: its typing counts too');
eq(adapter.greeting(ev({case: 'wake'})).expanded.center.title, 'Good morning, Ethan.', 'Wake: as Start');
const small = adapter.greeting(ev({case: 'start', style: 'minimal'}));
eq([small.style ?? null, small.expanded, small.text, small.compact?.subtitle ?? null, small.ttl],
    [null, null, 'Good morning, Ethan.', null, WELCOME_MS], 'greeting-style minimal: line 1 in the pill, 4 s');
const welcome = adapter.greeting(ev({case: 'welcome'}));
eq([welcome.text, welcome.compact, welcome.ttl, welcome.alert, welcome.leading.mascot], ['Welcome back, Ethan.', null, WELCOME_MS, false, 'wave'],
    'Welcome back: minimal, 4 s');
const night = adapter.greeting(ev({case: 'leaving', leave: 'shutdown', now: at(19, 21), longDay: true}));
eq([night.text, night.compact.subtitle, night.ttl, night.alert, night.leading.mascot], ['Good night, Ethan.', 'Long day. Rest well.', LEAVE_MS, true, 'sleep'],
    'Leaving after a long day: compact with its note, opened at once');
eq(adapter.greeting(ev({case: 'leaving', leave: 'restart', longDay: true})).compact, null, 'the long day only at shut down');

const plan = planExpanded(validate({...start, id: 'greeting:buoy', kind: 'greeting', source: 'greeting'}));
eq(plan.leading.type, 'mascot', 'expanded: Bu leads');
eq(planMinimal(validate({...welcome, id: 'greeting:buoy', kind: 'greeting', source: 'greeting'})).text, 'Welcome back, Ethan.', 'minimal: the line');
eq(planCompact(validate({...night, id: 'greeting:buoy', kind: 'greeting', source: 'greeting'}))?.subtitle ?? null, 'Long day. Rest well.', 'compact: the note under');

print('moments: ok');
