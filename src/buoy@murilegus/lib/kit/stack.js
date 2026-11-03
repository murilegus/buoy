import GLib from 'gi://GLib';

import {validate} from './activity.js';

/**
 * ActivityStack: which activity is on the island right now (APPLE.md §B1, SPEC §2).
 *
 *   surface(activity) → id · update(id, patch, {alert}) · end(id, {dismissal})
 *   schedule(activity, startAt) → id · ask(id, question, options, opts) → Promise<choice>
 *   answer(id, choice) · dismiss(id) · setHiddenApps(slugs) · setUnseen(bool)
 *   seeMissed() · clearMissed()
 *   has(id) · get(id)
 *
 * Rules:
 *   - every activity goes through validate(); priority defaults from activity.js PRIORITY
 *   - highest priority shows; ties → most recently surfaced
 *   - end removes immediately; ttl (capped at 8 h by validate) ends it; ttl 0 = until ended
 *   - staleAfter ms without update → `isStale`; update clears it
 *   - style 'transient' asks the island to open expanded and ends when it collapses
 *   - alert (on surface, or update(..., {alert: true})) is one-shot; a covered activity's
 *     alert brings it up for ALERT_MS, then the real top returns
 *   - apps-hidden is a filter: hidden activities stay live but never reach the island
 *   - while unseen (fullscreen, away, DND) an ending activity goes to the missed history
 *     (last 5), except osd/copied (feedback for your own action) and ask (red light)
 *   - while unseen the island gets no alert and no expand: an ask must not open in a
 *     hidden pill, where any click in the fullscreen app would collapse it; only the red
 *     light. Seen again, an ask or transient on top opens as if it had just arrived
 *   - light: 'waiting' (an unanswered ask is not visible) › 'missed' › 'off'; 'missed'
 *     lasts until the history is seen (Home shows it) or cleared, not as long as it exists
 *
 * The island (renderer) receives render(list, {alert, expand}) — every visible activity,
 * centre pill first; it shows the first `island.capacity` (side-by-side, SPEC §2c) — and
 * optionally setLight(light). alert/expand carry an activity id or null. No Shell import: timers come from `clock`, so the
 * whole thing runs under plain gjs in tests.
 */

/** How long an alert keeps an activity up / expanded (SPEC §2c: ~2 s). */
export const ALERT_MS = 2000;

const MAX_DELAY = 2 ** 31 - 1;          // GLib timeouts are 32-bit ms; longer waits re-arm
const MISSED_MAX = 5;
const NOT_MISSABLE = new Set(['osd', 'copied', 'ask']);

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
        this._scheduled = new Set();  // ids waiting for their start
        this._asks = new Map();       // id → {resolve, options, dismissed}
        this._hidden = new Set(hiddenApps);
        this._unseen = false;
        this._missed = [];
        this._missedNew = false;     // something was missed since the history was last seen
        this._seq = 0;
        this._shown = null;           // id of the centre pill
        this._shownIds = [];          // ids of every pill the island shows
        this._more = 0;               // visible activities beyond them (+N)
        this._promoted = null;        // covered activity brought up by an alert
        this._light = 'off';
    }

    // --- lifecycle ----------------------------------------------------------

    surface(activity) {
        const a = validate(activity);
        this._drop(a.id);
        a._seq = ++this._seq;
        a.isStale = false;
        this._wrapExpand(a, activity.onExpand);
        this._items.set(a.id, a);
        if (a.ttl > 0)
            this._arm(a.id, 'ttl', a.ttl, () => this.end(a.id));
        this._armStale(a);
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
        if ('ttl' in patch) {
            this._disarm(id, 'ttl');
            if (a.ttl > 0)
                this._arm(id, 'ttl', a.ttl, () => this.end(id));
        }
        this._armStale(a);
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
        if (this._unseen && !this._hidden.has(a.app) && !NOT_MISSABLE.has(a.kind))
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
     * @param {?string} [opts.fallback]  answer on timeout (ask module: 10 min → deny)
     * @returns {Promise<?string>}
     */
    ask(id, question, options, {app = 'system', timeoutMs = 0, fallback = null} = {}) {
        if (!options?.length)
            throw new Error(`ask(${id}) needs at least one option`);
        this._settle(id, null);
        return new Promise(resolve => {
            this._asks.set(id, {resolve, options, dismissed: false});
            this.surface({
                id, kind: 'ask', app, text: question, alert: true, expanded: true,
                actions: options.map(o => ({id: o, label: o})),
                onAction: choice => this.answer(id, choice), // present.js buttons
            });
            if (timeoutMs > 0)
                this._arm(id, 'ask', timeoutMs, () => this._settle(id, fallback));
        });
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

    /** @param {boolean} unseen  fullscreen, away or DND: endings now count as missed */
    setUnseen(unseen) {
        const back = this._unseen && !unseen;
        this._unseen = !!unseen;
        const top = back ? this._visibleList()[0] : null;
        if (top && (top.kind === 'ask' || top.style === 'transient'))
            this._island.render(this._visibleList(), {alert: null, expand: top.id});
        this._updateLight();
    }

    /** Home showed the missed history: the light goes off, the list stays. */
    seeMissed() {
        this._missedNew = false;
        this._updateLight();
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

    get missed() {
        return this._missed.map(m => ({...m}));
    }

    get light() {
        return this._light;
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

    // Remove without rendering or history (replacement, end). Leaves _asks alone:
    // ask() registers the question before surface() replaces any old activity.
    _drop(id) {
        for (const what of ['ttl', 'stale', 'ask', 'promote'])
            this._disarm(id, what);
        this._items.delete(id);
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
        return !this._hidden.has(a.app) && !this._asks.get(a.id)?.dismissed;
    }

    // Every visible activity, highest priority first (ties → most recent); an alerted
    // activity brought up by _promote() goes first.
    _visibleList() {
        const list = [...this._items.values()].filter(a => this._visible(a))
            .sort((a, b) => b.priority - a.priority || b._seq - a._seq);
        const promoted = list.find(a => a.id === this._promoted);
        return promoted ? [promoted, ...list.filter(a => a !== promoted)] : list;
    }

    get _capacity() {
        return Math.max(1, this._island.capacity ?? 1);
    }

    _render({changed = null, alert = null} = {}) {
        if (this._unseen)
            alert = null;            // the island is hidden: nothing to draw attention to
        if (alert)
            this._promote(alert);
        const list = this._visibleList();
        const cap = this._capacity;
        const shown = list.slice(0, cap).map(a => a.id);
        const more = list.length - shown.length;
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
                // transient (APPLE.md A3) and ask (all options are only in expanded)
                // open expanded when they reach the centre pill
                expand: (top.style === 'transient' || top.kind === 'ask') && top.id !== prevPrimary &&
                    !this._unseen ? top.id : null,
            });
        }

        this._updateLight();
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
        let light = this._missedNew ? 'missed' : 'off';
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
