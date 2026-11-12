import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {SPRINGS, isSettled, settleTime, springAt, springTime} from '../model/motion.js';

// Long enough for any of our springs; the runner stops itself once all have settled.
const TIMELINE_MS = 60 * 1000;

/**
 * Springs on the frame clock (design/motion "Hiệu năng"): one Clutter.Timeline per runner,
 * bound to its actor so it ticks with the actor's stage view, running only while a value is
 * on its way and stopped once all have settled — nothing ticks at rest, none while idle.
 *
 * A runner moves named numbers (x, width, height, a translation…) and hands them to
 * `apply` every frame. Sent somewhere else mid-way, each number goes on from where it is
 * with the velocity it has (model/motion.js). With animations off (`enable-animations`)
 * it is there at once; `slow-down-factor` stretches its time, as Shell's own `ease()` does
 * (misc/animationUtils.js adjustAnimationTime).
 */
export class SpringRunner {
    /**
     * @param {Clutter.Actor} actor  whose frame clock drives it
     * @param {function(any): void} apply  the values ({name: number}), every frame
     */
    constructor(actor, apply) {
        this._actor = actor;
        this._apply = apply;
        /** @type {Map<string, {x0: number, v0: number, target: number, spring: object, start: number, x: number, v: number}>} */
        this._props = new Map();
        this._timeline = null;
        this._onDone = null;
        this._onFrame = null;
        this._limit = 0;
        this._destroyed = false;
        this._destroyId = actor.connect('destroy', () => this.destroy());
    }

    /** @returns {boolean} something is on its way */
    get running() {
        return this._timeline !== null;
    }

    /**
     * @param {string} name
     * @returns {?number} where it is now
     */
    value(name) {
        return this._props.get(name)?.x ?? null;
    }

    /**
     * @param {string} name
     * @returns {?number} where it is heading
     */
    target(name) {
        return this._props.get(name)?.target ?? null;
    }

    /**
     * Put values in place at once (a first layout, a jump): any move of them stops.
     *
     * @param {Record<string, number>} values
     */
    set(values) {
        for (const [name, x] of Object.entries(values))
            this._props.set(name, {x0: x, v0: 0, target: x, spring: SPRINGS.size, start: 0, x, v: 0});
        if (![...this._props.values()].some(p => p.x !== p.target))
            this._stop(false);
        this._apply(this._values());
    }

    /**
     * Send values to new targets on a spring. The others keep their own way.
     *
     * @param {Record<string, number>} targets
     * @param {string|object} spring  a SPRINGS key or {d, bounce}
     * @param {object} [opts]
     * @param {function(boolean): void} [opts.onDone]  all settled (true), or sent elsewhere /
     *   stopped first (false)
     * @param {function(object): void} [opts.onFrame]  after each frame's apply: the runner
     */
    to(targets, spring, {onDone = null, onFrame = null} = {}) {
        if (this._destroyed)
            return;
        const s = typeof spring === 'string' ? SPRINGS[spring] ?? SPRINGS.move : spring;
        const now = this._elapsed();
        for (const [name, target] of Object.entries(targets)) {
            const p = this._props.get(name);
            if (!p) {
                this._props.set(name, {x0: target, v0: 0, target, spring: s, start: now, x: target, v: 0});
                continue;
            }
            this._advance(p, now);
            Object.assign(p, {x0: p.x, v0: p.v, target, spring: s, start: now});
        }
        const prev = this._onDone;
        this._onDone = onDone;
        this._onFrame = onFrame;
        prev?.(false);
        const settings = St.Settings.get();
        const moving = [...this._props.values()].some(p => !isSettled(p, p.target));
        if (!moving || !settings.enable_animations || !this._actor.mapped) {
            this._finish();
            return;
        }
        // a safety stop: the slowest spring's settle, stretched, and some
        this._limit = Math.max(this._limit, now + 2 * settleTime(s, 1000) * Math.max(1, settings.slow_down_factor));
        if (!this._timeline) {
            this._timeline = new Clutter.Timeline({actor: this._actor, duration: TIMELINE_MS});
            this._timeline.connect('new-frame', () => this._frame());
            this._timeline.start();
        }
    }

    /** Stop where it is (the values stay as last applied). */
    stop() {
        this._stop(false);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._stop(false);
        this._apply = () => {};
        this._actor.disconnect(this._destroyId);
    }

    _elapsed() {
        return this._timeline ? this._timeline.get_elapsed_time() : 0;
    }

    _advance(p, now) {
        const settings = St.Settings.get();
        const t = springTime(now - p.start, {enabled: settings.enable_animations, slowDown: settings.slow_down_factor});
        const at = springAt(p.spring, p.x0, p.v0, p.target, t);
        p.x = at.x;
        p.v = at.v;
    }

    _frame() {
        const now = this._elapsed();
        let moving = false;
        for (const p of this._props.values()) {
            this._advance(p, now);
            if (isSettled(p, p.target)) {
                p.x = p.target;
                p.v = 0;
            } else {
                moving = true;
            }
        }
        if (!moving || now > this._limit) {
            this._finish();
            return;
        }
        this._apply(this._values());
        this._onFrame?.(this);
    }

    // everything at its target, applied, then told
    _finish() {
        for (const p of this._props.values()) {
            p.x = p.target;
            p.v = 0;
        }
        this._apply(this._values());
        this._onFrame?.(this);
        this._stop(true);
    }

    _stop(finished) {
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }
        // stopped where they are; times restart from 0 with the next timeline (a retarget
        // while running never comes here: it keeps the velocity)
        for (const p of this._props.values()) {
            p.x0 = p.x;
            p.v0 = p.v = 0;
            p.start = 0;
        }
        this._limit = 0;
        const done = this._onDone;
        this._onDone = null;
        this._onFrame = null;
        done?.(finished);
    }

    /** @returns {Record<string, number>} */
    _values() {
        /** @type {Record<string, number>} */
        const out = {};
        for (const [name, p] of this._props)
            out[name] = p.x;
        return out;
    }
}

/**
 * Run `fn` once, after this frame's layout and before it is painted (the stage's
 * `prepare-frame`, emitted after clutter_stage_maybe_relayout: mutter
 * clutter/clutter/clutter-stage-view.c): where new actors are measured and an offset set
 * on them is painted from their first frame.
 *
 * @param {function(): void} fn
 * @returns {function(): void} cancels it
 */
export function afterLayout(fn) {
    const stage = global.stage;
    let id = stage.connect('prepare-frame', () => {
        stage.disconnect(id);
        id = 0;
        fn();
    });
    stage.queue_redraw();
    return () => {
        if (id)
            stage.disconnect(id);
        id = 0;
    };
}

/**
 * Bring an actor in from `dx` px aside (a tab's body, a list in place: design/motion "Đổi
 * tab", "Danh sách tại chỗ"): its translation springs to 0 and it fades in.
 *
 * @param {Clutter.Actor} actor
 * @param {number} dx
 * @param {string} spring  a SPRINGS key
 * @param {number} fadeMs
 */
export function slideIn(actor, dx, spring, fadeMs) {
    actor.remove_transition('opacity');
    actor.opacity = 0;
    actor.translation_x = dx;
    afterLayout(() => {
        if (!actor.get_stage())
            return;
        const run = new SpringRunner(actor, v => {
            actor.translation_x = v.t;
        });
        run.set({t: dx});
        run.to({t: 0}, spring, {onDone: () => run.destroy()});
        actor.ease({opacity: 255, duration: fadeMs, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    });
}
