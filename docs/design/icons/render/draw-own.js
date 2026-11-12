// The symbolic icons Gravity UI lacks, drawn in its way (design/icons "Icon tự vẽ"): 16 grid,
// strokes 1.5 as filled shapes, frames r 3 outside / r 1.5 inside with the outer edge on .5,
// round ends; a slash variant is Gravity's: the line from (2.5, 2.5) to (13.5, 13.5), the
// shape touching it below-left and cut 1.5 clear of it above-right.
// Writes own/<drawing>.svg beside it; battery* and bluetooth there are drawn by hand.
// Then scripts/symbolic-icons.js ships them under the theme's names. gjs -m draw-own.js
import GLib from 'gi://GLib';

const HERE = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const GRAVITY = `${HERE}/gravity-ui`, OWN = `${HERE}/own`, out = OWN;
const f = n => +n.toFixed(3);
const P = (x, y) => `${f(x)} ${f(y)}`;

// a stroke 1.5 wide from a to b with round ends, as a filled capsule
function seg(x1, y1, x2, y2, w = 1.5) {
    const r = w / 2, a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a) * r, ny = Math.cos(a) * r;
    return `M${P(x1 + nx, y1 + ny)}L${P(x2 + nx, y2 + ny)}A${r} ${r} 0 0 0 ${P(x2 - nx, y2 - ny)}` +
        `L${P(x1 - nx, y1 - ny)}A${r} ${r} 0 0 0 ${P(x1 + nx, y1 + ny)}Z`;
}
// a rounded rectangle, clockwise or (ccw) counter-clockwise
function rr(x, y, w, h, r, ccw = false) {
    if (!ccw)
        return `M${P(x + r, y)}H${f(x + w - r)}A${r} ${r} 0 0 1 ${P(x + w, y + r)}V${f(y + h - r)}` +
            `A${r} ${r} 0 0 1 ${P(x + w - r, y + h)}H${f(x + r)}A${r} ${r} 0 0 1 ${P(x, y + h - r)}V${f(y + r)}` +
            `A${r} ${r} 0 0 1 ${P(x + r, y)}Z`;
    return `M${P(x + r, y)}A${r} ${r} 0 0 0 ${P(x, y + r)}V${f(y + h - r)}A${r} ${r} 0 0 0 ${P(x + r, y + h)}` +
        `H${f(x + w - r)}A${r} ${r} 0 0 0 ${P(x + w, y + h - r)}V${f(y + r)}A${r} ${r} 0 0 0 ${P(x + w - r, y)}Z`;
}
// a frame: outer box at (x, y, w, h) r, inner 1.5 in, r - 1.5
const frame = (x, y, w, h, r = 3) => rr(x, y, w, h, r) + rr(x + 1.5, y + 1.5, w - 3, h - 3, r - 1.5, true);
// a stroke along an arc around (cx, cy), radius rad, from angle a0 to a1 (degrees, clockwise on screen)
function arc(cx, cy, rad, a0, a1, w = 1.5) {
    const r = w / 2, t = d => d * Math.PI / 180, pt = (R, d) => [cx + R * Math.cos(t(d)), cy + R * Math.sin(t(d))];
    const big = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const [o0, o1, i1, i0] = [pt(rad + r, a0), pt(rad + r, a1), pt(rad - r, a1), pt(rad - r, a0)];
    return `M${P(...o0)}A${f(rad + r)} ${f(rad + r)} 0 ${big} 1 ${P(...o1)}A${r} ${r} 0 0 1 ${P(...i1)}` +
        `A${f(rad - r)} ${f(rad - r)} 0 ${big} 0 ${P(...i0)}A${r} ${r} 0 0 1 ${P(...o0)}Z`;
}
// a closed polygon with rounded corners (radius r at each vertex)
function roundPoly(pts, r) {
    const n = pts.length;
    let d = '';
    for (let i = 0; i < n; i++) {
        const [p0, p, p1] = [pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n]];
        const v0 = [p0[0] - p[0], p0[1] - p[1]], v1 = [p1[0] - p[0], p1[1] - p[1]];
        const l0 = Math.hypot(...v0), l1 = Math.hypot(...v1);
        const u0 = [v0[0] / l0, v0[1] / l0], u1 = [v1[0] / l1, v1[1] / l1];
        const th = Math.acos(u0[0] * u1[0] + u0[1] * u1[1]);
        const k = r / Math.tan(th / 2);
        const a = [p[0] + u0[0] * k, p[1] + u0[1] * k], b = [p[0] + u1[0] * k, p[1] + u1[1] * k];
        const sweep = u0[0] * u1[1] - u0[1] * u1[0] < 0 ? 1 : 0;
        d += `${i ? 'L' : 'M'}${P(...a)}A${r} ${r} 0 0 ${sweep} ${P(...b)}`;
    }
    return `${d}Z`;
}
// a polygon moved in by dist (convex, clockwise on screen)
function inset(pts, dist) {
    const n = pts.length, lines = pts.map((p, i) => {
        const q = pts[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L;          // inward for clockwise
        return [[p[0] + nx * dist, p[1] + ny * dist], [q[0] + nx * dist, q[1] + ny * dist]];
    });
    return lines.map((l, i) => {
        const m = lines[(i + n - 1) % n];
        const [[x1, y1], [x2, y2]] = m, [[x3, y3], [x4, y4]] = l;
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
        return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    });
}
const dot = (cx, cy, r = 1) => `M${P(cx - r, cy)}A${r} ${r} 0 1 0 ${P(cx + r, cy)}A${r} ${r} 0 1 0 ${P(cx - r, cy)}Z`;

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16">${body}</svg>`;
const path = (d, evenodd = false) => `<path fill="currentColor"${evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''} d="${d}"/>`;
const read = p => new TextDecoder().decode(GLib.file_get_contents(p)[1]);
const inner = s => s.trim().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

// Gravity's slash: the shape kept below-left of the line's edge and from 1.5 past it above-right
function slashed(body, from = 2.5, to = 13.5) {
    const u = [Math.SQRT1_2, Math.SQRT1_2], n = [Math.SQRT1_2, -Math.SQRT1_2];
    const at = (t, d) => P(8 + t * u[0] + d * n[0], 8 + t * u[1] + d * n[1]);
    const band = `M${at(-12, -0.75)}L${at(12, -0.75)}L${at(12, 2.25)}L${at(-12, 2.25)}Z`;
    // a body that brings its own clipPath id "a" (Gravity's plane) keeps it, ours is "s"
    return `<g clip-path="url(#s)">${body}</g>${path(seg(from, from, to, to))}` +
        `<defs><clipPath id="s"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 0h16v16H0z${band}"/></clipPath></defs>`;
}

const KEYCAP = frame(1.5, 1.5, 13, 13);          // Gravity's square-hashtag frame
const ONE = 'M9 5.5a.75.75 0 0 0-1.23-.576l-1.5 1.25a.75.75 0 1 0 .96 1.152l.27-.225V10.5a.75.75 0 0 0 1.5 0z';  // circle-number-1's 1

// every stroke its own path: overlapping strokes of opposite winding would cancel
const strokes = (...ds) => ds.map(d => path(d)).join('');
const TRI = [[8, 1], [15, 10], [1, 10]];
const turn = ([x, y]) => [16 - x, 16 - y];
const ARM = [[1.75, 9.25, 1.75, 6.5], [4, 4.25, 13.5, 4.25], [13.5, 4.25, 11.5, 2.25], [13.5, 4.25, 11.5, 6.25]];
const REPEAT = [...ARM.map(a => seg(...a)), arc(4, 6.5, 2.25, 180, 270),
    ...ARM.map(([a, b, c, d]) => seg(...turn([a, b]), ...turn([c, d]))), arc(12, 9.5, 2.25, 0, 90)];

const ICONS = {
    'num-lock': path(KEYCAP + ONE, true),
    // f: a stem with a hook to the right and a short bar; n: a stem and an arch
    'fn-lock': path(KEYCAP, true) + strokes(
        seg(5.5, 11.25, 5.5, 7), arc(7, 7, 1.5, 180, 270), seg(7, 5.5, 7.5, 5.5), seg(4.5, 8, 6.75, 8),
        seg(9, 11.25, 9, 8.75), arc(10.25, 8.75, 1.25, 180, 360), seg(11.5, 8.75, 11.5, 11.25)),
    // Gravity's keyboard, lowered and shorter, with three rays over it
    'keyboard-brightness': path(frame(0.5, 6.5, 15, 9), true) +
        strokes(dot(4, 10), dot(6.67, 10), dot(9.33, 10), dot(12, 10), seg(6.25, 12.75, 9.75, 12.75),
            seg(8, 0.75, 8, 3), seg(3.4, 2.4, 4.6, 3.6), seg(12.6, 2.4, 11.4, 3.6)),
    // a pad with its two buttons
    'touchpad': path(frame(0.5, 1.5, 15, 13), true) + strokes(seg(2, 10.25, 14, 10.25), seg(8, 10.25, 8, 13)),
    // ⏏: a triangle with Gravity's corners (outer = inner + 1.5) over a bar
    'eject': path(roundPoly(TRI, 1.75) + roundPoly(inset(TRI, 1.5).reverse(), 0.25), true) + path(seg(2.25, 13.25, 13.75, 13.25)),
    // repeat: two arms of a rounded loop, each ending in Gravity's open arrowhead; the second
    // is the first turned 180° about the centre
    'repeat': strokes(...REPEAT),
    // repeat one: the loop with circle-number-1's 1 in it, smaller
    'repeat-1': strokes(...REPEAT) + strokes(seg(8.5, 6.5, 8.5, 9.5), seg(8.5, 6.5, 7.25, 7.5)),
    // a clipboard: a board with its clip on top
    'clipboard': path(frame(2.5, 2.5, 11, 13), true) + path(rr(5, 1, 6, 3.5, 1.5)),
};
ICONS['touchpad-slash'] = slashed(ICONS.touchpad, 1.5, 14.5);
ICONS['bluetooth-slash'] = slashed(inner(read(`${OWN}/bluetooth.svg`)));
ICONS['plane-slash'] = slashed(inner(read(`${GRAVITY}/plane.svg`)));

for (const [name, body] of Object.entries(ICONS))
    GLib.file_set_contents(`${out}/${name}.svg`, svg(body));
print(Object.keys(ICONS).join(' '));
