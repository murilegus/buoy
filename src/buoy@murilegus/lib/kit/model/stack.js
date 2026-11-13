import GLib from 'gi://GLib';

import {DEFAULT_LINGER, FEEDBACK, tierOf, validate} from './activity.js';
import {privacyDot} from './presentation.js';

/**
 * ActivityStack: which activity is on the island right now (CONTRACT.md §1, SPEC §2).
 *
 *   surface(activity) → id · update(id, patch, {alert}) · end(id, {dismissal})
 *   schedule(activity, startAt) → id · ask(id, question, options, opts) → Promise<choice>
 *   answer(id, choice) · wake(id) · dismiss(id) · setHiddenApps(slugs) · setUnseen(bool) ·
 *   setAway(bool)
 *   seeMissed() · openMissed(id, at) · clearMissed() · setPrivacy({mic, cam, screen})
 *   has(id) · get(id) · hold(id, held)
 *
 * Rules:
 *   - every activity goes through validate(); priority defaults from activity.js PRIORITY
 *   - the order is docs/PRIORITY.md's (2026-11-07): tier (needs you › running › waiting,
 *     activity.js tierOf), then priority, then fresh before stale, then the most recently
 *     surfaced; the newest feedback (osd,
 *     copied) goes first unless an ask is on top, and covers pill 1 only (pillWindow)
 *   - end removes immediately; ttl (capped at 8 h by validate) ends it; ttl 0 = until ended;
 *     an activity's `onExpire()` runs after its ttl ended it, never on end() (GNOME's
 *     transient notifications go when their banner would have, 2026-11-08)
 *     hold(id, true) — the pointer on its pill — pauses the ttl, hold(id, false) gives it
 *     a fresh one (SPEC §2e: hover holds feedback)
 *   - staleAfter ms without update → `isStale`; update clears it
 *   - `linger: true` (it only waits: paused, done, waiting for you) → it ends after
 *     setLinger(ms) (`activity-linger`, 5 min) without an update; each update starts the
 *     wait again; the pointer on its pill holds it, as a ttl (2026-11-07)
 *   - style 'transient' asks the island to open expanded and ends when it collapses
 *   - alert (on surface, or update(..., {alert: true})) is one-shot; a covered activity's
 *     alert brings it up for ALERT_MS, then the real top returns
 *   - apps-hidden is a filter: hidden activities stay live but never reach the island;
 *     so is an activity's own `hidden: true` (an agent's session while its ask stands for
 *     it, CODING-AGENTS.md §4, 2026-11-07): live, timed, never drawn, never missed
 *   - while unseen (fullscreen) an ending activity goes to the missed history
 *     (last 5), except osd/copied (feedback for your own action) and ask (red light)
 *   - while away (GNOME's session idle, or Do Not Disturb: setAway) an ending goes to the
 *     missed history too, but the island still gets alerts and asks: it decides (an
 *     ordinary alert gets no card while you are away, a critical one and an ask wait for
 *     you, design/alerts-and-asks "Khi nào đã xem, khi nào bị nhỡ")
 *   - while unseen the island gets no alert and no expand: an ask must not open in a
 *     hidden pill, where any click in the fullscreen app would collapse it; only the red
 *     light. Seen again, an ask or transient on top opens as if it had just arrived
 *   - light: 'waiting' (an unanswered ask is not visible) › 'missed' › 'off'; 'missed'
 *     lasts until the history is seen (Home shows it) or cleared, not as long as it exists,
 *     or while a source flags something of its own unseen (flagMissed: GNOME's
 *     notifications nobody has seen, docs/NOTIFICATIONS.md §2, 2026-11-08)
 *   - dot: the privacy dot, from what the privacy module says is in use (setPrivacy):
 *     'screen' › 'cam' › 'mic' › null (presentation.js privacyDot, INDICATORS)
 *
 * The island (renderer) receives render(list, {alert, expand}) — every visible activity,
 * centre pill first; it shows the first `island.capacity` (side-by-side, SPEC §2c) — and
 * optionally setLight(light) and setDot(dot). alert/expand carry an activity id or null. No Shell import: timers come from `clock`, so the
 * whole thing runs under plain gjs in tests.
 */

/**
 * The pill order (docs/PRIORITY.md §1): tier, priority, fresh before stale, newest.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function order(a, b) {
    return tierOf(a) - tierOf(b) || b.priority - a.priority ||
        Number(a.isStale) - Number(b.isStale) || b._seq - a._seq;
}

/** How long an alert keeps an activity up, its compact open (design/alerts-and-asks: 5 s). */
export const ALERT_MS = 5000;
/**
 * The least an alert's card shows before another waiting may take its place: a burst's turn
 * (design/alerts-and-asks "Nhiều thông báo cùng lúc": 1 s).
 */
export const ALERT_TURN_MS = 1000;

const MAX_DELAY = 2 ** 31 - 1;          // GLib timeouts are 32-bit ms; longer waits re-arm
const MISSED_MAX = 5;
const NOT_MISSABLE = new Set([...FEEDBACK, 'ask']);
// What an asker may set on its ask's look (ask() `look`); the rest is the stack's
const ASK_LOOK = ['leading', 'trailing', 'compact', 'expanded', 'minimalAction', 'keyline'];

/**
 * Which activities get a pill (SPEC §2c, §2e): the first `cap` in order, except that
 * feedback first takes pill 1 *in place of* the next one — that one is covered, not
 * pushed aside, so the side pills keep their activities and the +N badge its count, and
 * when the feedback ends the covered pill comes back where it was. The island and the
 * stack both use this, so what the stack thinks is shown is what the island shows.
 *
 * @param {object[]} list  visible activities, in order (ActivityStack render())
 * @param {number} cap  island.capacity
 * @returns {{shown: object[], more: number}}
 */
export function pillWindow(list, cap) {
    cap = Math.max(1, cap);
    if (list.length > 1 && FEEDBACK.has(list[0].kind)) {
        const others = list.length - 1;            // the covered one counts as shown
        return {shown: [list[0], ...list.slice(2, cap + 1)], more: Math.max(0, others - cap)};
    }
    return {shown: list.slice(0, cap), more: Math.max(0, list.length - cap)};
}

/** Default clock: wall time + GLib main-loop timeouts. */
export const glibClock = {
    now: () => Date.now(),
    timeout(ms, fn) {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            fn();
            return GLib.SOURCE_REMOVE;
        });
    },
    cancel(id) {
        GLib.source_remove(id);
    },
};

export class ActivityStack {
    /**
     * @param {object} island  renderer: render(list, info), capacity, optional setLight()
     * @param {object} [opts]
     * @param {object} [opts.clock]  {now, timeout, cancel}; glibClock by default
     * @param {string[]} [opts.hiddenApps]  initial `apps-hidden`
     */
    constructor(island, {clock = glibClock, hiddenApps = []} = {}) {
        this._island = island;
        this._clock = clock;
        this._items = new Map();      // id → activity
        this._timers = new Map();     // `${id}\n${what}` → clock handle
        this._held = new Set();       // ids whose pill the pointer is on: ttl paused
        this._scheduled = new Set();  // ids waiting for their start
        this._asks = new Map();       // id → {resolve, options, dismissed}
        this._hidden = new Set(hiddenApps);
        this._unseen = false;
        this._away = false;
        this._seenWaiters = new Set();   // whenSeen
        this._missed = [];
        this._missedNew = false;     // something was missed since the history was last seen
        this._flags = new Map();     // sources with something unseen of their own (flagMissed): key → row
        this._seq = 0;
        this._shown = null;           // id of the centre pill
        this._shownIds = [];          // ids of every pill the island shows
        this._more = 0;               // visible activities beyond them (+N)
        this._promoted = null;        // covered activity brought up by an alert
        this._light = 'off';
        this._dot = null;
        this._lingerMs = DEFAULT_LINGER;
    }

    /**
     * @param {number} ms  `activity-linger`: how long a waiting activity stays without news;
     *   applies from each activity's next surface or update
     */
    setLinger(ms) {
        if (Number.isFinite(ms) && ms > 0)
            this._lingerMs = ms;
    }

    // --- lifecycle ----------------------------------------------------------

    surface(activity) {
        const a = validate(activity);
        this._drop(a.id);
        a._seq = ++this._seq;
        a.isStale = false;
        this._wrapExpand(a, activity.onExpand);
        this._items.set(a.id, a);
        if (a.ttl > 0 && !this._held.has(a.id))
            this._arm(a.id, 'ttl', a.ttl, () => this._expire(a.id));
        this._armStale(a);
        this._armLinger(a);
        this._render({changed: a.id, alert: a.alert ? a.id : null});
        return a.id;
    }

    update(id, patch, {alert = false} = {}) {
        const old = this._items.get(id);
        if (!old)
            return false;
        if (('id' in patch && patch.id !== id) || ('kind' in patch && patch.kind !== old.kind))
            throw new Error(`update(${id}) cannot change id or kind`);

        const a = validate({...old, ...patch}); // state is a key: a patch replaces it whole
        a._seq = old._seq;
        a.isStale = false;
        this._wrapExpand(a, 'onExpand' in patch ? patch.onExpand : old._ownExpand);
        this._items.set(id, a);
        if ('ttl' in patch && !this._held.has(id)) {
            this._disarm(id, 'ttl');
            if (a.ttl > 0)
                this._arm(id, 'ttl', a.ttl, () => this._expire(id));
        }
        this._armStale(a);
        this._armLinger(a);
        this._render({changed: id, alert: alert || patch.alert === true ? id : null});
        return true;
    }

    /**
     * Removes the activity from the pill at once (Apple: the Island never lingers).
     *
     * @param {string} id
     * @param {object} [_opts]  {dismissal}: kept for the D-Bus signature; the pill ignores it
     * @returns {boolean} whether something was live or scheduled
     */
    end(id, _opts = {}) {
        if (this._scheduled.delete(id)) {
            this._disarm(id, 'start');
            return true;
        }
        const a = this._items.get(id);
        if (!a)
            return false;
        this._drop(id);
        const ask = this._asks.get(id); // still pending: the caller ended it
        if (ask) {
            this._asks.delete(id);
            ask.resolve(null);
        }
        if ((this._unseen || this._away) && !this._hidden.has(a.app) && a.hidden !== true && !NOT_MISSABLE.has(a.kind))
            this._recordMissed(a);
        this._render();
        return true;
    }

    /**
     * @param {object} activity
     * @param {number} startAt  wall-clock ms (Date.now() scale)
     * @returns {string} id
     */
    schedule(activity, startAt) {
        const a = validate(activity); // fail now, not at start time
        this.end(a.id);
        this._scheduled.add(a.id);
        const fire = () => {
            const left = startAt - this._clock.now();
            if (left > 0) {
                this._arm(a.id, 'start', left, fire); // re-checks after a clamped wait
                return;
            }
            this._scheduled.delete(a.id);
            this.surface({...activity, alert: true}); // Apple requires an alert for scheduled
        };
        fire();
        return a.id;
    }

    /**
     * A question with buttons; resolves with the chosen option, `fallback` on timeout,
     * or null when the caller ends it (or re-asks the same id).
     *
     * @param {string} id
     * @param {string} question
     * @param {string[]} options
     * @param {object} [opts]
     * @param {string} [opts.app]  slug of the asking app
     * @param {number} [opts.timeoutMs]  0 = wait forever
     * @param {?string} [opts.fallback]  answer on timeout (agent module: 10 min → deny)
     * @param {object} [opts.look]  how it looks beyond the question: `leading`, `trailing`,
     *   `compact`, `expanded`, `minimalAction`, `keyline` (presentation data; Bu leading,
     *   CODING-AGENTS.md §4)
     * @param {boolean} [opts.quiet]  never jumps open nor alerts: it waits in its pill,
     *   answered from the compact or a click (the asker's own window is focused, §6)
     * @param {?Function} [opts.onInput]  (id, value) for what the ask's look sends that is
     *   not one of `options` — a choice picked, text typed, Next (a card of choices,
     *   design/alerts-and-asks "Hỏi nhiều lựa chọn"); the asker may then update() the ask's
     *   `compact` and `actions`, which need not be `options` (only those answer)
     * @returns {Promise<?string>}
     */
    ask(id, question, options, {app = 'system', timeoutMs = 0, fallback = null, look = {}, quiet = false, onInput = null} = {}) {
        if (!options?.length)
            throw new Error(`ask(${id}) needs at least one option`);
        this._settle(id, null);
        // every ask is a card at the compact's size, held until answered: Bu, the question,
        // the buttons (design/alerts-and-asks "Ask"); a caller's own `compact` replaces it
        const own = {compact: {card: {picture: {mascot: 'ask'}, title: question}}};
        for (const k of ASK_LOOK) {
            if (look && k in look)
                own[k] = look[k];
        }
        return new Promise(resolve => {
            this._asks.set(id, {resolve, options, dismissed: false});
            this.surface({
                id, kind: 'ask', app, text: question, alert: !quiet, expanded: true, ...own, quiet: !!quiet,
                actions: options.map(o => ({id: o, label: o})),
                // ui/present/ buttons; the rest of the look's input goes to the asker
                onAction: (choice, value) => options.includes(choice)
                    ? this.answer(id, choice) : this._asks.has(id) && onInput?.(choice, value),
            });
            if (timeoutMs > 0)
                this._arm(id, 'ask', timeoutMs, () => this._settle(id, fallback));
        });
    }

    /**
     * A quiet ask speaks up: it opens as an ask arriving would (CODING-AGENTS.md §4: the
     * asker's window lost the focus). On top it opens expanded; covered, it alerts, which
     * brings it up; unseen, it opens when seen again.
     *
     * @param {string} id
     * @returns {boolean} it was a quiet ask
     */
    wake(id) {
        const a = this._items.get(id);
        if (!this._asks.has(id) || !a?.quiet)
            return false;
        a.quiet = false;
        if (this._unseen)
            return true;
        const list = this._visibleList();
        if (list[0]?.id === id)
            this._island.render(list, {alert: null, expand: id});
        else
            this._render({changed: id, alert: id});
        return true;
    }

    answer(id, choice) {
        if (!this._asks.get(id)?.options.includes(choice))
            return false;
        return this._settle(id, choice);
    }

    /**
     * User dismissed the pill: an ask stays pending (red light), anything else ends.
     *
     * @param {string} id
     * @returns {boolean}
     */
    dismiss(id) {
        const ask = this._asks.get(id);
        if (!ask)
            return this.end(id);
        ask.dismissed = true;
        this._render();
        return true;
    }

    // --- filters and the buoy light -------------------------------------------

    setHiddenApps(slugs) {
        this._hidden = new Set(slugs);
        this._render();
    }

    /** @param {boolean} unseen  the island hidden (fullscreen): endings now count as missed */
    /**
     * Run `fn` once the island is seen: now, or when it comes back (a fullscreen window
     * left). The greeting waits for it rather than skipping (GREETING.md §11).
     *
     * @param {function(): void} fn
     * @returns {function(): void} cancel
     */
    whenSeen(fn) {
        if (!this._unseen) {
            fn();
            return () => {};
        }
        this._seenWaiters.add(fn);
        return () => this._seenWaiters.delete(fn);
    }

    /** @returns {boolean} the island is not seen (fullscreen) */
    get unseen() {
        return this._unseen;
    }

    setUnseen(unseen) {
        const back = this._unseen && !unseen;
        this._unseen = !!unseen;
        if (back) {
            const waiting = [...this._seenWaiters];
            this._seenWaiters.clear();
            waiting.forEach(fn => fn());
        }
        const top = back ? this._visibleList()[0] : null;
        if (top && !top.quiet && (top.kind === 'ask' || top.style === 'transient'))
            this._island.render(this._visibleList(), {alert: null, expand: top.id});
        this._updateLight();
    }

    /**
     * The red light's ask: the newest one not on screen (dismissed, or the island hidden),
     * still unanswered — its activity, whose card the centre pill shows on hover
     * (INDICATORS "Buoy light", 2026-11-13); null when none.
     *
     * @returns {?object}
     */
    get waiting() {
        let last = null;
        for (const [id, ask] of this._asks) {
            if (this._unseen || ask.dismissed || !this._shownIds.includes(id))
                last = this._items.get(id) ?? last;
        }
        return last;
    }

    /** @returns {boolean} you are away or in Do Not Disturb (setAway) */
    get away() {
        return this._away;
    }

    /**
     * Away from the screen — GNOME's session idle, after `idle-delay` — or in Do Not
     * Disturb: what ends now counts as missed (the amber light, Home's Missed). Unlike
     * setUnseen, alerts and asks still go to the island, which knows whether you are there.
     * The lock screen needs no call: Buoy is disabled while locked (no `session-modes`).
     *
     * @param {boolean} away
     */
    setAway(away) {
        this._away = !!away;
    }

    /**
     * A source's own unseen things keep the amber light on, outside the missed history:
     * the light follows the flag, not Home (GNOME's notifications nobody has seen, which
     * the Notifications tab lists and marks seen).
     *
     * @param {string} key  the source's, one flag each
     * @param {boolean} on
     * @param {object} [row]  how Home's Missed list shows it (design/home "Bị nhỡ và +K"):
     *   {count, title, detail, tab, icons} — "Notifications · 3", "Slack, Zalo", the tab a click
     *   opens, the apps' icons as strings (the Missed tile's corner)
     */
    flagMissed(key, on, row = {}) {
        if (on)
            this._flags.set(key, {...row});
        else
            this._flags.delete(key);
        this._updateLight();
    }

    /** @returns {{key: string, count: number, title: string, detail: ?string, tab: ?string, icons: string[]}[]} the flags, as Home lists them */
    get missedFlags() {
        return [...this._flags].map(([key, r]) => ({
            key, count: Number.isInteger(r.count) && r.count > 0 ? r.count : 1,
            title: typeof r.title === 'string' && r.title ? r.title : key,
            detail: typeof r.detail === 'string' && r.detail ? r.detail : null,
            tab: typeof r.tab === 'string' && r.tab ? r.tab : null,
            icons: Array.isArray(r.icons) ? r.icons.filter(i => typeof i === 'string' && i) : [],
        }));
    }

    /** Home showed the missed history: the light goes off, the list stays. */
    seeMissed() {
        this._missedNew = false;
        this._updateLight();
    }

    /**
     * A missed row was opened (Home → its tab): it leaves the history, as an activated
     * system notification does (2026-11-03).
     *
     * @param {string} id
     * @param {number} at  when it ended (an id can be missed more than once)
     * @returns {boolean} found
     */
    openMissed(id, at) {
        const i = this._missed.findIndex(m => m.id === id && m.at === at);
        if (i < 0)
            return false;
        this._missed.splice(i, 1);
        if (!this._missed.length)
            this._missedNew = false;
        this._updateLight();
        return true;
    }

    /** The user cleared the history (× in Home). */
    clearMissed() {
        this._missed = [];
        this._missedNew = false;
        this._updateLight();
    }

    /**
     * @param {string} id
     * @returns {boolean} live or scheduled
     */
    /**
     * The pointer is on this activity's pill: its ttl waits (SPEC §2e, "hover holds it");
     * let go, it gets the whole ttl again. Unknown ids and ttl 0 do nothing.
     *
     * @param {string} id
     * @param {boolean} held
     */
    hold(id, held) {
        const a = this._items.get(id);
        if (!a) {
            this._held.delete(id);
            return;
        }
        if (held === this._held.has(id))
            return;
        if (held) {
            this._held.add(id);
            this._disarm(id, 'ttl');
            this._disarm(id, 'linger');
        } else {
            this._held.delete(id);
            if (a.ttl > 0)
                this._arm(id, 'ttl', a.ttl, () => this._expire(id));
            this._armLinger(a);
        }
    }

    has(id) {
        return this._items.has(id) || this._scheduled.has(id);
    }

    /**
     * @param {string} id
     * @returns {?object} the live activity (read only), or null
     */
    get(id) {
        return this._items.get(id) ?? null;
    }

    /**
     * The first live activity a test accepts (read only): what another module already shows
     * (the notification module asks for an agent's session, NOTIFICATIONS.md §10).
     *
     * @param {function(object): boolean} test
     * @returns {?object}
     */
    find(test) {
        for (const a of this._items.values()) {
            if (test(a))
                return a;
        }
        return null;
    }

    get missed() {
        return this._missed.map(m => ({...m}));
    }

    get light() {
        return this._light;
    }

    /** @returns {?string} the privacy dot: 'screen' | 'cam' | 'mic' | null */
    get dot() {
        return this._dot;
    }

    /**
     * What the machine's microphone, camera and screen are doing (the privacy module's
     * source); the island draws one dot for it at pill 1's right end.
     *
     * @param {object} [use]  {mic, cam, screen}: true while in use
     */
    setPrivacy(use = {}) {
        const dot = privacyDot(use);
        if (dot === this._dot)
            return;
        this._dot = dot;
        this._island.setDot?.(dot);
    }

    /** Re-render, e.g. when the island's capacity changed. */
    refresh() {
        this._render();
    }

    get top() {
        return this._shown ? this._items.get(this._shown) : null;
    }

    destroy() {
        for (const handle of this._timers.values())
            this._clock.cancel(handle);
        this._timers.clear();
        this._seenWaiters.clear();
        for (const ask of this._asks.values())
            ask.resolve(null);
        this._asks.clear();
        this._items.clear();
        this._scheduled.clear();
        this._shown = null;
        this._shownIds = [];
        this._more = 0;
    }

    // --- internals ----------------------------------------------------------

    // The ttl ran out: end it, then tell its owner (`onExpire`).
    _expire(id) {
        const a = this._items.get(id);
        if (!this.end(id))
            return;
        a?.onExpire?.();
    }

    // Remove without rendering or history (replacement, end). Leaves _asks alone:
    // ask() registers the question before surface() replaces any old activity.
    _drop(id) {
        for (const what of ['ttl', 'stale', 'linger', 'ask', 'promote'])
            this._disarm(id, what);
        this._items.delete(id);
        this._held.delete(id);
        if (this._promoted === id)
            this._promoted = null;
    }

    _settle(id, value) {
        const ask = this._asks.get(id);
        if (!ask)
            return false;
        this._asks.delete(id);
        ask.resolve(value);
        this.end(id);
        return true;
    }

    _wrapExpand(a, own) {
        a._ownExpand = own;
        a.onExpand = a.style === 'transient'
            ? on => {
                own?.(on);
                if (!on)
                    this.end(a.id);
            }
            : own;
    }

    // A waiting activity's end, from now: every surface and update is news
    _armLinger(a) {
        this._disarm(a.id, 'linger');
        if (a.linger === true && !this._held.has(a.id))
            this._arm(a.id, 'linger', this._lingerMs, () => this.end(a.id));
    }

    _armStale(a) {
        this._disarm(a.id, 'stale');
        if (a.staleAfter > 0) {
            this._arm(a.id, 'stale', a.staleAfter, () => {
                a.isStale = true;
                this._render({changed: a.id});
            });
        }
    }

    _arm(id, what, ms, fn) {
        this._disarm(id, what);
        const key = `${id}\n${what}`;
        // clamp: schedule() re-checks and re-arms; for stale/ask ~24 days is plenty
        this._timers.set(key, this._clock.timeout(Math.min(ms, MAX_DELAY), () => {
            this._timers.delete(key); // fired: must never be cancelled again
            fn();
        }));
    }

    _disarm(id, what) {
        const key = `${id}\n${what}`;
        const handle = this._timers.get(key);
        if (handle !== undefined) {
            this._timers.delete(key);
            this._clock.cancel(handle);
        }
    }

    _recordMissed(a) {
        this._missed.unshift({
            id: a.id, kind: a.kind, app: a.app,
            text: a.text ?? a.attributes?.title ?? a.kind,
            at: this._clock.now(),
        });
        this._missed.length = Math.min(this._missed.length, MISSED_MAX);
        this._missedNew = true;
    }

    _visible(a) {
        return a.hidden !== true && !this._hidden.has(a.app) && !this._asks.get(a.id)?.dismissed;
    }

    // Every visible activity in the pill order (docs/PRIORITY.md, `order`); an alerted
    // activity brought up by _promote() goes first.
    _visibleList() {
        const list = [...this._items.values()].filter(a => this._visible(a))
            .sort(order);
        const promoted = list.find(a => a.id === this._promoted);
        if (promoted)
            return [promoted, ...list.filter(a => a !== promoted)];
        // the newest feedback takes pill 1 over every kind but ask (SPEC §2e)
        const feedback = list.filter(a => FEEDBACK.has(a.kind)).sort((a, b) => b._seq - a._seq)[0];
        if (feedback && list[0].kind !== 'ask')
            return [feedback, ...list.filter(a => a !== feedback)];
        return list;
    }

    get _capacity() {
        return Math.max(1, this._island.capacity ?? 1);
    }

    _render({changed = null, alert = null} = {}) {
        const asked = alert;
        if (this._unseen)
            alert = null;            // the island is hidden: nothing to draw attention to
        if (alert)
            this._promote(alert);
        const list = this._visibleList();
        const win = pillWindow(list, this._capacity);
        const shown = win.shown.map(a => a.id);
        const more = win.more;
        const prev = this._shownIds;
        const prevMore = this._more;
        this._shownIds = shown;
        this._more = more;
        const primary = shown[0] ?? null;
        const prevPrimary = this._shown;
        this._shown = primary;

        if (!list.length) {
            if (prev.length)
                this._island.render([], {});
        } else if (shown.join('\n') !== prev.join('\n') || more !== prevMore ||
                   shown.includes(changed) || shown.includes(alert)) {
            const top = list[0];
            this._island.render(list, {
                alert: shown.includes(alert) ? alert : null,
                // transient (CONTRACT.md §1) and ask (all options are only in expanded)
                // open expanded when they reach the centre pill
                // a quiet ask waits in its pill (ask() `quiet`)
                expand: (top.style === 'transient' || top.kind === 'ask') && !top.quiet && top.id !== prevPrimary &&
                    !this._unseen ? top.id : null,
            });
        }

        this._updateLight();
        // an alert that gets no card (the island hidden, the activity not shown) is done at
        // once, unseen: its owner moves on (a burst of notifications, design/alerts-and-asks)
        if (asked && !(list.length && shown.includes(alert)))
            this._items.get(asked)?.onAlertDone?.(false);
    }

    // An alert on an activity the island is not showing brings it to the centre for
    // ALERT_MS; a newer one replaces it. Shown pills alert in place (SPEC §2c).
    _promote(id) {
        const a = this._items.get(id);
        if (!a || !this._visible(a))
            return;
        const index = this._visibleList().filter(x => x.id !== this._promoted).indexOf(a);
        if (index < this._capacity && this._promoted !== id)
            return;
        if (this._promoted)
            this._disarm(this._promoted, 'promote');
        this._promoted = id;
        this._arm(id, 'promote', ALERT_MS, () => {
            this._promoted = null;
            this._render();
        });
    }

    _updateLight() {
        let light = this._missedNew || this._flags.size ? 'missed' : 'off';
        for (const [id, ask] of this._asks) {
            if (this._unseen || ask.dismissed || !this._shownIds.includes(id)) {
                light = 'waiting';
                break;
            }
        }
        if (light !== this._light) {
            this._light = light;
            this._island.setLight?.(light);
        }
    }
}
