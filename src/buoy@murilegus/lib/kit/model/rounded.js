/**
 * Rounded top corners on windows whose top edge meets the see-through bar (SPEC §1a,
 * 2026-11-02; tiled and top-edge 2026-11-04): which windows get them and where the arcs
 * fall in the effect's texture. Pure: corners.js reads the window and
 * its actor, hands the numbers here and sets the shader's uniforms from the answer.
 */

/**
 * A window's top edge is on the work area's: maximized vertically — fully maximized, tiled
 * left or right (meta-window-config.c is_tiled_side_by_side needs it), maximized vertically
 * alone, which Mutter pins there (window.c update_edge_constraints) and tells the client
 * `tiled-top` (meta-wayland-xdg-shell.c), so it drops its own top radius — or any window
 * whose frame starts on that line: tiling-assistant's top quarters, which Ubuntu pins with
 * `override_constraints` (not readable back), and a window moved up against the bar
 * (Ethan 2026-11-04). Under the see-through bar that edge is what the corners are for.
 *
 * @param {boolean} maximizedVertically  MetaWindow:maximized-vertically
 * @param {{y: number}} frame  meta_window_get_frame_rect
 * @param {{y: number}} workArea  the work area of the window's monitor
 * @returns {boolean}
 */
export function onTopEdge(maximizedVertically, frame, workArea) {
    return maximizedVertically || frame.y === workArea.y;
}

/**
 * @param {object} w
 * @param {boolean} w.on  `window-corners`
 * @param {boolean} w.normal  Meta.WindowType.NORMAL
 * @param {boolean} w.top  onTopEdge()
 * @param {boolean} w.fullscreen
 * @returns {boolean} the window gets the effect
 */
export function wantsCorners({on, normal, top, fullscreen}) {
    return on && normal && top && !fullscreen;
}

// mutter clutter/clutter/clutter-macros.h CLUTTER_NEARBYINT
const nearbyint = x => Math.trunc(x < 0 ? x - 0.5 : x + 0.5);

/**
 * The part of the actor the effect's texture covers, in actor px. An offscreen effect
 * draws the actor's paint box, padded so its size does not depend on sub-pixel position
 * (mutter clutter-offscreen-effect.c pre_paint → clutter-actor-box.c
 * _clutter_actor_box_enlarge_for_effects), and the shader sees it as 0…1. A maximized
 * window's paint box is its allocation: Mutter draws no shadow for it
 * (meta-window-actor-x11.c has_shadow), and a Wayland window actor paints its surfaces.
 *
 * @param {number} width  the actor's width
 * @param {number} height  its height
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function effectBox(width, height) {
    const x2 = Math.ceil(width + 0.75), y2 = Math.ceil(height + 0.75);
    const w = nearbyint(width) + 3, h = nearbyint(height) + 3;
    return {x: x2 - w, y: y2 - h, width: w, height: h};
}

/**
 * Where the frame sits in the actor: the actor is the buffer rect (meta-window-actor.c
 * meta_window_actor_sync_actor_geometry); client-side decorations leave a margin around
 * the frame rect, none when maximized.
 *
 * @param {{x: number, y: number, width: number}} frame  meta_window_get_frame_rect
 * @param {{x: number, y: number}} buffer  meta_window_get_buffer_rect
 * @returns {{left: number, top: number, right: number}} actor px
 */
export function frameInActor(frame, buffer) {
    const left = frame.x - buffer.x;
    return {left, top: frame.y - buffer.y, right: left + frame.width};
}

/**
 * The shader's uniforms.
 *
 * @param {{width: number, height: number}} actor  the window actor's size
 * @param {{left: number, top: number, right: number}} frame  frameInActor()
 * @param {number} radius  `window-corners-radius`, logical px
 * @param {number} scale  the actor's resource scale: the edge is smoothed over one device px
 * @returns {{box: number[], frame: number[], pixel: number}} box: texture origin and size;
 *   frame: left, top, right, radius (no wider than half the frame)
 */
export function cornerUniforms(actor, frame, radius, scale) {
    const b = effectBox(actor.width, actor.height);
    const r = Math.max(0, Math.min(radius, (frame.right - frame.left) / 2));
    return {
        box: [b.x, b.y, b.width, b.height],
        frame: [frame.left, frame.top, frame.right, r],
        pixel: 1 / (scale > 0 ? scale : 1),
    };
}

/**
 * What CODE below does to one pixel, for the tests: keep these two in step.
 *
 * @param {number} u  texture coordinate 0…1 across
 * @param {number} v  0…1 down
 * @param {object} uniforms  cornerUniforms()
 * @returns {number} how much of the window's pixel is kept, 0…1
 */
export function coverage(u, v, uniforms) {
    const {box, frame, pixel} = uniforms;
    const px = box[0] + u * box[2], py = box[1] + v * box[3];
    const [left, top, right, r] = frame;
    const cx = Math.min(Math.max(px, left + r), right - r), cy = top + r;
    const inFrame = px >= left && px <= right && py >= top;
    if (!(r > 0 && inFrame && py < cy && cx !== px))
        return 1;
    const d = Math.hypot(px - cx, py - cy);
    return Math.min(Math.max((r - d) / pixel + 0.5, 0), 1);
}

/**
 * Cogl FRAGMENT snippet (the `ui/lightbox.js` RadialShaderEffect pattern): runs after the
 * texture is sampled, so `cogl_color_out` is the window's premultiplied pixel. Inside the
 * frame but outside the two top arcs it goes to nothing; across the arc's edge it fades
 * over one device px. Outside the frame — a floating window's client-drawn shadow — it is
 * left alone.
 */
export const DECLARATIONS = `
uniform vec4 buoy_box;
uniform vec4 buoy_frame;
uniform float buoy_pixel;
`;

export const CODE = `
vec2 p = buoy_box.xy + cogl_tex_coord_in[0].xy * buoy_box.zw;
float r = buoy_frame.w;
float cx = clamp(p.x, buoy_frame.x + r, buoy_frame.z - r);
float cy = buoy_frame.y + r;
bool in_frame = p.x >= buoy_frame.x && p.x <= buoy_frame.z && p.y >= buoy_frame.y;
if (r > 0.0 && in_frame && p.y < cy && cx != p.x) {
    float d = length(p - vec2(cx, cy));
    cogl_color_out *= clamp((r - d) / buoy_pixel + 0.5, 0.0, 1.0);
}
`;

// --- Album art in the pill (SPEC §6 media, 2026-11-05) ------------------------------------
// St.Icon does not clip its texture to border-radius (st-icon.c st_icon_paint_node paints the
// background, then the texture), and a background-image is loaded synchronously at paint
// and cached for ever (st-texture-cache.c st_texture_cache_load_file_sync_to_cairo_surface,
// ST_TEXTURE_CACHE_POLICY_FOREVER): no good for https covers that change every track. So the
// art keeps its St.Icon (async load, as Shell's media message) and a small shader rounds it.

/**
 * The art's radius: smaller than the pill's by the art's inset (inner = outer − padding).
 * The inset is the larger one, across: the pill's content padding (14 px, pill.js PAD) is
 * more than the gap above the art, and the corner must clear both. Never under `floor`, at
 * most a circle. Compact: 24 − 14 = 10; minimal: 16 − 14 = 2, raised to 6, under which
 * a 20 px art reads square (2026-11-05, Ethan).
 *
 * @param {number} pillR  the pill's corner radius
 * @param {number} inset  the art's larger distance from the pill's edge
 * @param {number} size  the art's side
 * @param {number} [floor]  the least radius
 * @returns {number}
 */
export function artRadius(pillR, inset, size, floor = 0) {
    return Math.min(Math.max(pillR - inset, floor, 0), size / 2);
}

/**
 * What ART_CODE does to one pixel, for the tests: keep these two in step. The effect's
 * texture is the art's paint box, padded (effectBox above): (u, v) maps through `box`.
 *
 * @param {number} u  texture coordinate 0…1 across
 * @param {number} v  0…1 down
 * @param {number[]} art  [width, height, radius, logical px per device px]
 * @param {{x: number, y: number, width: number, height: number}} [box]  effectBox(); the art
 *   itself when left out
 * @returns {number} how much of the art's pixel is kept, 0…1
 */
export function artCoverage(u, v, [w, h, r, pixel], box = {x: 0, y: 0, width: w, height: h}) {
    const px = box.x + u * box.width, py = box.y + v * box.height;
    const qx = Math.abs(px - w / 2) - (w / 2 - r);
    const qy = Math.abs(py - h / 2) - (h / 2 - r);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    return Math.min(Math.max(0.5 - d / pixel, 0), 1);
}

// Cogl FRAGMENT snippet: a rounded rectangle over the art (its signed distance), faded
// over one device px; the texture's padding around the art is outside, so it goes.
export const ART_DECLARATIONS = `
uniform vec4 buoy_box;
uniform vec4 buoy_art;
`;

export const ART_CODE = `
vec2 hs = buoy_art.xy * 0.5;
vec2 p = buoy_box.xy + cogl_tex_coord_in[0].xy * buoy_box.zw;
vec2 q = abs(p - hs) - (hs - buoy_art.z);
float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - buoy_art.z;
cogl_color_out *= clamp(0.5 - d / buoy_art.w, 0.0, 1.0);
`;
