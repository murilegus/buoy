/**
 * The Transfers tab's Done rows (SPEC §6c): an app's progress that ended stays listed a
 * while after its pill is gone. One store for the module: the source adds to it as
 * transfers end — usually while Home is closed — and the tab, built per open, reads it.
 * Pure; time comes from the caller, and old rows are dropped as they are read (no timer).
 */

/** How long a Done row stays. */
export const KEEP_MS = 10 * 60 * 1000;
/** At most this many Done rows. */
export const MAX_DONE = 5;

export class DoneHistory {
    constructor() {
        this._rows = [];
    }

    /** @param {{appId: string, name: string, icon: *, at: number}} row  at: ms */
    add(row) {
        this._rows = [row, ...this._rows.filter(r => r.appId !== row.appId)].slice(0, MAX_DONE);
    }

    /**
     * @param {number} now  ms, the clock `at` uses
     * @returns {object[]} rows younger than KEEP_MS, newest first
     */
    list(now) {
        this._rows = this._rows.filter(r => now - r.at < KEEP_MS);
        return [...this._rows];
    }

    clear() {
        this._rows = [];
    }
}

/** The module's one store, shared by source.js and tab.js. */
export const doneHistory = new DoneHistory();
