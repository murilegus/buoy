import Graphene from 'gi://Graphene';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {WorkspaceBackground} from 'resource:///org/gnome/shell/ui/workspace.js';

/**
 * The Overview's workspace backgrounds grow under the see-through bar (SPEC §1,
 * 2026-11-04). Shell sizes them to the work area — the monitor minus the bar's strut
 * (shell-workspace-background.c allocate) — and clips them there twice: `_bin` clips to
 * its allocation, and the background's rounded clip bounds are the work area
 * (workspace.js _updateRoundedClipBounds). Under GNOME's opaque bar that is the whole
 * visible picture; under Buoy's the strip behind the bar stayed the Overview's dark
 * backdrop to the last frame and then jumped to the wallpaper.
 *
 * Here both clips reach out over the struts by `strut × (1 − state)`: at state 1 (the
 * Overview) exactly GNOME's, at 0 (the desktop) the whole monitor, in between the same
 * curve the background itself follows — from the first pixel of a three-finger swipe,
 * too. Every edge with a strut reaches, so the corner above Ubuntu's dock opens with the
 * rest; on an edge without one nothing changes. Shell calls
 * `_updateBorderRadius` on every state step and `_updateRoundedClipBounds` on layout
 * changes; both are wrapped.
 *
 * What is under the bar then follows the state: the wallpaper below 0.5, the Overview's
 * dark backdrop from 0.5 up — `wallpaperUnderBar()` for the text's contrast, with a
 * call to `onChange` when it flips.
 */

let patched = null;     // {radius, bounds, touched: Map<WorkspaceBackground, ids>, under, onChange}

/**
 * @param {boolean} on  wrap (enable) or restore (disable)
 * @param {function(): void} [onChange]  called when wallpaperUnderBar() flips
 */
export function reachUnderBar(on, onChange) {
    const proto = WorkspaceBackground.prototype;
    if (on && !patched) {
        patched = {
            radius: proto._updateBorderRadius, bounds: proto._updateRoundedClipBounds,
            touched: new Map(), under: true, onChange,
        };
        proto._updateBorderRadius = function () {
            patched.radius.call(this);
            reach(this);
        };
        proto._updateRoundedClipBounds = function () {
            reach(this);
        };
    } else if (!on && patched) {
        proto._updateBorderRadius = patched.radius;
        proto._updateRoundedClipBounds = patched.bounds;
        for (const [bg, ids] of patched.touched) {
            ids.forEach(([obj, id]) => obj.disconnect(id));
            bg._bin.remove_clip();
            bg._bin.clip_to_allocation = true;
            patched.bounds.call(bg);
        }
        patched = null;
    }
}

/**
 * @returns {boolean} the wallpaper, not the Overview's backdrop, is under the bar
 *   (true outside the Overview, and through the first half of opening or swiping it)
 */
export function wallpaperUnderBar() {
    return patched?.under ?? true;
}

// How far past the work area the background shows on each edge, in monitor px: the
// struts, times how far the Overview is from shown.
function beyond(bg) {
    const m = Main.layoutManager.monitors[bg._monitorIndex], w = bg._workarea;
    const f = 1 - bg._stateAdjustment.value;
    if (!m)
        return {left: 0, top: 0, right: 0, bottom: 0};
    return {
        left: Math.max(0, w.x - m.x) * f,
        top: Math.max(0, w.y - m.y) * f,
        right: Math.max(0, m.x + m.width - w.x - w.width) * f,
        bottom: Math.max(0, m.y + m.height - w.y - w.height) * f,
    };
}

function reach(bg) {
    if (!bg._bgManager)
        return;                 // destroyed
    const monitor = Main.layoutManager.monitors[bg._monitorIndex];
    const work = bg._workarea;
    const out = beyond(bg);
    if (work.y > monitor.y) {
        const under = bg._stateAdjustment.value < 0.5;
        if (under !== patched.under) {
            patched.under = under;
            patched.onChange?.();
        }
    }
    const rect = new Graphene.Rect();
    rect.origin.x = work.x - monitor.x - out.left;
    rect.origin.y = work.y - monitor.y - out.top;
    rect.size.width = work.width + out.left + out.right;
    rect.size.height = work.height + out.top + out.bottom;
    bg._bgManager.backgroundActor.content.set_rounded_clip_bounds(rect);
    track(bg);
    clipBin(bg);
}

// `_bin` drops clip_to_allocation for an explicit clip that can reach past it; it is
// redone whenever its allocation changes (every frame of the animation).
function track(bg) {
    if (patched.touched.has(bg))
        return;
    bg._bin.clip_to_allocation = false;
    patched.touched.set(bg, [
        [bg._bin, bg._bin.connect('notify::allocation', () => clipBin(bg))],
        [bg, bg.connect('destroy', () => patched?.touched.delete(bg))],
    ]);
}

function clipBin(bg) {
    const box = bg._bin.get_allocation_box();
    const [width, height] = box.get_size();
    if (!height)
        return;
    // the bin shows the work area scaled to its size (shell-workspace-background.c)
    const out = beyond(bg);
    const sx = width / bg._workarea.width, sy = height / bg._workarea.height;
    bg._bin.set_clip(-out.left * sx, -out.top * sy,
        width + (out.left + out.right) * sx, height + (out.top + out.bottom) * sy);
}
