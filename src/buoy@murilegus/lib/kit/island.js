import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {shapesFor, GAP} from './shapes.js';
import {buildCompact, buildExpanded} from './present.js';
import {planExpanded, keyline} from './presentation.js';

const PAD = 14; // compact: content + 2·PAD = pill width (shapes.compact adds 28)

/**
 * The pill. Knows nothing about activities except the small contract
 * ActivityStack hands it through show(activity, {alert, expand}) / clear(): presentation
 * data plus {sizeHint?, onPress?, onExpand?, onAction?, isStale}. Content actors come from
 * present.js, sizes from shapes.js. The stack may also call alert(activity) and
 * setLight('off'|'missed'|'waiting'). `expand` opens expanded at once (transient, ask);
 * alert (brief expand) and the light are not rendered yet (M1 island item).
 *
 * Structure: a fixed-size invisible container (so the chrome input region
 * covers the expanded pill), a background actor that morphs, and a content
 * actor on top: compact content is centred in the resting pill, expanded content
 * spans the expanded width and sets its height (≤ width/2). Text never moves while
 * the pill animates.
 */
export class Island {
    constructor() {
        // Sizes are derived from the monitor in reposition(); start with a placeholder.
        this._s = shapesFor({width: 1920}, 40);
        this.actor = new St.Widget({width: this._s.container.w, height: this._s.container.h});

        this._bg = new St.Widget({
            style_class: 'buoy-island',
            reactive: true,
            track_hover: true,
        });
        this.actor.add_child(this._bg);

        this._content = new St.Bin({style_class: 'buoy-content'});
        this._content.connect('notify::width', () => this._contentResized());
        this._content.connect('notify::height', () => this._contentResized());
        this.actor.add_child(this._content);

        this._activity = null;
        this._expandable = false;
        this._expanded = false;
        this._contentW = 0; // compact content size, measured in _applyContentSize()
        this._contentH = 0;
        this._resizeLater = 0;
        this._capturedId = 0;

        this._bg.connect('notify::hover', () => {
            if (this._expanded)
                return;
            this._morph(this._bg.hover ? this._hoverShape() : this._baseShape(), 200);
        });

        this._bg.connect('button-press-event', () => {
            if (!this._activity)
                this._morph(this._s.press(this._s.idle), 120);
            else if (this._expandable)
                this._setExpanded(!this._expanded);
            this._activity?.onPress?.();
            return Clutter.EVENT_STOP;
        });

        this._bg.connect('button-release-event', () => {
            if (!this._activity)
                this._morph(this._bg.hover ? this._s.hover(this._s.idle) : this._s.idle, 250);
            return Clutter.EVENT_STOP;
        });

        this._applyShape(this._s.idle);
    }

    // Recompute derived sizes for the current monitor and re-centre. Called on enable,
    // monitors-changed and when `expanded-width` changes.
    reposition(opts = {}) {
        const m = Main.layoutManager.primaryMonitor;
        if (!m)
            return;
        this._s = shapesFor(m, Main.panel.height, opts);
        this.actor.set_size(this._s.container.w, this._s.container.h);
        this.actor.set_position(
            Math.round(m.x + (m.width - this._s.container.w) / 2),
            m.y + GAP);
        if (this._activity && !this._expanded)
            this._setContent(this._buildCompact(), false); // max width follows the monitor
        this._applyShape(this._currentShape());
        this._layoutContent();
    }

    _applyShape(shape) {
        this._bg.remove_all_transitions();
        this._bg.set_size(shape.w, shape.h);
        this._bg.set_position((this._s.container.w - shape.w) / 2, 0);
        this._bg.set_style(this._bgStyle(shape));
    }

    _bgStyle(shape) {
        const k = keyline(this._activity?.keyline);
        return `border-radius: ${shape.r}px;${k ? ` border-color: ${k};` : ''}`;
    }

    _currentShape() {
        if (this._expanded)
            return this._expandedShape();
        return this._bg.hover ? this._hoverShape() : this._baseShape();
    }

    // --- API used by ActivityStack --------------------------------------

    show(activity, {expand = false} = {}) {
        const same = this._activity?.id === activity.id;
        if (same && this._expanded && planExpanded(activity)) {
            // an update while open: stay open, replace the content in place
            this._activity = activity;
            this._setContent(buildExpanded(activity), false);
            this._morph(this._expandedShape());
            return;
        }
        this._setExpanded(false);
        this._activity = activity;
        this._expandable = planExpanded(activity) !== null;
        this._setContent(this._buildCompact(), !same);
        this._morph(this._currentShape());
        if (expand)
            this._setExpanded(true); // transient / ask: open straight away (no-op if not expandable)
    }

    clear() {
        this._setExpanded(false);
        this._activity = null;
        this._expandable = false;
        this._setContent(null, true);
        this._morph(this._currentShape());
    }

    get expanded() {
        return this._expanded;
    }

    // --- internals ------------------------------------------------------

    // Activities carry content, not sizes (ARCHITECTURE rule 11). Shapes come from
    // shapesFor(); `activity.sizeHint` ('normal' | 'wide') and the measured content
    // width decide the compact shape.
    _baseShape() {
        if (!this._activity)
            return this._s.idle;
        return this._s.compact(this._contentW, this._activity.sizeHint);
    }

    _expandedShape() {
        const cap = this._s.expanded;
        const child = this._content.child;
        const [, natural] = child ? child.get_preferred_height(cap.w) : [0, 0];
        const h = Math.min(cap.h, Math.max(Math.ceil(natural), 2 * this._s.idle.h));
        return {w: cap.w, h, r: Math.min(cap.r, Math.floor(h / 2))};
    }

    _buildCompact() {
        // the widest compact pill for this hint, minus the padding
        const maxWidth = this._s.compact(Infinity, this._activity.sizeHint).w - 2 * PAD;
        return buildCompact(this._activity, {maxWidth});
    }

    _hoverShape() {
        return this._s.hover(this._baseShape());
    }

    // fade: cross-fade between activities; without it the new content replaces the
    // old one at once (updates of the same activity, expand/collapse).
    _setContent(actor, fade) {
        const old = this._content.child;
        if (old === actor)
            return;
        if (!fade) {
            old?.remove_all_transitions();
            this._content.set_child(actor);
            old?.destroy();
            return;
        }
        if (old) {
            old.ease({
                opacity: 0, duration: 100,
                onComplete: () => {
                    if (this._content.child === old)
                        this._content.set_child(null);
                    old.destroy();
                    if (actor)
                        this._fadeIn(actor);
                },
            });
        } else if (actor) {
            this._fadeIn(actor);
        }
    }

    _fadeIn(actor) {
        actor.opacity = 0;
        this._content.set_child(actor);
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
        if (this._resizeLater)
            return;
        this._resizeLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._resizeLater = 0;
            this._applyContentSize();
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyContentSize() {
        if (!this._expanded) {
            // natural size, not the allocation: another relayout may already be queued
            // (an icon finished loading). The content has been allocated once by now,
            // so measuring it does not touch an unallocated label.
            const child = this._content.child;
            const [, w] = child ? this._content.get_preferred_width(-1) : [0, 0];
            const [, h] = child ? this._content.get_preferred_height(w) : [0, 0];
            this._contentW = Math.ceil(w);
            this._contentH = Math.ceil(h);
        }
        this._layoutContent();
        // compact follows its content; expanded follows its content's height
        if (this._activity)
            this._morph(this._currentShape(), 200);
    }

    _layoutContent() {
        const cw = this._s.container.w;
        if (this._expanded) {
            this._content.set_width(this._s.expanded.w);
            this._content.set_position(Math.round((cw - this._s.expanded.w) / 2), 0);
            return;
        }
        if (this._content.natural_width_set)
            this._content.set_width(-1); // back to natural width after expanded
        // stored sizes only: this also runs right after a new child was set
        this._content.set_position(
            Math.round((cw - this._contentW) / 2),
            Math.max(0, Math.round((this._s.idle.h - this._contentH) / 2)));
    }

    _setExpanded(on) {
        if (on === this._expanded)
            return;
        if (on && !this._expandable)
            return;
        this._expanded = on;

        if (on) {
            this._capturedId = global.stage.connect('captured-event', (_s, ev) => {
                const t = ev.type();
                if (t !== Clutter.EventType.BUTTON_PRESS && t !== Clutter.EventType.TOUCH_BEGIN)
                    return Clutter.EVENT_PROPAGATE;
                if (!this._contains(...ev.get_coords()))
                    this._setExpanded(false);
                return Clutter.EVENT_PROPAGATE;
            });
        } else if (this._capturedId) {
            global.stage.disconnect(this._capturedId);
            this._capturedId = 0;
        }

        if (this._activity) {
            this._setContent(on ? buildExpanded(this._activity) : this._buildCompact(), false);
            this._layoutContent();
            this._morph(this._currentShape());
            this._activity.onExpand?.(on); // last: a transient ends here and re-renders
        }
    }

    _contains(x, y) {
        const [ax, ay] = this._bg.get_transformed_position();
        return x >= ax && x <= ax + this._bg.width &&
               y >= ay && y <= ay + this._bg.height;
    }

    _morph(shape, duration = 380) {
        const x = (this._s.container.w - shape.w) / 2;
        this._bg.set_style(this._bgStyle(shape));
        const t = this._bg.get_transition('width');
        if (!t && this._bg.x === x && this._bg.width === shape.w && this._bg.height === shape.h)
            return; // already there: start no transition (nothing animates at rest)
        this._bg.remove_all_transitions();
        this._bg.ease({
            x,
            width: shape.w,
            height: shape.h,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }

    destroy() {
        if (this._resizeLater) {
            global.compositor.get_laters().remove(this._resizeLater);
            this._resizeLater = 0;
        }
        this._activity = null; // no onExpand/content rebuild while tearing down
        this._setExpanded(false);
        this._bg.remove_all_transitions();
        this.actor.destroy();
    }
}
