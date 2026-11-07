/**
 * notification adapter (docs/NOTIFICATIONS.md §2–§5): one of GNOME's notifications, at
 * the moment GNOME would have shown its banner, as a pill. Pure: the source reads Shell's
 * Notification and Source and passes plain fields plus the callbacks that act on them.
 *
 * Event: {id, title, body, markup, appName, appIcon, icon, image, count, critical, shared,
 *         actions, activate, onAction}
 *   title, body  the notification's; body may be absent (a profile's `hideBody`)
 *   markup       the body is Pango markup (the freedesktop daemon's `useBodyMarkup`)
 *   appName      the source's title ("Firefox", "System")
 *   appIcon      the source's icon (a Gio.Icon or an icon name), the pill's leading
 *   icon         the notification's own themed icon, or null
 *   image        its own picture (an avatar, a thumbnail: a file or bytes icon), or null
 *   count        this pill's notifications still in GNOME's list, 1 and up
 *   critical     Urgency.CRITICAL: it needs you (no ttl)
 *   shared       the screen is shared or recorded (§5): only the app is named
 *   actions      the notification's action labels, in its order
 *   activate()   the banner's click; onAction(id) a button: `a<i>` an action, `dismiss` ×
 */

/** How long a notification's pill stays (§2), held while hovered (the kit's hold). */
export const TTL = 6000;
/** Of the notification's own actions, the compact shows the first two, then × (§3). */
export const MAX_OWN_ACTIONS = 2;
export const DISMISS = 'dismiss';

const ICON = 'preferences-system-notifications-symbolic';

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: '\''};

function decodeEntity(whole, name) {
    if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X'
            ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
}

/**
 * @param {*} text
 * @param {boolean} [markup]  Pango markup: tags dropped, entities decoded
 * @returns {string} on one line (every run of whitespace one space), trimmed; never cut
 */
export function plainText(text, markup = false) {
    if (typeof text !== 'string')
        return '';
    let t = text;
    if (markup) {
        t = t.replace(/<[^>]*>/g, '')
            .replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, decodeEntity);
    }
    return t.replace(/\s+/g, ' ').trim();
}

/**
 * The compact's buttons (§3): the first two of the notification's own actions, then ×.
 *
 * @param {*} labels  the action labels, in the notification's order
 * @returns {{id: string, label?: string, icon?: string}[]} ids `a<i>` (i its index in
 *   the notification's list) and `dismiss`
 */
export function buttonsOf(labels) {
    const own = (Array.isArray(labels) ? labels : [])
        .map((label, i) => ({id: `a${i}`, label: plainText(label)}))
        .filter(b => b.label)
        .slice(0, MAX_OWN_ACTIONS);
    return [...own, {id: DISMISS, icon: 'window-close-symbolic'}];
}

/**
 * @param {*} id  a button's id
 * @returns {?number} the index of the notification's action it runs, or null (× or
 *   unknown)
 */
export function actionIndex(id) {
    const m = /^a(\d+)$/.exec(String(id ?? ''));
    return m ? Number(m[1]) : null;
}

// GTK notification ids Files posts for its operations: the Transfers pill shows them
// (FEATURES M3 "progress", §10)
const FILES_APP = 'org.gnome.Nautilus';
const FILES_IDS = new Set(['progress', 'transfer-complete']);

/**
 * @param {*} appId  the source's app id, without `.desktop`
 * @param {*} notificationId  a GTK notification's id
 * @param {boolean} progressOn  `modules-progress`
 * @returns {boolean} another module shows this one: no pill of its own (§10)
 */
export function shownElsewhere(appId, notificationId, progressOn) {
    return progressOn === true && appId === FILES_APP && FILES_IDS.has(notificationId);
}

/**
 * @param {number} count
 * @returns {string} the compact's line on a shared screen
 */
export function sharedLine(count) {
    return count > 1 ? `${count} notifications` : 'New notification';
}

export default {
    notification(ev) {
        const app = plainText(ev.appName) || 'Notification';
        const shared = ev.shared === true;
        const title = shared ? '' : plainText(ev.title);
        const body = shared ? '' : plainText(ev.body, ev.markup === true);
        const count = Number.isInteger(ev.count) && ev.count > 0 ? ev.count : 1;
        const appIcon = ev.appIcon ?? ICON;
        const ownIcon = ev.icon ?? appIcon;
        let leading = ownIcon;
        if (!shared && ev.image)
            leading = {art: ev.image, icon: ownIcon};
        let subtitle;
        if (shared)
            subtitle = sharedLine(count);
        else if (title && body)
            subtitle = body;
        else
            subtitle = title || body ? app : null;
        const critical = ev.critical === true;
        // every output sets the same fields: an update merges (stack.update), so nothing
        // of the app's previous notification may stay
        return {
            text: title || body || app,
            leading: appIcon,
            trailing: count > 1 ? {text: String(count)} : null,
            compact: {leading, text: title || body || app, subtitle, transport: true},
            expanded: null,
            actions: buttonsOf(ev.actions),
            minimalAction: false,
            ttl: critical ? 0 : TTL,
            needsYou: critical,
            pressFirst: true,
            onPress: ev.activate ?? null,
            onAction: ev.onAction ?? null,
            attributes: {title, body, app},
        };
    },
};
