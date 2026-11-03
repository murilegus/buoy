// Run: gjs -m tests/dbus.test.js   (the D-Bus API end to end, on a private test bus)
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {BuoyDBus, PATH, VERSION, check} from '../src/buoy@murilegus/lib/kit/dbus.js';
import {ActivityStack} from '../src/buoy@murilegus/lib/kit/stack.js';
import {Registry, parseProfile} from '../src/buoy@murilegus/lib/kit/registry.js';

const IFACE = 'org.gnome.Shell.Extensions.Buoy';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// JS value → GVariant the way a caller (gdbus, a Python script) would send it
function toV(x) {
    if (typeof x === 'string')
        return new GLib.Variant('s', x);
    if (typeof x === 'boolean')
        return new GLib.Variant('b', x);
    if (typeof x === 'number')
        return Number.isInteger(x) ? new GLib.Variant('i', x) : new GLib.Variant('d', x);
    if (Array.isArray(x)) {
        return x.every(e => typeof e === 'string')
            ? new GLib.Variant('as', x)
            : new GLib.Variant('aa{sv}', x.map(dict));
    }
    return new GLib.Variant('a{sv}', dict(x));
}
const dict = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toV(v)]));
const asv = dict; // inside a tuple signature GJS packs an a{sv} from an object of variants

// --- check(): what a caller may send -----------------------------------------------
const bad = (data, pattern, msg, opts) => {
    try {
        check(data, opts);
    } catch (e) {
        if (!pattern.test(e.message))
            throw new Error(`${msg}: "${e.message}"`);
        return;
    }
    throw new Error(`${msg}: accepted`);
};
eq(check({kind: 'progress', text: 'x'}), {kind: 'progress', text: 'x'}, 'minimal activity');
bad({text: 'x'}, /kind is required/, 'no kind');
bad({kind: 'ask'}, /Ask/, 'ask is reserved for Ask()');
bad({kind: 'Progress!'}, /kind/, 'kind name');
bad({kind: 'progress', colour: 1}, /unknown key "colour"/, 'unknown key');
bad({kind: 'progress', onAction: 'x'}, /unknown key "onAction"/, 'callbacks cannot come over D-Bus');
bad({kind: 'progress', id: 'a b'}, /id/, 'id characters');
bad({kind: 'progress', id: 'x'.repeat(65)}, /id/, 'id length');
bad({kind: 'progress', priority: 101}, /priority/, 'priority range');
bad({kind: 'progress', ttl: -1}, /ttl/, 'ttl sign');
bad({kind: 'progress', style: 'loud'}, /style/, 'style');
bad({kind: 'progress', actions: [{label: 'x'}]}, /actions/, 'action without id');
bad({kind: 'progress', text: 'x'.repeat(17000)}, /16384 bytes/, 'size cap');
bad({kind: 'progress'}, /cannot change id or kind/, 'patch cannot change kind', {patch: true});
eq(check({text: 'y'}, {patch: true}), {text: 'y'}, 'a patch needs no kind');

// --- end to end over a peer-to-peer connection ---------------------------------------
// No bus daemon: Gio.TestDBus's down() hangs on a session-bus singleton GJS keeps. A
// DBusServer on a temporary socket gives the same wire protocol (marshalling, errors,
// signals, async replies) without one.
const dir = GLib.dir_make_tmp('buoy-dbus-XXXXXX');
const dbusServer = Gio.DBusServer.new_sync(`unix:path=${dir}/bus`, Gio.DBusServerFlags.NONE,
    Gio.dbus_generate_guid(), null, null);
let api = null, client = null;
const dest = null; // peer to peer: no bus names

const island = {
    capacity: 3, list: [], render(list) {
        this.list = list;
    }, setLight() {},
};
const stack = new ActivityStack(island);
const registry = new Registry();
registry.setProfiles(new Map([['deploy', parseProfile({
    title: '{branch} deployed', priority: 70, skip: {field: 'branch', pattern: '^wip/'},
})]]));
dbusServer.connect('new-connection', (_s, conn) => {
    api = new BuoyDBus(stack, {registry, connection: conn});
    api.export();
    return true;
});
dbusServer.start();
const connected = new Promise((resolve, reject) => Gio.DBusConnection.new_for_address(
    dbusServer.get_client_address(), Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT, null, null, (_o, res) => {
        try {
            client = Gio.DBusConnection.new_for_address_finish(res);
            resolve();
        } catch (e) {
            reject(e);
        }
    }));

function call(method, sig, args, timeout = 5000) {
    return new Promise((resolve, reject) => {
        client.call(dest, PATH, IFACE, method, new GLib.Variant(sig, args), null,
            Gio.DBusCallFlags.NONE, timeout, null, (c, res) => {
                try {
                    resolve(c.call_finish(res).deepUnpack());
                } catch (e) {
                    reject(e);
                }
            });
    });
}
async function rejects(promise, pattern, msg) {
    try {
        await promise;
    } catch (e) {
        if (!pattern.test(e.message))
            throw new Error(`${msg}: "${e.message}"`);
        return;
    }
    throw new Error(`${msg}: no error`);
}
const tick = (ms = 10) => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
const shown = () => island.list.map(a => `${a.id}=${a.text}`);

async function main() {
    await connected;
    while (!api)
        await tick(5); // eslint-disable-line no-await-in-loop -- wait for the server side
    // property
    const [version] = await new Promise((resolve, reject) => client.call(dest, PATH,
        'org.freedesktop.DBus.Properties', 'Get', new GLib.Variant('(ss)', [IFACE, 'Version']),
        null, Gio.DBusCallFlags.NONE, 5000, null, (c, r) => {
            try {
                resolve(c.call_finish(r).recursiveUnpack());
            } catch (e) {
                reject(e);
            }
        }));
    eq(version, VERSION, 'Version property');

    // Surface
    let [id] = await call('Surface', '(a{sv})', [asv({kind: 'progress', text: 'Copying', leading: {progress: 0.25}})]);
    eq(id, '1', 'no id given: one is made up and returned');
    let a = stack.get('dbus:1');
    eq([a.kind, a.app, a.text, a.leading], ['progress', 'system', 'Copying', {progress: 0.25}],
        'nested a{sv} arrives as plain data; no app → system');
    [id] = await call('Surface', '(a{sv})', [asv({
        id: 'build-42', kind: 'progress', app: 'org.example.Builder', text: 'Build',
        actions: [{id: 'stop', label: 'Stop'}],
    })]);
    eq([id, stack.get('dbus:build-42').app], ['build-42', 'builder'], 'caller id kept, app slugged');
    eq(stack.has('build-42'), false, 'ids are kept apart from modules\' (dbus: prefix)');

    // Action signal
    const got = [];
    const sub = client.signal_subscribe(dest, IFACE, 'Action', PATH, null, Gio.DBusSignalFlags.NONE,
        (_c, _s, _p, _i, _n, params) => got.push(params.deepUnpack()));
    stack.get('dbus:build-42').onAction('stop');   // what a button press does (present.js)
    await tick(50);
    eq(got, [['build-42', 'stop']], 'a pressed button reaches the caller as Action(id, action)');
    client.signal_unsubscribe(sub);

    // Update / End
    eq(await call('Update', '(sa{sv}b)', ['build-42', asv({text: 'Build 80%', leading: {progress: 0.8}}), false]), [true],
        'Update finds its activity');
    eq(stack.get('dbus:build-42').text, 'Build 80%', 'Update applied');
    eq(await call('Update', '(sa{sv}b)', ['nope', asv({text: 'x'}), false]), [false], 'Update of an unknown id');
    await rejects(call('Update', '(sa{sv}b)', ['build-42', asv({kind: 'media'}), false]), /cannot change id or kind/,
        'Update cannot change kind');
    eq(await call('End', '(s)', ['build-42']), [true], 'End');
    eq(await call('End', '(s)', ['build-42']), [false], 'End again: gone');
    eq(stack.has('dbus:build-42'), false, 'ended in the stack');

    // errors come back as D-Bus InvalidArgs naming the key
    await rejects(call('Surface', '(a{sv})', [asv({text: 'no kind'})]), /InvalidArgs.*kind is required/, 'missing kind');
    await rejects(call('Surface', '(a{sv})', [asv({kind: 'x', colour: 'red'})]), /unknown key "colour"/, 'unknown key');

    // profiles (PROFILES.md: attributes are the event)
    [id] = await call('Surface', '(a{sv})', [asv({
        id: 'd', kind: 'deploy', app: 'Deploy', text: 'theirs',
        attributes: {branch: 'main'},
    })]);
    a = stack.get('dbus:d');
    eq([a.text, a.priority], ['main deployed', 70], 'the user profile goes on top of the caller\'s pill');
    await call('Update', '(sa{sv}b)', ['d', asv({text: 'theirs again', attributes: {branch: 'release'}}), false]);
    eq(stack.get('dbus:d').text, 'release deployed', 'and stays on top through updates');
    eq(await call('Update', '(sa{sv}b)', ['d', asv({attributes: {branch: 'wip/x'}}), false]), [true],
        'an update the profile skips…');
    eq(stack.has('dbus:d'), false, '…ends the activity');
    eq(await call('Surface', '(a{sv})', [asv({id: 'd2', kind: 'deploy', app: 'deploy', attributes: {branch: 'wip/y'}})]), [''],
        'Surface skipped by the profile returns an empty id');

    // Schedule
    [id] = await call('Schedule', '(a{sv}x)', [asv({id: 'mtg', kind: 'calendar', text: 'Standup'}), Date.now() + 150]);
    eq([id, stack.has('dbus:mtg'), stack.get('dbus:mtg')], ['mtg', true, null], 'scheduled, not live yet');
    await tick(300);
    eq(stack.get('dbus:mtg')?.text, 'Standup', 'live at its time');
    await call('End', '(s)', ['mtg']);

    // Ask
    let pending = call('Ask', '(ssasa{sv})', ['q1', 'Allow rm -rf build?', ['Deny', 'Allow'], asv({app: 'claude-code'})], 10000);
    await tick(50);
    a = stack.get('dbus:q1');
    eq([a.kind, a.app, a.text], ['ask', 'claude-code', 'Allow rm -rf build?'], 'Ask shows a question in the pill');
    stack.answer('dbus:q1', 'Allow');                 // the user pressed Allow
    eq(await pending, ['Allow'], 'Ask replies with the choice');
    pending = call('Ask', '(ssasa{sv})', ['q2', 'Proceed?', ['Deny', 'Allow'], asv({timeoutMs: 100, fallback: 'Deny'})], 10000);
    eq(await pending, ['Deny'], 'timeout → fallback');
    pending = call('Ask', '(ssasa{sv})', ['q3', 'Proceed?', ['Ok'], asv({})], 10000);
    await tick(50);
    await call('End', '(s)', ['q3']);
    eq(await pending, [''], 'ended before an answer → empty choice');
    await rejects(call('Ask', '(ssasa{sv})', ['q4', '?', [], asv({})]), /options/, 'Ask needs options');
    await rejects(call('Ask', '(ssasa{sv})', ['q5', '?', ['A'], asv({fallback: 'B'})]), /fallback/, 'fallback must be an option');

    // limit: only the D-Bus activities live now count
    await call('End', '(s)', ['1']);
    for (let i = 0; i < 32; i++)
        // eslint-disable-next-line no-await-in-loop -- one at a time, like a script would
        await call('Surface', '(a{sv})', [asv({id: `n${i}`, kind: 'progress', text: `${i}`})]);
    await rejects(call('Surface', '(a{sv})', [asv({id: 'n32', kind: 'progress'})]), /LimitsExceeded|at most 32/, 'at most 32 live');
    await call('End', '(s)', ['n0']);
    eq(await call('Surface', '(a{sv})', [asv({id: 'n32', kind: 'progress', text: 'ok'})]), ['n32'], 'room again after End');
    eq((await call('Surface', '(a{sv})', [asv({id: 'n5', kind: 'progress', text: 'again'})]))[0], 'n5',
        'surfacing an existing id replaces it, even at the limit');

    // unexport
    api.unexport();
    await rejects(call('End', '(s)', ['n1']), /UnknownMethod|No such interface|not exported|Object does not exist/i,
        'after unexport nothing answers');
    eq(shown().length > 0, true, 'unexport leaves the stack to the extension');
}

const loop = new GLib.MainLoop(null, false);
let failure = null;
main().catch(e => {
    failure = e;
}).finally(() => loop.quit());
loop.run();
stack.destroy();
dbusServer.stop();
GLib.unlink(`${dir}/bus`);
GLib.rmdir(dir);
if (failure)
    throw failure;
print('dbus: ok');
