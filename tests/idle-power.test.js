// Run: gjs -m tests/idle-power.test.js   (pure: the battery idle plan, FEATURES M4 "Idle plan `power`")
import idle, {WINDOW_MS, inWindow, present, relevance, stateWord} from '../src/buoy@murilegus/lib/modules/power/idle.js';
import {STATE, readBattery} from '../src/buoy@murilegus/lib/modules/power/adapter.js';
import {element, planCompact} from '../src/buoy@murilegus/lib/kit/model/presentation.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const NOW = new Date(2026, 10, 27, 15, 0, 0);
const T = NOW.getTime();
const B = (o = {}) => readBattery({present: true, state: STATE.DISCHARGING, percentage: 64, timeToEmpty: 12000, ...o});
const MODES = {active: 'balanced', list: ['power-saver', 'balanced', 'performance']};
const D = (o = {}) => ({battery: B(), modes: MODES, plugAt: null, estimate: null, ...o});

// --- the plan's shape ----------------------------------------------------------------------
eq([idle.keys, idle.ticks, typeof idle.present, typeof idle.relevance], [[], false, 'function', 'function'],
    'plan: no keys, no wall clock, present and relevance');

// --- nothing to show -----------------------------------------------------------------------
eq([present(), present({data: null}), present({data: D({battery: readBattery({present: false})})}),
    present({data: D({battery: B({percentage: NaN})})})], [null, null, null, null],
'present: no state, no battery (a desktop), percentage unknown → nothing');
eq([relevance(), relevance({now: NOW, data: D({battery: readBattery()})})], [null, null], 'relevance: no battery → null');

// --- the pill (option A) -------------------------------------------------------------------
{
    const p = present({now: NOW, data: D()});
    eq([p.leading, p.text, p.trailing], ['battery-good-symbolic', '64%', {icon: 'power-profile-balanced-symbolic', subtle: true}],
        'pill: battery icon, percentage, the mode a subtle icon at the end');
    eq(element(p.trailing), {type: 'icon', icon: 'power-profile-balanced-symbolic', subtle: true}, 'pill: the trailing keeps subtle through the contract');
    eq(present({now: NOW, data: D({modes: null})}).trailing, null, 'pill: no power modes → no trailing');
    eq(present({now: NOW, data: D({modes: {active: null, list: MODES.list}})}).trailing, null, 'pill: an unknown mode → no trailing');
    eq(present({now: NOW, data: D({battery: B({state: STATE.CHARGING, percentage: 82, timeToFull: 2520})})}).leading,
        'battery-good-charging-symbolic', 'pill: charging icon');
    eq(present({now: NOW, data: D({battery: B({percentage: 12})})}).leading, 'battery-low-symbolic', 'pill: low icon under 20 %');
    eq(present({now: NOW, data: D({battery: B({state: STATE.PENDING_CHARGE, percentage: 80})})}).text, '80%', 'pill: held at a limit, the percentage alone');
}

// --- the minute after a plug ---------------------------------------------------------------
{
    const charging = B({state: STATE.CHARGING, percentage: 72, timeToFull: 4200});
    eq(present({now: NOW, data: D({battery: charging, plugAt: T - 5000})}).text, '72%', 'window: no estimate yet → the percentage alone');
    eq(present({now: NOW, data: D({battery: charging, plugAt: T - 12000, estimate: {state: STATE.CHARGING, timeToFull: 4200}})}).text,
        '72% · full in 1 h 10 min', 'window: the first estimate, in full');
    eq(present({now: NOW, data: D({battery: B({timeToEmpty: 999999}), plugAt: T - 12000, estimate: {state: STATE.DISCHARGING, timeToEmpty: 12000}})}).text,
        '64% · 3 h 20 min left', 'window: an unplug says the time left — the kept estimate, not the latest');
    eq(present({now: NOW, data: D({battery: charging, plugAt: T - WINDOW_MS, estimate: {state: STATE.CHARGING, timeToFull: 4200}})}).text,
        '72%', 'window: over after a minute');
    eq(present({now: NOW, data: D({battery: charging, plugAt: T - 5000, estimate: {state: STATE.FULL}})}).text, '72%',
        'window: an estimate with no time (full) says nothing more');
    eq([inWindow(D({plugAt: T + 1000}), NOW), inWindow(D({plugAt: 'x'}), NOW), inWindow(null, NOW), inWindow(D({plugAt: T}), NOW)],
        [false, false, false, true], 'window: a plug in the future or not a number is no window');
}

// --- the compact (option Y) ----------------------------------------------------------------
{
    const p = present({now: NOW, data: D({battery: B({state: STATE.CHARGING, percentage: 82, timeToFull: 2520})})});
    eq(p.compact.card, {picture: {icon: 'battery-good-charging-symbolic', backdrop: true}, title: 'Battery · 82% · charging', app: 'Full in 42 min · Balanced', tight: true},
        'compact: the battery in the head, the time and the mode below');
    eq(p.actions.map(a => [a.id, a.label, a.selected]),
        [['power-saver', 'Power Saver', false], ['balanced', 'Balanced', true], ['performance', 'Performance', false]],
        'compact: the three modes as buttons, the active one selected');
    const plan = planCompact(p);
    eq([plan.card.title, plan.card.actions?.length ?? plan.actions?.length], ['Battery · 82% · charging', 3], 'compact: planned as a card with its three buttons');
    eq(present({now: NOW, data: D()}).compact.card.app, '3 h 20 min left · Balanced', 'compact: on battery, the time left');
    eq(present({now: NOW, data: D({battery: B({state: STATE.FULL, percentage: 100})})}).compact.card,
        {picture: {icon: 'battery-full-symbolic', backdrop: true}, title: 'Battery · 100% · fully charged', app: 'Balanced', tight: true},
        'compact: full, no time, the mode alone');
    const bare = present({now: NOW, data: D({modes: null})});
    eq([bare.compact, bare.actions], [{leading: 'battery-good-symbolic', text: 'Battery · 64%', subtitle: '3 h 20 min left'}, []],
        'compact: no power modes → the head alone, no buttons');
    eq(present({now: NOW, data: D({modes: {active: 'balanced', list: ['balanced', 'turbo']}})}).actions.map(a => a.id), ['balanced'],
        'compact: a mode Buoy does not know is not a button');
    eq(present({now: NOW, data: D()}).accessibleName, 'Battery · 64%, 3 h 20 min left, Balanced', 'accessible name');
}

// --- words ---------------------------------------------------------------------------------
eq([STATE.CHARGING, STATE.DISCHARGING, STATE.PENDING_CHARGE, STATE.PENDING_DISCHARGE].map(s => stateWord(B({state: s}))),
    ['charging', null, 'plugged in', null], 'state word: charging, on battery none, held at a limit plugged in');
eq([stateWord(B({state: STATE.FULL, percentage: 100})), stateWord(B({state: STATE.FULL, percentage: 96}))],
    ['fully charged', 'plugged in'], 'state word: full only at 100 % (Ethan, 2026-11-16)');

// --- auto ----------------------------------------------------------------------------------
const score = o => relevance({now: NOW, data: D(o)})?.score ?? null;
eq([score({plugAt: T - 1000}), score({plugAt: T - WINDOW_MS + 1}), score({plugAt: T - WINDOW_MS})], [80, 80, 30],
    'auto: 80 for the minute after a plug (holds), then back');
eq([score({battery: B({percentage: 29})}), score({battery: B({percentage: 30})}), score({battery: B({state: STATE.CHARGING})}),
    score({battery: B({state: STATE.FULL, percentage: 100})}), score({battery: B({state: STATE.PENDING_CHARGE, percentage: 80})})],
[60, 30, 25, 15, 15], 'auto: on battery under 30 % 60, on battery 30, charging 25, full or held 15');

print('idle-power: ok');
