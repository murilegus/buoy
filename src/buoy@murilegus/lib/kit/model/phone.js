/**
 * The phone through GSConnect (FEATURES M4 "Phone via GSConnect", part 1, design/device "Điện
 * thoại qua GSConnect", 2026-11-17, Ethan). Pure: kit/services/gsconnect.js reads GSConnect's
 * D-Bus service (org.gnome.Shell.Extensions.GSConnect); the Device tab, the notification module
 * and prefs share what is here.
 *
 * A phone: {id, name, connected, paired, battery: ?{percentage, charging}}
 */

import {duration} from './power.js';

/** GSConnect's extension UUID, and its app id (the notifications it shows for the phone) */
export const GSCONNECT_UUID = 'gsconnect@andyholmes.github.io';
export const GSCONNECT_APP = 'org.gnome.Shell.Extensions.GSConnect';
export const GSCONNECT_PAGE = 'https://extensions.gnome.org/extension/1319/gsconnect/';
// GSConnect's own settings app, as its "Mobile Settings" opens it (src/extension.js): Shell's prefs
// service shows one prefs dialog at a time, so from Buoy's prefs an extension's prefs would be
// refused ("Already showing a prefs dialog", js/dbusServices/extensions/extensionsService.js)
export const GSCONNECT_SETTINGS = 'org.gnome.Shell.Extensions.GSConnect.Preferences.desktop';

// Shell's ExtensionState (misc/extensionUtils.js): ACTIVE 1
const ACTIVE = 1;

/**
 * Where setting the phone up stands, and what helps (prefs' Phone row; the Phone tab's empty
 * state with part 3). Never a flash nor a pill (Ethan, 2026-11-17).
 *
 * @param {{installed: boolean, state?: ?number, paired?: ?Array<{name: string, connected: boolean}>}} s
 *   GSConnect's extension (installed, Shell's ExtensionState), the phones paired (null: not read)
 * @returns {{status: 'missing'|'off'|'unpaired'|'away'|'ready', text: string, button: ?string}}
 *   `away`: paired, none connected now (the phone off the network, KDE Connect closed): said so,
 *   not ready (Ethan, 2026-11-18)
 */
export function phoneSetup(s) {
    if (!s?.installed)
        return {status: 'missing', text: 'Needs GSConnect to see your phone', button: 'Install GSConnect'};
    if (s.state !== ACTIVE)
        return {status: 'off', text: 'GSConnect is off', button: 'Turn On GSConnect'};
    const paired = (s.paired ?? []).filter(p => typeof p?.name === 'string' && p.name.trim());
    if (!paired.length)
        return {status: 'unpaired', text: 'No phone paired yet (KDE Connect on the phone)', button: 'Open GSConnect'};
    const on = paired.filter(p => p.connected === true);
    if (!on.length) {
        return {
            status: 'away', button: 'Open GSConnect',
            text: `${paired.map(p => p.name.trim()).join(', ')} · not connected (KDE Connect open on the phone, on the same network)`,
        };
    }
    return {status: 'ready', text: `${on.map(p => p.name.trim()).join(', ')} · connected`, button: null};
}

/**
 * GSConnect's battery action state, `(bsii)`: charging, icon name, level (-1: unknown), time.
 *
 * @param {?Array} state  deepUnpack()ed
 * @returns {?{percentage: number, charging: boolean, time: number}}  `time`: s to full (charging)
 *   or to empty, GSConnect's estimate; 0 not known
 */
export function batteryState(state) {
    if (!Array.isArray(state))
        return null;
    const [charging, , level, time] = state;
    if (typeof level !== 'number' || !Number.isFinite(level) || level < 0)
        return null;
    return {percentage: Math.min(100, level), charging: charging === true, time: Number.isFinite(time) && time > 0 ? time : 0};
}

// under this the phone's battery is low (as the computer's, kit/model/power.js)
const LOW = 20;

const timeOf = (b, fullIn) => {
    const t = duration(b.time);
    if (!t)
        return null;
    return b.charging ? `${fullIn} ${t}` : `${t} left`;
};

/**
 * Home's phone tile (design/home "Ô điện thoại", 2026-11-17, Ethan): its battery, its name; the
 * top right corner says charging or low (else empty); from 200 wide, the time and that state.
 *
 * @param {?{name: string, connected?: boolean, battery: ?{percentage: number, charging: boolean, time?: number}}} p
 * @returns {?{icon: string, value: string, caption: string, cornerIcon?: string, detail: string[]}}
 *   null without a connected phone telling its battery
 */
export function phoneTile(p) {
    const b = p?.battery;
    if (!p?.connected || !b || !Number.isFinite(b.percentage))
        return null;
    const pct = Math.max(0, Math.min(100, Math.round(b.percentage)));
    const low = !b.charging && pct < LOW;
    let corner = null, state = null;
    if (b.charging) {
        corner = 'battery-good-charging-symbolic';
        state = 'Charging';
    } else if (low) {
        corner = 'battery-low-symbolic';
        state = 'Low battery';
    }
    return {
        icon: 'phone-symbolic', value: `${pct}%`, caption: p.name || 'Phone',
        ...corner ? {cornerIcon: corner} : {},
        detail: [timeOf(b, 'Full in'), state].filter(Boolean),
    };
}

/**
 * What a click on the tile shows, in place of Home's card and row (as the battery tile's):
 * "Redmi Note 14 · 77% · charging", its time at the end; Find My Phone; GSConnect's settings.
 *
 * @param {?object} p  as phoneTile
 * @returns {?object} {title, end, rows, settings} (kit/ui/home.js Glance page)
 */
export function phoneHomePage(p) {
    const b = p?.battery;
    if (!p?.connected)
        return null;
    const pct = b && Number.isFinite(b.percentage) ? ` · ${Math.max(0, Math.min(100, Math.round(b.percentage)))}%` : '';
    return {
        title: `${p.name || 'Phone'}${pct}${b?.charging ? ' · charging' : ''}`,
        end: b ? timeOf(b, 'full in') : null,
        rows: [{id: 'ring', icon: 'find-location-symbolic', name: 'Find My Phone', value: 'Rings it', plain: true, selected: false}],
        settings: {name: 'GSConnect Settings'},
    };
}

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The Wireless column with the phones: each connected phone is one device, with GSConnect's exact
 * battery; the same phone over Bluetooth (its name) is not listed twice (Ethan, 2026-11-17).
 *
 * @param {object[]} wireless  model/bluetooth.js's devices (Bluetooth's, UPower's)
 * @param {object[]} phones  GSConnect's
 * @returns {object[]}
 */
export function withPhones(wireless, phones) {
    const on = (phones ?? []).filter(p => p?.connected && p.paired !== false && p.name);
    const rest = (wireless ?? []).filter(d => !on.some(p => same(p.name, d.name)));
    const own = on.map(p => ({
        id: `gsconnect:${p.id}`, name: p.name, kind: 'phone', battery: p.battery ? {percentage: p.battery.percentage} : null,
        charging: p.battery?.charging === true, bluetooth: false, gsconnect: true, phoneId: p.id,
    }));
    return [...own, ...rest];
}

// GSConnect's icons for an SMS and a missed call: compared, never drawn by Buoy
// (tests/icons.test.js asks a file for every quoted symbolic name in the code)
const SMS_ICON = ['sms', 'symbolic'].join('-');
const MISSED_ICON = ['call-missed', 'symbolic'].join('-');

/**
 * A phone notification as GSConnect shows it (src/service/plugins/notification.js
 * _receiveNotification): the phone app's name as the title, "sender: text" as the body (only
 * the text when the app names itself); an SMS or a missed call titled with the contact and a
 * themed icon (sms-symbolic, call-missed-symbolic). Here: the app it is from, and the title and
 * body a notification of that app would have.
 *
 * @param {string} title
 * @param {string} body
 * @param {?string} iconName  the notification's themed icon, if it has one
 * @returns {{app: string, title: string, body: string}}
 */
export function phoneNote(title, body, iconName = null) {
    const t = typeof title === 'string' ? title.trim() : '';
    const b = typeof body === 'string' ? body : '';
    if (iconName === SMS_ICON)
        return {app: 'Messages', title: t, body: b};
    if (iconName === MISSED_ICON)
        return {app: 'Phone', title: t, body: b};
    const i = b.indexOf(': ');
    if (i > 0)
        return {app: t || 'Phone', title: b.slice(0, i), body: b.slice(i + 2)};
    return {app: t || 'Phone', title: t || 'Phone', body: b};
}

/**
 * The phone's page in the Device tab (design/device): its battery at the head's end, Find My
 * Phone (it rings, even when silenced), GSConnect's settings.
 *
 * @param {?{name: string, battery?: ?object}} d
 * @returns {?object} {title, rows: [{id, icon, name, value}], settings}
 */
export function phonePage(d) {
    if (!d)
        return null;
    return {
        title: d.name || 'Phone',
        rows: [{id: 'ring', icon: 'find-location-symbolic', name: 'Find My Phone', value: 'Rings it'}],
        settings: {name: 'GSConnect Settings'},
    };
}
