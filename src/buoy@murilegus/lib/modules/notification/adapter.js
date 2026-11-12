/**
 * notification adapter (docs/NOTIFICATIONS.md §2–§5): one of GNOME's notifications, at
 * the moment GNOME would have shown its banner, as a pill. Pure: the source reads Shell's
 * Notification and Source and passes plain fields plus the callbacks that act on them.
 *
 * Event: {id, title, body, markup, appName, appIcon, icon, image, at, count, critical,
 *         shared, actions, activate, onAction, expire}
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
 *   expire()     the pill's 6 s ran out (its `onExpire`): what the banner's hide does
 *   seen()       its card had its 5 s while you were there, or you hovered it (onSeen)
 *   alertDone()  its card closed, seen or missed (onAlertDone)
 *   burst        its turn's notifications (Turns), 2 and up: the card says how many
 *   alertKey     its turn's key while it has the card, else null (the kit's alertKey)
 *   alertState() the card may give way, is hovered (onAlertState)
 */

/**
 * How long a notification's pill stays (§2): its card's 5 s as an alert (the kit's ALERT_MS,
 * held while it waits for you or is hovered), then the pill 6 s (design/alerts-and-asks).
 */
export const TTL = 5000 + 6000;
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

/** Besides the card up, at most this many turns wait (GNOME's queue of 3, design/alerts-and-asks). */
export const MAX_WAITING = 2;

/**
 * A burst of notifications (design/alerts-and-asks "Nhiều thông báo cùng lúc", 2026-11-12):
 * one card at a time, in the order they came. Pure: no timers — the kit says when the card
 * up may give way (its 1 s, the pointer off it) and when it closed; the source asks step().
 *
 * - A turn: one app's notifications in a row (`count`), the newest shown (`item`). The next
 *   of the same app joins the card up while nothing waits, else the last waiting turn if
 *   it is that app's; otherwise it is a turn of its own, to keep the order.
 * - Under the pointer the card's notification stays; the count still grows.
 * - At most MAX_WAITING turns wait; more get no card (`dropped`: the app's pill only).
 *   A critical one goes first in the queue, and never shares a turn with a normal one.
 * - Every notification replaced or dropped before its card showed is `missed`.
 */
export class Turns {
    constructor() {
        /** @type {?{key: number, app: string, item: *, count: number, critical: boolean, mayYield: boolean, hovered: boolean}} */
        this.current = null;
        /** @type {{app: string, item: *, count: number, critical: boolean}[]} */
        this.waiting = [];
        this._key = 0;
    }

    /**
     * A notification came.
     *
     * @param {string} app
     * @param {*} item  the notification
     * @param {boolean} [critical]
     * @returns {{start: ?object, show: ?object, missed: *[], dropped: object[]}}  start: begin
     *   this turn now (nothing was up); show: the card up changed in place; missed: items
     *   that never get a card; dropped: turns with no card (their app's pill only)
     */
    arrive(app, item, critical = false) {
        const out = {start: null, show: null, missed: [], dropped: []};
        const t = this.current;
        critical = critical === true;
        if (!t && !this.waiting.length) {
            out.start = this._begin({app, item, count: 1, critical});
            return out;
        }
        if (t && t.item === item) {                 // an update of the one up
            out.show = t;
            return out;
        }
        if (t && t.app === app && t.critical === critical && !this.waiting.length) {
            t.count++;
            if (t.hovered) {
                out.missed.push(item);              // being read: it stays, the count grows
            } else {
                out.missed.push(t.item);
                t.item = item;
            }
            out.show = t;
            return out;
        }
        const join = critical ? this.waiting[0] : this.waiting.at(-1);
        if (join && join.app === app && join.critical === critical) {
            out.missed.push(join.item);
            join.item = item;
            join.count++;
            return out;
        }
        const turn = {app, item, count: 1, critical};
        if (critical)
            this.waiting.unshift(turn);
        else
            this.waiting.push(turn);
        while (this.waiting.length > MAX_WAITING) {
            const x = this.waiting.pop();
            out.missed.push(x.item);
            out.dropped.push(x);
        }
        return out;
    }

    /**
     * @returns {?object} the turn to begin now: nothing up and one waits, or the card up may
     *   give way and one waits (the card up is then cut short)
     */
    step() {
        if (!this.waiting.length || (this.current && !this.current.mayYield))
            return null;
        return this._begin(this.waiting.shift());
    }

    /**
     * The card closed (seen or missed).
     *
     * @param {?number} key
     * @returns {boolean} it was the card up: step() may begin the next
     */
    end(key) {
        if (key === null || key === undefined || this.current?.key !== key)
            return false;
        this.current = null;
        return true;
    }

    /**
     * The kit's word on the card up (onAlertState).
     *
     * @param {number} key
     * @param {{mayYield: boolean, hovered: boolean}} state
     * @returns {boolean} step() may begin the next now
     */
    state(key, {mayYield, hovered}) {
        const t = this.current;
        if (!t || t.key !== key)
            return false;
        t.mayYield = mayYield === true;
        t.hovered = hovered === true;
        return t.mayYield && this.waiting.length > 0;
    }

    /**
     * @param {*} item  a notification gone from GNOME's list
     * @returns {boolean} a waiting turn went with it
     */
    gone(item) {
        const before = this.waiting.length;
        this.waiting = this.waiting.filter(x => x.item !== item);
        return this.waiting.length !== before;
    }

    /**
     * @param {string} app
     * @returns {boolean} the app has the card up or a turn waiting
     */
    busy(app) {
        return this.current?.app === app || this.waiting.some(x => x.app === app);
    }

    /** @returns {*[]} every item up or waiting, all forgotten (the source's disable) */
    clear() {
        const items = [this.current?.item, ...this.waiting.map(x => x.item)].filter(x => x !== undefined);
        this.current = null;
        this.waiting = [];
        return items;
    }

    _begin(turn) {
        this.current = {...turn, key: ++this._key, mayYield: false, hovered: false};
        return this.current;
    }
}

/**
 * @param {string} app
 * @param {number} burst  the turn's notifications
 * @returns {string} the card's header: the app, and how many from 2 ("Slack · 4 messages")
 */
export function burstHeader(app, burst) {
    return Number.isInteger(burst) && burst > 1 ? `${app} · ${burst} messages` : app;
}

/**
 * A burst on a shared or recorded screen (design/alerts-and-asks "Khi chia sẻ màn hình",
 * 2026-11-12): one compact, the head only — the apps' logos stacked, "N new notifications",
 * how many from each app. No body, no picture, no button; a click opens nothing (it would
 * show the message on the shared screen); × closes it. Every one in it is missed.
 *
 * @param {object} ev
 * @param {{name: string, icon: *, count: number}[]} ev.apps  in the order they came
 * @param {number} [ev.at]  the newest's time, ms since the epoch
 * @param {function():void} [ev.close]  the close button
 * @param {function(boolean):void} [ev.alertDone]  its card closed
 * @returns {?object} presentation data, null with no notification
 */
export function sharedBurst({apps, at, close = null, alertDone = null}) {
    const list = (Array.isArray(apps) ? apps : [])
        .map(a => ({
            name: plainText(a?.name) || 'Notification', icon: a?.icon ?? ICON,
            count: Number.isInteger(a?.count) && a.count > 0 ? a.count : 0,
        }))
        .filter(a => a.count > 0);
    const total = list.reduce((sum, a) => sum + a.count, 0);
    if (!total)
        return null;
    const title = total === 1 ? 'New notification' : `${total} new notifications`;
    return {
        text: title,
        leading: list[0].icon,
        trailing: null,
        compact: {
            card: {
                icon: null, app: list.map(a => `${a.name} ${a.count}`).join(' · '),
                at: Number.isFinite(at) ? at : null,
                picture: {stack: list.map(a => a.icon)}, title, body: null, close: DISMISS,
                actionsOnHover: false,
            },
        },
        expanded: null,
        actions: [],
        minimalAction: false,
        ttl: TTL,
        needsYou: false,
        alertStays: false,
        pressFirst: true,
        onPress: () => true,          // opens nothing: the screen is shared
        onAction: id => {
            if (id === DISMISS)
                close?.();
        },
        onAlertDone: alertDone,
        attributes: {title, app: 'buoy'},
    };
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
                    icon: appIcon, app: burstHeader(app, ev.burst), at: Number.isFinite(ev.at) ? ev.at : null,
                    picture, title: text.title, body: text.body, close: DISMISS,
                    // as GNOME 50's banner: the buttons under the pointer; a critical one has
                    // them at once (design/alerts-and-asks "Thông báo")
                    actionsOnHover: !critical,
                },
            },
            expanded: null,
            actions: buttonsOf(ev.actions),
            minimalAction: false,
            ttl: critical ? 0 : TTL,
            needsYou: critical,
            alertStays: critical,     // its card stays open, with its buttons, till dealt with
            pressFirst: true,
            onPress: ev.activate ?? null,
            onAction: ev.onAction ?? null,
            onExpire: ev.expire ?? null,
            onSeen: ev.seen ?? null,
            onAlertDone: ev.alertDone ?? null,
            onAlertState: ev.alertState ?? null,
            alertKey: Number.isInteger(ev.alertKey) ? ev.alertKey : null,
            attributes: {title, body, app},
        };
    },
};
