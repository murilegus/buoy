import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {shapesFor, GAP, PILL_GAP} from './shapes.js';
import {Pill} from './pill.js';
import {Home} from './home.js';
import {ALERT_MS} from './stack.js';
import {planStrip, tabFor, HOME} from './tabs.js';

const MAX_PILLS = 3;       // SPEC §2c
const CLUSTER_MARGIN = 12; // keep side pills this far from the system cluster
const ALERT_HOVER = 1000;  // an alert still hovered at its end stays open this much longer

/**
 * The island (SPEC §2): one to three pills side by side in the top bar centre. The
 * ActivityStack hands it render(list, {alert, expand}) — every visible activity,
 * highest priority first — and setLight(); the island shows the first `capacity`
 * (2 or 3, whatever fits before the system cluster) and puts +N on the last one.
 *
 *   centre pill   highest priority, at the screen centre; carries the buoy light; idle
 *                 `none` when there is nothing to show
 *   side pills    to the right, each ≤ expanded/3, content-fit; when one ends the others
 *                 slide to fill (pills follow their activity, so they slide, never jump)
 *   open          a click grows that pill into the expanded panel at the centre; the
 *                 others slide in and fade (merge); closing splits them again. A click
 *                 opens Home's panel (kit/home.js: tab strip + tab) on the tab its context
 *                 picks (SPEC §2b: idle and +N → Home, a pill → its kind's tab). The stack
 *                 opens the centre pill's own expanded view without a strip (`expand`:
 *                 transient, ask; an alert for ALERT_MS). Only a click outside closes it,
 *                 or Esc after a click-open, which takes a modal grab like
 *                 ui/grabHelper.js; clicks inside do nothing and buttons keep working.
 *
 * Structure: a fixed-size invisible container (wide enough for three pills, tall enough
 * for the expanded one) holding each pill's background and content (see pill.js).
 */
export class Island {
    constructor() {
        // Sizes are derived from the monitor in reposition(); start with a placeholder.
        this._s = shapesFor({width: 1920}, 40);
        this.actor = new St.Widget({width: this._s.container.w, height: this._s.container.h});

        this._pills = [];           // shown pills, centre first
        this._leaving = new Set();  // fading out after their activity left
        this._list = [];            // last list from the stack
        this._light = 'off';
        this._capacity = MAX_PILLS;
        this._sideMax = this._s.minimalMax;
        this._open = null;          // the expanded pill
        this._openedBy = null;      // 'user' | 'auto' | 'alert'
        this._home = null;          // Home's panel while a click has the island open
        this._alertId = 0;
        this._capturedId = 0;
        this._capturedOn = null;
        this._grab = null;
        this._layoutLater = 0;
        this._destroyed = false;
        this.onCapacityChanged = null; // set by the extension → stack.refresh()
        // set by the extension: enabled modules (tab strip), `tabs-*` settings, ⋯ choice
        this.tabs = {modules: [], settings: () => ({}), onSlot: null};

        this._rightBoxId = Main.panel._rightBox.connect('notify::allocation',
            () => this._queueLayout());

        this._apply(false);
    }

    get shapes() {
        return this._s;
    }

    /** How many pills fit (stack: activities beyond it are +N, SPEC §2c). */
    get capacity() {
        return this._capacity;
    }

    get expanded() {
        return this._open !== null;
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
        this._updateCapacity();
        this._apply(false);
    }

    // --- API used by ActivityStack --------------------------------------

    render(list, {alert = null, expand = null} = {}) {
        this._list = list;
        if (this._home) {
            // the panel stays while a click has it open: it lists whatever is running,
            // even after the pill it grew from ended; alerts wait until it closes
            const a = list.find(x => x.id === this._open.id);
            if (a)
                this._open.configure(a, {...this._roleOf(this._open)});
            this._home.update(list);
            return;
        }
        if (this._open) {
            const a = list.find(x => x.id === this._open.id);
            if (a) {
                // an update while open: stay open, replace the content in place
                this._open.configure(a, {...this._roleOf(this._open)});
                this._open.morph();
                if (alert === a.id)
                    this._armAlert();
                return;
            }
            this._close();
        }
        this._apply(true);

        const centre = this._pills[0];
        const alerted = this._pills.find(p => p.id === alert && p.id !== null);
        if (expand && centre.id === expand && centre.expandable)
            this._openPill(centre, 'auto');
        else if (alerted?.expandable)
            this._openPill(alerted, 'alert');
        else
            alerted?.pulse();
    }

    setLight(light) {
        if (light === this._light)
            return;
        this._light = light;
        if (!this._open)          // expanded hides the light (INDICATORS.md)
            this._apply(false);
    }

    // --- pills ------------------------------------------------------------------------

    _roleOf(pill) {
        const i = this._pills.indexOf(pill);
        const n = this._pills.length;
        const shownCount = this._list.length ? n : 0;
        const more = Math.max(0, this._list.length - shownCount);
        return {
            role: i === 0 ? 'centre' : 'side',
            light: this._light,
            more: i === n - 1 ? more : 0,
            minimal: n > 1,
            maxW: n > 1 ? this._sideMax : 0,
        };
    }

    // Bind the shown activities to pills. A pill follows its activity: one that moves
    // to another slot slides there; a new one fades in at its slot; a gone one fades out.
    _apply(animate) {
        if (this._destroyed)
            return;
        const shown = this._list.slice(0, this._capacity);
        const wanted = shown.length ? shown : [null];
        const byId = new Map(this._pills.map(p => [p.id, p]));
        const next = [];
        for (const [i, a] of wanted.entries()) {
            const id = a?.id ?? null;
            let pill = byId.get(id);
            if (pill) {
                byId.delete(id);
            } else if (i === 0 && this._pills[0] && byId.has(this._pills[0].id)) {
                pill = this._pills[0];  // the centre pill changes activity in place (cross-fade)
                byId.delete(pill.id);
            } else {
                pill = new Pill(this, this.actor);
                pill.setShown(false, false);
            }
            next.push(pill);
        }
        for (const gone of byId.values()) {
            this._leaving.add(gone);
            gone.leave(p => this._leaving.delete(p));
        }
        this._pills = next;
        next.forEach((pill, i) => pill.configure(wanted[i], this._roleOf(pill)));
        this._layout(animate);
    }

    // Centre pill at the container centre; side pills to its right from their resting
    // widths (hover growth spills into the gap, so neighbours never move on hover).
    _layout(animate) {
        const cw = this._s.container.w;
        let edge = cw / 2;
        this._pills.forEach((pill, i) => {
            const w = pill.restShape().w;
            const cx = i === 0 ? cw / 2 : edge + PILL_GAP + w / 2;
            edge = i === 0 ? cw / 2 + w / 2 : cx + w / 2;
            pill.setCx(cx, animate && !pill.fresh); // a new pill appears at its slot
            pill.fresh = false;
            if (!this._open)
                pill.setShown(true, animate);
        });
    }

    _pillResized(_pill) {
        if (!this._open)
            this._layout(true);
    }

    // notify::allocation of the panel's right box fires inside Clutter's allocation;
    // measure it just before the next redraw instead.
    _queueLayout() {
        if (this._layoutLater || this._destroyed)
            return;
        this._layoutLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._layoutLater = 0;
            if (this._updateCapacity() && !this._open)
                this._apply(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    // Side pills stop before the system cluster (SPEC §2c + 1366 px screens): 3 pills
    // when two side pills of at least the idle width fit, else 2, else 1.
    _updateCapacity() {
        const m = Main.layoutManager.primaryMonitor;
        const box = Main.panel._rightBox;
        // No has_allocation() guard: at startup the cluster is re-laid out many times and
        // a skipped last measurement would stick; a not-yet-final one is corrected by the
        // next notify::allocation.
        if (!m)
            return false;
        // Last allocations, untransformed: during the startup animation an ancestor is
        // transformed (get_transformed_position() catches it mid-way), and while a
        // relayout is queued `x` falls back to the fixed position 0; allocation boxes
        // keep the last real layout.
        const x1 = a => a.get_allocation_box().x1;
        const boxX = x1(Main.layoutManager.panelBox) + x1(Main.panel) + x1(box);
        const avail = boxX - CLUSTER_MARGIN - (m.x + m.width / 2) - this._s.minimalMax / 2;
        const min = this._s.idle.w + PILL_GAP;
        const sides = Math.max(0, Math.min(MAX_PILLS - 1, Math.floor(avail / min)));
        const sideMax = sides
            ? Math.min(this._s.minimalMax, 2 * Math.floor((avail / sides - PILL_GAP) / 2))
            : this._s.minimalMax;
        const changed = sides + 1 !== this._capacity || sideMax !== this._sideMax;
        this._capacity = sides + 1;
        this._sideMax = Math.max(this._s.idle.w, sideMax);
        if (changed)
            this.onCapacityChanged?.();
        return changed;
    }

    // --- press, open, close --------------------------------------------------------------

    // A press on an action button bubbles up to the content: leave it to the button.
    _fromButton(ev) {
        for (let a = global.stage.get_event_actor(ev); a && a !== this.actor; a = a.get_parent()) {
            if (a instanceof St.Button)
                return true;
        }
        return false;
    }

    _onBadge(ev) {
        return global.stage.get_event_actor(ev)?.has_style_class_name?.('buoy-badge') ?? false;
    }

    // SPEC §2b: idle and the +N badge open Home; a pill opens its kind's tab; a pill
    // whose kind has no tab runs its own onPress if it has one, else opens Home.
    _onPillPress(pill, ev) {
        if (this._fromButton(ev))
            return Clutter.EVENT_PROPAGATE;
        if (this._open)
            return Clutter.EVENT_STOP;         // inside an open pill: only buttons act
        const a = pill.activity;
        const tab = a && !this._onBadge(ev) ? tabFor(a, this._strip()) : HOME;
        if (tab === HOME && a?.onPress && !this._onBadge(ev)) {
            a.onPress();
            pill.pulse();
        } else {
            this._openPill(pill, 'user', tab);
        }
        return Clutter.EVENT_STOP;
    }

    _strip() {
        return planStrip(this.tabs.modules, this._list, this.tabs.settings());
    }

    _onPillRelease(_pill, ev) {
        return this._fromButton(ev) ? Clutter.EVENT_PROPAGATE : Clutter.EVENT_STOP;
    }

    // Merge (SPEC §2c): the opened pill grows into the expanded panel at the centre, the
    // others slide in and fade.
    // tab: a click-open, into Home's panel on that tab; without it the activity's own
    // expanded view
    _openPill(pill, how, tab = null) {
        if (this._open || (!tab && !pill.expandable))
            return;
        this._open = pill;
        this._openedBy = how;
        const cw = this._s.container.w;
        for (const other of this._pills) {
            if (other !== pill) {
                other.setShown(false, true);
                other.setCx(cw / 2, true);
            }
        }
        pill.setCx(cw / 2, true);
        if (tab) {
            this._home = new Home({
                modules: this.tabs.modules, list: this._list, tab,
                maxHeight: this._s.expanded.h, settings: this.tabs.settings(),
                onSlot: id => this.tabs.onSlot?.(id),
            });
        }
        pill.expand(this._home?.actor ?? null);
        this.actor.set_child_above_sibling(pill.bg, null);
        this.actor.set_child_above_sibling(pill.content, null);

        if (how === 'alert')
            this._armAlert();
        // A click-open takes the keyboard (Esc); then every click reaches the grab actor,
        // as in ui/grabHelper.js. Clutter skips non-reactive actors when it emits events,
        // so the container is reactive while modal (at rest it must not eat clicks).
        // Automatic opens leave the keyboard alone and watch clicks on the stage.
        if (how === 'user') {
            this.actor.reactive = true;
            this._grab = Main.pushModal(this.actor, {actionMode: Shell.ActionMode.POPUP});
            pill.bg.grab_key_focus(); // popModal restores the previous focus
        }
        this._capturedOn = this._grab ? this.actor : global.stage;
        this._capturedId = this._capturedOn.connect('captured-event', (_a, ev) => this._onCaptured(ev));
        pill.activity?.onExpand?.(true);
    }

    // Split again: the open pill shrinks back, the others fade in and slide to their slots.
    _close() {
        const pill = this._open;
        if (!pill)
            return;
        this._open = null;
        this._openedBy = null;
        this._home = null;          // its actor is the pill's content: collapse destroys it
        this._disarmAlert();
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
        pill.collapse();
        this._apply(true);
        pill.activity?.onExpand?.(false); // last: a transient ends here and re-renders
    }

    _onCaptured(ev) {
        const t = ev.type();
        if (t === Clutter.EventType.KEY_PRESS && ev.get_key_symbol() === Clutter.KEY_Escape && this._grab) {
            this._close();
            return Clutter.EVENT_STOP;
        }
        if (t !== Clutter.EventType.BUTTON_PRESS && t !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;
        if (this._contains(...ev.get_coords()))
            return Clutter.EVENT_PROPAGATE;   // inside: buttons act, nothing closes
        const modal = this._grab !== null;
        this._close();
        // with the grab the click was ours to swallow; without it, let it reach the window
        return modal ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }

    _contains(x, y) {
        const bg = this._open.bg;
        const [ax, ay] = bg.get_transformed_position();
        return x >= ax && x <= ax + bg.width && y >= ay && y <= ay + bg.height;
    }

    _armAlert() {
        this._disarmAlert();
        this._alertId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALERT_MS, () => this._alertDone());
    }

    _alertDone() {
        if (this._open?.hovered) {             // being read: give it a little longer
            this._alertId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALERT_HOVER, () => this._alertDone());
            return GLib.SOURCE_REMOVE;
        }
        this._alertId = 0;
        if (this._openedBy === 'alert')
            this._close();
        return GLib.SOURCE_REMOVE;
    }

    _disarmAlert() {
        if (this._alertId) {
            GLib.source_remove(this._alertId);
            this._alertId = 0;
        }
    }

    destroy() {
        this._destroyed = true;
        if (this._layoutLater) {
            global.compositor.get_laters().remove(this._layoutLater);
            this._layoutLater = 0;
        }
        Main.panel._rightBox.disconnect(this._rightBoxId);
        this._disarmAlert();
        for (const p of this._pills)
            p.activity = null; // no onExpand while tearing down
        this._close();
        for (const p of [...this._pills, ...this._leaving])
            p.destroy();
        this._pills = [];
        this._leaving.clear();
        this.actor.destroy();
    }
}
