import Gio from 'gi://Gio';

import {cameraOf} from '../model/drives.js';
import {listInfos, readText} from './files.js';

const DEV = '/dev';
const SYS = '/sys/class/video4linux';
const VIDEO = /^video\d+$/;

/**
 * Webcams plugged in (FEATURES M4 "USB / phone / webcam plugged"): Shell knows only whether a
 * camera is in use (Shell.CameraMonitor `cameras-in-use`), so the kernel's video devices are read:
 * a /dev directory monitor (inotify: signals, no polling) says when a videoN node comes or goes,
 * then each one's sysfs files are read without blocking (kit/services/files.js) — its first node
 * only, not one built in (model/drives.js cameraOf). The usb module holds one for its flashes,
 * the Device tab one while it lives.
 */
export class Cameras {
    /** @param {function(Array<{id: string, name: string}>): void} changed  the cameras, read again */
    constructor(changed) {
        this._changed = changed;
        this._cancel = new Gio.Cancellable();
        this._list = null;
        this._serial = 0;
        try {
            this._monitor = Gio.File.new_for_path(DEV).monitor_directory(Gio.FileMonitorFlags.NONE, this._cancel);
            this._monitor.connectObject('changed', (_m, file, _other, event) => {
                if (VIDEO.test(file.get_basename() ?? '') &&
                    (event === Gio.FileMonitorEvent.CREATED || event === Gio.FileMonitorEvent.DELETED))
                    this._read();
            }, this);
        } catch (e) {
            this._monitor = null;
            console.debug(`Buoy: cameras: ${e.message}`);
        }
        this._read();
    }

    /** @returns {?Array<{id: string, name: string}>} the webcams plugged in; null before the first reading */
    get list() {
        return this._list;
    }

    async _read() {
        const serial = ++this._serial;
        // each /sys/class/video4linux/videoN is a link into the device tree,
        // ../../devices/…/usb3/3-8/3-8:1.0/video4linux/video0: the USB device (3-8) holds
        // `removable` and `product`. Read through the link's target: Gio folds "x/.." by name,
        // not by the link, so "videoN/device/../removable" would not be the device's
        let links = [];
        try {
            links = (await listInfos(Gio.File.new_for_path(SYS), 'standard::name,standard::symlink-target', this._cancel, true))
                .filter(i => VIDEO.test(i.get_name()));
        } catch {
            links = [];     // no video4linux: no camera
        }
        const sys = Gio.File.new_for_path(SYS);
        const cams = await Promise.all(links.sort((x, y) => x.get_name().localeCompare(y.get_name())).map(async info => {
            const id = info.get_name();
            const target = info.get_symlink_target();
            const node = target ? sys.resolve_relative_path(target) : sys.get_child(id);
            const usb = node.get_parent()?.get_parent()?.get_parent();      // video4linux, the interface, the device
            const read = f => f ? readText(f, this._cancel) : Promise.resolve(null);
            return cameraOf({
                id, index: await read(node.get_child('index')), name: await read(node.get_child('name')),
                removable: await read(usb?.get_child('removable')), product: await read(usb?.get_child('product')),
            });
        }));
        if (serial !== this._serial || !this._changed)
            return;     // read again meanwhile, or gone
        this._list = cams.filter(Boolean);
        this._changed(this._list);
    }

    destroy() {
        this._changed = null;
        this._cancel.cancel();
        this._monitor?.disconnectObject(this);
        this._monitor?.cancel();
        this._monitor = null;
    }
}
