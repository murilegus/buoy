// Run: gjs -m tests/smartstack.test.js   (pure: which idle plan `auto` shows)
import {HOLD, candidates, choose, scrollTo, stackOrder, intervalMs} from '../src/buoy@murilegus/lib/kit/smartstack.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const p = (id, score) => ({id, score});

// --- the first plan, and what stays between turns ----------------------------------------
eq(HOLD, 80, 'hold at 80 (SPEC §2a-iii)');
eq(choose({plans: [p('calendar', 25), p('weather', 35), p('clock', 10)]}), 'weather', 'the first plan shown: the highest');
eq(choose({plans: [p('clock', 10), p('mascot', 10)]}), 'clock', 'the first, a tie: idle-auto-plans order');
eq(choose({plans: [p('calendar', null), p('weather', null), p('clock', 10)]}), 'clock', 'null plans leave: the clock');
eq(choose({plans: [p('calendar', null), p('weather', null)]}), null, 'nothing to show at all: null');
eq(choose({plans: []}), null, 'no plans: null');
eq(choose({plans: [p('a', NaN), p('b', '50'), p('c', 1)]}), 'c', 'only numbers are scores');
eq(candidates([p('a', 1), null, {id: 3, score: 2}, p('b', null)]).map(x => x.id), ['a'], 'candidates: valid ids and scores');
eq(choose({plans: [p('weather', 35), p('clock', 10)], current: 'clock'}), 'clock',
    'between turns the shown plan stays, though lower (a re-rank changes nothing)');
eq(choose({plans: [p('weather', 35), p('clock', 10)], current: 'gone'}), 'weather', 'the shown plan left: the highest');

// --- every plan takes its turn (2026-11-08, Ethan: "an idle pill just rotates") ------------
{
    const plans = [p('calendar', 25), p('weather', 35), p('clock', 10)];
    const order = [];
    let cur = choose({plans});
    for (let i = 0; i < 4; i++) {
        order.push(cur);
        cur = choose({plans, current: cur, turn: true});
    }
    eq(order, ['weather', 'clock', 'calendar', 'weather'], 'a turn: the next in the stack\'s order, round — the weather\'s 35 no longer keeps the clock off');
    eq(choose({plans: [p('weather', 35), p('calendar', null), p('clock', 10)], current: 'weather', turn: true}), 'clock',
        'a plan with nothing to show is skipped');
    eq(choose({plans: [p('weather', 35)], current: 'weather', turn: true}), 'weather', 'alone: a turn changes nothing');
}

// --- hold ----------------------------------------------------------------------------------
{
    eq(choose({plans: [p('calendar', 90), p('clock', 10)], current: 'calendar', turn: true}), 'calendar', 'at 90 it holds through a turn');
    eq(choose({plans: [p('calendar', 80), p('clock', 10)], current: 'calendar', turn: true}), 'calendar', 'exactly 80 holds');
    eq(choose({plans: [p('calendar', 79), p('clock', 10)], current: 'calendar', turn: true}), 'clock', '79 does not: its turn passes');
    eq(choose({plans: [p('weather', 35), p('calendar', 90)], current: 'weather'}), 'calendar', 'a plan reaching 80+ shows at once');
    eq(choose({plans: [p('calendar', 80), p('x', 90)], current: 'calendar', turn: true}), 'x', 'a higher hold wins');
    eq(choose({plans: [p('a', 90), p('b', 90)], current: 'b', turn: true}), 'b', 'two held, tied: the shown one stays');
}

// --- scroll and the pin --------------------------------------------------------------------
{
    const plans = [p('calendar', 25), p('weather', null), p('clock', 10), p('x', 5)];
    eq([scrollTo(plans, 'calendar', 1), scrollTo(plans, 'clock', 1), scrollTo(plans, 'x', 1)], ['clock', 'x', 'calendar'],
        'next: skips the null plan, round');
    eq([scrollTo(plans, 'calendar', -1), scrollTo(plans, 'clock', -1)], ['x', 'calendar'], 'previous, round');
    eq([scrollTo(plans, 'weather', 1), scrollTo(plans, 'weather', -1)], ['calendar', 'x'], 'from a plan not in the stack');
    eq(scrollTo([p('a', null)], 'a', 1), null, 'nothing to scroll to');
    eq(choose({plans, current: 'clock', pinned: 'clock'}), 'clock', 'pinned: stays though lower');
    eq(choose({plans, current: 'clock', pinned: 'clock', turn: true}), 'x', 'the next turn lets go: the next plan comes');
    eq(choose({plans, current: 'clock', pinned: 'weather'}), 'clock', 'pinned to one with nothing to show: the shown one stays');
}

// --- the key -------------------------------------------------------------------------------
eq(stackOrder(['calendar', 'weather', 'clock'], ['clock', 'weather', 'calendar']), ['calendar', 'weather', 'clock'],
    'the key\'s order, not the modules\'');
eq(stackOrder(['calendar', 'news', 'clock', 'clock'], ['clock', 'calendar']), ['calendar', 'clock'],
    'unknown or off plans dropped, each once');
eq([stackOrder(null, ['clock']), stackOrder([3, 'clock'], ['clock'])], [[], ['clock']], 'bad values');
eq([intervalMs(5), intervalMs(2), intervalMs(30)].map(ms => ms / 60000), [5, 2, 30], 'interval in minutes');
eq([intervalMs(1), intervalMs(99), intervalMs(undefined), intervalMs(2.5)].map(ms => ms / 60000), [2, 30, 5, 5],
    'clamped 2–30, 5 when unset or not whole');

print('smartstack: ok');
