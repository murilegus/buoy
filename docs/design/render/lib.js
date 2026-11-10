// Shared by the render scripts: everything is drawn straight at 3× (sharp when zoomed), but text
// laid out at 3× is a little wider than the same text hinted at 1× (85 px at 1× is ≈ 87.75 px at 3×
// for the clock). fit() spreads the difference over the glyphs with letter-spacing so a label keeps
// the width a scale-1 screen gives it — what the boxes in the drawings are measured against.
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import cairo from 'cairo';

export const SCALE = 3;

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
