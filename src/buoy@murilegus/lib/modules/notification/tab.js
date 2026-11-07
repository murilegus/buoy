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
import {actionIndex, buttonsOf, countText, rowText, stackGroups} from './adapter.js';
import {appIdOf, msOf} from './source.js';

const ICON = 32;
const BANNERS = 'org.gnome.desktop.notifications';

/**
 * The Notifications tab (docs/NOTIFICATIONS.md §6, redesigned 2026-11-07): Shell's own
 * notifications, the same objects as GNOME's list — `Main.messageTray.getSources()` and
 * each source's `notifications`, followed while the tab is open (`source-added` /
 * `source-removed`, `notification-added` / `notification-removed`; a change re-draws once,
 * on idle).
 *
 *   bar     "N missed" (amber) · "N notifications" · Do Not Disturb · Clear; in an app's
 *           view: ‹ the app · N · Dismiss all
 *   list    one stack per app, newest app first: its newest notification as a card, one
 *           or two thin layers under it and the count when it holds more
 *   app     a stack clicked open: every card of that app
 *   card    the app's logo 32 (in an app's view what the notification brings: its picture
 *           — a chat's avatar —, else its own icon, else the logo), app · time over a bold
 *           title and one line of body, an amber dot when it was unseen; on hover its own
 *           actions and × take the right side
 *
 * Unseen = `acknowledged` false when the tab opened (DND, a full banner queue); opening
 * marks them seen, as GNOME's list does when shown (ui/messageList.js vfunc_map), and one
 * arriving while the tab is open is seen at once (no pill: it is in sight). A card's
 * click activates it and closes the island (a stack of several opens instead); an action
 * runs and closes it; × dismisses (destroy, DISMISSED) — GNOME's list follows, and one
 * gone from there leaves here. Shared screen: the app's name, no message (§5).
 */
export class NotificationsTab {
    /**
     * @param {{close?: function():void, refreshStrip?: function():void}} [kit]  close():
     *   the island, after an action; refreshStrip(): the tab's dot may have changed
     */
    constructor({close = null, refreshStrip = null} = {}) {
        this._close = close;
        this._refreshStrip = refreshStrip;
        this._redrawId = 0;
        this._app = null;            // the stack opened, by app id
        this.actor = new St.BoxLayout({
            style_class: 'buoy-ntab', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
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

        // seen once shown: marked as unseen until the tab closes
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
        this._refreshStrip = null;
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
            this._refreshStrip?.();     // the bell's dot: some left, or none
            return GLib.SOURCE_REMOVE;
        });
    }

    _render() {
        this.actor.destroy_all_children();
        const items = this._all().map(n => ({
            n, app: appIdOf(n.source), appName: n.source?.title || 'Notification',
            at: msOf(n.datetime), missed: this._missed.has(n),
        }));
        const {groups, missed, total} = stackGroups(items);
        const open = this._app ? groups.find(g => g.app === this._app) : null;
        if (!open)
            this._app = null;

        if (open) {
            this.actor.add_child(this._appBar(open));
            for (const i of open.items)
                this.actor.add_child(this._card(i, {withApp: false, avatar: true}));
            return;
        }
        this.actor.add_child(this._listBar(missed, total));
        if (!total) {
            this.actor.add_child(new EmptyState('All caught up', {pose: 'sleep'}));
            return;
        }
        for (const g of groups)
            this.actor.add_child(this._stack(g));
    }

    // --- the bar -------------------------------------------------------------------------

    _listBar(missed, total) {
        const bar = new St.BoxLayout({style_class: 'buoy-ntab-bar', x_expand: true});
        if (missed) {
            const chip = new St.BoxLayout({style_class: 'buoy-nchip buoy-nchip-missed', y_align: Clutter.ActorAlign.CENTER});
            chip.add_child(new St.Widget({style_class: 'buoy-ndot', y_align: Clutter.ActorAlign.CENTER}));
            chip.add_child(new St.Label({text: `${missed} missed`, y_align: Clutter.ActorAlign.CENTER}));
            bar.add_child(chip);
        }
        if (total)
            bar.add_child(new St.Label({text: countText(total), style_class: 'buoy-ntab-count', y_align: Clutter.ActorAlign.CENTER}));
        bar.add_child(new St.Widget({x_expand: true}));
        bar.add_child(this._dnd());
        if (total)
            bar.add_child(chipButton('Clear', null, () => this._all().forEach(dismiss)));
        return bar;
    }

    _appBar(g) {
        const bar = new St.BoxLayout({style_class: 'buoy-ntab-bar', x_expand: true});
        const back = new St.BoxLayout({style_class: 'buoy-nback-line'});
        back.add_child(new St.Icon({icon_name: 'go-previous-symbolic', icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
        back.add_child(new St.Label({text: `${g.appName} · ${g.items.length}`, y_align: Clutter.ActorAlign.CENTER}));
        const button = new St.Button({
            style_class: 'buoy-nback', can_focus: true, accessible_name: 'Back', child: back,
            y_align: Clutter.ActorAlign.CENTER,
        });
        button.connect('clicked', () => {
            this._app = null;
            this._render();
        });
        bar.add_child(button);
        bar.add_child(new St.Widget({x_expand: true}));
        bar.add_child(chipButton('Dismiss all', null, () => g.items.forEach(i => dismiss(i.n))));
        return bar;
    }

    // Do Not Disturb: GNOME's `show-banners`, inverted, as the quick toggle
    // (ui/status/doNotDisturb.js); lit while on
    _dnd() {
        const on = !this._banners.get_boolean('show-banners');
        const b = chipButton('Do Not Disturb', on ? 'weather-clear-night-symbolic' : 'notifications-disabled-symbolic', () => {
            this._banners.set_boolean('show-banners', !this._banners.get_boolean('show-banners'));
        });
        b.toggle_mode = true;
        b.checked = on;
        return b;
    }

    // --- stacks and cards ----------------------------------------------------------------

    // An app's newest card; under it one or two thin layers when it holds more. A click
    // on a stack of several opens it (the app's view); on one, the card's own click.
    _stack(g) {
        const more = g.items.length - 1;
        const box = new St.BoxLayout({style_class: 'buoy-nstack', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        box.add_child(this._card(g.items[0], {
            count: more ? g.items.length : 0,
            missedDot: g.missed > 0,
            onOpen: more ? () => {
                this._app = g.app;
                this._render();
            } : null,
        }));
        if (more)
            box.add_child(new St.Widget({style_class: 'buoy-nghost', x_expand: true}));
        if (more > 1)
            box.add_child(new St.Widget({style_class: 'buoy-nghost2', x_expand: true}));
        return box;
    }

    _card({n, appName, missed}, {withApp = true, avatar = false, count = 0, missedDot = missed, onOpen = null} = {}) {
        const shared = this._sharing.shared;
        const text = rowText({title: n.title, body: n.body, markup: n.useBodyMarkup === true, appName}, shared);
        const card = new St.BoxLayout({
            style_class: 'buoy-ncard', x_expand: true, reactive: true, track_hover: true,
        });

        const main = new St.BoxLayout({style_class: 'buoy-ncard-main', x_expand: true});
        main.add_child(cardIcon(n, avatar && !shared));
        const col = new St.BoxLayout({
            style_class: 'buoy-ncard-text', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        const meta = new St.BoxLayout({style_class: 'buoy-ncard-meta'});
        const at = msOf(n.datetime);
        const time = label('', 'buoy-ncard-time');
        tick(time, () => {
            time.text = withApp ? `${appName} · ${agoText(at, Date.now())}` : agoText(at, Date.now());
        }, () => true, 20);
        meta.add_child(time);
        if (missedDot)
            meta.add_child(new St.Widget({style_class: 'buoy-ndot', y_align: Clutter.ActorAlign.CENTER}));
        col.add_child(meta);
        col.add_child(label(text.title, 'buoy-ncard-title'));
        if (text.body)
            col.add_child(label(text.body, 'buoy-ncard-body'));
        main.add_child(col);
        const press = new St.Button({
            style_class: 'buoy-ncard-press', can_focus: true, x_expand: true, child: main,
            accessible_name: text.title,
        });
        press.connect('clicked', () => {
            if (onOpen) {
                onOpen();
                return;
            }
            n.activate();
            this._close?.();
        });
        card.add_child(press);

        // the count at rest; on hover (or focus inside) the actions and × in its place
        const badge = count ? label(String(count), 'buoy-ncount') : null;
        const acts = new St.BoxLayout({style_class: 'buoy-ncard-acts', y_align: Clutter.ActorAlign.CENTER, visible: false});
        if (!onOpen) {
            for (const b of buttonsOf(n.actions.map(a => a.label)).slice(0, 2)) {
                acts.add_child(chipButton(b.label, null, () => {
                    n.actions[actionIndex(b.id)]?.activate();
                    this._close?.();
                }));
            }
        }
        const x = new St.Button({
            style_class: 'buoy-nclose', can_focus: true,
            accessible_name: onOpen ? `Dismiss ${appName}` : 'Dismiss',
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 12}),
            y_align: Clutter.ActorAlign.CENTER,
        });
        x.connect('clicked', () => {
            if (onOpen)
                this._all().filter(m => appIdOf(m.source) === appIdOf(n.source)).forEach(dismiss);
            else
                dismiss(n);
        });
        acts.add_child(x);
        if (badge)
            card.add_child(badge);
        card.add_child(acts);
        const sync = () => {
            const shown = card.hover || card.contains(global.stage.key_focus);
            acts.visible = shown;
            if (badge)
                badge.visible = !shown;
        };
        card.connect('notify::hover', sync);
        for (const b of [press, x, ...acts.get_children()]) {
            b.connect('key-focus-in', sync);
            b.connect('key-focus-out', sync);
        }
        return card;
    }
}

function dismiss(n) {
    n.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
}

// A stack shows its app's logo; an app's view what the notification brings of its own
// (Ethan, 2026-11-07): its picture (a chat's avatar, a thumbnail: image-data / image-path,
// a GTK bytes icon), else its own icon when it differs from the app's, else the logo
function cardIcon(n, avatar) {
    const logo = n.source?.icon ?? null;
    let gicon = logo;
    if (avatar && n.gicon) {
        const themed = n.gicon instanceof Gio.ThemedIcon;
        if (!themed || !logo || !n.gicon.equal(logo))
            gicon = n.gicon;
    }
    return new St.Icon({
        style_class: 'buoy-ncard-icon', icon_size: ICON, y_align: Clutter.ActorAlign.CENTER,
        gicon: gicon ?? n.gicon ?? null,
        fallback_icon_name: 'preferences-system-notifications-symbolic',
    });
}

function chipButton(text, icon, onClick) {
    const box = new St.BoxLayout({style_class: 'buoy-nchip-line'});
    if (icon)
        box.add_child(new St.Icon({icon_name: icon, icon_size: 14, y_align: Clutter.ActorAlign.CENTER}));
    box.add_child(new St.Label({text, y_align: Clutter.ActorAlign.CENTER}));
    const b = new St.Button({
        style_class: 'buoy-nchip', can_focus: true, accessible_name: text, child: box,
        y_align: Clutter.ActorAlign.CENTER,
    });
    b.connect('clicked', () => onClick());
    return b;
}

function label(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
