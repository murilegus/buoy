/**
 * Drives and webcams plugged in (FEATURES M4 "USB / phone / webcam plugged", design/device
 * "Đang cắm", 2026-11-17, Ethan). Pure: the usb module and the Device tab share it;
 * kit/services/drives.js reads Gio's volume monitor, kit/services/cameras.js the kernel's video
 * devices.
 *
 * A drive: {id, name, kind: 'drive'|'phone', free?: ?number, size?: ?number} — `id` its mount's
 *   root URI; a phone is one in file transfer mode (MTP, PTP: gvfs mounts it like a drive)
 * A camera: {id, name} — `id` its video device (video2)
 */

// a phone or a camera gvfs mounts (gvfs's mtp, gphoto2 and afc backends)
const PHONE_SCHEMES = new Set(['mtp', 'gphoto2', 'afc']);

/**
 * Sizes as GNOME writes them (g_format_size: powers of 1000), one decimal under 10.
 *
 * @param {?number} bytes
 * @returns {?string} "41 GB", "7.5 GB", "820 MB"; null when unknown
 */
export function formatSize(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0)
        return null;
    const units = ['bytes', 'kB', 'MB', 'GB', 'TB'];
    let v = bytes, i = 0;
    while (v >= 1000 && i < units.length - 1) {
        v /= 1000;
        i++;
    }
    if (i === 0)
        return `${Math.round(v)} bytes`;
    const n = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
    return `${n} ${units[i]}`;
}

/**
 * @param {?number} free
 * @param {?number} size
 * @returns {?string} "41 GB free of 64 GB", "41 GB free"; null without the free space
 */
export function spaceLine(free, size) {
    const f = formatSize(free);
    if (!f)
        return null;
    const s = formatSize(size);
    return s && size > 0 ? `${f} free of ${s}` : `${f} free`;
}

/**
 * Which mounts are a drive plugged in: one with a volume (not a bare filesystem), not a
 * network share, not hidden (Shell's autorunManager.js isMountNonLocal, isMountRootHidden),
 * on a removable drive (a USB stick, a card, an external disk) or a phone gvfs mounts (no drive).
 * A partition of the computer's own disk mounted by hand is not one.
 *
 * @param {{hasVolume: boolean, volumeClass?: ?string, path?: ?string, scheme?: ?string, removable?: ?boolean}} m
 * @returns {?string} 'drive' | 'phone'; null: not a drive plugged in
 */
export function driveKind(m) {
    if (!m?.hasVolume || m.volumeClass === 'network')
        return null;
    if (typeof m.path === 'string' && m.path.includes('/.'))
        return null;
    if (PHONE_SCHEMES.has(m.scheme ?? ''))
        return 'phone';
    return m.removable === true ? 'drive' : null;
}

/**
 * A webcam plugged in, from the kernel's video device (/sys/class/video4linux/videoN): its first
 * node only (a UVC camera makes two, the second for metadata), and not one built in — the
 * laptop's camera sits on a USB port its firmware marks "fixed" (/sys/bus/usb/devices/…/removable).
 *
 * @param {{id: string, index?: ?string, removable?: ?string, product?: ?string, name?: ?string}} v
 *   the files as read (text, trimmed or not)
 * @returns {?{id: string, name: string}}
 */
export function cameraOf(v) {
    const t = x => typeof x === 'string' ? x.trim() : '';
    if (!v?.id || t(v.index) !== '0' || t(v.removable) === 'fixed')
        return null;
    // the USB product name ("HD Pro Webcam C920"); else the kernel's ("Integrated C…: …")
    const name = t(v.product) || t(v.name).split(':')[0].trim() || 'Webcam';
    return {id: v.id, name};
}

/**
 * What came and went between two readings, by id.
 *
 * @param {?Array<{id: string}>} prev  null: the first reading (Buoy turned on): nothing to say
 * @param {Array<{id: string}>} cur
 * @returns {{added: object[], removed: object[]}}
 */
export function diffById(prev, cur) {
    if (!prev)
        return {added: [], removed: []};
    const was = new Set(prev.map(x => x.id)), now = new Set(cur.map(x => x.id));
    return {added: cur.filter(x => !was.has(x.id)), removed: prev.filter(x => !now.has(x.id))};
}

// Shell's unmount notifications' icon: compared, never drawn by Buoy (tests/icons.test.js asks a
// file for every quoted symbolic name in the code)
const UNMOUNT_ICON = ['media-removable', 'symbolic'].join('-');

/**
 * GNOME's own notifications for what the usb module says (the notification module asks): its
 * autorun's "“USB 64 GB” connected" (ui/components/autorunManager.js _addNotification) while the
 * drive's pill is up, and Shell's unmount notifications ("Writing data to …", "… can be safely
 * unplugged": ui/shellMountOperation.js, icon media-removable-symbolic).
 *
 * @param {string} title
 * @param {?string} iconName
 * @param {?object} activity  the usb module's drive pill on the island, or null
 * @returns {boolean} said here: no pill of its own
 */
export function usbShows(title, iconName, activity) {
    if (iconName === UNMOUNT_ICON)
        return true;
    const name = activity?.attributes?.what === 'drive-in' ? activity.attributes.name : null;
    return typeof name === 'string' && name !== '' && typeof title === 'string' && title.includes(name);
}
