// The daypart and weather icons: 19 colour SVGs from scripts/icons.js on a 24 grid, filling
// the pill's 24 px leading cell, always on black (docs/design/icons, 2026-11-11). Checks the
// technical contract (24 grid, flat, solid, nothing loaded at runtime), the palette (none of
// the status light colours), that the family shares its parts (one cloud, one horizon…),
// and, rendered at 24 px, that the horizon and the arc are whole pixels.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {STATE_COLOURS} from '../src/buoy@murilegus/lib/kit/model/palette.js';

// librsvg is what St.Icon renders with; its typelib may be missing on a bare machine,
// then only the parse check is skipped (CI installs gir1.2-rsvg-2.0).
let Rsvg = null;
try {
    ({default: Rsvg} = await import('gi://Rsvg'));
} catch {
    print('icons: no Rsvg typelib, the librsvg parse check is skipped');
}

const dir = GLib.build_filenamev([GLib.get_current_dir(), '..', 'src', 'buoy@murilegus', 'icons', 'color']);
const read = name => {
    const [ok, bytes] = GLib.file_get_contents(`${dir}/${name}.svg`);
    if (!ok)
        throw new Error(`${name}.svg missing`);
    return new TextDecoder().decode(bytes);
};
const eq = (a, b, msg) => {
    if (a !== b)
        throw new Error(`${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};
const ok = (c, msg) => {
    if (!c)
        throw new Error(msg);
};

const DAYPARTS = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night'].map(p => `daypart-${p}`);
const WEATHER = ['clear', 'clear-night', 'few-clouds', 'few-clouds-night', 'overcast', 'fog', 'showers-scattered',
    'showers', 'snow', 'storm', 'windy', 'tornado', 'severe-alert'].map(c => `weather-${c}`);
const ALL = [...DAYPARTS, ...WEATHER];
eq(ALL.length, 19, 'nineteen icons');

// Palette A (2026-11-06): sun, peach, teal, ink, cloud, back cloud, snow, fog, horizon; the
// arc's own grey since it lost its opacity (2026-11-11).
const PALETTE = ['#FFD23F', '#FFB889', '#5CD6E6', '#000000', '#CFE6FB', '#7FA8D0', '#BFF2FA', '#9DBBD6', '#7A838D', '#6B737C'];
const STATUS = STATE_COLOURS.map(c => c.toUpperCase()); // the lights and the privacy dots

for (const name of ALL) {
    const svg = read(name);
    ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'),
        `${name}: 24 px grid, viewBox 0 0 24 24`);
    for (const tag of ['linearGradient', 'radialGradient', 'filter', 'mask', 'image', 'text', 'font', 'style', 'script', 'use', 'clipPath'])
        ok(!svg.includes(`<${tag}`), `${name}: no <${tag}> (flat shapes only, nothing loaded at runtime)`);
    ok(!svg.includes('opacity'), `${name}: every part is solid, no opacity`);
    const colours = [...new Set(svg.match(/#[0-9A-Fa-f]{6}/g) ?? [])].map(c => c.toUpperCase());
    ok(colours.length > 0, `${name}: has colour`);
    for (const c of colours) {
        ok(!STATUS.includes(c), `${name}: ${c} is a status light colour`);
        ok(PALETTE.includes(c), `${name}: ${c} is not in the palette`);
    }
    for (const sw of svg.matchAll(/stroke-width="([\d.]+)"/g))
        ok(Number(sw[1]) >= 1 || /stroke-linejoin|id="bolt"/.test(svg), `${name}: stroke ${sw[1]} is thinner than 1 px`);
    const firstId = svg.match(/id="([a-z-]+)"/)?.[1];
    ok(firstId, `${name}: parts carry ids`);
    if (Rsvg) {
        const handle = Rsvg.Handle.new_from_file(`${dir}/${name}.svg`);
        ok(handle.has_sub(`#${firstId}`), `${name}: librsvg parses it and finds #${firstId}`);
        // Inside the grid (ink past the edge is cut; antialiased round caps may reach half a
        // pixel out), and a weather icon centred on it. The dayparts are placed by their
        // horizon instead (below): a scene with the sun or moon high is top-heavy by design
        const [, ink] = handle.get_geometry_for_layer(null, new Rsvg.Rectangle({x: 0, y: 0, width: 24, height: 24}));
        const [cx, cy] = [ink.x + ink.width / 2, ink.y + ink.height / 2];
        if (name.startsWith('weather-')) {
            ok(Math.abs(cx - 12) <= 1 && Math.abs(cy - 12) <= 1,
                `${name}: its drawing centred within 1 px of the grid's centre, is at (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
            ok(ink.width >= 19.5 && ink.height >= 17.5, `${name}: fills the cell (20 × 18 or more), is ${ink.width.toFixed(1)} × ${ink.height.toFixed(1)}`);
        }
        ok(ink.x >= -0.5 && ink.y >= -0.5 && ink.x + ink.width <= 24.5 && ink.y + ink.height <= 24.5,
            `${name}: inside the 24 grid (${ink.x.toFixed(1)}, ${ink.y.toFixed(1)}, ${(ink.x + ink.width).toFixed(1)}, ${(ink.y + ink.height).toFixed(1)})`);
    }
}

// One family: the parts are shared drawings
const sameSun = (a, b, msg) => eq(read(a).match(/<g id="sun">.*?<\/g>/)[0], read(b).match(/<g id="sun">.*?<\/g>/)[0], msg);
const dayparts = DAYPARTS.map(read);
const horizon = dayparts[0].match(/<g id="arc".*?<rect id="horizon"[^>]*>/)[0];
for (const [i, svg] of dayparts.entries())
    ok(svg.includes(horizon), `${DAYPARTS[i]}: the same horizon and arc as dawn`);
// The horizon: exactly one pixel row, row 16 (y 16–17), x 1–23; in the 32 px pill that is row
// 20, the bottom row of the time's figures at 1em (docs/design/icons, 2026-11-12, Ethan: the
// scene a pixel lower than row 15)
const HY = 16;
ok(horizon.endsWith(`<rect id="horizon" x="1" y="${HY}" width="22" height="1" fill="#7A838D"/>`),
    'the horizon: one pixel row at y 16, x 1 to 23, solid');
// The sun's path: single pixels in the arc's grey, mirrored in x = 12, near the circle of
// radius 8.4 around (12, 16), none on or next to the horizon row
const ARC = [[3, 13], [4, 11], [6, 9], [8, 8], [10, 7], [13, 7], [15, 8], [17, 9], [19, 11], [20, 13]];
const cells = [...horizon.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1"\/>/g)].map(m => [Number(m[1]), Number(m[2])]);
eq(JSON.stringify(cells), JSON.stringify(ARC), 'the arc\'s pixels, left to right');
ok(horizon.startsWith('<g id="arc" fill="#6B737C">'), 'the arc: solid #6B737C');
for (const [x, y] of cells) {
    ok(cells.some(([mx, my]) => mx === 23 - x && my === y), `arc pixel (${x}, ${y}) has its mirror`);
    const d = Math.hypot(x + 0.5 - 12, y + 0.5 - HY);
    ok(Math.abs(d - 8.4) <= 0.5, `arc pixel (${x}, ${y}) is ${d.toFixed(2)} from (12, ${HY}), not about 8.4`);
    ok(y <= HY - 2, `arc pixel (${x}, ${y}) stays clear of the horizon row`);
}
// Dawn and evening: half a disc on the horizon row, five rays 35° apart, the outer two a
// pixel shorter (2026-11-11, Ethan); evening is dawn mirrored in x = 12
const rays = name => [...read(name).match(/<g id="sun">.*?<\/g>/)[0]
    .matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
for (const [name, cx] of [['daypart-dawn', 9], ['daypart-evening', 15]]) {
    ok(read(name).includes(`<g id="sun"><path d="M${cx - 5} ${HY}A5 5 0 0 1 ${cx + 5} ${HY}Z"`), `${name}: half a disc of radius 5 at x ${cx}, on row ${HY}`);
    const r = rays(name);
    eq(r.length, 5, `${name}: five rays`);
    eq(JSON.stringify(r.map(([x1, y1, x2, y2]) => Math.round(Math.hypot(x2 - x1, y2 - y1)))), '[1,2,2,2,1]',
        `${name}: the outer rays a pixel shorter than the upper three`);
    eq(JSON.stringify(r.map(([x1, y1]) => Math.round(Math.atan2(HY - y1, x1 - cx) * 180 / Math.PI))), '[160,125,90,55,20]',
        `${name}: rays 35° apart`);
}
eq(JSON.stringify(rays('daypart-evening').map(([x1, y1, x2, y2]) => [24 - x1, y1, 24 - x2, y2].map(v => v.toFixed(1))).reverse()),
    JSON.stringify(rays('daypart-dawn').map(r => r.map(v => v.toFixed(1)))), 'evening: dawn mirrored');
ok(!read('daypart-night').includes('id="sun"') && read('daypart-night').includes('id="moon"'), 'night: moon, no sun');
ok(read('daypart-dawn').includes('#FFB889') && read('daypart-evening').includes('#FFB889'), 'dawn and evening: peach sun');
const cloudy = ['few-clouds', 'few-clouds-night', 'overcast', 'fog', 'showers-scattered', 'showers', 'snow', 'storm'].map(c => `weather-${c}`);
for (const name of cloudy)
    ok(read(name).includes('<g id="cloud" fill="#CFE6FB">'), `${name}: the shared cloud, in the cloud colour`);
ok(read('weather-overcast').includes('id="cloud-back" fill="#7FA8D0"'), 'overcast: a darker cloud behind');
for (const name of ['weather-clear', 'weather-few-clouds', 'weather-showers-scattered', ...DAYPARTS.slice(1, 4)])
    ok(/<g id="sun"><circle[^>]*fill="#FFD23F"/.test(read(name)), `${name}: the yellow sun`);
for (const name of ['weather-clear-night', 'weather-few-clouds-night', 'daypart-night'])
    ok(/<path id="moon"[^>]*fill="#5CD6E6"/.test(read(name)), `${name}: the teal moon`);
ok(read('weather-showers').includes('id="rain"') && read('weather-snow').includes('id="snow"') &&
    read('weather-storm').includes('id="bolt"') && read('weather-windy').includes('id="wind"'), 'rain, snow, bolt, wind carry their ids');
ok(read('weather-severe-alert').includes('fill="#000000"'), 'severe-alert: the "!" is cut in black');
void sameSun;

// Rendered at 24 px, as the pill shows them: whole pixels, nothing smeared over two rows
if (Rsvg) {
    const hex = (px, n, x, y) => {
        const i = y * px.get_rowstride() + x * n;
        const b = px.get_pixels();
        return n === 4 && b[i + 3] === 0 ? 'none'
            : `#${[b[i], b[i + 1], b[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()}${n === 4 && b[i + 3] !== 255 ? `/${b[i + 3]}` : ''}`;
    };
    for (const name of DAYPARTS) {
        // librsvg's own rasteriser at the SVG's size: no gdk-pixbuf loader needed
        const px = Rsvg.Handle.new_from_file(`${dir}/${name}.svg`).get_pixbuf();
        eq(`${px.get_width()}x${px.get_height()}`, '24x24', `${name}: renders 24 × 24`);
        const n = px.get_n_channels();
        for (let x = 0; x < 24; x++) {
            eq(hex(px, n, x, HY), x >= 1 && x <= 22 ? '#7A838D' : 'none', `${name}: horizon row ${HY}, column ${x}`);
            for (let y = HY + 1; y < 24; y++)
                eq(hex(px, n, x, y), 'none', `${name}: nothing under the horizon at (${x}, ${y})`);
        }
        // an arc pixel is its grey in full, or under the sun or the moon: never half lit
        for (const [x, y] of ARC)
            ok(!hex(px, n, x, y).startsWith('#6B737C/'), `${name}: arc pixel (${x}, ${y}) is ${hex(px, n, x, y)}`);
        const free = ARC.filter(([x, y]) => hex(px, n, x, y) === '#6B737C');
        ok(free.length >= 4, `${name}: at least four arc pixels show in full, ${free.length} do`);
    }
}

// The symbolic icons (Gravity UI's and Buoy's own, icons/symbolic): St draws them in the
// text colour, so none carries a colour of its own — a dot in red would read as a light
// (design/colours "Một màu một nghĩa"; Gravity's bell-dot came with #f33, 2026-11-12)
{
    const sym = GLib.build_filenamev([dir, '..', 'symbolic']);
    const en = Gio.File.new_for_path(sym).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    let n = 0;
    for (let info; (info = en.next_file(null));) {
        const name = info.get_name();
        if (!name.endsWith('.svg'))
            continue;
        ok(name.endsWith('-symbolic.svg'), `${name}: named -symbolic.svg, so St recolours it`);
        const svg = new TextDecoder().decode(GLib.file_get_contents(GLib.build_filenamev([sym, name]))[1]);
        for (const m of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g))
            ok(['currentColor', 'none', '#fff', '#ffffff'].includes(m[1]), `${name}: ${m[0]} is a colour of its own`);
        n++;
    }
    ok(n >= 30, `the symbolic icons: ${n}`);
}

print('icons: ok');
