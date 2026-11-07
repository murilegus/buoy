import {EventReader} from './events.js';

/**
 * The next-event plan's feed (kit/idle.js): made while the plan is the one in use, gone
 * with it. Its state is events.js's ({hasCalendars, events}); each change re-presents.
 * Shown, it brings the date menu's calendar back to today (events.js `ensureToday`), so
 * the day the pill speaks of is loaded. No timer: the kit's wall clock moves the time.
 */
export class CalendarFeed {
    /** @param {function(): void} onChanged  the state changed: present again */
    constructor(onChanged) {
        this._reader = new EventReader(() => {
            this.state = this._reader.state;
            onChanged();
        });
        this.state = this._reader.state;
    }

    /** @param {boolean} shown  the idle pill is on screen with this plan */
    shown(shown) {
        if (shown)
            this._reader?.ensureToday();
    }

    destroy() {
        this._reader?.destroy();
        this._reader = null;
        this.state = null;
    }
}
