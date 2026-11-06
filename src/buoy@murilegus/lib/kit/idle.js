import GnomeDesktop from 'gi://GnomeDesktop?version=4.0';

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
 * A plan with data of its own (weather, 2026-11-06) has a feed (`module.feed`, its
 * feed.js): made while that plan is the one in use, destroyed with it; its `state` is
 * the plan's `ctx.data`, its callback re-presents, and it is told when the idle pill
 * shows or hides so it fetches only while shown. A plan with `ticks: false` runs no
 * wall clock.
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
        this._feed = null;
        this._feedId = null;
        this._settingsId = settings.connect('changed', (_s, key) => {
            if (key === 'idle-content' || key === 'daypart-starts' || key.startsWith('idle-'))
                this.sync();
        });
        island.onIdleShown = shown => this._shown(shown);
        this.sync();
    }

    /** The module whose plan `idle-content` names, if it runs. */
    get module() {
        const id = this._settings.get_string('idle-content');
        return this._plans().find(m => m.id === id) ?? null;
    }

    /** The plan for `idle-content`, if its module runs. */
    get plan() {
        return this.module?.idle ?? null;
    }

    // A plan with data of its own (weather) has a feed: made while its plan is the one in
    // use, dropped with it; told when the idle pill shows, so it fetches only then
    _syncFeed(module) {
        const id = module?.feed ? module.id : null;
        if (id === this._feedId)
            return;
        this._feed?.destroy();
        this._feed = null;
        this._feedId = id;
        if (!id)
            return;
        try {
            this._feed = new module.feed(() => this._present());
        } catch (e) {
            console.warn(`Buoy: idle feed ${id} failed: ${e.message}`);
            this._feed = null;
        }
    }

    _opts(plan) {
        const opts = {};
        for (const key of plan.keys ?? [])
            opts[key] = this._settings.get_value(key).deepUnpack();
        return opts;
    }

    /** Re-read the settings and modules; re-present (modules on/off call this too). */
    sync() {
        const module = this.module;
        const plan = module?.idle ?? null;
        this._syncFeed(plan ? module : null);
        if (!plan) {
            this._stopClock();
            this._island.setIdle(null);
            return;
        }
        const seconds = Boolean(plan.seconds?.(this._opts(plan)));
        if (this._clock && (seconds !== this._seconds || plan.ticks === false))
            this._stopClock();      // force-seconds is set at construction
        this._seconds = seconds;
        if (this._island.idleShown) {
            this._startClock();
            this._feed?.shown(true, this._opts(plan));   // its refresh may have changed
        }
        this._present();
    }

    _shown(shown) {
        const plan = this.plan;
        if (shown && plan) {
            this._startClock();
            this._feed?.shown(true, this._opts(plan));
            this._present();        // the time may have moved while hidden
        } else {
            this._stopClock();
            this._feed?.shown(false);
        }
    }

    _startClock() {
        // a plan that does not change with the minute (weather) runs no wall clock
        if (this._clock || this.plan?.ticks === false)
            return;
        this._clock = new GnomeDesktop.WallClock({time_only: true, force_seconds: this._seconds});
        this._clockId = this._clock.connect('notify::clock', () => this._present());
    }

    _stopClock() {
        if (!this._clock)
            return;
        this._clock.disconnect(this._clockId);
        this._clock.run_dispose();  // its timer goes now, not at GC (ui/unlockDialog.js)
        this._clock = null;
        this._clockId = 0;
    }

    _present() {
        const plan = this.plan;
        if (!plan) {
            this._island.setIdle(null);
            return;
        }
        // without a running clock (pill not shown) the text is a placeholder until shown
        const clock = this._clock?.clock ?? '';
        const ctx = {
            now: new Date(),
            clock,
            starts: this._settings.get_value('daypart-starts').deepUnpack(),
            data: this._feed?.state ?? null,    // the plan's feed, if it has one
        };
        try {
            this._island.setIdle(plan.present(ctx, this._opts(plan)));
        } catch (e) {
            console.warn(`Buoy: idle plan failed: ${e.message}`);
            this._island.setIdle(null);
        }
    }

    destroy() {
        this._stopClock();
        this._syncFeed(null);
        if (this._settingsId)
            this._settings.disconnect(this._settingsId);
        this._settingsId = 0;
        if (this._island.onIdleShown)
            this._island.onIdleShown = null;
        this._island.setIdle(null);
    }
}

