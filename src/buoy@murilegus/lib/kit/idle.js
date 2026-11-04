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
        this._settingsId = settings.connect('changed', (_s, key) => {
            if (key === 'idle-content' || key === 'daypart-starts' || key.startsWith('idle-'))
                this.sync();
        });
        island.onIdleShown = shown => this._shown(shown);
        this.sync();
    }

    /** The plan for `idle-content`, if its module runs. */
    get plan() {
        const id = this._settings.get_string('idle-content');
        return this._plans().find(m => m.id === id)?.idle ?? null;
    }

    _opts(plan) {
        const opts = {};
        for (const key of plan.keys ?? [])
            opts[key] = this._settings.get_value(key).deepUnpack();
        return opts;
    }

    /** Re-read the settings and modules; re-present (modules on/off call this too). */
    sync() {
        const plan = this.plan;
        if (!plan) {
            this._stopClock();
            this._island.setIdle(null);
            return;
        }
        const seconds = Boolean(plan.seconds?.(this._opts(plan)));
        if (this._clock && seconds !== this._seconds)
            this._stopClock();      // force-seconds is set at construction
        this._seconds = seconds;
        if (this._island.idleShown)
            this._startClock();
        this._present();
    }

    _shown(shown) {
        if (shown && this.plan) {
            this._startClock();
            this._present();        // the time may have moved while hidden
        } else {
            this._stopClock();
        }
    }

    _startClock() {
        if (this._clock)
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
        if (this._settingsId)
            this._settings.disconnect(this._settingsId);
        this._settingsId = 0;
        if (this._island.onIdleShown)
            this._island.onIdleShown = null;
        this._island.setIdle(null);
    }
}

