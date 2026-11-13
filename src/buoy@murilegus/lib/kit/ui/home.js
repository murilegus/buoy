import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {EmptyState, fallbackIcon, iconProps, makeElement} from './present/elements.js';
import {buildCompact} from './present/compact.js';
import {buildExpanded} from './present/expanded.js';
import {FILL, label as textLabel, tick} from './present/parts.js';
import {agoWords, clockTime, element, livePosition, mediaTimes, planMinimal} from '../model/presentation.js';
import {cornerIcons, cornerMax, planHome, tileOf, tileWidths, greetingLine, TILE_H, CARD_GAP, DETAIL_FROM} from '../model/home.js';
import {daypartAt} from '../model/daypart.js';
import {compactMetrics} from '../model/shapes.js';
import {planStrip, stripOrder, tabActivities, findTab, HOME} from '../model/tabs.js';
import {step} from '../model/keys.js';
import {FADES, LIST_SHIFT, TAB_SHIFT} from '../model/motion.js';
import {SpringRunner, slideIn} from './spring.js';
import {SlidingRow} from './strip.js';
import {Flights, markShared} from './present/flight.js';

// a body leaving on a tab switch: its spring, and whether a tab.js keeps it (_leave)
const leaving = new WeakMap();


const MENU_BOTTOM = 12; // space between the ⋯ menu and the panel's bottom edge
const STRIP_H = 68; // first guess for the head and the panel's padding; measured once laid out
const EDGE = 12;     // the panel's padding each side, and under Home's row (design/home)
const LIST_MAX = 5;  // the Ongoing list scrolls past this many rows (design/home)

// A tile's value as an actor: an element (presentation.js), or a player's live position as
// its elapsed time, ticking once a second only while it plays and shows (kit `tick`)
function valueActor(e, activity) {
    if (e?.type !== 'live')
        return makeElement(e, 'minimal', activity);
    const l = textLabel('', '');
    const update = () => {
        l.text = mediaTimes(livePosition(e.live, Date.now()), e.live.length)[0];
    };
    update();
    tick(l, update, () => e.live.playing === true);
    return l;
}

// A glance's or a row's icon: a theme name (or Buoy's own, iconProps), a Gio.Icon (the
// weather's colour SVG), at its size
function iconOf(icon, size) {
    if (!icon)
        return null;
    return new St.Icon({
        style_class: 'buoy-icon', icon_size: size,
        ...typeof icon === 'string' ? iconProps(icon) : {gicon: icon},
    });
}

// what the strip draws: its tabs, their icons and dots
const stripKey = strip => strip.tabs.map(t => `${t.id}${t.badge ? '•' : ''}:${t.icon}`).join();

// A tab's icon with a dot at its top right (the Notifications tab while GNOME's list has
// some, 2026-11-08), as GNOME's date menu shows its message indicator.
function badged(glyph) {
    const bin = new St.Widget({layout_manager: new Clutter.BinLayout(), y_align: Clutter.ActorAlign.CENTER});
    bin.add_child(glyph);
    bin.add_child(new St.Widget({
        style_class: 'buoy-tab-dot',
        // BinLayout places it by its align; nudged out by a translation, which leaves
        // the layout alone (a negative CSS margin overflows St's preferred width)
        x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.START,
        translation_x: 2, translation_y: -2,
    }));
    return bin;
}

// The body's scrolled box: at least as tall as the body allows (`[FILL]`), so every tab
// opens the panel at its full expanded height (2026-11-08, Ethan; was content-fit up to the
// cap). Its minimum stays its content's: a taller tab scrolls instead of growing the panel.
// Children with y_expand share the room left over (Home's blocks).
const BodyView = GObject.registerClass(
class BodyView extends St.BoxLayout {
    /**
     * @param {number} forWidth
     * @returns {[number, number]}
     */
    vfunc_get_preferred_height(forWidth) {
        const [min, nat] = super.vfunc_get_preferred_height(forWidth);
        return [min, Math.max(nat, this[FILL] ?? 0)];
    }
});

/**
 * The panel a click opens (SPEC §2b, §3): the tab strip and the selected tab's body.
 * Built per open and destroyed when expanded closes, so the next open follows context
 * again and a closed island holds none of it. Which tabs exist and where an open
 * starts come from tabs.js; this file only makes the actors.
 *
 *   Home        design/home (2026-11-11/12): a main card — the stack's first activity, its
 *               module's Card or its compact, or the greeting with none — and one row of
 *               tiles: Missed, the other activities (+K past the row), then the modules'
 *               glances (kit/model/home.js planHome). The Missed and +K tiles show their
 *               list in place of the card and the row (‹ or Esc goes back).
 *   kind tab    the module's tab.js, or the expanded views of its activities
 *   standalone  a module's tab.js, built on first selection (slot / ⋯ / pinned)
 *
 * A tab.js export is a class: `new Tab({close})` → {actor, destroy(), update?(activities)};
 * a kind tab's `update` gets its kind's visible activities, at once and on every change.
 * `close()` closes the island: a tab calls it after an action that brings a window up
 * (open a file, focus an app), as a notification goes once it is clicked (2026-11-06,
 * Ethan). A Home chip that runs its activity's onPress closes it the same way.
 *
 * A module's `home` (index.js): `{Card}` draws its kinds' activity on the main card (media:
 * the art, the transport and the bar); `{Glance, order, wide}` is a glance tile (the
 * weather, Up next, the battery). Both are made the first time Home shows and kept for the
 * rest of the open, destroyed when expanded closes. `new Card({open, close})` → {actor,
 * show(activity, {height, form, width}), destroy()}. `new Glance({open, close, changed,
 * settings})` → {ready, tile: {icon, iconSize?, value, caption, detail?}, wide?(width) →
 * actor, activate(), refresh?(), destroy()}; `changed()`: `ready` or `tile` changed, lay
 * Home out again; `wide`: it may take two units (design/home "Cách lấp hàng ô").
 */
export class Home {
    /**
     * @param {object} opts
     * @param {object[]} opts.modules  enabled modules, in order (index.js exports)
     * @param {object[]} opts.list  visible activities (stack order)
     * @param {string} opts.tab  the tab to start on (tabs.js tabFor)
     * @param {number} opts.maxHeight  the expanded height cap
     * @param {number} [opts.width]  the expanded width (Home's row is it less 2 × 12)
     * @param {object} [opts.metrics]  kit/model/shapes.js compactMetrics at the em
     * @param {object[]} [opts.missedFlags]  stack.missedFlags: a source's own unseen rows
     * @param {{slot?: string, pinned?: string[], daypart?: number[]}} [opts.settings]  `tabs-slot`, `tabs-pinned`, `daypart-starts`
     * @param {function(string):void} [opts.onSlot]  a standalone tab was chosen from ⋯
     * @param {function():void} [opts.onPrefs]  the ⚙ button was clicked
     * @param {function():void} [opts.onClose]  close the island (a tab's action is done)
     * @param {object[]} [opts.missed]  stack.missed, newest first: Home's Missed list
     * @param {function():void} [opts.onMissedSeen]  Home was shown with that section
     * @param {function(object):void} [opts.onMissedOpen]  one of its rows was opened
     * @param {function():void} [opts.onMissedClear]  its × was clicked
     * @param {?string} [opts.from]  the activity whose pill opened it; a tab.js gets it as
     *   `from` (the Media tab shows that player first)
     * @param {?Gio.Settings} [opts.gsettings]  Buoy's settings, for Home's glances
     */
    constructor({
        modules, list, tab, maxHeight, settings = {}, onSlot = null, onPrefs = null, onClose = null, from = null,
        missed = [], onMissedSeen = null, onMissedOpen = null, onMissedClear = null, gsettings = null,
        width = 560, metrics = compactMetrics(), missedFlags = [],
    }) {
        this._width = width;
        this._metrics = metrics;
        this._flags = missedFlags;
        this._page = null;           // Home's list in place of its card and row: 'missed' | 'more'
        this._front = null;          // an activity without a tab put on the main card by its tile
        this._cards = new Map();     // module id → its home Card, made when first shown
        this._glances = new Map();   // module id → {glance, order, wide}, made when Home first shows
        this._modules = modules;
        this._list = list;
        this._from = from;           // the activity id whose pill opened Home, or null
        this._missed = missed;
        this._onMissedSeen = onMissedSeen;
        this._onMissedOpen = onMissedOpen;
        this._onMissedClear = onMissedClear;
        this._settings = settings;
        this._onSlot = onSlot;
        this._onPrefs = onPrefs;
        this._onClose = onClose;
        this._tabs = new Map();      // module id → tab.js instance, built on first selection
        this._gsettings = gsettings;
        this._building = false;      // Home is being laid out: a glance's changed() waits
        this._strip = null;
        this._current = null;
        this._menu = null;           // ⋯ menu while it is open, on _menuLayer
        this._menuLayer = null;
        this._moreButton = null;
        this._maxHeight = maxHeight;
        this._fitLater = 0;

        // The ⋯ menu floats over the tab (Notchy): a BinLayout stacks it on the column.
        this.actor = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});
        // y_expand: BinLayout centres a child that does not expand, so when the menu is
        // taller than the tab (an empty tab) the strip would slide down under it
        this._column = new St.BoxLayout({
            style_class: 'buoy-panel', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true,
        });
        this.actor.add_child(this._column);
        // the body a tab switch leaves, fading where it stood (_leave): over the column, no input
        this._leaving = new St.Widget({x_expand: true, y_expand: true, reactive: false});
        this.actor.add_child(this._leaving);
        // a tile's or the card's leading and title flying to their place in the tab it opens,
        // over everything (present/flight.js, design/motion "Phần chung đi tới chỗ mới")
        // 0 × 0 at the top left: the clones draw past it, and never count in Home's size (a
        // clone as wide as its part widened Home, which widened the part: 1414 → 2218 px)
        this._flightLayer = new St.Widget({
            reactive: false, width: 0, height: 0,
            x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START,
        });
        this.actor.add_child(this._flightLayer);
        this._flights = new Flights(this._flightLayer, () => this._view);
        this._flightRun = null;
        // one rounded group that hugs its tabs (Notchy's strip); the selected tab's pill is
        // a marker of its own behind the row, so it slides to the next tab (design/motion
        // "Đổi tab", kit/ui/strip.js)
        this._strip_ = new SlidingRow({groupClass: 'buoy-tabs', rowClass: 'buoy-tabs-row', markerClass: 'buoy-tab-marker'});
        this._stripGroup = this._strip_.group;
        this._stripBox = this._strip_.row;
        this._body = new St.ScrollView({
            style_class: 'buoy-panel-body', x_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        this._body.set_style(`max-height: ${Math.max(0, maxHeight - STRIP_H)}px;`);
        // the scrolled child must be St.Scrollable; tab bodies of any kind go inside it
        this._view = new BodyView({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this._view[FILL] = Math.max(0, maxHeight - STRIP_H);   // an empty tab fills it (EmptyState)
        this._body.set_child(this._view);
        // the strip on the left, ⚙ (prefs, SPEC §3) on the right of the same row
        this._header = new St.BoxLayout({style_class: 'buoy-panel-header', x_expand: true});
        // the head 56: the strip and ⚙ are 32, 12 from the top (design/expanded)
        this._header.set_height(metrics.button);
        this._column.set_style(`padding: ${(metrics.head - metrics.button) / 2}px ${EDGE}px ${EDGE}px; spacing: ${(metrics.head - metrics.button) / 2}px;`);
        this._header.add_child(this._stripGroup);
        this._header.add_child(new St.Widget({x_expand: true}));
        const prefs = new St.Button({
            style_class: 'buoy-tab buoy-gear', can_focus: true, accessible_name: 'Settings',
            child: new St.Icon({...iconProps('emblem-system-symbolic'), icon_size: 16}),
            y_align: Clutter.ActorAlign.CENTER, width: metrics.button, height: metrics.button,
        });
        prefs.connect('clicked', () => this._onPrefs?.());
        this._header.add_child(prefs);
        this._column.add_child(this._header);
        this._column.add_child(this._body);
        this.actor.connect('destroy', () => {
            this._gone = true;
            this._flightRun?.destroy();
            this._flights.land();
            this._destroyTabs();
        });
        // The body takes what the cap leaves after the strip and padding (font scaling
        // changes them). notify::allocation fires inside Clutter's allocation: measure
        // just before the next redraw instead, once.
        const allocId = this.actor.connect('notify::allocation', () => {
            this.actor.disconnect(allocId);
            this._fitLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._fitLater = 0;
                const chrome = Math.ceil(this._column.height - this._body.height);
                const room = Math.max(0, this._maxHeight - chrome);
                this._body.set_style(`max-height: ${room}px;`);
                const node = this._body.get_theme_node();
                this._view[FILL] = Math.max(0, room - node.get_vertical_padding());
                this._view.queue_relayout();
                return GLib.SOURCE_REMOVE;
            });
        });

        this._plan();
        this.select(findTab(this._strip, tab) ? tab : HOME);
    }

    get current() {
        return this._current;
    }

    /**
     * New list from the stack while open: refresh the strip and the shown tab.
     *
     * @param {object[]} list  visible activities (stack order)
     */
    update(list) {
        this._list = list;
        const before = stripKey(this._strip);
        this._plan();
        if (this._menu)
            return;                  // the menu lists standalone tabs: the list changes nothing
        if (!findTab(this._strip, this._current))
            this.select(HOME);       // its last activity ended
        else if (before !== stripKey(this._strip) || this._isLive(this._current))
            this.select(this._current);
        this._feedTabs();
    }

    // A tab's badge may change without a new list (the Notifications tab cleared): the
    // strip is planned again and redrawn when it changed; the body stays.
    _refreshStrip() {
        if (this._menu || this._gone)
            return;
        const before = stripKey(this._strip);
        this._plan();
        if (before !== stripKey(this._strip))
            this._renderStrip();
    }

    // Kind tabs with a tab.js keep their actor: hand them their activities instead.
    _feedTabs() {
        for (const [id, tab] of this._tabs) {
            const t = findTab(this._strip, id);
            if (t?.type === 'kind')
                tab.update?.(tabActivities(t, this._list, {own: true}));
        }
    }

    select(id) {
        // a tab that is not in the strip (a kind tab with nothing to show) is no target
        if (!findTab(this._strip, id))
            return;
        this._closeMenu(false);
        if (id !== HOME || this._current !== HOME)
            this._page = null;       // Home opens on its card and row
        // a switch slides (design/motion "Đổi tab"): the marker and the icons on `snap`, the
        // body in from 12 px on the side it goes to; a first open or the same tab again does not
        const order = stripOrder(this._strip);
        const from = this._current;
        const dir = from !== null && from !== id ? Math.sign(order.indexOf(id) - order.indexOf(from)) || 1 : 0;
        const before = this._strip_.places();
        // where the shared parts are before the switch: a tile's go to its tab
        const boxes = dir ? this._flights.departures(this._view) : null;
        this._current = id;
        this._renderStrip(before, from !== id);
        const body = this._buildBody(findTab(this._strip, id));
        this._setBody(body, dir);
        if (dir)
            slideIn(body, dir * TAB_SHIFT, 'snap', FADES.in.ms);
        if (boxes)
            this._fly(boxes, body);
        if (id === HOME && this._missed.length)
            this._onMissedSeen?.();  // the amber light goes off; the list stays (stack)
    }

    // The shared parts of the tab just shown take off from `boxes` and land on `move`, the
    // spring of a slide (design/motion); with animations off they are there at once
    _fly(boxes, body) {
        this._flightRun?.destroy();
        this._flightRun = null;
        this._flights.launch(boxes, body, 0);
        if (!this._flights.flying)
            return;
        // in thousandths: the runner settles within half a pixel, so 0 … 1 would stop at half way
        const run = new SpringRunner(this._flightLayer, v => this._flights.step(v.p / 1000));
        this._flightRun = run;
        run.set({p: 0});
        run.to({p: 1000}, 'move', {
            onDone: () => {
                if (this._flightRun !== run)
                    return;         // another switch took over: its own launch landed these
                this._flights.land();
                run.destroy();
                this._flightRun = null;
            },
        });
    }

    /**
     * Esc on Home's Missed or Ongoing list: back to the card and the row.
     *
     * @returns {boolean} handled
     */
    back() {
        if (this._current !== HOME || !this._page || this._gone)
            return false;
        this._page = null;
        const body = this._homeBody();
        this._setBody(body);
        slideIn(body, -LIST_SHIFT, 'move', FADES.in.ms);   // back: from the left
        return true;
    }

    /**
     * ←/→ while the island holds the keyboard: the next tab in the strip, stopping at
     * the ends.
     *
     * @param {number} delta  -1 or +1
     */
    stepTab(delta) {
        const ids = stripOrder(this._strip);
        const next = ids[step(ids.indexOf(this._current), delta, ids.length)];
        if (next && next !== this._current)
            this.select(next);
    }

    _plan() {
        this._strip = planStrip(this._modules, this._list, this._settings);
    }

    // Home and kind tabs without tab.js are rebuilt from the list; a tab.js keeps its actor.
    _isLive(id) {
        const tab = findTab(this._strip, id);
        return tab.type === 'home' || (tab.type === 'kind' && !this._module(id)?.tab);
    }

    _module(id) {
        return this._modules.find(m => m.id === id) ?? null;
    }

    // --- strip ------------------------------------------------------------------------

    // before, switched: a tab switch slides the marker and the tabs (kit/ui/strip.js); any
    // other redraw (a badge, ⋯ opened) puts the marker on the current tab at once
    _renderStrip(before = new Map(), switched = false) {
        this._stripBox.destroy_all_children();
        const {tabs, slot, more} = this._strip;
        for (const t of tabs)
            this._stripBox.add_child(this._tabButton(t, t.id));
        if (slot)
            this._stripBox.add_child(this._tabButton(slot, slot.id));
        if (more.length) {
            const button = this._button({icon: 'view-more-symbolic', label: null}, 'More tabs');
            button.checked = this._menu !== null;
            button.connect('clicked', () => {
                if (this._menu)
                    this._closeMenu();
                else
                    this._openMenu();
            });
            button.add_style_class_name('buoy-more'); // keeps its size when checked
            this._moreButton = button;
            this._stripBox.add_child(button);
        }
        this._strip_.slide(before, stripOrder(this._strip).includes(this._current) ? this._current : null, switched);
    }

    // Like Notchy: the active tab shows its icon and title, the others only their icon
    // (the title stays their accessible name).
    // The slot looks like any other tab (no ▾, 2026-11-02); ⋯ changes what sits in it.
    _tabButton(tab, id) {
        const active = id === this._current;
        const button = this._button({icon: tab.icon, label: active ? tab.label : null, badge: tab.badge}, tab.label);
        button.checked = active;
        this._strip_.tag(button, id);
        button.connect('clicked', () => this.select(id));
        return button;
    }

    _button({icon, label, badge = false}, accessibleName) {
        const box = new St.BoxLayout({style_class: 'buoy-tab-box'});
        // a theme name, or another app's image by path (present/elements.js iconProps)
        if (icon) {
            const glyph = new St.Icon({...iconProps(icon), icon_size: 16, y_align: Clutter.ActorAlign.CENTER});
            box.add_child(badge ? badged(glyph) : glyph);
        }
        if (label)
            box.add_child(new St.Label({text: label, y_align: Clutter.ActorAlign.CENTER}));
        return new St.Button({
            style_class: 'buoy-tab', child: box, can_focus: true, toggle_mode: false,
            accessible_name: accessibleName,
        });
    }

    // ⋯: a menu floating over the tab, dropping from ⋯ with its right edge on ⋯'s (unlike
    // Notchy, which drops it from the left), listing every enabled standalone
    // tab; choosing one puts it in the slot (`tabs-slot`) and opens it. The tab below
    // stays as it was; the one in the slot now is marked.
    _openMenu() {
        const menu = new St.BoxLayout({
            style_class: 'buoy-menu', orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.START,
        });
        // Laid out by now (⋯ was just clicked): right under the strip, right edge on ⋯'s.
        // A see-through layer over the whole panel places it with padding (St resets an
        // actor's margins from CSS, and BinLayout centres its children). The layer is
        // reactive: a press beside the menu (⋯ included) lands on it and only closes the
        // menu, like a popover; the tab below never sees it (St.Button clicks are gestures,
        // so stopping the event further up would not keep them from firing).
        // Allocation boxes (each relative to its parent), not screen positions: those can
        // still be mid-way through a morph's slide.
        const header = this._header.get_allocation_box();
        const group = this._stripGroup.get_allocation_box();
        const strip = this._stripBox.get_allocation_box();
        const more = this._moreButton.get_allocation_box();
        const left = this._column.x + header.x1 + group.x1 + strip.x1;
        const right = Math.max(0, Math.round(this.actor.width - (left + more.x2)));
        const top = Math.round(this._column.y + header.y1 + group.y2 + 6);
        const layer = new St.BoxLayout({x_expand: true, y_expand: true, reactive: true});
        for (const signal of ['button-press-event', 'touch-event']) {
            layer.connect(signal, (_a, ev) => {
                if (this._menu?.contains(global.stage.get_event_actor(ev)))
                    return Clutter.EVENT_PROPAGATE; // a row's press bubbling up: let it act
                if (ev.type() === Clutter.EventType.BUTTON_PRESS || ev.type() === Clutter.EventType.TOUCH_BEGIN)
                    this._closeMenu();
                return Clutter.EVENT_STOP;
            });
        }
        // padding-bottom: room under the menu when it makes the panel taller
        layer.set_style(`padding-right: ${right}px; padding-top: ${top}px; padding-bottom: ${MENU_BOTTOM}px;`);
        layer.add_child(new St.Widget({x_expand: true}));
        layer.add_child(menu);
        for (const t of this._strip.more) {
            const box = new St.BoxLayout({style_class: 'buoy-menu-row-box', x_expand: true});
            box.add_child(new St.Icon({...iconProps(t.icon), icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
            box.add_child(new St.Label({text: t.label, y_align: Clutter.ActorAlign.CENTER, x_expand: true}));
            if (t.id === this._strip.slot?.id)
                box.add_child(new St.Icon({...iconProps('object-select-symbolic'), icon_size: 14, y_align: Clutter.ActorAlign.CENTER}));
            const row = new St.Button({style_class: 'buoy-menu-row', child: box, can_focus: true, accessible_name: t.label});
            row.connect('clicked', () => {
                this._onSlot?.(t.id);
                this._settings = {...this._settings, slot: t.id};
                this._plan();
                this.select(t.id);
            });
            menu.add_child(row);
        }
        this._menu = menu;
        this._menuLayer = layer;
        this.actor.add_child(layer);
        this._renderStrip();
    }

    _closeMenu(render = true) {
        if (!this._menu)
            return;
        this._menuLayer.destroy();
        this._menu = this._menuLayer = null;
        if (render)
            this._renderStrip();
    }

    // --- body ---------------------------------------------------------------------------

    /**
     * @param {Clutter.Actor} actor  the new body
     * @param {number} [leave]  a tab switch's direction (-1, +1): the old body fades out
     *   and moves 12 px the other way where it stood (design/motion "Đổi tab"); 0: it goes
     */
    _setBody(actor, leave = 0) {
        // back before it finished leaving (a quick switch there and back): it is the body again
        if (actor.get_parent() === this._leaving)
            this._unleave(actor);
        // a module Card's actor is kept for the rest of this open: out of the old layout
        // first, which goes
        for (const card of this._cards.values()) {
            if (!actor.contains(card.actor))
                card.actor.get_parent()?.remove_child(card.actor);
        }
        // a tab.js actor is kept for the rest of this open; anything else is rebuilt
        const kept = new Set([...this._tabs.values()].map(t => t.actor));
        for (const old of this._view.get_children()) {
            if (old === actor)
                continue;
            if (leave)
                this._leave(old, leave, kept.has(old));
            else if (kept.has(old))
                this._view.remove_child(old);
            else
                old.destroy();
        }
        if (actor.get_parent() !== this._view)
            this._view.add_child(actor);
    }

    // The old body leaves where it stood: moved onto the layer over the column at its place
    // and size, it fades out (100 ms) and moves TAB_SHIFT the other way (`snap`), then goes —
    // a tab.js actor is only taken off, to be shown again later.
    _leave(old, dir, kept) {
        const at = old.apply_relative_transform_to_point(this.actor, new Graphene.Point3D({x: 0, y: 0, z: 0}));
        const [w, h] = [old.width, old.height];
        old.remove_all_transitions();
        this._view.remove_child(old);
        this._leaving.add_child(old);
        old.set_position(Math.round(at.x), Math.round(at.y));
        old.set_size(w, h);
        const run = new SpringRunner(old, v => {
            old.translation_x = Math.round(v.t);
        });
        run.set({t: old.translation_x});
        run.to({t: -dir * TAB_SHIFT}, 'snap');
        leaving.set(old, {run, kept});
        old.ease({
            opacity: 0, duration: FADES.out.ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: finished => {
                if (!finished || old.get_parent() !== this._leaving)
                    return;     // taken back meanwhile (_unleave)
                if (kept)
                    this._unleave(old);
                else
                    old.destroy();
            },
        });
    }

    // Off the leaving layer, as it was before it left
    _unleave(actor) {
        leaving.get(actor)?.run.destroy();
        leaving.delete(actor);
        actor.remove_all_transitions();
        this._leaving.remove_child(actor);
        actor.fixed_position_set = false;
        actor.set_size(-1, -1);
        actor.translation_x = 0;
        actor.opacity = 255;
    }

    _buildBody(tab) {
        if (tab.type === 'home')
            return this._homeBody();
        if (this._module(tab.id)?.tab)
            return this._moduleTab(tab.id).actor;
        // a kind tab without tab.js: its activities' own expanded views
        const box = new St.BoxLayout({style_class: 'buoy-kind-tab', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        for (const a of tabActivities(tab, this._list)) {
            const view = buildExpanded(a);
            if (view)
                box.add_child(view);
        }
        if (!box.get_n_children())
            box.add_child(new EmptyState(`No ${tab.label.toLowerCase()}`, {pose: 'idle'}));
        return box;
    }

    _moduleTab(id) {
        let tab = this._tabs.get(id);
        if (!tab) {
            tab = new (this._module(id).tab)({
                close: () => this._onClose?.(), from: this._from,
                refreshStrip: () => this._refreshStrip(),
            });
            this._tabs.set(id, tab);
            const t = findTab(this._strip, id);
            if (t?.type === 'kind')
                tab.update?.(tabActivities(t, this._list, {own: true}));
        }
        return tab;
    }

    _homeBody() {
        this._building = true;
        try {
            return this._buildHome();
        } finally {
            this._building = false;
        }
    }

    _buildHome() {
        if (this._page === 'missed')
            return this._missedList();
        if (this._page === 'more')
            return this._ongoingList();
        const m = this._metrics;
        const rowW = this._width - 2 * EDGE;
        const height = this._maxHeight - m.head - EDGE;
        const glances = this._homeGlances();
        const plan = planHome({
            list: this._ordered(), missed: this._missedCount(),
            glances: glances.map(([id, g]) => ({id, wide: g.wide})), width: rowW, height,
        });
        const box = new St.BoxLayout({
            style_class: 'buoy-home', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        box.set_style(`spacing: ${CARD_GAP}px;`);
        box.set_height(height);
        box.add_child(this._mainCard(plan));
        if (plan.tiles.length)
            box.add_child(this._tileRow(plan, rowW));
        return box;
    }

    // The stack's order, with the activity a tile put on the main card first (one without a
    // tab of its own, design/home "Quay màn hình trong Home")
    _ordered() {
        const front = this._list.find(a => a.id === this._front);
        return front ? [front, ...this._list.filter(a => a !== front)] : this._list;
    }

    _missedCount() {
        return this._missed.length + this._flags.reduce((sum, f) => sum + f.count, 0);
    }

    // Every enabled module's glance: made the first time Home shows, refreshed on every
    // later layout; the ready ones in their order
    _homeGlances() {
        for (const mod of this._modules) {
            const Glance = mod.home?.Glance;
            if (!Glance || this._glances.has(mod.id))
                continue;
            try {
                const glance = new Glance({
                    open: id => this._openTab(id),
                    close: () => this._onClose?.(),
                    changed: () => this._glanceChanged(),
                    settings: this._gsettings,
                });
                this._glances.set(mod.id, {glance, order: Number.isFinite(mod.home.order) ? mod.home.order : 0, wide: mod.home.wide === true});
            } catch (e) {
                console.warn(`Buoy: Home glance ${mod.id} failed: ${e.message}`);
            }
        }
        for (const {glance} of this._glances.values())
            glance.refresh?.();
        return [...this._glances].filter(([, g]) => g.glance.ready && g.glance.tile)
            .sort(([, a], [, b]) => a.order - b.order);
    }

    // A glance's data came or went: Home is laid out again
    _glanceChanged() {
        if (this._gone || this._building || this._menu || this._current !== HOME || this._page)
            return;
        this._setBody(this._homeBody());
    }

    // A glance opens a tab: the strip's or the slot's at once; one listed only under ⋯ goes
    // into the slot first, as choosing it there does. `from`: the activity it was opened on
    // (a module's Home card), told to the tab as a tile's is (_showActivity)
    _openTab(id, from = null) {
        const tab = findTab(this._strip, id);
        if (!tab || this._gone)
            return;
        if (from)
            this._showActivity(id, from);
        if (tab.type === 'standalone' && !stripOrder(this._strip).includes(id)) {
            this._onSlot?.(id);
            this._settings = {...this._settings, slot: id};
            this._plan();
        }
        this.select(id);
    }

    // The tab an activity opens: its kind's, if the strip has one
    _tabOf(a) {
        return this._strip.tabs.find(t => t.type === 'kind' && t.kinds.includes(a.kind))?.id ?? null;
    }

    // --- the main card (design/home "Kích thước": fill-1, radius 16, the height the row leaves)

    _mainCard(plan) {
        const a = plan.main;
        // clipped to its box: nothing it holds runs into the row of tiles (#216)
        const bin = new St.Bin({style_class: 'buoy-home-card', x_expand: true, x_align: Clutter.ActorAlign.FILL, clip_to_allocation: true});
        bin.set_height(plan.mainH);
        if (!a) {
            bin.set_child(this._greeting(plan));
            return bin;
        }
        const mod = this._modules.find(x => x.home?.Card && (x.kinds ?? []).includes(a.kind));
        const card = mod ? this._cardOf(mod) : null;
        if (card) {
            card.show(a, {height: plan.mainH, form: plan.form, width: this._width - 2 * EDGE});
            card.actor.get_parent()?.remove_child(card.actor);
            bin.set_child(card.actor);
            return bin;
        }
        // the rest: its compact in the card (design/home: only music, an ask, a call and the
        // greeting have a card of their own); a click on it opens its tab, as the pill's would
        const content = buildCompact(a, {
            maxWidth: this._width - 2 * EDGE, maxHeight: plan.mainH, metrics: this._metrics, hovered: true, actionsEnd: true,
            // the low card: its buttons top right (design/home "Kích thước"), not cut off
            actionsTop: plan.form === 'low',
            choiceColumns: 2,
        }) ?? this._headOf(a);
        const tab = this._tabOf(a);
        if (!tab && !a.onPress) {
            bin.set_child(content);
            return bin;
        }
        const button = new St.Button({
            style_class: 'buoy-home-hit buoy-home-card-hit', child: content, can_focus: true,
            x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL,
            accessible_name: a.text ?? a.kind,
        });
        button.connect('clicked', () => this._activateActivity(a, tab));
        bin.set_child(button);
        return bin;
    }

    // An activity with no compact: a head as the compact's — its leading at 40, its text,
    // its value at the end
    _headOf(a) {
        const m = this._metrics;
        const p = planMinimal(a, {});
        const row = new St.BoxLayout({style_class: 'buoy-home-head', x_expand: true, y_align: Clutter.ActorAlign.START});
        row.set_style(`padding: ${m.vpad}px ${m.side}px; spacing: ${m.gap}px;`);
        const cell = new St.Bin({width: m.lead, height: m.lead});
        const lead = makeElement(p.leading, 'compact', a, {icon: 24, art: m.lead});
        if (lead)
            cell.set_child(lead);
        row.add_child(cell);
        const name = textLabel(p.text ?? a.kind, 'buoy-home-title', true);
        name.y_align = Clutter.ActorAlign.CENTER;
        row.add_child(name);
        const {value} = tileOf(a);
        const end = value && value.text !== p.text ? valueActor(value, a) : null;
        if (end) {
            end.y_align = Clutter.ActorAlign.CENTER;
            row.add_child(end);
        }
        return row;
    }

    _cardOf(mod) {
        let card = this._cards.get(mod.id);
        if (card)
            return card;
        try {
            card = new mod.home.Card({open: (id, from) => this._openTab(id, from), close: () => this._onClose?.()});
            this._cards.set(mod.id, card);
            return card;
        } catch (e) {
            console.warn(`Buoy: Home card ${mod.id} failed: ${e.message}`);
            return null;
        }
    }

    // Nothing going on: Bu waving, "Good afternoon, Ethan" and the date (design/home C)
    _greeting(plan) {
        const now = GLib.DateTime.new_now_local();
        const row = new St.BoxLayout({style_class: 'buoy-home-greeting', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        // Bu as tall as the card allows, a multiple of his 10 cells, 40 … 80
        const size = Math.max(40, Math.min(80, 10 * Math.floor((plan.mainH - 2 * EDGE) / 10)));
        const bu = makeElement(element({mascot: 'hello', size}, {leading: true}), 'expanded');
        if (bu)
            row.add_child(bu);
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.CENTER, x_expand: true});
        const hour = now.get_hour() + now.get_minute() / 60;
        text.add_child(textLabel(greetingLine(daypartAt(hour, this._settings.daypart), GLib.get_real_name()), 'buoy-home-greeting-title'));
        text.add_child(textLabel(now.format('%A, %B %-d') ?? '', 'buoy-home-subtitle'));
        row.add_child(text);
        return row;
    }

    // A tile or the main card pressed: its tab; an activity without one runs its onPress and
    // closes the island
    _activateActivity(a, tab = this._tabOf(a)) {
        if (tab) {
            this._showActivity(tab, a.id);
            this.select(tab);
        } else if (a.onPress) {
            a.onPress();
            this._onClose?.();
        }
    }

    // A tab that shows one of several (the Media tab's chips) is told which was pressed:
    // `choose` on one already built, `from` for one built after (ARCHITECTURE "tab.js")
    _showActivity(tab, id) {
        this._from = id;
        this._tabs.get(tab)?.choose?.(id);
    }

    // --- the row of tiles ---------------------------------------------------------------

    _tileRow(plan, rowW) {
        const row = new St.BoxLayout({style_class: 'buoy-home-tiles', x_expand: true});
        row.set_style(`spacing: ${CARD_GAP}px;`);
        row.set_height(TILE_H);
        const widths = tileWidths(plan.tiles, rowW);
        plan.tiles.forEach((t, i) => {
            const tile = this._tile(t, widths[i]);
            if (tile) {
                tile.set_width(widths[i]);
                row.add_child(tile);
            }
        });
        return row;
    }

    _tile(t, width) {
        if (t.type === 'missed') {
            const tile = this._tileButton({
                icon: 'preferences-system-notifications-symbolic', value: String(t.count), caption: 'Missed',
                // the apps that really have notifications unseen, by their icons, in the corner
                // (design/home, 2026-11-13, Ethan: in place of "1 notification")
                apps: cornerIcons(this._flags.flatMap(f => f.icons ?? []), cornerMax(width)), width,
            }, 'Missed');
            tile.add_style_class_name('buoy-home-tile-missed');
            tile.connect('clicked', () => this._showPage('missed'));
            return tile;
        }
        if (t.type === 'more') {
            const tile = this._tileButton({icon: 'view-more-symbolic', value: `+${t.count}`, caption: 'See all', width}, 'Ongoing');
            tile.connect('clicked', () => this._showPage('more'));
            return tile;
        }
        if (t.type === 'glance') {
            const {glance} = this._glances.get(t.id);
            const wide = t.wide ? glance.wide?.(width) : null;
            const tile = wide ? this._tileButton(null, glance.tile.caption ?? t.id, wide) : this._tileButton({...glance.tile, width}, glance.tile.caption ?? t.id);
            tile.connect('clicked', () => glance.activate?.());
            return tile;
        }
        const a = t.activity;
        const {leading, value, caption} = tileOf(a);
        const tile = this._tileButton({leading, valueEl: value, caption, width, activity: a}, a.text ?? a.kind);
        // an activity without a tab of its own goes up to the main card, with its buttons
        tile.connect('clicked', () => {
            if (this._tabOf(a)) {
                this._activateActivity(a);
                return;
            }
            this._front = a.id;
            this._setBody(this._homeBody());
        });
        return tile;
    }


    /**
     * A tile (design/home "Kích thước"): the leading in a 20 cell at 12, the value 1.5em 600,
     * the caption 0.85em; from DETAIL_FROM wide a detail column on the right.
     *
     * @param {?object} t  {icon?, iconSize?, leading?, valueEl?, value?, caption?, detail?, width, activity?}
     * @param {string} name  its accessible name
     * @param {?Clutter.Actor} [own]  a glance's own wide content instead
     * @returns {St.Button}
     */
    _tileButton(t, name, own = null) {
        const button = new St.Button({
            style_class: 'buoy-home-tile buoy-home-hit', can_focus: true, accessible_name: name,
            y_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL,
        });
        if (own) {
            button.set_child(own);
            return button;
        }
        const row = new St.BoxLayout({x_expand: true});
        const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_expand: true});
        const cell = new St.Bin({style_class: 'buoy-home-tile-leading', width: 20, height: 20, x_align: Clutter.ActorAlign.START});
        const lead = t.leading
            ? makeElement(t.leading, 'minimal', t.activity ?? null, {icon: 16, art: 20})
            : iconOf(t.icon, t.iconSize ?? 16);
        if (lead)
            cell.set_child(lead);
        markShared(cell, 'leading', t.activity ?? null);   // flies to its tab (design/motion)
        // `since`: how old the tile's data is, in the top right corner, beside the icon
        // (the weather's update time, design/home 2026-11-13); it moves on once a minute
        // while shown
        // `apps`: {icons, more}, the Missed tile's apps (design/home, 2026-11-13)
        let corner = null;
        if (Number.isFinite(t.since))
            corner = sinceLabel(t.since);
        else if (t.apps?.icons?.length)
            corner = appIcons(t.apps);
        if (corner) {
            const top = new St.BoxLayout({x_expand: true});
            top.add_child(cell);
            top.add_child(new St.Widget({x_expand: true}));
            top.add_child(corner);
            col.add_child(top);
        } else {
            col.add_child(cell);
        }
        col.add_child(new St.Widget({y_expand: true}));
        /** @type {?St.Widget} */
        let value = t.value ? textLabel(t.value, '') : null;
        if (t.valueEl)
            value = valueActor(t.valueEl, t.activity ?? null);
        if (value) {
            value.add_style_class_name('buoy-home-tile-value');
            col.add_child(value);
        }
        if (t.caption)
            col.add_child(markShared(textLabel(t.caption, 'buoy-home-tile-caption'), 'title', t.activity ?? null));
        row.add_child(col);
        if (t.detail && t.width >= DETAIL_FROM) {
            const detail = textLabel(t.detail, 'buoy-home-tile-detail');
            detail.y_align = Clutter.ActorAlign.END;
            row.add_child(detail);
        }
        button.set_child(row);
        return button;
    }

    // --- the lists in place of the card and the row (design/home "Bị nhỡ và +K") --------

    _showPage(page) {
        this._page = page;
        const body = this._homeBody();
        this._setBody(body);
        slideIn(body, LIST_SHIFT, 'move', FADES.in.ms);    // a page pushed in from the right
    }

    // ‹ (back to Home, also Esc), the title and its count, an action
    _listHead(title, action = null) {
        const head = new St.BoxLayout({style_class: 'buoy-home-list-head', x_expand: true});
        const back = new St.Button({
            style_class: 'buoy-round', can_focus: true, accessible_name: 'Back',
            child: new St.Icon({...iconProps('go-previous-symbolic'), icon_size: 16}),
            width: this._metrics.button, height: this._metrics.button,
        });
        back.connect('clicked', () => this.back());
        head.add_child(back);
        head.add_child(textLabel(title, 'buoy-home-title', true));
        if (action)
            head.add_child(action);
        return head;
    }

    /**
     * One row 32: the leading 20, the name, its detail, the time or value at the end.
     *
     * @param {{leading?: object, icon?: *, name?: string, detail?: ?string, end?: ?Clutter.Actor, activity?: object}} r
     * @param {?function():void} onClick
     * @returns {St.Button}
     */
    _listRow({leading = null, icon = null, name = '', detail = null, end = null, activity = null}, onClick) {
        const content = new St.BoxLayout({style_class: 'buoy-home-list-row-box', x_expand: true});
        const cell = new St.Bin({width: 20, height: 20, y_align: Clutter.ActorAlign.CENTER});
        const lead = leading ? makeElement(leading, 'minimal', activity, {icon: 16, art: 20}) : iconOf(icon, 16);
        if (lead)
            cell.set_child(lead);
        content.add_child(cell);
        content.add_child(textLabel(name ?? '', 'buoy-home-list-name'));
        if (detail)
            content.add_child(textLabel(detail, 'buoy-home-list-detail', true));
        else
            content.add_child(new St.Widget({x_expand: true}));
        if (end)
            content.add_child(end);
        const row = new St.Button({
            style_class: 'buoy-home-row', child: content, x_expand: true, can_focus: true,
            reactive: !!onClick, x_align: Clutter.ActorAlign.FILL, accessible_name: name ?? '',
        });
        if (onClick)
            row.connect('clicked', onClick);
        return row;
    }

    _listBox(head) {
        const box = new St.BoxLayout({style_class: 'buoy-home-list', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        box.add_child(head);
        return box;
    }

    // Missed: the sources' rows (notifications, one row) then what ended unseen, newest
    // first; a row opens its place and leaves; × clears them all
    _missedList() {
        const clear = new St.Button({
            style_class: 'buoy-round', can_focus: true, accessible_name: 'Clear missed',
            child: new St.Icon({...iconProps('window-close-symbolic'), icon_size: 16}),
            width: this._metrics.button, height: this._metrics.button,
        });
        clear.connect('clicked', () => {
            this._missed = [];
            this._onMissedClear?.();
            this._page = this._flags.length ? 'missed' : null;
            this._setBody(this._homeBody());
        });
        const box = this._listBox(this._listHead(`Missed · ${this._missedCount()}`, this._missed.length ? clear : null));
        for (const f of this._flags) {
            box.add_child(this._listRow({icon: 'preferences-system-notifications-symbolic', name: `${f.title} · ${f.count}`, detail: f.detail},
                f.tab ? () => this._openTab(f.tab) : null));
        }
        for (const m of this._missed) {
            const tab = this._strip.tabs.find(t => t.type === 'kind' && t.kinds.includes(m.kind));
            box.add_child(this._listRow({
                icon: tab?.icon ?? 'view-app-grid-symbolic', name: m.text ?? m.kind, detail: tab?.label ?? null,
                end: textLabel(clockTime(m.at), 'buoy-home-list-detail'),
            }, tab ? () => {
                this._missed = this._missed.filter(x => x !== m);
                this._onMissedOpen?.(m);
                this.select(tab.id);
            } : null));
        }
        if (!this._flags.length && !this._missed.length)
            box.add_child(new EmptyState('Nothing missed', {pose: 'idle'}));
        return box;
    }

    // Ongoing (+K): every activity in the stack's order; a row opens its tab
    _ongoingList() {
        const box = this._listBox(this._listHead(`Ongoing · ${this._list.length}`));
        const rows = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        for (const a of this._list) {
            const {leading, value} = tileOf(a);
            rows.add_child(this._listRow({
                leading, name: a.text ?? a.kind, activity: a,
                end: value && value.type !== 'text' ? valueActor(value, a) : null,
                detail: value?.type === 'text' && value.text !== a.text ? value.text : null,
            }, () => this._activateActivity(a)));
        }
        // past LIST_MAX rows it scrolls, only this list (design/home)
        if (this._list.length > LIST_MAX) {
            const scroll = new St.ScrollView({
                style_class: 'buoy-home-list-scroll', x_expand: true, y_expand: true,
                hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            });
            scroll.set_child(rows);
            box.add_child(scroll);
        } else {
            box.add_child(rows);
        }
        return box;
    }

    _destroyTabs() {
        if (this._fitLater) {
            global.compositor.get_laters().remove(this._fitLater);
            this._fitLater = 0;
        }
        for (const tab of this._tabs.values())
            tab.destroy?.();
        this._tabs.clear();
        for (const made of [...this._cards.values(), ...[...this._glances.values()].map(g => g.glance)]) {
            try {
                made.destroy?.();
            } catch (e) {
                console.warn(`Buoy: a Home card or glance failed to go: ${e.message}`);
            }
        }
        this._cards.clear();
        this._glances.clear();
    }

    destroy() {
        this.actor.destroy();
    }
}

/**
 * "12 min ago" for a tile's corner (design/home, 2026-11-13): small and subtle, moved on once a
 * minute while shown (parts.js tick; nothing while Home is closed). Also for a module's own
 * wide tile (the weather's).
 *
 * @param {number} at  ms since the epoch
 * @returns {St.Label}
 */
export function sinceLabel(at) {
    const l = textLabel('', 'buoy-home-tile-since');
    l.y_align = Clutter.ActorAlign.START;
    tick(l, () => {
        l.text = agoWords(at, Date.now());
    }, () => true, 60);
    return l;
}

/**
 * Apps' icons at 16 for a tile's corner, then "+N" (the Missed tile, design/home 2026-11-13):
 * each icon a string from Gio.Icon.to_string (or a theme name).
 *
 * @param {{icons: string[], more: number}} apps  cornerIcons()
 * @returns {St.BoxLayout}
 */
function appIcons({icons, more}) {
    const box = new St.BoxLayout({style_class: 'buoy-home-tile-apps', y_align: Clutter.ActorAlign.CENTER});
    for (const s of icons) {
        let gicon = null;
        try {
            gicon = Gio.Icon.new_for_string(s);
        } catch {}
        box.add_child(gicon
            ? new St.Icon({gicon, icon_size: 16, fallback_gicon: fallbackIcon('view-app-grid-symbolic')})
            : new St.Icon({...iconProps(s), icon_size: 16}));
    }
    if (more > 0) {
        const l = textLabel(`+${more}`, 'buoy-home-tile-since');
        l.y_align = Clutter.ActorAlign.CENTER;
        box.add_child(l);
    }
    return box;
}
