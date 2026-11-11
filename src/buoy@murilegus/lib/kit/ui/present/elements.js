import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {ART_CODE, ART_DECLARATIONS, artRadius, effectBox} from '../../model/rounded.js';
import {element} from '../../model/presentation.js';
import {LONG_BAR, bodyFill, file, label, levelBar, meter, sinceLabel, untilLabel} from './parts.js';
import {eqGlyph, mascot} from './motion.js';

/**
 * Render plan → St actors. The ONLY place content actors are made; the plan itself
 * (what to show, limits, fallbacks) comes from presentation.js, which is unit-tested.
 * Sizes here are the renderer's (CONTRACT.md §5.3: leading ≤ 20 px minimal, 40 compact,
 * 56 expanded);
 * adapters never send any.
 */

export const SIZE = {
    // mascot: a multiple of Bu's 10 cells, so each cell is whole px (MASCOT.md)
    minimal: {icon: 16, art: 20, ring: 18, bar: 40, mascot: 20},
    compact: {icon: 24, art: 40, ring: 32, bar: 0, mascot: 40},  // SPEC §4, 2026-11-05
    expanded: {icon: 32, art: 56, ring: 32, bar: 0, mascot: 50}, // bar: 0 = fill the width
};

// Album art's corners, inside the pill's (kit/model/rounded.js artRadius): the pill's radius
// (minimal 16, compact 24; shapes.js) less the content padding (14, pill.js PAD); minimal
// at least 6. Expanded and tabs stay square.
const ART_INSET = 14;
const ART_RADIUS = {
    minimal: artRadius(16, ART_INSET, SIZE.minimal.art, 6),     // 6
    compact: artRadius(24, ART_INSET, SIZE.compact.art),        // 10
};

// One Shell.GLSLEffect per art (the ui/lightbox.js RadialShaderEffect pattern, as corners.js):
// St.Icon keeps loading the cover asynchronously; the shader rounds what it draws.
const ArtCorners = GObject.registerClass(
class ArtCorners extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, ART_DECLARATIONS, ART_CODE, false);
    }

    /**
     * @param {number} size  the art's side, logical px (its allocation: icon_size)
     * @param {number} r  radius
     * @param {number} scale  device px per logical px
     */
    setShape(size, r, scale) {
        this._loc ??= {box: this.get_uniform_location('buoy_box'), art: this.get_uniform_location('buoy_art')};
        const box = effectBox(size, size);    // the texture is the padded paint box
        this.set_uniform_float(this._loc.box, 4, [box.x, box.y, box.width, box.height]);
        this.set_uniform_float(this._loc.art, 4, [size, size, r, 1 / Math.max(scale, 1)]);
        this.queue_repaint();
    }
});

function roundArt(icon, size, r) {
    const effect = new ArtCorners();
    const sync = () => effect.setShape(size, r, icon.get_resource_scale());
    icon.add_effect_with_name('buoy-art-corners', effect);
    icon.connect('resource-scale-changed', sync);
    sync();
    return icon;
}

/**
 * A tab or list with nothing in it (2026-11-06, Ethan): one colour everywhere, Bu over
 * the text in a pose that fits (2026-11-07), centred both ways, and as tall as the body allows — the panel opens at its full
 * expanded height instead of a thin strip. Its natural height is the content height Home
 * sets on its body view (`view[FILL]`), less the padding and borders of the actors in
 * between, so it fits exactly and never scrolls. Outside Home (no FILL above) it is as
 * tall as its text.
 */
export const EmptyState = GObject.registerClass(
class EmptyState extends St.Bin {
    /**
     * @param {string} text
     * @param {object} [opts]
     * @param {?string} [opts.pose]  Bu over the text in this pose (MASCOT.md, empty
     *   states; 2026-11-07, Ethan: every empty tab has Bu)
     * @param {?Clutter.Actor} [opts.above]  any other actor over the text
     * @param {?Clutter.Actor} [opts.below]  an actor under the text (a button that helps:
     *   the Calendar tab's "Add an Online Account", 2026-11-08)
     */
    _init(text, {pose = null, above = null, below = null} = {}) {
        if (pose && !above)
            above = buildElement({mascot: pose}, {size: 'compact', leading: true});
        const words = new St.Label({text, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        let child = words;
        if (above || below) {
            // the stack spans the width: Bu centres on the same width in every tab, not on
            // a stack as wide as its words (which rounded him a pixel apart, 2026-11-08)
            child = new St.BoxLayout({
                style_class: 'buoy-empty-stack', orientation: Clutter.Orientation.VERTICAL,
                x_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.CENTER,
            });
            for (const a of [above, words, below].filter(Boolean)) {
                a.x_align = Clutter.ActorAlign.CENTER;
                child.add_child(a);
            }
        }
        super._init({style_class: 'buoy-empty', x_expand: true, y_expand: true, child});
    }

    // The panel's height less what the tab's boxes take (their padding and border), so it
    // fills the body. Those boxes pad unevenly (Transfers 0 / 4, Media 4 / 6, Home 0 / 0),
    // which would set Bu and the words a pixel or two apart from tab to tab: the content
    // moves back by half the difference, both ways, so its centre is the body's in every
    // tab (2026-11-08, Ethan). A translation: it moves nothing else.
    vfunc_get_preferred_height(forWidth) {
        const [min, nat] = super.vfunc_get_preferred_height(forWidth);
        const body = bodyFill(this);
        if (!body)
            return [min, nat];
        const child = this.get_child();
        if (child) {
            child.translation_y = Math.round((body.bottom - body.top) / 2);
            child.translation_x = Math.round((body.right - body.left) / 2);
        }
        return [min, Math.max(nat, body.fill - body.top - body.bottom)];
    }
});

/**
 * An icon by theme name, or by absolute path to an image another app installed (Claude
 * Desktop's tray glyph, the Claude Code tab, 2026-11-07); a missing file shows the
 * generic icon instead.
 *
 * @param {string} icon
 * @returns {object} St.Icon properties
 */
export function iconProps(icon) {
    if (typeof icon === 'string' && icon.startsWith('/')) {
        return {
            gicon: new Gio.FileIcon({file: Gio.File.new_for_path(icon)}),
            fallback_icon_name: 'view-app-grid-symbolic',
        };
    }
    return {icon_name: icon, fallback_icon_name: 'view-app-grid-symbolic'};
}

/**
 * One element of presentation data as an actor, for a module's tab.js (the Claude Code
 * tab draws Bu and the live elapsed time, 2026-11-07).
 *
 * @param {*} value  an adapter's leading / trailing value
 * @param {object} [opts]
 * @param {'minimal'|'compact'|'expanded'} [opts.size]  the tier whose sizes it takes
 * @param {boolean} [opts.leading]  the leading zone: Bu may be drawn
 * @param {?object} [opts.activity]  its activity (Bu's animation follows it)
 * @param {boolean} [opts.stale]  the activity is stale: Bu takes `stale`
 * @returns {?Clutter.Actor}
 */
export function buildElement(value, {size = 'minimal', leading = false, activity = null, stale = false} = {}) {
    const e = element(value, {leading});
    // a stale activity's Bu is `stale`, as on its pill (presentation.js leadingAndLight)
    return makeElement(stale && e?.type === 'mascot' ? {...e, pose: 'stale'} : e, size, activity);
}

/**
 * One element of a render plan as an actor, at a tier's sizes.
 *
 * @param {?object} e  presentation.js element()
 * @param {'minimal'|'compact'|'expanded'} mode
 * @param {?object} [activity]  Bu's animation follows it
 * @returns {?Clutter.Actor}
 */
export function makeElement(e, mode, activity = null) {
    if (!e)
        return null;
    const size = SIZE[mode];
    switch (e.type) {
    case 'mascot':
        return mascot(e, size.mascot, activity);
    case 'icon':
        return new St.Icon({
            style_class: 'buoy-icon', icon_size: size.icon,
            ...e.gicon ? {gicon: e.gicon} : iconProps(e.icon),
        });
    case 'art': {
        const icon = new St.Icon({
            style_class: 'buoy-art', icon_size: size.art,
            gicon: e.gicon ?? new Gio.FileIcon({file: file(e.src)}),
            fallback_icon_name: e.fallback ?? 'audio-x-generic-symbolic',
        });
        return ART_RADIUS[mode] ? roundArt(icon, size.art, ART_RADIUS[mode]) : icon;
    }
    case 'glyph':
        return eqGlyph({paused: e.name === 'eq-paused'});
    case 'ring':
        return meter('ring', e.value, size.ring);
    case 'bar':
        return levelBar(e, e.long ? LONG_BAR : size.bar);
    case 'text':
        return label(e.text, 'buoy-label');
    case 'until':
        return untilLabel(e.at);
    case 'since':
        return sinceLabel(e.at);
    }
    return null;
}

/**
 * An action's button; pressed, the activity's onAction(id).
 *
 * @param {object} a  {id, label?, icon?, key?}
 * @param {object} activity
 * @returns {St.Button}
 */
export function actionButton(a, activity) {
    const face = a.label ? {label: a.label} : {child: new St.Icon({icon_name: a.icon, icon_size: 16})};
    const button = new St.Button({
        style_class: 'buoy-action', can_focus: true,
        accessible_name: a.label ?? a.id,
        ...a.key ? {child: keyedFace(face, a.key)} : face,
    });
    button.connect('clicked', () => activity.onAction?.(a.id));
    return button;
}

// An ask's button: its key after the label, shown only while the island holds the
// keyboard (showKeys); hidden, it takes no room.
function keyedFace(face, key) {
    const box = new St.BoxLayout({style_class: 'buoy-action-face'});
    box.add_child(face.child ?? new St.Label({text: face.label, y_align: Clutter.ActorAlign.CENTER}));
    box.add_child(new St.Label({
        style_class: 'buoy-key', text: key.toUpperCase(), visible: false,
        y_align: Clutter.ActorAlign.CENTER,
    }));
    return box;
}

/**
 * Show or hide the keys printed on an ask's buttons (kit/model/keys.js).
 *
 * @param {?Clutter.Actor} actor  content built here
 * @param {boolean} shown
 */
export function showKeys(actor, shown) {
    if (!actor)
        return;
    if (actor.has_style_class_name?.('buoy-key'))
        actor.visible = shown;
    for (const child of actor.get_children())
        showKeys(child, shown);
}

/**
 * +N: reactive so a click on it is told apart from one on the pill (it opens Home)
 *
 * @param {string} text
 * @returns {St.Label}
 */
export function badge(text) {
    const l = label(text, 'buoy-badge');
    l.reactive = true;
    return l;
}

/**
 * The buoy light (INDICATORS.md): the pill's left edge slot. Static, never blinks.
 *
 * @param {?string} light  'missed', 'waiting', 'off' or none
 * @returns {?St.Widget}
 */
export function lightDot(light) {
    return light ? new St.Widget({
        style_class: `buoy-light buoy-light-${light}`,
        y_align: Clutter.ActorAlign.CENTER,
    }) : null;
}
