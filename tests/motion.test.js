// Run: gjs -m tests/motion.test.js   (pure: Buoy's springs, design/motion and tokens)
import {
    SPRINGS, FADES, dampingRatio, springAt, isSettled, settleTime, springFor, radiusAt,
    progressOf, springTime,
} from '../src/buoy@murilegus/lib/kit/model/motion.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function near(actual, expected, tol, msg) {
    if (!(Math.abs(actual - expected) <= tol))
        throw new Error(`${msg}: expected ${expected} ± ${tol}, got ${actual}`);
}

// --- ζ = 1 − bounce (Apple's two numbers) ----------------------------------------------
near(dampingRatio(SPRINGS.snap), 0.85, 1e-9, 'snap: ζ 0.85');
near(dampingRatio(SPRINGS.move), 0.8, 1e-9, 'move: ζ 0.8');
near(dampingRatio(SPRINGS.open), 0.75, 1e-9, 'open: ζ 0.75');
eq([dampingRatio(SPRINGS.size), dampingRatio(SPRINGS.close)], [1, 1], 'size and close: critically damped, no bounce');
near(dampingRatio({d: 300, bounce: 2}), 0.01, 1e-9, 'a bounce past 1 is kept under it');
eq(dampingRatio({d: 300, bounce: -1}), 1, 'a negative bounce: none');

// --- the tokens' table (tokens.vi.md "Chuyển động"): overshoot, 95 %, settle --------------
const overshoot = s => {
    let max = 0;
    for (let t = 0; t < 5 * s.d; t++)
        max = Math.max(max, springAt(s, -400, 0, 0, t).x);
    return max / 400 * 100;
};
const reach95 = s => {
    for (let t = 0; ; t++) {
        if (Math.abs(springAt(s, -400, 0, 0, t).x) <= 20)
            return t;
    }
};
for (const [name, over, t95, settle] of [
    ['snap', 0.6, 141, 327], ['size', 0, 182, 344], ['move', 1.5, 216, 532],
    ['open', 2.8, 249, 631], ['close', 0, 272, 515],
]) {
    near(overshoot(SPRINGS[name]), over, 0.05, `${name}: overshoot ${over} %`);
    near(reach95(SPRINGS[name]), t95, 1, `${name}: 95 % at ${t95} ms`);
    near(settleTime(SPRINGS[name]), settle, 1, `${name}: settled at ${settle} ms (0.5 px of 400)`);
}

// --- the spring itself ------------------------------------------------------------------
eq(springAt(SPRINGS.move, 10, 2, 50, 0), {x: 10, v: 2}, 'at 0: where and how fast it started');
eq(springAt(SPRINGS.move, 10, 2, 50, Infinity), {x: 50, v: 0}, 'animations off: there at once');
eq(springAt(SPRINGS.close, 50, 0, 50, 100), {x: 50, v: 0}, 'at its target and still: stays');
{
    // the velocity is the position's derivative (both closed forms)
    for (const name of ['snap', 'close']) {
        const s = SPRINGS[name];
        const a = springAt(s, 0, 0.5, 300, 120), b = springAt(s, 0, 0.5, 300, 120.01);
        near((b.x - a.x) / 0.01, a.v, 1e-3, `${name}: v is dx/dt`);
    }
    // never past the target without a bounce
    let past = false;
    for (let t = 0; t < 2000; t++)
        past ||= springAt(SPRINGS.close, 560, 0, 168, t).x < 168 - 1e-9;
    eq(past, false, 'close (expanded → minimal, 560 → 168): never past its size (shrinkStop is gone)');
}

// --- sent elsewhere mid-way: from where it is, with the velocity it has --------------------
{
    const s = SPRINGS.move;
    const mid = springAt(s, 32, 0, 88, 120);          // growing into a compact
    const back = springAt(SPRINGS.close, mid.x, mid.v, 32, 0);
    eq([back.x, back.v], [mid.x, mid.v], 'retarget: the new spring starts at the old one\'s place and speed');
    const a = springAt(SPRINGS.close, mid.x, mid.v, 32, 16);
    eq(a.x > mid.x, true, 'retarget: still carried on by its speed a frame later (no jump back)');
    const restart = springAt(SPRINGS.close, mid.x, 0, 32, 16);
    eq(a.x > restart.x, true, 'and further than a spring started from rest would be');
}

// --- settled -----------------------------------------------------------------------------
eq(isSettled({x: 100.3, v: 0.001}, 100), true, 'within 0.5 px, slow: settled');
eq(isSettled({x: 100.6, v: 0}, 100), false, '0.6 px away: not yet');
eq(isSettled({x: 100, v: 0.05}, 100), false, 'at it but moving 0.8 px a frame: not yet');

// --- which spring, the radius, progress, the clock --------------------------------------------
eq(springFor('open', {w: 168, h: 32}, {w: 560, h: 280}), 'open', 'growing: its own spring');
eq(springFor('open', {w: 560, h: 280}, {w: 168, h: 32}), 'close', 'shrinking: close, no bounce');
eq(springFor('move', {w: 404, h: 88}, {w: 168, h: 32}), 'close', 'out of the compact: close');
eq(springFor('snap', {w: 180, h: 34}, {w: 168, h: 32}), 'snap', 'hover off: snap both ways');
eq(springFor('size', {w: 200, h: 32}, {w: 168, h: 32}), 'size', 'a shorter text: size');
eq(springFor('nope', {w: 1, h: 1}, {w: 2, h: 2}), 'move', 'an unknown token: move');
eq([radiusAt(32, 28), radiusAt(44, 28), radiusAt(88, 28), radiusAt(280, 28)], [16, 22, 28, 28],
    'radius: half the height until the shape\'s own (16 → 28 as 32 → 88)');
eq(radiusAt(-4, 16), 0, 'never negative');
eq([progressOf(32, 88, 60), progressOf(32, 88, 88), progressOf(5, 5, 9)], [0.5, 1, 1], 'progress');
eq(springTime(400, {enabled: true, slowDown: 1}), 400, 'the clock as it is');
eq(springTime(400, {enabled: true, slowDown: 4}), 100, 'slow-down-factor 4: a quarter as far');
eq(springTime(400, {enabled: true, slowDown: 0}), 400, 'a bad factor: none');
eq(springTime(1, {enabled: false, slowDown: 1}), Infinity, 'animations off: at the end at once');
eq([FADES.out.ms, FADES.in.ms, FADES.state.ms, FADES.idle.ms], [100, 200, 120, 300], 'the fades');

print('motion: ok');
