// gjs -m scripts/symbolic-icons.js
//
// Rewrites src/buoy@murilegus/icons/symbolic/ from the table in
// docs/design/icons/render/symbolic-map.js: <theme name>-symbolic.svg, each a Gravity UI
// drawing or Buoy's own (design/icons "Icon symbolic", "Icon tự vẽ"). Design source, not a
// build step; run render/draw-own.js first when a drawing of ours changed.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {SYMBOLIC, sourceFile} from '../docs/design/icons/render/symbolic-map.js';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const RENDER = `${here}/../docs/design/icons/render`;
const OUT = Gio.File.new_for_path(`${here}/../src/buoy@murilegus/icons/symbolic`);

// St recolours each in the text colour: no colour of its own (Gravity's bell-dot has a #f33 dot)
const recolour = svg => svg.trim().replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="currentColor"');

const en = OUT.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
for (let info; (info = en.next_file(null));) {
    if (info.get_name().endsWith('.svg'))
        OUT.get_child(info.get_name()).delete(null);
}
for (const [name, src] of Object.entries(SYMBOLIC)) {
    const svg = new TextDecoder().decode(GLib.file_get_contents(`${RENDER}/${sourceFile(src)}`)[1]);
    GLib.file_set_contents(OUT.get_child(`${name}-symbolic.svg`).get_path(), `${recolour(svg)}\n`);
}
print(`symbolic-icons: ${Object.keys(SYMBOLIC).length} icons`);
