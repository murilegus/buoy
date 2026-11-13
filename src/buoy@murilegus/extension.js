import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {WindowCorners} from './corners.js';
import {applyGnomeDefaults, reworkPanel, setClusterBackground, setContrast, setLeftEmpty} from './panel.js';
import {GNOME_CLOCK, GNOME_DOCK, GNOME_WEATHER, lingerMs} from './lib/kit/model/settings.js';
import {Island} from './lib/kit/ui/island.js';
import {IdleContent} from './lib/kit/services/idle.js';
import {forgetStarts, setMascotRest} from './lib/kit/ui/present/motion.js';
import {ActivityStack} from './lib/kit/model/stack.js';
import {Registry, profileDir, slugOf} from './lib/kit/services/registry.js';
import {BuoyDBus} from './lib/kit/services/dbus.js';
import {reloadModule} from './lib/kit/services/devtools.js';
import {loadStyle, unloadStyle} from './lib/kit/ui/styles.js';

import media from './lib/modules/media/index.js';
import notification from './lib/modules/notification/index.js';
import hud from './lib/modules/hud/index.js';
import home from './lib/modules/home/index.js';
import progress from './lib/modules/progress/index.js';
import timer from './lib/modules/timer/index.js';
import calendar from './lib/modules/calendar/index.js';
import device from './lib/modules/device/index.js';
import input from './lib/modules/input/index.js';
import agent from './lib/modules/agent/index.js';
import clipboard from './lib/modules/clipboard/index.js';
import copied from './lib/modules/copied/index.js';
import clock from './lib/modules/clock/index.js';
import weather from './lib/modules/weather/index.js';
import greeting from './lib/modules/greeting/index.js';

// Static import list (EGO: no runtime code loading). Enabled set comes from GSettings.
// Order is also the tab strip's order (SPEC §2b).
const MODULES = [media, notification, progress, timer, hud, home, input, agent, calendar, device, copied, clipboard, clock, weather, greeting];

export default class BuoyExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        // set before the panel is reworked, so a fixed text never starts a decode
        const contrast = () => setContrast(this._settings.get_string('cluster-contrast'));
        contrast();
        reworkPanel(true);
        applyGnomeDefaults(this._settings, GNOME_CLOCK, 'clock-defaults-applied');
        applyGnomeDefaults(this._settings, GNOME_DOCK, 'dock-defaults-applied');
        applyGnomeDefaults(this._settings, GNOME_WEATHER, 'weather-defaults-applied');
        const background = () => setClusterBackground({
            mode: this._settings.get_string('cluster-background'),
            radius: this._settings.get_int('cluster-radius'),
            opacity: this._settings.get_int('cluster-opacity'),
        });
        background();
        const leftEmpty = () => setLeftEmpty(this._settings.get_string('left-cluster-empty'));
        leftEmpty();
        // every handler is tied to `this`: disable() drops them with disconnectObject(this)
        this._settings.connectObject('changed', (_s, key) => {
            if (key === 'cluster-contrast')
                contrast();
            else if (key.startsWith('cluster-'))
                background();
            else if (key === 'left-cluster-empty')
                leftEmpty();
        }, this);

        this._corners = new WindowCorners(this._settings);

        this._island = new Island();
        Main.layoutManager.addTopChrome(this._island.actor, {trackFullscreen: true});
        const reposition = () => this._island.reposition({
            expandedWidth: this._settings.get_int('expanded-width'),
        });
        reposition();
        Main.layoutManager.connectObject('monitors-changed', reposition, this);
        this._settings.connectObject('changed::expanded-width', reposition, this);
        // the pill follows the em (docs/design "Đơn vị là em"): a font or Large Text change
        // restyles the theme, then the bar takes its new 2.75em
        St.ThemeContext.get_for_stage(global.stage).connectObject('changed', reposition, this);
        Main.panel.connectObject('notify::height', reposition, this);
        const rest = () => setMascotRest(this._settings.get_int('mascot-rest-after'));
        this._settings.connectObject('changed::mascot-rest-after', rest, this);
        rest();

        // apps-hidden / apps-plain may name an app any way a source does: slug them
        const slugs = key => this._settings.get_strv(key).map(slugOf);
        this._registry = new Registry();
        this._registry.setPlain(slugs('apps-plain'));
        this._registry.watch(profileDir(), errors => {
            for (const {file, message} of errors)
                console.warn(`Buoy: ignoring app profile ${file}: ${message}`);
        });
        this._settings.connectObject('changed::apps-plain',
            () => this._registry.setPlain(slugs('apps-plain')), this);
        this._stack = new ActivityStack(this._island, {hiddenApps: slugs('apps-hidden')});
        // the island fits 2 or 3 pills before the system cluster; the stack re-renders
        this._island.onCapacityChanged = () => this._stack?.refresh();
        // the pointer on a pill holds its ttl (SPEC §2e)
        this._island.onHold = (id, held) => this._stack?.hold(id, held);
        // one wait for every activity that only waits (kit activity.js DEFAULT_LINGER)
        const linger = () => this._stack.setLinger(lingerMs(this._settings.get_string('activity-linger')));
        linger();
        this._settings.connectObject('changed::activity-linger', linger,
            'changed::apps-hidden', () => this._stack.setHiddenApps(slugs('apps-hidden')), this);
        // Fullscreen (FEATURES M1): Shell hides top chrome on a monitor with a fullscreen
        // window (trackFullscreen, ui/layout.js _updateActorVisibility; shown again in the
        // Overview). Hidden is "unseen": endings count as missed, nothing opens.
        const seen = () => this._stack.setUnseen(!this._island.actor.visible);
        this._island.actor.connectObject('notify::visible', seen, this);
        seen();
        this._dbus = new BuoyDBus(this._stack, {registry: this._registry});
        this._dbus.export();

        // the tab strip (SPEC §2b): read per open, so nothing needs a settings signal
        this._island.tabs = {
            modules: [],
            settings: () => ({
                slot: this._settings.get_string('tabs-slot'),
                pinned: this._settings.get_strv('tabs-pinned'),
                // the greeting's part of the day (kit/model/daypart.js)
                daypart: this._settings.get_value('daypart-starts').deepUnpack(),
            }),
            onSlot: id => this._settings.set_string('tabs-slot', id),
            onPrefs: () => this.openPreferences(),
            gsettings: this._settings,   // Home's blocks read their keys (SPEC §3)
        };
        this._island.missed = {
            list: () => this._stack?.missed ?? [],
            flags: () => this._stack?.missedFlags ?? [],   // a source's own unseen (notifications), Home's Missed
            seen: () => this._stack?.seeMissed(),
            open: (id, at) => this._stack?.openMissed(id, at),
            clear: () => this._stack?.clearMissed(),
        };
        this.stack = this._stack; // Looking Glass

        // modules-<id> applies at once (prefs, gsettings): start or stop that module only,
        // so the other modules' and D-Bus callers' activities stay
        this._active = [];
        this._idle = null;
        this._syncModules();
        // idle-content (SPEC §2a): the running modules' idle plans
        this._idle = new IdleContent(this._island, this._settings,
            () => (this._active ?? []).map(a => a.m).filter(m => m.idle));
        this._settings.connectObject('changed', (_s, key) => {
            if (key.startsWith('modules-'))
                this._syncModules();
        }, this);

        // Super+B (SPEC §2c). POPUP too, like Shell's own toggles (ui/windowManager.js
        // toggle-quick-settings), so the same key lets go while the island holds it.
        Main.wm.addKeybinding('keybind-focus', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => this._island.toggleKeyboard());

        // Dev: Main.extensionManager.lookup('buoy@murilegus').stateObj.reload('media')
        const devMode = () => {
            this.reload = this._settings.get_boolean('dev-mode') ? id => reloadModule(this, id) : null;
        };
        devMode();
        this._settings.connectObject('changed::dev-mode', devMode, this);
    }

    // _active: every running module, {m, src, style} (src null without a source, style
    // null without a stylesheet.css); devtools.js reloadModule() swaps one entry
    _syncModules() {
        for (const m of MODULES) {
            const on = this._settings.get_boolean(`modules-${m.id}`);
            const running = this._active.find(a => a.m.id === m.id);
            if (on && !running)
                this._startModule(m);
            else if (!on && running)
                this._stopModule(running);
        }
        const ids = new Set(this._active.map(a => a.m.id));
        this._island.tabs.modules = MODULES.filter(m => ids.has(m.id));
        this._idle?.sync();   // a plan's module turned on or off
    }

    _startModule(m) {
        for (const kind of m.kinds)
            this._registry.register(kind, m.adapter, m.apps ?? {});
        let src = null;
        if (m.source) {
            src = new m.source();
            // dbus: the agent module answers D-Bus `Agent` (kit/services/dbus.js setAgent);
            // extension: this, for a source that needs Buoy's own metadata or prefs (the
            // greeting) — not Extension.lookupByURL (EGO review)
            src.enable(this._stack, this._registry, this._settings, {dbus: this._dbus, extension: this});
        }
        this._active.push({m, src, style: this._loadStyle(m.id)});
    }

    // its own CSS while it runs (kit/ui/styles.js, ARCHITECTURE "Stylesheets")
    _loadStyle(id) {
        return loadStyle(this.dir, id);
    }

    // A source ends what it surfaced in disable() (kit/services/source.js).
    _stopModule(entry) {
        entry.src?.disable();
        for (const kind of entry.m.kinds)
            this._registry.unregister(kind);
        unloadStyle(entry.style);
        this._active = this._active.filter(a => a !== entry);
    }

    disable() {
        forgetStarts();         // the next enable's stack counts its surfaces from 1 again
        Main.wm.removeKeybinding('keybind-focus');
        for (const entry of [...this._active ?? []])
            this._stopModule(entry);
        this._active = null;
        this._dbus?.unexport();
        this._dbus = null;
        this._settings.disconnectObject(this);
        this._island?.actor.disconnectObject(this);
        this._stack?.destroy();
        this._stack = null;
        this.stack = null;
        this.reload = null;
        this._registry?.destroy();
        this._registry = null;

        Main.layoutManager.disconnectObject(this);
        St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);
        Main.panel.disconnectObject(this);
        this._idle?.destroy();
        this._idle = null;
        if (this._island) {
            Main.layoutManager.removeChrome(this._island.actor);
            this._island.destroy();
            this._island = null;
        }
        this._corners?.destroy();
        this._corners = null;
        reworkPanel(false);
        this._settings = null;
    }
}
