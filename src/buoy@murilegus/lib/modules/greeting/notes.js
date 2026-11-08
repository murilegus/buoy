/**
 * What's new, one entry per release (GREETING.md §11): written with each release, read by
 * Bu after an update and listed on prefs' About → What's new. Pure data: prefs imports it.
 * Bundled, never fetched (no network, EGO).
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
 */
export default Object.freeze([
    Object.freeze({version: 1, name: '0.1', date: '2026-11-08', intro: true, added: [], fixed: []}),
]);
