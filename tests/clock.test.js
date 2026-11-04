// Run: gjs -m tests/clock.test.js   (pure: the clock idle plan)
import GLib from 'gi://GLib';

import clock, {STYLES, DEFAULT_STYLE, keys, iconFor, seconds, present, relevance} from
    '../src/buoy@murilegus/lib/modules/clock/idle.js';
import {DAYPARTS} from '../src/buoy@murilegus/lib/kit/daypart.js';
import {planIdle} from '../src/buoy@murilegus/lib/kit/presentation.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function ok(cond, msg) {
    if (!cond)
        throw new Error(msg);
}

const at = h => new Date(2026, 10, 4, h, 30);

// --- the module's shape ----------------------------------------------------------------
eq(STYLES, ['icon-time', 'time', 'icon', 'seconds'], 'four styles, SPEC §2a');
eq(DEFAULT_STYLE, 'icon-time', 'default style');
eq(keys, ['idle-clock-style'], 'its own keys are idle-clock-*');
eq(Object.keys(clock).sort(), ['keys', 'present', 'relevance', 'seconds'], 'default export: the plan contract');
eq(relevance(), {score: 10}, 'auto: the floor (SPEC §2a-iii)');

// --- one picture per daypart, on disk ----------------------------------------------------
const files = DAYPARTS.map(iconFor);
eq(new Set(files).size, 6, 'six dayparts, six different pictures');
for (const [i, uri] of files.entries()) {
    ok(uri.startsWith('file://') && uri.endsWith(`/icons/daypart-${DAYPARTS[i]}.svg`), `${DAYPARTS[i]}: ${uri}`);
    const path = GLib.filename_from_uri(uri)[0];
    ok(GLib.file_test(path, GLib.FileTest.EXISTS), `${DAYPARTS[i]}: the file exists (${path})`);
    const svg = new TextDecoder().decode(GLib.file_get_contents(path)[1]);
    ok(svg.startsWith('<svg') && svg.includes('viewBox="0 0 16 16"'), `${DAYPARTS[i]}: an SVG`);
    for (const reserved of ['#EF9F27', '#E24B4A', '#F0997B', '#5DCAA5'])
        ok(!svg.toUpperCase().includes(reserved), `${DAYPARTS[i]}: no state colour ${reserved} (INDICATORS)`);
}
eq(iconFor('nope'), iconFor('noon'), 'an unknown part: noon\'s picture');

// --- present ---------------------------------------------------------------------------
const ctx = h => ({now: at(h), clock: ' 21∶30 '});
eq(present(ctx(21)).text, '21∶30', 'the wall clock\'s text, trimmed');
eq(present(ctx(21)).leading.art, iconFor('evening'), '21:30 → evening\'s picture');
eq(present(ctx(3)).leading.art, iconFor('night'), '3:30 → night');
eq(present(ctx(5)).leading.art, iconFor('dawn'), '5:30 → dawn');
eq(present(ctx(12)).daypart, 'noon', 'daypart carried for the accessible name');
eq(present(ctx(21)).leading.icon, 'preferences-system-time-symbolic', 'a symbolic fallback if the file fails');
eq(present({...ctx(3), starts: [5, 7, 11, 13, 18, 1]}).leading.art, iconFor('night'), 'daypart-starts is used');
eq(present({...ctx(0), starts: [5, 7, 11, 13, 18, 1]}).leading.art, iconFor('evening'), 'custom starts: 0:30 is evening');
eq(present({...ctx(3), starts: 'bad'}).leading.art, iconFor('night'), 'bad starts: the defaults');

const styled = s => present(ctx(9), {'idle-clock-style': s});
eq([styled('icon-time').leading !== null, styled('icon-time').text], [true, '21∶30'], 'icon-time: picture and time');
eq([styled('time').leading, styled('time').text], [null, '21∶30'], 'time: time only');
eq([styled('icon').leading !== null, styled('icon').text], [true, null], 'icon: picture only');
eq([styled('seconds').leading !== null, styled('seconds').text], [true, '21∶30'], 'seconds: picture and time');
eq(styled('weird').leading !== null && styled('weird').text === '21∶30', true, 'unknown style: the default');
eq(present({now: at(9), clock: ''}).text, null, 'no clock text yet: no text');
eq(present({now: at(9), clock: undefined}).text, null, 'missing clock: no text, no throw');

eq(seconds({'idle-clock-style': 'seconds'}), true, 'seconds style ticks every second');
eq(['icon-time', 'time', 'icon', undefined].map(s => seconds({'idle-clock-style': s})), [false, false, false, false],
    'other styles tick every minute');

// --- planIdle with a plan ----------------------------------------------------------------
eq(planIdle({light: 'off'}), {light: 'off', leading: null, text: null, trailing: null}, 'none: the grey light only');
let p = planIdle({light: 'off', plan: present(ctx(21))});
eq(p.light, null, 'a plan shows: no grey light (SPEC §2a: grey only with none)');
eq(p.leading, {type: 'art', src: iconFor('evening'), fallback: 'preferences-system-time-symbolic'}, 'the picture as art');
eq(p.text, '21∶30', 'the time');
p = planIdle({light: 'missed', plan: present(ctx(21))});
eq(p.light, 'missed', 'amber still shows beside the clock');
eq(planIdle({light: 'waiting', plan: present(ctx(21))}).light, 'waiting', 'red too');
eq(planIdle({light: 'off', plan: {leading: {mascot: 'idle'}}}).leading.type, 'mascot', 'a plan may lead with Bu (M4 eyes are separate)');

print('clock: ok');
