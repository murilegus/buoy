import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {EmptyState, iconProps} from './present/elements.js';
import {buildExpanded} from './present/expanded.js';
import {buildMinimal} from './present/minimal.js';
import {FILL} from './present/parts.js';
import {clockTime} from '../model/presentation.js';
import {planStrip, stripOrder, tabActivities, findTab, homeChips, homeColumns, HOME} from '../model/tabs.js';
import {step} from '../model/keys.js';

const MENU_BOTTOM = 12; // space between the ⋯ menu and the panel's bottom edge
const STRIP_H = 60; // first guess for the strip + panel padding; measured once laid out
const CHIP_MAX = 240; // a Home chip ellipsizes past this

// what the strip draws: its tabs and their dots
const stripKey = strip => strip.tabs.map(t => `${t.id}${t.badge ? '•' : ''}`).join();

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
 *   Home        SPEC §3 (2026-11-08, layout A): the Missed section, then a chip for each
 *               running activity no block covers (a chip opens its tab), then the
 *               modules' blocks in two columns — Now playing at the start, the weather
 *               over Up next at the end; a block with nothing to show is left out and a
 *               column left empty gives the other the full width. Nothing at all →
 *               "Nothing going on" with Bu.
 *   kind tab    the module's tab.js, or the expanded views of its activities
 *   standalone  a module's tab.js, built on first selection (slot / ⋯ / pinned)
 *
 * A tab.js export is a class: `new Tab({close})` → {actor, destroy(), update?(activities)};
 * a kind tab's `update` gets its kind's visible activities, at once and on every change.
 * `close()` closes the island: a tab calls it after an action that brings a window up
 * (open a file, focus an app), as a notification goes once it is clicked (2026-11-06,
 * Ethan). A Home chip that runs its activity's onPress closes it the same way.
 *
 * A Home block is a module's `home: {Block, column, order}` (index.js): `new Block({open,
 * close, changed, settings})` → {actor, ready, update?(activities), refresh?(), destroy()}.
 * Made the first time Home shows, kept for the rest of the open like a tab.js (its actor
 * moves between layouts, never rebuilt), destroyed when expanded closes. `ready`: it has
 * something to show; `changed()`: `ready` flipped, lay Home out again; `update` gets its
 * module's activities as a kind tab does; `refresh` is called each time Home is laid out
 * (a time moved); `open(id)` selects a tab; `settings` is Buoy's Gio.Settings.
 */
export class Home {
    /**
     * @param {object} opts
     * @param {object[]} opts.modules  enabled modules, in order (index.js exports)
     * @param {object[]} opts.list  visible activities (stack order)
     * @param {string} opts.tab  the tab to start on (tabs.js tabFor)
     * @param {number} opts.maxHeight  the expanded height cap
     * @param {{slot: string, pinned: string[]}} [opts.settings]  `tabs-slot`, `tabs-pinned`
     * @param {function(string):void} [opts.onSlot]  a standalone tab was chosen from ⋯
     * @param {function():void} [opts.onPrefs]  ⚙ was clicked
     * @param {function():void} [opts.onClose]  close the island (a tab's action is done)
     * @param {object[]} [opts.missed]  stack.missed, newest first: Home's Missed section
     * @param {function():void} [opts.onMissedSeen]  Home was shown with that section
     * @param {function(object):void} [opts.onMissedOpen]  one of its rows was opened
     * @param {function():void} [opts.onMissedClear]  its × was clicked
     * @param {?string} [opts.from]  the activity whose pill opened it; a tab.js gets it as
     *   `from` (the Media tab shows that player first)
     * @param {?Gio.Settings} [opts.gsettings]  Buoy's settings, for Home's blocks
     */
    constructor({
        modules, list, tab, maxHeight, settings = {}, onSlot = null, onPrefs = null, onClose = null, from = null,
        missed = [], onMissedSeen = null, onMissedOpen = null, onMissedClear = null, gsettings = null,
    }) {
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
        this._blocks = new Map();    // module id → {block, column, order}: Home's, built when it first shows
        this._gsettings = gsettings;
        this._building = false;      // Home is being laid out: a block's changed() waits
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
        // one rounded group that hugs its tabs (Notchy's strip)
        this._stripBox = new St.BoxLayout({style_class: 'buoy-tabs', x_align: Clutter.ActorAlign.START});
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
        this._header.add_child(this._stripBox);
        this._header.add_child(new St.Widget({x_expand: true}));
        const prefs = new St.Button({
            style_class: 'buoy-tab buoy-gear', can_focus: true, accessible_name: 'Settings',
            child: new St.Icon({icon_name: 'emblem-system-symbolic', icon_size: 16}),
            y_align: Clutter.ActorAlign.CENTER,
        });
        prefs.connect('clicked', () => this._onPrefs?.());
        this._header.add_child(prefs);
        this._column.add_child(this._header);
        this._column.add_child(this._body);
        this.actor.connect('destroy', () => {
            this._gone = true;
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
        this._feedBlocks();          // before Home is laid out again: a block's `ready` may flip
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

    // Home's blocks keep their actor too: each gets its module's activities.
    _feedBlocks() {
        for (const [id, {block}] of this._blocks)
            block.update?.(this._ownActivities(id));
    }

    _ownActivities(id) {
        const kinds = this._module(id)?.kinds ?? [];
        return this._list.filter(a => kinds.includes(a.kind));
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
        this._current = id;
        this._renderStrip();
        this._setBody(this._buildBody(findTab(this._strip, id)));
        if (id === HOME && this._missed.length)
            this._onMissedSeen?.();  // the amber light goes off; the list stays (stack)
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

    _renderStrip() {
        this._stripBox.destroy_all_children();
        const {tabs, slot, more} = this._strip;
        for (const t of tabs)
            this._stripBox.add_child(this._tabButton(t, t.id));
        if (slot)
            this._stripBox.add_child(this._tabButton(slot, slot.id));
        if (more.length) {
            const button = this._button({icon: 'view-more-horizontal-symbolic', label: null}, 'More tabs');
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
    }

    // Like Notchy: the active tab shows its icon and title, the others only their icon
    // (the title stays their accessible name).
    // The slot looks like any other tab (no ▾, 2026-11-02); ⋯ changes what sits in it.
    _tabButton(tab, id) {
        const active = id === this._current;
        const button = this._button({icon: tab.icon, label: active ? tab.label : null, badge: tab.badge}, tab.label);
        button.checked = active;
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
        const strip = this._stripBox.get_allocation_box();
        const more = this._moreButton.get_allocation_box();
        const left = this._column.x + header.x1 + strip.x1;
        const right = Math.max(0, Math.round(this.actor.width - (left + more.x2)));
        const top = Math.round(this._column.y + header.y1 + strip.y2 + 6);
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
            box.add_child(new St.Icon({icon_name: t.icon, icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
            box.add_child(new St.Label({text: t.label, y_align: Clutter.ActorAlign.CENTER, x_expand: true}));
            if (t.id === this._strip.slot?.id)
                box.add_child(new St.Icon({icon_name: 'object-select-symbolic', icon_size: 14, y_align: Clutter.ActorAlign.CENTER}));
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

    _setBody(actor) {
        // a block's actor is kept for the rest of this open, wherever Home placed it: out of
        // the old layout first, which goes
        for (const {block} of this._blocks.values()) {
            if (!actor.contains(block.actor))
                block.actor.get_parent()?.remove_child(block.actor);
        }
        // a tab.js actor is kept for the rest of this open; anything else is rebuilt
        const kept = new Set([...this._tabs.values()].map(t => t.actor));
        for (const old of this._view.get_children()) {
            if (kept.has(old))
                this._view.remove_child(old);
            else
                old.destroy();
        }
        this._view.add_child(actor);
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
        // y_expand: the blocks take what the full-height body leaves under Missed and chips
        const box = new St.BoxLayout({
            style_class: 'buoy-home-list', orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_expand: true,
        });
        const blocks = this._homeBlocks();
        const columns = homeColumns(blocks.map(([id, b]) => ({id, column: b.column, order: b.order, ready: Boolean(b.block.ready)})));
        const chips = homeChips(this._list, this._modules);
        if (this._missed.length)
            this._missedSection(box);
        if (chips.length)
            box.add_child(this._chips(chips));
        if (columns.length)
            box.add_child(this._columns(columns));
        if (!box.get_n_children())
            box.add_child(new EmptyState('Nothing going on', {pose: 'idle'}));
        return box;
    }

    // Every enabled module's Home block: made the first time Home shows, refreshed on
    // every later layout
    _homeBlocks() {
        for (const m of this._modules) {
            const Block = m.home?.Block;
            if (!Block)
                continue;
            const known = this._blocks.get(m.id);
            if (known) {
                known.block.refresh?.();
                continue;
            }
            try {
                const block = new Block({
                    open: id => this._openTab(id),
                    close: () => this._onClose?.(),
                    changed: () => this._blockChanged(),
                    settings: this._gsettings,
                });
                block.update?.(this._ownActivities(m.id));
                this._blocks.set(m.id, {block, column: m.home.column, order: m.home.order});
            } catch (e) {
                console.warn(`Buoy: Home block ${m.id} failed: ${e.message}`);
            }
        }
        return [...this._blocks];
    }

    // A block's `ready` flipped (its data came or went): Home is laid out again
    _blockChanged() {
        if (this._gone || this._building || this._menu || this._current !== HOME)
            return;
        this._setBody(this._homeBody());
    }

    // A block opens a tab: the strip's or the slot's at once; one listed only under ⋯ goes
    // into the slot first, as choosing it there does
    _openTab(id) {
        const tab = findTab(this._strip, id);
        if (!tab || this._gone)
            return;
        if (tab.type === 'standalone' && !stripOrder(this._strip).includes(id)) {
            this._onSlot?.(id);
            this._settings = {...this._settings, slot: id};
            this._plan();
        }
        this.select(id);
    }

    // The running activities no block covers, each its pill's content on a chip (wrapping
    // onto more lines when they do not fit); a chip opens its kind's tab, or runs the
    // activity's onPress and closes the island
    _chips(list) {
        const flow = new St.Widget({
            style_class: 'buoy-home-chips', x_expand: true,
            // snap_to_grid off: each chip its own width (clutter-flow-layout.c allocate)
            layout_manager: new Clutter.FlowLayout({
                orientation: Clutter.Orientation.HORIZONTAL, snap_to_grid: false,
                column_spacing: 6, row_spacing: 6,
            }),
        });
        for (const a of list) {
            const content = buildMinimal(a, {maxWidth: CHIP_MAX});
            if (!content)
                continue;
            const tabId = this._strip.tabs.find(t => t.type === 'kind' && t.kinds.includes(a.kind))?.id;
            const chip = new St.Button({
                style_class: 'buoy-home-chip', child: content,
                can_focus: true, reactive: !!tabId || !!a.onPress,
            });
            chip.connect('clicked', () => {
                if (tabId) {
                    this.select(tabId);
                } else if (a.onPress) {
                    a.onPress();
                    this._onClose?.();
                }
            });
            flow.add_child(chip);
        }
        return flow;
    }

    // Two columns of equal width (start: Now playing; end: weather, Up next), or one
    _columns(columns) {
        const row = new St.BoxLayout({style_class: 'buoy-home-columns', x_expand: true, y_expand: true});
        row.layout_manager.homogeneous = true;
        for (const ids of columns) {
            const col = new St.BoxLayout({
                style_class: 'buoy-home-column', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
            });
            for (const id of ids) {
                const {actor} = this._blocks.get(id).block;
                actor.get_parent()?.remove_child(actor);    // still in the layout before
                col.add_child(actor);
            }
            row.add_child(col);
        }
        return row;
    }

    // What ended while the island was hidden (2026-11-03): newest first, at most 5 (the
    // stack keeps 5), each row its kind's icon, text, tab name and time; a row opens its
    // kind's tab and leaves the list (as an activated notification does), × empties it.
    // Until the M4 notifications tab carries it.
    _missedSection(box) {
        const header = this._sectionHeader(`Missed · ${this._missed.length}`, true);
        // icon-only, as the Transfers tab's (2026-11-06, Ethan); the name stays for a11y
        const clear = new St.Button({
            style_class: 'buoy-home-clear', can_focus: true, accessible_name: 'Clear missed',
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 12}),
            y_align: Clutter.ActorAlign.CENTER,
        });
        clear.connect('clicked', () => {
            this._missed = [];
            this._onMissedClear?.();
            this.select(HOME);
        });
        header.add_child(new St.Widget({x_expand: true}));
        header.add_child(clear);
        box.add_child(header);

        for (const m of this._missed) {
            const tab = this._strip.tabs.find(t => t.type === 'kind' && t.kinds.includes(m.kind));
            const content = new St.BoxLayout({style_class: 'buoy-missed-row', x_expand: true});
            content.add_child(new St.Icon({icon_name: tab?.icon ?? 'view-app-grid-symbolic', icon_size: 16}));
            content.add_child(new St.Label({text: m.text ?? m.kind, style_class: 'buoy-text', y_align: Clutter.ActorAlign.CENTER}));
            if (tab)
                content.add_child(new St.Label({text: tab.label, style_class: 'buoy-missed-source', y_align: Clutter.ActorAlign.CENTER}));
            content.add_child(new St.Widget({x_expand: true}));
            content.add_child(new St.Label({text: clockTime(m.at), style_class: 'buoy-missed-time', y_align: Clutter.ActorAlign.CENTER}));
            const row = new St.Button({
                style_class: 'buoy-home-row', child: content, x_expand: true,
                can_focus: true, reactive: !!tab, x_align: Clutter.ActorAlign.FILL,
            });
            row.connect('clicked', () => {
                this._missed = this._missed.filter(x => x !== m);
                this._onMissedOpen?.(m);
                this.select(tab.id);
            });
            box.add_child(row);
        }
    }

    _sectionHeader(text, lit = false) {
        const header = new St.BoxLayout({style_class: 'buoy-home-section', x_expand: true});
        if (lit)
            header.add_child(new St.Widget({style_class: 'buoy-light buoy-light-missed', y_align: Clutter.ActorAlign.CENTER}));
        header.add_child(new St.Label({text, y_align: Clutter.ActorAlign.CENTER}));
        return header;
    }

    _destroyTabs() {
        if (this._fitLater) {
            global.compositor.get_laters().remove(this._fitLater);
            this._fitLater = 0;
        }
        for (const tab of this._tabs.values())
            tab.destroy?.();
        this._tabs.clear();
        for (const {block} of this._blocks.values()) {
            try {
                block.destroy?.();
            } catch (e) {
                console.warn(`Buoy: Home block failed to go: ${e.message}`);
            }
        }
        this._blocks.clear();
    }

    destroy() {
        this.actor.destroy();
    }
}
