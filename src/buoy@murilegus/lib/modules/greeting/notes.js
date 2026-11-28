/**
 * What's new, one entry per release (GREETING.md §11): written with each release, read by
 * Bu after an update and listed on prefs' About → What's new. Pure data: prefs imports it.
 * Bundled, never fetched (EGO); the one thing asked of the network is whether a newer
 * release is out (source.js, GREETING.md §11 "A newer Buoy").
 *
 * Entry: {version, name, date, intro?, added: string[], fixed: string[]}
 *   version  `metadata.json` `version` (EGO's counter) of that release
 *   name     its name for people ("0.1")
 *   date     the day it was released, 'YYYY-MM-DD' (About shows it beside an older
 *            version, 2026-11-08, Ethan); null until it is
 *   intro    v0.1: its "what's new" is the first run's introduction itself
 *   added    what is new, one short line each
 *   fixed    what was fixed, one short line each
 *
 * Newest last.
 *
 * @typedef {{version: number, name: string, date: ?string, intro?: boolean,
 *   added: string[], fixed: string[]}} Note
 */
export default /** @type {ReadonlyArray<Readonly<Note>>} */ (Object.freeze([
    Object.freeze({version: 1, name: '0.1', date: '2026-11-08', intro: true, added: [], fixed: []}),
    Object.freeze({
        version: 2, name: '0.1.1', date: '2026-11-09', added: [],
        fixed: [
            'Files are read in the background: the desktop never waits on them',
            'Settings clean up after themselves when closed',
        ],
    }),
    Object.freeze({
        version: 3, name: '0.2', date: '2026-11-28',
        added: [
            'A new look: sizes follow your text size, one shape for every hover, new icons and motion',
            'Meetings about to start, with Join',
            'Timers and Pomodoro, in the pill and their own tab',
            'Claude Code\'s questions answered right in Buoy',
            'A terminal command finished in another tab',
            'Print jobs, VPN and Wi-Fi, chargers and power modes',
            'Bluetooth devices, headphones, displays, drives and webcams plugged in',
            'The privacy dot, and "In a call" with Do Not Disturb',
            'Your phone through GSConnect: calls, messages and codes',
            'The Device tab, and an event\'s page in the Calendar tab',
            'Bu says hello with the time and the weather',
        ],
        fixed: [],
    }),
]));
