import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {planCompact, planExpanded, planIdle, planPeek} from './presentation.js';

/**
 * Render plan → St actors. The ONLY place content actors are made; the plan itself
 * (what to show, limits, fallbacks) comes from presentation.js, which is unit-tested.
 * Sizes here are the renderer's (APPLE.md B5.3: leading ≤ 20 px compact, 56 expanded);
 * adapters never send any.
 */

const SIZE = {
    compact: {icon: 16, art: 20, ring: 18, bar: 40},
    expanded: {icon: 32, art: 56, ring: 32, bar: 0}, // bar: 0 = fill the width
};

function label(text, styleClass, xExpand = false) {
    const l = new St.Label({text, style_class: styleClass, x_expand: xExpand, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

function file(src) {
    return /^[a-z][a-z0-9+.-]*:/i.test(src) ? Gio.File.new_for_uri(src) : Gio.File.new_for_path(src);
}

// One drawing area for both: a ring (value as an arc) or a rounded bar.
function meter(kind, value, size) {
    const area = new St.DrawingArea({
        style_class: `buoy-${kind}`,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: kind === 'bar' && !size,
    });
    if (kind === 'ring')
        area.set_size(size, size);
    else
        area.set_size(size || -1, 4);
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const c = area.get_theme_node().get_foreground_color();
        const rgba = a => cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, a);
        if (kind === 'ring') {
            const lw = Math.max(2, w / 8), r = (Math.min(w, h) - lw) / 2;
            cr.setLineWidth(lw);
            rgba(0.25);
            cr.arc(w / 2, h / 2, r, 0, 2 * Math.PI);
            cr.stroke();
            if (value > 0) {
                rgba(1);
                cr.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + value * 2 * Math.PI);
                cr.stroke();
            }
        } else {
            const pill = (x, width) => {
                const rr = h / 2;
                cr.arc(x + rr, rr, rr, Math.PI / 2, 3 * Math.PI / 2);
                cr.arc(x + Math.max(width - rr, rr), rr, rr, -Math.PI / 2, Math.PI / 2);
                cr.closePath();
                cr.fill();
            };
            rgba(0.25);
            pill(0, w);
            if (value > 0) {
                rgba(1);
                pill(0, Math.max(h, w * value));
            }
        }
        cr.$dispose();
    });
    return area;
}

function eqGlyph() {
    const box = new St.BoxLayout({style_class: 'buoy-eq', y_align: Clutter.ActorAlign.CENTER});
    for (const h of [6, 10, 8]) // static: nothing animates (SPEC §8)
        box.add_child(new St.Widget({style_class: 'buoy-eq-bar', height: h, y_align: Clutter.ActorAlign.END}));
    return box;
}

function makeElement(e, mode) {
    if (!e)
        return null;
    const size = SIZE[mode];
    switch (e.type) {
    case 'icon':
        return new St.Icon({
            style_class: 'buoy-icon', icon_size: size.icon,
            ...e.gicon ? {gicon: e.gicon} : {icon_name: e.icon},
        });
    case 'art':
        return new St.Icon({
            style_class: 'buoy-art', icon_size: size.art,
            gicon: new Gio.FileIcon({file: file(e.src)}),
            fallback_icon_name: e.fallback ?? 'audio-x-generic-symbolic',
        });
    case 'glyph':
        return eqGlyph();
    case 'ring':
        return meter('ring', e.value, size.ring);
    case 'bar':
        return meter('bar', e.value, size.bar);
    case 'text':
        return label(e.text, 'buoy-label');
    }
    return null;
}

function actionButton(a, activity) {
    const button = new St.Button({
        style_class: 'buoy-action', can_focus: true,
        accessible_name: a.label ?? a.id,
        ...a.label ? {label: a.label} : {child: new St.Icon({icon_name: a.icon, icon_size: 16})},
    });
    button.connect('clicked', () => activity.onAction?.(a.id));
    return button;
}

function addAll(box, actors) {
    for (const actor of actors) {
        if (actor)
            box.add_child(actor);
    }
}

// The buoy light (INDICATORS.md): the pill's left edge slot. Static, never blinks.
function lightDot(light) {
    return light ? new St.Widget({
        style_class: `buoy-light buoy-light-${light}`,
        y_align: Clutter.ActorAlign.CENTER,
    }) : null;
}

function compactBox(p, activity, maxWidth, buttons) {
    if (!p.leading && !p.text && !p.trailing && !buttons.length && !p.badge)
        return null;
    const box = new St.BoxLayout({style_class: 'buoy-compact', y_align: Clutter.ActorAlign.CENTER});
    if (maxWidth > 0)
        box.set_style(`max-width: ${maxWidth}px;`);
    addAll(box, [
        lightDot(p.light),           // edge slot first: the zones nudge inward (SPEC §2a)
        makeElement(p.leading, 'compact'),
        p.text ? label(p.text, 'buoy-text', true) : null,
        makeElement(p.trailing, 'compact'),
        ...buttons.map(a => actionButton(a, activity)),
        p.badge ? label(p.badge, 'buoy-badge') : null, // +N on the last pill (SPEC §2c)
    ]);
    if (p.stale)
        box.add_style_class_name('buoy-stale');
    return box;
}

/**
 * @param {object} activity  presentation data (+ onAction)
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]  content width cap; the text ellipsizes to fit
 * @param {string} [opts.light]  the stack's buoy light
 * @param {number} [opts.more]  activities beyond the shown pills → +N badge
 * @returns {?Clutter.Actor} null when there is nothing to show
 */
export function buildCompact(activity, {maxWidth = 0, light, more} = {}) {
    const p = planCompact(activity, {light, more});
    return compactBox(p, activity, maxWidth, p.action ? [p.action] : []);
}

/**
 * Hover peek: the activity's `peek` zones (+ transport buttons) in place of compact.
 *
 * @param {object} activity  presentation data (+ onAction)
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]
 * @param {string} [opts.light]
 * @returns {?Clutter.Actor} null when the activity has no peek
 */
export function buildPeek(activity, {maxWidth = 0, light} = {}) {
    const p = planPeek(activity, {light});
    return p ? compactBox(p, activity, maxWidth, p.actions) : null;
}

/**
 * idle-content `none` (SPEC §2a): an empty pill with the buoy light at its leading edge.
 *
 * @param {object} opts
 * @param {number} opts.width  inner width of the idle pill
 * @param {string} [opts.light]
 * @returns {Clutter.Actor}
 */
export function buildIdle({width, light}) {
    const box = new St.BoxLayout({style_class: 'buoy-idle', width, y_align: Clutter.ActorAlign.CENTER});
    addAll(box, [lightDot(planIdle({light}).light)]);
    return box;
}

function makeRegion(r) {
    if (r?.type !== 'block')
        return makeElement(r, 'expanded');
    const box = new St.BoxLayout({
        style_class: 'buoy-block', orientation: Clutter.Orientation.VERTICAL,
        y_align: Clutter.ActorAlign.CENTER,
    });
    addAll(box, [
        r.title ? label(r.title, 'buoy-title') : null,
        r.subtitle ? label(r.subtitle, 'buoy-subtitle') : null,
        r.bar !== null ? meter('bar', r.bar, 0) : null,
    ]);
    return box;
}

/**
 * @param {object} activity  presentation data (+ onAction)
 * @returns {?Clutter.Actor} null when the activity has no expanded presentation
 */
export function buildExpanded(activity) {
    const p = planExpanded(activity);
    if (!p)
        return null;
    const box = new St.BoxLayout({
        style_class: 'buoy-expanded', orientation: Clutter.Orientation.VERTICAL,
        x_expand: true, // St.Bin centres a child at its natural width otherwise
    });
    const top = new St.BoxLayout({style_class: 'buoy-expanded-top', x_expand: true});
    for (const name of ['leading', 'center', 'trailing']) {
        const actor = makeRegion(p[name]);
        if (actor) {
            actor.x_expand = p.grow === name;
            top.add_child(actor);
        }
    }
    if (top.get_n_children())
        box.add_child(top);
    if (p.bottom) {
        const row = new St.BoxLayout({style_class: 'buoy-actions', x_align: Clutter.ActorAlign.CENTER});
        addAll(row, p.actions.map(a => actionButton(a, activity)));
        box.add_child(row);
    }
    if (p.stale)
        box.add_style_class_name('buoy-stale');
    return box;
}
