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
 *   Panel       the top bar's clusters (M2); the clock's GNOME keys (GNOME_CLOCK)
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
    'cluster-contrast': 'panel',
    'left-cluster-empty': 'panel',
    'window-corners': 'windows',
    'window-corners-radius': 'windows',
    'tabs-pinned': 'modules',   // the pin switch on standalone modules' rows
    'tabs-slot': null,          // set from the island's ⋯ menu, not here
    'clock-defaults-applied': null, // bookkeeping: GNOME_CLOCK defaults written once
    'dock-defaults-applied': null,  // bookkeeping: GNOME_DOCK defaults written once
};

// Keys shown inside another key's row (an expander under it), and the parent's value
// that leaves them without effect (their rows go insensitive).
export const NESTED = {
    'cluster-radius': {parent: 'cluster-background', idleWhen: 'never'},
    'cluster-opacity': {parent: 'cluster-background', idleWhen: 'never'},
};

// The clock's switches on the Panel page are GNOME's own keys, not copies (Ethan
// 2026-11-04): Settings → Date & Time and Buoy's prefs change the same values, and Shell's
// clock follows them. A key with on/off is a string shown as a switch. `buoy` is Buoy's
// default — the time alone, 24-hour — written once (see gnomeDefaults).
const IFACE = 'org.gnome.desktop.interface';
export const GNOME_CLOCK = [
    {schema: IFACE, key: 'clock-show-weekday', title: 'Week Day', buoy: false},
    {schema: IFACE, key: 'clock-show-date', title: 'Date', buoy: false},
    {schema: IFACE, key: 'clock-show-seconds', title: 'Seconds', buoy: false},
    {schema: IFACE, key: 'clock-format', title: '24-Hour Time', on: '24h', off: '12h', buoy: '24h'},
    {
        schema: 'org.gnome.desktop.calendar', key: 'show-weekdate', title: 'Week Numbers',
        subtitle: 'Shown in the calendar under the clock',
    },
];

// Ubuntu Dock's own keys (`dash-to-dock`, from gnome-shell-ubuntu-extensions), the rows of
// Settings → Ubuntu Desktop → Dock in its order (CcUbuntuPanel): Buoy's Dock group and
// that page change the same values (Ethan 2026-11-04). `invert`: the switch shows the
// opposite (Auto-hide = not `dock-fixed`); `min`/`max`: a slider; `choices`: a drop-down;
// `row: 'monitor'`: the two keys behind "Show on" (dockMonitor). `buoy`: Buoy's default —
// at the bottom, hiding, 32 px, primary display only, no trash or volumes — written once
// like the clock's (`dock-defaults-applied`); Ubuntu's own are left, fixed, edge to edge
// (10_ubuntu-dock.gschema.override).
const DOCK = 'org.gnome.shell.extensions.dash-to-dock';
export const GNOME_DOCK = [
    {
        schema: DOCK, key: 'dock-fixed', title: 'Auto-hide the Dock',
        subtitle: 'Hides when a window overlaps it', invert: true, buoy: false,
    },
    {schema: DOCK, key: 'extend-height', title: 'Panel Mode', subtitle: 'Reaches the screen edges', buoy: false},
    {schema: DOCK, key: 'dash-max-icon-size', title: 'Icon Size', min: 16, max: 64, unit: 'px', buoy: 32},
    {schema: DOCK, key: 'multi-monitor', row: 'monitor', buoy: false},
    {schema: DOCK, key: 'preferred-monitor-by-connector', row: 'monitor', buoy: 'primary'},
    {
        schema: DOCK, key: 'dock-position', title: 'Position on Screen',
        choices: {LEFT: 'Left', BOTTOM: 'Bottom', RIGHT: 'Right'}, buoy: 'BOTTOM',
    },
    {schema: DOCK, key: 'show-trash', title: 'Show Trash', buoy: false},
    {schema: DOCK, key: 'show-mounts', title: 'Show Volumes and Devices', buoy: false},
];

/**
 * Buoy's defaults for GNOME's own keys (GNOME_CLOCK, GNOME_DOCK), for the first enable
 * only (`clock-defaults-applied`, `dock-defaults-applied`): each key the user never set
 * gets Buoy's value; a key they did set keeps theirs. After that Buoy never writes them
 * again, so a change in either place stays.
 *
 * @param {object[]} entries  GNOME_CLOCK or GNOME_DOCK (or the installed part of it)
 * @param {function(object): boolean} userSet  whether the user has set that entry's key
 * @returns {Array<{schema: string, key: string, value: (boolean|string|number)}>} what to write
 */
export function gnomeDefaults(entries, userSet) {
    return entries.filter(e => 'buoy' in e && !userSet(e))
        .map(({schema, key, buoy}) => ({schema, key, value: buoy}));
}

/**
 * "Show on" is two dock keys: `multi-monitor` (every display) and, without it,
 * `preferred-monitor-by-connector` (`primary` or a connector such as `eDP-1`).
 *
 * @param {boolean} multi  multi-monitor
 * @param {string} connector  preferred-monitor-by-connector
 * @returns {string} the drop-down's value: `all`, `primary` or a connector
 */
export function dockMonitor(multi, connector) {
    return multi ? 'all' : connector || 'primary';
}

/**
 * The displays as Mutter describes them (org.gnome.Mutter.DisplayConfig GetCurrentState,
 * unpacked) — where Settings takes its names from.
 *
 * @param {Array} monitors  [[connector, vendor, product, serial], modes, props]…
 * @param {Array} logical  [x, y, scale, transform, primary, [[connector, …]…], props]…
 * @returns {Array<{connector: string, name: string, builtin: boolean, primary: boolean}>}
 */
export function displaysFromState(monitors, logical) {
    const primary = new Set(logical.filter(l => l[4]).flatMap(l => l[5].map(spec => spec[0])));
    return monitors.map(([[connector], , props]) => ({
        connector,
        name: props?.['display-name'] || connector,
        builtin: Boolean(props?.['is-builtin']),
        primary: primary.has(connector),
    }));
}

/**
 * Labelled as Settings → Ubuntu Desktop → Dock labels them: "All displays",
 * "Primary Display (1)", "1. Built-in display" — numbered built-in first, then in
 * Mutter's order (as Settings numbers them on a single laptop; assumed for more).
 *
 * @param {Array<{connector: string, name: string, builtin: boolean, primary: boolean}>} displays
 *   displaysFromState(), or connectors alone ({connector, name: connector}) until it answers
 * @param {string} current  dockMonitor() of the keys
 * @returns {Array<[string, string]>} [value, label]: all, primary, each display; the
 *   current one kept even when unplugged, so opening prefs never changes it
 */
export function dockMonitorChoices(displays, current) {
    const sorted = [...displays.filter(d => d.builtin), ...displays.filter(d => !d.builtin)];
    const p = sorted.findIndex(d => d.primary);
    const list = [['all', 'All displays'], ['primary', p < 0 ? 'Primary Display' : `Primary Display (${p + 1})`]];
    sorted.forEach((d, i) => list.push([d.connector, `${i + 1}. ${d.name}`]));
    if (!list.some(([v]) => v === current))
        list.push([current, current]);
    return list;
}

/**
 * @param {string} choice  a dockMonitorChoices() value
 * @returns {{multi: boolean, connector: ?string}} what to write; connector null = keep it
 */
export function dockMonitorValue(choice) {
    return choice === 'all' ? {multi: true, connector: null} : {multi: false, connector: choice};
}

/**
 * @param {object} entry  one of GNOME_CLOCK or GNOME_DOCK shown as a switch
 * @param {boolean|string} value  the key's value
 * @returns {boolean} the switch's state
 */
export function switchOn(entry, value) {
    if (entry.on)
        return value === entry.on;
    return entry.invert ? !value : Boolean(value);
}

/**
 * @param {object} entry  one of GNOME_CLOCK or GNOME_DOCK shown as a switch
 * @param {boolean} active  the switch's state
 * @returns {boolean|string} the value to write
 */
export function switchValue(entry, active) {
    if (entry.on)
        return active ? entry.on : entry.off;
    return entry.invert ? !active : active;
}

// Drop-down labels where the value itself would read badly ("Dark-text"); any other
// choice shows as its value with a capital.
export const CHOICE_LABELS = {
    'cluster-contrast': {'auto': 'Automatic', 'dark-text': 'Dark', 'light-text': 'Light'},
};

/**
 * @param {string} name  the key
 * @param {string} value  one of its choices
 * @returns {string} the drop-down's label for it
 */
export function choiceLabel(name, value) {
    return CHOICE_LABELS[name]?.[value] ?? value[0].toUpperCase() + value.slice(1);
}

// Integer keys drawn as a slider instead of a spin button, with their unit.
export const SLIDERS = {
    'cluster-radius': 'px',
    'cluster-opacity': '%',
    'window-corners-radius': 'px',
};

// Modules that ship nothing a user can see yet (no source, no tab): no row until they do.
export const HIDDEN_MODULES = new Set(['hud', 'home', 'copied', 'layout', 'ask']);

// Modules whose tab is standalone (SPEC §2b): their row has "Pin to the strip".
export const STANDALONE = new Set(['calendar', 'clipboard']);

/**
 * @param {Array<{name: string}>} keys  schema keys, in schema order
 * @returns {object} {general, apps, panel, windows, developer: key names; modules: [{id, enableKey, keys}]}
 * @throws {Error} a key that is neither placed nor a module's
 */
export function planPrefs(keys) {
    const names = keys.map(k => k.name);
    const ids = names.filter(n => n.startsWith('modules-')).map(n => n.slice('modules-'.length));
    const plan = {general: [], apps: [], panel: [], windows: [], developer: [], modules: []};
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
