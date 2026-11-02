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
 *   standalone  a module's tab.js, built on first selection (⋯ or its pinned tab)
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
     * @param {{pinned: string[]}} [opts.settings]  `tabs-pinned`
     * @param {function(string, boolean):void} [opts.onPin]  a standalone tab was pinned
     *   (chosen from ⋯) or unpinned
     */
    constructor({modules, list, tab, maxHeight, settings = {}, onPin = null}) {
        this._modules = modules;
        this._list = list;
        this._settings = settings;
        this._onPin = onPin;
        this._tabs = new Map();      // module id → tab.js instance, built on first selection
        this._strip = null;
        this._current = null;
        this._showingMore = false;
        this._maxHeight = maxHeight;
        this._fitLater = 0;

        this.actor = new St.BoxLayout({
            style_class: 'buoy-panel', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
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
        this.actor.add_child(this._stripBox);
        this.actor.add_child(this._body);
        this.actor.connect('destroy', () => this._destroyTabs());
        // The body takes what the cap leaves after the strip and padding (font scaling
        // changes them). notify::allocation fires inside Clutter's allocation: measure
        // just before the next redraw instead, once.
        const allocId = this.actor.connect('notify::allocation', () => {
            this.actor.disconnect(allocId);
            this._fitLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._fitLater = 0;
                const chrome = Math.ceil(this.actor.height - this._body.height);
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
        if (this._showingMore)
            this._renderStrip();
        else if (!findTab(this._strip, this._current))
            this.select(HOME);       // its last activity ended
        else if (before !== this._strip.tabs.map(t => t.id).join() || this._isLive(this._current))
            this.select(this._current);
    }

    select(id) {
        this._current = id;
        this._showingMore = false;
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
        const {tabs, more} = this._strip;
        for (const t of tabs)
            this._stripBox.add_child(this._tabButton(t, t.id));
        if (more.length) {
            const button = this._button({icon: 'view-more-horizontal-symbolic', label: null}, 'More tabs');
            button.checked = this._showingMore;
            button.connect('clicked', () => this._showMore());
            this._stripBox.add_child(button);
        }
    }

    // Like Notchy: the active tab shows its icon and title, the others only their icon
    // (the title stays their accessible name).
    _tabButton(tab, id) {
        const active = id === this._current && !this._showingMore;
        const button = this._button({icon: tab.icon, label: active ? tab.label : null}, tab.label);
        button.checked = active;
        button.connect('clicked', () => this.select(id));
        return button;
    }

    _button({icon, label}, accessibleName) {
        const box = new St.BoxLayout({style_class: 'buoy-tab-box'});
        if (icon)
            box.add_child(new St.Icon({icon_name: icon, icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
        if (label)
            box.add_child(new St.Label({text: label, y_align: Clutter.ActorAlign.CENTER}));
        return new St.Button({
            style_class: 'buoy-tab', child: box, can_focus: true, toggle_mode: false,
            accessible_name: accessibleName,
        });
    }

    // ⋯: every enabled standalone tab. Choosing one pins it to the strip (`tabs-pinned`)
    // and opens it; a pinned row has a button to unpin it (2026-11-02).
    _showMore() {
        this._showingMore = true;
        this._renderStrip();
        const box = new St.BoxLayout({style_class: 'buoy-home-list', orientation: Clutter.Orientation.VERTICAL});
        for (const t of this._strip.more) {
            const line = new St.BoxLayout({x_expand: true});
            const row = this._button(t, t.label);
            row.add_style_class_name('buoy-home-row');
            row.x_expand = row.child.x_expand = true;
            row.connect('clicked', () => {
                if (!t.pinned)
                    this._pin(t.id, true);
                this.select(t.id);
            });
            line.add_child(row);
            if (t.pinned) {
                const unpin = new St.Button({
                    style_class: 'buoy-tab buoy-unpin', can_focus: true,
                    accessible_name: `Unpin ${t.label}`,
                    child: new St.Icon({icon_name: 'view-pin-symbolic', icon_size: 14}),
                });
                unpin.connect('clicked', () => {
                    this._pin(t.id, false);
                    this._showMore();
                });
                line.add_child(unpin);
            }
            box.add_child(line);
        }
        this._setBody(box);
    }

    _pin(id, on) {
        this._onPin?.(id, on);
        const pinned = (this._settings.pinned ?? []).filter(p => p !== id);
        this._settings = {...this._settings, pinned: on ? [...pinned, id] : pinned};
        this._plan();
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
