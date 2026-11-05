import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {shapesFor, GAP, PILL_GAP} from './shapes.js';
import {Pill} from './pill.js';
import {Home} from './home.js';
import {showKeys} from './present.js';
import {planExpanded, planMissed} from './presentation.js';
import {ALERT_MS, pillWindow} from './stack.js';
import {planStrip, pressTarget} from './tabs.js';
import {actionForKey, step} from './keys.js';

const MAX_PILLS = 3;       // SPEC §2c
const CLUSTER_MARGIN = 12; // keep side pills this far from the system cluster
const ALERT_HOVER = 1000;  // an alert still hovered at its end stays open this much longer

/**
 * The island (SPEC §2): one to three pills side by side in the top bar centre. The
 * ActivityStack hands it render(list, {alert, expand}) — every visible activity,
 * highest priority first — and setLight(); the island shows the first `capacity`
 * (1–3, whatever fits before the system cluster) and puts +N on the last one.
 *
 *   centre pill   pill 1, highest priority, at the screen centre, content-fit and never
 *                 squeezed; carries the buoy light; idle when there is nothing to show
 *   side pills    to the right, a fixed 120 × 32 each (SPEC §2c); when one ends the others
 *                 slide to fill (pills follow their activity, so they slide, never jump)
 *   compact       a hovered pill grows in place into its compact (pill.js); the island
 *                 raises it and dims the others where they stand, one compact at a time
 *   open          a click grows that pill into the expanded panel at the centre; the
 *                 others slide in and fade (merge); closing splits them again. A click
 *                 opens Home's panel (kit/home.js: tab strip + tab) on the tab its context
 *                 picks (SPEC §2b: idle and +N → Home, a pill → its kind's tab). The stack
 *                 opens the centre pill's own expanded view without a strip (`expand`:
 *                 transient, ask; an alert for ALERT_MS). Only a click outside closes it,
 *                 or Esc after a click-open, which takes a modal grab like
 *                 ui/grabHelper.js; clicks inside do nothing and buttons keep working.
 *   keyboard      (SPEC §2c) `keybind-focus` (Super+B) takes the keyboard: a ring on the
 *                 centre pill, ←/→ move it, Enter opens that pill as a click would, Esc
 *                 or Super+B again lets go. Open: ←/→ walk the tabs, an ask's buttons
 *                 answer to their key (kit/keys.js, printed on them), Esc closes. On a
 *                 pill the stack opened (ask, alert) Super+B takes the keyboard for it.
 *
 * Structure: an invisible container as wide as the monitor (a compact may open on any
 * pill) and tall enough for the expanded pill, holding each pill's background and content
 * (see pill.js). It is not reactive at rest, so it takes no clicks.
 */
export class Island {
    constructor() {
        // Sizes are derived from the monitor in reposition(); start with a placeholder.
        this._s = shapesFor({width: 1920}, 40);
        this.actor = new St.Widget({width: this._s.container.w, height: this._s.container.h});

        this._pills = [];           // shown pills, centre first
        this._leaving = new Set();  // fading out after their activity left
        this._list = [];            // last list from the stack
        this._heldId = null;        // the hovered activity whose ttl waits (_holdHovered)
        this._heldPill = null;
        this._light = 'off';
        this._capacity = MAX_PILLS;
        this._compactPill = null;   // the pill whose compact is open (SPEC §2c)
        this._open = null;          // the expanded pill
        this._openedBy = null;      // 'user' | 'auto' | 'alert'
        this._home = null;          // Home's panel while a click has the island open
        this._alertId = 0;
        this._capturedId = 0;
        this._capturedOn = null;
        this._grab = null;
        this._focusId = undefined;  // keyboard on the closed island: the ringed pill's id
        this._focusIndex = 0;       //   (null = idle pill); undefined = no keyboard focus
        this._layoutLater = 0;
        this._destroyed = false;
        this.onCapacityChanged = null; // set by the extension → stack.refresh()
        // set by the extension: enabled modules (tab strip), `tabs-*` settings, ⋯ choice, ⚙
        this.tabs = {modules: [], settings: () => ({}), onSlot: null, onPrefs: null};
        // set by the extension: the stack's missed history, and telling it it was seen
        this.missed = {list: () => [], seen: null, open: null, clear: null};
        // the idle plan's presentation data (kit/idle.js), null = `none`; and told when
        // the idle pill starts or stops being on screen, so its clock runs only then
        this.idle = null;
        this.onIdleShown = null;
        this._idleShown = false;

        this._rightBoxId = Main.panel._rightBox.connect('notify::allocation',
            () => this._queueLayout());
        // Hidden by a fullscreen window (Shell's trackFullscreen): close, let go of the
        // keyboard. The stack re-opens a pending ask once it is seen again.
        this.actor.connect('notify::visible', () => {
            if (!this.actor.visible) {
                this._close();
                this._letGo();
            }
            this._syncIdleShown();
        });

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
                this._syncKeys();
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

    /**
     * The idle plan's presentation data (kit/idle.js); null = idle-content `none`. The
     * idle pill shows it at once, without a fade (one change, SPEC §2a).
     *
     * @param {?object} data
     */
    setIdle(data) {
        this.idle = data;
        const pill = this._pills[0];
        if (pill && pill.id === null && !this._open && !this._destroyed)
            pill.configure(null, this._roleOf(pill));
    }

    /** The idle pill is on screen: no activity, not expanded, the island not hidden. */
    get idleShown() {
        return this._idleShown;
    }

    _syncIdleShown() {
        const shown = !this._destroyed && this.actor.visible && !this._open &&
            this._pills[0]?.id === null;
        if (shown === this._idleShown)
            return;
        this._idleShown = shown;
        this.onIdleShown?.(shown);
    }

    setLight(light) {
        if (light === this._light)
            return;
        this._light = light;
        if (!this._open)          // expanded hides the light (INDICATORS.md)
            this._apply(false);
    }

    // --- pills ------------------------------------------------------------------------

    // The activity under the pointer keeps its ttl (stack.hold, SPEC §2e): one at a time;
    // a pill that changes activity or stops being hovered lets the old one go.
    _holdHovered(pill, hovered) {
        const id = hovered && this._pills.includes(pill) ? pill.id : null;
        if (!hovered && this._heldPill !== pill)
            return;
        if (id === this._heldId)
            return;
        if (this._heldId)
            this.onHold?.(this._heldId, false);
        this._heldId = id;
        this._heldPill = id ? pill : null;
        if (id)
            this.onHold?.(id, true);
    }


    _roleOf(pill) {
        const i = this._pills.indexOf(pill);
        const n = this._pills.length;
        const more = this._list.length ? pillWindow(this._list, this._capacity).more : 0;
        return {
            role: i === 0 ? 'centre' : 'side',
            light: this._light,
            more: i === n - 1 ? more : 0,
        };
    }

    // Bind the shown activities to pills. A pill follows its activity: one that moves
    // to another slot slides there; a new one fades in at its slot; a gone one fades out.
    _apply(animate) {
        if (this._destroyed)
            return;
        const shown = pillWindow(this._list, this._capacity).shown;   // feedback covers pill 1
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
            if (gone === this._heldPill)
                this._holdHovered(gone, false);
            this._leaving.add(gone);
            gone.leave(p => this._leaving.delete(p));
        }
        this._pills = next;
        next.forEach((pill, i) => pill.configure(wanted[i], this._roleOf(pill)));
        this._layout(animate);
        this._syncFocus();
        this._syncIdleShown();
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
                pill.setShown(true, animate, this._compactPill !== null && this._compactPill !== pill);
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

    // Side pills stop before the system cluster (SPEC §2c, 2026-11-05): as many 120 px side
    // pills as fit right of pill 1 at its widest (the `wide` cap, so pill 1's text never
    // changes how many show), at most two; else pill 1 alone.
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
        const widest = this._s.minimal(Infinity, 'wide').w;
        const avail = boxX - CLUSTER_MARGIN - (m.x + m.width / 2) - widest / 2;
        const sides = Math.max(0, Math.min(MAX_PILLS - 1, Math.floor(avail / (this._s.side.w + PILL_GAP))));
        const changed = sides + 1 !== this._capacity;
        this._capacity = sides + 1;
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

    // SPEC §2b, INDICATORS.md: tabs.js pressTarget decides
    _onPillPress(pill, ev) {
        if (this._fromButton(ev))
            return Clutter.EVENT_PROPAGATE;
        if (this._open)
            return Clutter.EVENT_STOP;         // inside an open pill: only buttons act
        this._activate(pill, this._onBadge(ev));
        return Clutter.EVENT_STOP;
    }

    // A click on the pill, or Enter on the ringed one.
    _activate(pill, badge = false) {
        const a = pill.activity;
        const {tab, press} = pressTarget(a, this._strip(), {badge, missed: pill.showingMissed});
        if (press) {
            a.onPress();
            pill.pulse();
        } else {
            this._openPill(pill, 'user', tab);
        }
    }

    /** The amber light's compact (pill.js, on the centre pill): rows with their tab's icon. */
    missedCompact() {
        const tabs = this._strip().tabs;
        return planMissed(this.missed.list(),
            kind => tabs.find(t => t.type === 'kind' && t.kinds.includes(kind))?.icon ?? null);
    }

    /** The pill whose compact is open (or in its grace), or null. */
    get compactPill() {
        return this._compactPill;
    }

    // pill.js: a compact opened or closed. One at a time; the open one is raised over its
    // neighbours, which fade where they stand (SPEC §2c, §5) and come back after.
    _compactShown(pill, on) {
        if (on) {
            if (this._compactPill && this._compactPill !== pill)
                this._compactPill._stopCompact();
            this._compactPill = pill;
            this.actor.set_child_above_sibling(pill.bg, null);
            this.actor.set_child_above_sibling(pill.content, null);
            for (const other of this._pills) {
                if (other !== pill)
                    other.dim(true);
            }
            return;
        }
        if (this._compactPill !== pill)
            return;
        this._compactPill = null;
        if (this._open)
            return;             // opening: _openPill hides the others itself
        for (const other of this._pills) {
            if (other !== pill)
                other.dim(false);
        }
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
        if (this._compactPill && this._compactPill !== pill)
            this._compactPill._stopCompact();   // an alert or ask opens elsewhere
        this._setFocus(undefined);  // the ring goes; a grab already held stays for the panel
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
                // close first: the prefs window must get the keyboard the grab holds
                onPrefs: () => {
                    this._close();
                    this.tabs.onPrefs?.();
                },
                missed: this.missed.list(),
                onMissedSeen: () => this.missed.seen?.(),
                onMissedOpen: m => this.missed.open?.(m.id, m.at),
                onMissedClear: () => this.missed.clear?.(),
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
        if (how === 'user')
            this._takeKeyboard(pill);
        this._listen();
        this._syncKeys();
        this._syncIdleShown();
        pill.activity?.onExpand?.(true);
    }

    // --- keyboard (SPEC §2c) ---------------------------------------------------------

    /** `keybind-focus` (Super+B): take the keyboard, or let it go. */
    toggleKeyboard() {
        if (this._destroyed || !this.actor.visible)
            return;                 // hidden by a fullscreen window
        if (Main.modalCount > (this._grab ? 1 : 0))
            return;                 // someone else's popup has the keyboard
        if (this._grab) {
            if (this._open)
                this._close();
            else
                this._letGo();
            return;
        }
        this._takeKeyboard(this._open ?? this._pills[0]);
        if (!this._grab)
            return;
        if (this._open) {
            // a pill the stack opened (ask, alert): now it is the user's, so it stays
            this._openedBy = 'user';
            this._disarmAlert();
            this._listen();
            this._syncKeys();
        } else {
            this._listen();
            this._setFocus(this._pills[0]?.id ?? null, 0);
        }
    }

    // A modal grab like ui/grabHelper.js: every click and key reaches this.actor, which
    // must be reactive for Clutter to emit them (at rest it must not eat clicks).
    _takeKeyboard(pill) {
        if (this._grab)
            return;
        this.actor.reactive = true;
        this._grab = Main.pushModal(this.actor, {actionMode: Shell.ActionMode.POPUP});
        pill?.bg.grab_key_focus();  // popModal restores the previous focus
    }

    _letGo() {
        this._setFocus(undefined);
        this._unlisten();
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
            this.actor.reactive = false;
        }
    }

    // Watch clicks and keys: on the grab actor with the keyboard, else on the stage
    // (automatic opens leave the keyboard alone).
    _listen() {
        this._unlisten();
        this._capturedOn = this._grab ? this.actor : global.stage;
        this._capturedId = this._capturedOn.connect('captured-event', (_a, ev) => this._onCaptured(ev));
    }

    _unlisten() {
        if (this._capturedId) {
            this._capturedOn.disconnect(this._capturedId);
            this._capturedId = 0;
            this._capturedOn = null;
        }
    }

    // The ring on the closed island follows its activity when the pills re-order;
    // when that activity is gone it stays at the same place (clamped).
    _setFocus(id, index = this._focusIndex) {
        this._focusId = id;
        this._focusIndex = index;
        this._syncFocus();
    }

    _syncFocus() {
        const on = this._focusId !== undefined && !this._open;
        if (on) {
            const i = this._pills.findIndex(p => p.id === this._focusId);
            this._focusIndex = i >= 0 ? i : step(this._focusIndex, 0, this._pills.length);
            this._focusId = this._pills[this._focusIndex]?.id ?? null;
        }
        this._pills.forEach((p, i) => p.setFocused(on && i === this._focusIndex));
    }

    // An ask open with the keyboard held: its buttons show their keys.
    _syncKeys() {
        const pill = this._open;
        if (pill && !this._home && pill.activity?.kind === 'ask')
            showKeys(pill.content.child, this._grab !== null);
    }

    _onKey(ev) {
        const sym = ev.get_key_symbol();
        if (sym === Clutter.KEY_Escape) {
            if (this._open)
                this._close();
            else
                this._letGo();
            return Clutter.EVENT_STOP;
        }
        let delta = 0;
        if (sym === Clutter.KEY_Left || sym === Clutter.KEY_KP_Left)
            delta = -1;
        else if (sym === Clutter.KEY_Right || sym === Clutter.KEY_KP_Right)
            delta = 1;
        if (!this._open) {
            if (delta) {
                const i = step(this._focusIndex, delta, this._pills.length);
                this._setFocus(this._pills[i]?.id ?? null, i);
            } else if ([Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_ISO_Enter, Clutter.KEY_space].includes(sym)) {
                const pill = this._pills[this._focusIndex];
                if (pill)
                    this._activate(pill);
            }
            return Clutter.EVENT_STOP;
        }
        if (this._home && delta) {
            this._home.stepTab(delta);
            return Clutter.EVENT_STOP;
        }
        const a = this._open.activity;
        if (!this._home && a?.kind === 'ask') {
            const id = actionForKey(planExpanded(a)?.actions ?? [], ev.get_key_unicode());
            if (id) {
                a.onAction?.(id);
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;   // Tab/Space on a focused button: St handles it
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
        this._letGo();
        pill.collapse();
        this._apply(true);
        pill.activity?.onExpand?.(false); // last: a transient ends here and re-renders
    }

    _onCaptured(ev) {
        const t = ev.type();
        if (t === Clutter.EventType.KEY_PRESS && this._grab)
            return this._onKey(ev);
        if (t !== Clutter.EventType.BUTTON_PRESS && t !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = ev.get_coords();
        if (!this._open) {
            // the ring is up: a click on a pill acts as usual, a click elsewhere lets go
            if (this._pills.some(p => this._contains(p, x, y)))
                return Clutter.EVENT_PROPAGATE;
            this._letGo();
            return Clutter.EVENT_STOP;
        }
        if (this._contains(this._open, x, y))
            return Clutter.EVENT_PROPAGATE;   // inside: buttons act, nothing closes
        const modal = this._grab !== null;
        this._close();
        // with the grab the click was ours to swallow; without it, let it reach the window
        return modal ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }

    _contains(pill, x, y) {
        const bg = pill.bg;
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
        this._syncIdleShown();      // tells the idle plan to stop its clock
        this.onIdleShown = null;
        if (this._layoutLater) {
            global.compositor.get_laters().remove(this._layoutLater);
            this._layoutLater = 0;
        }
        Main.panel._rightBox.disconnect(this._rightBoxId);
        this._disarmAlert();
        for (const p of this._pills)
            p.activity = null; // no onExpand while tearing down
        this._close();
        this._letGo();
        for (const p of [...this._pills, ...this._leaving])
            p.destroy();
        this._pills = [];
        this._leaving.clear();
        this.actor.destroy();
    }
}
