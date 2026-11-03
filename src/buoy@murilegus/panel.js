import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';

import {fallbackIcons, leftCluster} from './lib/kit/cluster.js';

// cluster-background, -radius, -opacity (SPEC §1). St has no CSS variables, so the
// background is the box's inline style, repainted when the look or its hover changes.
let look = {mode: 'hover', radius: 16, opacity: 20};

// What reworkPanel(true) changed on each cluster box, to put back on disable.
let saved = null;

// The left cluster's own content (SPEC §1), first in _leftBox while enabled.
let left = null;

/**
 * SPEC §1: transparent panel; left cluster = focused app or workspace (LeftCluster);
 * right = tray + clock (system cluster — TODO).
 *
 * @param {boolean} on  apply (enable) or revert (disable)
 */
export function reworkPanel(on) {
    const panel = Main.panel;
    const {activities, dateMenu} = panel.statusArea;
    const boxes = [panel._leftBox, panel._rightBox];

    if (on) {
        panel.add_style_class_name('buoy');
        activities.container.hide();
        panel._centerBox.remove_child(dateMenu.container);
        panel._rightBox.add_child(dateMenu.container);
        saved = boxes.map(box => ({
            reactive: box.reactive, track_hover: box.track_hover, visible: box.visible, style: box.get_style(),
        }));
        left = new LeftCluster(panel._leftBox);
        panel._leftBox.insert_child_at_index(left.actor, 0);
    } else {
        left.destroy();
        left = null;
        panel._rightBox.remove_child(dateMenu.container);
        panel._centerBox.add_child(dateMenu.container);
        activities.container.show();
        panel.remove_style_class_name('buoy');
    }
    boxes.forEach((box, i) => {
        // St only sets :hover on a widget that tracks it, and only a reactive actor gets
        // the crossing events (st-widget.c st_widget_enter); the boxes are neither.
        box.reactive = on || saved[i].reactive;
        box.track_hover = on || saved[i].track_hover;
        if (on) {
            box.add_style_class_name('buoy-cluster');
            followEmpty(box, saved[i]);
            saved[i].hover = box.connect('notify::hover', paint);
            paint(box);
        } else {
            box.disconnect(saved[i].hover);
            box.set_style(saved[i].style);
            box.remove_style_class_name('buoy-cluster');
            unfollowEmpty(box, saved[i]);
            box.visible = saved[i].visible;
        }
    });
    if (!on)
        saved = null;
}

/**
 * @param {object} next
 * @param {string} next.mode  `cluster-background`: never | hover | always
 * @param {number} next.radius  `cluster-radius`, px
 * @param {number} next.opacity  `cluster-opacity`, percent
 */
export function setClusterBackground(next) {
    look = next;
    if (saved)
        [Main.panel._leftBox, Main.panel._rightBox].forEach(paint);
}

/**
 * @param {string} mode  `left-cluster-empty`: workspace | hidden
 */
export function setLeftEmpty(mode) {
    left?.setEmpty(mode);
}

// The stylesheet's transition-duration fades the change in both directions.
function paint(box) {
    const shown = look.mode === 'always' || (look.mode === 'hover' && box.hover);
    const alpha = shown ? look.opacity / 100 : 0;
    box.set_style(`border-radius: ${look.radius}px; background-color: rgba(0, 0, 0, ${alpha});`);
}

// A cluster with nothing showing would still draw its padding as a small dark stub
// (`always`, or under the pointer): hide the box until a child shows. Signals only — a
// child coming, going, or changing its visibility.
function followEmpty(box, state) {
    state.children = new Map();
    const sync = () => {
        box.visible = box.get_children().some(c => c.visible);
    };
    const watch = child => state.children.set(child, child.connect('notify::visible', sync));
    state.added = box.connect('child-added', (_b, child) => {
        watch(child);
        sync();
    });
    state.removed = box.connect('child-removed', (_b, child) => {
        child.disconnect(state.children.get(child));
        state.children.delete(child);
        sync();
    });
    box.get_children().forEach(watch);
    sync();
}

function unfollowEmpty(box, state) {
    box.disconnect(state.added);
    box.disconnect(state.removed);
    for (const [child, id] of state.children)
        child.disconnect(id);
    state.children = null;
}

// The app's own icon; if the theme has none, its monochrome one, then a plain window
// (Ethan 2026-11-04). St.Icon tries `fallback_gicon` when `gicon` fails, and a ThemedIcon
// tries its names in order: the theme decides, no lookups here. A window with no app info
// gets Shell's own texture (its window icon).
function appIcon(app) {
    const info = app.get_app_info();
    if (!info)
        return app.create_icon_texture(16);
    const own = info.get_icon();
    const fallback = Gio.ThemedIcon.new_from_names(
        fallbackIcons(own instanceof Gio.ThemedIcon ? own.get_names()[0] : null, app.get_id()));
    return new St.Icon({gicon: own ?? fallback, fallback_gicon: fallback, style_class: 'buoy-app-icon'});
}

// [▣ app · ⊞ 2] or [⊞ Workspace 2] (kit/cluster.js decides). Click toggles the Overview,
// right-click opens the app's menu (Shell's own AppMenu, as on a dash icon), scroll
// switches workspace (Main.wm.handleWorkspaceScroll, the Overview's own limiter). Every
// update comes from a signal: focus, workspace, names, Overview, the cluster's hover.
class LeftCluster {
    constructor(box) {
        this._box = box;
        this._empty = 'workspace';
        this.actor = new St.Button({
            style_class: 'buoy-app', reactive: true, can_focus: true, track_hover: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE, y_align: Clutter.ActorAlign.CENTER,
        });
        const row = new St.BoxLayout({style_class: 'buoy-app-row', y_align: Clutter.ActorAlign.CENTER});
        this._icon = new St.Bin({y_align: Clutter.ActorAlign.CENTER});
        this._text = new St.Label({style_class: 'buoy-app-name', y_align: Clutter.ActorAlign.CENTER});
        this._text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._extra = new St.BoxLayout({style_class: 'buoy-app-extra', y_align: Clutter.ActorAlign.CENTER});
        this._extra.add_child(new St.Label({text: '·', y_align: Clutter.ActorAlign.CENTER}));
        this._extra.add_child(new St.Icon({icon_name: 'view-grid-symbolic', style_class: 'buoy-app-grid'}));
        this._extraText = new St.Label({y_align: Clutter.ActorAlign.CENTER});
        this._extra.add_child(this._extraText);
        row.add_child(this._icon);
        row.add_child(this._text);
        row.add_child(this._extra);
        this.actor.set_child(row);

        this._tracker = Shell.WindowTracker.get_default();
        this._wmPrefs = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        this._menuManager = new PopupMenu.PopupMenuManager(this.actor);
        this._menu = null;
        this._shownApp = undefined;

        const sync = () => this._sync();
        this._ids = [
            [this._tracker, this._tracker.connect('notify::focus-app', sync)],
            [global.workspace_manager, global.workspace_manager.connect('active-workspace-changed', sync)],
            [this._wmPrefs, this._wmPrefs.connect('changed::workspace-names', sync)],
            [Main.overview, Main.overview.connect('showing', sync)],
            [Main.overview, Main.overview.connect('hidden', sync)],
            [box, box.connect('notify::hover', sync)],
        ];
        this.actor.connect('clicked', (_b, button) => this._clicked(button));
        this.actor.connect('scroll-event', (_a, event) => Main.wm.handleWorkspaceScroll(event));
        this._sync();
    }

    setEmpty(mode) {
        this._empty = mode;
        this._sync();
    }

    _app() {
        return Main.overview.visible ? null : this._tracker.focus_app;
    }

    _sync() {
        const app = this._app();
        const plan = leftCluster({
            app: app?.get_name() ?? null,
            index: global.workspace_manager.get_active_workspace_index(),
            names: this._wmPrefs.get_strv('workspace-names'),
            hover: this._box.hover,
            overview: Main.overview.visible,
            empty: this._empty,
        });
        this.actor.visible = plan.visible;
        if (!plan.visible)
            return;
        // the icon only when it changes: an app's texture is not free to make
        const iconKey = plan.icon === 'app' ? app : 'grid';
        if (iconKey !== this._shownApp) {
            this._shownApp = iconKey;
            this._icon.child = plan.icon === 'app'
                ? appIcon(app)
                : new St.Icon({icon_name: 'view-grid-symbolic', style_class: 'buoy-app-grid'});
        }
        this._text.text = plan.text;
        this._extra.visible = plan.extra !== null;
        this._extraText.text = plan.extra ?? '';
        this.actor.accessible_name = plan.extra ? `${plan.text}, workspace ${plan.extra}` : plan.text;
    }

    _clicked(button) {
        if (button !== Clutter.BUTTON_SECONDARY) {
            Main.overview.toggle();
            return;
        }
        const app = this._app();
        if (!app)
            return;
        if (!this._menu) {
            this._menu = new AppMenu(this.actor, St.Side.TOP);
            Main.uiGroup.add_child(this._menu.actor);
            this._menuManager.addMenu(this._menu);
        }
        this._menu.setApp(app);
        this._menu.open(true);
    }

    destroy() {
        for (const [obj, id] of this._ids)
            obj.disconnect(id);
        this._ids = [];
        this._menu?.destroy();
        this._menu = null;
        this._wmPrefs = null;
        this.actor.destroy();
    }
}
