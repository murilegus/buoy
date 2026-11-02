import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {buildCompact, buildExpanded, buildIdle, buildPeek} from './present.js';
import {planExpanded, keyline} from './presentation.js';

const PAD = 14;          // content + 2·PAD = pill width (shapes add 28)
const PEEK_DELAY = 300;  // ms of hover before the peek replaces compact
const MERGE_MS = 300;    // side pills sliding into / out of an expanded one (SPEC §2c)
const MORPH_MODE = Clutter.AnimationMode.EASE_OUT_BACK;
const REVEAL_FROM = 0.8; // the bg grows by more than this ratio: it uncovers the content

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
        this._panel = null;          // Home's panel while a click has it open (kit/home.js)
        this.fresh = true;           // not placed yet: first layout puts it there, then fades in
        this._peeking = false;
        this._contentW = 0;          // resting content size, measured in _applyContentSize()
        this._contentH = 0;
        this._resizeLater = 0;
        this._hoverLater = 0;
        this._peekId = 0;
        this._morphTo = null;        // target of the running bg transition
        this._collapsing = false;    // until the collapse morph lands: bg clips the content
        this._follow = null;         // {t, id}: bg transition the content clip follows
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
            if (activity && !this._panel)  // the panel updates itself (Home.update)
                this._setContent(buildExpanded(activity), false);
            return;
        }
        this._setContent(this._restingContent(), !same);
    }

    // Move the pill's centre; `animate` slides it (slide-to-fill, merge/split).
    setCx(cx, animate) {
        this.cx = cx;
        const shape = this.currentShape();
        this._layoutContent();
        if (animate)
            this._morph(shape, MERGE_MS);
        else
            this.applyShape(shape);
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
        this._morphTo = null;
        this._collapsing = false;
        this.bg.remove_transition('x');
        this.bg.remove_transition('width');
        this.bg.remove_transition('height');
        this.bg.set_size(shape.w, shape.h);
        this.bg.set_position(this.cx - shape.w / 2, 0);
        this.bg.set_style(this._bgStyle(shape));
        this._resetContentTransform();
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
        const to = this._morphTo;
        if (t && to?.x === x && to.w === shape.w && to.h === shape.h)
            return; // already heading there: restarting would hold the morph at its start
        this._morphTo = {x, w: shape.w, h: shape.h};
        const from = {cx: this.bg.x + this.bg.width / 2, w: this.bg.width, h: this.bg.height};
        this.bg.remove_transition('x');
        this.bg.remove_transition('width');
        this.bg.remove_transition('height');
        this.bg.ease({
            x, width: shape.w, height: shape.h, duration, mode: MORPH_MODE,
            onStopped: finished => {
                if (finished)
                    this._collapsing = false;
            },
        });
        this._followBg(from, shape, duration);
    }

    // The content sits at its final place at once and never scales (SPEC §5). While the
    // bg grows into it (expand, a much longer text) or shrinks past it (collapse, the
    // EASE_OUT_BACK undershoot), the content is clipped to the bg every frame of the bg's
    // own transition, so it is uncovered exactly as fast as the pill opens. A plain slide
    // (slide-to-fill, merge) moves it with the bg on the same curve instead.
    _followBg(from, to, duration) {
        this._resetContentTransform();
        const grow = Math.min(from.w / to.w, from.h / to.h);
        if (grow < REVEAL_FROM || this._collapsing) {
            const t = ['width', 'height', 'x'].map(p => this.bg.get_transition(p)).find(Boolean);
            if (t)
                this._clipToBg(t, from, to, !this._collapsing);
            return;
        }
        const dx = from.cx - this.cx;
        if (Math.abs(dx) < 0.5)
            return;
        this.content.translation_x = dx;
        this.content.ease({translation_x: 0, duration, mode: MORPH_MODE});
    }

    // fade: opening; the content also fades in with the same progress, so a word the
    // bg's edge is still cutting through stays faint (full from halfway through the morph)
    _clipToBg(t, from, to, fade) {
        const c = this.content;
        // the clip is a rectangle; keep it off the pill's round ends
        const inset = Math.ceil(to.r * 0.15);
        const x0 = from.cx - from.w / 2, x1 = this.cx - to.w / 2;
        const clip = e => {
            const w = from.w + (to.w - from.w) * e;
            const h = from.h + (to.h - from.h) * e;
            const x = x0 + (x1 - x0) * e;
            c.set_clip(x + inset - c.x, -c.y, Math.max(0, w - 2 * inset), Math.max(0, h));
            if (fade)
                c.opacity = Math.round(255 * Math.min(1, Math.max(0, 2 * e - 1)));
        };
        clip(0);
        // new-frame runs as the timeline advances, before layout: no allocation is touched
        const id = t.connect('new-frame', () => clip(t.get_progress()));
        t.connect('stopped', () => {
            if (!this._destroyed && this._follow?.t === t)
                this._resetContentTransform();
        });
        this._follow = {t, id, fade};
    }

    _resetContentTransform() {
        const c = this.content;
        const f = this._follow;
        if (f) {
            f.t.disconnect(f.id);
            this._follow = null;
            // retargeted mid-reveal: finish the fade instead of leaving it part-way
            if (f.fade && c.opacity < 255)
                c.ease({opacity: 255, duration: 100, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        }
        c.remove_clip();
        c.remove_transition('translation-x');
        c.translation_x = 0;
    }

    // Press feedback for the idle pill and activities without an expanded presentation;
    // also how a non-expandable activity shows an alert.
    pulse() {
        if (this._destroyed)
            return;
        const rest = this.currentShape();
        const press = this._s.press(this.restShape());
        this._morphTo = null;
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

    /**
     * @param {?Clutter.Actor} [panel]  Home's panel (a click-open); without it the
     *   activity's own expanded presentation (alert, ask, transient)
     */
    expand(panel = null) {
        this.expanded = true;
        this._panel = panel;
        this._stopPeek();
        this._setContent(panel ?? buildExpanded(this.activity), false);
        this._layoutContent();
        this._morph(this.currentShape(), 380); // fades the content in with the reveal
    }

    collapse() {
        this.expanded = false;
        this._panel = null;
        // Under the modal grab the pointer left without a leave event, and Clutter still
        // reports the actor it pressed on; sync_hover() would read that stale actor.
        // Clear it; the next real enter sets it again.
        this.bg.hover = false;
        this.content.hover = false;
        this._setContent(this._restingContent(), false);
        this._layoutContent();
        this._collapsing = true;
        this._morph(this.currentShape(), 380);
        this._fadeContent();
    }

    // Soften the swap between compact and expanded content (the bg uncovers it).
    _fadeContent() {
        this.content.remove_transition('opacity');
        this.content.opacity = 0;
        this.content.ease({opacity: 255, duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
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
