import {PRIORITY} from '../../kit/model/activity.js';
import {batteryOf, kindIcon} from '../../kit/model/bluetooth.js';

/**
 * A Bluetooth device connected or gone (FEATURES M4 "Bluetooth device", design/device "Không
 * dây", 2026-11-17, Ethan): a 3 s flash, the device's kind as its icon, its name, its battery
 * drawn at its level with its number (a volume is a bar: the two read apart). Pure: the source
 * reads Quick Settings' Bluetooth client.
 *
 * Event: {what: 'connected'|'disconnected', name, kind, battery?: {percentage?, level?}, open?}
 */

// every flash that only tells is 3 s (Ethan, 2026-11-16)
export const TTL = 3000;
const PANEL = 'gnome-bluetooth-panel.desktop';

export default {
    bluetooth(ev) {
        if (ev?.what !== 'connected' && ev?.what !== 'disconnected')
            return null;
        const name = typeof ev.name === 'string' && ev.name.trim() ? ev.name.trim() : 'Bluetooth device';
        const on = ev.what === 'connected';
        // a phone rarely tells its battery over Bluetooth: its name only (GSConnect brings it)
        const b = on ? batteryOf(ev.battery) : null;
        return {
            leading: kindIcon(ev.kind),
            text: on ? name : `Disconnected ${name}`,
            trailing: b ? {battery: b.value, ...b.label ? {label: b.label} : {}} : null,
            sizeHint: 'wide',
            ttl: TTL,
            priority: PRIORITY.device,
            compact: null,
            expanded: null,
            attributes: {what: ev.what, kind: typeof ev.kind === 'string' ? ev.kind : 'other'},
            onPress: typeof ev.open === 'function' ? () => ev.open(PANEL) : null,
        };
    },
};
