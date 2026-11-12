import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GLibUnix from 'gi://GLibUnix';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import {listNames, readText} from '../../kit/services/files.js';
import {Source} from '../../kit/services/source.js';
import {isFnLockLed, ledOn} from './adapter.js';

const ID = 'hud';

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

        // Quick Settings builds its indicators asynchronously (ui/panel.js
        // _setupIndicators): if the sliders are not there yet, hook them the first time
        // the menu opens — the only time they can be dragged
        if (!this._feedbackOnVolumeSliders()) {
            const qs = Main.panel.statusArea.quickSettings;
            qs?.menu.connectObject('open-state-changed', (_m, open) => {
                if (open && this._feedbackOnVolumeSliders())
                    qs.menu.disconnectObject(this);
            }, this);
        }

        this._keymap = Clutter.get_default_backend().get_default_seat().get_keymap();
        this._caps = this._keymap.get_caps_lock_state();
        this._num = this._keymap.get_num_lock_state();
        this._keymapId = this._keymap.connect('state-changed', () => this._locks());
        this._watchFnLock();
    }

    // Read-only and event-driven: a watch on brightness_hw_changed, re-armed by reading it.
    // Finding the LED and its first state is read without blocking the Shell (kit/services/files.js,
    // EGO review); disable() cancels it if it is still going.
    async _watchFnLock() {
        const reads = this._fnReads = new Gio.Cancellable();
        let names;
        try {
            names = await listNames(Gio.File.new_for_path(LEDS), reads);
        } catch {
            return;                       // no LED class: nothing to watch
        }
        const name = names.find(isFnLockLed);
        if (!name || reads.is_cancelled())
            return;
        const first = await readText(`${LEDS}/${name}/brightness`, reads);
        if (reads.is_cancelled())
            return;
        try {
            // the stream stays open while the module is on; opening a sysfs attribute does
            // not wait on a device
            // a local file's stream is a GLocalFileInputStream, which has get_fd()
            this._fnStream = /** @type {Gio.FileInputStream & {get_fd(): number}} */ (
                Gio.File.new_for_path(`${LEDS}/${name}/brightness_hw_changed`).read(null));
        } catch {
            return;                       // the driver gives no change events
        }
        this._fnOn = ledOn(first);
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

    // On the fd's wake-up only: a sysfs attribute is a few bytes the kernel hands over at
    // once, and reading it is what re-arms the next wake-up (sysfs_notify)
    _readFnChange() {
        try {
            this._fnStream.seek(0, GLib.SeekType.SET, null);
            const bytes = this._fnStream.read_bytes(16, null).toArray();
            return ledOn(new TextDecoder().decode(bytes));
        } catch {
            return null;                  // ENODATA until the first change
        }
    }

    // Quick Settings' volume and microphone sliders set the stream and play a click, but
    // show no OSD (ui/status/volume.js StreamSlider._sliderChanged; brightness does, from
    // misc/brightnessManager.js). With the pill replacing the OSD, a slider moved by hand
    // shows its level too: after the original runs, the slider's own showOSD() — which
    // lands in the showAll override above. _sliderChanged runs only for the user's drag or
    // scroll (programmatic updates block it, _changeSlider). StreamSlider is not exported:
    // its prototype is reached from the output slider Quick Settings holds (ui/panel.js
    // _volumeOutput); both sliders share it. Returns whether the sliders are hooked.
    _feedbackOnVolumeSliders() {
        /** @type {any} StreamSlider's prototype, which Shell does not export */
        let proto = Main.panel.statusArea.quickSettings?._volumeOutput?.quickSettingsItems?.[0] ?? null;
        while (proto && !Object.hasOwn(proto, '_sliderChanged'))
            proto = Object.getPrototypeOf(proto);
        if (!proto || typeof proto.showOSD !== 'function')
            return false;                 // not there (yet): the keys still work
        const source = this;
        this._injections.overrideMethod(proto, '_sliderChanged', original => function (...args) {
            // eslint-disable-next-line no-invalid-this -- the slider Shell calls this on
            const slider = this;
            const result = original.apply(slider, args);
            if (slider._stream && source._replacing())
                slider.showOSD();
            return result;
        });
        return true;
    }

    _replacing() {
        return this._stack !== null && this._settings?.get_boolean('hud-replace-osd') !== false;
    }

    _osd(icon, label, levels) {
        const at = levels?.[Main.layoutManager.primaryIndex] ??
            Object.values(levels ?? {}).find(l => l) ?? null;
        const maxLevel = at?.maxLevel > 0 ? at.maxLevel : 1;
        // a themed icon goes by its name, which Buoy has its own file for (design/icons)
        this._show({
            iconName: nameOf(icon), gicon: icon && !(icon instanceof Gio.ThemedIcon) ? icon : null, label: label ?? null,
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

    // Buoy's own caps-lock, num-lock, fn-lock icons (design/icons): the theme has none
    _lock(which, on) {
        this._show({lock: which, on, iconName: `${which}-lock-symbolic`});
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
        Main.panel.statusArea.quickSettings?.menu.disconnectObject(this);
        this._injections?.clear();
        this._injections = null;
        if (this._keymapId)
            this._keymap.disconnect(this._keymapId);
        this._keymapId = 0;
        this._keymap = null;
        this._fnReads?.cancel();
        this._fnReads = null;
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
