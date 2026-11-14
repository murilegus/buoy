/**
 * Bu, Buoy's mascot (MASCOT.md, 2026-11-03): the pose grids and the rules that pick a
 * frame and a lamp colour. Pure (no St, no Main, no timers), so it runs under plain gjs;
 * ui/present/motion.js paints the grids and owns the one swap timer. MASCOT.md is the source:
 * tests/mascot.test.js parses its grid blocks and compares them with FRAMES.
 *
 * A grid is 10 × 10 cells, one letter each (MASCOT.md § Drawing rules):
 *   .  empty · B A body, arm · S stripe · D dots · Z sleep "z" · W water
 *   E  eye, a hole (transparent) · L lamp, in the lamp colour
 */

import {ROLES} from './palette.js';

export const SIZE = 10;

/** Cell letter → colour; `null` = transparent; the lamp (L) is not here. */
export const PALETTE = Object.freeze({
    '.': null, E: null,
    B: '#F1EFE8', A: '#F1EFE8',
    S: '#888780', D: '#D3D1C7', Z: '#444441', W: '#185FA5',
});

/** The lamp's `foreground` (pose `turn`): the body colour, as Bu sits only on black. */
export const FOREGROUND = PALETTE.B;

/** INDICATORS' state colours: in the lamp only as the `missed` / `ask` poses' own. */
export const LIGHT_LAMPS = Object.freeze({
    missed: ROLES['light-missed'].toUpperCase(), waiting: ROLES['light-waiting'].toUpperCase(),
});

/** Frames swap every 500 ms; `once` poses play two swaps of both frames (~2 s). */
export const FRAME_MS = 500;
export const ONCE_FRAMES = 4;

/** One frame per still pose, `.1`/`.2` for moving ones, exactly as in MASCOT.md. */
export const FRAMES = Object.freeze({
    'idle': [
        '....LL....',
        '....LL....',
        '..BBBBBB..',
        '.BBEBBEBB.',
        '.BBBBBBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'sleep': [
        '....LL..Z.',
        '....LL.Z..',
        '..BBBBBB..',
        '.BBBBBBBB.',
        '.BEEBBEEB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'missed': [
        '....LL....',
        '....LL....',
        '..BBBBBB..',
        '.BBBEBBEB.',
        '.BBBBBBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'ask': [
        '....LL..A.',
        '....LL..A.',
        '..BBBBBBA.',
        '.BBEBBEBB.',
        '.BBEBBEBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'done': [
        '....LL....',
        '....LL....',
        '..BBBBBB..',
        '.BBEBBEBB.',
        '.BBBEEBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'busy.1': [
        '....LL....',
        '....LL....',
        '..BBBBBB..',
        '.BEBBEBBB.',
        '.BBBBBBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'busy.2': [
        '..........',
        '....LL....',
        '....LL....',
        '..BBBBBB..',
        '.BEBBEBBB.',
        '.BBBBBBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'wave.1': [
        '.A..LL....',
        '.A..LL....',
        '.ABBBBBB..',
        '.BBEBBEBB.',
        '.BBBEEBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'wave.2': [
        'A...LL....',
        '.A..LL....',
        '..BBBBBB..',
        '.BBEBBEBB.',
        '.BBBEEBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'think.1': [
        '....LL.D.D',
        '....LL.D..',
        '..BEBBEB..',
        '.BBBBBBBB.',
        '.BBBBBBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'think.2': [
        '....LL.D..',
        '....LL.D..',
        '..BEBBEB..',
        '.BBBBBBBB.',
        '.BBBBBBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'turn': [
        '....LL.DDD',
        '....LL.D..',
        '..BBBBBB..',
        '.BBBBBBBB.',
        '.BBEBBEBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'error': [
        '..........',
        '....LL....',
        '....LL....',
        '..BBBBBB..',
        '.BEBBBEBB.',
        '.BBEBBBEB.',
        'WWSSSSSSWW',
        '.WWWBBWWW.',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'compact': [
        '..........',
        '....LL....',
        '....LL....',
        'BBBBBBBBBB',
        'BEEBBBBEEB',
        'SSSSSSSSSS',
        '.BBBBBBBB.',
        '..........',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'stale': [
        '....LL....',
        '....LL....',
        '..BBBBBB..',
        '.BBBBBBBB.',
        '.BEEBBEEB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
    'party.1': [
        'D...LL...D',
        '....LL....',
        '..BBBBBB..',
        '.BBEBBEBB.',
        '.BBBEEBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'D........D',
        'WW.W..W.WW',
    ],
    'party.2': [
        '....LL....',
        '....LL....',
        '..BBBBBB..',
        '.BBEBBEBB.',
        '.BBBEEBBB.',
        '.SSSSSSSS.',
        '.BBBBBBBB.',
        '..BBBBBB..',
        'W.WW..WW.W',
        '.W..WW..W.',
    ],
});

/**
 * The 13 poses (MASCOT.md § Poses): lamp colour, frames, and motion. The lamps are saturated
 * to read at 4 × 4 px, clear of the lights and the privacy dots (design/colours, 2026-11-11):
 * `missed` and `ask` are the lights' own, `think` is pink since purple is the mic. `loop` repeats
 * while shown; `then` plays once and settles on that pose.
 */
export const POSES = Object.freeze({
    idle: {lamp: '#C8C6BD'},
    sleep: {lamp: '#444441'},
    missed: {lamp: LIGHT_LAMPS.missed},
    ask: {lamp: LIGHT_LAMPS.waiting},
    done: {lamp: '#B4E33D'},
    busy: {lamp: '#3D9BFF', frames: ['busy.1', 'busy.2'], loop: true},
    wave: {lamp: '#FFE14D', frames: ['wave.1', 'wave.2'], then: 'idle'},
    think: {lamp: '#FF7EB6', frames: ['think.1', 'think.2'], loop: true},
    turn: {lamp: 'foreground'},
    error: {lamp: '#8A8880'},
    compact: {lamp: '#5AD8F5'},
    stale: {lamp: '#444441'},
    party: {lamp: '#B4E33D', frames: ['party.1', 'party.2'], then: 'done'},
});

/**
 * @param {*} name
 * @returns {?string} the pose if it is one of the 13, else null
 */
export function poseName(name) {
    return typeof name === 'string' && Object.hasOwn(POSES, name) ? name : null;
}

/**
 * @param {string} pose  one of POSES
 * @returns {boolean} the pose has two frames (busy, think loop; wave, party once)
 */
export function moves(pose) {
    return Boolean(POSES[pose]?.frames);
}

/**
 * The lamp is the pose's own colour. The stack's amber/red is the pill's edge dot, never
 * the lamp (SPEC §2a-i, 2026-11-08, Ethan: the lamp is too small to read as the light).
 *
 * @param {string} pose  one of POSES
 * @returns {string} '#rrggbb'
 */
export function lampColour(pose) {
    const own = POSES[pose]?.lamp ?? POSES.idle.lamp;
    return own === 'foreground' ? FOREGROUND : own;
}

/**
 * Which frame shows `elapsed` ms after the pose was first shown, and when it changes.
 * Still poses never change. Loops swap every FRAME_MS. Once poses swap ONCE_FRAMES
 * times, then settle on `then`. Held still (away, animations off): a loop keeps its
 * first frame; a once pose keeps its first frame until it would have settled.
 *
 * @param {string} pose  one of POSES
 * @param {number} elapsed  ms since first shown (≥ 0)
 * @param {object} [opts]
 * @param {boolean} [opts.still]  hold the frame (no swap)
 * @returns {{frame: string, pose: string, nextIn: ?number}} the FRAMES key, the pose it
 *   belongs to (for the lamp), ms until the next change or null
 */
export function frameAt(pose, elapsed, {still = false} = {}) {
    const p = POSES[pose];
    if (!p?.frames)
        return {frame: pose, pose, nextIn: null};
    const t = Math.max(0, elapsed);
    if (p.then) {
        const total = ONCE_FRAMES * FRAME_MS;
        if (t >= total)
            return {frame: p.then, pose: p.then, nextIn: null};
        if (still)
            return {frame: p.frames[0], pose, nextIn: total - t};
    } else if (still) {
        return {frame: p.frames[0], pose, nextIn: null};
    }
    const i = Math.floor(t / FRAME_MS);
    return {frame: p.frames[i % p.frames.length], pose, nextIn: FRAME_MS - t % FRAME_MS};
}

/** How long Bu waves hello (README hello.svg, the About page), 2026-11-04. */
export const HELLO_MS = 5000;

/**
 * Bu saying hello: wave.1 / wave.2 every FRAME_MS for HELLO_MS, then idle for good —
 * as docs/mascot/hello.svg does in the README. Held still (animations off) it is idle
 * from the start, as hello.svg under prefers-reduced-motion.
 *
 * @param {number} elapsed  ms since shown
 * @param {object} [opts]
 * @param {boolean} [opts.still]
 * @returns {{frame: string, pose: string, nextIn: ?number}} as frameAt()
 */
export function helloAt(elapsed, {still = false} = {}) {
    const t = Math.max(0, elapsed);
    if (still || t >= HELLO_MS)
        return {frame: 'idle', pose: 'idle', nextIn: null};
    const i = Math.floor(t / FRAME_MS);
    const frames = POSES.wave.frames;
    return {frame: frames[i % frames.length], pose: 'wave', nextIn: Math.min(FRAME_MS - t % FRAME_MS, HELLO_MS - t)};
}

/**
 * A frame as rectangles to fill, runs of one colour merged along each row.
 *
 * @param {string} frame  a FRAMES key
 * @param {string} lamp  '#rrggbb' for the L cells
 * @returns {{x: number, y: number, w: number, colour: string}[]} in cells
 */
export function cells(frame, lamp) {
    const rows = FRAMES[frame] ?? [];
    const out = [];
    rows.forEach((row, y) => {
        let run = null;
        for (let x = 0; x < row.length; x++) {
            const colour = row[x] === 'L' ? lamp : PALETTE[row[x]] ?? null;
            if (run && run.colour === colour) {
                run.w++;
                continue;
            }
            run = colour ? {x, y, w: 1, colour} : null;
            if (run)
                out.push(run);
        }
    });
    return out;
}

// --- Bu's eyes: the idle plan `mascot` (MASCOT.md § Eyes, 2026-11-03) ------------------

/** The four modes; the first that holds wins (eyesMode). */
export const EYE_MODES = Object.freeze(['waiting', 'missed', 'sleep', 'idle']);

/**
 * The eyes' mode (MASCOT.md § Eyes): a light always shows through, then sleep wherever Bu
 * must hold still, else idle.
 *
 * @param {object} [s]
 * @param {string} [s.light]  the buoy light: 'off' | 'missed' | 'waiting'
 * @param {string} [s.daypart]  kit/model/daypart.js
 * @param {boolean} [s.idleInput]  60 s without input (the core idle monitor)
 * @param {boolean} [s.powerSaver]  the power profile is `power-saver`
 * @param {boolean} [s.animations]  `enable-animations`; false sleeps
 * @returns {string} one of EYE_MODES
 */
export function eyesMode({light = 'off', daypart = null, idleInput = false, powerSaver = false, animations = true} = {}) {
    if (light === 'waiting')
        return 'waiting';
    if (light === 'missed')
        return 'missed';
    if (daypart === 'night' || idleInput === true || powerSaver === true || animations === false)
        return 'sleep';
    return 'idle';
}

/** Why the eyes sleep (eyesRest). */
export const EYE_RESTS = Object.freeze(['still', 'saver', 'away', 'night']);

/**
 * Why the eyes sleep, for the reactions (MASCOT.md § Expressions): 'still' (animations off) ›
 * 'saver' (power-saver) › 'away' (60 s without input) › 'night'; null when not asleep. Only
 * `away` and `night` doze off first, and only `away` wakes startled.
 *
 * @param {object} [s]  as eyesMode, without the light
 * @param {?string} [s.daypart]
 * @param {boolean} [s.idleInput]
 * @param {boolean} [s.powerSaver]
 * @param {boolean} [s.animations]
 * @returns {?string}
 */
export function eyesRest({daypart = null, idleInput = false, powerSaver = false, animations = true} = {}) {
    if (animations === false)
        return 'still';
    if (powerSaver === true)
        return 'saver';
    if (idleInput === true)
        return 'away';
    return daypart === 'night' ? 'night' : null;
}

// --- the expressions (MASCOT.md § Expressions, 2026-11-14) ---------------------------------

/** The seven expressions: frames drawn over the mode's eyes for a while. */
export const EXPRESSIONS = Object.freeze(['wink', 'content', 'drowsy', 'startled', 'squeeze', 'dizzy', 'knocked']);

/** A mode change's reaction, how long it shows before the new mode's eyes. */
export const ENTER_MS = Object.freeze({content: 1250, drowsy: 1000, startled: 600});

/**
 * The reaction to the eyes changing from `was` to `now` (each {mode, rest, stroll}), or null:
 * the amber light going out → `content`; dozing off (away or night) → `drowsy`; input
 * again after the 60 s sleep → `startled`. Never with the stroll off (the still eyes).
 *
 * @param {?object} was
 * @param {object} now
 * @returns {?{eyes: string, ms: number}}
 */
export function eyesEnter(was, now) {
    if (!was || !now || now.stroll === false)
        return null;
    let eyes = null;
    if (was.mode === 'missed' && now.mode === 'idle')
        eyes = 'content';
    else if (was.mode === 'idle' && now.mode === 'sleep' && (now.rest === 'away' || now.rest === 'night'))
        eyes = 'drowsy';
    else if (was.mode === 'sleep' && was.rest === 'away' && now.mode === 'idle')
        eyes = 'startled';
    return eyes ? {eyes, ms: ENTER_MS[eyes]} : null;
}

/**
 * Press and hold on the pill (MASCOT.md § Expressions): released within `clickMs` it is a
 * click (Home); squeeze (> <) from the press, dizzy (spirals) at `dizzyMs`, knocked out (x x) at
 * `knockedMs`, which stays
 * `afterMs` after the release.
 */
export const HOLD = Object.freeze({clickMs: 500, dizzyMs: 1500, knockedMs: 3000, afterMs: 1000});
export const HOLD_FRAMES = Object.freeze([
    Object.freeze({at: 0, eyes: 'squeeze', dx: 0}),
    Object.freeze({at: HOLD.dizzyMs, eyes: 'dizzy', dx: 0}),
    Object.freeze({at: HOLD.knockedMs, eyes: 'knocked', dx: 0}),
]);

/**
 * Only open eyes that may move play: mode `idle`, the stroll on. In any other mode a press
 * is only a click, on the release.
 *
 * @param {object} e  the eyes element {mode, stroll}
 * @returns {boolean}
 */
export function holdPlays(e) {
    return e?.mode === 'idle' && e.stroll !== false;
}

/**
 * After a hold of `ms`: knocked out for `afterMs` when it got there, else back to the stroll at once.
 *
 * @param {number} ms
 * @returns {?{eyes: string, ms: number}}
 */
export function releaseEyes(ms) {
    return Number.isFinite(ms) && ms >= HOLD.knockedMs ? {eyes: 'knocked', ms: HOLD.afterMs} : null;
}

/**
 * The stroll (MASCOT.md "The stroll"): in mode `idle` only, one beat at a time, each a few
 * single frames then a hold (`still`: no frame, the eyes are already so). `eyes`: 'open' | 'blink' (12 % high for BLINK_MS, then open) |
 * 'smile'; `dx` where the eyes end, reached in `steps` moves of 3 px, STEP_MS apart.
 */
export const STROLL = Object.freeze([
    {name: 'rest', eyes: 'open', dx: 0, steps: 0, hold: 4500, still: true},   // "—": already so
    {name: 'look left', eyes: 'open', dx: -9, steps: 3, hold: 1250},
    {name: 'stroll right', eyes: 'open', dx: 9, steps: 6, hold: 1500},
    {name: 'back', eyes: 'open', dx: 0, steps: 3, hold: 2500},
    {name: 'blink', eyes: 'blink', dx: 0, steps: 0, hold: 3000},
    // every other cycle a wink in its place (MASCOT.md § Expressions)
    {name: 'smile', eyes: 'smile', alt: 'wink', dx: 0, steps: 0, hold: 1250},
    {name: 'long rest', eyes: 'open', dx: 0, steps: 0, hold: 7000},
].map(b => Object.freeze(b)));

export const STEP_MS = 90;
export const BLINK_MS = 110;
/** Each hold is jittered by ±25 %. */
export const JITTER = 0.25;

/**
 * @param {number} i  the beat to play (any integer: wraps over two cycles, the second with
 *   each beat's `alt` eyes: the smile's wink)
 * @param {number} rand  0..1 (Math.random in the Shell, fixed in tests)
 * @returns {{beat: object, next: number, holdMs: number}}
 */
export function nextBeat(i, rand) {
    const n = STROLL.length;
    const at = ((Math.trunc(i) % (2 * n)) + 2 * n) % (2 * n);
    const base = STROLL[at % n];
    const beat = at >= n && base.alt ? {...base, eyes: base.alt} : base;
    const r = Math.max(0, Math.min(1, Number.isFinite(rand) ? rand : 0.5));
    return {beat, next: (at + 1) % (2 * n), holdMs: Math.round(beat.hold * (1 - JITTER + 2 * JITTER * r))};
}

/**
 * A beat's frames from where the eyes are: each {at: ms from the beat's start, eyes, dx}.
 * A move is `steps` frames of an equal share of the way; a blink is two frames.
 *
 * @param {object} beat  a STROLL entry
 * @param {number} fromDx  where the eyes are
 * @returns {{at: number, eyes: string, dx: number}[]}
 */
export function beatFrames(beat, fromDx = 0) {
    if (beat.still)
        return [];
    if (beat.eyes === 'blink')
        return [{at: 0, eyes: 'blink', dx: fromDx}, {at: BLINK_MS, eyes: 'open', dx: fromDx}];
    if (!beat.steps)
        return [{at: 0, eyes: beat.eyes, dx: beat.dx}];
    const out = [];
    for (let k = 1; k <= beat.steps; k++)
        out.push({at: (k - 1) * STEP_MS, eyes: beat.eyes, dx: fromDx + (beat.dx - fromDx) * k / beat.steps});
    return out;
}

/** The eyes' box at 1em: as wide as the stroll reaches, as high as the pill. */
export const EYES_BOX = Object.freeze({w: 48, h: 32});

/**
 * What to draw (MASCOT.md § Eyes, the 120 × 32 pill's numbers about its centre), in px at
 * 1em: x from the box's centre, y from its top. Bars are rounded rects (`lid`: a flat top);
 * arcs quadratic, stroke 2.4, round caps; lines polylines of `w`, round caps and joins;
 * rings circles of stroke `w`. An expression (EXPRESSIONS) is drawn whatever the mode.
 *
 * @param {string} mode  one of EYE_MODES
 * @param {object} [frame]
 * @param {string} [frame.eyes]  'open' | 'blink' | 'smile' (mode `idle` only), or an expression
 * @param {number} [frame.dx]  the stroll's offset (mode `idle` only)
 * @returns {{bars: object[], arcs: object[], lines: object[], rings: object[]}}
 */
export function eyesShapes(mode, frame = {}) {
    const s = shapesOf(mode, frame);
    return {bars: s.bars ?? [], arcs: s.arcs ?? [], lines: s.lines ?? [], rings: s.rings ?? []};
}

// an eye's centre (the bars' middles, rounded to the pair's symmetry)
const EL = -8.5, ER = 8.5;

// a spiral from the top, `turns` round, inward to 15 % of r; sign 1 clockwise
function spiral(cx, cy, r, turns, sign) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
        const t = i / 48, a = sign * t * turns * 2 * Math.PI - Math.PI / 2, rr = r * (1 - t * 0.85);
        pts.push([Math.round((cx + rr * Math.cos(a)) * 100) / 100, Math.round((cy + rr * Math.sin(a)) * 100) / 100]);
    }
    return {pts, w: 1.8};
}

const EXPRESSION_SHAPES = {
    wink: dx => ({bars: [{x: -11 + dx, y: 11, w: 4.5, h: 10, r: 2.2}], arcs: [{x1: 3.5 + dx, x2: 13 + dx, y: 18, cy: 11.5}]}),
    content: () => ({arcs: [{x1: EL - 4.5, x2: EL + 4.5, y: 14, cy: 21}, {x1: ER - 4.5, x2: ER + 4.5, y: 14, cy: 21}]}),
    drowsy: () => ({bars: [{x: -11.5, y: 15, w: 5.5, h: 6, r: 2.75, lid: true}, {x: 5.5, y: 15, w: 5.5, h: 6, r: 2.75, lid: true}]}),
    startled: () => ({rings: [{cx: EL, cy: 16, r: 3.8, w: 2.2}, {cx: ER, cy: 16, r: 3.8, w: 2.2}]}),
    squeeze: () => ({
        lines: [
            {pts: [[EL - 3.5, 11.5], [EL + 2.5, 16], [EL - 3.5, 20.5]], w: 2.4},
            {pts: [[ER + 3.5, 11.5], [ER - 2.5, 16], [ER + 3.5, 20.5]], w: 2.4},
        ],
    }),
    dizzy: () => ({lines: [spiral(EL, 16, 5.2, 1.75, 1), spiral(ER, 16, 5.2, 1.75, -1)]}),
    knocked: () => ({
        lines: [EL, ER].flatMap(c => [
            {pts: [[c - 3, 13], [c + 3, 19]], w: 2.4}, {pts: [[c + 3, 13], [c - 3, 19]], w: 2.4},
        ]),
    }),
};

function shapesOf(mode, {eyes = 'open', dx = 0} = {}) {
    if (EXPRESSION_SHAPES[eyes])
        return EXPRESSION_SHAPES[eyes](mode === 'idle' ? dx : 0);
    const bar = (x, y, w, h, r) => ({x, y, w, h, r});
    switch (mode) {
    case 'waiting':
        return {bars: [bar(-12, 8, 6, 15, 3), bar(6, 8, 6, 15, 3)], arcs: []};
    case 'missed':      // 6 px toward the light, at the left end
        return {bars: [bar(-17, 11, 4.5, 10, 2.2), bar(0, 11, 4.5, 10, 2.2)], arcs: []};
    case 'sleep':
        return {bars: [bar(-14, 16, 9, 2.4, 1.2), bar(5, 16, 9, 2.4, 1.2)], arcs: []};
    }
    if (eyes === 'smile') {
        return {
            bars: [],
            arcs: [{x1: -13.5 + dx, x2: -4 + dx, y: 18, cy: 11.5}, {x1: 3.5 + dx, x2: 13 + dx, y: 18, cy: 11.5}],
        };
    }
    if (eyes === 'blink') {
        const h = 10 * 0.12;
        return {bars: [bar(-11 + dx, 16 - h / 2, 4.5, h, h / 2), bar(6 + dx, 16 - h / 2, 4.5, h, h / 2)], arcs: []};
    }
    return {bars: [bar(-11 + dx, 11, 4.5, 10, 2.2), bar(6 + dx, 11, 4.5, 10, 2.2)], arcs: []};
}
