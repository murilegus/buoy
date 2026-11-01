import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {shapesFor, GAP} from './shapes.js';

/**
 * The pill. Knows nothing about activities except the small contract
 * ActivityStack hands it through show()/clear():
 *   {content?, expanded?, sizeHint?, onPress?, onExpand?}  — sizes come from shapes.js
 *
 * Structure: a fixed-size invisible container (so the chrome input region
 * covers the expanded pill), a background actor that morphs, and a content
 * actor centred on top. Text never moves while the pill animates.
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
        this._content.connect('notify::width', () => this._centerContent());
        this.actor.add_child(this._content);

        this._activity = null;
        this._expanded = false;
        this._capturedId = 0;

        this._bg.connect('notify::hover', () => {
            if (this._expanded)
                return;
            this._morph(this._bg.hover ? this._hoverShape() : this._baseShape(), 200);
        });

        this._bg.connect('button-press-event', () => {
            if (!this._activity)
                this._morph(this._s.press(this._s.idle), 120);
            else if (this._activity.expanded)
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
        this._applyShape(this._currentShape());
    }

    _applyShape(shape) {
        this._bg.remove_all_transitions();
        this._bg.set_size(shape.w, shape.h);
        this._bg.set_position((this._s.container.w - shape.w) / 2, 0);
        this._bg.set_style(`border-radius: ${shape.r}px;`);
    }

    _currentShape() {
        if (this._expanded && this._activity?.expanded)
            return this._s.expanded;
        return this._baseShape();
    }

    // --- API used by ActivityStack --------------------------------------

    show(activity) {
        this._setExpanded(false);
        this._activity = activity;
        this._swapContent(activity.content ?? null);
        this._morph(this._bg.hover ? this._hoverShape() : this._baseShape());
    }

    clear() {
        this._setExpanded(false);
        this._activity = null;
        this._swapContent(null);
        this._morph(this._bg.hover ? this._s.hover(this._s.idle) : this._s.idle);
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
        return this._s.compact(this._content.width, this._activity.sizeHint);
    }

    _hoverShape() {
        return this._s.hover(this._baseShape());
    }

    _swapContent(actor) {
        const old = this._content.child;
        if (old === actor)
            return;
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
        actor.ease({opacity: 255, duration: 200, delay: 100});
    }

    _centerContent() {
        this._content.set_position(
            Math.round((this._s.container.w - this._content.width) / 2), 0);
    }

    _setExpanded(on) {
        if (on === this._expanded)
            return;
        if (on && !this._activity?.expanded)
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
            this._activity.onExpand?.(on);
            this._morph(on ? this._s.expanded : this._baseShape());
        }
    }

    _contains(x, y) {
        const [ax, ay] = this._bg.get_transformed_position();
        return x >= ax && x <= ax + this._bg.width &&
               y >= ay && y <= ay + this._bg.height;
    }

    _morph(shape, duration = 380) {
        this._bg.remove_all_transitions();
        this._bg.set_style(`border-radius: ${shape.r}px;`);
        this._bg.ease({
            x: (this._s.container.w - shape.w) / 2,
            width: shape.w,
            height: shape.h,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }

    destroy() {
        this._setExpanded(false);
        this._bg.remove_all_transitions();
        this.actor.destroy();
    }
}
