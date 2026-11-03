// Run: gjs -m tests/settings.test.js   (pure: where prefs puts each schema key, samples)
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {planPrefs, setPinned, addApp, sampleFor, packDict, toVariant, SAMPLES, HIDDEN_MODULES, STANDALONE} from
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
eq(plan.general, ['expanded-width', 'keybind-focus'], 'General: the island\'s own keys, in schema order');
eq(plan.apps, ['apps-hidden', 'apps-plain'], 'Apps page');
eq(plan.developer, ['dev-mode'], 'Developer group');
eq(plan.modules.map(m => m.id), ['media', 'notification', 'progress', 'timer', 'calendar', 'clipboard'],
    'Modules: schema order, without the modules that ship nothing yet');
eq(plan.modules.find(m => m.id === 'calendar'), {
    id: 'calendar', enableKey: 'modules-calendar', keys: [], standalone: true, sample: null,
}, 'a standalone module: its switch, pin, no sample');
eq(plan.modules.find(m => m.id === 'media').sample !== null, true, 'media has a sample');
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

const fake = [{name: 'modules-media'}, {name: 'media-peek-on-hover'}, {name: 'modules-ask'}, {name: 'ask-timeout'}, {name: 'dev-mode'}];
const p2 = planPrefs(fake);
eq(p2.modules.map(m => [m.id, m.keys]), [['media', ['media-peek-on-hover']]],
    'a module\'s own key lives in its row; a hidden module\'s key is hidden with it');
throws(() => planPrefs([{name: 'cluster-background'}]), 'a key nobody placed fails loudly');
throws(() => planPrefs([{name: 'mediaish'}]), 'a prefix match needs the dash');

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

console.log('settings: ok');
