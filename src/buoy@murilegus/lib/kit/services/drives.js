import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ShellMountOperation} from 'resource:///org/gnome/shell/ui/shellMountOperation.js';

import {driveKind} from '../model/drives.js';

/**
 * Drives plugged in, from Gio's volume monitor — the one GNOME's autorun and automount use
 * (ui/components/autorunManager.js, automountManager.js) — and their eject (FEATURES M4 "USB /
 * phone / webcam plugged"). Ejecting goes through Shell's own mount operation
 * (ui/shellMountOperation.js): busy files bring its dialog listing the apps that hold them.
 * Its notifications ("Writing data to …", "… can be safely unplugged") are said by the usb
 * module instead: watchEjects() hands it the progress.
 */

/** @returns {Gio.VolumeMonitor} */
export function volumeMonitor() {
    return Gio.VolumeMonitor.get();
}

/**
 * @param {Gio.Mount} mount
 * @returns {?{id: string, name: string, kind: string, mount: Gio.Mount}} a drive plugged in
 *   (model/drives.js driveKind); null for anything else
 */
export function driveOf(mount) {
    try {
        const root = mount.get_root();
        const volume = mount.get_volume();
        const drive = mount.get_drive();
        const kind = driveKind({
            hasVolume: !!volume, volumeClass: volume?.get_identifier('class') ?? null,
            path: root.is_native() ? root.get_path() : null, scheme: root.get_uri_scheme(),
            removable: !!drive && (drive.is_removable() || drive.is_media_removable()),
        });
        return kind ? {id: root.get_uri(), name: mount.get_name() || '', kind, mount} : null;
    } catch {
        return null;
    }
}

/** @param {Gio.VolumeMonitor} monitor  @returns {object[]} the drives plugged in now (driveOf) */
export function readDrives(monitor) {
    return (monitor?.get_mounts() ?? []).map(driveOf).filter(Boolean);
}

/**
 * @param {Gio.Mount} mount
 * @returns {Promise<{free: ?number, size: ?number}>} its free space and size (a phone may tell none)
 */
export function querySpace(mount) {
    return new Promise(resolve => {
        mount.get_root().query_filesystem_info_async('filesystem::free,filesystem::size', 0, null, (root, res) => {
            try {
                const info = root.query_filesystem_info_finish(res);
                const n = a => info.has_attribute(a) ? info.get_attribute_uint64(a) : null;
                resolve({free: n('filesystem::free'), size: n('filesystem::size')});
            } catch {
                resolve({free: null, size: null});
            }
        });
    });
}

/**
 * Open it in the file manager, as GNOME's autorun notification does (startAppForMount).
 *
 * @param {Gio.Mount} mount
 */
export function openDrive(mount) {
    const app = Gio.app_info_get_default_for_type('inode/directory', false);
    if (!app)
        return;
    Main.overview.hide();
    try {
        app.launch([mount.get_root()], global.create_app_launch_context(0, -1));
    } catch (e) {
        console.debug(`Buoy: open drive: ${e.message}`);
    }
}

let watcher = null;
const ejecting = new Set();     // root URIs being ejected by Buoy

/**
 * @param {?function(string, {what: string, name: string}): void} fn  an eject's progress, by root
 *   URI: 'writing' (data still going to the drive), 'safe' (done), 'failed'; null: none
 */
export function watchEjects(fn) {
    watcher = fn;
}

/** @param {string} id  a root URI  @returns {boolean} Buoy is ejecting it */
export function isEjecting(id) {
    return ejecting.has(id);
}

/**
 * Eject a drive (power it off where it can be), else unmount it, as Files does.
 *
 * @param {Gio.Mount} mount
 */
export function ejectDrive(mount) {
    let id, name;
    try {
        id = mount.get_root().get_uri();
        name = mount.get_name() || '';
    } catch {
        return;
    }
    if (ejecting.has(id))
        return;
    const tell = what => {
        try {
            watcher?.(id, {what, name});
        } catch (e) {
            console.debug(`Buoy: eject watcher: ${e.message}`);
        }
    };
    let op;
    try {
        op = new ShellMountOperation(mount);
    } catch (e) {
        console.debug(`Buoy: eject: ${e.message}`);
        tell('failed');
        return;
    }
    ejecting.add(id);
    // Shell's operation turns this into its own notification too: the notification module
    // lets those pass silently while the usb module runs (model/drives.js usbShows)
    op.mountOp.connect('show-unmount-progress', (_o, _message, _time, bytesLeft) => {
        if (bytesLeft > 0)
            tell('writing');
    });
    const done = (ok, error) => {
        ejecting.delete(id);
        op.close();     // its dialog, its notification
        if (ok)
            tell('safe');
        else if (!error?.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.FAILED_HANDLED))
            tell('failed');     // FAILED_HANDLED: a dialog said why (busy, cancelled)
    };
    const finish = (m, res, how) => {
        try {
            m[`${how}_with_operation_finish`](res);
            done(true, null);
        } catch (e) {
            done(false, e);
        }
    };
    try {
        if (mount.can_eject())
            mount.eject_with_operation(Gio.MountUnmountFlags.NONE, op.mountOp, null, (m, res) => finish(m, res, 'eject'));
        else
            mount.unmount_with_operation(Gio.MountUnmountFlags.NONE, op.mountOp, null, (m, res) => finish(m, res, 'unmount'));
    } catch (e) {
        done(false, e);
    }
}
