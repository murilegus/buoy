// Run: gjs -m tests/settings.test.js   (pure: where prefs puts each schema key, samples)
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {GNOME_CLOCK, GNOME_DOCK, gnomeDefaults, switchOn, switchValue, dockMonitor, dockMonitorChoices, dockMonitorValue, displaysFromState, planPrefs, nestedIn, setPinned, addApp, sampleFor, packDict, toVariant, donationLinks, SAMPLES, HIDDEN_MODULES, STANDALONE, NESTED, SLIDERS, CHOICE_LABELS, choiceLabel} from
    '../src/buoy@murilegus/lib/kit/settings.js';
import {check} from '../src/buoy@murilegus/lib/kit/dbus.js';

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
eq(plan.general, ['expanded-width', 'keybind-focus', 'mascot-rest-after'], 'Island page, Pill group: the pill\'s own keys, in schema order');
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
eq(plan.modules.map(m => m.id), ['media', 'notification', 'hud', 'progress', 'timer', 'calendar', 'input', 'clipboard', 'clock'],
    'Modules: schema order, without the modules that ship nothing yet');
eq(plan.modules.find(m => m.id === 'clock').keys, [], 'clock: a switch-only row on Modules (rule 9)');
eq([...Object.values(plan).flat()].includes('clock-defaults-applied'), false,
    'clock-defaults-applied stays hidden: placed by name, not taken by the clock module\'s prefix');

// --- Island page (ARCHITECTURE rule 9, 2026-11-04) ------------------------------------------
eq(plan.idle, ['idle-content'], 'When idle: idle-content');
eq(schema.get_key('idle-content').get_range().recursiveUnpack(), ['enum', ['none', 'clock']],
    'idle-content: none or a plan (auto comes with the smart stack)');
eq(schema.get_key('idle-content').get_default_value().unpack(), 'clock', 'the clock until auto lands (Ethan)');
eq(plan.plans, [{id: 'clock', enableKey: 'modules-clock', keys: ['idle-clock-style']}],
    'Plans: the clock with its own key');
eq(schema.get_key('idle-clock-style').get_range().recursiveUnpack(), ['enum', ['icon-time', 'time', 'icon', 'seconds']],
    'clock styles, SPEC §2a');
for (const name of order.filter(n => n.startsWith('idle-') && n !== 'idle-content')) {
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

const fake = [{name: 'modules-media'}, {name: 'media-compact-on-hover'}, {name: 'modules-ask'}, {name: 'ask-timeout'}, {name: 'dev-mode'}];
const p2 = planPrefs(fake);
eq(p2.modules.map(m => [m.id, m.keys]), [['media', ['media-compact-on-hover']]],
    'a module\'s own key lives in its row; a hidden module\'s key is hidden with it');
throws(() => planPrefs([{name: 'window-shadows'}]), 'a key nobody placed fails loudly');
throws(() => planPrefs([{name: 'mediaish'}]), 'a prefix match needs the dash');

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
