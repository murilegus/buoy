import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';

import {clusterFill, fallbackIcons, leftCluster} from './lib/kit/cluster.js';
import {contrastFor, spanLuminance} from './lib/kit/contrast.js';
import {gnomeDefaults} from './lib/kit/settings.js';
import {TrayGlyphs} from './glyphs.js';
import {reachUnderBar, wallpaperUnderBar} from './reach.js';
import {Wallpaper} from './wallpaper.js';

// cluster-background, -radius, -opacity (SPEC §1). St has no CSS variables, so the
// background is the box's inline style, repainted when the look, its hover or the
// panel's foreground changes.
let look = {mode: 'hover', radius: 16, opacity: 17};

// What reworkPanel(true) changed on the left box, to put back on disable.
let saved = null;

// The left cluster's own content (SPEC §1), first in _leftBox while enabled.
let left = null;

// The system cluster (SPEC §1, 2026-11-02): quick settings + clock, last in _rightBox.
let system = null;

// cluster-contrast (SPEC §1, 2026-11-04): auto | dark-text | light-text. The wallpaper is
// watched and decoded only while `auto` and enabled.
let contrastMode = 'auto';
let wallpaper = null;
const TEXT = ['dark-text', 'light-text'];

// One-colour bitmap tray icons tinted with the text (glyphs.js); made the first time the
// right side turns dark-text, so a dark wallpaper reads no icon at all.
let glyphs = null;

// The boxes that draw the cluster background.
const clusters = () => [Main.panel._leftBox, system?.actor].filter(Boolean);

// The two sides whose text follows the wallpaper under them: the left box, and the right
// one (the tray and the system cluster, Ethan 2026-11-04: the tray follows too).
const sides = () => [Main.panel._leftBox, Main.panel._rightBox];

/**
 * SPEC §1: transparent panel; left cluster = focused app or workspace (LeftCluster);
 * right = the tray, bare, then the system cluster (SystemCluster).
 *
 * @param {boolean} on  apply (enable) or revert (disable)
 */
export function reworkPanel(on) {
    const panel = Main.panel;
    const {activities} = panel.statusArea;
    const box = panel._leftBox;

    if (on) {
        panel.add_style_class_name('buoy');
        panel._rightBox.add_style_class_name('buoy-tray');
        // the bar is see-through: the Overview's backgrounds must grow under it (reach.js)
        reachUnderBar(true, () => applyContrast());
        activities.container.hide();
        saved = {reactive: box.reactive, track_hover: box.track_hover, visible: box.visible, inline: box.get_style()};
        left = new LeftCluster(box);
        box.insert_child_at_index(left.actor, 0);
        // St only sets :hover on a widget that tracks it, and only a reactive actor gets
        // the crossing events (st-widget.c st_widget_enter); _leftBox is neither.
        box.reactive = box.track_hover = true;
        box.add_style_class_name('buoy-cluster');
        followEmpty(box, saved);
        markTray(panel._rightBox, saved);
        saved.hover = box.connect('notify::hover', paint);
        system = new SystemCluster(panel);
        // a theme change or the contrast's text recolours the buttons, and so the fill
        const qs = panel.statusArea.quickSettings;
        saved.styleChanged = [[qs, qs.connect('style-changed', repaintAll)],
            [left.actor, left.actor.connect('style-changed', repaintAll)]];
        // where each side sits, and the Overview's dark backdrop, decide its text
        saved.contrast = [
            ...sides().map(b => [b, b.connect('notify::allocation', applyContrast)]),
            [Main.overview, Main.overview.connect('showing', applyContrast)],
            [Main.overview, Main.overview.connect('hidden', applyContrast)],
        ];
        setContrast(contrastMode);
        repaintAll();
    } else {
        for (const [obj, id] of [...saved.styleChanged, ...saved.contrast])
            obj.disconnect(id);
        wallpaper?.destroy();
        wallpaper = null;
        glyphs?.destroy();
        glyphs = null;
        for (const b of sides())
            TEXT.forEach(t => b.remove_style_class_name(`buoy-${t}`));
        system.destroy();
        system = null;
        left.destroy();
        left = null;
        box.disconnect(saved.hover);
        unfollowEmpty(box, saved);
        unmarkTray(panel._rightBox, saved);
        box.remove_style_class_name('buoy-cluster');
        box.set_style(saved.inline);
        box.reactive = saved.reactive;
        box.track_hover = saved.track_hover;
        box.visible = saved.visible;
        saved = null;
        activities.container.show();
        reachUnderBar(false);
        panel._rightBox.remove_style_class_name('buoy-tray');
        panel.remove_style_class_name('buoy');
    }
}

/**
 * @param {object} next
 * @param {string} next.mode  `cluster-background`: never | hover | always
 * @param {number} next.radius  `cluster-radius`, px
 * @param {number} next.opacity  `cluster-opacity`, percent
 */
export function setClusterBackground(next) {
    look = next;
    repaintAll();
}

function repaintAll() {
    clusters().forEach(paint);
}

/**
 * @param {string} mode  `cluster-contrast`: auto | dark-text | light-text
 */
export function setContrast(mode) {
    contrastMode = mode;
    if (!saved)
        return;                 // applied by reworkPanel(true)
    if (mode === 'auto' && !wallpaper) {
        wallpaper = new Wallpaper(applyContrast);
    } else if (mode !== 'auto' && wallpaper) {
        wallpaper.destroy();
        wallpaper = null;
    }
    applyContrast();
}

// Each side gets the text its stretch of the wallpaper wants (kit/contrast.js); the class
// only changes when the answer does, so a relayout costs a few additions.
function applyContrast() {
    const mon = Main.layoutManager.primaryMonitor;
    for (const box of sides()) {
        const [x] = box.get_transformed_position();
        const x0 = x - (mon?.x ?? 0);
        const l = spanLuminance(wallpaper?.profile ?? null, x0, x0 + box.width);
        // the Overview's dark backdrop only once it is what shows under the bar (reach.js)
        const text = contrastFor(contrastMode, l, Main.overview.visible && !wallpaperUnderBar());
        for (const t of TEXT) {
            if (t === text)
                box.add_style_class_name(`buoy-${t}`);
            else
                box.remove_style_class_name(`buoy-${t}`);
        }
        if (box !== Main.panel._rightBox)
            continue;
        if (text === 'dark-text' && !glyphs && system)
            glyphs = new TrayGlyphs(box, system.actor);
        glyphs?.setText(text);
    }
}

/**
 * Once per install, per group: GNOME's own keys get Buoy's defaults where the user never
 * set them (kit/settings.js gnomeDefaults) — the clock (the time alone, 24-hour) and Ubuntu
 * Dock (bottom, hiding, 32 px, primary display; Ethan 2026-11-04). The values are shared
 * with Settings, which shows the same keys; nothing is reverted on disable (the lock
 * screen disables Buoy too). A group whose schema is not installed writes nothing.
 *
 * @param {Gio.Settings} settings  Buoy's
 * @param {object[]} entries  GNOME_CLOCK, GNOME_DOCK or GNOME_WEATHER
 * @param {string} flag  the Buoy key recording it was done
 */
export function applyGnomeDefaults(settings, entries, flag) {
    if (settings.get_boolean(flag))
        return;
    const source = Gio.SettingsSchemaSource.get_default();
    const installed = entries.filter(e => source?.lookup(e.schema, true)?.has_key(e.key));
    const open = new Map();
    const of = schema => {
        if (!open.has(schema))
            open.set(schema, new Gio.Settings({schema_id: schema}));
        return open.get(schema);
    };
    for (const {schema, key, value} of gnomeDefaults(installed, e => of(e.schema).get_user_value(e.key) !== null)) {
        if (typeof value === 'boolean')
            of(schema).set_boolean(key, value);
        else if (typeof value === 'number')
            of(schema).set_int(key, value);
        else
            of(schema).set_string(key, value);
    }
    settings.set_boolean(flag, true);
}

/**
 * @param {string} mode  `left-cluster-empty`: workspace | hidden
 */
export function setLeftEmpty(mode) {
    left?.setEmpty(mode);
}

// The stylesheet's transition-duration fades the change in both directions.
// Filled as GNOME fills a panel button, so it reads like a tray button's hover: the
// cluster's own foreground (the theme's, or the contrast's text) at kit/cluster.js
// clusterFill's alpha. The system cluster keeps it, a step up, while its
// menu is open, as a panel button stays :checked (its own highlight is off, see the
// stylesheet).
function paint(box) {
    const open = box === system?.actor && system.open;
    const alpha = clusterFill(look, {hover: box.hover, open});
    const button = box === system?.actor ? Main.panel.statusArea.quickSettings : left?.actor;
    const fg = button?.peek_theme_node()?.get_foreground_color();
    const [r, g, b] = fg ? [fg.red, fg.green, fg.blue] : [255, 255, 255];
    box.set_style(`border-radius: ${look.radius}px; background-color: rgba(${r}, ${g}, ${b}, ${alpha});`);
}

// [ᯤ ⌁ ▮  Fri 2:13] — Shell's quick settings indicators and the clock as one button
// (SPEC §1, 2026-11-02): a press anywhere opens quick settings. The clock keeps its menu
// for Super+V / Super+M (Panel.toggleCalendar needs it reactive, ui/panel.js _toggleMenu),
// so instead of going non-reactive it loses its own click gesture, hover and focus, and a
// press on it reaches this box. With a panel menu open, hovering (or focusing) another
// button switches to that button's menu (PopupMenuManager _onCapturedEvent / key focus →
// _findMenuForSource): the clock is left out of that, so the calendar opens from Super+V
// only. Its unread dot leaves the layout: the buoy light says "missed" (§2a). Everything
// goes back on destroy().
class SystemCluster {
    constructor(panel) {
        const {quickSettings, dateMenu} = panel.statusArea;
        this._qs = quickSettings;
        this._clock = dateMenu;
        this.actor = new St.BoxLayout({
            style_class: 'buoy-cluster buoy-system', reactive: true, track_hover: true,
            y_align: Clutter.ActorAlign.FILL,
        });

        // where the two containers lived (after which sibling: indicators added since
        // shift indices), and what the clock had, to put back
        this._home = [quickSettings, dateMenu].map(b => ({
            parent: b.container.get_parent(), prev: b.container.get_previous_sibling(),
        }));
        this._right = panel._rightBox;
        this._clockWas = {
            gesture: dateMenu._clickGesture?.enabled ?? false,
            track_hover: dateMenu.track_hover, can_focus: dateMenu.can_focus,
        };
        const dot = dateMenu._indicator;
        this._dot = dot && dot.get_parent() ? {dot, box: dot.get_parent(), pad: dot.get_parent().get_first_child()} : null;

        this._place();
        dateMenu._clickGesture?.set_enabled(false);
        dateMenu.track_hover = false;
        dateMenu.can_focus = false;
        if (this._dot) {
            this._dot.box.remove_child(this._dot.pad);
            this._dot.box.remove_child(this._dot.dot);
        }

        // the panel's menu manager: hover/focus never lands on the calendar
        const manager = panel.menuManager;
        this._manager = manager;
        // another extension may have wrapped it on the instance already: keep theirs
        this._ownFind = Object.hasOwn(manager, '_findMenuForSource') ? manager._findMenuForSource : null;
        const find = manager._findMenuForSource;
        manager._findMenuForSource = function (source) {
            const menu = find.call(this, source);
            return menu === dateMenu.menu ? null : menu;
        };

        this._gesture = new Clutter.ClickGesture();
        this._gesture.set_recognize_on_press(true);
        this._gesture.connect('recognize', () => quickSettings.menu.toggle());
        this.actor.add_action(this._gesture);

        const repaint = () => paint(this.actor);
        this._ids = [
            [this.actor, this.actor.connect('notify::hover', repaint)],
            [quickSettings.menu, quickSettings.menu.connect('open-state-changed', repaint)],
            [dateMenu.menu, dateMenu.menu.connect('open-state-changed', repaint)],
            // a session-mode change re-adds every indicator to its stock box
            // (Panel._updatePanel → _addToPanelBox); take ours back after it
            [Main.sessionMode, Main.sessionMode.connect('updated', () => this._place())],
        ];
    }

    get open() {
        return this._qs.menu.isOpen || this._clock.menu.isOpen;
    }

    _place() {
        for (const b of [this._qs, this._clock]) {
            if (b.container.get_parent() === this.actor)
                continue;
            b.container.get_parent()?.remove_child(b.container);
            this.actor.add_child(b.container);
        }
        if (this.actor.get_parent() !== this._right)
            this._right.add_child(this.actor);
        else if (this._right.get_last_child() !== this.actor)
            this._right.set_child_above_sibling(this.actor, null);
    }

    destroy() {
        for (const [obj, id] of this._ids)
            obj.disconnect(id);
        this._ids = [];
        if (this._ownFind)
            this._manager._findMenuForSource = this._ownFind;
        else
            delete this._manager._findMenuForSource; // the prototype's again
        this.actor.remove_action(this._gesture);
        const clock = this._clock;
        clock._clickGesture?.set_enabled(this._clockWas.gesture);
        clock.track_hover = this._clockWas.track_hover;
        clock.can_focus = this._clockWas.can_focus;
        if (this._dot) {
            this._dot.box.insert_child_at_index(this._dot.pad, 0);
            this._dot.box.add_child(this._dot.dot);
        }
        [this._qs, this._clock].forEach((b, i) => {
            const {parent, prev} = this._home[i];
            this.actor.remove_child(b.container);
            if (!parent)
                return;
            if (prev?.get_parent() === parent)
                parent.insert_child_above(b.container, prev);
            else
                parent.insert_child_at_index(b.container, prev ? parent.get_n_children() : 0);
        });
        this.actor.destroy();
    }
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

// The tray's plain buttons, whose highlight follows the text (stylesheet
// .buoy-tray-button; St has no :not()). GNOME's filled indicators keep their own coloured
// highlight, and the system cluster's pieces have none: quick settings and the clock are
// never marked, though they pass through this box (before SystemCluster takes them, and
// on every session-mode update, Panel._updatePanel).
const FILLED = ['screen-recording-indicator', 'screen-sharing-indicator'];
const trayButton = c => {
    const b = c.get_first_child?.();
    const {quickSettings, dateMenu} = Main.panel.statusArea;
    if (!b?.has_style_class_name?.('panel-button') || b === quickSettings || b === dateMenu)
        return null;
    return FILLED.some(f => b.has_style_class_name(f)) ? null : b;
};

function markTray(box, state) {
    const mark = c => trayButton(c)?.add_style_class_name('buoy-tray-button');
    box.get_children().forEach(mark);
    state.trayAdded = box.connect('child-added', (_b, c) => mark(c));
}

function unmarkTray(box, state) {
    box.disconnect(state.trayAdded);
    box.get_children().forEach(c => trayButton(c)?.remove_style_class_name('buoy-tray-button'));
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

// [▣ app · ⊞ 2] or [⊞ 2] (kit/cluster.js decides). Click toggles the Overview,
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
        // the word the label leaves out (SPEC §1), for screen readers
        if (plan.icon === 'grid')
            this.actor.accessible_name = `Workspace ${plan.text}`;
        else
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
