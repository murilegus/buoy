/**
 * Where each GSettings key goes in prefs.js, and the samples its "Show a sample" buttons
 * send. Pure (no St, no Gtk): prefs.js runs in its own process and cannot import a
 * module's index.js (it pulls in Shell code), so the schema XML is the one source of the
 * keys and this file only places them (ARCHITECTURE rule 9, 2026-11-03).
 *
 *   General     the island itself
 *   Modules     one row per module (its `modules-<id>` switch), the module's own keys
 *               (`<id>-…`) inside it, a sample button, a pin switch for standalone tabs
 *   Apps        `apps-hidden`, `apps-plain`, the profiles folder
 *   Panel       the top bar's clusters (M2)
 *   Developer   `dev-mode`
 *
 * A key enters the schema with the item that implements it (2026-11-03): nothing in prefs
 * is a switch without an effect.
 */

import GLib from 'gi://GLib';

export const PAGES = ['general', 'modules', 'apps', 'panel'];

// Shell-level keys, by group. Every schema key is placed here or is a module key; the
// test fails on a key nobody placed.
export const PLACES = {
    'expanded-width': 'general',
    'keybind-focus': 'general',
    'apps-hidden': 'apps',
    'apps-plain': 'apps',
    'dev-mode': 'developer',
    'cluster-background': 'panel',
    'cluster-radius': 'panel',
    'cluster-opacity': 'panel',
    'tabs-pinned': 'modules',   // the pin switch on standalone modules' rows
    'tabs-slot': null,          // set from the island's ⋯ menu, not here
};

// Keys shown inside another key's row (an expander under it), and the parent's value
// that leaves them without effect (their rows go insensitive).
export const NESTED = {
    'cluster-radius': {parent: 'cluster-background', idleWhen: 'never'},
    'cluster-opacity': {parent: 'cluster-background', idleWhen: 'never'},
};

// Integer keys drawn as a slider instead of a spin button, with their unit.
export const SLIDERS = {
    'cluster-radius': 'px',
    'cluster-opacity': '%',
};

// Modules that ship nothing a user can see yet (no source, no tab): no row until they do.
export const HIDDEN_MODULES = new Set(['hud', 'home', 'copied', 'layout', 'ask']);

// Modules whose tab is standalone (SPEC §2b): their row has "Pin to the strip".
export const STANDALONE = new Set(['calendar', 'clipboard']);

/**
 * @param {Array<{name: string}>} keys  schema keys, in schema order
 * @returns {object} {general, apps, panel, developer: key names; modules: [{id, enableKey, keys}]}
 * @throws {Error} a key that is neither placed nor a module's
 */
export function planPrefs(keys) {
    const names = keys.map(k => k.name);
    const ids = names.filter(n => n.startsWith('modules-')).map(n => n.slice('modules-'.length));
    const plan = {general: [], apps: [], panel: [], developer: [], modules: []};
    for (const id of ids) {
        if (HIDDEN_MODULES.has(id))
            continue;
        plan.modules.push({
            id,
            enableKey: `modules-${id}`,
            keys: names.filter(n => n.startsWith(`${id}-`)),
            standalone: STANDALONE.has(id),
            sample: SAMPLES[id] ?? null,
        });
    }
    for (const n of names) {
        if (n.startsWith('modules-'))
            continue;
        const owner = ids.find(id => n.startsWith(`${id}-`));
        if (owner)
            continue;                 // shown inside its module's row (or hidden with it)
        if (!(n in PLACES))
            throw new Error(`schema key "${n}" has no place in prefs (kit/settings.js PLACES)`);
        const place = PLACES[n];
        if (place && place !== 'modules' && !(n in NESTED))
            plan[place].push(n);
    }
    return plan;
}

/**
 * @param {string} parent  a key with nested keys
 * @returns {string[]} the keys shown inside its row, in NESTED order
 */
export function nestedIn(parent) {
    return Object.keys(NESTED).filter(n => NESTED[n].parent === parent);
}

/**
 * @param {string[]} pinned  `tabs-pinned`
 * @param {string} id  a standalone module
 * @param {boolean} on
 * @returns {string[]} the new list, order kept, no duplicates
 */
export function setPinned(pinned, id, on) {
    const rest = pinned.filter(p => p !== id);
    return on ? [...rest, id] : rest;
}

/**
 * @param {string[]} list  `apps-hidden` or `apps-plain`
 * @param {string} slug  already slugged (registry.js slugOf)
 * @returns {string[]} the list with it added once, or unchanged for an empty slug
 */
export function addApp(list, slug) {
    return !slug || list.includes(slug) ? list : [...list, slug];
}

// What "Show a sample" surfaces, through the real D-Bus API (kit/dbus.js `Surface`): the
// same path a script takes, so the preview shows what the island really draws. A short
// ttl; the same id replaces the previous sample.
const SAMPLE_TTL = 6000;
export const SAMPLES = {
    media: {
        kind: 'media', app: 'buoy', text: 'Weightless — Marconi Union',
        leading: 'audio-x-generic-symbolic', expanded: true,
    },
    notification: {
        kind: 'notification', app: 'buoy', text: 'Lan: lunch at 12?',
        leading: 'mail-unread-symbolic', expanded: true,
    },
    progress: {
        kind: 'progress', app: 'buoy', text: 'Copying 3 files',
        leading: {progress: 0.4}, trailing: {text: '40 %'},
    },
    timer: {
        kind: 'timer', app: 'buoy', text: 'Tea',
        leading: 'alarm-symbolic', trailing: {countdown: 240},
    },
};

/**
 * @param {string} id  module id
 * @returns {?object} the `a{sv}` payload for Surface (id `sample-<module>`, ttl set)
 */
export function sampleFor(id) {
    const s = SAMPLES[id];
    return s ? {id: `sample-${id}`, ttl: SAMPLE_TTL, alert: true, ...s} : null;
}

/**
 * A JS value as the `v` of an `a{sv}`, the way kit/dbus.js unpacks it: strings `s`,
 * booleans `b`, numbers `d` (dbus.js takes any number type), plain objects `a{sv}`.
 *
 * @param {*} v
 * @returns {GLib.Variant}
 */
export function toVariant(v) {
    if (typeof v === 'string')
        return new GLib.Variant('s', v);
    if (typeof v === 'boolean')
        return new GLib.Variant('b', v);
    if (typeof v === 'number')
        return new GLib.Variant('d', v);
    if (v && typeof v === 'object' && !Array.isArray(v))
        return new GLib.Variant('a{sv}', packDict(v));
    throw new Error(`cannot send ${JSON.stringify(v)} over D-Bus`);
}

/**
 * @param {object} obj  a sample (sampleFor)
 * @returns {object} its values as Variants: what GJS packs into an `a{sv}` argument
 */
export function packDict(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toVariant(v)]));
}
