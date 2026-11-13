// Run: gjs -m tests/flight.test.js   (pure: shared parts in flight, design/motion)
import {takeoff, poseAt, boxOf} from '../src/buoy@murilegus/lib/kit/model/flight.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// the music pill's cover 24 at (28, 4) into the compact's 72 at (8, 8) (design/motion "Pill ↔ compact")
const pillArt = {x: 28, y: 4, w: 24, h: 24}, compactArt = {x: 8, y: 8, w: 72, h: 72};
eq(takeoff('leading', pillArt, compactArt), {x: 28, y: 4, scale: 1 / 3}, 'leading 24 → 72: starts over the pill\'s, a third of its size');
eq(takeoff('leading', compactArt, pillArt), {x: 8, y: 8, scale: 3}, 'and back: three times, over the compact\'s');
eq(takeoff('leading', {x: 0, y: 0, w: 24, h: 24}, {x: 50, y: 50, w: 40, h: 20}), {x: 0, y: 6, scale: 0.6},
    'not square: fits the old box, centred');

// a title keeps its left edge and middle, by the line's height
eq(takeoff('title', {x: 60, y: 6, w: 120, h: 20}, {x: 92, y: 14, w: 160, h: 25}), {x: 60, y: 6, scale: 0.8},
    'title: from the old start, scaled by height');
eq(takeoff('title', {x: 60, y: 6, w: 120, h: 20}, {x: 92, y: 14, w: 160, h: 20}).scale, 1, 'same size of text: only moves');
// the pill's label (21 tall) and the compact's scrolling title (18) at the same font: no jump
eq(takeoff('title', {x: 60, y: 6, w: 200, h: 21, font: 15}, {x: 92, y: 14, w: 160, h: 18, font: 15}), {x: 60, y: 7.5, scale: 1},
    'font sizes known: scaled by them, not the heights; centred on the old middle');
eq(takeoff('title', {x: 0, y: 0, w: 100, h: 20, font: 12}, {x: 0, y: 0, w: 100, h: 20, font: 16}).scale, 0.75, '12 → 16: three quarters');
eq(takeoff('title', {x: 0, y: 0, w: 100, h: 20, font: 12}, {x: 0, y: 0, w: 100, h: 25}).scale, 0.8, 'one font missing: the heights');

for (const bad of [null, {x: 0, y: 0, w: 0, h: 10}, {x: NaN, y: 0, w: 1, h: 1}, {x: 0, y: 0, w: 5}])
    eq([takeoff('leading', bad, compactArt), takeoff('title', compactArt, bad)], [null, null], `no box: no flight (${JSON.stringify(bad)})`);

// on the way: with the bg
const start = takeoff('leading', pillArt, compactArt);
eq(poseAt(start, compactArt, 0), {x: 28, y: 4, scale: 1 / 3}, 'p 0: the takeoff');
eq(poseAt(start, compactArt, 1), {x: 8, y: 8, scale: 1}, 'p 1: its place, its own size');
{
    const h = poseAt(start, compactArt, 0.5);
    eq([h.x, h.y, Math.round(h.scale * 1000) / 1000], [18, 6, 0.667], 'half way');
}
eq(poseAt(start, compactArt, 1.1).x, 6, 'past 1: the bg overshoots, the part with it');
eq(poseAt(start, compactArt, NaN), poseAt(start, compactArt, 1), 'no progress: there');
eq(poseAt({x: 0, y: 0, scale: 0}, compactArt, -1).scale, 0.01, 'never a scale of 0 or less');
eq(poseAt(start, {x: 108, y: 8, w: 72, h: 72}, 1).x, 108, 'the place moved meanwhile (laid out late): it lands there');
// took off late, at 0.5: the rest of the way
eq(poseAt(start, compactArt, 0.5, 0.5), {x: 28, y: 4, scale: 1 / 3}, 'late at 0.5: still at the takeoff');
eq(poseAt(start, compactArt, 0.75, 0.5).x, 18, 'late: half the rest at 0.75');
eq(poseAt(start, compactArt, 1, 0.5), {x: 8, y: 8, scale: 1}, 'late: there at 1 all the same');
eq([poseAt(start, compactArt, 0.5, 1).x, poseAt(start, compactArt, 0.5, -1).x, poseAt(start, compactArt, 0.5, NaN).x], [18, 18, 18],
    'a takeoff point not in 0 … 1: from 0');

eq(boxOf({x: 18, y: 6, scale: 0.5}, {w: 72, h: 72}), {x: 18, y: 6, w: 36, h: 36}, 'a pose covers its scaled size');
eq(boxOf({x: 0, y: 0, scale: 0.5}, {w: 100, h: 20, font: 16}).font, 8, 'and its font, scaled: a title taken off again mid-flight');
eq(boxOf(poseAt(start, compactArt, 0), compactArt), pillArt, 'the takeoff covers the old box');

print('flight: ok');
