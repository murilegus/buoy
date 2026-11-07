/**
 * notification adapter (docs/NOTIFICATIONS.md §2–§5): one of GNOME's notifications, at
 * the moment GNOME would have shown its banner, as a pill. Pure: the source reads Shell's
 * Notification and Source and passes plain fields plus the callbacks that act on them.
 *
 * Event: {id, title, body, markup, appName, appIcon, icon, image, at, count, critical,
 *         shared, actions, activate, onAction}
 *   title, body  the notification's; body may be absent (a profile's `hideBody`)
 *   markup       the body is Pango markup (the freedesktop daemon's `useBodyMarkup`)
 *   appName      the source's title ("Firefox", "System")
 *   appIcon      the source's icon (a Gio.Icon or an icon name), the pill's leading
 *   icon         the notification's own themed icon, or null
 *   image        its own picture (an avatar, a thumbnail: a file or bytes icon), or null
 *   at           when it came, ms since the epoch (the card's "now", "3 min")
 *   count        this pill's notifications still in GNOME's list, 1 and up
 *   critical     Urgency.CRITICAL: it needs you (no ttl)
 *   shared       the screen is shared or recorded (§5): only the app is named
 *   actions      the notification's action labels, in its order
 *   activate()   the banner's click; onAction(id) a button: `a<i>` an action, `dismiss` ×
 */

/** How long a notification's pill stays (§2), held while hovered (the kit's hold). */
export const TTL = 6000;
/** Of the notification's own actions, the card shows the first three (§3); × is its header's. */
export const MAX_OWN_ACTIONS = 3;
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
 * The card's buttons (§3): the notification's own actions, the first three. × is the
 * card's header (`close`), not one of them.
 *
 * @param {*} labels  the action labels, in the notification's order
 * @returns {{id: string, label: string}[]} ids `a<i>`, i its index in the notification's list
 */
export function buttonsOf(labels) {
    return (Array.isArray(labels) ? labels : [])
        .map((label, i) => ({id: `a${i}`, label: plainText(label)}))
        .filter(b => b.label)
        .slice(0, MAX_OWN_ACTIONS);
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

/** A notification that sat this long in GNOME's queue waited for the screen (§1). */
export const HELD_MS = 2000;

/**
 * Shell takes a notification out of its queue in the same call that put it there, unless
 * it holds the queue: a full-screen window, a busy session, the lock screen (§1). One that
 * waited shows as a pill when the screen is back but stays unseen, so the tab counts it
 * as missed (§6).
 *
 * @param {*} queuedAt  when it entered the queue, monotonic ms; unknown: not held
 * @param {number} now  monotonic ms
 * @returns {boolean} it waited in the queue
 */
export function waitedInQueue(queuedAt, now) {
    return Number.isFinite(queuedAt) && Number.isFinite(now) && now - queuedAt >= HELD_MS;
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

/**
 * The card's title and body (§3): the title; with none, the body takes its place.
 *
 * @param {string} title  plain
 * @param {string} body  plain, on one line
 * @param {string} app
 * @returns {{title: string, body: ?string}}
 */
export function cardText(title, body, app) {
    if (title)
        return {title, body: body || null};
    return {title: body || app, body: null};
}

/**
 * The Notifications tab's stacks (§6): one per app, the app with the newest notification
 * first, newest first inside — the first item is the stack's face. Ties keep the given
 * order.
 *
 * @param {{app: string, appName: string, at: number, missed: boolean}[]} items  one per
 *   notification in Shell's list; `missed`: unseen when the tab opened
 * @returns {{groups: {app: string, appName: string, items: object[], missed: number}[],
 *   missed: number, total: number}}
 */
export function stackGroups(items) {
    const newest = (a, b) => b.at - a.at;
    const byApp = new Map();
    for (const i of items) {
        if (!byApp.has(i.app))
            byApp.set(i.app, {app: i.app, appName: i.appName, items: [], missed: 0});
        const g = byApp.get(i.app);
        g.items.push(i);
        if (i.missed)
            g.missed++;
    }
    const groups = [...byApp.values()];
    groups.forEach(g => g.items.sort(newest));
    groups.sort((a, b) => b.items[0].at - a.items[0].at);
    return {groups, missed: items.filter(i => i.missed).length, total: items.length};
}

/**
 * @param {number} n
 * @returns {string} the tab bar's count: "1 notification", "5 notifications"
 */
export function countText(n) {
    return n === 1 ? '1 notification' : `${n} notifications`;
}

/**
 * A tab row's two lines (§6): as the card's, one line each; on a shared screen the app is
 * named and nothing of the message (§5).
 *
 * @param {object} n
 * @param {*} n.title
 * @param {*} n.body
 * @param {boolean} [n.markup]
 * @param {*} n.appName
 * @param {boolean} [shared]
 * @returns {{title: string, body: ?string}}
 */
export function rowText({title, body, markup = false, appName}, shared = false) {
    const app = plainText(appName) || 'Notification';
    if (shared)
        return {title: app, body: sharedLine(1)};
    return cardText(plainText(title), plainText(body, markup), app);
}

export default {
    notification(ev) {
        const app = plainText(ev.appName) || 'Notification';
        const shared = ev.shared === true;
        const title = shared ? '' : plainText(ev.title);
        const body = shared ? '' : plainText(ev.body, ev.markup === true);
        const count = Number.isInteger(ev.count) && ev.count > 0 ? ev.count : 1;
        const appIcon = ev.appIcon ?? ICON;
        let picture = ev.icon ?? null;
        if (!shared && ev.image)
            picture = {art: ev.image, icon: ev.icon ?? appIcon};
        const text = shared ? {title: sharedLine(count), body: null} : cardText(title, body, app);
        const critical = ev.critical === true;
        // every output sets the same fields: an update merges (stack.update), so nothing
        // of the app's previous notification may stay
        return {
            text: title || body || app,
            leading: appIcon,
            trailing: count > 1 ? {text: String(count)} : null,
            compact: {
                card: {
                    icon: appIcon, app, at: Number.isFinite(ev.at) ? ev.at : null,
                    picture, title: text.title, body: text.body, close: DISMISS,
                },
            },
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
