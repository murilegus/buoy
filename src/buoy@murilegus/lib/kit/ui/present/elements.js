import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {ART_CODE, ART_DECLARATIONS, artRadius, effectBox} from '../../model/rounded.js';
import {element} from '../../model/presentation.js';
import {LONG_BAR, bodyFill, file, label, levelBar, meter, sinceLabel, untilLabel} from './parts.js';
import {eqGlyph, mascot} from './motion.js';

// Buoy's own symbolic icons (design/icons "Icon symbolic"): Gravity UI's, and the ones Buoy
// draws in its style, in icons/symbolic as <theme name>-symbolic.svg. Each takes the name
// GNOME's theme gives the same icon, so a name Buoy has no file for is the theme's, and a
// plan names icons as the theme does (`window-close-symbolic`). St recolours such a file in
// the text colour as it does a theme's symbolic icon (st-icon-theme.c
// st_icon_info_load_symbolic_svg, a GFileIcon whose uri ends in -symbolic.svg).
// lib/kit/ui/present/ → the extension's icons/symbolic
const OWN_DIR = Gio.File.new_for_uri(import.meta.url).get_parent().resolve_relative_path('../../../../icons/symbolic');
let ownNames = null;

/**
 * Buoy's own file for an icon name, with or without `-symbolic`.
 *
 * @param {*} name
 * @returns {?Gio.FileIcon}
 */
export function ownIcon(name) {
    if (typeof name !== 'string' || name.includes('/'))
        return null;
    if (!ownNames) {
        ownNames = new Set();
        try {
            const en = OWN_DIR.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            for (let info; (info = en.next_file(null));) {
                const m = info.get_name().match(/^(.+)-symbolic\.svg$/);
                if (m)
                    ownNames.add(m[1]);
            }
        } catch (e) {
            console.warn(`Buoy: its icons: ${e.message}`);
        }
    }
    const base = name.replace(/-symbolic$/, '');
    return ownNames.has(base) ? new Gio.FileIcon({file: OWN_DIR.get_child(`${base}-symbolic.svg`)}) : null;
}

/**
 * Render plan → St actors. The ONLY place content actors are made; the plan itself
 * (what to show, limits, fallbacks) comes from presentation.js, which is unit-tested.
 * Sizes here are the renderer's (CONTRACT.md §5.3: the leading's 24 px cell in minimal,
 * at 1em, 40 compact, 56 expanded);
 * adapters never send any.
 */

export const SIZE = {
    // mascot: a multiple of Bu's 10 cells, so each cell is whole px (MASCOT.md); art fills
    // the leading's cell, 24 at 1em (design/pill; minimal.js passes the em's)
    minimal: {icon: 16, art: 24, ring: 18, bar: 40, mascot: 20},
    compact: {icon: 24, art: 40, ring: 32, bar: 0, mascot: 40},  // SPEC §4, 2026-11-05
    expanded: {icon: 32, art: 56, ring: 32, bar: 0, mascot: 50}, // bar: 0 = fill the width
};

// Album art's corners, inside the pill's (kit/model/rounded.js artRadius): the pill's radius
// (minimal 16, compact 24; shapes.js) less 14; minimal 6 (design/pill "minimal-media").
// Expanded and tabs stay square.
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
        // `??=` would declare no field for tsc
        this._loc = this._loc ?? {box: this.get_uniform_location('buoy_box'), art: this.get_uniform_location('buoy_art')};
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
        /** @type {St.Widget} */
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
    /**
     * @param {number} forWidth
     * @returns {[number, number]}
     */
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
 * What an St.Icon shows when its own does not load: Buoy's file of that name, else the theme's.
 *
 * @param {string} name  a theme icon name
 * @returns {Gio.Icon} for `fallback_gicon`
 */
export function fallbackIcon(name) {
    return ownIcon(name) ?? new Gio.ThemedIcon({name});
}

/**
 * An icon by theme name, Buoy's own file of that name first; or by absolute path to an
 * image another app installed (Claude Desktop's tray glyph, the Claude Code tab,
 * 2026-11-07). One that does not load shows `fallback` instead, Buoy's own first too.
 *
 * @param {*} icon
 * @param {string} [fallback]  a theme icon name
 * @returns {object} St.Icon properties
 */
export function iconProps(icon, fallback = 'view-app-grid-symbolic') {
    const props = {fallback_gicon: fallbackIcon(fallback)};
    const own = ownIcon(icon);
    if (own)
        return {...props, gicon: own};
    if (typeof icon === 'string' && icon.startsWith('/'))
        return {...props, gicon: new Gio.FileIcon({file: Gio.File.new_for_path(icon)})};
    return {...props, icon_name: icon};
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
 * @returns {?St.Widget}
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
 * @param {{art?: number, artRadius?: number, icon?: number}} [sizes]  the tier's sizes it overrides: the art
 *   fills the leading's cell, which follows the em (kit/model/shapes.js); the compact's media
 *   art is 72 with radius 20
 * @returns {?St.Widget}
 */
export function makeElement(e, mode, activity = null, sizes = {}) {
    if (!e)
        return null;
    const size = {...SIZE[mode], ...sizes};
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
            fallback_gicon: fallbackIcon(e.fallback ?? 'audio-x-generic-symbolic'),
            gicon: e.gicon ?? new Gio.FileIcon({file: file(e.src)}),
        });
        const r = sizes.artRadius ?? ART_RADIUS[mode];
        return r ? roundArt(icon, size.art, r) : icon;
    }
    case 'glyph':
        // a stale activity's glyph is the stylesheet's dimmed `fg`, not its own colour
        return eqGlyph({paused: e.name === 'eq-paused', color: activity?.isStale ? null : e.color});
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
    const face = a.label ? {label: a.label} : {child: new St.Icon({...iconProps(a.icon), icon_size: 16})};
    const button = new St.Button({
        style_class: 'buoy-action', can_focus: true,
        accessible_name: a.label ?? a.id,
        ...a.key ? {child: keyedFace(face, a.key)} : face,
    });
    button.connect('clicked', () => activity.onAction?.(a.id));
    return button;
}

/** A rest slot's fade between its two faces (`state`, as a button's own colours). */
const SLOT_FADE_MS = 120;
/**
 * The slots showing their button, by what they are for: a click on ⏸ pauses, and the compact is
 * built again for ▶ under the same pointer before the old one goes. St only sets the new
 * button's hover with the next crossing event, so it started at rest and faded to the button —
 * a blink between ⏸ and ▶ (2026-11-13, Ethan). One built while its key shows starts shown.
 *
 * @type {Map<string, St.Button>}
 */
const shownSlots = new Map();
/** One that went while shown, for a slot built just after (Home's card empties before it builds). */
let heldShown = null;
const HELD_MS = 250;

/**
 * A button that shows `rest` while left alone, and itself under the pointer or the keyboard's
 * focus, one fading into the other where they stand: the media compact's ⏸ and the Media tab's
 * ↗ with the equaliser at rest (design/compact "Nhạc", design/media "Một player", 2026-11-13,
 * Ethan). The button keeps its own action and name; the stylesheet draws it by
 * `buoy-round-rest` (no fill at rest) and `buoy-round-shown`.
 *
 * @param {St.Button} b
 * @param {Clutter.Actor} rest
 * @param {?string} [key]  what the slot is for (the activity's id and its place): one built
 *   again in the place of a slot that showed its button shows it at once
 * @returns {St.Button} b
 */
export function restSlot(b, rest, key = null) {
    b.add_style_class_name('buoy-round-rest');
    const face = b.get_child();
    b.set_child(null);
    const layer = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true});
    rest.x_align = rest.y_align = Clutter.ActorAlign.CENTER;
    face.x_align = face.y_align = Clutter.ActorAlign.CENTER;
    const held = key !== null && heldShown?.key === key && GLib.get_monotonic_time() / 1000 - heldShown.at < HELD_MS;
    if (held)
        heldShown = null;
    let shown = key !== null && (shownSlots.has(key) || held);
    if (shown) {
        shownSlots.set(key, b);
        b.add_style_class_name('buoy-round-shown');     // before its first style: no transition
    }
    face.opacity = shown ? 255 : 0;
    rest.opacity = shown ? 0 : 255;
    layer.add_child(rest);
    layer.add_child(face);
    b.set_child(layer);
    const sync = () => {
        const now2 = b.hover || b.has_key_focus();
        // carried over from the slot it replaces: kept until the pointer really leaves
        if (now2 === shown)
            return;
        shown = now2;
        if (key !== null && shown)
            shownSlots.set(key, b);
        else if (key !== null && shownSlots.get(key) === b)
            shownSlots.delete(key);
        if (shown)
            b.add_style_class_name('buoy-round-shown');
        else
            b.remove_style_class_name('buoy-round-shown');
        const ms = St.Settings.get().enable_animations ? SLOT_FADE_MS : 0;
        rest.ease({opacity: shown ? 0 : 255, duration: ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        face.ease({opacity: shown ? 255 : 0, duration: ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    };
    b.connect('notify::hover', sync);
    b.connect('key-focus-in', sync);
    b.connect('key-focus-out', sync);
    b.connect('destroy', () => {
        if (key !== null && shownSlots.get(key) === b) {
            shownSlots.delete(key);
            heldShown = {key, at: GLib.get_monotonic_time() / 1000};
        }
    });
    return b;
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
    if (/** @type {Partial<St.Widget>} not all are widgets */ (actor).has_style_class_name?.('buoy-key'))
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
