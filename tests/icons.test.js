// The daypart and weather icons: 19 colour SVGs from scripts/icons.js, shown at 20 px in
// the idle pill and 40 px in the hover card, always on black. Checks the technical
// contract (16 grid, flat, nothing loaded at runtime), the palette (none of the status
// light colours), and that the family shares its parts (one cloud, one horizon…).
import GLib from 'gi://GLib';

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

// Palette A (2026-11-06): sun, peach, teal, ink, cloud, back cloud, snow, fog, horizon.
const PALETTE = ['#FFD23F', '#FFB889', '#5CD6E6', '#000000', '#CFE6FB', '#7FA8D0', '#BFF2FA', '#9DBBD6', '#7A838D'];
const STATUS = ['#EF9F27', '#E24B4A', '#F0997B', '#5DCAA5']; // amber, red, orange, green: the lights

for (const name of ALL) {
    const svg = read(name);
    ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'),
        `${name}: 16 px grid, viewBox 0 0 16 16`);
    for (const tag of ['linearGradient', 'radialGradient', 'filter', 'mask', 'image', 'text', 'font', 'style', 'script', 'use', 'clipPath'])
        ok(!svg.includes(`<${tag}`), `${name}: no <${tag}> (flat shapes only, nothing loaded at runtime)`);
    ok(!svg.includes('opacity="0') || /id="arc"/.test(svg), `${name}: only the daypart arc is translucent`);
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
        const [, ink] = handle.get_geometry_for_layer(null, new Rsvg.Rectangle({x: 0, y: 0, width: 16, height: 16}));
        const [cx, cy] = [ink.x + ink.width / 2, ink.y + ink.height / 2];
        if (name.startsWith('weather-')) {
            ok(Math.abs(cx - 8) <= 1.2 && Math.abs(cy - 8) <= 1.2,
                `${name}: its drawing centred within 1.2 px of the grid's centre, is at (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
        }
        ok(ink.x >= -0.5 && ink.y >= -0.5 && ink.x + ink.width <= 16.5 && ink.y + ink.height <= 16.5,
            `${name}: inside the 16 grid (${ink.x.toFixed(1)}, ${ink.y.toFixed(1)}, ${(ink.x + ink.width).toFixed(1)}, ${(ink.y + ink.height).toFixed(1)})`);
    }
}

// One family: the parts are shared drawings
const sameSun = (a, b, msg) => eq(read(a).match(/<g id="sun">.*?<\/g>/)[0], read(b).match(/<g id="sun">.*?<\/g>/)[0], msg);
const dayparts = DAYPARTS.map(read);
const horizon = dayparts[0].match(/<path id="arc".*?<line id="horizon"[^>]*>/)[0];
for (const [i, svg] of dayparts.entries())
    ok(svg.includes(horizon), `${DAYPARTS[i]}: the same horizon and arc as dawn`);
// The horizon at y 11: at 20 px in the idle pill it falls on the time's baseline row (measured
// in headless Shell, 2026-11-06, Ethan); at 14.2 the scene sat 1.5 px under the digits
ok(/<line id="horizon" x1="1" y1="11" x2="15" y2="11"/.test(dayparts[0]), 'the horizon at y 11, level with the time\'s baseline');
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

print('icons: ok');
