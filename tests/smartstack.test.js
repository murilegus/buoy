// Run: gjs -m tests/smartstack.test.js   (pure: which idle plan `auto` shows)
import {HOLD, candidates, choose, scrollTo, stackOrder, intervalMs} from '../src/buoy@murilegus/lib/kit/smartstack.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const p = (id, score) => ({id, score});

// --- ranking -----------------------------------------------------------------------------
eq(HOLD, 80, 'hold at 80 (SPEC §2a-iii)');
eq(choose({plans: [p('calendar', 25), p('weather', 35), p('clock', 10)]}), 'weather', 'the highest score shows');
eq(choose({plans: [p('calendar', 90), p('weather', 75), p('clock', 10)]}), 'calendar', 'a meeting soon beats a rain change');
eq(choose({plans: [p('calendar', null), p('weather', null), p('clock', 10)]}), 'clock', 'null plans leave: the clock floor');
eq(choose({plans: [p('calendar', null), p('weather', null)]}), null, 'nothing to show at all: null');
eq(choose({plans: []}), null, 'no plans: null');
eq(choose({plans: [p('a', NaN), p('b', '50'), p('c', 1)]}), 'c', 'only numbers are scores');
eq(candidates([p('a', 1), null, {id: 3, score: 2}, p('b', null)]).map(x => x.id), ['a'], 'candidates: valid ids and scores');

// --- ties take turns, only on a turn -------------------------------------------------------
{
    const plans = [p('clock', 10), p('mascot', 10)];
    eq(choose({plans}), 'clock', 'a tie, nothing shown yet: idle-auto-plans order');
    eq(choose({plans, current: 'clock'}), 'clock', 'a re-rank between turns keeps the shown one');
    eq(choose({plans, current: 'clock', turn: true, shownAt: {clock: 100}}), 'mascot', 'a turn: the other tied plan');
    eq(choose({plans, current: 'mascot', turn: true, shownAt: {clock: 100, mascot: 200}}), 'clock', 'and back');
    const three = [p('a', 35), p('b', 35), p('c', 35)];
    eq(choose({plans: three, current: 'a', turn: true, shownAt: {a: 300, b: 100, c: 200}}), 'b', 'the one shown longest ago');
    eq(choose({plans: three, current: 'a', turn: true, shownAt: {a: 300, c: 200}}), 'b', 'never shown counts as longest ago');
    eq(choose({plans: three, current: 'a', turn: true, shownAt: {a: 300}}), 'b', 'two never shown: the key\'s order');
    eq(choose({plans: [p('a', 35), p('b', 10)], current: 'a', turn: true, shownAt: {a: 1}}), 'a', 'alone at the top: a turn changes nothing');
    eq(choose({plans: [p('a', 35), p('b', 50)], current: 'a'}), 'b', 'a higher one between turns: it shows at once');
    eq(choose({plans: [p('a', 35), p('b', 35)], current: 'gone', turn: false, shownAt: {a: 5, b: 1}}), 'b',
        'the shown plan left: the tie shown longest ago');
}

// --- hold ----------------------------------------------------------------------------------
{
    const plans = [p('calendar', 90), p('other', 90)];
    eq(choose({plans, current: 'calendar', turn: true, shownAt: {calendar: 9, other: 1}}), 'calendar',
        'at 90 it holds through a turn, even tied');
    eq(choose({plans: [p('calendar', 80), p('x', 80)], current: 'calendar', turn: true}), 'calendar', 'exactly 80 holds');
    eq(choose({plans: [p('calendar', 79), p('x', 79)], current: 'calendar', turn: true, shownAt: {calendar: 2}}), 'x',
        '79 does not');
    eq(choose({plans: [p('calendar', 80), p('x', 90)], current: 'calendar', turn: true}), 'x', 'a higher one still wins over a hold');
    eq(choose({plans: [p('calendar', 50), p('weather', 75)], current: 'calendar'}), 'weather', 'the score dropped: no hold');
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
    eq(choose({plans, current: 'clock', pinned: 'clock', turn: true}), 'calendar', 'the next turn lets go');
    eq(choose({plans, current: 'clock', pinned: 'weather'}), 'calendar', 'pinned to one with nothing to show: ranked');
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
