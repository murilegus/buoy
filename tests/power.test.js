// Run: gjs -m tests/power.test.js   (pure: the power adapter, FEATURES M4 "Power")
import adapter, {
    TTL, SLOW_W, SLOW_BELOW, STATE, WARNING, readBattery, plugged, lowLevel, powerEvents, slow, duration,
} from '../src/buoy@murilegus/lib/modules/power/adapter.js';
import {PRIORITY, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';
import {planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {PROFILES, readProfiles} from '../src/buoy@murilegus/lib/kit/model/power.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function ok(cond, msg) {
    if (!cond)
        throw new Error(msg);
}

const B = (o = {}) => readBattery({present: true, state: STATE.DISCHARGING, percentage: 64, warning: WARNING.NONE, ...o});

// --- reading the proxy -----------------------------------------------------------------
eq(readBattery({present: true, state: 1, percentage: 71.6, timeToFull: 2520, timeToEmpty: 0, rate: 31.2, warning: 1}),
    {present: true, state: 1, percentage: 72, timeToFull: 2520, timeToEmpty: 0, rate: 31.2, warning: 1}, 'read: the fields, the percentage rounded');
eq(readBattery(), {present: false, state: 0, percentage: null, timeToFull: 0, timeToEmpty: 0, rate: null, warning: 1}, 'read: nothing known (proxy not loaded)');
eq([readBattery({percentage: 140}).percentage, readBattery({percentage: -3}).percentage, readBattery({percentage: NaN}).percentage],
    [100, 0, null], 'read: percentage clamped, NaN unknown');
eq([readBattery({rate: 0}).rate, readBattery({rate: -12}).rate, readBattery({rate: 'x'}).rate], [null, null, null], 'read: no rate unless positive');
eq([readBattery({timeToFull: -5}).timeToFull, readBattery({warning: 'low'}).warning, readBattery({present: 1}).present],
    [0, WARNING.NONE, false], 'read: bad times 0, bad warning none, present only when true');

// --- plugged, low ----------------------------------------------------------------------
eq([STATE.CHARGING, STATE.FULL, STATE.PENDING_CHARGE, STATE.DISCHARGING, STATE.EMPTY, STATE.PENDING_DISCHARGE, 0].map(plugged),
    [true, true, true, false, false, false, false], 'plugged: charging, full, held at a limit');
eq([WARNING.NONE, WARNING.DISCHARGING, WARNING.LOW, WARNING.CRITICAL, WARNING.ACTION].map(w => lowLevel(B({warning: w}))),
    [null, null, 'low', 'critical', 'action'], 'low: UPower\'s warning on battery');
eq(lowLevel(B({warning: WARNING.LOW, state: STATE.CHARGING})), null, 'low: never while plugged in');
eq(lowLevel(readBattery({present: false, warning: WARNING.LOW})), null, 'low: no battery, no warning');

// --- what changed ----------------------------------------------------------------------
eq(powerEvents(null, B()), {flash: null, low: null}, 'events: the first reading flashes nothing');
eq(powerEvents(null, B({warning: WARNING.LOW})), {flash: null, low: 'low'}, 'events: low at once, even on the first reading');
eq(powerEvents(B(), B({state: STATE.CHARGING})).flash, 'charging', 'events: plugged in → charging');
eq(powerEvents(B(), B({state: STATE.PENDING_CHARGE})).flash, 'charging', 'events: plugged in held at a limit → charging');
eq(powerEvents(B(), B({state: STATE.FULL})).flash, 'full', 'events: plugged in already full → full');
eq(powerEvents(B({state: STATE.CHARGING}), B()).flash, 'battery', 'events: unplugged → battery');
eq(powerEvents(B({state: STATE.CHARGING}), B({warning: WARNING.LOW})), {flash: null, low: 'low'}, 'events: unplugged low → the warning, no flash');
eq(powerEvents(B({state: STATE.CHARGING, percentage: 99}), B({state: STATE.FULL, percentage: 100})).flash, 'full', 'events: charged up → full');
eq(powerEvents(B({state: STATE.PENDING_CHARGE}), B({state: STATE.FULL})).flash, 'full', 'events: from the limit to full → full');
eq(powerEvents(B({state: STATE.FULL}), B({state: STATE.FULL, percentage: 99})).flash, null, 'events: still full → nothing');
eq(powerEvents(B({state: STATE.CHARGING}), B({state: STATE.CHARGING, percentage: 70})).flash, null, 'events: charging on → nothing');
eq(powerEvents(B(), B({percentage: 60})).flash, null, 'events: discharging on → nothing');
eq(powerEvents(B(), readBattery({present: false})), {flash: null, low: null}, 'events: the battery gone → nothing');
eq(powerEvents(readBattery({present: false}), B({state: STATE.CHARGING})).flash, null, 'events: first known reading after none → no flash');
eq(powerEvents(B({warning: WARNING.LOW}), B({warning: WARNING.CRITICAL})).low, 'critical', 'events: the warning rises');
eq(powerEvents(B({warning: WARNING.LOW}), B({state: STATE.CHARGING, warning: WARNING.LOW})), {flash: 'charging', low: null},
    'events: plugged in while low → charging, the warning goes');

// --- slow, duration --------------------------------------------------------------------
eq([SLOW_W, SLOW_BELOW], [20, 80], 'slow: below 20 W, under 80 %');
eq(slow(B({state: STATE.CHARGING, rate: 18, percentage: 40})), true, 'slow: 18 W at 40 %');
eq(slow(B({state: STATE.CHARGING, rate: 20, percentage: 40})), false, 'slow: 20 W is not');
eq(slow(B({state: STATE.CHARGING, rate: 12, percentage: 80})), false, 'slow: from 80 % every laptop tapers');
eq(slow(B({state: STATE.CHARGING, rate: null, percentage: 40})), false, 'slow: no rate, no word');
eq(slow(B({state: STATE.DISCHARGING, rate: 9, percentage: 40})), false, 'slow: only while charging');
eq([duration(2520), duration(7800), duration(10800), duration(60), duration(59), duration(0), duration(NaN), duration(89), duration(3570)],
    ['42 min', '2 h 10 min', '3 h', '1 min', null, null, null, '1 min', '1 h'], 'duration: minutes, hours, nothing under a minute');

// --- the pill --------------------------------------------------------------------------
const pill = ev => adapter.power({percentage: 72, state: STATE.CHARGING, timeToFull: 0, timeToEmpty: 0, rate: null, ...ev});
{
    const c = pill({what: 'charging'});
    eq([c.leading, c.text, c.trailing, c.ttl, c.priority, c.compact], ['battery-good-charging-symbolic', 'Charging', {text: '72%'}, TTL, PRIORITY.power, null],
        'charging, no estimate yet: "Charging · 72%", 3 s, 40, minimal only');
    eq(pill({what: 'charging', timeToFull: 2520}).text, 'Full in 42 min', 'charging with an estimate');
    const s = pill({what: 'charging', timeToFull: 7800, rate: 18.4, percentage: 40});
    eq([s.text, s.trailing, s.compact?.subtitle], ['18 W · slow charger', {text: '40%'}, '2 h 10 min'], 'slow: the watts in the pill, the estimate in the compact');
    eq(pill({what: 'battery', state: STATE.DISCHARGING, timeToEmpty: 12000}).text, '3 h 20 min left', 'unplugged: time left');
    eq(pill({what: 'battery', state: STATE.DISCHARGING}).text, 'On battery', 'unplugged, no estimate yet');
    const f = pill({what: 'full', state: STATE.FULL, percentage: 100});
    eq([f.leading, f.text, f.trailing, f.ttl], ['battery-full-symbolic', 'Fully charged', {text: '100%'}, TTL], 'full');
    eq(pill({what: 'full', state: STATE.FULL, percentage: 80}).trailing, {text: '80%'}, 'full at a charge limit: its real percentage');
    const l = pill({what: 'low', level: 'low', state: STATE.DISCHARGING, percentage: 18, timeToEmpty: 1500});
    eq([l.leading, l.text, l.trailing, l.ttl, l.priority], ['battery-low-symbolic', 'Low battery', {text: '18%'}, 0, PRIORITY.notification],
        'low: stays (ttl 0), priority 70 like the notification it replaces');
    eq([l.compact.text, l.compact.subtitle], ['Low battery', '25 min left'], 'low: the compact says the time left');
    eq(l.attributes, {low: 'low', percentage: 18}, 'low: what the notification module reads');
    const crit = pill({what: 'low', level: 'critical', state: STATE.DISCHARGING, percentage: 4});
    eq([crit.text, crit.compact.subtitle], ['Battery almost empty', 'Plug in now'], 'critical: no estimate → "Plug in now"');
    eq(pill({what: 'charging'}).attributes, {}, 'a flash carries no low');
    eq(pill({what: 'nonsense'}), null, 'unknown event: nothing');
    eq(adapter.power(null), null, 'no event: nothing');
    eq(pill({what: 'charging', percentage: null}).trailing, null, 'no percentage: no trailing');
    let opened = null;
    pill({what: 'charging', open: id => (opened = id)}).onPress();
    eq(opened, 'gnome-power-panel.desktop', 'a click opens Settings → Power');
    eq(pill({what: 'charging'}).onPress, null, 'no opener: no click');
    // the kit takes it
    const a = validate({id: 'power:system:flash', kind: 'power', ...pill({what: 'charging', timeToFull: 2520})});
    const m = planMinimal(a);
    ok(m.text === 'Full in 42 min', 'kit: the minimal shows the text');
}

print('power: ok');

// --- the power modes (kit/model/power.js) ----------------------------------------------
eq(readProfiles({available: true, active: 'balanced', profiles: ['performance', 'balanced', 'power-saver']}),
    {active: 'balanced', list: ['power-saver', 'balanced', 'performance']}, 'modes: low to high, whatever the daemon\'s order');
eq(readProfiles({available: true, active: 'balanced', profiles: ['power-saver', 'balanced']}).list,
    ['power-saver', 'balanced'], 'modes: no performance (no driver for it): two');
eq(readProfiles({available: true, active: 'custom', profiles: ['balanced', 'custom']}), {active: null, list: ['balanced']},
    'modes: one Buoy does not know is left out; active one of them → null');
eq([readProfiles({available: false, active: 'balanced', profiles: ['balanced']}), readProfiles({available: true, profiles: []}),
    readProfiles({available: true, profiles: 'x'}), readProfiles()], [null, null, null, null],
'modes: no daemon, nothing offered, bad data: none');
eq(Object.values(PROFILES).map(p => p.name), ['Power Saver', 'Balanced', 'Performance'], 'modes: GNOME\'s names (powerProfiles.js PROFILE_PARAMS)');

// --- the mode flash and its compact (design/compact "Đổi chế độ", option C) -------------
const set = [];
const M = (o = {}) => adapter.power({
    what: 'mode', profile: 'balanced', profiles: ['power-saver', 'balanced', 'performance'],
    percentage: 82, state: STATE.CHARGING, setProfile: p => set.push(p), ...o,
});
const m = M();
eq([m.leading, m.text, m.trailing, m.ttl, m.priority], ['power-profile-balanced-symbolic', 'Balanced', null, TTL, PRIORITY.power],
    'mode: its icon and name, no trailing, 3 s at the kind\'s priority');
eq(m.compact.card, {picture: {icon: 'power-profile-balanced-symbolic', backdrop: true}, title: 'Power Mode', app: 'Balanced · battery 82%, charging', tight: true},
    'mode compact: the icon on its plate, "Power Mode", the mode and the battery; the buttons tight under it');
eq(m.actions.map(a => [a.id, a.label, a.selected]), [['power-saver', 'Power Saver', false], ['balanced', 'Balanced', true], ['performance', 'Performance', false]],
    'mode compact: the modes as buttons, the one in use selected');
eq(m.minimalAction, false, 'mode: no button in the pill itself');
m.onAction('performance');
m.onAction('nope');
eq(set, ['performance'], 'mode: a button switches to its mode; an unknown id does nothing');
eq(M({state: STATE.DISCHARGING, percentage: 40}).compact.card.app, 'Balanced · battery 40%', 'mode compact: on battery, no "charging"');
eq([M({state: STATE.FULL, percentage: 100}).compact.card.app, M({state: STATE.PENDING_CHARGE, percentage: 80}).compact.card.app],
    ['Balanced · fully charged', 'Balanced · plugged in, 80%'], 'mode compact: plugged in and full, or held at a limit: not "battery"');
eq(M({percentage: null}).compact.card.app, 'Balanced', 'mode compact: no battery (a desktop): the mode alone');
eq(M({setProfile: null}).actions, [], 'mode: nothing to switch with: no buttons');
eq(M({profile: 'custom'}), null, 'mode: one Buoy does not know: no pill');
eq(M({profiles: ['balanced', 'turbo']}).actions.map(a => a.id), ['balanced'], 'mode: only known modes as buttons');
const mv = validate({id: 'power:system:mode', kind: 'power', app: 'system', ...m});
const plan = planCompact(mv);
eq([plan.card.tight, plan.actions.map(a => a.selected), plan.actions.map(a => a.icon)],
    [true, [false, true, false], ['power-profile-power-saver-symbolic', 'power-profile-balanced-symbolic', 'power-profile-performance-symbolic']],
    'kit: the plan keeps tight, selected and each icon');
eq(planMinimal(mv).actions ?? [], [], 'kit: the minimal pill has no button (minimalAction false)');
const plain = planCompact(validate({id: 'n', kind: 'notification', app: 'x', text: 'Hi', compact: {card: {title: 'Hi', app: 'X'}}, actions: [{id: 'a', label: 'Reply'}]}));
eq(['selected' in plain.actions[0], 'tight' in plain.card], [false, false], 'kit: other buttons get no `selected`, other cards are not tight');
eq(planMinimal(validate({id: 'p', kind: 'power', app: 'system', ...adapter.power({what: 'battery', percentage: 64, timeToEmpty: 12000})})).trailing,
    {type: 'text', text: '64%'}, 'kit: the percentage is drawn as text (a bare string would be an icon\'s name)');
