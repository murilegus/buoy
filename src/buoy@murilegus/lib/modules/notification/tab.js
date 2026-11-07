import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {EmptyState, tick} from '../../kit/present.js';
import {agoText} from '../../kit/presentation.js';
import {SharingWatch} from '../../kit/sharing.js';
import {buttonsOf, actionIndex, rowText, tabGroups} from './adapter.js';
import {appIdOf, msOf} from './source.js';

const ICON = 24;
const BANNERS = 'org.gnome.desktop.notifications';

/**
 * The Notifications tab (docs/NOTIFICATIONS.md §6): Shell's own notifications, the same
 * objects as GNOME's list — `Main.messageTray.getSources()` and each source's
 * `notifications`, followed while the tab is open (`source-added` / `source-removed`,
 * `notification-added` / `notification-removed`; a change re-draws once, on idle).
 *
 *   top       Do Not Disturb, a toggle (GNOME's `show-banners`, inverted) · Clear
 *   Missed    the notifications nobody had seen when the tab opened (`acknowledged`
 *             false: DND, a full banner queue); opening marks them seen, as GNOME's list
 *             does when shown (ui/messageList.js vfunc_map)
 *   by app    one group per app, newest app first; header × dismisses the group
 *
 * A row's click activates the notification and closes the island; an action runs it
 * and closes the island; × dismisses it (destroy, DISMISSED) — GNOME's list follows, and
 * one gone from there leaves here. Shared screen: the app's name, no message (§5).
 */
export class NotificationsTab {
    /** @param {{close?: function():void}} [kit]  close(): the island, after an action */
    constructor({close = null} = {}) {
        this._close = close;
        this._redrawId = 0;
        this.actor = new St.BoxLayout({
            style_class: 'buoy-notifications-tab', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        this._banners = new Gio.Settings({schema_id: BANNERS});
        this._banners.connectObject('changed::show-banners', () => this._redraw(), this);
        this._sharing = new SharingWatch(() => this._redraw());
        this._sharing.start();

        const tray = Main.messageTray;
        tray.connectObject(
            'source-added', (_t, src) => {
                this._watch(src);
                this._redraw();
            },
            'source-removed', (_t, src) => {
                src.disconnectObject(this);
                this._redraw();
            }, this);
        tray.getSources().forEach(src => this._watch(src));

        // seen once shown: kept in Missed until the tab closes
        this._missed = new Set(this._all().filter(n => !n.acknowledged));
        this._missed.forEach(n => {
            n.acknowledged = true;
        });
        this._render();
    }

    /** The kit's update with this kind's activities: the tab reads Shell's list instead. */
    update() {}

    destroy() {
        if (this._redrawId)
            GLib.source_remove(this._redrawId);
        this._redrawId = 0;
        Main.messageTray.disconnectObject(this);
        Main.messageTray.getSources().forEach(src => src.disconnectObject(this));
        this._banners.disconnectObject(this);
        this._sharing.stop();
        this._close = null;
    }

    _watch(src) {
        src.connectObject(
            'notification-added', (_s, n) => {
                // in sight in the open tab: seen (and no pill — it is shown here);
                // `notification-added` comes before Shell asks for its banner
                if (this.actor.mapped)
                    n.acknowledged = true;
                this._redraw();
            },
            'notification-removed', () => this._redraw(), this);
    }

    _all() {
        return Main.messageTray.getSources().flatMap(src => src.notifications);
    }

    // Many changes at once (Clear) draw once
    _redraw() {
        if (this._redrawId)
            return;
        this._redrawId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._redrawId = 0;
            this._render();
            return GLib.SOURCE_REMOVE;
        });
    }

    _render() {
        this.actor.destroy_all_children();
        const all = this._all();
        this.actor.add_child(this._top(all));
        if (!all.length) {
            this.actor.add_child(new EmptyState('No notifications'));
            return;
        }
        const shared = this._sharing.shared;
        const items = all.map(n => ({
            n, app: appIdOf(n.source), appName: n.source?.title ?? '',
            at: msOf(n.datetime), missed: this._missed.has(n),
        }));
        const {missed, groups} = tabGroups(items);
        if (missed.length) {
            this.actor.add_child(header(`Missed while away · ${missed.length}`, {lit: true}));
            for (const i of missed)
                this.actor.add_child(this._row(i, shared, {withApp: true}));
        }
        for (const g of groups) {
            const icon = g.items[0].n.source?.icon ?? null;
            this.actor.add_child(header(g.appName || 'Notification', {
                icon, clearName: `Dismiss ${g.appName}`,
                onClear: () => g.items.forEach(i => dismiss(i.n)),
            }));
            for (const i of g.items)
                this.actor.add_child(this._row(i, shared));
        }
    }

    _top(all) {
        const box = new St.BoxLayout({style_class: 'buoy-notif-top', x_expand: true});
        // a toggle, lit while on (Shell's Switch draws from the menu theme: a bare dot here)
        const on = !this._banners.get_boolean('show-banners');
        const dndContent = new St.BoxLayout({style_class: 'buoy-notif-dnd-line'});
        dndContent.add_child(new St.Icon({
            icon_name: on ? 'notifications-disabled-symbolic' : 'preferences-system-notifications-symbolic',
            icon_size: 16, y_align: Clutter.ActorAlign.CENTER,
        }));
        dndContent.add_child(new St.Label({text: 'Do Not Disturb', y_align: Clutter.ActorAlign.CENTER}));
        const dnd = new St.Button({
            style_class: 'buoy-notif-dnd', can_focus: true, accessible_name: 'Do Not Disturb',
            toggle_mode: true, checked: on, child: dndContent, y_align: Clutter.ActorAlign.CENTER,
        });
        dnd.connect('clicked', () => {
            this._banners.set_boolean('show-banners', !this._banners.get_boolean('show-banners'));
        });
        box.add_child(dnd);
        box.add_child(new St.Widget({x_expand: true}));
        if (all.length) {
            const clear = new St.Button({
                style_class: 'buoy-notif-clear', can_focus: true, label: 'Clear',
                y_align: Clutter.ActorAlign.CENTER,
            });
            clear.connect('clicked', () => this._all().forEach(dismiss));
            box.add_child(clear);
        }
        return box;
    }

    // picture or icon · title over body · time · ×; the notification's own actions under it
    _row({n, appName}, shared, {withApp = false} = {}) {
        const text = rowText({title: n.title, body: n.body, markup: n.useBodyMarkup === true, appName}, shared);
        const col = new St.BoxLayout({
            style_class: 'buoy-notif-text', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        col.add_child(label(withApp && !shared ? `${text.title} · ${appName}` : text.title, 'buoy-notif-title'));
        if (text.body)
            col.add_child(label(text.body, 'buoy-notif-body'));
        const content = new St.BoxLayout({style_class: 'buoy-notif-line', x_expand: true});
        content.add_child(new St.Icon({
            icon_size: ICON, y_align: Clutter.ActorAlign.CENTER,
            gicon: (!shared && n.gicon) || n.source?.icon || null,
            fallback_icon_name: 'preferences-system-notifications-symbolic',
        }));
        content.add_child(col);
        const at = msOf(n.datetime);
        const time = label('', 'buoy-notif-time');
        tick(time, () => {
            time.text = agoText(at, Date.now());
        }, () => true, 20);
        content.add_child(time);

        const row = new St.Button({
            style_class: 'buoy-notif-row', can_focus: true, x_expand: true, child: content,
            accessible_name: text.title,
        });
        row.connect('clicked', () => {
            n.activate();
            this._close?.();
        });
        const close = new St.Button({
            style_class: 'buoy-notif-close', can_focus: true, accessible_name: 'Dismiss',
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 12}),
            y_align: Clutter.ActorAlign.CENTER,
        });
        close.connect('clicked', () => dismiss(n));
        const line = new St.BoxLayout({style_class: 'buoy-notif-row-line', x_expand: true});
        line.add_child(row);
        line.add_child(close);

        const buttons = buttonsOf(n.actions.map(a => a.label));
        if (!buttons.length)
            return line;
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        box.add_child(line);
        const acts = new St.BoxLayout({style_class: 'buoy-notif-actions'});
        for (const b of buttons) {
            const button = new St.Button({style_class: 'buoy-action', can_focus: true, label: b.label});
            button.connect('clicked', () => {
                n.actions[actionIndex(b.id)]?.activate();
                this._close?.();
            });
            acts.add_child(button);
        }
        box.add_child(acts);
        return box;
    }
}

function dismiss(n) {
    n.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
}

// A group's title: the light for Missed, the app's icon for an app; × at its end
function header(text, {lit = false, icon = null, clearName = null, onClear = null} = {}) {
    const box = new St.BoxLayout({style_class: 'buoy-notif-header', x_expand: true});
    if (lit)
        box.add_child(new St.Widget({style_class: 'buoy-light buoy-light-missed', y_align: Clutter.ActorAlign.CENTER}));
    if (icon)
        box.add_child(new St.Icon({gicon: icon, icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
    box.add_child(new St.Label({text, y_align: Clutter.ActorAlign.CENTER}));
    if (onClear) {
        box.add_child(new St.Widget({x_expand: true}));
        const clear = new St.Button({
            style_class: 'buoy-transfers-clear', can_focus: true, accessible_name: clearName,
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 12}),
            y_align: Clutter.ActorAlign.CENTER,
        });
        clear.connect('clicked', () => onClear());
        box.add_child(clear);
    }
    return box;
}

function label(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
