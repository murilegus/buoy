/**
 * Bu, Buoy's mascot (MASCOT.md, 2026-11-03): the pose grids and the rules that pick a
 * frame and a lamp colour. Pure (no St, no Main, no timers), so it runs under plain gjs;
 * present.js paints the grids and owns the one swap timer. MASCOT.md is the source:
 * tests/mascot.test.js parses its grid blocks and compares them with FRAMES.
 *
 * A grid is 10 × 10 cells, one letter each (MASCOT.md § Drawing rules):
 *   .  empty · B A body, arm · S stripe · D dots · Z sleep "z" · W water
 *   E  eye, a hole (transparent) · L lamp, in the lamp colour
 */

export const SIZE = 10;

/** Cell letter → colour; `null` = transparent; the lamp (L) is not here. */
export const PALETTE = Object.freeze({
    '.': null, E: null,
    B: '#F1EFE8', A: '#F1EFE8',
    S: '#888780', D: '#D3D1C7', Z: '#444441', W: '#185FA5',
});

/** The lamp's `foreground` (pose `turn`): the body colour, as Bu sits only on black. */
export const FOREGROUND = PALETTE.B;

/** The stack's light wins over the pose (INDICATORS § Bu's lamp). */
export const LIGHT_LAMPS = Object.freeze({missed: '#EF9F27', waiting: '#E24B4A'});

/** Frames swap every 500 ms; `once` poses play two swaps of both frames (~2 s). */
export const FRAME_MS = 500;
export const ONCE_FRAMES = 4;

/** One frame per still pose, `.1`/`.2` for moving ones, exactly as in MASCOT.md. */
export const FRAMES = Object.freeze({
    'idle': [
        '....LL....',
        '....BB....',
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
        '....BB.Z..',
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
        '....BB....',
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
        '....BB..A.',
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
        '....BB....',
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
        '....BB....',
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
        '....BB....',
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
        '.A..BB....',
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
        '.A..BB....',
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
        '....BB.D..',
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
        '....BB.D..',
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
        '....BB.D..',
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
        '....BB....',
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
        '....BB....',
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
        '....BB....',
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
        '....BB....',
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
        '....BB....',
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
 * The 13 poses (MASCOT.md § Poses): lamp colour, frames, and motion. `loop` repeats
 * while shown; `then` plays once and settles on that pose.
 */
export const POSES = Object.freeze({
    idle: {lamp: '#B4B2A9'},
    sleep: {lamp: '#444441'},
    missed: {lamp: '#EF9F27'},
    ask: {lamp: '#E24B4A'},
    done: {lamp: '#97C459'},
    busy: {lamp: '#85B7EB', frames: ['busy.1', 'busy.2'], loop: true},
    wave: {lamp: '#FAC775', frames: ['wave.1', 'wave.2'], then: 'idle'},
    think: {lamp: '#AFA9EC', frames: ['think.1', 'think.2'], loop: true},
    turn: {lamp: 'foreground'},
    error: {lamp: '#5F5E5A'},
    compact: {lamp: '#B5D4F4'},
    stale: {lamp: '#444441'},
    party: {lamp: '#97C459', frames: ['party.1', 'party.2'], then: 'done'},
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
 * The lamp is the buoy light (SPEC §2a-i): the stack's amber/red win over the pose,
 * otherwise the pose's own colour.
 *
 * @param {string} pose  one of POSES
 * @param {?string} light  the stack's light shown on this pill: 'missed' | 'waiting' | other
 * @returns {string} '#rrggbb'
 */
export function lampColour(pose, light) {
    if (Object.hasOwn(LIGHT_LAMPS, light ?? ''))
        return LIGHT_LAMPS[light];
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
