// Run: gjs -m tests/rounded.test.js   (pure: rounded top corners under the bar, SPEC §1a)
import {
    ART_CODE, ART_DECLARATIONS, CODE, DECLARATIONS, artCoverage, artRadius, cornerUniforms, coverage,
    effectBox, frameInActor, onTopEdge, wantsCorners,
} from '../src/buoy@murilegus/lib/kit/model/rounded.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function near(actual, expected, msg, tol = 1e-6) {
    if (typeof actual !== 'number' || Math.abs(actual - expected) > tol)
        throw new Error(`${msg}: expected ≈${expected}, got ${actual}`);
}

// --- which windows ----------------------------------------------------------------------
const w = {on: true, normal: true, top: true, fullscreen: false};
eq(wantsCorners(w), true, 'a normal window maximized vertically (maximized, or tiled left/right) gets corners');
eq(wantsCorners({...w, on: false}), false, 'window-corners off: none');
eq(wantsCorners({...w, normal: false}), false, 'a dialog or utility window: none');
eq(wantsCorners({...w, top: false}), false, 'a window below the top edge: the client keeps its own corners');
const wa = {x: 0, y: 40, width: 1920, height: 1040};
eq(onTopEdge(true, {y: 40}, wa), true, 'maximized vertically (maximized, tiled left/right): on the top edge');
eq(onTopEdge(false, {y: 40}, wa), true, 'a top quarter tile, or a window moved up to the bar: on the top edge');
eq(onTopEdge(false, {y: 41}, wa), false, 'one px below the bar: not');
eq(onTopEdge(false, {y: 600}, wa), false, 'a bottom quarter or a floating window lower down: not');
eq(onTopEdge(false, {y: 0}, {x: 1920, y: 0, width: 1920, height: 1080}), true,
    'a monitor without the bar: its work area starts at its top');
eq(wantsCorners({...w, fullscreen: true}), false, 'fullscreen: none, even if it was maximized');

// --- the effect's texture (clutter-actor-box.c _clutter_actor_box_enlarge_for_effects) ---
eq(effectBox(1920, 1048), {x: -2, y: -2, width: 1923, height: 1051}, 'an integer size: 2 px before, 1 after');
eq(effectBox(1366, 728), {x: -2, y: -2, width: 1369, height: 731}, '1366 wide');
eq(effectBox(1280.5, 700.25), {x: -2, y: -2, width: 1284, height: 703}, 'a fractional size, as Clutter rounds it');
for (const [ww, hh] of [[1366, 728], [1920, 1048], [2560, 1400], [3440, 1400], [1707.5, 1040.3]]) {
    const b = effectBox(ww, hh);
    if (b.x > -0.75 || b.y > -0.75 || b.x + b.width < ww + 0.75 || b.y + b.height < hh + 0.75)
        throw new Error(`effectBox ${ww}×${hh}: must pad the actor by ≥ 0.75 px each side, got ${JSON.stringify(b)}`);
}

// --- the frame in the actor ---------------------------------------------------------------
eq(frameInActor({x: 0, y: 32, width: 1920}, {x: 0, y: 32}), {left: 0, top: 0, right: 1920},
    'maximized, no client margin: the frame is the actor');
eq(frameInActor({x: 100, y: 80, width: 800}, {x: 74, y: 57}), {left: 26, top: 23, right: 826},
    'client-side margins: the frame is inset');

// --- uniforms -----------------------------------------------------------------------------
const actor = {width: 1920, height: 1048};
const frame = {left: 0, top: 0, right: 1920};
const u = cornerUniforms(actor, frame, 15, 1);
eq(u, {box: [-2, -2, 1923, 1051], frame: [0, 0, 1920, 15], pixel: 1, tiled: 0}, 'uniforms at scale 1');
eq(cornerUniforms(actor, frame, 15, 1, true).tiled, 1, 'maximized vertically: tiled');
eq(cornerUniforms(actor, frame, 15, 2).pixel, 0.5, 'scale 2: the edge fades over half a logical px');
eq(cornerUniforms(actor, frame, 15, 0).pixel, 1, 'no scale yet: 1');
eq(cornerUniforms({width: 20, height: 20}, {left: 0, top: 0, right: 20}, 15, 1).frame[3], 10,
    'the radius is no wider than half the frame');
eq(cornerUniforms(actor, frame, -3, 1).frame[3], 0, 'a negative radius is none');

// --- what the shader keeps (coverage mirrors CODE) ----------------------------------------
// pixel centre (x + 0.5, y + 0.5) in actor px → texture coordinate
const at = (x, y, uu = u) => coverage((x + 0.5 - uu.box[0]) / uu.box[2], (y + 0.5 - uu.box[1]) / uu.box[3], uu);
near(at(0, 0), 0, 'the top-left pixel is cut');
near(at(1919, 0), 0, 'the top-right pixel is cut');
near(at(960, 0), 1, 'the top edge between the arcs stays');
near(at(15, 0), 1, 'past the arc on the top edge, kept');
near(at(0, 15), 1, 'below the arc on the left edge, kept');
near(at(0, 1047), 1, 'the bottom-left corner stays square');
near(at(1919, 1047), 1, 'the bottom-right corner stays square');
near(at(5, 5), 1, 'inside the arc (5.5, 5.5 is 13.4 px from the centre at 15, 15)');
near(at(3, 3), 0, 'outside the arc');
const edge = at(2, 6);
if (!(edge > 0 && edge < 1))
    throw new Error(`a pixel on the arc is part-covered (smoothed), got ${edge}`);
eq(at(0, 0, cornerUniforms(actor, frame, 0, 1)), 1, 'radius 0: nothing is cut');
// a floating window at the top edge: the frame sits inside a client-drawn shadow
const fu = cornerUniforms({width: 800, height: 600}, {left: 26, top: 23, right: 774}, 15, 1);
near(at(26, 23, fu), 0, 'floating: the frame\'s top-left pixel is cut');
near(at(773, 23, fu), 0, 'floating: the frame\'s top-right pixel is cut');
near(at(10, 30, fu), 1, 'floating: the shadow left of the frame is kept');
near(at(30, 10, fu), 1, 'floating: the shadow above the corner is kept');
near(at(790, 30, fu), 1, 'floating: the shadow right of the frame is kept');
near(at(400, 10, fu), 1, 'floating: the shadow above the top edge is kept');
eq(fu.tiled, 0, 'not maximized vertically: not tiled');

// a window tiled to the left half (#196): the client, told tiled-top but not tiled-right,
// keeps a 20 px margin all round (gnome-text-editor, gnome-disks, glxgears in the X11
// frames client, Shell 50) and draws a 1 px border just outside the frame
const tiledFrame = {left: 20, top: 20, right: 980};
const tu = cornerUniforms({width: 1000, height: 1080}, tiledFrame, 15, 1, true);
const untiled = cornerUniforms({width: 1000, height: 1080}, tiledFrame, 15, 1);
near(at(980, 25, tu), 0, 'tiled: just right of the frame in the corner square, cleared');
near(at(19, 25, tu), 0, 'tiled: just left of the frame in the corner square, cleared');
near(at(990, 30, tu), 0, 'tiled: further out beside the corner, cleared');
near(at(997, 0, tu), 0, 'tiled: out to the effect box\'s corner, cleared');
near(at(985, 19, tu), 0, 'tiled: above the frame beside the arc, cleared');
near(at(970, 19, tu), 0, 'tiled: just above the arc, cleared');
near(at(500, 19, tu), 0, 'tiled: above the straight top edge, cleared');
near(at(500, 0, tu), 0, 'tiled: up to the effect box\'s top, cleared');
near(at(980, 35, tu), 1, 'tiled: beside the frame below the arc, the border is kept');
near(at(990, 600, tu), 1, 'tiled: beside the frame further down, the shadow is kept');
near(at(19, 35, tu), 1, 'tiled: left of the frame below the arc, kept');
near(at(500, 1060, tu), 1, 'tiled: below the frame, kept');
near(at(980, 25, untiled), 1, 'not tiled: beside the frame in the corner square, still kept');
near(at(500, 19, untiled), 1, 'not tiled: above the frame, still kept');
for (const [x, y] of [[20, 20], [22, 26], [25, 22], [24, 24], [979, 20], [977, 26], [500, 20], [20, 35]])
    near(at(x, y, tu), at(x, y, untiled), `tiled: inside the frame (${x}, ${y}) is cut as before`, 1e-12);
eq(at(985, 19, cornerUniforms({width: 1000, height: 1080}, tiledFrame, 0, 1, true)), 1,
    'tiled, radius 0: nothing is cleared');
// maximized: the frame is the actor, so nothing of the window is outside it
const mt = cornerUniforms(actor, frame, 15, 1, true);
for (const [x0, y0] of [[0, 0], [1900, 0], [900, 0], [0, 1028]]) {
    for (let y = y0; y < y0 + 20; y++) {
        for (let x = x0; x < x0 + 20; x++)
            near(at(x, y, mt), at(x, y), `maximized: (${x}, ${y}) is as before`, 1e-12);
    }
}
let tl = 0, tr = 0;
for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
        tl += at(x, y, tu);
        tr += at(999 - x, y, tu);
    }
}
near(tl, tr, 'tiled: the two corners are mirror images', 1e-9);

let left = 0, right = 0;
for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
        left += at(x, y);
        right += at(1919 - x, y);
    }
}
near(left, right, 'the two corners are mirror images', 1e-9);
near(15 * 15 - left, 15 * 15 * (1 - Math.PI / 4), 'the area cut is a corner\'s worth (r² − πr²/4)', 1);

// --- shader text ----------------------------------------------------------------------------
for (const name of ['buoy_box', 'buoy_frame', 'buoy_pixel', 'buoy_tiled']) {
    if (!DECLARATIONS.includes(name) || !CODE.includes(name))
        throw new Error(`shader: "${name}" must be declared and used`);
}
if (!CODE.includes('cogl_tex_coord_in[0]') || !CODE.includes('cogl_color_out *='))
    throw new Error('shader: reads the texture coordinate and scales the premultiplied colour');

// --- album art: concentric with the pill ------------------------------------------------
eq(artRadius(24, 14, 40), 10, 'compact: 24 − 14 = 10, smaller than the pill\'s 24');
eq(artRadius(16, 14, 20, 6), 6, 'minimal: 16 − 14 = 2 is raised to the floor 6');
eq(artRadius(16, 14, 20), 2, 'without a floor: 16 − 14 = 2');
eq(artRadius(16, 4, 20, 6), 10, 'a small inset: 12, but never past a circle (10)');
eq(artRadius(8, 14, 40), 0, 'an inset larger than the pill radius: square, not negative');
eq(artRadius(30, 4, 40, 6) < 30, true, 'inner is always smaller than outer');

const art = [20, 20, 10, 1];
near(artCoverage(0.5, 0.5, art), 1, 'art: the centre is kept');
near(artCoverage(0.5, 0.025, art), 1, 'art: the middle of the top edge is kept');
near(artCoverage(0.025, 0.5, art), 1, 'art: the middle of the left edge is kept');
near(artCoverage(0.025, 0.025, art), 0, 'art: the top-left corner pixel is cut');
near(artCoverage(0.975, 0.975, art), 0, 'art: the bottom-right corner pixel is cut');
near(artCoverage(0.5 + Math.SQRT1_2 / 2, 0.5 + Math.SQRT1_2 / 2, art), 0.5,
    'art: a point on the circle is half covered', 1e-9);
near(artCoverage(0.0125, 0.0125, [40, 40, 0, 1]), 1, 'art: radius 0 keeps the corners');
near(artCoverage(0.0125, 0.0125, [40, 40, 16, 1]), 0, 'compact art: its corner pixel is cut');
near(artCoverage(0.5, 0.0125, [40, 40, 16, 1]), 1, 'compact art: past the arc the top edge is kept');
let kept = 0;
for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++)
        kept += artCoverage((x + 0.5) / 40, (y + 0.5) / 40, [40, 40, 16, 1]);
}
near(40 * 40 - kept, 16 * 16 * (4 - Math.PI), 'compact art: four corners\' worth is cut (4r² − πr²)', 2);
// the real texture: the 20 px art's paint box padded to 23 px from −2 (effectBox)
const pad = effectBox(20, 20);
eq(pad, {x: -2, y: -2, width: 23, height: 23}, 'a 20 px art\'s texture runs −2…21');
// at a point of the art, in actor px
const tex = (x, y) => artCoverage((x - pad.x) / pad.width, (y - pad.y) / pad.height, art, pad);
near(tex(10, 10), 1, 'padded: the art\'s centre is kept');
near(tex(-0.5, 10), 0, 'padded: the padding left of the art goes');
near(tex(20.5, 10), 0, 'padded: the padding right of the art goes');
near(tex(10, 0.5), 1, 'padded: the top of the art\'s middle column is kept');
near(tex(1.5, 1.5), 0, 'padded: a 20 px circle cuts the art\'s pixel (1, 1)');
near(tex(10 + 10 * Math.SQRT1_2, 10 - 10 * Math.SQRT1_2), 0.5, 'padded: a point on the circle is half covered', 1e-9);
if (!ART_DECLARATIONS.includes('buoy_art') || !ART_CODE.includes('buoy_art') ||
    !ART_CODE.includes('buoy_box') || !ART_CODE.includes('cogl_tex_coord_in[0]') || !ART_CODE.includes('cogl_color_out *='))
    throw new Error('art shader: declares and uses buoy_art, scales the premultiplied colour');
if (/\bhalf\b/.test(ART_CODE))
    throw new Error('art shader: "half" is reserved in GLSL ES');

print('rounded: ok');
