import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GLibUnix from 'gi://GLibUnix';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Source} from '../../kit/source.js';
import {isFnLockLed, ledOn} from './adapter.js';

const ID = 'hud';

// the extension's root: this file is <root>/lib/modules/hud/source.js
const ROOT = import.meta.url.split('/').slice(0, -4).join('/');
const LOCK_ICONS = {
    caps: `${ROOT}/icons/caps-lock-symbolic.svg`,
    num: `${ROOT}/icons/num-lock-symbolic.svg`,
    fn: `${ROOT}/icons/fn-lock-symbolic.svg`,
};
const LEDS = '/sys/class/leds';
const STORM = 20;           // more wake-ups than this in a second: the watch gives up

/**
 * Every OSD GNOME shows goes through Main.osdWindowManager: gsd-media-keys' volume, mic,
 * brightness, keyboard backlight (keys and the firmware's Fn), touchpad, airplane,
 * bluetooth, rotation, eject and "unavailable" via ShellDBus ShowOSD → showOne/showAll
 * (ui/shellDBus.js); Shell's own volume scroll (ui/status/volume.js showOSD → showAll),
 * display brightness (misc/brightnessManager.js _showOSD → show) and mutter's privacy
 * screen (windowManager.js show-osd → showOne). In ui/osdWindow.js showOne calls show,
 * but showAll goes straight to the private _showOsdWindow, so both public entries are
 * overridden.
 * With `hud-replace-osd` on it surfaces one feedback pill and the stock window stays
 * hidden; off, GNOME's own shows and nothing lands here. Caps Lock and Num Lock have
 * no OSD in GNOME: Buoy watches the keymap's `state-changed` (clutter-keymap.c), as
 * ui/shellEntry.js CapsLockWarning does. Fn Lock neither: where the kernel driver
 * exposes it as an LED `*::fnlock` with brightness_hw_changed (ideapad-laptop, from its
 * WMI Fn-keys event), the LED core sysfs_notify()s that file, so one POLLPRI watch on it
 * wakes Buoy on each toggle (Documentation/ABI/testing/sysfs-class-led). No polling;
 * disable() restores show() and drops the watch.
 */
export class OsdSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._injections = new InjectionManager();
        // on the prototype: restoreMethod puts the original back where it was, so nothing
        // is left on Main.osdWindowManager once the module goes (extension.js
        // InjectionManager); the manager is a singleton, called through `osd`
        const osd = Main.osdWindowManager;
        const proto = Object.getPrototypeOf(osd);
        this._injections.overrideMethod(proto, 'show', original => (icon, label, levels) => {
            if (!this._replacing())
                return original.call(osd, icon, label, levels);
            return this._osd(icon, label, levels);
        });
        this._injections.overrideMethod(proto, 'showAll', original => (icon, label, level, maxLevel) => {
            if (!this._replacing())
                return original.call(osd, icon, label, level, maxLevel);
            return this._osd(icon, label, {[Main.layoutManager.primaryIndex]: {level, maxLevel}});
        });

        this._keymap = Clutter.get_default_backend().get_default_seat().get_keymap();
        this._caps = this._keymap.get_caps_lock_state();
        this._num = this._keymap.get_num_lock_state();
        this._keymapId = this._keymap.connect('state-changed', () => this._locks());
        this._watchFnLock();
    }

    // Read-only and event-driven: a watch on brightness_hw_changed, re-armed by reading it.
    _watchFnLock() {
        let name = null;
        try {
            const children = Gio.File.new_for_path(LEDS).enumerate_children('standard::name',
                Gio.FileQueryInfoFlags.NONE, null);
            for (let info; !name && (info = children.next_file(null));)
                name = isFnLockLed(info.get_name()) ? info.get_name() : null;
            children.close(null);
        } catch {
            return;                       // no LED class: nothing to watch
        }
        if (!name)
            return;
        try {
            this._fnStream = Gio.File.new_for_path(`${LEDS}/${name}/brightness_hw_changed`).read(null);
        } catch {
            return;                       // the driver gives no change events
        }
        this._fnOn = ledOn(readFile(`${LEDS}/${name}/brightness`));
        this._readFnChange();             // arm: sysfs wakes a reader once per change
        let burst = 0, since = GLib.get_monotonic_time();
        this._fnId = GLibUnix.fd_add_full(GLib.PRIORITY_DEFAULT, this._fnStream.get_fd(),
            GLib.IOCondition.PRI | GLib.IOCondition.ERR, () => {
                const now = GLib.get_monotonic_time();
                if (now - since > 1e6) {
                    since = now;
                    burst = 0;
                }
                if (++burst > STORM) {   // a file that never settles: stop, never spin
                    this._fnId = 0;
                    return GLib.SOURCE_REMOVE;
                }
                const on = this._readFnChange();
                if (on !== null && on !== this._fnOn) {
                    this._fnOn = on;
                    this._lock('fn', on);
                }
                return GLib.SOURCE_CONTINUE;
            });
    }

    _readFnChange() {
        try {
            this._fnStream.seek(0, GLib.SeekType.SET, null);
            const bytes = this._fnStream.read_bytes(16, null).toArray();
            return ledOn(new TextDecoder().decode(bytes));
        } catch {
            return null;                  // ENODATA until the first change
        }
    }

    _replacing() {
        return this._stack !== null && this._settings?.get_boolean('hud-replace-osd') !== false;
    }

    _osd(icon, label, levels) {
        const at = levels?.[Main.layoutManager.primaryIndex] ??
            Object.values(levels ?? {}).find(l => l) ?? null;
        const maxLevel = at?.maxLevel > 0 ? at.maxLevel : 1;
        this._show({
            iconName: nameOf(icon), gicon: icon ?? null, label: label ?? null,
            level: typeof at?.level === 'number' ? at.level : null, maxLevel,
        });
    }

    _locks() {
        const caps = this._keymap.get_caps_lock_state();
        const num = this._keymap.get_num_lock_state();
        if (caps !== this._caps)
            this._lock('caps', caps);
        if (num !== this._num)
            this._lock('num', num);
        this._caps = caps;
        this._num = num;
    }

    _lock(which, on) {
        const gicon = new Gio.FileIcon({file: Gio.File.new_for_uri(LOCK_ICONS[which])});
        this._show({lock: which, on, iconName: `${which}-lock-symbolic`, gicon});
    }

    _show(ev) {
        if (!this._stack)
            return;
        const a = this._registry?.build('osd', 'system', {id: ID, open: openPanel, ...ev});
        if (!a)
            return;
        // one pill for every feedback: a repeat (holding a key) updates it and restarts
        // its ttl, another kind replaces it in place (SPEC §2e)
        if (this._stack.has(a.id) && this._stack.update(a.id, a))
            return;
        this._stack.surface(a);
    }

    disable() {
        this._injections?.clear();
        this._injections = null;
        if (this._keymapId)
            this._keymap.disconnect(this._keymapId);
        this._keymapId = 0;
        this._keymap = null;
        if (this._fnId)
            GLib.source_remove(this._fnId);
        this._fnId = 0;
        this._fnStream?.close(null);
        this._fnStream = null;
        if (this._stack?.has(`osd:system:${ID}`))
            this._stack.end(`osd:system:${ID}`);
        super.disable();
    }
}

function readFile(path) {
    try {
        return new TextDecoder().decode(Gio.File.new_for_path(path).load_contents(null)[1]);
    } catch {
        return null;
    }
}

// The icon's name for the adapter to tell volume from brightness: a ThemedIcon's first
// name (Shell builds them from one name), else its serialised form.
function nameOf(icon) {
    if (!icon)
        return '';
    if (icon instanceof Gio.ThemedIcon)
        return icon.get_names()[0] ?? '';
    return icon.to_string?.() ?? '';
}

// A click on a level opens its Settings panel, as Shell's own menus do
// (ui/status/volume.js: Shell.AppSystem lookup_app('gnome-sound-panel.desktop')).
function openPanel(desktopId) {
    const app = Shell.AppSystem.get_default().lookup_app(desktopId);
    if (!app)
        return;
    Main.overview.hide();
    app.activate();
}
