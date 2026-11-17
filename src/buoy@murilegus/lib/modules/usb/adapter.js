import {PRIORITY} from '../../kit/model/activity.js';
import {spaceLine} from '../../kit/model/drives.js';

/**
 * A drive, a phone or a webcam plugged in (FEATURES M4 "USB / phone / webcam plugged", design/device
 * "Đang cắm", 2026-11-17, Ethan). Pure: the source reads Gio's volume monitor and the kernel's
 * video devices.
 *
 * Event: {what: 'drive-in', name, kind: 'drive'|'phone', free?, size?, open?, eject?}
 *        {what: 'writing'|'safe'|'failed'|'drive-out', name, kind?}
 *        {what: 'camera-in'|'camera-out', name}
 */

// every flash that only tells is 3 s (Ethan, 2026-11-16)
export const TTL = 3000;
// "Writing to …" stays until the eject says it is done (safe or failed replaces it)
export const WRITING_TTL = 60000;

const DRIVE_ICON = 'drive-removable-media-symbolic';
const CAMERA_ICON = 'camera-web-symbolic';
const iconOf = kind => kind === 'phone' ? 'phone-symbolic' : DRIVE_ICON;
const nameOf = (ev, fallback) => typeof ev.name === 'string' && ev.name.trim() ? ev.name.trim() : fallback;

function flash(leading, text, what, ttl = TTL, onPress = null) {
    return {
        leading, text, trailing: null, sizeHint: 'wide', ttl, priority: PRIORITY.device,
        compact: null, expanded: null, attributes: {what}, onPress,
    };
}

// plugged in: its compact opens on its own (an alert, as a display's), Open and Eject
function driveIn(ev) {
    const name = nameOf(ev, ev.kind === 'phone' ? 'Phone' : 'Drive');
    const open = typeof ev.open === 'function' ? ev.open : null;
    const eject = typeof ev.eject === 'function' ? ev.eject : null;
    const actions = [
        ...open ? [{id: 'open', label: 'Open', icon: 'folder-open-symbolic'}] : [],
        ...eject ? [{id: 'eject', label: 'Eject', icon: 'media-eject-symbolic'}] : [],
    ];
    return {
        ...flash(iconOf(ev.kind), name, 'drive-in', TTL, open),
        compact: actions.length ? {
            card: {picture: {icon: iconOf(ev.kind), backdrop: true}, title: name, app: spaceLine(ev.free, ev.size), tight: true},
        } : null,
        actions,
        minimalAction: false,
        attributes: {what: 'drive-in', name, kind: ev.kind === 'phone' ? 'phone' : 'drive'},
        onAction: actions.length ? id => (id === 'open' ? open : eject)?.() : null,
    };
}

export default {
    usb(ev) {
        switch (ev?.what) {
        case 'drive-in':
            return driveIn(ev);
        case 'writing':
            return flash(iconOf(ev.kind), `Writing to ${nameOf(ev, 'the drive')}`, 'writing', WRITING_TTL);
        case 'safe':
            return flash(iconOf(ev.kind), `Safe to remove ${nameOf(ev, 'the drive')}`, 'safe');
        case 'failed':
            return flash(iconOf(ev.kind), `Couldn't eject ${nameOf(ev, 'the drive')}`, 'failed');
        case 'drive-out':
            return flash(iconOf(ev.kind), `Unplugged ${nameOf(ev, ev.kind === 'phone' ? 'Phone' : 'Drive')}`, 'drive-out');
        case 'camera-in':
            return flash(CAMERA_ICON, nameOf(ev, 'Webcam'), 'camera-in');
        case 'camera-out':
            return flash(CAMERA_ICON, `Unplugged ${nameOf(ev, 'Webcam')}`, 'camera-out');
        }
        return null;
    },
};
