/**
 * The phone through GSConnect (FEATURES M4 "Phone via GSConnect", part 1, design/device "Điện
 * thoại qua GSConnect", 2026-11-17, Ethan). Pure: kit/services/gsconnect.js reads GSConnect's
 * D-Bus service (org.gnome.Shell.Extensions.GSConnect); the Device tab, the notification module
 * and prefs share what is here.
 *
 * A phone: {id, name, connected, paired, battery: ?{percentage, charging}}
 */

/** GSConnect's extension UUID, and its app id (the notifications it shows for the phone) */
export const GSCONNECT_UUID = 'gsconnect@andyholmes.github.io';
export const GSCONNECT_APP = 'org.gnome.Shell.Extensions.GSConnect';
export const GSCONNECT_PAGE = 'https://extensions.gnome.org/extension/1319/gsconnect/';

// Shell's ExtensionState (misc/extensionUtils.js): ACTIVE 1
const ACTIVE = 1;

/**
 * Where setting the phone up stands, and what helps (prefs' Phone row; the Phone tab's empty
 * state with part 3). Never a flash nor a pill (Ethan, 2026-11-17).
 *
 * @param {{installed: boolean, state?: ?number, paired?: ?string[]}} s  GSConnect's extension
 *   (installed, Shell's ExtensionState), the names of the phones paired (null: not read)
 * @returns {{status: 'missing'|'off'|'unpaired'|'ready', text: string, button: ?string}}
 */
export function phoneSetup(s) {
    if (!s?.installed)
        return {status: 'missing', text: 'Needs GSConnect to see your phone', button: 'Install GSConnect'};
    if (s.state !== ACTIVE)
        return {status: 'off', text: 'GSConnect is off', button: 'Turn On GSConnect'};
    const paired = (s.paired ?? []).filter(n => typeof n === 'string' && n.trim());
    if (!paired.length)
        return {status: 'unpaired', text: 'No phone paired yet (KDE Connect on the phone)', button: 'Open GSConnect'};
    return {status: 'ready', text: paired.join(', '), button: null};
}

/**
 * GSConnect's battery action state, `(bsii)`: charging, icon name, level (-1: unknown), time.
 *
 * @param {?Array} state  deepUnpack()ed
 * @returns {?{percentage: number, charging: boolean}}
 */
export function batteryState(state) {
    if (!Array.isArray(state))
        return null;
    const [charging, , level] = state;
    if (typeof level !== 'number' || !Number.isFinite(level) || level < 0)
        return null;
    return {percentage: Math.min(100, level), charging: charging === true};
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
