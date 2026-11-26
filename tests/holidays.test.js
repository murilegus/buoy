// Run: gjs -m tests/holidays.test.js   (pure: FEATURES M4 "Greeting" part 3; GREETING.md §7)
import {LUNAR, easter, nthSunday, regionOf, specialDay} from '../src/buoy@murilegus/lib/modules/greeting/holidays.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
const D = (y, m, d) => new Date(y, m - 1, d, 9, 0);
const vn = (y, m, d, o = {}) => specialDay(D(y, m, d), {region: 'vn', ...o});

// --- the region by the time zone ----------------------------------------------------------------------
eq([regionOf('Asia/Ho_Chi_Minh'), regionOf('Asia/Saigon'), regionOf('Europe/Paris'), regionOf(null)], ['vn', 'vn', null, null],
    'Vietnam by its time zone, not the locale');

// --- the rules ------------------------------------------------------------------------------------------
eq([2026, 2027, 2028, 2029, 2030].map(easter), [[4, 5], [3, 28], [4, 16], [4, 1], [4, 21]], 'Easter 2026–2030');
eq([nthSunday(2026, 5, 2), nthSunday(2026, 6, 3)], [10, 21], 'Mother\'s Day 2026 = 10 May, Father\'s Day = 21 June');

// --- the lunar table (scripts/lunar.js) ----------------------------------------------------------------
eq(Object.keys(LUNAR).length, 74, 'lunar years 2026–2099');
eq(LUNAR[2026], '0217 0303 0426 0531 0827 0925 0130',
    'the anchors: Tết 17 Feb, full moon 3 Mar, Hùng Kings 26 Apr, Vesak 31 May, Vu Lan 27 Aug, Mid-Autumn 25 Sep, Kitchen Gods 30 Jan 2027');
eq([LUNAR[2027].slice(0, 4), LUNAR[2028].slice(0, 4)], ['0206', '0126'], 'Tết 2027 = 6 Feb, 2028 = 26 Jan');

// --- which day ------------------------------------------------------------------------------------------
eq(vn(2026, 2, 17).celebrate, {line: 'Happy Lunar New Year, {name}!'}, 'Tết, its first day');
eq([vn(2026, 2, 18).celebrate?.line, vn(2026, 2, 19).celebrate?.line, vn(2026, 2, 20).celebrate], ['Happy Lunar New Year, {name}!', 'Happy Lunar New Year, {name}!', null],
    'its 2nd and 3rd days, not the 4th');
eq(vn(2027, 1, 30).observe, {name: 'Kitchen Gods\' Day'}, 'Kitchen Gods\' day of lunar 2026 falls in January 2027');
eq(vn(2026, 9, 25).celebrate, {line: 'Happy Mid-Autumn, {name}!'}, 'Mid-Autumn');
eq(vn(2026, 11, 20), {birthday: false, celebrate: null, observe: {name: 'Teachers\' Day'}}, 'Teachers\' Day: an observance');
eq(vn(2026, 12, 25).celebrate, {line: 'Merry Christmas, {name}!'}, 'Christmas, global');
eq(specialDay(D(2026, 11, 20), {region: null}).observe, null, 'no region: Vietnam\'s days left out');
eq(vn(2026, 11, 20, {holidays: 'global'}).observe, null, 'global only');
eq(vn(2026, 12, 25, {holidays: 'off'}).celebrate, null, 'off: none');
eq(specialDay(D(2026, 4, 5), {}).celebrate, {line: 'Happy Easter, {name}!'}, 'Easter Sunday');
eq(specialDay(D(2026, 5, 10), {}).observe, {name: 'Mother\'s Day'}, 'Mother\'s Day');
eq(vn(2026, 5, 31).observe, {name: 'Vesak'}, 'Vesak on a day Mother\'s Day is not');
eq(vn(2026, 3, 3).observe, {name: 'the First Full Moon Festival'}, 'the first full moon');
eq(vn(2026, 12, 25, {birthday: '12-25'}), {birthday: true, celebrate: {line: 'Merry Christmas, {name}!'}, observe: null},
    'a birthday on Christmas: both said, the birthday wins in the adapter');
eq(vn(2026, 12, 25, {birthday: '12-25', holidays: 'off'}).birthday, true, 'the birthday stays with holidays off');
eq(specialDay(D(2100, 2, 9), {region: 'vn'}).celebrate, null, 'past 2099: the lunar days skipped');
eq(specialDay(D(2026, 7, 7), {region: 'vn'}), {birthday: false, celebrate: null, observe: null}, 'an ordinary day');

print('holidays: ok');
