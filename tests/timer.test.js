// Run: gjs -m tests/timer.test.js   (pure: FEATURES M4 "Timer"; design/compact "Hẹn giờ")
import adapter, {ADD, AGAIN, DISMISS, DONE, NEXT, PAUSE, RESTART, RESUME, STOP} from '../src/buoy@murilegus/lib/modules/timer/adapter.js';
import {
    MAX_SECONDS, POMODORO, QUICK, addMinute, clockText, deserialize, lengthText, nextEnd, ordered, pauseTimer, pomodoroAgain,
    pomodoroNext, pomodoroOf, pomodoroStart, presetsFromClocks, presetsToClocks, remaining, resumeTimer, savedLength, serialize,
    setupText, split, startTimer, titleOf,
} from '../src/buoy@murilegus/lib/modules/timer/model.js';
import {element, planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {PRIORITY, tierOf, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const S = 1000;
const NOW = new Date(2026, 10, 22, 15, 35, 0).getTime();

eq(QUICK, [1, 3, 5, 10, 15, 30], 'the quick lengths');
eq(POMODORO, {work: 25, break: 5, long: 15, rounds: 4}, 'Pomodoro\'s defaults');
eq(PRIORITY.timer, 20, 'above music, below notifications');

// --- how times read ----------------------------------------------------------------------------------
eq([198 * S, 197.2 * S, 0, -5, 3723 * S, 59.001 * S, NaN].map(clockText), ['3:18', '3:18', '0:00', '0:00', '1:02:03', '1:00', '0:00'],
    'a countdown: whole seconds up');
eq([300, 3725, 0].map(setupText), ['0:05:00', '1:02:05', '0:00:00'], 'the setup, h:mm:ss as Clocks');
eq([420, 5400, 45, 3605, 0].map(lengthText), ['7 min', '1 h 30 min', '45 s', '1 h 5 s', '0 s'], 'a length in words');

// --- GNOME Clocks' saved timers -----------------------------------------------------------------------
eq(presetsFromClocks([{duration: 420, name: 'Luộc trứng'}, {duration: 180}, {duration: 0, name: 'x'}, {duration: 'a'}, null, {duration: 400000}]),
    [{seconds: 420, name: 'Luộc trứng'}, {seconds: 180, name: ''}, {seconds: MAX_SECONDS, name: ''}], 'Clocks\' list: no length dropped, past 99:59:59 cut');
eq(presetsFromClocks(null), [], 'none');
eq(presetsToClocks([{seconds: 420, name: 'Luộc trứng'}, {seconds: 180, name: ''}]), [{duration: 420, name: 'Luộc trứng'}, {duration: 180}],
    'back to Clocks: no name, no key (as Clocks writes)');
eq([savedLength([{seconds: 300, name: ''}], 300), savedLength([], 300)], [true, false], 'a length already saved');

// --- running -----------------------------------------------------------------------------------------------
const egg = startTimer({seconds: 420, name: ' Luộc trứng '}, 'a', NOW);
eq([egg.state, egg.end, egg.name, egg.pomodoro], ['running', NOW + 420 * S, 'Luộc trứng', null], 'started: running, its end');
eq(startTimer({seconds: 0}, 'b', NOW).seconds, 1, 'at least a second');
eq(startTimer({seconds: 10 ** 9}, 'b', NOW).seconds, MAX_SECONDS, 'at most Clocks\' longest');
eq(remaining(egg, NOW + 222 * S), 198 * S, 'what is left');
const paused = pauseTimer(egg, NOW + 222 * S);
eq([paused.state, paused.left, remaining(paused, NOW + 999 * S)], ['paused', 198 * S, 198 * S], 'paused: its time left stays');
eq(pauseTimer(paused, NOW), paused, 'paused twice: as it was');
const back = resumeTimer(paused, NOW + 500 * S);
eq([back.state, back.end], ['running', NOW + 698 * S], 'resumed: from what was left');
eq(resumeTimer(egg, NOW), egg, 'resuming a running one: as it was');
eq([addMinute(egg, NOW).end, addMinute(egg, NOW).seconds], [NOW + 480 * S, 480], '+1 min: the end and the length (the ring stays true)');
eq(addMinute(paused, NOW).left, 258 * S, '+1 min paused: to what is left');
eq(addMinute({...egg, seconds: MAX_SECONDS}, NOW).seconds, MAX_SECONDS, '+1 min past the longest: no');

const tea = startTimer({seconds: 180, name: 'Pha trà'}, 'c', NOW);
const {done, left} = split([egg, tea, paused], NOW + 180 * S);
eq([done.map(t => t.id), left.map(t => t.id)], [['c'], ['a', 'a']], 'tea ended, the eggs not; a paused one never ends');
eq(nextEnd([egg, tea, paused]), NOW + 180 * S, 'the one timeout: the soonest end');
eq(nextEnd([paused]), null, 'only paused: no timeout');
eq(ordered([paused, egg, tea], NOW).map(t => `${t.id}:${t.state}`), ['c:running', 'a:running', 'a:paused'], 'running first, soonest first; then the paused');

eq([titleOf(egg), titleOf({...egg, name: ''})], ['Luộc trứng', 'Timer'], 'its name, or Timer');

// --- Pomodoro ---------------------------------------------------------------------------------------------------
eq(pomodoroOf({work: 50, break: 0, long: 200, rounds: 3}), {work: 50, break: 5, long: 15, rounds: 3}, 'prefs: out of range is the default');
eq(pomodoroOf(null), POMODORO, 'no prefs: the defaults');
const p1 = pomodoroStart(null);
eq([p1.seconds, p1.pomodoro, titleOf({...p1, name: 'Pomodoro'})], [1500, {phase: 'work', round: 1, rounds: 4}, 'Focus 1/4'], 'starts with focus 1/4');
const b1 = pomodoroNext(p1.pomodoro, null);
eq([b1.seconds, b1.pomodoro, titleOf(b1)], [300, {phase: 'break', round: 1, rounds: 4}, 'Break'], 'focus done: a break of 5');
eq(pomodoroNext(b1.pomodoro, null).pomodoro, {phase: 'work', round: 2, rounds: 4}, 'break done: focus 2/4');
const longB = pomodoroNext({phase: 'work', round: 4, rounds: 4}, null);
eq([longB.seconds, longB.pomodoro.phase], [900, 'long'], 'after the last round: the long break');
eq(pomodoroNext(longB.pomodoro, null).pomodoro, {phase: 'work', round: 1, rounds: 4}, 'after the long break: round 1 again');
eq(pomodoroNext(null, null), null, 'not Pomodoro: nothing next');
eq(pomodoroAgain({phase: 'work', round: 2, rounds: 4}, null).pomodoro, {phase: 'work', round: 3, rounds: 4}, 'Keep Going: the next focus, no break');
eq(pomodoroAgain({phase: 'work', round: 4, rounds: 4}, null).pomodoro.round, 4, 'Keep Going after the last: stays at the last');
eq(pomodoroNext(p1.pomodoro, {work: 50, break: 10, long: 20, rounds: 2}).seconds, 600, 'the prefs\' lengths');

// --- kept over a restart -------------------------------------------------------------------------------------------
const kept = deserialize(serialize([egg, paused, {...egg, id: 'p', pomodoro: {phase: 'break', round: 2, rounds: 4}}]));
eq(kept.map(t => [t.id, t.state, t.state === 'running' ? t.end : t.left, t.pomodoro?.phase ?? null]),
    [['a', 'running', NOW + 420 * S, null], ['a', 'paused', 198 * S, null], ['p', 'running', NOW + 420 * S, 'break']], 'ends and what is left, kept');
eq([deserialize(''), deserialize('{'), deserialize('[{"id":"x"}]'), deserialize('[{"id":"x","seconds":5,"state":"running"}]'), deserialize(null)],
    [[], [], [], [], []], 'malformed: dropped');
eq(deserialize('[{"id":"x","seconds":5,"state":"paused","left":3000,"pomodoro":{"phase":"nap"}}]')[0].pomodoro, null, 'a bad Pomodoro turn: none');

// --- the adapter: running --------------------------------------------------------------------------------------------
const did = [];
const run = o => adapter.timer({kind: 'running', title: 'Luộc trứng', seconds: 420, end: NOW + 198 * S, left: 0, paused: false, more: 0, act: id => did.push(id), ...o});
const r = run();
eq([r.text, r.leading, r.trailing, r.ttl], ['Luộc trứng', {ring: {from: NOW - 222 * S, until: NOW + 198 * S}}, {until: NOW + 198 * S}, 0],
    'pill: the ring left, the name, counting down');
eq([r.compact.card.title, r.compact.card.app, r.compact.card.close], ['Luộc trứng', '7 min · ends 15:38', DISMISS], 'card: the length and when it ends, ×');
eq(r.actions.map(a => [a.id, a.main ?? false]), [[PAUSE, true], [ADD, false], [STOP, false]], 'Pause (cream), +1 min, Stop');
eq(run({more: 1}).trailing, {until: NOW + 198 * S, more: 1}, 'another running: "+1"');
const pz = run({paused: true, left: 198 * S});
eq([pz.leading, pz.trailing, pz.compact.card.app, pz.actions[0].id], [{progress: 198 / 420}, {text: '3:18'}, 'Paused · 3:18 left', RESUME],
    'paused: the ring still, the number still, Resume');
eq(run({paused: true, left: 198 * S, more: 2}).trailing, {text: '+2 3:18'}, 'paused, others too');
r.onAction(PAUSE);
r.onAction(DISMISS);
eq(did, [PAUSE, DISMISS], 'its buttons reach the source');

// --- the adapter: ended -----------------------------------------------------------------------------------------------
const end = o => adapter.timer({kind: 'ended', name: 'Luộc trứng', seconds: 420, at: NOW + 198 * S, pomodoro: null, next: null, clocks: false, act: () => {}, ...o});
const e = end();
eq([e.text, e.compact.card.title, e.compact.card.app, e.compact.card.close, e.ttl], ['Time\'s up', 'Time\'s up · Luộc trứng', '7 min · 15:38', DONE, 0],
    'ended: "Time\'s up · Luộc trứng", it waits; × is Done');
eq([e.alertStays, r.alertStays ?? false], [true, false], 'its card stays open till answered; the running one\'s does not');
eq([e.compact.card.icon, e.compact.card.picture], [null, {icon: 'alarm-symbolic', backdrop: true}], 'the alarm on its plate');
eq(e.actions.map(a => [a.id, a.main ?? false]), [[RESTART, false], [DONE, true]], 'Restart, Done (cream)');
eq(end({name: ''}).compact.card.title, 'Time\'s up · Timer', 'no name: Timer');
const clocks = end({clocks: true, name: '', seconds: 0});
eq([clocks.compact.card.title, clocks.compact.card.app, clocks.actions.map(a => a.id)], ['Time\'s up', 'Clocks', [DONE]],
    'Clocks\' own timer: no name, no Restart (it is Clocks\')');
const brk = end({pomodoro: {phase: 'work', round: 2, rounds: 4}, seconds: 1500, next: {title: 'Break', seconds: 300}});
eq([brk.text, brk.compact.card.title, brk.compact.card.app, brk.actions.map(a => a.id)],
    ['Break', 'Break · 5 min', 'Round 2/4 done · 25 min', [NEXT, AGAIN, STOP]], 'focus done: take the break, keep going, or stop');
const foc = end({pomodoro: {phase: 'break', round: 2, rounds: 4}, seconds: 300, next: {title: 'Focus 3/4', seconds: 1500}});
eq([foc.compact.card.title, foc.compact.card.app, foc.actions.map(a => a.id)], ['Focus 3/4 · 25 min', 'Break over · 5 min', [NEXT, STOP]],
    'break done: start the next focus, or stop');

// --- through the kit -----------------------------------------------------------------------------------------------------
const a = validate({...r, id: 'timer:running', kind: 'timer', source: 'timer'});
eq(tierOf(a), 2, 'running: not "needs you"');
eq(planMinimal(a).leading, {type: 'until-ring', from: NOW - 222 * S, at: NOW + 198 * S}, 'minimal: the ring that counts down');
eq(planMinimal(a).trailing, {type: 'until', at: NOW + 198 * S}, 'minimal: the countdown');
eq(planCompact(a)?.card?.title, 'Luộc trứng', 'compact is a card');
eq(element({until: 5, more: 2}), {type: 'until', at: 5, more: 2}, '{until, more}');
eq(element({ring: {from: 10, until: 5}}), null, 'a ring ending before it starts: none');
eq(element({ring: {from: 1}}), null, 'a ring with no end: none');

print('timer: ok');
