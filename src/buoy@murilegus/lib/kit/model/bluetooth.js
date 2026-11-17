/**
 * Wireless devices (FEATURES M4 "Bluetooth device", design/device "Không dây", 2026-11-17, Ethan):
 * what kind each is, its icon, its battery. Pure: the bluetooth module's flash and the Device tab
 * share it; kit/services/bluetooth.js reads GNOME's Bluetooth client and UPower.
 *
 * A device: {id, name, kind, battery: ?{percentage?: number, level?: number}, bluetooth: boolean}
 *   `bluetooth`: one of the Bluetooth devices Quick Settings lists (else UPower's, a 2.4 GHz
 *   mouse or keyboard reporting its battery through its receiver)
 */

// GnomeBluetooth.Type, bits (gnome-bluetooth lib/bluetooth-enums.h BluetoothType)
export const BT_TYPE = Object.freeze({
    PHONE: 1 << 1, HEADSET: 1 << 5, HEADPHONES: 1 << 6, OTHER_AUDIO: 1 << 7, KEYBOARD: 1 << 8,
    MOUSE: 1 << 9, JOYPAD: 1 << 12, TABLET: 1 << 13, SPEAKERS: 1 << 20,
});
// GnomeBluetooth.BatteryType (bluetooth-enums.h BluetoothBatteryType)
export const BATTERY_TYPE = Object.freeze({NONE: 0, PERCENTAGE: 1, COARSE: 2});
// UPowerGlib.DeviceKind (upower libupower-glib/up-types.h UpDeviceKind)
export const UP_KIND = Object.freeze({
    MOUSE: 5, KEYBOARD: 6, PHONE: 8, TABLET: 10, GAMING_INPUT: 12, PEN: 13, TOUCHPAD: 14,
    HEADSET: 17, SPEAKERS: 18, HEADPHONES: 19, OTHER_AUDIO: 21, REMOTE_CONTROL: 22,
});
// UPowerGlib.DeviceLevel (up-types.h UpDeviceLevel): a battery told only coarsely
export const LEVEL = Object.freeze({NONE: 1, LOW: 3, CRITICAL: 4, NORMAL: 6, HIGH: 7, FULL: 8});

/** At or under this the battery is low: such a device comes first in its column (design/device). */
export const LOW = 20;

const ICONS = Object.freeze({
    headphones: 'audio-headphones-symbolic', speakers: 'audio-speakers-symbolic',
    keyboard: 'input-keyboard-symbolic', mouse: 'input-mouse-symbolic', gaming: 'input-gaming-symbolic',
    tablet: 'input-tablet-symbolic', touchpad: 'input-touchpad-symbolic', phone: 'phone-symbolic',
    other: 'bluetooth-active-symbolic',
});

/**
 * @param {number} type  GnomeBluetooth.Device `type`
 * @returns {string} its kind: headphones, speakers, keyboard, mouse, gaming, tablet, phone, other
 */
export function btKind(type) {
    const t = Number.isInteger(type) ? type : 0;
    if (t & (BT_TYPE.HEADSET | BT_TYPE.HEADPHONES | BT_TYPE.OTHER_AUDIO))
        return 'headphones';
    if (t & BT_TYPE.SPEAKERS)
        return 'speakers';
    if (t & BT_TYPE.KEYBOARD)
        return 'keyboard';
    if (t & BT_TYPE.MOUSE)
        return 'mouse';
    if (t & BT_TYPE.JOYPAD)
        return 'gaming';
    if (t & BT_TYPE.TABLET)
        return 'tablet';
    if (t & BT_TYPE.PHONE)
        return 'phone';
    return 'other';
}

/** @type {Map<number, string>} */
const UP_KINDS = new Map([
    [UP_KIND.MOUSE, 'mouse'], [UP_KIND.KEYBOARD, 'keyboard'], [UP_KIND.GAMING_INPUT, 'gaming'],
    [UP_KIND.TABLET, 'tablet'], [UP_KIND.PEN, 'tablet'], [UP_KIND.TOUCHPAD, 'touchpad'],
    [UP_KIND.HEADSET, 'headphones'], [UP_KIND.HEADPHONES, 'headphones'], [UP_KIND.OTHER_AUDIO, 'headphones'],
    [UP_KIND.SPEAKERS, 'speakers'], [UP_KIND.REMOTE_CONTROL, 'other'], [UP_KIND.PHONE, 'phone'],
]);

/**
 * @param {number} kind  UPowerGlib.Device `kind`
 * @returns {?string} a peripheral's kind; null for what is not one (the laptop's battery, a
 *   charger, a UPS, a monitor…)
 */
export function upKind(kind) {
    return UP_KINDS.get(kind) ?? null;
}

const NAMES = Object.freeze({
    headphones: 'Headphones', speakers: 'Speakers', keyboard: 'Keyboard', mouse: 'Mouse', gaming: 'Game Controller',
    tablet: 'Tablet', touchpad: 'Touchpad', phone: 'Phone', other: 'Device',
});

/** @param {string} kind  @returns {string} its name, as Settings → Bluetooth says the type */
export function kindName(kind) {
    return NAMES[kind] ?? NAMES.other;
}

/** @param {string} kind  @returns {string} its symbolic icon */
export function kindIcon(kind) {
    return ICONS[kind] ?? ICONS.other;
}

// a coarse level drawn as a battery that full (no number to say)
/** @type {Map<number, number>} */
const COARSE = new Map([[LEVEL.CRITICAL, 0.05], [LEVEL.LOW, 0.2], [LEVEL.NORMAL, 0.55], [LEVEL.HIGH, 0.8], [LEVEL.FULL, 1]]);

/**
 * @param {?{percentage?: ?number, level?: ?number}} b  a percentage, or UPower's coarse level
 * @returns {?{value: number, label: ?string, low: boolean}} the battery as drawn (0..1), its number
 *   ("80%"; none when told coarsely), low at or under LOW %; null when the device tells none
 */
export function batteryOf(b) {
    if (typeof b?.percentage === 'number' && Number.isFinite(b.percentage)) {
        const p = Math.max(0, Math.min(100, Math.round(b.percentage)));
        return {value: p / 100, label: `${p}%`, low: p <= LOW};
    }
    const v = COARSE.get(b?.level);
    if (v === undefined)
        return null;
    return {value: v, label: null, low: b.level === LEVEL.LOW || b.level === LEVEL.CRITICAL};
}

const nameOf = d => typeof d?.name === 'string' && d.name.trim() ? d.name.trim() : null;

/**
 * Wireless devices in their column's order: low batteries first, the rest as they come
 * (Bluetooth's, then UPower's).
 *
 * @param {object[]} devices
 * @returns {object[]}
 */
export function sortWireless(devices) {
    const all = (devices ?? []).filter(d => d && nameOf(d));
    const low = all.filter(d => batteryOf(d.battery)?.low);
    return [...low, ...all.filter(d => !low.includes(d))];
}

/**
 * Bluetooth devices connected now, from what the client lists (paired or trusted ones, as Quick
 * Settings' BtClient.getDevices), by object path.
 *
 * @param {Array<{id: string, connected: boolean}>} list
 * @returns {Map<string, object>}
 */
export function connectedOf(list) {
    return new Map((list ?? []).filter(d => d?.connected === true && d.id).map(d => [d.id, d]));
}

/**
 * What came and went between two readings.
 *
 * @param {?Map<string, object>} prev  null: the first reading (Buoy turned on): nothing to say
 * @param {Map<string, object>} cur
 * @returns {{connected: object[], disconnected: object[]}}
 */
export function diffConnected(prev, cur) {
    if (!prev)
        return {connected: [], disconnected: []};
    return {
        connected: [...cur.values()].filter(d => !prev.has(d.id)),
        disconnected: [...prev.values()].filter(d => !cur.has(d.id)),
    };
}

/**
 * UPower's peripherals that are not a Bluetooth device already listed (UPower lists those too:
 * BlueZ's own battery, `/org/bluez/…`, or the kernel's for a Bluetooth HID with its address).
 *
 * @param {Array<{id: string, kind: ?string, nativePath?: ?string, serial?: ?string}>} ups
 * @param {string[]} addresses  every Bluetooth device's address
 * @returns {object[]}
 */
export function upowerOnly(ups, addresses) {
    const known = new Set((addresses ?? []).map(a => String(a).toLowerCase()));
    const mac = /([0-9a-f]{2}[:_]){5}[0-9a-f]{2}/i;
    return (ups ?? []).filter(u => {
        if (!u?.kind)
            return false;
        const path = String(u.nativePath ?? '');
        if (path.startsWith('/org/bluez'))
            return false;
        for (const s of [path, String(u.serial ?? '')]) {
            const m = s.match(mac);
            if (m && known.has(m[0].replace(/_/g, ':').toLowerCase()))
                return false;
        }
        return true;
    });
}
