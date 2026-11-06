/**
 * The Transfers tab's Done rows (SPEC §6c): an app's progress that ended stays listed a
 * while after its pill is gone. One store for the module: the source adds to it as
 * transfers end — usually while Home is closed — and the tab, built per open, reads it.
 * Pure; time comes from the caller, and old rows are dropped as they are read (no timer).
 *
 * Two stores: `doneHistory` (an app's progress that ended, one row per app) and
 * `downloadHistory` (each finished download, one row per file, kept longer: it is where
 * "the file I just downloaded" is found again).
 */

/** How long a Done row stays. */
export const KEEP_MS = 10 * 60 * 1000;
/** At most this many Done rows. */
export const MAX_DONE = 5;
/** How long a Downloaded row stays, and how many (2026-11-06). */
export const KEEP_DOWNLOADS_MS = 60 * 60 * 1000;
export const MAX_DOWNLOADS = 5;

export class DoneHistory {
    /**
     * @param {object} [opts]
     * @param {number} [opts.keep]  ms a row stays
     * @param {number} [opts.max]  rows kept
     */
    constructor({keep = KEEP_MS, max = MAX_DONE} = {}) {
        this._rows = [];
        this._keep = keep;
        this._max = max;
    }

    /**
     * @param {{key?: string, appId?: string, at: number}} row  at: ms; `key` (else
     *   `appId`) says which rows are the same thing: adding it again moves it up
     */
    add(row) {
        const key = keyOf(row);
        this._rows = [row, ...this._rows.filter(r => keyOf(r) !== key)].slice(0, this._max);
    }

    /** @param {string} key  a row's key: it leaves (the file was deleted) */
    remove(key) {
        this._rows = this._rows.filter(r => keyOf(r) !== key);
    }

    /**
     * @param {number} now  ms, the clock `at` uses
     * @returns {object[]} rows younger than the store keeps them, newest first
     */
    list(now) {
        this._rows = this._rows.filter(r => now - r.at < this._keep);
        return [...this._rows];
    }

    clear() {
        this._rows = [];
    }
}

function keyOf(row) {
    return row.key ?? row.appId;
}

/** The module's stores, shared by its sources and tab.js. */
export const doneHistory = new DoneHistory();
export const downloadHistory = new DoneHistory({keep: KEEP_DOWNLOADS_MS, max: MAX_DOWNLOADS});
