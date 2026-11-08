// Run: gjs -m tests/metadata.test.js
// metadata.json and the schema must agree, or getSettings() throws in enable().
import GLib from 'gi://GLib';

import {donationLinks} from '../src/buoy@murilegus/lib/kit/settings.js';

const ROOT = GLib.path_get_dirname(GLib.path_get_dirname(
    GLib.filename_from_uri(import.meta.url)[0]));
const EXT = `${ROOT}/src/buoy@murilegus`;

function read(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        throw new Error(`cannot read ${path}`);
    return new TextDecoder().decode(bytes);
}

const meta = JSON.parse(read(`${EXT}/metadata.json`));
const xml = read(`${EXT}/schemas/org.gnome.shell.extensions.buoy.gschema.xml`);

if (meta.uuid !== 'buoy@murilegus')
    throw new Error(`uuid: ${meta.uuid}`);
if (!meta['shell-version']?.includes('50'))
    throw new Error(`shell-version must list "50": ${JSON.stringify(meta['shell-version'])}`);
if (!meta['settings-schema'])
    throw new Error('metadata.json has no settings-schema');

const ids = [...xml.matchAll(/<schema\s+id="([^"]+)"/g)].map(m => m[1]);
if (!ids.includes(meta['settings-schema']))
    throw new Error(`settings-schema ${meta['settings-schema']} not in schema ids ${ids}`);

const path = xml.match(/<schema\s+id="[^"]+"\s+path="([^"]+)"/)?.[1];
if (path !== `/${meta['settings-schema'].replaceAll('.', '/')}/`)
    throw new Error(`schema path ${path} does not follow the id`);

// enable() reads `modules-<id>` for every module it imports; a missing key throws there.
const ext = read(`${EXT}/extension.js`);
for (const [, dir] of ext.matchAll(/from '\.\/lib\/modules\/([\w-]+)\/index\.js'/g)) {
    if (!xml.includes(`<key name="modules-${dir}" type="b">`))
        throw new Error(`module ${dir} is imported by extension.js but has no modules-${dir} key`);
}

// donations (gjs.guide; EGO and the About page show them): every service is one EGO and
// donationLinks() know, so a typo cannot hide the Support group without a failing test
const SERVICES = ['buymeacoffee', 'custom', 'github', 'kofi', 'liberapay', 'opencollective', 'patreon', 'paypal'];
if (meta.donations !== undefined) {
    for (const k of Object.keys(meta.donations)) {
        if (!SERVICES.includes(k))
            throw new Error(`metadata donations: unknown service "${k}"`);
    }
    if (!donationLinks(meta.donations).length)
        throw new Error('metadata donations: no usable link');
}
if (!/^https:\/\/github\.com\/murilegus\/buoy$/.test(meta.url ?? ''))
    throw new Error(`metadata url: ${meta.url} (the About page and EGO link it)`);

// One release, one name everywhere (2026-11-08; a third number for a fix release, 2026-11-09): metadata's `version-name` is the name of
// the notes.js entry for its `version`, package.json's version starts with it, and the
// release has its notes for GitHub (docs/releases/<name>.md, read by release.yml)
const notes = (await import('../src/buoy@murilegus/lib/modules/greeting/notes.js')).default;
const name = meta['version-name'];
if (!/^\d+\.\d+(\.\d+)?$/.test(name ?? ''))
    throw new Error(`metadata version-name: ${name} (a name like "0.1" or "0.1.1")`);
const note = notes.find(n => n.version === meta.version);
if (note?.name !== name)
    throw new Error(`notes.js: version ${meta.version} is named ${note?.name}, metadata says ${name}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(note.date ?? ''))
    throw new Error(`notes.js: version ${meta.version} has no release day`);
if (notes.at(-1) !== note)
    throw new Error('notes.js: the running version must be the newest entry');
const pkg = JSON.parse(read(`${ROOT}/package.json`));
// "0.1" → package.json "0.1.0"; "0.1.1" → "0.1.1"
const pkgFollows = name.split('.').length === 3 ? pkg.version === name : pkg.version.startsWith(`${name}.`);
if (!pkgFollows)
    throw new Error(`package.json version ${pkg.version} does not follow version-name ${name}`);
if (!GLib.file_test(`${ROOT}/docs/releases/${name}.md`, GLib.FileTest.EXISTS))
    throw new Error(`docs/releases/${name}.md is missing (the GitHub release's notes)`);

console.log('metadata/schema: ok');
