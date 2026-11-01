import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {shapesFor, GAP} from './shapes.js';
import {buildCompact, buildExpanded, buildIdle, buildPeek} from './present.js';
import {planExpanded, keyline} from './presentation.js';
import {ALERT_MS} from './stack.js';

const PAD = 14;          // compact: content + 2·PAD = pill width (shapes.compact adds 28)
const PEEK_DELAY = 300;  // ms of hover before the peek replaces compact
const ALERT_HOVER = 1000; // an alert still hovered at its end stays open this much longer

/**
 * The pill (SPEC §2). Knows nothing about activities except the small contract
 * ActivityStack hands it through show(activity, {alert, expand}) / clear() / setLight():
 * presentation data plus {sizeHint?, onPress?, onExpand?, onAction?, isStale}. Content
 * actors come from present.js, sizes from shapes.js.
 *
 *   idle      idle-content `none`: black pill + the buoy light (grey off, amber, red)
 *   compact   content-fit; hover grows it, and after PEEK_DELAY shows the activity's
 *             `peek` if it has one; the light is the left edge slot
 *   expanded  click (when the activity has an expanded presentation), `expand` from the
 *             stack (transient, ask), or an alert (ALERT_MS, then it closes unless hovered).
 *             Only a click outside, or Esc after a click-open, closes it; clicks inside
 *             do nothing, buttons run their action. A click-open takes a modal grab
 *             (like GrabHelper) so Esc reaches us; automatic opens never take the keyboard.
 *   press     idle, or an activity without expanded: a short pulse (+ onPress)
 *
 * Structure: a fixed-size invisible container (so the chrome input region covers the
 * expanded pill), a background actor that morphs, and a content actor on top: compact
 * content is centred in the resting pill, expanded content spans the expanded width and
 * sets its height (≤ width/2). Text never moves while the pill animates.
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

        // Reactive so a click on text lands here (a sibling of _bg, not a child: the
        // content must not move with the morph); buttons inside are reactive themselves.
        this._content = new St.Bin({style_class: 'buoy-content', reactive: true, track_hover: true});
        this._content.connect('notify::width', () => this._contentResized());
        this._content.connect('notify::height', () => this._contentResized());
        this.actor.add_child(this._content);

        this._activity = null;
        this._expandable = false;
        this._expanded = false;
        this._openedBy = null;       // 'user' | 'auto' | 'alert'
        this._light = 'off';
        this._peeking = false;
        this._contentW = 0;          // resting content size, measured in _applyContentSize()
        this._contentH = 0;
        this._resizeLater = 0;
        this._hoverLater = 0;
        this._peekId = 0;
        this._alertId = 0;
        this._capturedId = 0;
        this._capturedOn = null;
        this._grab = null;
        this._destroyed = false;

        for (const a of [this._bg, this._content]) {
            a.connect('notify::hover', () => this._hoverChanged());
            a.connect('button-press-event', (_a, ev) => this._onPress(ev));
            a.connect('button-release-event', (_a, ev) => this._onRelease(ev));
        }

        this._setContent(this._restingContent(), false);
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
        if (!this._expanded)
            this._setContent(this._restingContent(), false); // widths follow the monitor
        this._applyShape(this._currentShape());
        this._layoutContent();
    }

    // --- API used by ActivityStack --------------------------------------

    show(activity, {alert = false, expand = false} = {}) {
        const same = this._activity?.id === activity.id;
        if (same && this._expanded && planExpanded(activity)) {
            // an update while open: stay open, replace the content in place
            this._activity = activity;
            this._setContent(buildExpanded(activity), false);
            this._morph(this._expandedShape());
            if (alert)
                this._armAlert();
            return;
        }
        this._setExpanded(false);
        if (!same)
            this._stopPeek();
        this._activity = activity;
        this._expandable = planExpanded(activity) !== null;
        this._setContent(this._restingContent(), !same);
        this._morph(this._currentShape());

        if (expand && this._expandable)
            this._setExpanded(true, 'auto'); // transient / ask: open straight away
        else if (alert && this._expandable)
            this._setExpanded(true, 'alert');
        else if (alert)
            this._pulse();
    }

    clear() {
        this._setExpanded(false);
        this._stopPeek();
        const had = this._activity !== null;
        this._activity = null;
        this._expandable = false;
        this._setContent(this._restingContent(), had);
        this._morph(this._currentShape());
    }

    setLight(light) {
        if (light === this._light)
            return;
        this._light = light;
        if (!this._expanded)                   // expanded hides the light (INDICATORS.md)
            this._setContent(this._restingContent(), false);
    }

    get expanded() {
        return this._expanded;
    }

    // --- shapes -----------------------------------------------------------

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

    get _hovered() {
        return this._bg.hover || this._content.hover;
    }

    _currentShape() {
        if (this._expanded)
            return this._expandedShape();
        return this._hovered ? this._s.hover(this._baseShape()) : this._baseShape();
    }

    // Activities carry content, not sizes (ARCHITECTURE rule 11). Shapes come from
    // shapesFor(); `activity.sizeHint` ('normal' | 'wide') and the measured content
    // width decide the compact shape. Idle `none` keeps the full idle pill.
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

    _morph(shape, duration = 380) {
        if (this._destroyed)
            return;
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

    // Press feedback for the idle pill and activities without an expanded presentation;
    // also how a non-expandable activity shows an alert.
    _pulse() {
        if (this._destroyed)
            return;
        const rest = this._currentShape();
        const press = this._s.press(this._baseShape());
        this._bg.remove_all_transitions();
        this._bg.set_style(this._bgStyle(press));
        this._bg.ease({
            x: (this._s.container.w - press.w) / 2,
            width: press.w,
            height: press.h,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: finished => {
                if (finished)
                    this._morph(rest, 250);
            },
        });
    }

    // --- content ------------------------------------------------------------

    _maxWidth() {
        // the widest compact pill for this hint, minus the padding
        return this._s.compact(Infinity, this._activity.sizeHint).w - 2 * PAD;
    }

    _restingContent() {
        if (!this._activity)
            return buildIdle({width: this._s.idle.w - 2 * PAD, light: this._light});
        const opts = {maxWidth: this._maxWidth(), light: this._light};
        return (this._peeking && buildPeek(this._activity, opts)) || buildCompact(this._activity, opts);
    }

    // fade: cross-fade between activities; without it the new content replaces the
    // old one at once (updates of the same activity, light, peek, expand/collapse).
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

    // --- hover and peek -------------------------------------------------------

    // bg and content are siblings: moving between them flips one hover off before the
    // other on. Settle the combined state once per frame so the peek does not flicker.
    _hoverChanged() {
        if (this._hoverLater)
            return;
        this._hoverLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._hoverLater = 0;
            this._applyHover();
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyHover() {
        if (this._expanded)
            return;
        if (this._hovered) {
            if (!this._peeking && !this._peekId && this._activity?.peek) {
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
        this._morph(this._currentShape(), 200);
    }

    _stopPeek() {
        if (this._peekId) {
            GLib.source_remove(this._peekId);
            this._peekId = 0;
        }
        if (this._peeking) {
            this._peeking = false;
            if (!this._expanded)
                this._setContent(this._restingContent(), false);
        }
    }

    // --- press, expand, collapse ------------------------------------------------

    // A press on an action button bubbles up to the content: leave it to the button.
    _fromButton(ev) {
        for (let a = global.stage.get_event_actor(ev); a && a !== this.actor; a = a.get_parent()) {
            if (a instanceof St.Button)
                return true;
        }
        return false;
    }

    _onPress(ev) {
        if (this._fromButton(ev))
            return Clutter.EVENT_PROPAGATE;
        if (this._expanded)
            return Clutter.EVENT_STOP;         // inside an open pill: only buttons act
        if (this._expandable) {
            this._setExpanded(true, 'user');
        } else {
            this._activity?.onPress?.();
            this._pulse();
        }
        return Clutter.EVENT_STOP;
    }

    _onRelease(ev) {
        return this._fromButton(ev) ? Clutter.EVENT_PROPAGATE : Clutter.EVENT_STOP;
    }

    _armAlert() {
        this._disarmAlert();
        this._alertId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALERT_MS, () => this._alertDone());
    }

    _alertDone() {
        if (this._hovered) {                   // being read: give it a little longer
            this._alertId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALERT_HOVER, () => this._alertDone());
            return GLib.SOURCE_REMOVE;
        }
        this._alertId = 0;
        if (this._openedBy === 'alert')
            this._setExpanded(false);
        return GLib.SOURCE_REMOVE;
    }

    _disarmAlert() {
        if (this._alertId) {
            GLib.source_remove(this._alertId);
            this._alertId = 0;
        }
    }

    _setExpanded(on, how = 'user') {
        if (on === this._expanded)
            return;
        if (on && !this._expandable)
            return;
        this._expanded = on;
        this._openedBy = on ? how : null;
        this._disarmAlert();

        if (on) {
            this._stopPeek();
            if (how === 'alert')
                this._armAlert();
            // A click-open takes the keyboard (Esc); then every click reaches the grab
            // actor, as in ui/grabHelper.js. Automatic opens leave the keyboard alone and
            // watch clicks on the stage.
            if (how === 'user') {
                // Clutter skips non-reactive actors when it emits events, so the grab
                // actor must be reactive or its captured-event never sees Esc. Only
                // while modal: at rest the transparent container must not eat clicks.
                this.actor.reactive = true;
                this._grab = Main.pushModal(this.actor, {actionMode: Shell.ActionMode.POPUP});
                this._bg.grab_key_focus(); // popModal restores the previous focus
            }
            this._capturedOn = this._grab ? this.actor : global.stage;
            this._capturedId = this._capturedOn.connect('captured-event',
                (_a, ev) => this._onCaptured(ev));
        } else {
            if (this._capturedId) {
                this._capturedOn.disconnect(this._capturedId);
                this._capturedId = 0;
                this._capturedOn = null;
            }
            if (this._grab) {
                Main.popModal(this._grab);
                this._grab = null;
                this.actor.reactive = false;
            }
        }

        if (this._activity) {
            this._setContent(on ? buildExpanded(this._activity) : this._restingContent(), false);
            this._layoutContent();
            this._morph(this._currentShape());
            this._activity.onExpand?.(on); // last: a transient ends here and re-renders
        }
    }

    _onCaptured(ev) {
        const t = ev.type();
        if (t === Clutter.EventType.KEY_PRESS && ev.get_key_symbol() === Clutter.KEY_Escape && this._grab) {
            this._setExpanded(false);
            return Clutter.EVENT_STOP;
        }
        if (t !== Clutter.EventType.BUTTON_PRESS && t !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;
        if (this._contains(...ev.get_coords()))
            return Clutter.EVENT_PROPAGATE;   // inside: buttons act, nothing closes
        const modal = this._grab !== null;
        this._setExpanded(false);
        // with the grab the click was ours to swallow; without it, let it reach the window
        return modal ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }

    _contains(x, y) {
        const [ax, ay] = this._bg.get_transformed_position();
        return x >= ax && x <= ax + this._bg.width &&
               y >= ay && y <= ay + this._bg.height;
    }

    destroy() {
        for (const id of [this._resizeLater, this._hoverLater]) {
            if (id)
                global.compositor.get_laters().remove(id);
        }
        this._resizeLater = this._hoverLater = 0;
        this._disarmAlert();
        this._activity = null; // no onExpand/content rebuild while tearing down
        this._setExpanded(false);
        this._stopPeek();
        this._destroyed = true;
        this._bg.remove_all_transitions();
        this.actor.destroy();
    }
}
