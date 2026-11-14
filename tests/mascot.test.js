// Run: gjs -m tests/mascot.test.js   (pure: Bu's grids against MASCOT.md, frames, lamp)
import GLib from 'gi://GLib';

import {
    FRAMES, POSES, PALETTE, FOREGROUND, LIGHT_LAMPS, FRAME_MS, ONCE_FRAMES, SIZE,
    poseName, moves, lampColour, frameAt, cells, HELLO_MS, helloAt,
    EYE_MODES, eyesMode, STROLL, STEP_MS, BLINK_MS, nextBeat, beatFrames, eyesShapes, EYES_BOX,
    EYE_RESTS, eyesRest, EXPRESSIONS, ENTER_MS, eyesEnter, HOLD, HOLD_FRAMES, holdPlays, releaseEyes,
} from '../src/buoy@murilegus/lib/kit/model/mascot.js';
import plan from '../src/buoy@murilegus/lib/modules/mascot/idle.js';
import {element, planIdle, planMinimal, planCompact, planExpanded} from '../src/buoy@murilegus/lib/kit/model/presentation.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function ok(cond, msg) {
    if (!cond)
        throw new Error(msg);
}

// --- MASCOT.md is the source ----------------------------------------------------------
const docPath = GLib.build_filenamev([GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]),
    '..', 'docs', 'MASCOT.md']);
const doc = new TextDecoder().decode(GLib.file_get_contents(docPath)[1]);
const blocks = [...doc.matchAll(/```bu\n([\s\S]*?)```/g)].map(m => m[1].replace(/\n$/, '').split('\n'));
ok(blocks.length > 0, 'MASCOT.md has ```bu blocks');

const docFrames = {}, docLamps = {};
for (const [head, ...rows] of blocks) {
    const m = head.match(/^(\S+)\s+lamp\s+(\S+)$/);
    ok(m, `block header "${head}" is "<pose>[.<frame>]  lamp <colour>"`);
    const [, name, lamp] = m;
    ok(!(name in docFrames), `${name}: one block per frame`);
    docFrames[name] = rows;
    const pose = name.split('.')[0];
    ok(docLamps[pose] === undefined || docLamps[pose] === lamp, `${pose}: every frame has the same lamp`);
    docLamps[pose] = lamp;
}

eq(Object.keys(FRAMES).sort(), Object.keys(docFrames).sort(), 'kit/model/mascot.js has exactly the frames of MASCOT.md');
for (const [name, rows] of Object.entries(docFrames))
    eq(FRAMES[name], rows, `${name}: grid matches MASCOT.md`);
eq(Object.keys(POSES).length, 13, '13 poses');
eq(Object.keys(POSES).sort(), Object.keys(docLamps).sort(), 'the poses are MASCOT.md\'s');
for (const [pose, lamp] of Object.entries(docLamps))
    eq(POSES[pose].lamp, lamp, `${pose}: lamp colour matches MASCOT.md`);

// the Poses table: name, lamp, motion
const table = doc.split('## Poses')[1].split('```bu')[0];
for (const pose of Object.keys(POSES))
    ok(new RegExp(`\\| \`${pose}\` \\|`).test(table), `${pose}: listed in the Poses table`);
for (const [pose, words] of [['busy', 'loop'], ['think', 'loop'], ['wave', 'once, then `idle`'], ['party', 'once, then `done`']])
    ok(table.split('\n').find(l => l.startsWith(`| \`${pose}\``))?.includes(words), `${pose}: the table says "${words}"`);

// --- the grids are well formed --------------------------------------------------------
for (const [name, rows] of Object.entries(FRAMES)) {
    eq(rows.length, SIZE, `${name}: ${SIZE} rows`);
    for (const r of rows) {
        eq(r.length, SIZE, `${name}: rows of ${SIZE} cells`);
        ok([...r].every(c => c === 'L' || c in PALETTE), `${name}: only palette letters in "${r}"`);
    }
    const lamp = rows.flatMap((r, y) => [...r].map((c, x) => c === 'L' ? [x, y] : null)).filter(Boolean);
    const [lx, ly] = lamp[0];
    eq(lamp, [[lx, ly], [lx + 1, ly], [lx, ly + 1], [lx + 1, ly + 1]], `${name}: a lamp of 2 × 2 cells`);
    eq(lx, 4, `${name}: the lamp is centred (columns 4–5)`);
    ok(rows.join('').includes('B'), `${name}: has a body`);
}
for (const [pose, p] of Object.entries(POSES)) {
    if (p.frames) {
        eq(p.frames.map(f => f in FRAMES), [true, true], `${pose}: both frames exist`);
        ok(p.loop ? !p.then : POSES[p.then] && !POSES[p.then].frames, `${pose}: loops, or settles on a still pose`);
    } else {
        ok(pose in FRAMES, `${pose}: a still pose has one frame named after it`);
    }
}

// --- the previews in docs/mascot/ follow the grids ---------------------------------------
const RECT = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="\3" fill="(#[0-9A-Fa-f]{6})"\/>/g;
for (const pose of Object.keys(POSES)) {
    const svgPath = GLib.build_filenamev([GLib.path_get_dirname(docPath), 'mascot', `${pose}.svg`]);
    const svg = new TextDecoder().decode(GLib.file_get_contents(svgPath)[1]);
    const rects = [...svg.matchAll(RECT)].map(m => ({
        x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), fill: m[4].toUpperCase(),
    }));
    const size = rects[0].size, x0 = Math.min(...rects.map(r => r.x)), y0 = Math.max(...rects.map(r => r.y)) - 9 * size;
    const got = Array.from({length: SIZE}, () => Array(SIZE).fill('.'));
    for (const r of rects)
        got[(r.y - y0) / size][(r.x - x0) / size] = r.fill;
    const frame = POSES[pose].frames?.[0] ?? pose;
    const lamp = POSES[pose].lamp === 'foreground' ? FOREGROUND : POSES[pose].lamp;
    const want = FRAMES[frame].map(row => [...row].map(c => c === 'L' ? lamp.toUpperCase() : PALETTE[c] ?? '.'));
    eq(got, want, `docs/mascot/${pose}.svg draws ${frame} as in MASCOT.md`);
}

// --- names, motion --------------------------------------------------------------------
eq(poseName('busy'), 'busy', 'a known pose');
eq(poseName('busy.1'), null, 'a frame name is not a pose');
eq(poseName('nope'), null, 'an unknown pose');
eq(poseName(42), null, 'not a string');
eq(poseName('toString'), null, 'no prototype names');
eq(Object.keys(POSES).filter(moves).sort(), ['busy', 'party', 'think', 'wave'], 'four poses move');

// --- lamp rule (INDICATORS § Bu's lamp) -------------------------------------------------
eq(lampColour('busy'), '#3D9BFF', 'the pose\'s own colour');
eq(lampColour('busy', 'missed'), '#3D9BFF', 'the stack\'s amber never reaches the lamp (2026-11-08)');
eq(lampColour('done', 'waiting'), '#B4E33D', 'nor its red');
eq(lampColour('turn'), FOREGROUND, 'turn: foreground = the body colour');
eq(FOREGROUND, '#F1EFE8', 'foreground is the body colour');
eq(lampColour('nope'), POSES.idle.lamp, 'unknown pose: idle\'s lamp');
eq(LIGHT_LAMPS, {missed: '#FF9F0A', waiting: '#FF453A'}, 'amber and red are INDICATORS\' state colours (design/colours C)');
for (const [pose, p] of Object.entries(POSES)) {
    if (pose !== 'missed')
        ok(p.lamp !== LIGHT_LAMPS.missed, `${pose}: amber only for missed`);
    if (pose !== 'ask')
        ok(p.lamp !== LIGHT_LAMPS.waiting, `${pose}: red only for ask`);
}

// --- frames over time -----------------------------------------------------------------
eq(frameAt('idle', 0), {frame: 'idle', pose: 'idle', nextIn: null}, 'still pose: one frame, no timer');
eq(frameAt('idle', 99999), {frame: 'idle', pose: 'idle', nextIn: null}, 'still pose never changes');
eq(frameAt('busy', 0), {frame: 'busy.1', pose: 'busy', nextIn: FRAME_MS}, 'loop: first frame, swap in 500 ms');
eq(frameAt('busy', 120), {frame: 'busy.1', pose: 'busy', nextIn: 380}, 'loop: the timer aims at the next swap');
eq(frameAt('busy', 500), {frame: 'busy.2', pose: 'busy', nextIn: 500}, 'loop: second frame');
eq(frameAt('busy', 1000).frame, 'busy.1', 'loop: wraps');
eq(frameAt('think', 3600 * 1000 + 700).frame, 'think.2', 'loop: forever while shown');
eq(frameAt('busy', 750, {still: true}), {frame: 'busy.1', pose: 'busy', nextIn: null}, 'loop held still: first frame, no timer');
eq(frameAt('wave', 0), {frame: 'wave.1', pose: 'wave', nextIn: 500}, 'once: first frame');
eq([0, 500, 1000, 1500].map(t => frameAt('wave', t).frame), ['wave.1', 'wave.2', 'wave.1', 'wave.2'],
    `once: ${ONCE_FRAMES} frames`);
eq(frameAt('wave', ONCE_FRAMES * FRAME_MS), {frame: 'idle', pose: 'idle', nextIn: null}, 'wave settles on idle');
eq(frameAt('party', 5000), {frame: 'done', pose: 'done', nextIn: null}, 'party settles on done');
eq(frameAt('wave', 1999).nextIn, 1, 'once: the last swap lands on the settle time');
eq(frameAt('wave', 300, {still: true}), {frame: 'wave.1', pose: 'wave', nextIn: 1700},
    'once held still: first frame, one change left (the settle)');
eq(frameAt('party', 2500, {still: true}), {frame: 'done', pose: 'done', nextIn: null}, 'once held still past its time: settled');
eq(frameAt('busy', -50).frame, 'busy.1', 'negative elapsed counts as 0');
eq(frameAt('nope', 0).nextIn, null, 'unknown pose: no timer');

// --- cells ----------------------------------------------------------------------------
const idleCells = cells('idle', '#123456');
eq(idleCells.slice(0, 2), [{x: 4, y: 0, w: 2, colour: '#123456'}, {x: 4, y: 1, w: 2, colour: '#123456'}],
    'the lamp: 2 × 2 cells in the lamp colour');
eq(idleCells.filter(c => c.y === 3), [{x: 1, y: 3, w: 2, colour: '#F1EFE8'}, {x: 4, y: 3, w: 2, colour: '#F1EFE8'},
    {x: 7, y: 3, w: 2, colour: '#F1EFE8'}], 'eyes are holes: the body runs stop at E');
const count = (frame, letter) => FRAMES[frame].join('').split(letter).length - 1;
for (const frame of Object.keys(FRAMES)) {
    const filled = cells(frame, '#000001').reduce((n, c) => n + c.w, 0);
    eq(filled, SIZE * SIZE - count(frame, '.') - count(frame, 'E'), `${frame}: every non-empty cell filled once`);
}
eq(cells('nope', '#000000'), [], 'unknown frame: nothing');

// --- {mascot} in presentation.js ----------------------------------------------------------
eq(element({mascot: 'busy'}, {leading: true}), {type: 'mascot', pose: 'busy'}, 'leading {mascot}');
eq(element({mascot: 'busy', icon: 'x-symbolic'}, {leading: true}), {type: 'mascot', pose: 'busy'},
    'icon is only the fallback');
eq(element({mascot: 'nope', icon: 'x-symbolic'}, {leading: true}), {type: 'icon', icon: 'x-symbolic'},
    'unknown pose → its icon');
eq(element({mascot: 'nope'}, {leading: true}), {type: 'mascot', pose: 'idle'}, 'unknown pose, no icon → idle');
eq(element({mascot: 7}, {leading: true}), {type: 'mascot', pose: 'idle'}, 'a non-string pose → idle');
eq(element({mascot: 'busy', icon: 'x-symbolic'}), {type: 'icon', icon: 'x-symbolic'}, 'not leading: the icon');
eq(element({mascot: 'busy'}), null, 'not leading, no icon: nothing');
eq(element({mascot: 'busy', art: '/a.png'}, {leading: true}).type, 'mascot', 'mascot before art');

const agent = {kind: 'agent', leading: {mascot: 'think'}, text: 'Claude · thinking', trailing: {mascot: 'busy'}};
let c = planMinimal(agent, {light: 'missed'});
eq(c.leading, {type: 'mascot', pose: 'think'}, 'minimal: Bu leads, its lamp the pose\'s (2026-11-08)');
eq(c.light, 'missed', 'minimal: the amber light is the edge dot, as on any pill');
eq(c.trailing, null, 'minimal: no Bu in trailing');
c = planMinimal(agent, {light: 'waiting'});
eq([c.leading, c.light], [{type: 'mascot', pose: 'think'}, 'waiting'], 'minimal: red on the edge too');
c = planMinimal(agent, {light: 'off'});
eq(c.light, null, 'minimal, light off: no slot');
c = planMinimal(agent, {});
eq(c.light, null, 'minimal, no light (side pill): no slot');
eq(planMinimal({...agent, isStale: true}, {light: 'missed'}).leading, {type: 'mascot', pose: 'stale'},
    'stale: Bu stale, the light still on the edge');
c = planMinimal({kind: 'x', leading: 'a-symbolic', text: 't'}, {light: 'missed'});
eq(c.light, 'missed', 'any other leading keeps the edge slot');
c = planMinimal({kind: 'x', leading: {mascot: 'nope', icon: 'a-symbolic'}, text: 't'}, {light: 'missed'});
eq([c.leading.type, c.light], ['icon', 'missed'], 'a fallen-back icon keeps the edge slot');

const pk = planCompact({...agent, compact: {leading: {mascot: 'ask'}, text: 'Allow?'}}, {light: 'missed'});
eq([pk.leading, pk.light], [{type: 'mascot', pose: 'ask'}, 'missed'], 'compact: the edge dot, Bu its own lamp');

const ex = planExpanded({...agent, expanded: true});
eq(ex.leading, {type: 'mascot', pose: 'think'}, 'expanded: Bu leads, the pose\'s lamp (no light there)');
eq(ex.trailing, null, 'expanded: no Bu in trailing');
eq(planExpanded({...agent, expanded: {leading: {mascot: 'wave'}, center: {title: 'Hi'}}}).leading,
    {type: 'mascot', pose: 'wave'}, 'expanded leading region may be Bu');
eq(planExpanded({...agent, expanded: {trailing: {mascot: 'wave'}, center: {title: 'Hi'}}}).trailing, null,
    'expanded trailing region may not');

// --- hello: the About page and the README wave for 5 s, then idle (FEATURES #102) ------
eq(HELLO_MS, 5000, 'hello lasts 5 s (hello.svg, Ethan 2026-11-04)');
eq(helloAt(0), {frame: 'wave.1', pose: 'wave', nextIn: 500}, 'hello starts on wave.1');
eq(helloAt(499).frame, 'wave.1', 'still wave.1 at 499 ms');
eq(helloAt(500), {frame: 'wave.2', pose: 'wave', nextIn: 500}, 'wave.2 at 500 ms');
eq(helloAt(1250), {frame: 'wave.1', pose: 'wave', nextIn: 250}, 'back to wave.1, 250 ms left');
eq(helloAt(4999).frame, 'wave.2', 'the last frame before 5 s');
eq(helloAt(4999).nextIn, 1, 'one ms to idle');
eq(helloAt(5000), {frame: 'idle', pose: 'idle', nextIn: null}, 'at 5 s: idle, and nothing more');
eq(helloAt(60000), {frame: 'idle', pose: 'idle', nextIn: null}, 'long after: idle');
eq(helloAt(-10).frame, 'wave.1', 'negative elapsed counts as 0');
eq(helloAt(1000, {still: true}), {frame: 'idle', pose: 'idle', nextIn: null}, 'animations off: idle at once, as hello.svg');
eq(lampColour(helloAt(0).pose), '#FFE14D', 'the wave lamp while waving');
let swaps = 0;
for (let t = 0, f = helloAt(0); f.nextIn !== null; t += f.nextIn, f = helloAt(t))
    swaps++;
eq(swaps, 10, 'ten frames of 500 ms, then it stops: a bounded animation');

// --- Bu's eyes: the idle plan `mascot` (MASCOT.md § Eyes) ----------------------------
eq(EYE_MODES, ['waiting', 'missed', 'sleep', 'idle'], 'four modes, in precedence order');
eq(eyesMode(), 'idle', 'eyesMode: nothing set → idle');
eq(eyesMode({light: 'off', daypart: 'afternoon'}), 'idle', 'eyesMode: an afternoon at the desk → idle');
eq([eyesMode({daypart: 'night'}), eyesMode({idleInput: true}), eyesMode({powerSaver: true}), eyesMode({animations: false})],
    ['sleep', 'sleep', 'sleep', 'sleep'], 'eyesMode: night, 60 s without input, power-saver, animations off → sleep');
eq(eyesMode({light: 'missed'}), 'missed', 'eyesMode: amber → missed');
eq(eyesMode({light: 'waiting'}), 'waiting', 'eyesMode: red → waiting');
eq(eyesMode({light: 'missed', idleInput: true, daypart: 'night', powerSaver: true, animations: false}), 'missed',
    'eyesMode: amber beats every sleep reason (coming back finds the eyes on what was missed)');
eq(eyesMode({light: 'waiting', idleInput: true}), 'waiting', 'eyesMode: red beats 60 s idle');
eq(eyesMode({light: 'unknown'}), 'idle', 'eyesMode: an unknown light is off');
eq(eyesMode({animations: undefined}), 'idle', 'eyesMode: animations unknown counts as on');

// the stroll: order, wrap-around, holds, steps
eq(STROLL.map(b => b.name), ['rest', 'look left', 'stroll right', 'back', 'blink', 'smile', 'long rest'], 'stroll: the seven beats in order');
eq(STROLL.map(b => b.hold), [4500, 1250, 1500, 2500, 3000, 1250, 7000], 'stroll: the holds (2× faster than the first demo)');
eq(STROLL.map(b => b.steps), [0, 3, 6, 3, 0, 0, 0], 'stroll: steps of 3 px — 3 left, 6 right, 3 back');
eq(STROLL.every(b => ['open', 'blink', 'smile'].includes(b.eyes)), true, 'stroll: never missed, waiting or sleep eyes');
eq([nextBeat(0, 0.5).next, nextBeat(6, 0.5).next, nextBeat(13, 0.5).next, nextBeat(7, 0.5).beat.name, nextBeat(-1, 0.5).beat.name,
    nextBeat(14, 0.5).beat.name], [1, 7, 0, 'rest', 'long rest', 'rest'], 'nextBeat: wraps both ways, over two cycles');
eq([nextBeat(5, 0.5).beat.eyes, nextBeat(12, 0.5).beat.eyes, nextBeat(19, 0.5).beat.eyes, nextBeat(-2, 0.5).beat.eyes],
    ['smile', 'wink', 'smile', 'wink'], 'nextBeat: the smile and the wink take turns, a cycle each');
eq([nextBeat(12, 0.5).beat.name, nextBeat(12, 0.5).holdMs, nextBeat(8, 0.5).beat.eyes], ['smile', 1250, 'open'],
    'nextBeat: the wink keeps the smile\'s beat and hold; beats without alt are the same both cycles');
eq(STROLL[5].eyes, 'smile', 'nextBeat: STROLL itself is not changed by the wink');
eq([nextBeat(0, 0).holdMs, nextBeat(0, 1).holdMs, nextBeat(0, 0.5).holdMs], [3375, 5625, 4500], 'nextBeat: hold ±25 % with rand 0 and 1');
eq([nextBeat(6, -3).holdMs, nextBeat(6, 9).holdMs, nextBeat(6, NaN).holdMs], [5250, 8750, 7000],
    'nextBeat: rand clamped to 0..1, NaN the middle');
{
    const left = beatFrames(STROLL[1], 0);
    eq(left.map(f => [f.at, f.dx]), [[0, -3], [STEP_MS, -6], [2 * STEP_MS, -9]], 'look left: 3 frames of 3 px, 90 ms apart');
    const right = beatFrames(STROLL[2], -9);
    eq(right.map(f => f.dx), [-6, -3, 0, 3, 6, 9], 'stroll right: 6 frames from −9 to +9');
    eq(beatFrames(STROLL[3], 9).map(f => f.dx), [6, 3, 0], 'back: 3 frames to 0');
    eq(beatFrames(STROLL[4], 0), [{at: 0, eyes: 'blink', dx: 0}, {at: BLINK_MS, eyes: 'open', dx: 0}], 'blink: closed for 110 ms, then open');
    eq(beatFrames(STROLL[5], 0), [{at: 0, eyes: 'smile', dx: 0}], 'smile: one frame');
    eq(beatFrames(STROLL[0], 0), [], 'rest: no frame ("—"), the eyes are already centred');
    eq(beatFrames(STROLL[6], 0), [{at: 0, eyes: 'open', dx: 0}], 'long rest: one frame (open after the smile)');
    const frames = STROLL.reduce((n, b, k) => n + beatFrames(b, k ? STROLL[k - 1].dx : 0).length, 0);
    eq(frames, 16, 'a whole cycle is 16 frames (MASCOT.md "Cost")');
}
// the shapes (MASCOT.md's 120 × 32 numbers about the centre, at 1em)
{
    const idle = eyesShapes('idle');
    eq(idle.bars.map(b => [b.x, b.y, b.w, b.h]), [[-11, 11, 4.5, 10], [6, 11, 4.5, 10]], 'idle: two bars 4.5 × 10');
    eq(eyesShapes('idle', {dx: -9}).bars.map(b => b.x), [-20, -3], 'idle: dx moves both');
    eq(eyesShapes('missed').bars.map(b => b.x), [-17, 0], 'missed: 6 px toward the light (left end)');
    eq(eyesShapes('waiting').bars.map(b => [b.w, b.h]), [[6, 15], [6, 15]], 'waiting: bars 6 × 15');
    eq(eyesShapes('sleep').bars.map(b => [b.w, b.h, b.y]), [[9, 2.4, 16], [9, 2.4, 16]], 'sleep: lines 9 × 2.4 at y 16');
    eq(eyesShapes('sleep', {eyes: 'smile', dx: 9}), eyesShapes('sleep'), 'only idle eyes stroll or smile');
    const blink = eyesShapes('idle', {eyes: 'blink'}).bars[0];
    ok(Math.abs(blink.h - 1.2) < 1e-9 && Math.abs(blink.y + blink.h / 2 - 16) < 1e-9, 'blink: 12 % high, on the eyes\' middle');
    eq(eyesShapes('idle', {eyes: 'smile'}).arcs, [{x1: -13.5, x2: -4, y: 18, cy: 11.5}, {x1: 3.5, x2: 13, y: 18, cy: 11.5}], 'smile: two arcs');
    const all = [...EYE_MODES.map(m => eyesShapes(m)), eyesShapes('idle', {dx: -9}), eyesShapes('idle', {dx: 9}),
        ...EXPRESSIONS.map(x => eyesShapes('idle', {eyes: x}))];
    const xs = all.flatMap(s => [...s.bars.flatMap(b => [b.x, b.x + b.w]), ...s.arcs.flatMap(a => [a.x1, a.x2]),
        ...s.lines.flatMap(l => l.pts.map(p => p[0])), ...s.rings.flatMap(r => [r.cx - r.r, r.cx + r.r])]);
    const ys = all.flatMap(s => [...s.bars.flatMap(b => [b.y, b.y + b.h]), ...s.arcs.flatMap(a => [a.y, a.cy]),
        ...s.lines.flatMap(l => l.pts.map(p => p[1])), ...s.rings.flatMap(r => [r.cy - r.r, r.cy + r.r])]);
    ok(Math.min(...xs) >= -EYES_BOX.w / 2 && Math.max(...xs) <= EYES_BOX.w / 2, 'every frame fits the eyes box (x)');
    ok(Math.min(...ys) >= 0 && Math.max(...ys) <= EYES_BOX.h, 'every frame fits the eyes box (y)');
    eq(Object.keys(eyesShapes('idle')), ['bars', 'arcs', 'lines', 'rings'], 'shapes: always the four lists');
}
// the expressions (MASCOT.md § Expressions)
{
    eq(EXPRESSIONS, ['wink', 'content', 'drowsy', 'startled', 'squeeze', 'dizzy', 'knocked'], 'expressions: the seven');
    for (const x of EXPRESSIONS) {
        const s = eyesShapes('idle', {eyes: x});
        ok(s.bars.length + s.arcs.length + s.lines.length + s.rings.length > 0, `expression ${x}: draws something`);
        eq(eyesShapes('sleep', {eyes: x}), eyesShapes('idle', {eyes: x}), `expression ${x}: drawn whatever the mode`);
    }
    const wink = eyesShapes('idle', {eyes: 'wink'});
    eq([wink.bars.length, wink.arcs.length], [1, 1], 'wink: one open bar, one closed arc');
    eq(wink.arcs[0], eyesShapes('idle', {eyes: 'smile'}).arcs[1], 'wink: the closed eye is the smile\'s right arc');
    eq(eyesShapes('idle', {eyes: 'wink', dx: 3}).bars[0].x, -8, 'wink: follows the stroll\'s dx');
    eq(eyesShapes('sleep', {eyes: 'wink', dx: 3}).bars[0].x, -11, 'wink: dx only in mode idle');
    ok(eyesShapes('idle', {eyes: 'content'}).arcs.every(a => a.cy > a.y), 'content: arcs bend down (u u), unlike the smile');
    ok(eyesShapes('idle', {eyes: 'drowsy'}).bars.every(b => b.lid && b.h < 10), 'drowsy: half-height bars with a flat lid');
    eq(eyesShapes('idle', {eyes: 'startled'}).rings.map(r => r.cx), [-8.5, 8.5], 'startled: a ring on each eye');
    eq(eyesShapes('idle', {eyes: 'squeeze'}).lines.map(l => l.pts.length), [3, 3], 'squeeze: two chevrons');
    ok(eyesShapes('idle', {eyes: 'squeeze'}).lines[0].pts[1][0] > eyesShapes('idle', {eyes: 'squeeze'}).lines[0].pts[0][0],
        'squeeze: the left eye points right (>)');
    const dizzy = eyesShapes('idle', {eyes: 'dizzy'}).lines;
    eq(dizzy.map(l => l.pts.length), [49, 49], 'dizzy: two spirals of 48 segments');
    ok(dizzy[0].pts[10][0] > -8.5 && dizzy[1].pts[10][0] < 8.5, 'dizzy: the spirals turn opposite ways');
    eq(eyesShapes('idle', {eyes: 'knocked'}).lines.length, 4, 'knocked: two crosses');
}
// why asleep, and the reactions to a mode change
{
    eq(EYE_RESTS, ['still', 'saver', 'away', 'night'], 'rest: the four reasons');
    eq([eyesRest({animations: false, powerSaver: true, idleInput: true, daypart: 'night'}), eyesRest({powerSaver: true, idleInput: true}),
        eyesRest({idleInput: true, daypart: 'night'}), eyesRest({daypart: 'night'}), eyesRest({daypart: 'noon'}), eyesRest()],
    ['still', 'saver', 'away', 'night', null, null], 'rest: still › saver › away › night; null awake');
    const idle = {mode: 'idle', rest: null, stroll: true};
    const st = (mode, rest = null, stroll = true) => ({mode, rest, stroll});
    eq(eyesEnter(st('missed'), idle), {eyes: 'content', ms: 1250}, 'enter: the amber light goes out → content');
    eq(eyesEnter(idle, st('sleep', 'away')), {eyes: 'drowsy', ms: 1000}, 'enter: 60 s without input → drowsy first');
    eq(eyesEnter(idle, st('sleep', 'night')), {eyes: 'drowsy', ms: 1000}, 'enter: night → drowsy first');
    eq([eyesEnter(idle, st('sleep', 'saver')), eyesEnter(idle, st('sleep', 'still'))], [null, null],
        'enter: power-saver or animations off → straight to sleep');
    eq(eyesEnter(st('sleep', 'away'), idle), {eyes: 'startled', ms: 600}, 'enter: input after the 60 s sleep → startled');
    eq([eyesEnter(st('sleep', 'night'), idle), eyesEnter(st('sleep', 'saver'), idle)], [null, null],
        'enter: only the away sleep wakes startled');
    eq([eyesEnter(st('missed'), st('idle', null, false)), eyesEnter(st('idle', null, false), st('sleep', 'away', false)),
        eyesEnter(st('sleep', 'away'), st('idle', null, false))], [null, null, null], 'enter: never with the stroll off');
    eq([eyesEnter(st('waiting'), idle), eyesEnter(idle, st('missed')), eyesEnter(st('missed'), st('sleep', 'night')), eyesEnter(idle, idle)],
        [null, null, null, null], 'enter: red going out, a light coming, amber into sleep, no change → none');
    eq([eyesEnter(null, idle), eyesEnter(idle, null)], [null, null], 'enter: nothing before or after → none');
    eq(ENTER_MS, {content: 1250, drowsy: 1000, startled: 600}, 'enter: the three lengths');
}
// press and hold
{
    eq(HOLD, {clickMs: 500, dizzyMs: 1500, knockedMs: 3000, afterMs: 1000}, 'hold: the times');
    eq(HOLD_FRAMES.map(f => [f.at, f.eyes]), [[0, 'squeeze'], [1500, 'dizzy'], [3000, 'knocked']], 'hold: > < → @ @ → x x');
    eq([holdPlays({mode: 'idle', stroll: true}), holdPlays({mode: 'idle'}), holdPlays({mode: 'idle', stroll: false}),
        holdPlays({mode: 'sleep', stroll: true}), holdPlays({mode: 'missed'}), holdPlays(null)],
    [true, true, false, false, false, false], 'hold: plays only with open eyes that may move');
    eq([releaseEyes(200), releaseEyes(2999), releaseEyes(3000), releaseEyes(9000), releaseEyes(NaN)],
        [null, null, {eyes: 'knocked', ms: 1000}, {eyes: 'knocked', ms: 1000}, null],
        'release: x x stays 1 s once it got there, else straight back');
}

// --- the idle plan `mascot` (modules/mascot/idle.js) ---------------------------------
{
    const day = new Date(2026, 10, 14, 14, 0), night = new Date(2026, 10, 14, 23, 30);
    eq(plan.present({now: day}), {leading: {eyes: 'idle', stroll: true}, text: null, accessibleName: 'Bu'},
        'plan: an afternoon, nothing known yet → open eyes, strolling');
    eq(plan.present({now: night}).leading.eyes, 'sleep', 'plan: night → asleep');
    eq(plan.present({now: night}).accessibleName, 'Bu, asleep', 'plan: named for a screen reader');
    eq([plan.present({now: day, data: {idleInput: true}}).leading.eyes, plan.present({now: day, data: {powerSaver: true}}).leading.eyes,
        plan.present({now: day, data: {animations: false}}).leading.eyes], ['sleep', 'sleep', 'sleep'],
    'plan: away, power-saver, animations off → asleep');
    eq(plan.present({now: day, data: {idleInput: false, powerSaver: false, animations: true}}).leading.eyes, 'idle', 'plan: the feed says all clear');
    eq([plan.present({now: day, data: {idleInput: true}}).leading.rest, plan.present({now: night}).leading.rest,
        plan.present({now: day, data: {powerSaver: true, idleInput: true}}).leading.rest, plan.present({now: day, data: {animations: false}}).leading.rest],
    ['away', 'night', 'saver', 'still'], 'plan: asleep says why (rest)');
    ok(!('rest' in plan.present({now: day}).leading), 'plan: awake has no rest');
    eq(plan.present({now: day, data: null}).leading.eyes, 'idle', 'plan: no feed state yet');
    eq(plan.present({now: day}, {'idle-mascot-stroll': false}).leading.stroll, false, 'plan: idle-mascot-stroll off → still eyes');
    const late = new Date(2026, 10, 14, 22, 30);
    eq([plan.present({now: late}).leading.eyes, plan.present({now: late, starts: [5, 7, 11, 13, 18, 23]}).leading.eyes],
        ['sleep', 'idle'], 'plan: daypart-starts are read (night from 22 by default, from 23 here)');
    eq(plan.relevance(), {score: 10}, 'plan: scores 10 in auto, like the clock');
    eq(plan.keys, ['idle-mascot-stroll'], 'plan: its one key');
    // the light shows through, in the kit (planIdle)
    const asleep = plan.present({now: night});
    eq([planIdle({light: 'missed', plan: asleep}).leading.mode, planIdle({light: 'waiting', plan: asleep}).leading.mode,
        planIdle({light: 'off', plan: asleep}).leading.mode], ['missed', 'waiting', 'sleep'],
    'plan in the pill: a light shows through even at night');
    eq([planIdle({light: 'off', plan: asleep}).leading.rest, planIdle({light: 'missed', plan: asleep}).leading.rest], ['night', null],
        'plan in the pill: rest kept asleep, dropped under a light');
    eq(element({eyes: 'sleep', rest: 'bogus'}, {leading: true}).rest, null, 'element: an unknown rest is null');
    eq(element({eyes: 'idle', rest: 'away'}, {leading: true}).rest, null, 'element: rest only when asleep');
}

print('mascot: ok');
