// Run: gjs -m tests/palette.test.js   (the stylesheets use only the palette's roles: design/colours)
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {ROLES, GNOME, HIGH_CONTRAST, STATE_COLOURS} from '../src/buoy@murilegus/lib/kit/model/palette.js';

function ok(cond, msg) {
    if (!cond)
        throw new Error(msg);
}
const eq = (a, e, msg) => ok(JSON.stringify(a) === JSON.stringify(e), `${msg}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);

// --- colours as numbers --------------------------------------------------------------------
/**
 * @param {string} v  a CSS colour
 * @returns {?number[]} [r, g, b, a], 0–255 and 0–1
 */
function parse(v) {
    v = v.trim().toLowerCase();
    let m = v.match(/^#([0-9a-f]{3})$/);
    if (m)
        return [...m[1]].map(c => parseInt(c + c, 16)).concat(1);
    m = v.match(/^#([0-9a-f]{6})$/);
    if (m)
        return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
    m = v.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
    if (m)
        return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    return null;
}
const same = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < (i === 3 ? 0.001 : 0.5));
// over black, as everything inside the island sits
const onBlack = ([r, g, b, a]) => [r * a, g * a, b * a];
function luminance(rgb) {
    const [r, g, b] = rgb.map(c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (fg, bg) => {
    const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
};
function nearest(c) {
    const p = onBlack(c);
    let best = null, d = Infinity;
    for (const [role, v] of Object.entries(ROLES)) {
        const q = onBlack(parse(v));
        const dd = Math.hypot(...p.map((x, i) => x - q[i]));
        if (dd < d)
            [best, d] = [role, dd];
    }
    return best;
}

// --- the palette itself (design/colours "Vai trò", "Đèn và chấm", "Tương phản cao") ------
for (const [role, v] of Object.entries(ROLES))
    ok(parse(v), `${role}: ${v} parses`);
const BLACK = [0, 0, 0];
for (const role of ['fg', 'fg-muted', 'fg-subtle'])
    ok(contrast(onBlack(parse(ROLES[role])), BLACK) >= 4.5, `${role}: text at 4.5:1 or more on the island (WCAG 2.2)`);
for (const role of ['fg-muted', 'fg-subtle']) {   // and on a card (fill-1) or a button (fill-2)
    for (const fill of ['fill-1', 'fill-2']) {
        const bg = onBlack(parse(ROLES[fill])), [r, g, b, a] = parse(ROLES[role]);
        const fg = bg.map((c, i) => c * (1 - a) + [r, g, b][i] * a);
        ok(contrast(fg, bg) >= 4.5, `${role} on ${fill}: 4.5:1 or more`);
    }
}
for (const c of STATE_COLOURS)
    ok(contrast(onBlack(parse(c)), BLACK) >= 3, `state colour ${c}: 3:1 or more on black`);
eq(new Set(STATE_COLOURS).size, 4, 'four state colours, all different');
eq(ROLES['dot-screen'], ROLES['light-waiting'], 'the screen dot is the waiting red, on the other side');
eq([ROLES['light-missed'], ROLES['light-waiting']], ['#ff9f0a', '#ff453a'], 'lights C (Ethan 2026-11-10)');
ok(contrast(onBlack(parse(ROLES['light-missed'])), BLACK) > contrast(onBlack(parse(ROLES['light-waiting'])), BLACK) + 3,
    'amber clearly brighter than red, for red-blind eyes');
for (const role of Object.keys(HIGH_CONTRAST)) {
    ok(role in ROLES, `high contrast raises a real role: ${role}`);
    ok(parse(HIGH_CONTRAST[role])[3] > parse(ROLES[role])[3], `high contrast raises ${role}`);
}
eq(HIGH_CONTRAST['fg-subtle'], ROLES['fg-muted'], 'high contrast: fg-subtle becomes fg-muted (10:1)');

// --- the stylesheets ------------------------------------------------------------------------
const root = GLib.build_filenamev([GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]),
    '..', 'src', 'buoy@murilegus']);
const files = ['stylesheet.css'];
const modules = Gio.File.new_for_path(GLib.build_filenamev([root, 'lib', 'modules']));
const en = modules.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
for (let i; (i = en.next_file(null));) {
    const css = `lib/modules/${i.get_name()}/stylesheet.css`;
    if (GLib.file_test(GLib.build_filenamev([root, css]), GLib.FileTest.EXISTS))
        files.push(css);
}
ok(files.length >= 7, `the main stylesheet and the modules' (${files.length})`);

const COLOUR = /(#[0-9a-fA-F]{3,8}\b|rgba\([^)]*\)|st-transparentize\([^)]*\)\)?|-st-accent-fg-color|-st-accent-color|\btransparent\b)/;
const PROPS = new Set(['color', 'background-color', 'border', 'border-color', 'box-shadow']);  // box-shadow: the focus ring
// the ring of the tab's dot is the background under it mixed on black (design/colours "Giá
// trị suy ra"): one or two fills laid on black
const FILLS = ['fill-0', 'fill-1', 'fill-2', 'fill-3', 'fill-4'].map(r => parse(ROLES[r])[3]);
const mixes = new Set();
for (const a of FILLS) {
    mixes.add(Math.round(255 * a));
    for (const b of FILLS)
        mixes.add(Math.round(255 * (1 - (1 - a) * (1 - b))));
}
const derived = c => c[3] === 1 && c[0] === c[1] && c[1] === c[2] && mixes.has(c[0]);

let checked = 0;
for (const file of files) {
    const css = new TextDecoder().decode(GLib.file_get_contents(GLib.build_filenamev([root, file]))[1]);
    const rules = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sels = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(s => s.trim().replace(/\s+/g, ' '));
        const decls = [...m[2].matchAll(/([a-z-]+)\s*:\s*([^;]*);[ \t]*(?:\/\*\s*(.*?)\s*\*\/)?/g)]
            .map(d => ({prop: d[1], value: d[2].trim(), role: d[3] ?? null}));
        rules.push({sels, decls});
    }
    for (const {sels, decls} of rules) {
        // the bar keeps GNOME's colours, not gathered (design/colours "Theo GNOME")
        if (sels.every(s => s.startsWith('#panel.buoy')))
            continue;
        ok(sels.every(s => !s.startsWith('#panel.buoy')), `${file}: ${sels}: bar and island in one rule`);
        const hc = sels.every(s => s.startsWith('.buoy-hc '));
        ok(hc || sels.every(s => !s.includes('buoy-hc')), `${file}: ${sels}: high contrast rules stand apart`);
        for (const {prop, value, role} of decls) {
            const m = value.match(COLOUR);
            if (!m)
                continue;
            const where = `${file}: ${sels.join(', ')} { ${prop} }`;
            ok(PROPS.has(prop), `${where}: a colour in ${prop}`);
            checked++;
            if (GNOME.includes(m[1]))
                continue;
            const c = parse(m[1]);
            ok(c, `${where}: ${m[1]} is a colour the test reads`);
            if (sels.some(s => s.includes('buoy-tab-dot')) && prop.startsWith('border')) {
                ok(derived(c), `${where}: ${m[1]} is not a fill mixed on black`);
                continue;
            }
            ok(role, `${where}: ${m[1]} names no role (nearest: ${nearest(c)})`);
            ok(role in ROLES, `${where}: "${role}" is not a role`);
            const want = hc && role in HIGH_CONTRAST ? HIGH_CONTRAST[role] : ROLES[role];
            ok(same(c, parse(want)), `${where}: ${m[1]} is not ${role} (${want}); nearest role: ${nearest(c)}`);
        }
    }
    // every use of a role high contrast raises has its line under .buoy-hc, in the same file
    const hcRules = rules.filter(r => r.sels.every(s => s.startsWith('.buoy-hc ')));
    const covered = (sel, prop, role) => hcRules.some(r => r.sels.includes(`.buoy-hc ${sel}`) &&
        r.decls.some(d => d.role === role && (d.prop === prop || (prop === 'border' && d.prop === 'border-color')) &&
            same(parse(d.value.match(COLOUR)[1]), parse(HIGH_CONTRAST[role]))));
    for (const {sels, decls} of rules) {
        if (sels.some(s => s.includes('buoy-hc')))
            continue;
        for (const {prop, role} of decls) {
            if (!(role in HIGH_CONTRAST))
                continue;
            for (const sel of sels)
                ok(covered(sel, prop, role), `${file}: ${sel} { ${prop}: ${role} } has no high contrast line (.buoy-hc ${sel})`);
        }
    }
    for (const {sels, decls} of hcRules) {
        for (const {role} of decls) {
            if (!(role in HIGH_CONTRAST))
                continue;
            for (const sel of sels) {
                const base = sel.slice('.buoy-hc '.length);
                ok(rules.some(r => r.sels.includes(base) && r.decls.some(d => d.role === role)),
                    `${file}: ${sel}: no rule ${base} uses ${role}`);
            }
        }
    }
}
ok(checked > 150, `colours checked: ${checked}`);

console.log('palette: ok');
