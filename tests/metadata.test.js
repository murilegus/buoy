// Run: gjs -m tests/metadata.test.js
// metadata.json and the schema must agree, or getSettings() throws in enable().
import GLib from 'gi://GLib';

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

console.log('metadata/schema: ok');
