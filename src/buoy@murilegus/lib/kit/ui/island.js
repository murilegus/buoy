import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {shapesFor, idleSample, PILL_GAP} from '../model/shapes.js';
import {Pill} from './pill.js';
import {Home} from './home.js';
import {showKeys} from './present/elements.js';
import {TYPE_ENTRY} from './present/compact.js';
import {planCompact, planExpanded, planMissed} from '../model/presentation.js';
import {ALERT_MS, ALERT_TURN_MS, pillWindow} from '../model/stack.js';
import {planStrip, pressTarget} from '../model/tabs.js';
import {Presence} from '../services/presence.js';
import {actionForKey, step} from '../model/keys.js';

const MAX_PILLS = 3;       // SPEC §2c
const CLUSTER_MARGIN = 12; // keep side pills this far from the system cluster
const ALERT_HOVER = 1000;  // an alert still hovered at its end stays open this much longer
const TURN_GRACE = 200;    // the pointer off a held card: Shell's banner HIDE_TIMEOUT (ui/messageTray.js)
const SCROLL_GAP_MS = 400; // one plan per scroll gesture on the idle pill (auto)

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
 *                 opens Home's panel (kit/ui/home.js: tab strip + tab) on the tab its context
 *                 picks (SPEC §2b: idle and +N → Home, a pill → its kind's tab). The stack
 *                 opens the centre pill's own expanded view without a strip (`expand`:
 *                 transient, ask; an alert for ALERT_MS). Only a click outside closes it,
 *                 or Esc after a click-open, which takes a modal grab like
 *                 ui/grabHelper.js; clicks inside do nothing and buttons keep working.
 *   keyboard      (SPEC §2c) `keybind-focus` (Super+B) takes the keyboard: a ring on the
 *                 centre pill, ←/→ move it, Enter opens that pill as a click would, Esc
 *                 or Super+B again lets go. Open: ←/→ walk the tabs, an ask's buttons
 *                 answer to their key (kit/model/keys.js, printed on them), Esc closes. On a
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
        // a compact the stack opened, held open on its pill (design/alerts-and-asks): an
        // alert for ALERT_MS of your presence, an ask until it is answered, an alert that
        // stays (`alertStays`: a critical notification) until its activity no longer asks it
        // — {pill, how: 'alert' | 'ask' | 'stay', id, key, activity, seen, turned, done, told}
        // (_hold). While an alert's card is up the pills behind it keep their places
        // (`_later`): they settle when it closes.
        this._held = null;
        this._later = false;
        this._activeWatch = 0;      // an alert waiting for you to be back (Presence.whenActive)
        this._turnId = 0;           // the alert's ALERT_TURN_MS
        this._graceId = 0;          // TURN_GRACE after the pointer left a held card
        this._presence = new Presence({onAway: away => this._awayChanged(away)});
        this._open = null;          // the expanded pill
        this._openedBy = null;      // 'user' | 'auto' | 'alert'
        this._home = null;          // Home's panel while a click has the island open
        this._alertId = 0;
        this._capturedId = 0;
        this._capturedOn = null;
        this._grab = null;
        this._typing = null;        // the pill whose card's Other is typed in (_typeIn)
        this._typingSoon = false;
        this._lettingGo = false;
        this._focusId = undefined;  // keyboard on the closed island: the ringed pill's id
        this._focusIndex = 0;       //   (null = idle pill); undefined = no keyboard focus
        this._layoutLater = 0;
        this._destroyed = false;
        this.onCapacityChanged = null; // set by the extension → stack.refresh()
        this.onHold = null;            // set by the extension → stack.hold(id, held)
        // set by the extension: enabled modules (tab strip), `tabs-*` settings, ⋯ choice, ⚙
        this.tabs = {modules: [], settings: () => ({}), onSlot: null, onPrefs: null};
        // set by the extension: the stack's missed history, and telling it it was seen
        this.missed = {list: () => [], flags: () => [], seen: null, open: null, clear: null};
        // the idle plan's presentation data (kit/services/idle.js), null = `none`; and told when
        // the idle pill starts or stops being on screen, so its clock runs only then
        this.idle = null;
        this.onIdleShown = null;
        this.onIdleScroll = null;   // (step) → handled: kit/services/idle.js in `auto`
        this._idleShown = false;

        this._rightBoxId = Main.panel._rightBox.connect('notify::allocation',
            () => this._queueLayout());
        // GNOME's high contrast (St.Settings, the a11y key Shell reloads its own theme on,
        // ui/main.js _loadDefaultStylesheet): the stylesheets raise four roles under buoy-hc
        // (design/colours "Tương phản cao").
        // a text's width is laid out at the device scale (design/pill "Idle": the clock is
        // 85 px at 1×, 90 at 1.25–2×), so a new scale measures it again, after the layout
        // that found it (clutter-actor.c resource-scale-changed)
        this._opts = {};
        this._scaleLater = 0;
        this.actor.connect('resource-scale-changed', () => {
            if (this._scaleLater)
                return;
            this._scaleLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._scaleLater = 0;
                this.reposition(this._opts);
                return GLib.SOURCE_REMOVE;
            });
        });
        this._a11y = St.Settings.get();
        this._hcId = this._a11y.connect('notify::high-contrast', () => this._syncContrast());
        this._syncContrast();
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
    // monitors-changed, a theme change (font, Large Text: St.ThemeContext `changed`), the
    // bar's height and when `expanded-width` changes.
    reposition(opts = {}) {
        this._opts = opts;
        const m = Main.layoutManager.primaryMonitor;
        if (!m)
            return;
        this._s = shapesFor(m, Main.panel.height, {...opts, ...this._measure()});
        this.actor.set_size(this._s.container.w, this._s.container.h);
        this.actor.set_position(
            Math.round(m.x + (m.width - this._s.container.w) / 2),
            m.y + this._s.inset);
        this._updateCapacity();
        this._apply(false, {force: true});
    }

    // The em and the idle clock's widest text, read from a hidden idle pill's label: the
    // font is the pill's own (`.buoy-content` inherits the stage's, as the bar's text), and
    // a width is the font's, not a number (design/pill "Idle", "Font và tỷ lệ màn hình").
    // The em is St's: the font's size × resolution / 72 (st-theme-node.c
    // get_length_from_term), Large Text being in the resolution.
    _measure() {
        if (!this.actor.get_stage())
            return {};
        const content = new St.Bin({style_class: 'buoy-content', opacity: 0});
        const box = new St.BoxLayout({style_class: 'buoy-idle'});
        content.set_child(box);
        this.actor.add_child(content);
        const width = text => {
            const l = new St.Label({style_class: 'buoy-text buoy-idle-text', text});
            box.add_child(l);
            const [, w] = l.get_preferred_width(-1);
            l.destroy();
            return w;
        };
        const font = box.get_theme_node().get_font();
        const size = font.get_size() / Pango.SCALE;
        const em = font.get_size_is_absolute() ? size
            : size * St.ThemeContext.get_for_stage(global.stage).get_resolution() / 72;
        // the widest digit (not every font's figures are even), and the wider of AM/PM
        let digit = '8', most = -1;
        for (const d of '0123456789') {
            const w = width(d.repeat(6));
            if (w > most)
                [digit, most] = [d, w];
        }
        const [am, pm] = [0, 12].map(hour => GLib.DateTime.new_local(2000, 1, 1, hour, 0, 0).format('%p') ?? '');
        const meridiem = width(am) >= width(pm) ? am : pm;
        const idleTextW = width(idleSample(digit, meridiem.trim()));
        content.destroy();
        return {em, idleTextW};
    }

    // --- API used by ActivityStack --------------------------------------

    render(list, {alert = null, expand = null} = {}) {
        this._list = list;
        if (this._home) {
            // the panel stays while a click has it open: it lists whatever is running,
            // even after the pill it grew from ended; an alert shows in it (design/alerts-
            // and-asks: Home open, the notification is in its tab, seen)
            const a = list.find(x => x.id === this._open.id);
            if (a)
                this._open.configure(a, {...this._roleOf(this._open)});
            this._home.update(list);
            this._noCard(list, alert, true);
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
                else
                    this._noCard(list, alert, false);
                return;
            }
            this._close();
        }
        // an alert for another pill takes the held card's pill with it: the card stays open
        // and its content changes (a burst's next turn, design/alerts-and-asks)
        const held = this._held;
        const takes = held && held.how === 'alert' && alert !== null && alert !== held.id &&
            list.some(a => a.id === alert);
        this._apply(true, {heldTo: takes ? alert : null, force: expand !== null});

        // a held ask stays while its pill still shows that ask; an alert while its pill
        // shows that activity and the same card (`alertKey`); an alert that stays while it
        // still asks to
        const centre = this._pills[0];
        const alerted = this._pills.find(p => p.id === alert && p.id !== null);
        const h = this._held;
        if (h && h.pill !== alerted && (!this._pills.includes(h.pill) || h.pill.id !== h.id ||
            (h.how === 'ask' && h.pill.activity?.kind !== 'ask') ||
            (h.how === 'stay' && h.pill.activity?.alertStays !== true) ||
            (h.how !== 'ask' && h.pill.activity?.alertKey !== h.key)))
            this._release();
        else if (h && h.pill.id === h.id && (h.how === 'ask' || h.pill.activity?.alertKey === h.key))
            h.activity = h.pill.activity;   // the same card, updated: its newest callbacks
        const busy = this._held && this._held.how !== 'alert' && this._held.pill !== alerted;
        // an ask is a card at the compact's size, on its pill, until it is answered; an
        // alert opens its pill's compact in place for ALERT_MS (design/alerts-and-asks);
        // a transient still opens expanded
        if (expand && centre.id === expand && centre.activity?.kind === 'ask' && centre.hasCompact) {
            this._hold(centre, 'ask');
        } else if (expand && centre.id === expand && centre.expandable) {
            this._openPill(centre, 'auto');
        } else if (alerted?.hasCompact) {
            const how = alerted.activity?.alertStays === true ? 'stay' : 'alert';
            // away (the screen off, locked): no card, missed; an ask or a critical card up
            // keeps its place: the alert gets none
            if (busy || (how === 'alert' && this._presence.away))
                this._noCard(list, alert, false);
            else
                this._hold(alerted, how);
        } else {
            alerted?.pulse();
            this._noCard(list, alert, false);
        }
        this._syncKeys();           // the held ask's card was rebuilt by an update
    }

    // An alert that gets no card here: its activity is done with it, seen (in Home's tab) or
    // missed — a burst moves on (design/alerts-and-asks).
    _noCard(list, alert, seen) {
        if (alert === null)
            return;
        const a = list.find(x => x.id === alert);
        if (seen)
            a?.onSeen?.();
        a?.onAlertDone?.(seen);
    }

    _hold(pill, how) {
        const h = this._held;
        if (h?.pill === pill && h.how === 'ask' && how === 'alert')
            return;                             // an ask outlasts an alert on it
        if (h && h.pill !== pill)
            this._release();
        else if (h && (h.id !== pill.id || h.key !== pill.activity?.alertKey))
            h.activity?.onAlertDone?.(h.seen);  // another card on it (a burst's next turn)
        const again = this._held?.pill === pill;
        if (this._compactPill && this._compactPill !== pill)
            this._compactPill._stopCompact();
        // turned: its ALERT_TURN_MS are over; done: its ALERT_MS; told: what its activity
        // last heard (_syncTurn)
        this._held = {
            pill, how, id: pill.id, key: pill.activity?.alertKey, activity: pill.activity,
            seen: false, turned: false, done: false, told: null,
        };
        if (!again)                             // still held: a pointer on it still counts
            pill.holdCompact(true);
        this._holdHovered(pill, pill.hoverCounts);
        if (how === 'alert' || how === 'stay')
            this._armAlert();
        else
            this._disarmAlert();
        this._syncTurn();
        this._syncKeys();
    }

    // Seen (design/alerts-and-asks): its card had its 5 s while you were there, or you
    // hovered it — once; the source decides what that means (a notification: acknowledged).
    _seen(pill) {
        if (this._held?.pill !== pill || this._held.seen)
            return;
        this._held.seen = true;
        this._held.activity?.onSeen?.();
    }

    // A held alert's turn (design/alerts-and-asks "Nhiều thông báo cùng lúc"): once it has
    // had ALERT_TURN_MS of you, while the pointer is off it — and TURN_GRACE after it left —
    // another alert may take its place. Its activity hears that, and whether it is hovered
    // (`onAlertState`), when either changes; a critical card never gives way.
    _syncTurn() {
        const h = this._held;
        if (!h || h.how === 'ask')
            return;
        const hovered = h.pill.hoverCounts;
        const mayYield = h.how === 'alert' && h.turned && !hovered && !this._graceId;
        if (h.told?.mayYield === mayYield && h.told?.hovered === hovered)
            return;
        h.told = {mayYield, hovered};
        h.activity?.onAlertState?.({mayYield, hovered});
    }

    // The pointer on a held card, or off it: off, TURN_GRACE in case it comes back (Shell's
    // HIDE_TIMEOUT), then the card goes on — gives way, or closes if its 5 s are over.
    _turnHover(hovered) {
        const h = this._held;
        if (hovered && this._graceId) {
            GLib.source_remove(this._graceId);
            this._graceId = 0;
        } else if (!hovered && h.told?.hovered && !this._graceId) {
            this._graceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TURN_GRACE, () => {
                this._graceId = 0;
                if (this._held?.done && this._held.how === 'alert' && !this._held.pill.hoverCounts)
                    this._release();
                else
                    this._syncTurn();
                return GLib.SOURCE_REMOVE;
            });
        }
        this._syncTurn();
    }

    // Away (the session idle, the screen locked): a card waiting for you closes, unseen —
    // missed (design/alerts-and-asks); an ask or a critical one stays for when you are back.
    _awayChanged(away) {
        if (away && this._held?.how === 'alert' && !this._held.seen)
            this._release();
    }

    _release() {
        const h = this._held;
        if (!h)
            return;
        this._held = null;
        this._disarmAlert();
        h.pill.holdCompact(false);
        h.activity?.onAlertDone?.(h.seen);          // closed: seen, or missed
        this._holdHovered(h.pill, h.pill.hoverCounts);
        // an answered ask lets the keyboard go, as closing its expanded did
        if (h.how === 'ask' && this._grab && !this._open)
            this._letGo();
        if (this._later)                            // the pills behind the card settle
            this._apply(true);
        this._syncKeys();
    }

    /**
     * The idle plan's presentation data (kit/services/idle.js); null = idle-content `none`. The
     * idle pill shows it at once, without a fade (one change, SPEC §2a).
     *
     * @param {?object} data
     * @param {object} [opts]
     * @param {boolean} [opts.fade]  cross-fade: `auto` switched plans (SPEC §2a-iii)
     */
    setIdle(data, {fade = false} = {}) {
        const pill = this._pills[0];
        const was = pill?.id === null ? pill.bg.width : null;
        this.idle = data;
        if (pill && pill.id === null && !this._open && !this._destroyed) {
            pill.configure(null, {...this._roleOf(pill), fade});
            // `none` ↔ a plan turns the grey light on or off: the pill's ends follow
            if (pill.restShape().w !== was)
                this._layout(true);
        }
    }

    // Scroll on the idle pill (SPEC §2a-iii): the next / previous plan in `auto`. A
    // touchpad's smooth scroll sends many events: one step per SCROLL_GAP_MS. Anything else
    // goes on to the panel (its workspace scroll).
    _onPillScroll(pill, ev) {
        if (pill.id !== null || this._open || !this.onIdleScroll)
            return Clutter.EVENT_PROPAGATE;
        let dirStep = 0;
        const dir = ev.get_scroll_direction();
        if (dir === Clutter.ScrollDirection.UP || dir === Clutter.ScrollDirection.LEFT) {
            dirStep = -1;
        } else if (dir === Clutter.ScrollDirection.DOWN || dir === Clutter.ScrollDirection.RIGHT) {
            dirStep = 1;
        } else if (dir === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = ev.get_scroll_delta();
            dirStep = Math.sign(Math.abs(dy) >= Math.abs(dx) ? dy : dx);
        }
        if (!dirStep)
            return Clutter.EVENT_STOP;
        const now = GLib.get_monotonic_time() / 1000;
        if (now - (this._scrollAt ?? 0) < SCROLL_GAP_MS)
            return Clutter.EVENT_STOP;
        if (!this.onIdleScroll(dirStep))
            return Clutter.EVENT_PROPAGATE;
        this._scrollAt = now;
        return Clutter.EVENT_STOP;
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
        // expanded hides the light (INDICATORS.md); pill 1's ends grow or shrink with it,
        // one small morph (SPEC §2)
        if (!this._open)
            this._apply(true);
    }

    // --- pills ------------------------------------------------------------------------

    // The activity under the pointer keeps its ttl (stack.hold, SPEC §2e): one at a time;
    // a pill that changes activity or stops being hovered lets the old one go.
    _holdHovered(pill, hovered) {
        if (hovered && pill.hoverCounts)
            this._seen(pill);       // a held card you point at is seen (design/alerts-and-asks)
        if (this._held?.pill === pill && this._held.how !== 'ask')
            this._turnHover(hovered && pill.hoverCounts);
        // its card held open holds its ttl too: a card waiting for you does not end under you
        const keep = hovered || this._held?.pill === pill;
        const id = keep && this._pills.includes(pill) ? pill.id : null;
        if (!keep && this._heldPill !== pill)
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
    /**
     * @param {boolean} animate
     * @param {object} [opts]
     * @param {?string} [opts.heldTo]  the held card's pill takes this activity (a burst's
     *   next turn): the card stays open where it is
     * @param {boolean} [opts.force]  even while an alert's card is up
     */
    _apply(animate, {heldTo = null, force = false} = {}) {
        if (this._destroyed)
            return;
        // an alert's card up: the pills behind it keep their places (a burst's quiet
        // notifications, a pill ending), only the card follows its activity
        const h = this._held;
        const card = h && h.how !== 'ask' && !heldTo && !force && h.pill.id === h.id &&
            this._pills.includes(h.pill) ? this._list.find(x => x.id === h.id) : null;
        if (card) {
            this._later = true;
            h.pill.configure(card, this._roleOf(h.pill));
            return;
        }
        this._later = false;
        const shown = pillWindow(this._list, this._capacity).shown;   // feedback covers pill 1
        const wanted = shown.length ? shown : [null];
        const byId = new Map(this._pills.map(p => [p.id, p]));
        if (heldTo && h && this._pills.includes(h.pill)) {
            const other = byId.get(heldTo);
            byId.set(heldTo, h.pill);
            if (other && other !== h.pill)
                byId.set(h.id, other);
            else
                byId.delete(h.id);
        }
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
        const actor = /** @type {?Partial<St.Widget>} not all are widgets */ (global.stage.get_event_actor(ev));
        return actor?.has_style_class_name?.('buoy-badge') ?? false;
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
        // onPress returning false did nothing (pressFirst: no window to bring up): the tab
        if (press && a.onPress() !== false)
            pill.pulse();
        else
            this._openPill(pill, 'user', tab);
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
            pill.raise();
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
                // the activity whose pill opened it: its tab shows that one first (the
                // Media tab's chip, 2026-11-07, Ethan)
                from: pill.activity?.id ?? null,
                maxHeight: this._s.expanded.h, settings: this.tabs.settings(),
                width: this._s.expanded.w, metrics: this._s.compactMetrics,
                onSlot: id => this.tabs.onSlot?.(id),
                // close first: the prefs window must get the keyboard the grab holds
                onPrefs: () => {
                    this._close();
                    this.tabs.onPrefs?.();
                },
                // a tab's action brought a window up (or a Home row ran its onPress)
                onClose: () => this._close(),
                missed: this.missed.list(),
                missedFlags: this.missed.flags?.() ?? [],
                onMissedSeen: () => this.missed.seen?.(),
                onMissedOpen: m => this.missed.open?.(m.id, m.at),
                onMissedClear: () => this.missed.clear?.(),
                gsettings: this.tabs.gsettings ?? null,   // Home's blocks (the weather's keys)
            });
        }
        pill.expand(this._home?.actor ?? null);
        pill.raise();

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
            this._syncKeys();       // a held ask prints its keys
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
        this._typing = null;
        this._setFocus(undefined);
        this._unlisten();
        if (this._grab) {
            // popModal gives the key focus back, maybe to a card's entry: that is no click
            this._lettingGo = true;
            Main.popModal(this._grab);
            this._lettingGo = false;
            this._grab = null;
            this.actor.reactive = false;
        }
        // nor may the entry keep it: any stage key focus takes the keys from the windows
        // (mutter src/core/events.c stage_has_key_focus)
        if (global.stage.key_focus?.get_parent?.()?.name === TYPE_ENTRY)
            global.stage.set_key_focus(null);
        this._syncKeys();
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
        const pill = this._open ?? (this._held?.how === 'ask' ? this._held.pill : null);
        if (pill && !this._home && pill.activity?.kind === 'ask')
            showKeys(pill.content.child, this._grab !== null && !this._typing);
        this._syncType();
    }

    /**
     * A card's Other is typed in (design/alerts-and-asks "Hỏi nhiều lựa chọn": a click in it
     * gives Buoy the keyboard, SPEC §2): the modal grab, as Super+B takes it, and the entry
     * gets the key focus — now, or once the card rebuilt with it (choosing Other).
     *
     * @param {object} pill  the pill whose card it is
     */
    _typeIn(pill) {
        if (this._destroyed || this._lettingGo || Main.modalCount > (this._grab ? 1 : 0))
            return;                 // someone else's popup has the keyboard, or ours goes
        this._typing = pill;
        this._typingSoon = true;    // Other just chosen: its entry comes with the rebuild
        this._syncType();
    }

    // The entry to type in, after every rebuild of its card: focused while typing; gone (Other
    // turned off, the ask answered), the keyboard goes back.
    _syncType() {
        const pill = this._typing;
        if (!pill)
            return;
        const entry = findNamed(pill.content?.child, TYPE_ENTRY);
        const soon = this._typingSoon;
        this._typingSoon = false;
        if (!entry) {
            if (soon)
                return;
            this._typing = null;
            if (this._grab && !this._open)
                this._letGo();
            return;
        }
        if (!this._grab) {
            this._takeKeyboard(pill);
            this._listen();
        }
        if (global.stage.key_focus !== entry.clutter_text) {
            entry.clutter_text.grab_key_focus();
            entry.clutter_text.set_cursor_position(-1);
            showKeys(pill.content.child, false);    // letters are the entry's now
        }
    }

    // The key focus is in the entry being typed in
    _inEntry() {
        const focus = global.stage.key_focus;
        return !!this._typing && focus instanceof Clutter.Text && focus.get_parent()?.name === TYPE_ENTRY;
    }

    _onKey(ev) {
        const sym = ev.get_key_symbol();
        // typing in a card's Other: every key is the entry's (Enter its own `activate`); Esc
        // lets the keyboard go, the text stays
        if (this._inEntry()) {
            if (sym !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this._letGo();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Escape) {
            if (this._home?.back())
                return Clutter.EVENT_STOP;   // Home's Missed or Ongoing list: back to Home
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
        // a held ask (a card at the compact's size) answers from its keys too
        const held = !this._open && this._held?.how === 'ask' ? this._held.pill.activity : null;
        if (held) {
            const id = actionForKey(planCompact(held)?.actions ?? [], ev.get_key_unicode());
            if (id) {
                held.onAction?.(id);
                return Clutter.EVENT_STOP;
            }
        }
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
        // while open, hover is not tracked (pill.js _applyHover): the held activity is let
        // go here unless the pointer is still on its pill, or its ttl never ran out again
        if (this._heldPill)
            this._holdHovered(this._heldPill, this._heldPill.hovered);
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

    // An alert's 5 s run while you are there; not there, the card waits and its 5 s start at
    // your next input (Shell's banner, ui/messageTray.js _showNotification).
    _armAlert() {
        this._disarmAlert();
        if ((this._held?.how === 'alert' || this._held?.how === 'stay') && !this._presence.present) {
            this._activeWatch = this._presence.whenActive(() => {
                this._activeWatch = 0;
                this._armAlert();
            });
            return;
        }
        this._alertId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALERT_MS, () => this._alertDone());
        const h = this._held;
        if (h?.how === 'alert') {
            this._turnId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALERT_TURN_MS, () => {
                this._turnId = 0;
                h.turned = true;
                if (this._held === h)
                    this._syncTurn();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _alertDone() {
        if (this._held?.how === 'stay') {      // a critical one: seen after its 5 s, it stays
            this._alertId = 0;
            this._seen(this._held.pill);
            return GLib.SOURCE_REMOVE;
        }
        if (this._held?.how === 'alert') {
            this._alertId = 0;
            this._seen(this._held.pill);       // its 5 s while you were there
            this._held.done = true;
            // being read: it stays while the pointer does, and TURN_GRACE after (_turnHover)
            if (!this._held.pill.hoverCounts && !this._graceId)
                this._release();
            return GLib.SOURCE_REMOVE;
        }
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
        if (this._turnId) {
            GLib.source_remove(this._turnId);
            this._turnId = 0;
        }
        if (this._graceId) {
            GLib.source_remove(this._graceId);
            this._graceId = 0;
        }
        this._presence?.cancel(this._activeWatch);
        this._activeWatch = 0;
    }

    _syncContrast() {
        if (this._a11y.high_contrast)
            this.actor.add_style_class_name('buoy-hc');
        else
            this.actor.remove_style_class_name('buoy-hc');
    }

    destroy() {
        this._destroyed = true;
        this._syncIdleShown();      // tells the idle plan to stop its clock
        this.onIdleShown = null;
        this.onIdleScroll = null;
        if (this._layoutLater) {
            global.compositor.get_laters().remove(this._layoutLater);
            this._layoutLater = 0;
        }
        if (this._scaleLater) {
            global.compositor.get_laters().remove(this._scaleLater);
            this._scaleLater = 0;
        }
        Main.panel._rightBox.disconnect(this._rightBoxId);
        this._a11y.disconnect(this._hcId);
        this._held = null;
        this._disarmAlert();
        this._presence.destroy();
        this._presence = null;
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

// The first actor of that name in a tree of St actors, or null
function findNamed(actor, name) {
    if (!actor)
        return null;
    if (actor.name === name)
        return actor;
    for (const c of actor.get_children()) {
        const f = findNamed(c, name);
        if (f)
            return f;
    }
    return null;
}
