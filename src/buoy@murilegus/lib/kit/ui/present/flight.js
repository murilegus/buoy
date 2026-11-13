import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {boxOf, poseAt, takeoff} from '../../model/flight.js';

/**
 * Shared parts in flight (design/motion "Phần chung đi tới chỗ mới", FEATURES M4 "Motion:
 * shared parts"). A builder marks the parts every form of an activity has — its leading and
 * its title — with markShared(); when a pill changes form (compact, expanded, back) or Home
 * opens a tile's tab, each marked part of the new form whose mark the old form had flies
 * from where it was to its place, on the bg's progress.
 *
 * The part itself is laid out at its place from the start and hidden (opacity 0); a
 * Clutter.Clone of it, in a layer above, is drawn there instead, moved and scaled (the clone
 * paints its source at the clone's own opacity, clutter-clone.c clutter_clone_paint). So
 * nothing is laid out again on the way, and the part is drawn at its end size. Landing drops
 * the clone and shows the part. Parts only one form has are not this file's: they fade or
 * are uncovered as before.
 */

const MARK = '_buoyShared';

/**
 * @template {Clutter.Actor} T
 * @param {T} actor  (or null: nothing to mark)
 * @param {'leading'|'title'} part
 * @param {?object} activity  presentation data with its `id`; none, no mark
 * @returns {T} the actor
 */
export function markShared(actor, part, activity) {
    if (actor && typeof activity?.id === 'string' && activity.id)
        actor[MARK] = `${part}:${activity.id}`;
    return actor;
}

// The marked parts under `root` that are shown, the first of each mark
function sharedParts(root) {
    const out = new Map();
    const walk = a => {
        if (!a.visible)
            return;
        const key = a[MARK];
        if (key && !out.has(key))
            out.set(key, a);
        for (const c of a.get_children())
            walk(c);
    };
    if (root)
        walk(root);
    return out;
}

// The font size of a title: its own label's, or the first label under it (a scrolling
// title is a box around one); null when there is none
function fontOf(actor) {
    const find = a => a instanceof St.Label ? a : a.get_children().map(find).find(Boolean) ?? null;
    const l = find(actor);
    const size = l?.get_theme_node().get_font().get_size();
    return size > 0 ? size / Pango.SCALE : null;
}

// An actor's box on the stage, a title's with its font size. `force`: lay the stage out
// first if it needs it (clutter_actor_get_allocation_box does), so a form just set gives
// its real places.
function stageBox(actor, force = false) {
    if (force)
        actor.get_allocation_box();
    const r = actor.get_transformed_extents();
    const box = {x: r.get_x(), y: r.get_y(), w: r.get_width(), h: r.get_height()};
    if (actor[MARK]?.startsWith('title:'))
        box.font = fontOf(actor);
    return box;
}

export class Flights {
    /**
     * @param {Clutter.Actor} layer  above the content, unclipped by it; its owner clips it to
     *   the bg
     * @param {function(): ?Clutter.Actor} scope  where the new form lives: a part whose
     *   place came late or was built again (a Home rebuilt as a glance arrives, a tab that
     *   shows the tile's activity a frame later) is looked for there
     */
    constructor(layer, scope) {
        this._layer = layer;
        this._scope = scope;
        /** @type {object[]} */
        this._list = [];
        /** @type {Map<string, object>} marks that left a box and found no place yet */
        this._waiting = new Map();
        /** @type {Map<string, {actor: Clutter.Actor, opacity: number, gone: boolean, id: number}>} old parts, hidden while theirs fly */
        this._left = new Map();
        /** @type {Map<string, object>} old parts read by departures(), for the next launch */
        this._departed = new Map();
        /** @type {?Map<string, object>} old parts of this flight not in the air (yet) */
        this._leaving = null;
    }

    get flying() {
        return this._list.length > 0 || this._waiting.size > 0;
    }

    /**
     * Where the shared parts under `root` are now — a part in flight where its clone is — before
     * `root`'s form is replaced.
     *
     * @param {?Clutter.Actor} root
     * @returns {Map<string, object>} mark → box
     */
    departures(root) {
        const boxes = new Map();
        this._forget(this._departed);
        this._departed = new Map();
        for (const f of this._list)
            boxes.set(f.key, f.box);
        for (const [key, actor] of sharedParts(root)) {
            if (boxes.has(key) || !actor.mapped)
                continue;
            boxes.set(key, stageBox(actor));
            // the old form may go before the new one is set (a pill's content is replaced
            // at once): known gone, never touched again
            const d = {actor, opacity: actor.opacity, gone: false, id: 0};
            d.id = actor.connect('destroy', () => {
                d.gone = true;
            });
            this._departed.set(key, d);
        }
        return boxes;
    }

    // Old parts let go: still there, shown as they were
    _forget(parts) {
        for (const d of parts?.values() ?? []) {
            if (d.gone)
                continue;
            d.actor.disconnect(d.id);
            d.actor.opacity = d.opacity;
        }
    }

    /**
     * The new form is in place: each of its shared parts that left a box takes off from there;
     * one not there yet takes off when it comes (step). Any flight under way lands first
     * (departures() took its place).
     *
     * @param {Map<string, object>} boxes  departures()
     * @param {?Clutter.Actor} root  the new form
     * @param {number} [p]  the bg's progress now
     */
    launch(boxes, root, p = 0) {
        const departed = this._departed;
        this._departed = new Map();
        this.land();
        if (!boxes.size)
            return;
        this._waiting = new Map(boxes);
        this._leaving = departed;
        this._take(root ? sharedParts(root) : new Map(), p, true);
        this.step(p);
    }

    // The waiting marks found among `parts` take off: from their box, over the rest of the way
    _take(parts, p, force = false) {
        for (const [key, source] of parts) {
            const from = this._waiting.get(key);
            if (!from || !source.get_stage())
                continue;
            const to = stageBox(source, force);
            if (!(to.w > 0 && to.h > 0))
                continue;           // not laid out yet: next frame
            const start = takeoff(key.split(':')[0], from, to);
            this._waiting.delete(key);
            if (!start)
                continue;
            const clone = new Clutter.Clone({source});
            this._layer.add_child(clone);
            const f = {key, clone, start, p0: force ? 0 : p, box: from, source: null};
            this._list.push(f);
            this._follow(f, source);
            // the old part is in the air now: hide it where it fades out (a kept tab is shown
            // again, as it was, when the flight lands)
            const old = this._leaving?.get(key);
            if (old && !old.gone && !this._left.has(key)) {
                this._leaving.delete(key);
                this._left.set(key, old);
                old.actor.opacity = 0;
            }
        }
    }

    // The clone draws `source`, which stays hidden at its place until the flight lands
    _follow(f, source) {
        this._release(f);
        f.source = source;
        f.opacity = source.opacity;
        f.goneId = source.connect('destroy', () => {
            f.source = null;
        });
        f.clone.source = source;
        source.opacity = 0;
    }

    _release(f) {
        if (!f.source)
            return;
        f.source.disconnect(f.goneId);
        f.source.opacity = f.opacity;
        f.source = null;
    }

    /**
     * Every frame of the bg's spring: each clone at its pose, towards where its part is now
     * (a list laid out late moves it; the clone follows, and a part built again is found by
     * its mark).
     *
     * @param {number} p  the bg's progress, 0 … 1 (past 1 on an overshoot)
     */
    step(p) {
        const lost = this._list.filter(f => !f.source);
        if (this._waiting.size || lost.length) {
            const parts = sharedParts(this._scope?.() ?? null);
            for (const f of lost) {
                const again = parts.get(f.key);
                if (again && again.width > 0)
                    this._follow(f, again);
            }
            if (this._waiting.size)
                this._take(parts, p);
        }
        // the layer is 0 × 0 (it must not count in its owner's size), which transform_stage_point
        // cannot invert: its own place on the stage, unscaled, gives the offset
        const [lx, ly] = this._layer.get_transformed_position();
        for (const f of this._list) {
            if (!f.source)
                continue;
            // a part relaid since the last frame has no transformed place until the stage is
            // laid out (NaN): lay it out then; still none, the clone waits hidden
            let to = stageBox(f.source);
            if (![to.x, to.y, to.w, to.h].every(Number.isFinite))
                to = stageBox(f.source, true);
            const pose = poseAt(f.start, to, p, f.p0);
            const x = pose.x - lx, y = pose.y - ly;
            f.clone.visible = [x, y, pose.scale, to.w, to.h].every(Number.isFinite);
            if (!f.clone.visible)
                continue;
            f.clone.set_size(f.source.width, f.source.height);
            f.clone.set_position(Math.round(x), Math.round(y));
            f.clone.set_scale(pose.scale, pose.scale);
            f.box = boxOf(pose, to);
        }
    }

    /** Every part at its place: the clones go, the parts show, the old ones too. */
    land() {
        for (const f of this._list) {
            this._release(f);
            f.clone.destroy();
        }
        this._list = [];
        this._waiting = new Map();
        this._forget(this._left);
        this._forget(this._leaving);
        this._left = new Map();
        this._leaving = null;
    }
}
