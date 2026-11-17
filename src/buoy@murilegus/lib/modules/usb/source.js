import GLib from 'gi://GLib';

import {Source} from '../../kit/services/source.js';
import {driveOf, ejectDrive, isEjecting, openDrive, querySpace, readDrives, volumeMonitor, watchEjects} from '../../kit/services/drives.js';
import {Cameras} from '../../kit/services/cameras.js';
import {diffById} from '../../kit/model/drives.js';

const DRIVE = 'drive';
const CAMERA = 'camera';

/**
 * Drives, phones and webcams plugged in (FEATURES M4 "USB / phone / webcam plugged", adapter.js),
 * signals only:
 *
 * - Drives: Gio's volume monitor (kit/services/drives.js), `mount-added` / `mount-removed` — after
 *   GNOME's automount mounted it. Its compact opens on its own with Open and Eject, its free
 *   space coming a moment later. Gone: "Unplugged …" when its volume went too (pulled out), nothing
 *   when only unmounted (Files did it, the drive still in); ejected by Buoy: "Writing to …" while
 *   data still goes, then "Safe to remove …".
 * - Webcams: kit/services/cameras.js (the kernel's video devices, a /dev monitor).
 * - Nothing on the first reading (Buoy turned on).
 */
export class UsbSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._monitor = volumeMonitor();
        this._known = new Map(readDrives(this._monitor).map(d => [d.id, {...d, volume: d.mount.get_volume()}]));
        this._idle = new Set();
        this._monitor.connectObject(
            'mount-added', (_m, mount) => this._added(mount),
            'mount-removed', (_m, mount) => this._removed(mount),
            this);
        watchEjects((id, ev) => this._ejected(id, ev));
        this._cams = null;
        this._cameras = new Cameras(list => this._camerasChanged(list));
    }

    disable() {
        watchEjects(null);
        this._monitor?.disconnectObject(this);
        for (const id of this._idle)
            GLib.source_remove(id);
        this._idle.clear();
        this._cameras?.destroy();
        for (const key of [DRIVE, CAMERA])
            this._stack?.end(this._id(key));
        this._monitor = this._cameras = this._known = this._cams = null;
        super.disable();
    }

    // --- drives ---------------------------------------------------------------------------------

    async _added(mount) {
        const d = driveOf(mount);
        if (!d || !this._stack)
            return;
        this._known.set(d.id, {...d, volume: mount.get_volume()});
        const ev = {what: 'drive-in', name: d.name, kind: d.kind, open: () => openDrive(mount), eject: () => ejectDrive(mount)};
        this._show(DRIVE, ev, {fresh: true, alert: true});
        const space = await querySpace(mount);
        // still the same drive's pill: its free space under its name, the time it has left kept
        const a = this._stack?.get(this._id(DRIVE));
        if (a?.attributes?.name === d.name && this._known?.has(d.id))
            this._show(DRIVE, {...ev, ...space}, {keepTtl: true});
    }

    _removed(mount) {
        let id;
        try {
            id = mount.get_root().get_uri();
        } catch {
            return;
        }
        const d = this._known?.get(id);
        if (!d)
            return;
        this._known.delete(id);
        if (isEjecting(id))
            return;     // Buoy's eject says how it went
        // pulled out, or only unmounted (Files, the drive still in)? the volume monitor drops the
        // volume in the same pass: looked at once that pass is over
        const sid = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle?.delete(sid);
            if (!this._monitor)
                return GLib.SOURCE_REMOVE;
            const still = d.volume && this._monitor.get_volumes().includes(d.volume);
            if (!still)
                this._show(DRIVE, {what: 'drive-out', name: d.name, kind: d.kind}, {fresh: true});
            return GLib.SOURCE_REMOVE;
        });
        this._idle.add(sid);
    }

    _ejected(id, {what, name}) {
        if (!this._stack)
            return;
        const kind = this._known?.get(id)?.kind ?? 'drive';
        this._show(DRIVE, {what, name, kind}, {fresh: what !== 'writing' || !this._stack.has(this._id(DRIVE))});
    }

    // --- webcams ------------------------------------------------------------------------------

    _camerasChanged(list) {
        const {added, removed} = diffById(this._cams, list);
        this._cams = list;
        if (!this._stack)
            return;
        if (added.length)
            this._show(CAMERA, {what: 'camera-in', name: added.at(-1).name}, {fresh: true});
        else if (removed.length)
            this._show(CAMERA, {what: 'camera-out', name: removed.at(-1).name}, {fresh: true});
    }

    // --- pills --------------------------------------------------------------------------------

    _id(key) {
        return `usb:system:${key}`;
    }

    // one pill per key: a new flash replaces the last; `alert`: a drive's compact opens on its own
    // (kit/model/stack.js ALERT_MS); `keepTtl`: new figures, its time left kept
    _show(key, ev, {fresh = false, alert = false, keepTtl = false} = {}) {
        const a = this._registry?.build('usb', 'system', {id: key, ...ev});
        if (!a)
            return;
        if (alert && a.compact)
            a.alert = true;
        if (!fresh && this._stack.has(a.id)) {
            const {ttl: unusedTtl, ...figures} = a;
            if (this._stack.update(a.id, keepTtl ? figures : a))
                return;
        }
        this._stack.surface(a);
    }
}
