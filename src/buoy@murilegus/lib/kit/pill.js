import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {buildCompact, buildExpanded, buildIdle, buildPeek} from './present.js';
import {planExpanded, keyline} from './presentation.js';

const PAD = 14;          // content + 2·PAD = pill width (shapes add 28)
const PEEK_DELAY = 300;  // ms of hover before the peek replaces compact
const MERGE_MS = 300;    // side pills sliding into / out of an expanded one (SPEC §2c)

/**
 * One pill on the island: a background that morphs and a content actor on top, bound
 * to one activity (or none: the idle pill). The Island decides where it sits (its
 * centre `cx` in the container), its role and when it opens; the pill does its own
 * sizing, hover/peek, keyline, press pulse and expanded content.
 *
 *   role 'centre'  the highest-priority pill, at the screen centre; carries the buoy light
 *   role 'side'    a side-by-side pill to the right (SPEC §2c), capped at `maxW`
 *
 * bg and content are siblings in the island's container, not parent and child, so the
 * content never moves with the morph; both are reactive so a click on text lands here.
 */
export class Pill {
    constructor(island, parent) {
        this._island = island;
        this.id = null;
        this.activity = null;
        this.role = 'centre';
        this.cx = 0;
        this.light = 'off';
        this.more = 0;
        this.minimal = false;
        this.maxW = 0;               // 0 = no cap beyond shapes
        this.expanded = false;
        this.fresh = true;           // not placed yet: first layout puts it there, then fades in
        this._peeking = false;
        this._contentW = 0;          // resting content size, measured in _applyContentSize()
        this._contentH = 0;
        this._resizeLater = 0;
        this._hoverLater = 0;
        this._peekId = 0;
        this._destroyed = false;

        this.bg = new St.Widget({style_class: 'buoy-island', reactive: true, track_hover: true});
        this.content = new St.Bin({style_class: 'buoy-content', reactive: true, track_hover: true});
        parent.add_child(this.bg);
        parent.add_child(this.content);

        this.content.connect('notify::width', () => this._contentResized());
        this.content.connect('notify::height', () => this._contentResized());
        for (const a of [this.bg, this.content]) {
            a.connect('notify::hover', () => this._hoverChanged());
            a.connect('button-press-event', (_a, ev) => island._onPillPress(this, ev));
            a.connect('button-release-event', (_a, ev) => island._onPillRelease(this, ev));
        }
    }

    get _s() {
        return this._island.shapes;
    }

    get expandable() {
        return this.activity !== null && planExpanded(this.activity) !== null;
    }

    // St's hover is only the trigger: after a modal grab or a merge Clutter can keep a
    // stale actor under the pointer and report hover where there is none. Confirm with
    // the real pointer against the resting box (the hover growth must not flip it).
    get hovered() {
        if (!this.bg.reactive || !(this.bg.hover || this.content.hover))
            return false;
        const [px, py] = global.get_pointer();
        const [ax, ay] = this._island.actor.get_transformed_position();
        const box = this.expanded ? this._expandedShape() : this.restShape();
        const x0 = ax + this.cx - box.w / 2;
        return px >= x0 && px < x0 + box.w && py >= ay && py < ay + box.h + 2;
    }

    // --- configuration (Island) ------------------------------------------------

    /**
     * @param {?object} activity  null = idle pill
     * @param {object} [opts]
     * @param {string} [opts.role]  'centre' | 'side'
     * @param {string} [opts.light]  buoy light (drawn on the centre pill only)
     * @param {number} [opts.more]  +N on this pill (the last one)
     * @param {boolean} [opts.minimal]  several pills: minimal shapes
     * @param {number} [opts.maxW]  width cap from the space before the system cluster
     */
    configure(activity, {role = 'centre', light = 'off', more = 0, minimal = false, maxW = 0} = {}) {
        const same = (activity?.id ?? null) === this.id;
        if (!same)
            this._stopPeek();
        this.id = activity?.id ?? null;
        this.activity = activity;
        Object.assign(this, {role, light, more, minimal, maxW});
        if (this.expanded) {
            if (activity)
                this._setContent(buildExpanded(activity), false);
            return;
        }
        this._setContent(this._restingContent(), !same);
    }

    // Move the pill's centre; `animate` slides it (slide-to-fill, merge/split).
    setCx(cx, animate) {
        this.cx = cx;
        const shape = this.currentShape();
        if (animate) {
            this._morph(shape, MERGE_MS);
            this.content.ease({x: this._contentX(), duration: MERGE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        } else {
            this.applyShape(shape);
            this._layoutContent();
        }
    }

    // Shown (side pills fade out while another pill is open, SPEC §2c merge).
    setShown(shown, animate) {
        for (const a of [this.bg, this.content]) {
            // Hidden: no leave event will come. Shown again (no grab by then): ask St.
            // Only on a real change: the pill that just closed stays as collapse() left it.
            if (a.reactive !== shown) {
                a.reactive = shown;
                if (shown)
                    a.sync_hover();
                else
                    a.hover = false;
            }
            if (animate)
                a.ease({opacity: shown ? 255 : 0, duration: MERGE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            else
                a.opacity = shown ? 255 : 0;
        }
    }

    // --- shapes -------------------------------------------------------------------

    restShape() {
        if (!this.activity)
            return this._s.idle;
        const shape = this.minimal
            ? this._s.minimal(this._contentW)
            : this._s.compact(this._contentW, this.activity.sizeHint);
        return this.maxW ? {...shape, w: Math.min(shape.w, this.maxW)} : shape;
    }

    currentShape() {
        if (this.expanded)
            return this._expandedShape();
        return this.hovered ? this._s.hover(this.restShape()) : this.restShape();
    }

    _expandedShape() {
        const cap = this._s.expanded;
        const child = this.content.child;
        const [, natural] = child ? child.get_preferred_height(cap.w) : [0, 0];
        const h = Math.min(cap.h, Math.max(Math.ceil(natural), 2 * this._s.idle.h));
        return {w: cap.w, h, r: Math.min(cap.r, Math.floor(h / 2))};
    }

    _bgStyle(shape) {
        const k = keyline(this.activity?.keyline);
        return `border-radius: ${shape.r}px;${k ? ` border-color: ${k};` : ''}`;
    }

    applyShape(shape) {
        this.bg.remove_transition('x');
        this.bg.remove_transition('width');
        this.bg.remove_transition('height');
        this.bg.set_size(shape.w, shape.h);
        this.bg.set_position(this.cx - shape.w / 2, 0);
        this.bg.set_style(this._bgStyle(shape));
    }

    morph(shape = this.currentShape(), duration = 380) {
        this._morph(shape, duration);
    }

    _morph(shape, duration) {
        if (this._destroyed)
            return;
        const x = this.cx - shape.w / 2;
        this.bg.set_style(this._bgStyle(shape));
        const t = this.bg.get_transition('width') || this.bg.get_transition('x');
        if (!t && this.bg.x === x && this.bg.width === shape.w && this.bg.height === shape.h)
            return; // already there: start no transition (nothing animates at rest)
        this.bg.remove_transition('x');
        this.bg.remove_transition('width');
        this.bg.remove_transition('height');
        this.bg.ease({
            x, width: shape.w, height: shape.h, duration,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }

    // Press feedback for the idle pill and activities without an expanded presentation;
    // also how a non-expandable activity shows an alert.
    pulse() {
        if (this._destroyed)
            return;
        const rest = this.currentShape();
        const press = this._s.press(this.restShape());
        this.bg.remove_all_transitions();
        this.bg.set_style(this._bgStyle(press));
        this.bg.ease({
            x: this.cx - press.w / 2, width: press.w, height: press.h,
            duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: finished => {
                if (finished)
                    this._morph(rest, 250);
            },
        });
    }

    // --- expanded (Island decides when) ---------------------------------------------

    expand() {
        this.expanded = true;
        this._stopPeek();
        this._setContent(buildExpanded(this.activity), false);
        this._layoutContent();
        this._morph(this.currentShape(), 380);
    }

    collapse() {
        this.expanded = false;
        // Under the modal grab the pointer left without a leave event, and Clutter still
        // reports the actor it pressed on; sync_hover() would read that stale actor.
        // Clear it; the next real enter sets it again.
        this.bg.hover = false;
        this.content.hover = false;
        this._setContent(this._restingContent(), false);
        this._layoutContent();
        this._morph(this.currentShape(), 380);
    }

    // --- content ------------------------------------------------------------------

    _restingContent() {
        const light = this.role === 'centre' ? this.light : null;
        if (!this.activity)
            return buildIdle({width: this._s.idle.w - 2 * PAD, light});
        const capW = this.maxW || (this.minimal
            ? this._s.minimalMax
            : this._s.compact(Infinity, this.activity.sizeHint).w);
        const opts = {maxWidth: capW - 2 * PAD, light, more: this.more};
        return (this._peeking && buildPeek(this.activity, opts)) || buildCompact(this.activity, opts);
    }

    // fade: cross-fade between activities; without it the new content replaces the
    // old one at once (updates of the same activity, light, peek, expand/collapse).
    _setContent(actor, fade) {
        const old = this.content.child;
        if (old === actor)
            return;
        if (!fade) {
            old?.remove_all_transitions();
            this.content.set_child(actor);
            old?.destroy();
            return;
        }
        if (old) {
            old.ease({
                opacity: 0, duration: 100,
                onComplete: () => {
                    if (this.content.child === old)
                        this.content.set_child(null);
                    old.destroy();
                    if (actor && !this._destroyed)
                        this._fadeIn(actor);
                },
            });
        } else if (actor) {
            this._fadeIn(actor);
        }
    }

    _fadeIn(actor) {
        actor.opacity = 0;
        this.content.set_child(actor);
        // Easing an actor that has never been allocated makes Clutter warn ("needs an
        // allocation"): start the fade on its first allocation instead. One-shot handler,
        // gone with the actor; no timer to clean up.
        const id = actor.connect('notify::allocation', () => {
            actor.disconnect(id);
            actor.ease({opacity: 255, duration: 200, delay: 100});
        });
    }

    // notify::width/height fire inside Clutter's allocation; moving the content there
    // leaves it needing an allocation when stage views update (Clutter warns). So read
    // the size and re-place it just before the next redraw, once per frame.
    _contentResized() {
        if (this._resizeLater || this._destroyed)
            return;
        this._resizeLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._resizeLater = 0;
            this._applyContentSize();
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyContentSize() {
        if (!this.expanded) {
            // natural size, not the allocation: another relayout may already be queued
            // (an icon finished loading). The content has been allocated once by now,
            // so measuring it does not touch an unallocated label.
            const child = this.content.child;
            const [, w] = child ? this.content.get_preferred_width(-1) : [0, 0];
            const [, h] = child ? this.content.get_preferred_height(w) : [0, 0];
            const restW = this.restShape().w;
            this._contentW = Math.ceil(w);
            this._contentH = Math.ceil(h);
            if (this.restShape().w !== restW) {
                this.content.y = Math.max(0, Math.round((this._s.idle.h - this._contentH) / 2));
                this._island._pillResized(this); // neighbours slide to fit
                return;
            }
        }
        this._layoutContent();
        if (this.activity)
            this._morph(this.currentShape(), 200);
    }

    _contentX() {
        return this.expanded
            ? Math.round(this.cx - this._s.expanded.w / 2)
            : Math.round(this.cx - this._contentW / 2);
    }

    _layoutContent() {
        if (this.expanded) {
            this.content.set_width(this._s.expanded.w);
            this.content.set_position(this._contentX(), 0);
            return;
        }
        if (this.content.natural_width_set)
            this.content.set_width(-1); // back to natural width after expanded
        // stored sizes only: this also runs right after a new child was set
        this.content.remove_transition('x');
        this.content.set_position(this._contentX(),
            Math.max(0, Math.round((this._s.idle.h - this._contentH) / 2)));
    }

    // --- hover and peek ---------------------------------------------------------------

    // bg and content are siblings: moving between them flips one hover off before the
    // other on. Settle the combined state once per frame so the peek does not flicker.
    _hoverChanged() {
        if (this._hoverLater || this._destroyed)
            return;
        this._hoverLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._hoverLater = 0;
            this._applyHover();
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyHover() {
        if (this.expanded)
            return;
        if (this.hovered) {
            if (!this._peeking && !this._peekId && this.activity?.peek) {
                this._peekId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PEEK_DELAY, () => {
                    this._peekId = 0;
                    this._peeking = true;
                    this._setContent(this._restingContent(), false);
                    return GLib.SOURCE_REMOVE;
                });
            }
        } else {
            this._stopPeek();
        }
        this._morph(this.currentShape(), 200);
    }

    _stopPeek() {
        if (this._peekId) {
            GLib.source_remove(this._peekId);
            this._peekId = 0;
        }
        if (this._peeking) {
            this._peeking = false;
            if (!this.expanded)
                this._setContent(this._restingContent(), false);
        }
    }

    // --- leaving ------------------------------------------------------------------------

    // Activity gone from the shown pills: fade out where it is, then destroy.
    leave(onGone) {
        this._stopPeek();
        this.bg.reactive = this.content.reactive = false;
        this.bg.ease({opacity: 0, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this.content.ease({
            opacity: 0, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                this.destroy();
                onGone?.(this);
            },
        });
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        for (const id of [this._resizeLater, this._hoverLater]) {
            if (id)
                global.compositor.get_laters().remove(id);
        }
        this._resizeLater = this._hoverLater = 0;
        if (this._peekId) {
            GLib.source_remove(this._peekId);
            this._peekId = 0;
        }
        this.bg.destroy();
        this.content.destroy();
    }
}
