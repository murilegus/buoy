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
    'idle-content': 'idle',     // Island page, "When idle"
    'idle-auto-interval': 'idle', // Island page, under Show (SPEC §2a-iii)
    'idle-auto-plans': null,
    'prefs-page': null,         // bookkeeping: the page prefs opens on (GREETING.md §11)
    'greeting-intro-shown': null,   // bookkeeping; About's "Show Bu's introduction again" resets it
    'greeting-version-seen': null,  // bookkeeping (GREETING.md §11)    // the plan rows' switches and order: FEATURES M3 "Prefs: Island page"
    'expanded-width': 'general',
    'keybind-focus': 'general',
    // the kit's rule for every waiting activity (2026-11-07, Ethan; was media's
    // `media-hide-paused-after`)
    'activity-linger': 'general',
    // Bu is the kit's, not a module's (MASCOT.md); hidden while nothing drew Bu on the pill
    // (rule 9, Ethan 2026-11-06), back on the Island page's Pill group with the first that
    // does: Claude Code's sessions (2026-11-07)
    'mascot-rest-after': 'general',
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
    'daypart-starts': null,     // kit/daypart.js; on the Island page once a plan reads it (rule 9)
    'clock-defaults-applied': null, // bookkeeping: GNOME_CLOCK defaults written once
    'dock-defaults-applied': null,  // bookkeeping: GNOME_DOCK defaults written once
    'weather-defaults-applied': null, // bookkeeping: GNOME_WEATHER defaults written once
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
 * Buoy's defaults for GNOME's own keys (GNOME_CLOCK, GNOME_DOCK, GNOME_WEATHER), for the
 * first enable only (`clock-`, `dock-`, `weather-defaults-applied`): each key the user never set
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
    'idle-content': {'auto': 'Automatic', 'none': 'Nothing', 'clock': 'Clock', 'weather': 'Weather', 'calendar': 'Next Event'},
    'idle-clock-style': {
        'icon-text': 'Icon & text', 'icon-time': 'Icon & time', 'icon': 'Icon', 'text': 'Text', 'time': 'Time',
    },
    'idle-weather-refresh': {'30m': 'Every 30 minutes', '1h': 'Every hour'},
    'activity-linger': {'5m': '5 minutes', '10m': '10 minutes', '20m': '20 minutes', '30m': '30 minutes'},
};

/**
 * What the Show row says under it when the plan it names cannot show: the plan's module
 * is off, so the idle pill falls back to nothing (2026-11-06, Ethan: the row still said
 * "Clock" with the Clock switch off right below).
 *
 * @param {string} shown  `idle-content`
 * @param {Array<{id: string, enableKey: ?string}>} plans  planPrefs().plans
 * @param {function(string): boolean} isOn  reads a `modules-<id>` key
 * @returns {?string} "Clock is off, so the pill shows nothing", or null when the choice can show (or is none)
 */
export function idleOffNote(shown, plans, isOn) {
    const p = plans.find(x => x.id === shown);
    if (!p?.enableKey || isOn(p.enableKey))
        return null;
    return `${choiceLabel('idle-content', shown)} is off, so the pill shows nothing`;
}

/**
 * What the Weather plan's row says when it cannot show (2026-11-06): the weather comes
 * from the date menu's client (modules/weather/feed.js), whose place is the first of
 * `org.gnome.shell.weather` `locations`. With "Use my location" Buoy writes it there from
 * Geoclue, which needs Location Services; off, the user picks a city under the plan.
 *
 * @param {object} state
 * @param {boolean} state.automatic  `idle-weather-automatic`
 * @param {boolean} state.locating  `org.gnome.system.location` `enabled`
 * @param {*[]} state.locations  `org.gnome.shell.weather` `locations` (av)
 * @returns {?string} null when the plan can show
 */
export function weatherNote({automatic, locating, locations}) {
    const placed = Array.isArray(locations) && locations.length > 0;
    if (automatic && !locating) {
        return placed
            ? 'Location Services is off: showing the last place'
            : 'Location Services is off: turn it on, or pick a city';
    }
    if (!automatic && !placed)
        return 'No place yet: search for a city below';
    return null;
}

/**
 * The units rows under the Weather plan: GNOME Weather's own keys (`org.gnome.GWeather4`),
 * which the weather plan reads (modules/weather/read.js unitNames) — a pick there is GNOME
 * Weather's too. Automatic (`default`) is GWeather's guess from the locale (an en_US
 * session gets °F), last (Ethan, 2026-11-06). Value, label.
 */
export const WEATHER_UNITS = Object.freeze({
    'temperature-unit': [['centigrade', '°C'], ['fahrenheit', '°F'], ['kelvin', 'K'], ['default', 'Automatic']],
    'speed-unit': [['kph', 'km/h'], ['ms', 'm/s'], ['mph', 'mph'], ['knots', 'Knots'], ['bft', 'Beaufort'],
        ['default', 'Automatic']],
});

// Buoy's defaults for those keys, written once like the clock's (`weather-defaults-applied`,
// gnomeDefaults): °C and km/h where the user never chose (Ethan, 2026-11-06)
export const GNOME_WEATHER = [
    {schema: 'org.gnome.GWeather4', key: 'temperature-unit', title: 'Temperature', buoy: 'centigrade'},
    {schema: 'org.gnome.GWeather4', key: 'speed-unit', title: 'Wind speed', buoy: 'kph'},
];

// Case and accents do not matter when searching a place: "ha noi" finds "Hà Nội"
const fold = text => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/**
 * @param {{name: string, region?: ?string, country?: ?string}} place
 * @returns {string} "Ho Chi Minh City, Viet Nam", "London, Ontario, Canada"
 */
export function placeLabel(place) {
    return [place?.name, place?.region, place?.country].filter(t => typeof t === 'string' && t)
        .filter((t, i, all) => all.indexOf(t) === i).join(', ');
}

/**
 * Cities matching what was typed, best first: the name starting with it, then a word of
 * it, then anywhere in the name or its region and country; shorter names first within each.
 *
 * @param {Array<{name: string, region?: ?string, country?: ?string}>} places  GWeather's cities
 * @param {string} query
 * @param {number} [max]
 * @returns {object[]} at most `max` of `places`; none for fewer than 2 letters
 */
export function searchPlaces(places, query, max = 6) {
    const q = fold(query);
    if (q.length < 2)
        return [];
    const ranked = [];
    for (const place of places) {
        const name = fold(place.name);
        let rank = -1;
        if (name.startsWith(q))
            rank = 0;
        else if (name.split(/[\s-]+/).some(w => w.startsWith(q)))
            rank = 1;
        else if (name.includes(q) || fold(placeLabel(place)).includes(q))
            rank = 2;
        if (rank >= 0)
            ranked.push({place, rank, len: name.length});
    }
    ranked.sort((a, b) => a.rank - b.rank || a.len - b.len ||
        placeLabel(a.place).localeCompare(placeLabel(b.place)));
    return ranked.slice(0, max).map(r => r.place);
}

/**
 * `locations` with a place first (the one shown), an equal one dropped from the rest, as
 * GNOME Weather keeps them (most recent first).
 *
 * @param {*[]} list  the current locations
 * @param {*} place  the new one
 * @param {function(*): string} keyOf  how two are the same (their serialized text)
 * @param {number} [max]
 * @returns {*[]}
 */
export function withPlace(list, place, keyOf, max = 5) {
    const key = keyOf(place);
    const rest = (Array.isArray(list) ? list : []).filter(p => keyOf(p) !== key);
    return [place, ...rest].slice(0, max);
}

/**
 * @param {*} value  `activity-linger`: '5m' | '10m' | '20m' | '30m' (Ethan, 2026-11-07)
 * @returns {number} ms; 5 min for anything else
 */
export function lingerMs(value) {
    const m = /^(5|10|20|30)m$/.exec(String(value ?? ''));
    return (m ? Number(m[1]) : 5) * 60 * 1000;
}

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
export const HIDDEN_MODULES = new Set(['home']);

// Idle plans, in the Island page's order (ARCHITECTURE rule 9): each one's
// `idle-<id>-…` keys sit under it there, never on Modules. Prefs cannot import a module,
// so the list is here.
export const IDLE_PLANS = ['clock', 'weather', 'calendar'];

/**
 * @param {*} list  `idle-auto-plans`
 * @param {string} id
 * @param {boolean} on
 * @returns {string[]} the stack with that plan in (at the end, the last to break a tie) or
 *   out; the others keep their order
 */
export function withPlan(list, id, on) {
    const plans = (Array.isArray(list) ? list : []).filter(p => typeof p === 'string' && p !== id);
    return on ? [...plans, id] : plans;
}

/**
 * A plan dragged onto another (the Island page's tie order, SPEC §2a-iii).
 *
 * @param {*} list  `idle-auto-plans`
 * @param {string} id  the dragged plan
 * @param {string} before  the plan it was dropped on: it goes in that one's place
 * @returns {string[]} the new order; unchanged when either is not in the stack
 */
export function movePlan(list, id, before) {
    const plans = Array.isArray(list) ? list.filter(p => typeof p === 'string') : [];
    if (id === before || !plans.includes(id) || !plans.includes(before))
        return plans;
    const rest = plans.filter(p => p !== id);
    rest.splice(rest.indexOf(before) + (plans.indexOf(id) < plans.indexOf(before) ? 1 : 0), 0, id);
    return rest;
}

/**
 * @param {string[]} ids  the plans (IDLE_PLANS order)
 * @param {*} list  `idle-auto-plans`
 * @returns {string[]} the Island page's rows: the stack's plans in its order, then the others
 */
export function planRows(ids, list) {
    const stack = (Array.isArray(list) ? list : []).filter(p => ids.includes(p));
    return [...new Set(stack), ...ids.filter(p => !stack.includes(p))];
}

// A plan row's line on the Island page when its module's switch is elsewhere (Modules):
// what it shows, since it has no keys to open to
export const PLAN_LINES = Object.freeze({calendar: 'Today\'s next event, from your calendars.'});

// The Modules page in groups, by how a module shows (2026-11-06, Ethan: the list grew
// past reading). Prefs cannot import a module, so the groups are listed here; the test
// fails on a shown module in no group or in two, or a group naming a module the schema
// does not have. A module enters its group with the item that ships it.
export const MODULE_GROUPS = [
    {
        id: 'live', title: 'Live in the Pill',
        description: 'What stays on the pill while it runs.',
        modules: ['media', 'notification', 'progress', 'timer', 'agent'],
    },
    {
        id: 'feedback', title: 'Quick Feedback',
        description: 'A short flash after something you did.',
        modules: ['hud', 'input', 'copied'],
    },
    {
        id: 'tabs', title: 'Tabs',
        description: 'A tab of their own, in the strip\'s slot or pinned.',
        modules: ['calendar', 'clipboard'],
    },
    {
        // a switch for those who would rather Bu kept quiet (2026-11-08, Ethan)
        id: 'bu', title: 'Bu',
        description: 'Bu speaking up on his own.',
        modules: ['greeting'],
    },
];
// An idle plan's module that is nothing else (clock) is in no group: its switch is on
// its plan's row, on the Island page.

// Modules whose tab is standalone (SPEC §2b): their row has "Pin to the strip".
export const STANDALONE = new Set(['calendar', 'clipboard']);

/**
 * @param {Array<{name: string}>} keys  schema keys, in schema order
 * @returns {object} {general, idle, apps, panel, windows, developer: key names;
 *   modules: [{id, enableKey, keys}]; groups: MODULE_GROUPS with those modules, empty
 *   groups left out (Modules page); plans: [{id, enableKey, keys, planOnly}] (Island
 *   page; planOnly: a module that is only this plan, with no row on Modules; every plan
 *   row's switch is its place in `idle-auto-plans`)}
 * @throws {Error} a key that is neither placed nor a module's, or an `idle-…` key of no plan
 */
export function planPrefs(keys) {
    const names = keys.map(k => k.name);
    const ids = names.filter(n => n.startsWith('modules-')).map(n => n.slice('modules-'.length));
    const plan = {
        general: [], idle: [], apps: [], panel: [], windows: [], developer: [], modules: [], plans: [],
        groups: [],
    };
    // A module that is only an idle plan (no keys of its own, no tab): its switch sits on
    // its plan's row on the Island page, not on Modules (2026-11-06, Ethan). One that is
    // more (calendar later: an activity, a tab and a plan) keeps its row on Modules.
    const ownKeys = id => names.filter(n => n.startsWith(`${id}-`) && !(n in PLACES));
    const planOnly = id => IDLE_PLANS.includes(id) && !ownKeys(id).length && !STANDALONE.has(id);
    for (const id of IDLE_PLANS) {
        const enableKey = names.includes(`modules-${id}`) ? `modules-${id}` : null;
        // the row's switch is the plan's place in `idle-auto-plans` (2026-11-08, Ethan); a
        // plan-only module (clock, weather) has no switch of its own anywhere: it costs
        // nothing unused (its feed runs only while its plan is in use)
        plan.plans.push({
            id, enableKey,
            keys: names.filter(n => n.startsWith(`idle-${id}-`)),
            planOnly: enableKey !== null && planOnly(id),
        });
    }
    for (const id of ids) {
        if (HIDDEN_MODULES.has(id) || planOnly(id))
            continue;
        plan.modules.push({
            id,
            enableKey: `modules-${id}`,
            // a key placed by name wins over the prefix (clock-defaults-applied is not
            // the clock module's)
            keys: ownKeys(id),
            standalone: STANDALONE.has(id),
            sample: SAMPLES[id] ?? null,
        });
    }
    for (const n of names) {
        if (n.startsWith('modules-'))
            continue;
        if (IDLE_PLANS.some(id => n.startsWith(`idle-${id}-`)))
            continue;                 // shown under its plan on the Island page
        if (n.startsWith('idle-') && !(n in PLACES))
            throw new Error(`schema key "${n}" is an idle key of no plan (kit/settings.js IDLE_PLANS)`);
        const owner = !(n in PLACES) && ids.find(id => n.startsWith(`${id}-`));
        if (owner)
            continue;                 // shown inside its module's row (or hidden with it)
        if (!(n in PLACES))
            throw new Error(`schema key "${n}" has no place in prefs (kit/settings.js PLACES)`);
        const place = PLACES[n];
        if (place && place !== 'modules' && !(n in NESTED))
            plan[place].push(n);
    }
    for (const g of MODULE_GROUPS) {
        const modules = g.modules.map(id => plan.modules.find(m => m.id === id)).filter(Boolean);
        if (modules.length)
            plan.groups.push({id: g.id, title: g.title, description: g.description, modules});
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

/** Folders `progress-folders` may hold (modules/progress adapter.js MAX_FOLDERS). */
export const MAX_FOLDERS = 10;

/**
 * @param {string[]} list  `progress-folders`
 * @param {?string} path  a folder the user picked
 * @param {?string} downloads  the Downloads folder, always watched
 * @returns {string[]} the list with it added once; unchanged when it is not an absolute
 *   path, already there, the Downloads folder, or the list is full
 */
export function addFolder(list, path, downloads = null) {
    if (typeof path !== 'string' || !path.startsWith('/'))
        return list;
    const p = path.replace(/(.)\/+$/, '$1');
    if (p === downloads || list.includes(p) || list.length >= MAX_FOLDERS)
        return list;
    return [...list, p];
}

/**
 * @param {string} path
 * @param {string} home  the home folder
 * @returns {string} the path with the home folder as `~`, as Files writes it
 */
export function shortPath(path, home) {
    if (home && home !== '/' && (path === home || path.startsWith(`${home}/`)))
        return `~${path.slice(home.length)}`;
    return path;
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
    hud: {
        kind: 'osd', app: 'buoy', leading: 'audio-volume-medium-symbolic',
        trailing: {bar: 0.72, label: '72%'}, sizeHint: 'wide',
    },
    input: {
        kind: 'input', app: 'buoy', leading: 'input-keyboard-symbolic', text: 'EN · English (US)',
    },
    copied: {
        kind: 'copied', app: 'buoy', leading: 'edit-copy-symbolic', text: 'Copied text shows here',
        sizeHint: 'wide',
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

// metadata.json `donations` (gjs.guide, Extension Anatomy): a handle per service, or full
// URLs under `custom`; a string or up to 3 strings each. EGO shows the same links.
const DONATION_SERVICES = {
    github: {label: 'GitHub Sponsors', url: h => `https://github.com/sponsors/${h}`},
    kofi: {label: 'Ko-fi', url: h => `https://ko-fi.com/${h}`},
    buymeacoffee: {label: 'Buy Me a Coffee', url: h => `https://buymeacoffee.com/${h}`},
    liberapay: {label: 'Liberapay', url: h => `https://liberapay.com/${h}`},
    opencollective: {label: 'Open Collective', url: h => `https://opencollective.com/${h}`},
    patreon: {label: 'Patreon', url: h => `https://patreon.com/${h}`},
    paypal: {label: 'PayPal', url: h => `https://paypal.me/${h}`},
};

/**
 * The About page's "Support Buoy" rows, from metadata.json `donations`.
 *
 * @param {*} donations  metadata.json `donations`
 * @returns {Array<{label: string, uri: string}>} in the service order above, custom last;
 *   unknown services, blank or non-string handles and anything past 3 per service dropped
 */
export function donationLinks(donations) {
    if (!donations || typeof donations !== 'object' || Array.isArray(donations))
        return [];
    const list = v => (Array.isArray(v) ? v : [v])
        .filter(x => typeof x === 'string' && x.trim()).slice(0, 3).map(x => x.trim());
    const out = [];
    for (const [service, {label, url}] of Object.entries(DONATION_SERVICES)) {
        for (const handle of list(donations[service]))
            out.push({label, uri: url(encodeURIComponent(handle))});
    }
    for (const uri of list(donations.custom)) {
        if (/^https:\/\//.test(uri))
            out.push({label: uri.replace(/^https:\/\//, '').replace(/\/$/, ''), uri});
    }
    return out;
}

