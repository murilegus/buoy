import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {CODE, DECLARATIONS, cornerUniforms, frameInActor, onTopEdge, wantsCorners} from './lib/kit/rounded.js';

const EFFECT = 'buoy-corners';

// One Shell.GLSLEffect per window on the top edge (ui/lightbox.js RadialShaderEffect pattern):
// the class builds the pipeline once (shell-glsl-effect.c), each instance keeps its own
// uniforms.
const CornersEffect = GObject.registerClass(
class CornersEffect extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, DECLARATIONS, CODE, false);
    }

    /** @param {object} u  cornerUniforms() */
    setUniforms(u) {
        this._loc ??= {
            box: this.get_uniform_location('buoy_box'),
            frame: this.get_uniform_location('buoy_frame'),
            pixel: this.get_uniform_location('buoy_pixel'),
        };
        this.set_uniform_float(this._loc.box, 4, u.box);
        this.set_uniform_float(this._loc.frame, 4, u.frame);
        this.set_uniform_float(this._loc.pixel, 1, [u.pixel]);
        this.queue_repaint();
    }
});

/**
 * Rounded top corners on windows whose top edge meets the see-through bar (SPEC §1a,
 * 2026-11-02; tiled and top-edge 2026-11-04): maximized, tiled, or moved up against it
 * (kit/rounded.js onTopEdge, wantsCorners). Each normal window is watched for maximize,
 * fullscreen and moves; while it is on the top edge its actor carries the effect, and only
 * then are its size and scale watched to keep the arcs on the frame's top corners.
 * Signals only: `window-created`, `workareas-changed`, `notify::maximized-*`,
 * `notify::fullscreen`, `position-changed`, `size-changed`, the window manager's
 * `size-change`/`size-changed`, and the settings.
 *
 * Leaving maximized or tiled: Shell snapshots the window and freezes its actor at `size-change`,
 * before the state changes; the actor thaws at `size-changed`, once the client has drawn
 * its new size, while the snapshot fades out over it (js/ui/windowManager.js
 * _sizeChangeWindow, _prepareAnimationInfo, _sizeChangedWindow). The state changes in
 * between, so the effect stays on the actor until `size-changed`: the frozen actor keeps
 * its corners, and so does the snapshot (meta-window-actor.c
 * meta_window_actor_paint_to_content → clutter_actor_paint, effects included).
 */
export class WindowCorners {
    /** @param {Gio.Settings} settings  Buoy's */
    constructor(settings) {
        this._settings = settings;
        this._windows = new Map();      // MetaWindow → {ids, actor, actorIds, effect, holding}
        this._on = settings.get_boolean('window-corners');
        this._radius = settings.get_int('window-corners-radius');
        this._settingsIds = [
            settings.connect('changed::window-corners', () => {
                this._on = settings.get_boolean('window-corners');
                this._syncAll();
            }),
            settings.connect('changed::window-corners-radius', () => {
                this._radius = settings.get_int('window-corners-radius');
                this._syncAll();
            }),
        ];
        this._displayIds = [
            global.display.connect('window-created', (_d, win) => this._track(win)),
            global.display.connect('workareas-changed', () => this._syncAll()),
        ];
        // Shell freezes the actor at size-change and thaws it at size-changed
        const wm = global.window_manager;
        this._wmIds = [
            wm.connect('size-change', (_wm, actor) => this._sizeChange(actor)),
            wm.connect('size-changed', (_wm, actor) => this._sizeChanged(actor)),
        ];
        for (const actor of global.get_window_actors())
            this._track(actor.meta_window);
    }

    _track(win) {
        if (!win || this._windows.has(win))
            return;
        const s = {ids: [], actor: null, actorIds: [], effect: null, holding: false};
        this._windows.set(win, s);
        const sync = () => this._sync(win, s);
        s.ids = [
            win.connect('notify::maximized-horizontally', sync),
            win.connect('notify::maximized-vertically', sync),
            win.connect('notify::fullscreen', sync),
            win.connect('position-changed', sync),  // moved onto or off the top edge
            win.connect('size-changed', sync),      // resized from its top edge
            win.connect('shown', sync),     // a window mapped maximized gets its actor late
            win.connect('unmanaged', () => this._forget(win)),
        ];
        sync();
    }

    _forget(win) {
        const s = this._windows.get(win);
        if (!s)
            return;
        this._detach(s);
        s.ids.forEach(id => win.disconnect(id));
        this._windows.delete(win);
    }

    _syncAll() {
        for (const [win, s] of this._windows)
            this._sync(win, s);
    }

    _sync(win, s) {
        const want = wantsCorners({
            on: this._on,
            normal: win.get_window_type() === Meta.WindowType.NORMAL,
            top: onTopEdge(win.maximized_vertically, win.get_frame_rect(),
                win.get_work_area_current_monitor()),
            fullscreen: win.is_fullscreen(),
        });
        if (!want && s.holding && this._on)
            return;                     // the frozen actor still shows the old size; _sizeChanged ends it
        const actor = want ? win.get_compositor_private() : null;
        // a window placed on the top edge before its first buffer has an empty actor: an
        // offscreen effect on it asks Cogl for a 0×0 framebuffer; its size-changed comes next
        if (!actor || !actor.width || !actor.height) {
            this._detach(s);
            return;
        }
        if (s.actor !== actor) {
            this._detach(s);
            s.actor = actor;
            s.effect = new CornersEffect();
            actor.add_effect_with_name(EFFECT, s.effect);
            const update = () => this._update(win, s);
            s.actorIds = [
                [actor, actor.connect('notify::allocation', update)],
                [actor, actor.connect('resource-scale-changed', update)],
                [actor, actor.connect('destroy', () => this._detach(s, true))],
            ];
        }
        this._update(win, s);
    }

    // A size change starts on a window with corners: hold them until it ends. (With no
    // size-changed — the size did not change — they stay until the next one: harmless, the
    // arcs follow the frame.)
    _sizeChange(actor) {
        const s = this._windows.get(actor.meta_window);
        if (!s?.effect || s.actor !== actor)
            return;
        s.holding = true;
    }

    _sizeChanged(actor) {
        const win = actor.meta_window, s = this._windows.get(win);
        if (!s?.holding)
            return;
        s.holding = false;
        this._sync(win, s);
    }

    _update(win, s) {
        if (!s.effect || s.holding)
            return;
        const [width, height] = s.actor.get_size();
        const frame = frameInActor(win.get_frame_rect(), win.get_buffer_rect());
        s.effect.setUniforms(cornerUniforms({width, height}, frame, this._radius,
            s.actor.get_resource_scale()));
    }

    _detach(s, destroyed = false) {
        if (!s.actor)
            return;
        s.actorIds.forEach(([obj, id]) => obj.disconnect(id));
        s.actorIds = [];
        if (!destroyed)
            s.actor.remove_effect(s.effect);
        s.actor = s.effect = null;
        s.holding = false;
    }

    destroy() {
        this._settingsIds.forEach(id => this._settings.disconnect(id));
        this._settingsIds = [];
        this._displayIds.forEach(id => global.display.disconnect(id));
        this._displayIds = [];
        this._wmIds.forEach(id => global.window_manager.disconnect(id));
        this._wmIds = [];
        for (const win of [...this._windows.keys()])
            this._forget(win);
    }
}
