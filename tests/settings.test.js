// Run: gjs -m tests/settings.test.js   (pure: where prefs puts each schema key, samples)
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {MAX_FOLDERS as progressMaxFolders} from '../src/buoy@murilegus/lib/modules/progress/adapter.js';
import {GNOME_CLOCK, GNOME_DOCK, gnomeDefaults, switchOn, switchValue, dockMonitor, dockMonitorChoices, dockMonitorValue, displaysFromState, planPrefs, nestedIn, setPinned, addApp, sampleFor, packDict, toVariant, donationLinks, SAMPLES, HIDDEN_MODULES, STANDALONE, NESTED, SLIDERS, CHOICE_LABELS, choiceLabel, addFolder, shortPath, MAX_FOLDERS, MODULE_GROUPS, idleOffNote, IDLE_PLANS, withPlan, movePlan, planRows, weatherNote, placeLabel, searchPlaces, withPlace, WEATHER_UNITS, GNOME_WEATHER, lingerMs} from
    '../src/buoy@murilegus/lib/kit/model/settings.js';
import {check} from '../src/buoy@murilegus/lib/kit/services/dbus.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

function throws(fn, msg) {
    try {
        fn();
    } catch {
        return;
    }
    throw new Error(`${msg}: did not throw`);
}

const ROOT = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
const DIR = `${ROOT}/src/buoy@murilegus/schemas`;
const [, bytes] = GLib.file_get_contents(`${DIR}/org.gnome.shell.extensions.buoy.gschema.xml`);
const xml = new TextDecoder().decode(bytes);
const order = [...xml.matchAll(/<key name="([^"]+)"/g)].map(m => m[1]);

// the compiled schema, as prefs.js reads it
const tmp = GLib.dir_make_tmp('buoy-schema-XXXXXX');
Gio.File.new_for_path(`${DIR}/org.gnome.shell.extensions.buoy.gschema.xml`)
    .copy(Gio.File.new_for_path(`${tmp}/org.gnome.shell.extensions.buoy.gschema.xml`), Gio.FileCopyFlags.NONE, null, null);
const [ok, , err, status] = GLib.spawn_command_line_sync(`glib-compile-schemas --strict ${tmp}`);
if (!ok || status !== 0)
    throw new Error(`glib-compile-schemas: ${new TextDecoder().decode(err)}`);
const schema = Gio.SettingsSchemaSource.new_from_directory(tmp, null, false)
    .lookup('org.gnome.shell.extensions.buoy', false);

// --- every key is described: prefs shows its summary and description ---------------------
for (const name of order) {
    const k = schema.get_key(name);
    if (!k.get_summary() || !k.get_description())
        throw new Error(`key "${name}" needs a <summary> and a <description> (prefs shows them)`);
}

// --- every key has a place --------------------------------------------------------------
const plan = planPrefs(order.map(name => ({name})));
eq(plan.general, ['expanded-width', 'keybind-focus', 'activity-linger', 'mascot-rest-after'],
    'Island page, Pill group: the pill\'s own keys, in schema order; Bu rests after is back with Claude Code, the wait for every waiting pill joins it (2026-11-07)');
eq(plan.apps, ['apps-hidden', 'apps-plain'], 'Apps page');
eq(plan.developer, ['dev-mode'], 'Developer group');
eq(plan.windows, ['window-corners', 'window-corners-radius'], 'Windows page: the corners switch, then its radius (SPEC §1a)');
eq(schema.get_key('window-corners').get_default_value().unpack(), true, 'window corners are on by default');
eq(schema.get_key('window-corners-radius').get_range().recursiveUnpack(), ['range', [0, 32]], 'window radius 0–32');
eq(schema.get_key('window-corners-radius').get_default_value().unpack(), 15, 'window radius 15 = Adwaita\'s floating window');
eq(SLIDERS['window-corners-radius'], 'px', 'the window radius is a slider in px');
eq(plan.panel, ['cluster-background', 'cluster-contrast', 'left-cluster-empty'], 'Panel page: the top bar\'s own keys, nested ones under their parent');
eq(schema.get_key('cluster-contrast').get_range().recursiveUnpack(), ['enum', ['auto', 'dark-text', 'light-text']],
    'cluster-contrast names the text, not the wallpaper (GNOME\'s light/dark is another thing, 2026-11-04)');
eq(schema.get_key('cluster-contrast').get_default_value().unpack(), 'auto', 'cluster-contrast follows the wallpaper by default');
eq(['auto', 'dark-text', 'light-text'].map(v => choiceLabel('cluster-contrast', v)), ['Automatic', 'Dark', 'Light'],
    'cluster-contrast drop-down labels');
eq(choiceLabel('left-cluster-empty', 'workspace'), 'Workspace', 'other choices: the value with a capital');
for (const [n, labels] of Object.entries(CHOICE_LABELS)) {
    const [, values] = schema.get_key(n).get_range().recursiveUnpack();
    eq(Object.keys(labels), values, `CHOICE_LABELS "${n}": one label per choice, in schema order`);
}
eq(schema.get_key('left-cluster-empty').get_range().recursiveUnpack(), ['enum', ['workspace', 'hidden']],
    'left-cluster-empty: workspace or hidden');
eq(schema.get_key('left-cluster-empty').get_default_value().unpack(), 'workspace', 'the workspace shows by default (SPEC §1)');
eq(nestedIn('cluster-background'), ['cluster-radius', 'cluster-opacity'], 'radius and opacity sit inside the background row');
eq(nestedIn('dev-mode'), [], 'a key without nested keys has none');
for (const [n, {parent, idleWhen}] of Object.entries(NESTED)) {
    if (!order.includes(n) || !order.includes(parent))
        throw new Error(`NESTED "${n}" → "${parent}": both must be schema keys`);
    if (!Object.values(plan).flat().includes(parent))
        throw new Error(`NESTED "${n}": its parent "${parent}" has no row`);
    const [kind, values] = schema.get_key(parent).get_range().recursiveUnpack();
    if (kind !== 'enum' || !values.includes(idleWhen))
        throw new Error(`NESTED "${n}": "${idleWhen}" is not a choice of "${parent}"`);
}
for (const n of Object.keys(SLIDERS)) {
    const [kind] = schema.get_key(n).get_range().recursiveUnpack();
    if (kind !== 'range')
        throw new Error(`SLIDERS "${n}" needs a <range> (the slider's ends)`);
}
eq(schema.get_key('cluster-radius').get_range().recursiveUnpack(), ['range', [0, 16]],
    'radius stops at 16: half the 32 px cluster, a pill');
eq(['cluster-radius', 'cluster-opacity'].map(n => schema.get_key(n).get_default_value().unpack()), [16, 17],
    'radius 16 (a pill, like the island) and opacity 17 % by default, a panel button\'s hover (2026-11-04)');
eq(plan.modules.map(m => m.id), ['media', 'notification', 'hud', 'progress', 'timer', 'greeting', 'calendar', 'input', 'agent', 'copied', 'clipboard'],
    'Modules: schema order, without the modules that ship nothing yet, nor a module that is only an idle plan');
eq(plan.modules.find(m => m.id === 'greeting')?.keys, [], 'greeting: its switch alone, its bookkeeping hidden');
eq(MODULE_GROUPS.find(g => g.modules.includes('greeting'))?.title, 'Bu', 'greeting in the Bu group (2026-11-08)');
eq(plan.plans.find(p => p.id === 'clock').planOnly, true,
    'clock: its switch on its plan row on the Island page, not on Modules (2026-11-06, Ethan)');
{
    // a plan whose module is more than the plan (calendar later: its own keys, a tab)
    const more = planPrefs([{name: 'modules-clock'}, {name: 'idle-clock-style'}, {name: 'clock-alerts'}]);
    eq([more.modules.map(m => m.id), more.plans[0].planOnly], [['clock'], false],
        'a module with keys of its own besides its plan keeps its switch on Modules');
}

// --- Modules page in groups (2026-11-06, Ethan) ------------------------------------------
{
    const shown = plan.modules.map(m => m.id);
    for (const id of shown) {
        const at = MODULE_GROUPS.filter(g => g.modules.includes(id)).map(g => g.id);
        eq(at.length, 1, `${id}: in exactly one group on the Modules page (${at.join(', ') || 'none'})`);
    }
    for (const g of MODULE_GROUPS) {
        for (const id of g.modules)
            eq(order.includes(`modules-${id}`), true, `group "${g.id}" lists ${id}: a module the schema has`);
        eq(Boolean(g.title && g.description), true, `group "${g.id}" has a title and a description`);
    }
    eq(plan.groups.map(g => [g.id, g.modules.map(m => m.id)]), [
        ['live', ['media', 'notification', 'progress', 'timer', 'agent']],
        ['feedback', ['hud', 'input', 'copied']],
        ['tabs', ['calendar', 'clipboard']],
        ['bu', ['greeting']],
    ], 'live in the pill · quick feedback · tabs · Bu (the idle plans are on the Island page)');
    eq(plan.groups.flatMap(g => g.modules).length, plan.modules.length, 'every shown module in a group, once');
    // the copied flash and the Clipboard tab apart (2026-11-07, Ethan): each its switch
    const mod = id => plan.modules.find(m => m.id === id);
    eq([mod('copied').keys, mod('copied').standalone, Boolean(mod('copied').sample)], [['copied-show-preview'], false, true],
        'Copied: Show what was copied, a sample, no pin');
    eq([mod('clipboard').keys, mod('clipboard').standalone, mod('clipboard').sample], [[], true, null],
        'Clipboard: only Pin to the strip');
    const hidden = planPrefs(order.filter(n => n !== 'modules-calendar' && n !== 'modules-clipboard').map(name => ({name})));
    eq(hidden.groups.map(g => g.id), ['live', 'feedback', 'bu'], 'a group with no module left (tabs) is not drawn');
}
eq([...Object.values(plan).flat()].includes('clock-defaults-applied'), false,
    'clock-defaults-applied stays hidden: placed by name, not taken by the clock module\'s prefix');

// --- Island page (ARCHITECTURE rule 9, 2026-11-04) ------------------------------------------
eq(plan.idle, ['idle-content', 'idle-auto-interval'], 'When idle: Show, then Switch every (auto)');
{
    const plans = [{id: 'clock', enableKey: 'modules-clock'}, {id: 'free', enableKey: null}];
    const on = v => k => ({'modules-clock': v})[k];
    eq(idleOffNote('clock', plans, on(false)), 'Clock is off, so the pill shows nothing', 'Show = Clock with Clock off: the row says so');
    eq(idleOffNote('clock', plans, on(true)), null, 'Clock on: its own description');
    eq([idleOffNote('none', plans, on(false)), idleOffNote('free', plans, on(false))], [null, null],
        'Nothing, or a plan with no module switch: nothing to say');
}
eq(schema.get_key('idle-content').get_range().recursiveUnpack(), ['enum', ['auto', 'none', 'clock', 'weather', 'calendar']],
    'idle-content: none or a plan (auto comes with the smart stack)');
eq(IDLE_PLANS.filter(id => id !== 'none').every(id => schema.get_key('idle-content').range_check(new GLib.Variant('s', id))),
    true, 'every plan can be chosen in Show');
eq(schema.get_key('idle-content').get_default_value().unpack(), 'auto', 'Automatic by default, now that it has landed');
eq(schema.get_key('idle-auto-plans').get_default_value().deepUnpack(), ['calendar', 'weather', 'clock'],
    'the stack: every plan, the next event first in a tie');
eq([schema.get_key('idle-auto-interval').get_range().recursiveUnpack(), schema.get_key('idle-auto-interval').get_default_value().unpack()],
    [['range', [2, 30]], 5], 'Switch every: 2–30 minutes, 5 by default (SPEC §2a-iii)');
eq(choiceLabel('idle-content', 'auto'), 'Automatic', 'Show: Automatic');
eq(idleOffNote('auto', plan.plans, () => false), null, 'Automatic names no module: nothing to say');
eq(plan.plans, [
    {id: 'clock', enableKey: 'modules-clock', keys: ['idle-clock-style'], planOnly: true},
    {id: 'weather', enableKey: 'modules-weather', keys: ['idle-weather-automatic', 'idle-weather-refresh'], planOnly: true},
    {id: 'calendar', enableKey: 'modules-calendar', keys: ['idle-calendar-all-day'], planOnly: false},
], 'Plans: the clock, the weather, then the next event; calendar keeps its switch on Modules (it has a tab)');
eq(plan.modules.some(m => m.id === 'calendar' && m.standalone), true, 'calendar: a row on Modules, a standalone tab');
eq(choiceLabel('idle-content', 'calendar'), 'Next Event', 'Show: Next Event');
eq(plan.modules.some(m => m.id === 'weather'), false, 'weather is only a plan: no row on Modules');
eq(schema.get_key('idle-weather-refresh').get_range().recursiveUnpack(), ['enum', ['30m', '1h']],
    'weather refresh: 30 min or 1 h, SPEC §2a');
eq(schema.get_key('idle-weather-refresh').get_default_value().unpack(), '30m', 'every 30 minutes by default');
eq(['30m', '1h'].map(v => choiceLabel('idle-weather-refresh', v)), ['Every 30 minutes', 'Every hour'], 'refresh labels');
eq(choiceLabel('idle-content', 'weather'), 'Weather', 'Show: Weather');
// the smart stack's plans on the Island page (2026-11-08): a switch each, a drag for the order
eq([withPlan(['clock'], 'weather', true), withPlan(['calendar', 'clock'], 'calendar', false), withPlan(['clock'], 'clock', true)],
    [['clock', 'weather'], ['clock'], ['clock']], 'withPlan: on at the end, off out, never twice');
eq(withPlan(null, 'clock', true), ['clock'], 'withPlan: from nothing');
eq(movePlan(['calendar', 'weather', 'clock'], 'clock', 'calendar'), ['clock', 'calendar', 'weather'], 'drag up: takes its place');
eq(movePlan(['calendar', 'weather', 'clock'], 'calendar', 'clock'), ['weather', 'clock', 'calendar'], 'drag down: takes its place');
eq(movePlan(['calendar', 'weather', 'clock'], 'weather', 'clock'), ['calendar', 'clock', 'weather'], 'one down');
eq([movePlan(['a', 'b'], 'a', 'a'), movePlan(['a', 'b'], 'x', 'a'), movePlan(['a', 'b'], 'a', 'x')], [['a', 'b'], ['a', 'b'], ['a', 'b']],
    'onto itself, or a plan out of the stack: unchanged');
eq(planRows(['clock', 'weather', 'calendar'], ['calendar', 'clock']), ['calendar', 'clock', 'weather'],
    'rows: the stack in its order, then the others');
eq(planRows(['clock', 'weather'], ['news', 'weather', 'weather']), ['weather', 'clock'], 'rows: unknown dropped, each once');
eq(schema.get_key('idle-weather-automatic').get_default_value().unpack(), true, 'Use my location: on by default');
{
    const note = (automatic, locating, locations) => weatherNote({automatic, locating, locations});
    eq(note(true, true, []), null, 'my location with Location Services on: it can show (the place comes on the first ask)');
    eq(note(true, false, []), 'Location Services is off: turn it on, or pick a city', 'my location, services off, no place');
    eq(note(true, false, [['x']]), 'Location Services is off: showing the last place', 'services off: the last place stays');
    eq(note(false, true, []), 'No place yet: search for a city below', 'a city of my own, none picked');
    eq([note(false, false, [['x']]), note(false, true, [['x']])], [null, null], 'a picked city: nothing to say');
    eq(note(false, false, null), 'No place yet: search for a city below', 'unreadable locations: as none');
}

// --- the Weather plan's units: GNOME Weather's own keys ---------------------------------------
{
    const src = Gio.SettingsSchemaSource.get_default();
    const gw = src?.lookup('org.gnome.GWeather4', true);
    eq([WEATHER_UNITS['temperature-unit'][0][0], WEATHER_UNITS['speed-unit'][0][0]], ['centigrade', 'kph'],
        'first: °C and km/h');
    eq(gnomeDefaults(GNOME_WEATHER, () => false).map(d => [d.key, d.value]),
        [['temperature-unit', 'centigrade'], ['speed-unit', 'kph']], 'first enable: °C and km/h, written once');
    eq(gnomeDefaults(GNOME_WEATHER, e => e.key === 'temperature-unit').map(d => d.key), ['speed-unit'],
        'a unit the user chose keeps theirs');
    eq([...Object.values(planPrefs(order.map(name => ({name})))).flat()].includes('weather-defaults-applied'), false,
        'weather-defaults-applied: bookkeeping, no row');
    for (const [key, choices] of Object.entries(WEATHER_UNITS)) {
        eq(choices.at(-1), ['default', 'Automatic'], `${key}: Automatic (the locale's) last`);
        if (gw) {
            const [, values] = gw.get_key(key).get_range().recursiveUnpack();
            for (const [v] of choices)
                eq(values.includes(v), true, `${key}: "${v}" is one of GWeather's values`);
        }
    }
}

// --- picking a city (the Weather plan's search, GWeather's own cities) -----------------------
{
    const hcm = {name: 'Ho Chi Minh City', region: null, country: 'Viet Nam'};
    const hanoi = {name: 'Hanoi', region: null, country: 'Viet Nam'};
    const hue = {name: 'Huế', region: null, country: 'Viet Nam'};
    const ldnUK = {name: 'London', region: 'East and South East England', country: 'United Kingdom'};
    const ldnCA = {name: 'London', region: 'Ontario', country: 'Canada'};
    const newLondon = {name: 'New London', region: 'Connecticut', country: 'United States'};
    const vn = {name: 'Viet Nam Town', region: null, country: 'Nowhere'};
    const all = [hcm, hanoi, hue, ldnUK, ldnCA, newLondon, vn];
    eq([placeLabel(hcm), placeLabel(ldnCA)], ['Ho Chi Minh City, Viet Nam', 'London, Ontario, Canada'], 'city, region, country');
    eq(placeLabel({name: 'Singapore', region: 'Singapore', country: 'Singapore'}), 'Singapore', 'a name said once');
    eq(searchPlaces(all, 'chi minh'), [hcm], 'a word inside the name');
    eq(searchPlaces(all, 'HO CHI'), [hcm], 'case does not matter');
    eq(searchPlaces(all, 'hue'), [hue], 'accents do not matter');
    eq(searchPlaces(all, 'london').map(placeLabel), ['London, East and South East England, United Kingdom',
        'London, Ontario, Canada', 'New London, Connecticut, United States'],
    'the name first, then a word of it; equal names by their label');
    eq(searchPlaces(all, 'viet nam').map(p => p.name), ['Viet Nam Town', 'Huế', 'Hanoi', 'Ho Chi Minh City'],
        'a city named so first, then by its country, shorter names first');
    eq([searchPlaces(all, 'h'), searchPlaces(all, ' '), searchPlaces(all, null)], [[], [], []], 'fewer than 2 letters: nothing yet');
    eq(searchPlaces(all, 'zzz'), [], 'no match');
    eq(searchPlaces(Array(20).fill(hanoi), 'ha').length, 6, 'at most 6');
    const k = x => x;
    eq(withPlace(['a', 'b', 'c'], 'b', k), ['b', 'a', 'c'], 'picked again: moves first, not twice');
    eq(withPlace(['a', 'b'], 'z', k), ['z', 'a', 'b'], 'a new one first');
    eq(withPlace(['a', 'b', 'c', 'd', 'e'], 'z', k), ['z', 'a', 'b', 'c', 'd'], 'five kept');
    eq(withPlace(null, 'z', k), ['z'], 'none before');
}
eq(schema.get_key('idle-clock-style').get_range().recursiveUnpack(), ['enum', ['icon-text', 'icon-time', 'icon', 'text', 'time']],
    'clock styles, SPEC §2a');
// idle-content and the stack's own idle-auto-… keys are the page's; every other idle- key
// is a plan's
for (const name of order.filter(n => n.startsWith('idle-') && n !== 'idle-content' && !n.startsWith('idle-auto-'))) {
    const under = plan.plans.filter(p => p.keys.includes(name));
    eq(under.length, 1, `${name}: under exactly one plan on the Island page`);
    eq(name.startsWith(`idle-${under[0].id}-`), true, `${name}: under its own plan`);
    eq([...Object.values(plan).flat()].includes(name), false, `${name}: nowhere else`);
}
let threw = '';
try {
    planPrefs([{name: 'idle-nope-style'}]);
} catch (e) {
    threw = e.message;
}
eq(threw.includes('idle key of no plan'), true, 'an idle-* key of no plan fails the test');
eq(plan.modules.find(m => m.id === 'calendar'), {
    id: 'calendar', enableKey: 'modules-calendar', keys: [], standalone: true, sample: null,
}, 'a standalone module: its switch, pin, no sample');
eq(plan.modules.find(m => m.id === 'media').sample !== null, true, 'media has a sample');
{
    const hud = plan.modules.find(m => m.id === 'hud');
    eq(hud?.keys, ['hud-replace-osd'], 'hud has a row with "Hide GNOME\'s popup" (it was hidden as a stub)');
    eq(hud?.sample?.trailing, {bar: 0.72, label: '72%'}, 'hud\'s sample: a volume level');
    eq(plan.modules.find(m => m.id === 'input')?.keys, ['input-replace-switcher'], 'input\'s row has the switcher option');
    eq(plan.modules.find(m => m.id === 'input')?.sample?.text, 'EN · English (US)',
        'input has a row (it was hidden as a stub as `layout`) and a sample');
}
for (const id of HIDDEN_MODULES) {
    if (!order.includes(`modules-${id}`))
        throw new Error(`HIDDEN_MODULES lists "${id}", which has no modules-${id} key`);
}
for (const id of STANDALONE) {
    if (!plan.modules.some(m => m.id === id))
        throw new Error(`STANDALONE lists "${id}", which has no row`);
}
for (const id of Object.keys(SAMPLES)) {
    if (!plan.modules.some(m => m.id === id))
        throw new Error(`SAMPLES has "${id}", which has no row`);
}

const fake = [{name: 'modules-media'}, {name: 'media-compact-on-hover'}, {name: 'modules-home'}, {name: 'home-thing'}, {name: 'dev-mode'}];
const p2 = planPrefs(fake);
eq(p2.modules.map(m => [m.id, m.keys]), [['media', ['media-compact-on-hover']]],
    'a module\'s own key lives in its row; a hidden module\'s key is hidden with it');
throws(() => planPrefs([{name: 'window-shadows'}]), 'a key nobody placed fails loudly');
throws(() => planPrefs([{name: 'mediaish'}]), 'a prefix match needs the dash');

// --- activity-linger: one wait for every waiting pill (2026-11-07, Ethan) ---------------
{
    const [kind2, values] = schema.get_key('activity-linger').get_range().recursiveUnpack();
    eq([kind2, values, schema.get_key('activity-linger').get_default_value().unpack()],
        ['enum', ['5m', '10m', '20m', '30m'], '5m'], '5, 10, 20 or 30 minutes; 5 by default');
    eq(['5m', '10m', '20m', '30m', 'nope', null].map(lingerMs), [300000, 600000, 1200000, 1800000, 300000, 300000],
        'in ms; anything else 5 min');
    eq(['5m', '30m'].map(v => choiceLabel('activity-linger', v)), ['5 minutes', '30 minutes'], 'the drop-down\'s words');
}

// --- choice keys: prefs offers exactly the schema's choices, in order ------------------
const [kind, choices] = schema.get_key('cluster-background').get_range().recursiveUnpack();
eq([kind, choices], ['enum', ['never', 'hover', 'always']], 'cluster-background: never, hover, always');
eq(schema.get_key('cluster-background').get_default_value().unpack(), 'hover',
    'cluster-background defaults to hover (SPEC §1, 2026-11-04)');

// --- the clock switches are GNOME's own keys ------------------------------------------
const fmt = GNOME_CLOCK.find(e => e.key === 'clock-format');
const date = GNOME_CLOCK.find(e => e.key === 'clock-show-date');
eq([switchOn(fmt, '24h'), switchOn(fmt, '12h')], [true, false], '24-Hour Time reads clock-format');
eq([switchValue(fmt, true), switchValue(fmt, false)], ['24h', '12h'], 'and writes it back as a string');
eq([switchOn(date, true), switchOn(date, false), switchValue(date, true)], [true, false, true],
    'a boolean key passes straight through');
eq(gnomeDefaults(GNOME_CLOCK, () => false).map(d => [d.key, d.value]),
    [['clock-show-weekday', false], ['clock-show-date', false], ['clock-show-seconds', false], ['clock-format', '24h']],
    'first enable: the time alone, 24-hour; week numbers untouched');
eq(gnomeDefaults(GNOME_CLOCK, e => e.key === 'clock-format').map(d => d.key),
    ['clock-show-weekday', 'clock-show-date', 'clock-show-seconds'], 'a key the user set keeps their value');
eq(gnomeDefaults(GNOME_CLOCK, () => true), [], 'all set by the user: nothing written');
eq(gnomeDefaults([], () => false), [], 'no GNOME schemas installed: nothing written');
for (const e of GNOME_CLOCK.filter(c => 'buoy' in c)) {
    if (switchValue(e, switchOn(e, e.buoy)) !== e.buoy)
        throw new Error(`GNOME_CLOCK ${e.key}: the default ${e.buoy} must be one of the switch's values`);
}
const system = Gio.SettingsSchemaSource.get_default();
for (const e of GNOME_CLOCK) {
    const s = system?.lookup(e.schema, true);
    if (!s) {
        console.log(`settings: ${e.schema} is not installed here, ${e.key} not checked`);
        continue;
    }
    if (!s.has_key(e.key))
        throw new Error(`GNOME_CLOCK: ${e.schema} has no key ${e.key}`);
    const k = s.get_key(e.key);
    const type = k.get_value_type().dup_string();
    if (e.on) {
        const [rangeKind, values] = k.get_range().recursiveUnpack();
        if (type !== 's' || rangeKind !== 'enum' || !values.includes(e.on) || !values.includes(e.off))
            throw new Error(`GNOME_CLOCK: ${e.key} must be a choice of "${e.on}" and "${e.off}"`);
    } else if (type !== 'b') {
        throw new Error(`GNOME_CLOCK: ${e.key} must be a boolean, is ${type}`);
    }
}

// --- the dock rows are Ubuntu Dock's own keys (2026-11-04) -----------------------------
const autohide = GNOME_DOCK.find(e => e.key === 'dock-fixed');
eq([switchOn(autohide, false), switchOn(autohide, true)], [true, false], 'Auto-hide is on when the dock is not fixed');
eq([switchValue(autohide, true), switchValue(autohide, false)], [false, true], 'and writes dock-fixed inverted');
eq(gnomeDefaults(GNOME_DOCK, () => false).map(d => [d.key, d.value]), [
    ['dock-fixed', false], ['extend-height', false], ['dash-max-icon-size', 32],
    ['multi-monitor', false], ['preferred-monitor-by-connector', 'primary'], ['dock-position', 'BOTTOM'],
    ['show-trash', false], ['show-mounts', false],
], 'first enable: bottom, hiding, 32 px, primary display only, no trash or volumes (Ethan 2026-11-04)');
eq(gnomeDefaults(GNOME_DOCK, e => e.key === 'dock-position').some(d => d.key === 'dock-position'), false,
    'a dock key the user set (Settings → Ubuntu Desktop) keeps their value');
eq(GNOME_DOCK.filter(e => !e.row).map(e => e.title), ['Auto-hide the Dock', 'Panel Mode', 'Icon Size',
    'Position on Screen', 'Show Trash', 'Show Volumes and Devices'], 'rows in Ubuntu Settings\' order, each titled');
eq([dockMonitor(true, 'eDP-1'), dockMonitor(false, 'primary'), dockMonitor(false, 'HDMI-1'), dockMonitor(false, '')],
    ['all', 'primary', 'HDMI-1', 'primary'], 'Show on reads multi-monitor first, then the connector');
// GetCurrentState as Mutter answers on a laptop with one external display (unpacked)
const monitors = [
    [['HDMI-1', 'DEL', 'U2720Q', 'X1'], [], {'display-name': 'Dell Inc. 27"'}],
    [['eDP-1', 'CMN', 'N153JCA-ELK', '0'], [], {'display-name': 'Built-in display', 'is-builtin': true}],
];
const logical = [[0, 0, 1, 0, false, [['HDMI-1', 'DEL', 'U2720Q', 'X1']], {}], [3840, 0, 1, 0, true, [['eDP-1', 'CMN', 'N153JCA-ELK', '0']], {}]];
const displays = displaysFromState(monitors, logical);
eq(displays, [
    {connector: 'HDMI-1', name: 'Dell Inc. 27"', builtin: false, primary: false},
    {connector: 'eDP-1', name: 'Built-in display', builtin: true, primary: true},
], 'Mutter\'s monitors: connector, display name, built-in, primary from the logical monitor');
eq(dockMonitorChoices(displays, 'primary'), [['all', 'All displays'], ['primary', 'Primary Display (1)'],
    ['eDP-1', '1. Built-in display'], ['HDMI-1', '2. Dell Inc. 27"']],
'labelled as Settings → Ubuntu Desktop → Dock: built-in first, the primary\'s number');
eq(dockMonitorChoices([displays[1]], 'primary'), [['all', 'All displays'], ['primary', 'Primary Display (1)'],
    ['eDP-1', '1. Built-in display']], 'one laptop: exactly what Settings shows (2026-11-04)');
eq(dockMonitorChoices([{connector: 'eDP-1', name: 'eDP-1'}], 'primary')[1], ['primary', 'Primary Display'],
    'before Mutter answers: connectors only, no number on Primary');
eq(displaysFromState([[['DP-2', '', '', ''], [], {}]], [])[0], {connector: 'DP-2', name: 'DP-2', builtin: false, primary: false},
    'a monitor without a display name is named by its connector');
eq(dockMonitorChoices([], 'DP-3').at(-1), ['DP-3', 'DP-3'], 'an unplugged display stays listed while chosen');
eq([dockMonitorValue('all'), dockMonitorValue('primary'), dockMonitorValue('HDMI-1')],
    [{multi: true, connector: null}, {multi: false, connector: 'primary'}, {multi: false, connector: 'HDMI-1'}],
    'choosing writes multi-monitor, and the connector unless it is all');
eq(schema.get_key('dock-defaults-applied').get_default_value().unpack(), false, 'dock defaults not yet applied');
const dockSchema = system?.lookup('org.gnome.shell.extensions.dash-to-dock', true);
if (!dockSchema) {
    console.log('settings: dash-to-dock is not installed here, GNOME_DOCK types not checked');
} else {
    for (const e of GNOME_DOCK) {
        if (!dockSchema.has_key(e.key))
            throw new Error(`GNOME_DOCK: dash-to-dock has no key ${e.key}`);
        const k = dockSchema.get_key(e.key), type = k.get_value_type().dup_string();
        let want = 'b';
        if (e.min !== undefined)
            want = 'i';
        else if (e.choices || e.key.endsWith('connector'))
            want = 's';
        eq(type, want, `GNOME_DOCK ${e.key}: type`);
        if (e.choices) {
            const [rangeKind, values] = k.get_range().recursiveUnpack();
            eq([rangeKind, Object.keys(e.choices).every(c => values.includes(c))], ['enum', true],
                `GNOME_DOCK ${e.key}: every choice is one of the schema's`);
        }
        if ('buoy' in e && e.choices && !(e.buoy in e.choices))
            throw new Error(`GNOME_DOCK ${e.key}: the default ${e.buoy} must be offered`);
    }
}

// --- samples go through the real D-Bus check ------------------------------------------
for (const id of Object.keys(SAMPLES)) {
    const s = sampleFor(id);
    check(s);   // throws INVALID_ARGS naming the key, as Surface would
    eq([s.id, s.ttl > 0, s.ttl <= 10_000], [`sample-${id}`, true, true], `${id} sample: fixed id, short ttl`);
}
// prefs sends it as Surface's a{sv}: it must come back as the same object
for (const id of Object.keys(SAMPLES)) {
    const s = sampleFor(id);
    const back = new GLib.Variant('(a{sv})', [packDict(s)]).recursiveUnpack()[0];
    eq(back, s, `${id} sample survives the a{sv} round trip`);
}
throws(() => toVariant([1, 2]), 'arrays are not samples (dbus.js wants aa{sv} only for actions)');
throws(() => toVariant(null), 'null cannot be sent');
eq(sampleFor('calendar'), null, 'no sample for a module without one');
eq(sampleFor('nope'), null, 'unknown module');

// --- list edits -----------------------------------------------------------------------------
eq(setPinned([], 'calendar', true), ['calendar'], 'pin');
eq(setPinned(['calendar'], 'calendar', true), ['calendar'], 'pin twice: once');
eq(setPinned(['clipboard', 'calendar'], 'clipboard', false), ['calendar'], 'unpin keeps the rest');
eq(setPinned(['calendar'], 'clipboard', false), ['calendar'], 'unpin what is not pinned');
eq(addApp(['spotify'], 'firefox'), ['spotify', 'firefox'], 'add an app');
eq(addApp(['spotify'], 'spotify'), ['spotify'], 'add twice: once');

// --- progress-folders: the folder chooser's pick, added once ------------------------------
eq(addFolder([], '/data/dl/', '/home/u/Downloads'), ['/data/dl'], 'a folder, without its trailing slash');
{
    const list = ['/a'];
    eq(addFolder(list, '/a'), list, 'twice: once (the same list back)');
    eq(addFolder(list, '/home/u/Downloads', '/home/u/Downloads'), list, 'Downloads is always watched: not listed');
    eq([addFolder(list, null), addFolder(list, 'rel'), addFolder(list, '')], [list, list, list],
        'no local path (a remote location in the chooser): unchanged');
    const full = Array.from({length: MAX_FOLDERS}, (_, i) => `/f${i}`);
    eq(addFolder(full, '/new'), full, `full at ${MAX_FOLDERS}: unchanged`);
}
eq(MAX_FOLDERS, progressMaxFolders, 'prefs and the watch agree on the cap');
eq([shortPath('/home/u/Downloads', '/home/u'), shortPath('/home/u', '/home/u'), shortPath('/home/uu/x', '/home/u'),
    shortPath('/data/dl', '/home/u'), shortPath('/x', '/')], ['~/Downloads', '~', '/home/uu/x', '/data/dl', '/x'],
'home as ~, only for the home folder itself and inside it');
eq(addApp(['spotify'], ''), ['spotify'], 'an empty slug adds nothing');


// --- donations (metadata.json, gjs.guide) → About's "Support Buoy" rows -------------------
eq(donationLinks(undefined), [], 'no donations: no rows');
eq(donationLinks({}), [], 'empty: no rows');
eq(donationLinks([]), [], 'an array is not the object');
eq(donationLinks({github: 'murilegus'}), [{label: 'GitHub Sponsors', uri: 'https://github.com/sponsors/murilegus'}],
    'a handle becomes the service\'s page');
eq(donationLinks({kofi: 'murilegus', github: 'murilegus'}).map(d => d.label), ['GitHub Sponsors', 'Ko-fi'],
    'services in a fixed order');
eq(donationLinks({paypal: ['a', 'b', 'c', 'd']}).length, 3, 'at most 3 per service (gjs.guide)');
eq(donationLinks({paypal: ['  ', 7, null, ' x ']}), [{label: 'PayPal', uri: 'https://paypal.me/x'}], 'blank and non-string dropped, trimmed');
eq(donationLinks({kofi: 'a/b?c'})[0].uri, 'https://ko-fi.com/a%2Fb%3Fc', 'a handle cannot change the path');
eq(donationLinks({custom: ['https://me.example/coffee/', 'http://plain.example', 'javascript:alert(1)']}),
    [{label: 'me.example/coffee', uri: 'https://me.example/coffee/'}], 'custom: https URLs only, shown without the scheme');
eq(donationLinks({nope: 'x'}), [], 'unknown services ignored');

console.log('settings: ok');
