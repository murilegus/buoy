// Run: gjs -m tests/mascot.test.js   (pure: Bu's grids against MASCOT.md, frames, lamp)
import GLib from 'gi://GLib';

import {
    FRAMES, POSES, PALETTE, FOREGROUND, LIGHT_LAMPS, FRAME_MS, ONCE_FRAMES, SIZE,
    poseName, moves, lampColour, frameAt, cells, HELLO_MS, helloAt,
} from '../src/buoy@murilegus/lib/kit/model/mascot.js';
import {element, planMinimal, planCompact, planExpanded} from '../src/buoy@murilegus/lib/kit/model/presentation.js';

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

print('mascot: ok');
