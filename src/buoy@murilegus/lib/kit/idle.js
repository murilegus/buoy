import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop?version=4.0';

import {choose, intervalMs, scrollTo, stackOrder} from './smartstack.js';

/**
 * idle-content (SPEC §2a): which module's idle plan the idle pill shows, and its clock.
 * `none` (or a plan whose module is off) leaves the pill empty with the buoy light.
 *
 * The plan is pure (its idle.js): present(ctx, opts) → presentation data. Time comes from
 * GNOME's wall clock (GnomeDesktop.WallClock, time only, as ui/unlockDialog.js): it ticks
 * on the minute (every second for a plan that asks), follows the 12/24 h and locale
 * settings, and keeps time across suspend, which a GLib timeout would not. The wall clock
 * exists only while the idle pill is on screen (Island.onIdleShown): no activity, not
 * expanded, not hidden by a fullscreen window (ARCHITECTURE rule 8); it is disposed on
 * every other change and on destroy. A plan's settings, `daypart-starts` and module
 * changes re-present at once.
 *
 * A plan with data of its own (weather, calendar) has a feed (`module.feed`, its feed.js):
 * made while that plan is in use, destroyed with it; its `state` is the plan's `ctx.data`,
 * its callback re-presents, and it is told when the idle pill shows or hides so it fetches
 * only while shown. A plan with `ticks: false` runs no wall clock.
 *
 * `auto` (SPEC §2a-iii, 2026-11-08): the plans of `idle-auto-plans` whose modules run form
 * a smart stack (kit/smartstack.js). Each re-rank asks every plan's `relevance(ctx, opts)` and
 * shows the winner; a switch is one cross-fade (the width morphs with it), then nothing.
 * Re-ranks: a feed's change and the wall clock's minute (the shown plan stays while it has
 * something to show), and one turn every `idle-auto-interval`, when the next plan comes. That
 * timer exists only while the idle pill shows with `auto`: gone on an activity, on expand,
 * on a fullscreen window and on disable. Every plan of the stack has its feed while `auto`
 * is on, told that the pill shows (the weather fetches on its interval meanwhile), and the
 * wall clock runs whatever plan shows. Scroll on the pill: the next / previous plan, held
 * until the next turn, which starts again from the scroll.
 */
export class IdleContent {
    /**
     * @param {Island} island
     * @param {Gio.Settings} settings  Buoy's
     * @param {function(): object[]} plans  running modules that have an `idle` plan
     */
    constructor(island, settings, plans) {
        this._island = island;
        this._settings = settings;
        this._plans = plans;
        this._clock = null;
        this._clockId = 0;
        this._seconds = false;
        this._feeds = new Map();        // module id → feed
        this._current = null;           // `auto`: the plan shown
        this._pinned = null;            // `auto`: scrolled to, until the next turn
        this._turnId = 0;
        this._settingsId = settings.connect('changed', (_s, key) => {
            if (key === 'idle-content' || key === 'daypart-starts' || key.startsWith('idle-'))
                this.sync();
        });
        island.onIdleShown = shown => this._shown(shown);
        island.onIdleScroll = step => this._scroll(step);
        this.sync();
    }

    get _auto() {
        return this._settings.get_string('idle-content') === 'auto';
    }

    /**
     * The modules whose plans are in use: `auto`, the stack in `idle-auto-plans` order;
     * else the one `idle-content` names, if it runs.
     */
    get _stack() {
        const running = this._plans();
        if (!this._auto) {
            const id = this._settings.get_string('idle-content');
            return running.filter(m => m.id === id);
        }
        const order = stackOrder(this._settings.get_value('idle-auto-plans').deepUnpack(), running.map(m => m.id));
        return order.map(id => running.find(m => m.id === id));
    }

    /** The module whose plan the pill shows, if any. */
    get module() {
        const stack = this._stack;
        return this._auto ? stack.find(m => m.id === this._current) ?? null : stack[0] ?? null;
    }

    /** The plan the pill shows, if any. */
    get plan() {
        return this.module?.idle ?? null;
    }

    // A plan with data of its own has a feed while it is in use; told when the idle pill
    // shows, so it fetches only then
    _syncFeeds(modules) {
        const want = new Map(modules.filter(m => m.feed).map(m => [m.id, m]));
        for (const [id, feed] of this._feeds) {
            if (!want.has(id)) {
                feed.destroy();
                this._feeds.delete(id);
            }
        }
        for (const [id, module] of want) {
            if (this._feeds.has(id))
                continue;
            try {
                this._feeds.set(id, new module.feed(() => this._present()));
            } catch (e) {
                console.warn(`Buoy: idle feed ${id} failed: ${e.message}`);
            }
        }
    }

    _opts(plan) {
        const opts = {};
        for (const key of plan.keys ?? [])
            opts[key] = this._settings.get_value(key).deepUnpack();
        return opts;
    }

    _tellFeeds(shown) {
        for (const [id, feed] of this._feeds) {
            const plan = this._plans().find(m => m.id === id)?.idle;
            if (shown)
                feed.shown(true, plan ? this._opts(plan) : {});
            else
                feed.shown(false);
        }
    }

    /** Re-read the settings and modules; re-present (modules on/off call this too). */
    sync() {
        const stack = this._stack;
        this._syncFeeds(stack);
        if (!this._auto) {
            this._current = null;
            this._pinned = null;
        }
        if (!stack.length) {
            this._stopClock();
            this._stopTurns();
            this._island.setIdle(null);
            return;
        }
        if (this._island.idleShown) {
            this._tellFeeds(true);       // a refresh may have changed
            this._armTurns();
        }
        this._present();
    }

    _shown(shown) {
        if (shown && this._stack.length) {
            this._tellFeeds(true);
            this._armTurns();
            this._present();            // the time may have moved while hidden
        } else {
            this._stopClock();
            this._stopTurns();
            this._tellFeeds(false);
        }
    }

    // The wall clock: while the pill shows, unless the plan shown does not change with the
    // minute (weather alone); `auto` always keeps it, its minute re-ranks
    _syncClock(plan) {
        const seconds = Boolean(plan?.seconds?.(this._opts(plan)));
        const wanted = this._island.idleShown && plan && (this._auto || plan.ticks !== false);
        if (this._clock && (!wanted || seconds !== this._seconds))
            this._stopClock();          // force-seconds is set at construction
        this._seconds = seconds;
        if (wanted && !this._clock) {
            this._clock = new GnomeDesktop.WallClock({time_only: true, force_seconds: seconds});
            this._clockId = this._clock.connect('notify::clock', () => this._present());
        }
    }

    _stopClock() {
        if (!this._clock)
            return;
        this._clock.disconnect(this._clockId);
        this._clock.run_dispose();  // its timer goes now, not at GC (ui/unlockDialog.js)
        this._clock = null;
        this._clockId = 0;
    }

    // One turn every idle-auto-interval, only while the pill shows with `auto`
    _armTurns() {
        this._stopTurns();
        if (!this._auto || !this._island.idleShown)
            return;
        const ms = intervalMs(this._settings.get_int('idle-auto-interval'));
        this._turnId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._turnId = 0;
            this._pinned = null;
            this._present({turn: true});
            this._armTurns();
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopTurns() {
        if (this._turnId)
            GLib.source_remove(this._turnId);
        this._turnId = 0;
    }

    _ctx(module) {
        return {
            now: new Date(),
            // without a running clock (pill not shown) the text is a placeholder until shown
            clock: this._clock?.clock ?? '',
            starts: this._settings.get_value('daypart-starts').deepUnpack(),
            data: this._feeds.get(module.id)?.state ?? null,   // the plan's feed, if it has one
        };
    }

    // `auto`: every plan of the stack with its score, in the stack's order
    _scores(stack) {
        return stack.map(m => {
            let score = null;
            try {
                score = m.idle.relevance?.(this._ctx(m), this._opts(m.idle))?.score ?? null;
            } catch (e) {
                console.warn(`Buoy: idle plan ${m.id} relevance failed: ${e.message}`);
            }
            return {id: m.id, score};
        });
    }

    _scroll(step) {
        if (!this._auto || !this._island.idleShown)
            return false;
        const target = scrollTo(this._scores(this._stack), this._current, step);
        if (!target)
            return false;
        this._pinned = target;
        this._armTurns();               // held for one interval from the scroll
        this._present();
        return true;
    }

    _present({turn = false} = {}) {
        const stack = this._stack;
        let module = stack[0] ?? null;
        let switched = false;
        if (this._auto) {
            const id = choose({
                plans: this._scores(stack), current: this._current, turn,
                pinned: this._pinned,
            });
            switched = id !== this._current && this._current !== null;
            this._current = id;
            module = stack.find(m => m.id === id) ?? null;
        }
        const plan = module?.idle ?? null;
        this._syncClock(plan);
        if (!plan) {
            this._island.setIdle(null);
            return;
        }
        try {
            this._island.setIdle(plan.present(this._ctx(module), this._opts(plan)), {fade: switched});
        } catch (e) {
            console.warn(`Buoy: idle plan failed: ${e.message}`);
            this._island.setIdle(null);
        }
    }

    destroy() {
        this._stopClock();
        this._stopTurns();
        this._syncFeeds([]);
        if (this._settingsId)
            this._settings.disconnect(this._settingsId);
        this._settingsId = 0;
        if (this._island.onIdleShown)
            this._island.onIdleShown = null;
        if (this._island.onIdleScroll)
            this._island.onIdleScroll = null;
        this._island.setIdle(null);
    }
}
