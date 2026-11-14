import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {FADES} from '../model/motion.js';
import {SpringRunner, afterLayout} from './spring.js';

/**
 * A row of choices with one chosen, its fill a marker of its own behind the row that slides
 * to the next choice (design/motion "Đổi tab"): the tab strip (kit/ui/home.js) and the
 * Media tab's players (modules/media/tab.js, design/media "Nhiều player").
 *
 *   group   an St.Widget with a bin layout, so the row sits inside its padding (a fixed layout
 *           puts children at 0, 0 and leaves the padding all on the right and bottom: mutter
 *           clutter-fixed-layout.c allocate); the marker, placed by hand, is offset by the
 *           same padding. Its own style draws any background.
 *   row     an St.BoxLayout of the choices, rebuilt by its owner
 *
 * The owner rebuilds the row and calls `slide(before, key)` with what `places()` read before:
 * after the new layout, the marker springs from where it was to the chosen one (placed at
 * once the first time) and every choice that was there before springs from its old place to
 * its new one, on `snap`; the chosen one's label fades in.
 */
export class SlidingRow {
    /**
     * @param {object} opts
     * @param {string} [opts.groupClass]  the group's style class
     * @param {string} [opts.rowClass]  the row's
     * @param {string} opts.markerClass  the marker's (its fill and radius)
     */
    constructor({groupClass = '', rowClass = '', markerClass}) {
        this.group = new St.Widget({
            style_class: groupClass, layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.CENTER,
        });
        this.marker = new St.Widget({style_class: markerClass, visible: false});
        this.row = new St.BoxLayout({style_class: rowClass});
        this.group.add_child(this.marker);
        this.group.add_child(this.row);
        this._keys = new WeakMap();
        // the group's padding (left, top): a fixed-position child of a bin layout is placed
        // from the group's own origin (clutter-bin-layout.c allocate), the row from inside it
        this._pad = [0, 0];
        this.group.connect('style-changed', () => {
            const node = this.group.get_theme_node();
            this._pad = [node.get_padding(St.Side.LEFT), node.get_padding(St.Side.TOP)];
            const x = this._markerRun.value('x');
            if (x !== null)
                this._placeMarker(x, this._markerRun.value('w') ?? 0);
        });
        this._markerRun = new SpringRunner(this.marker, ({x, w}) => this._placeMarker(x, w));
        this._later = null;
        this.group.connect('destroy', () => {
            this._later?.();
            this._later = null;
        });
    }

    // x and w in the row's coordinates (places())
    _placeMarker(x, w) {
        this.marker.set_position(Math.round(x) + this._pad[0], this._pad[1]);
        this.marker.set_size(Math.max(0, Math.round(w)), this.row.height);
    }

    /**
     * @param {Clutter.Actor} child  a choice in the row
     * @param {string} key  what it stands for
     */
    tag(child, key) {
        this._keys.set(child, key);
    }

    /**
     * Where each choice sits now, read before the row is rebuilt.
     *
     * @returns {Map<string, {x: number, w: number}>}
     */
    places() {
        const places = new Map();
        if (!this.row.has_allocation())
            return places;
        for (const c of this.row.get_children()) {
            const key = this._keys.get(c);
            if (key === undefined || !c.has_allocation())
                continue;
            const box = c.get_allocation_box();
            places.set(key, {x: box.x1 + c.translation_x, w: box.x2 - box.x1});
        }
        return places;
    }

    /**
     * After the new row's layout: the marker to the chosen choice, the others from their old
     * places.
     *
     * @param {Map<string, {x: number, w: number}>} before  places()
     * @param {?string} chosen  the chosen key (null: no marker)
     * @param {boolean} switched  the choice changed (else the marker is placed at once and
     *   nothing moves)
     */
    slide(before, chosen, switched) {
        this.marker.visible = chosen !== null;
        this._later?.();
        this._later = afterLayout(() => {
            this._later = null;
            if (!this.group.get_stage())
                return;
            const now = this.places();
            const sel = chosen !== null ? now.get(chosen) : null;
            if (sel) {
                if (this._markerRun.value('x') === null || !switched)
                    this._markerRun.set({x: sel.x, w: sel.w});
                else
                    this._markerRun.to({x: sel.x, w: sel.w}, 'snap');
            }
            if (!switched)
                return;
            for (const c of this.row.get_children()) {
                const key = this._keys.get(c);
                const was = before.get(key), is = now.get(key);
                if (key === chosen) {
                    const label = findLabel(c);
                    if (label) {
                        label.opacity = 0;
                        label.ease({opacity: 255, duration: FADES.in.ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
                    }
                }
                if (!was || !is || Math.abs(was.x - is.x) < 0.5)
                    continue;
                const run = new SpringRunner(c, v => {
                    c.translation_x = Math.round(v.t);
                });
                run.set({t: was.x - is.x});
                run.to({t: 0}, 'snap', {onDone: () => run.destroy()});
            }
        });
    }
}

// the first label inside a choice (its name), if any
function findLabel(actor) {
    if (actor instanceof St.Label)
        return actor;
    for (const c of actor.get_children()) {
        const l = findLabel(c);
        if (l)
            return l;
    }
    return null;
}
