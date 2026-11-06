// gjs -m scripts/icons-sheet.js [srcdir] [out.png] [bigpx]
// Contact sheet of the daypart and weather icons on black: a 20 px row, a grid at 40 px
// with names, and five mock idle pills. Defaults: the extension's icons/ → docs/icons.png.
import Cairo from 'cairo';
import GLib from 'gi://GLib';
import Rsvg from 'gi://Rsvg';

const here = GLib.path_get_dirname(import.meta.url.replace('file://', ''));
const src = ARGV[0] ?? `${here}/../src/buoy@murilegus/icons`;
const out = ARGV[1] ?? `${here}/../docs/icons.png`;
const big = Number(ARGV[2] ?? 40);
const names = [
    'daypart-dawn', 'daypart-morning', 'daypart-noon', 'daypart-afternoon', 'daypart-evening', 'daypart-night',
    'weather-clear', 'weather-clear-night', 'weather-few-clouds', 'weather-few-clouds-night', 'weather-overcast',
    'weather-fog', 'weather-showers-scattered', 'weather-showers', 'weather-snow', 'weather-storm',
    'weather-windy', 'weather-tornado', 'weather-severe-alert',
];
const cols = 10;
const cell = big + 24;
const rows = Math.ceil(names.length / cols);
const W = cols * cell + 24;
const H = 24 + 44 + rows * (cell + 18) + 70;
const surf = new Cairo.ImageSurface(Cairo.Format.ARGB32, W, H);
const cr = new Cairo.Context(surf);
cr.setSourceRGB(0, 0, 0);
cr.paint();

const draw = (name, x, y, s) => {
    const handle = Rsvg.Handle.new_from_file(`${src}/${name}.svg`);
    handle.render_document(cr, new Rsvg.Rectangle({x, y, width: s, height: s}));
};
const label = name => name
    .replace('weather-', '').replace('daypart-', '')
    .replace('showers-scattered', 'showers-sc.').replace('few-clouds-night', 'few-cl-night');

names.forEach((n, i) => draw(n, 12 + i * 30, 14, 20));
cr.selectFontFace('sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
cr.setFontSize(9);
names.forEach((n, i) => {
    const x = 12 + (i % cols) * cell;
    const y = 60 + Math.floor(i / cols) * (cell + 18);
    draw(n, x, y, big);
    cr.setSourceRGB(0.6, 0.6, 0.6);
    cr.moveTo(x, y + big + 11);
    cr.showText(label(n));
});

const barY = H - 56;
cr.setSourceRGB(0.16, 0.16, 0.17);
cr.rectangle(0, barY, W, 44);
cr.fill();
const pill = (x, icon, text) => {
    const w = 20 + 10 + 8 * text.length + 16;
    cr.setSourceRGB(0, 0, 0);
    cr.newSubPath();
    cr.arc(x + 15, barY + 22, 15, Math.PI / 2, 3 * Math.PI / 2);
    cr.arc(x + w - 15, barY + 22, 15, -Math.PI / 2, Math.PI / 2);
    cr.closePath();
    cr.fill();
    draw(icon, x + 10, barY + 12, 20);
    cr.setSourceRGB(1, 1, 1);
    cr.setFontSize(13);
    cr.moveTo(x + 36, barY + 27);
    cr.showText(text);
};
pill(16, 'daypart-afternoon', '14:32');
pill(130, 'weather-few-clouds', '31°');
pill(230, 'weather-showers', '24°');
pill(330, 'daypart-night', '23:05');
pill(450, 'weather-storm', '19°');
surf.writeToPNG(out);
print(`${out} ${W}x${H}`);
