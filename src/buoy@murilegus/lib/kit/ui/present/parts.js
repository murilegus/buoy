import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {livePosition, mediaTimes, sinceText, untilText} from '../../model/presentation.js';

// The pieces every tier and a module's tab build from: labels, meters, the timed labels,
// tick(), the boxes that fill Home's body. Split out of present.js (2026-11-12).

/**
 * A one-line label, ellipsized at its end.
 *
 * @param {string} text
 * @param {string} styleClass
 * @param {boolean} [xExpand]
 * @returns {St.Label}
 */
export function label(text, styleClass, xExpand = false) {
    const l = new St.Label({text, style_class: styleClass, x_expand: xExpand, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

/**
 * A path or a URI as a file.
 *
 * @param {string} src
 * @returns {Gio.File}
 */
export function file(src) {
    return /^[a-z][a-z0-9+.-]*:/i.test(src) ? Gio.File.new_for_uri(src) : Gio.File.new_for_path(src);
}

/**
 * One drawing area for both: a ring (value as an arc) or a rounded bar.
 *
 * @param {'ring'|'bar'} kind
 * @param {number} value  0–1
 * @param {number} size  px; a bar's 0 fills the width
 * @returns {St.DrawingArea} setValue(v) moves it
 */
export function meter(kind, value, size) {
    const area = new St.DrawingArea({
        style_class: `buoy-${kind}`,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: kind === 'bar' && !size,
    });
    if (kind === 'ring')
        area.set_size(size, size);
    else
        area.set_size(size || -1, 4);
    area.setValue = v => {
        value = v;
        area.queue_repaint();
    };
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const c = area.get_theme_node().get_foreground_color();
        // the theme's alpha too: a muted level is drawn at 40 % (.buoy-level-off)
        const rgba = a => cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, a * c.alpha / 255);
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

/** Set on the actor whose content height an empty state fills (Home's body view). */
export const FILL = Symbol('buoy-fill');

/**
 * @param {Clutter.Actor} actor
 * @returns {?{fill: number, top: number, bottom: number, left: number, right: number}}
 *   the body's content height (`view[FILL]`) and what the boxes between take on each side
 *   (padding and border); null outside Home
 */
export function bodyFill(actor) {
    const inset = {top: 0, bottom: 0, left: 0, right: 0};
    for (let p = actor.get_parent(); p; p = p.get_parent()) {
        if (p[FILL] > 0)
            return {fill: p[FILL], ...inset};
        if (p instanceof St.Widget) {
            const node = p.get_theme_node();
            for (const [side, key] of [[St.Side.TOP, 'top'], [St.Side.BOTTOM, 'bottom'],
                [St.Side.LEFT, 'left'], [St.Side.RIGHT, 'right']])
                inset[key] += node.get_padding(side) + node.get_border_width(side);
        }
    }
    return null;
}

/**
 * A box exactly as tall as the body allows: a tab that uses the panel's full expanded
 * height whatever its content, which scrolls inside it (the Calendar tab, 2026-11-08,
 * Ethan). Its own padding counts in its height, as St's. Outside Home, its natural height.
 */
export const FillBox = GObject.registerClass(
class FillBox extends St.BoxLayout {
    vfunc_get_preferred_height(forWidth) {
        const [min, nat] = super.vfunc_get_preferred_height(forWidth);
        const body = bodyFill(this);
        if (!body)
            return [min, nat];
        const h = Math.max(0, body.fill - body.top - body.bottom);
        return [Math.min(min, h), h];
    }
});

/**
 * The kit's thin bar (the compact's), filling the width it is given; for a module's
 * tab.js (Transfers rows). setValue(v) moves it.
 *
 * @param {number} value  0–1
 * @returns {St.DrawingArea}
 */
export function progressBar(value) {
    return meter('bar', value, 0);
}

/**
 * Once a second while `actor` is on screen and `running()` says so; never otherwise
 * (ARCHITECTURE rule 8: a live position runs only while its activity is visible). The
 * timer goes with the actor. Also for a module's tab.js (the Media tab's position).
 *
 * @param {Clutter.Actor} actor
 * @param {function():void} update  called now, on (un)map, then each second
 * @param {function():boolean} [running]  keep ticking
 * @param {number} [every]  seconds between two updates
 */
export function tick(actor, update, running = () => true, every = 1) {
    let id = 0;
    const stop = () => {
        if (id)
            GLib.source_remove(id);
        id = 0;
    };
    const sync = () => {
        if (actor.mapped && running()) {
            if (!id) {
                id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, every, () => {
                    update();
                    if (running())
                        return GLib.SOURCE_CONTINUE;
                    id = 0;
                    return GLib.SOURCE_REMOVE;
                });
            }
        } else {
            stop();
        }
    };
    actor.connect('notify::mapped', () => {
        update();
        sync();
    });
    actor.connect('destroy', stop);
    update();
}

// A level (hud, SPEC §2e): the bar, its number after it in even figures, dimmed when off
// (muted). Alone in a minimal pill (no text) the bar is the content: LONG_BAR.
export const LONG_BAR = 120;

/**
 * A level's bar, with its number after it when it has one.
 *
 * @param {object} e  a `bar` element
 * @param {number} width
 * @returns {Clutter.Actor}
 */
export function levelBar(e, width) {
    const bar = meter('bar', e.value, width);
    if (!e.label && !e.off)
        return bar;
    // off is set before the bar is styled: its repaint reads the colour once
    const box = new St.BoxLayout({
        style_class: e.off ? 'buoy-level buoy-level-off' : 'buoy-level', y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(bar);
    if (e.label)
        box.add_child(label(e.label, 'buoy-level-label'));
    return box;
}

/**
 * A live position (media): the bar, then elapsed and remaining under it.
 *
 * @param {object} live  {position, length, playing, at}
 * @returns {St.BoxLayout}
 */
export function liveBar(live) {
    const box = new St.BoxLayout({style_class: 'buoy-live', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    const bar = meter('bar', 0, 0);
    const times = new St.BoxLayout({style_class: 'buoy-live-times', x_expand: true});
    const elapsed = label('', 'buoy-live-time');
    const left = label('', 'buoy-live-time');
    times.add_child(elapsed);
    times.add_child(new St.Widget({x_expand: true}));
    times.add_child(left);
    box.add_child(bar);
    box.add_child(times);
    tick(box, () => {
        const pos = livePosition(live, Date.now());
        bar.setValue(pos / live.length);
        [elapsed.text, left.text] = mediaTimes(pos, live.length);
    }, () => live.playing && livePosition(live, Date.now()) < live.length);
    return box;
}

/**
 * A countdown to `at` (a Spotify ad's end), once a second while shown.
 *
 * @param {number} at  ms since the epoch
 * @returns {St.Label}
 */
export function untilLabel(at) {
    const l = label('', 'buoy-label');
    tick(l, () => {
        l.text = untilText(at, Date.now());
    }, () => Date.now() < at);
    return l;
}

/**
 * The time since `at` (an agent's run, CODING-AGENTS.md §2): its text changes once a
 * minute, so it is read every 20 s while shown, never off screen.
 *
 * @param {number} at  ms since the epoch
 * @returns {St.Label}
 */
export function sinceLabel(at) {
    const l = label('', 'buoy-label');
    tick(l, () => {
        l.text = sinceText(at, Date.now());
    }, () => true, 20);
    return l;
}

/**
 * Adds the actors given, skipping the nulls.
 *
 * @param {St.BoxLayout} box
 * @param {Array<?Clutter.Actor>} actors
 */
export function addAll(box, actors) {
    for (const actor of actors) {
        if (actor)
            box.add_child(actor);
    }
}
