// Shared by the render scripts: everything is drawn straight at 3× (sharp when zoomed), but text
// laid out at 3× is a little wider than the same text hinted at 1× (85 px at 1× is ≈ 87.75 px at 3×
// for the clock). fit() spreads the difference over the glyphs with letter-spacing so a label keeps
// the width a scale-1 screen gives it — what the boxes in the drawings are measured against.
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';
import GLib from 'gi://GLib';
import Rsvg from 'gi://Rsvg?version=2.0';
import {frameAt, cells, lampColour} from '../../../src/buoy@murilegus/lib/kit/model/mascot.js';

export const SCALE = 3;

// The palette as decided (design/colours), one place for every drawing. Roles over the island's
// black: white at an alpha (FG*, FILL*, BORDER) or as the grey it gives on black (GREY.*). The
// wallpaper and the guide marks (cyan, red) are not palette.
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
export const C = Object.freeze({
    FG: 1, FG_MUTED: .70, FG_SUBTLE: .50, FG_DISABLED: .28,
    FILL0: .04, FILL1: .08, FILL2: .12, FILL3: .20, FILL4: .28, BORDER: .12, LIGHT_OFF: .20,
    WHITE: [1, 1, 1], BLACK: [0, 0, 0], CREAM: rgb('#F1EFE8'), MENU: rgb('#1F1F1F'), ACCENT: rgb('#3584E4'),
    AMBER: rgb('#FF9F0A'), RED: rgb('#FF453A'), MIC: rgb('#BF5AF2'), CAM: rgb('#30D158'),
    WALL: [0.20, 0.17, 0.35],
});
export const GREY = Object.freeze({MUTED: [.70, .70, .70], SUBTLE: [.50, .50, .50]});
// The one sample cover (design/index "Một bộ nội dung mẫu"): the cover of SAMPLE.track, a
// diagonal gradient from the top left
export const COVER = Object.freeze([[.95, .55, .35], [.35, .25, .75]]);
// The one sample content (design/index "Một bộ nội dung mẫu"): every drawing takes its words from
// here, so a new sample is one edit and every image is redrawn the same
export const SAMPLE = Object.freeze((() => {
    // short: what a reply button calls the person (a Vietnamese name goes by its last word)
    const track = 'Sóng Ngoài Khơi', artist = 'Hải Đăng', app = 'Spotify', person = 'Quỳnh Trâm', short = 'Trâm';
    return {track, artist, app, sub: `${artist} · ${app}`, person, short};
})());

// the width a label has at 1× (hinted, as on a scale-1 screen)
const meas1 = new cairo.Context(new cairo.ImageSurface(cairo.Format.ARGB32, 4, 4));
const ML = PangoCairo.create_layout(meas1);
PangoCairo.context_set_resolution(ML.get_context(), 96);
export function width1x(desc, text, features = 'tnum') {
    ML.set_font_description(desc);
    const at = new Pango.AttrList(); if (features) at.insert(Pango.attr_font_features_new(features));
    ML.set_attributes(at); ML.set_text(text, -1); PangoCairo.update_layout(meas1, ML);
    return ML.get_extents()[1].width / Pango.SCALE;
}

// layout L already holds its text and font; target is the 1× width in logical px
export function fit(L, cr, target, features = 'tnum') {
    let ls = 0;
    for (let pass = 0; pass < 3; pass++) {
        const at = new Pango.AttrList();
        if (features) at.insert(Pango.attr_font_features_new(features));
        at.insert(Pango.attr_letter_spacing_new(Math.round(ls * Pango.SCALE)));
        L.set_attributes(at); PangoCairo.update_layout(cr, L);
        const w = L.get_extents()[1].width / Pango.SCALE, n = L.get_text().length;
        ls += (target - w) / n;
    }
}

// A symbolic icon from Buoy's set, Gravity UI (design/icons, 2026-11-11; the SVGs in
// icons/render/gravity-ui/, Buoy's own in its style in icons/render/own/), in one colour: rendered
// to a mask at 3×, then filled.
const ICONS = GLib.build_filenamev([GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]), '..', 'icons', 'render']);
// Gravity UI's, then the ones Buoy draws in its style where Gravity has none (own/)
const iconPath = name => ['gravity-ui', 'own'].map(d => `${ICONS}/${d}/${name}.svg`).find(p => GLib.file_test(p, GLib.FileTest.EXISTS));
export function icon(cr, name, x, y, s = 16, rgb = [1, 1, 1], a = 1) {
    const m = new cairo.ImageSurface(cairo.Format.ARGB32, s * SCALE, s * SCALE);
    const v = new Rsvg.Rectangle(); v.x = 0; v.y = 0; v.width = s * SCALE; v.height = s * SCALE;
    Rsvg.Handle.new_from_file(iconPath(name)).render_document(new cairo.Context(m), v);
    cr.save(); cr.newPath(); cr.scale(1 / SCALE, 1 / SCALE); cr.setSourceRGBA(...rgb, a);
    cr.maskSurface(m, x * SCALE, y * SCALE); cr.restore();
}

// Buoy's own colour icon (src/…/icons/color: daypart, weather), drawn as the vector it is
const COLOUR = GLib.build_filenamev([GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]),
    '..', '..', '..', 'src', 'buoy@murilegus', 'icons', 'color']);
export function colourIcon(cr, name, x, y, s = 24) {
    const v = new Rsvg.Rectangle(); v.x = x; v.y = y; v.width = s; v.height = s;
    Rsvg.Handle.new_from_file(`${COLOUR}/${name}.svg`).render_document(cr, v);
}

// A task's state in Claude Code's rows (design/compact, 2026-11-11): done `check`, doing
// `play-fill`, to do `circle-dashed` dimmed (fg-subtle), white, s at (x, y).
const TASK = {done: ['check', 1], doing: ['play-fill', 1], todo: ['circle-dashed', .5]};
export function taskState(cr, kind, x, y, s = 16) {
    const [name, a] = TASK[kind] ?? TASK.todo;
    icon(cr, name, x, y, s, [1, 1, 1], a);
}

// Bu from the extension's own grids (kit/model/mascot.js), with the lamps as decided (design/colours,
// 2026-11-11; the code still has the old ones until "Colours by role"). cell = px per grid cell.
export const LAMPS = Object.freeze({idle: '#C8C6BD', done: '#B4E33D', party: '#B4E33D', busy: '#3D9BFF',
    wave: '#FFE14D', think: '#FF7EB6', compact: '#5AD8F5', error: '#8A8880', missed: '#FF9F0A', ask: '#FF453A'});
export function drawBu(cr, pose, x, y, cell, alpha = 1) {
    const {frame} = frameAt(pose, 0, {still: true});
    for (const c of cells(frame, LAMPS[pose] ?? lampColour(pose))) {
        cr.setSourceRGBA(...rgb(c.colour), alpha); cr.rectangle(x + c.x * cell, y + c.y * cell, c.w * cell, cell); cr.fill();
    }
}
