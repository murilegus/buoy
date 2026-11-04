// Run: gjs -m tests/daypart.test.js   (pure: hour → dawn…night, boundaries, bad settings)
import GLib from 'gi://GLib';

import {DAYPARTS, DEFAULT_STARTS, normaliseStarts, daypartAt, nextBoundary} from
    '../src/buoy@murilegus/lib/kit/daypart.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const at = (h, m = 0, day = 4, month = 10) => new Date(2026, month, day, h, m, 0, 0);

// --- the names and defaults (SPEC §2d) ------------------------------------------------
eq(DAYPARTS, ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night'], 'six dayparts, in order');
eq(DEFAULT_STARTS, [5, 7, 11, 13, 18, 22], 'default starts');
const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const xml = new TextDecoder().decode(GLib.file_get_contents(GLib.build_filenamev([here, '..', 'src',
    'buoy@murilegus', 'schemas', 'org.gnome.shell.extensions.buoy.gschema.xml']))[1]);
const def = xml.match(/<key name="daypart-starts" type="ai">\s*<default>\[([^\]]*)\]<\/default>/);
eq(def ? def[1].split(',').map(Number) : null, [...DEFAULT_STARTS], 'the schema default is DEFAULT_STARTS');

// --- every hour with the defaults ------------------------------------------------------
const byHour = [...Array(24).keys()].map(h => daypartAt(h));
eq(byHour, [
    'night', 'night', 'night', 'night', 'night',       // 0–4: night wraps past midnight
    'dawn', 'dawn',                                     // 5–6
    'morning', 'morning', 'morning', 'morning',         // 7–10
    'noon', 'noon',                                     // 11–12
    'afternoon', 'afternoon', 'afternoon', 'afternoon', 'afternoon', // 13–17
    'evening', 'evening', 'evening', 'evening',         // 18–21
    'night', 'night',                                   // 22–23
], 'defaults: each hour of the day');

// --- boundaries, to the minute ---------------------------------------------------------
eq(daypartAt(at(4, 59)), 'night', '4:59 is still night');
eq(daypartAt(at(5, 0)), 'dawn', '5:00 is dawn');
eq(daypartAt(at(10, 59)), 'morning', '10:59 is morning');
eq(daypartAt(at(11, 0)), 'noon', '11:00 is noon');
eq(daypartAt(at(21, 59)), 'evening', '21:59 is evening');
eq(daypartAt(at(22, 0)), 'night', '22:00 is night');
eq(daypartAt(at(23, 59)), 'night', '23:59 is night');
eq(daypartAt(at(0, 0)), 'night', 'midnight is night');

// --- custom starts ---------------------------------------------------------------------
eq(daypartAt(0, [0, 4, 8, 12, 16, 20]), 'dawn', 'a part may start at midnight');
eq(daypartAt(23, [0, 4, 8, 12, 16, 20]), 'night', 'then night ends at midnight');
const late = [5, 7, 11, 13, 18, 1];  // night starts after midnight: evening wraps instead
eq(daypartAt(23, late), 'evening', 'evening wraps past midnight');
eq(daypartAt(0, late), 'evening', 'still evening at 0:00');
eq(daypartAt(1, late), 'night', 'night from 1:00');
eq(daypartAt(4, late), 'night', 'night until dawn');
eq(daypartAt(5, late), 'dawn', 'dawn at 5:00');
const early = [23, 6, 11, 13, 18, 21]; // dawn starts before midnight
eq(daypartAt(23, early), 'dawn', 'dawn may start before midnight');
eq(daypartAt(3, early), 'dawn', 'and last past it');
eq(daypartAt(22, early), 'night', 'night between 21 and 23');

// --- bad settings: the defaults, said so -------------------------------------------------
eq(normaliseStarts([5, 7, 11, 13, 18, 22]), {starts: [5, 7, 11, 13, 18, 22], valid: true}, 'defaults are valid');
eq(normaliseStarts(late), {starts: late, valid: true}, 'one wrap anywhere is valid');
const bad = [
    [undefined, 'missing'],
    [null, 'null'],
    ['5,7,11,13,18,22', 'a string'],
    [[5, 7, 11, 13, 18], 'five starts'],
    [[5, 7, 11, 13, 18, 22, 23], 'seven starts'],
    [[5, 7, 11, 13, 18, 24], 'an hour past 23'],
    [[-1, 7, 11, 13, 18, 22], 'a negative hour'],
    [[5, 7.5, 11, 13, 18, 22], 'a fraction'],
    [[5, '7', 11, 13, 18, 22], 'a string hour'],
    [[5, NaN, 11, 13, 18, 22], 'NaN'],
    [[5, 7, 7, 13, 18, 22], 'a part of zero length (duplicate)'],
    [[5, 11, 7, 13, 18, 22], 'out of order (two wraps)'],
    [[22, 18, 13, 11, 7, 5], 'reversed'],
];
for (const [value, why] of bad) {
    eq(normaliseStarts(value), {starts: DEFAULT_STARTS, valid: false}, `bad setting (${why}) → defaults`);
    eq(daypartAt(3, value), 'night', `bad setting (${why}): daypartAt uses the defaults`);
}
eq(normaliseStarts(late).starts === late, false, 'returns a copy, not the caller\'s array');

// --- input forms -----------------------------------------------------------------------
eq(daypartAt(at(14, 30)), 'afternoon', 'a Date');
eq(daypartAt(14), 'afternoon', 'an hour number');
eq(daypartAt(14.9), 'afternoon', 'a fractional hour is floored');
eq(daypartAt(24), 'night', 'hour 24 wraps to 0');
eq(daypartAt(-1), 'night', 'hour -1 wraps to 23');
eq(daypartAt(new Date(NaN)), 'night', 'an invalid Date: hour 0 (no throw)');

// --- the next boundary (a consumer's one-shot timer aims here) -------------------------
const iso = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
eq(iso(nextBoundary(at(4, 30))), '2026-11-4 5:00', 'next: dawn the same day');
eq(iso(nextBoundary(at(5, 0))), '2026-11-4 7:00', 'on a boundary: the following one');
eq(iso(nextBoundary(at(21, 59))), '2026-11-4 22:00', 'next: night');
eq(iso(nextBoundary(at(23, 10))), '2026-11-5 5:00', 'past the last start: dawn tomorrow');
eq(iso(nextBoundary(new Date(2026, 0, 31, 23, 0))), '2026-2-1 5:00', 'across a month end');
eq(iso(nextBoundary(new Date(2026, 11, 31, 22, 30))), '2027-1-1 5:00', 'across a year end');
eq(iso(nextBoundary(at(0, 30), late)), '2026-11-4 1:00', 'custom: night after midnight');
eq(iso(nextBoundary(at(22, 0), early)), '2026-11-4 23:00', 'custom: dawn before midnight');
eq(iso(nextBoundary(at(3, 0), [5, 7, 11, 13, 18, 'x'])), '2026-11-4 5:00', 'bad setting: the default boundaries');
const from = at(9, 15);
nextBoundary(from);
eq(iso(from), '2026-11-4 9:15', 'the input Date is not changed');
eq(nextBoundary(at(13, 0)).getSeconds(), 0, 'a boundary is on the hour, 0 s');

print('daypart: ok');
