import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {reworkPanel, setClusterBackground} from './panel.js';
import {Island} from './lib/kit/island.js';
import {ActivityStack} from './lib/kit/stack.js';
import {Registry, profileDir, slugOf} from './lib/kit/registry.js';
import {BuoyDBus} from './lib/kit/dbus.js';
import {reloadModule} from './lib/kit/devtools.js';

import media from './lib/modules/media/index.js';
import notification from './lib/modules/notification/index.js';
import hud from './lib/modules/hud/index.js';
import home from './lib/modules/home/index.js';
import progress from './lib/modules/progress/index.js';
import timer from './lib/modules/timer/index.js';
import calendar from './lib/modules/calendar/index.js';
import copied from './lib/modules/copied/index.js';
import layout from './lib/modules/layout/index.js';
import ask from './lib/modules/ask/index.js';
import clipboard from './lib/modules/clipboard/index.js';

// Static import list (EGO: no runtime code loading). Enabled set comes from GSettings.
// Order is also the tab strip's order (SPEC §2b).
const MODULES = [media, notification, progress, timer, hud, home, copied, layout, ask, calendar, clipboard];

export default class BuoyExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        reworkPanel(true);
        const background = () => setClusterBackground(this._settings.get_string('cluster-background'));
        background();
        this._backgroundId = this._settings.connect('changed::cluster-background', background);

        this._island = new Island();
        Main.layoutManager.addTopChrome(this._island.actor, {trackFullscreen: true});
        const reposition = () => this._island.reposition({
            expandedWidth: this._settings.get_int('expanded-width'),
        });
        reposition();
        this._monitorsId = Main.layoutManager.connect('monitors-changed', reposition);
        this._widthId = this._settings.connect('changed::expanded-width', reposition);

        // apps-hidden / apps-plain may name an app any way a source does: slug them
        const slugs = key => this._settings.get_strv(key).map(slugOf);
        this._registry = new Registry();
        this._registry.setPlain(slugs('apps-plain'));
        this._registry.watch(profileDir(), errors => {
            for (const {file, message} of errors)
                console.warn(`Buoy: ignoring app profile ${file}: ${message}`);
        });
        this._plainId = this._settings.connect('changed::apps-plain',
            () => this._registry.setPlain(slugs('apps-plain')));
        this._stack = new ActivityStack(this._island, {hiddenApps: slugs('apps-hidden')});
        // the island fits 2 or 3 pills before the system cluster; the stack re-renders
        this._island.onCapacityChanged = () => this._stack?.refresh();
        this._hiddenId = this._settings.connect('changed::apps-hidden',
            () => this._stack.setHiddenApps(slugs('apps-hidden')));
        // Fullscreen (FEATURES M1): Shell hides top chrome on a monitor with a fullscreen
        // window (trackFullscreen, ui/layout.js _updateActorVisibility; shown again in the
        // Overview). Hidden is "unseen": endings count as missed, nothing opens.
        const seen = () => this._stack.setUnseen(!this._island.actor.visible);
        this._visibleId = this._island.actor.connect('notify::visible', seen);
        seen();
        this._dbus = new BuoyDBus(this._stack, {registry: this._registry});
        this._dbus.export();

        // the tab strip (SPEC §2b): read per open, so nothing needs a settings signal
        this._island.tabs = {
            modules: [],
            settings: () => ({
                slot: this._settings.get_string('tabs-slot'),
                pinned: this._settings.get_strv('tabs-pinned'),
            }),
            onSlot: id => this._settings.set_string('tabs-slot', id),
            onPrefs: () => this.openPreferences(),
        };
        this._island.missed = {
            list: () => this._stack?.missed ?? [],
            seen: () => this._stack?.seeMissed(),
            open: (id, at) => this._stack?.openMissed(id, at),
            clear: () => this._stack?.clearMissed(),
        };
        this.stack = this._stack; // Looking Glass

        // modules-<id> applies at once (prefs, gsettings): start or stop that module only,
        // so the other modules' and D-Bus callers' activities stay
        this._active = [];
        this._syncModules();
        this._modulesId = this._settings.connect('changed', (_s, key) => {
            if (key.startsWith('modules-'))
                this._syncModules();
        });

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
        this._devId = this._settings.connect('changed::dev-mode', devMode);
    }

    // _active: every running module, {m, src} (src null without a source); devtools.js
    // reloadModule() swaps one entry
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
    }

    _startModule(m) {
        for (const kind of m.kinds)
            this._registry.register(kind, m.adapter, m.apps ?? {});
        let src = null;
        if (m.source) {
            src = new m.source();
            src.enable(this._stack, this._registry);
        }
        this._active.push({m, src});
    }

    // A source ends what it surfaced in disable() (kit/source.js).
    _stopModule(entry) {
        entry.src?.disable();
        for (const kind of entry.m.kinds)
            this._registry.unregister(kind);
        this._active = this._active.filter(a => a !== entry);
    }

    disable() {
        Main.wm.removeKeybinding('keybind-focus');
        for (const entry of [...this._active ?? []])
            this._stopModule(entry);
        this._active = null;
        this._dbus?.unexport();
        this._dbus = null;
        for (const id of [this._hiddenId, this._plainId, this._modulesId, this._widthId, this._devId, this._backgroundId]) {
            if (id)
                this._settings.disconnect(id);
        }
        this._hiddenId = this._plainId = this._modulesId = this._widthId = this._devId = this._backgroundId = 0;
        if (this._visibleId) {
            this._island.actor.disconnect(this._visibleId);
            this._visibleId = 0;
        }
        this._stack?.destroy();
        this._stack = null;
        this.stack = null;
        this.reload = null;
        this._registry?.destroy();
        this._registry = null;

        if (this._monitorsId) {
            Main.layoutManager.disconnect(this._monitorsId);
            this._monitorsId = 0;
        }
        if (this._island) {
            Main.layoutManager.removeChrome(this._island.actor);
            this._island.destroy();
            this._island = null;
        }
        reworkPanel(false);
        this._settings = null;
    }
}
