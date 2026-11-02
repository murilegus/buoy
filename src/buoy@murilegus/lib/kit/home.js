import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {buildCompact, buildExpanded} from './present.js';
import {planStrip, tabActivities, findTab, HOME} from './tabs.js';

const STRIP_H = 60; // first guess for the strip + panel padding; measured once laid out

/**
 * The panel a click opens (SPEC §2b, §3): the tab strip and the selected tab's body.
 * Built per open and destroyed when expanded closes, so the next open follows context
 * again and a closed island holds none of it. Which tabs exist and where an open
 * starts come from tabs.js; this file only makes the actors.
 *
 *   Home        every visible activity as a row (the full list, also behind +N); a row
 *               opens that activity's tab. Modules add their Home blocks in M3.
 *   kind tab    the module's tab.js, or the expanded views of its activities
 *   standalone  a module's tab.js, built on first selection (slot / ⋯ / pinned)
 *
 * A tab.js export is a class: `new Tab()` → {actor, destroy()}.
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
     */
    constructor({modules, list, tab, maxHeight, settings = {}, onSlot = null}) {
        this._modules = modules;
        this._list = list;
        this._settings = settings;
        this._onSlot = onSlot;
        this._tabs = new Map();      // module id → tab.js instance, built on first selection
        this._strip = null;
        this._current = null;
        this._menu = null;           // ⋯ menu while it is open, on _menuLayer
        this._menuLayer = null;
        this._moreButton = null;
        this._maxHeight = maxHeight;
        this._fitLater = 0;

        // The ⋯ menu floats over the tab (Notchy): a BinLayout stacks it on the column.
        this.actor = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});
        this._column = new St.BoxLayout({
            style_class: 'buoy-panel', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
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
        this._view = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this._body.set_child(this._view);
        this._column.add_child(this._stripBox);
        this._column.add_child(this._body);
        this.actor.connect('destroy', () => this._destroyTabs());
        // The body takes what the cap leaves after the strip and padding (font scaling
        // changes them). notify::allocation fires inside Clutter's allocation: measure
        // just before the next redraw instead, once.
        const allocId = this.actor.connect('notify::allocation', () => {
            this.actor.disconnect(allocId);
            this._fitLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._fitLater = 0;
                const chrome = Math.ceil(this._column.height - this._body.height);
                this._body.set_style(`max-height: ${Math.max(0, this._maxHeight - chrome)}px;`);
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
        const before = this._strip.tabs.map(t => t.id).join();
        this._plan();
        if (this._menu)
            return;                  // the menu lists standalone tabs: the list changes nothing
        if (!findTab(this._strip, this._current))
            this.select(HOME);       // its last activity ended
        else if (before !== this._strip.tabs.map(t => t.id).join() || this._isLive(this._current))
            this.select(this._current);
    }

    select(id) {
        this._closeMenu(false);
        this._current = id;
        this._renderStrip();
        this._setBody(this._buildBody(findTab(this._strip, id)));
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
            this._stripBox.add_child(this._tabButton(slot, slot.id, true));
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
    // The slot carries a ▾: ⋯ changes what sits in it.
    _tabButton(tab, id, isSlot = false) {
        const active = id === this._current;
        const button = this._button({icon: tab.icon, label: active ? tab.label : null}, tab.label, isSlot);
        button.checked = active;
        button.connect('clicked', () => this.select(id));
        return button;
    }

    _button({icon, label}, accessibleName, isSlot = false) {
        const box = new St.BoxLayout({style_class: 'buoy-tab-box'});
        if (icon)
            box.add_child(new St.Icon({icon_name: icon, icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
        if (label)
            box.add_child(new St.Label({text: label, y_align: Clutter.ActorAlign.CENTER}));
        if (isSlot)
            box.add_child(new St.Icon({icon_name: 'pan-down-symbolic', icon_size: 12, y_align: Clutter.ActorAlign.CENTER}));
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
        const [ax, ay] = this.actor.get_transformed_position();
        const [bx] = this._moreButton.get_transformed_position();
        const [, sy] = this._stripBox.get_transformed_position();
        const right = Math.max(0, Math.round(ax + this.actor.width - (bx + this._moreButton.width)));
        const top = Math.round(sy - ay + this._stripBox.height + 6);
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
        layer.set_style(`padding-right: ${right}px; padding-top: ${top}px;`);
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
        return box;
    }

    _moduleTab(id) {
        let tab = this._tabs.get(id);
        if (!tab) {
            tab = new (this._module(id).tab)();
            this._tabs.set(id, tab);
        }
        return tab;
    }

    _homeBody() {
        const box = new St.BoxLayout({style_class: 'buoy-home-list', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        if (!this._list.length) {
            box.add_child(new St.Label({text: 'Nothing going on', style_class: 'buoy-home-empty'}));
            return box;
        }
        for (const a of this._list) {
            const content = buildCompact(a);
            if (!content)
                continue;
            const tabId = this._strip.tabs.find(t => t.type === 'kind' && t.kinds.includes(a.kind))?.id;
            const row = new St.Button({
                style_class: 'buoy-home-row', child: content, x_expand: true,
                can_focus: true, reactive: !!tabId || !!a.onPress,
                x_align: Clutter.ActorAlign.FILL,
            });
            content.x_expand = true; // St.Button centres a child at its natural width
            row.connect('clicked', () => {
                if (tabId)
                    this.select(tabId);
                else
                    a.onPress?.();
            });
            box.add_child(row);
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
    }

    destroy() {
        this.actor.destroy();
    }
}
