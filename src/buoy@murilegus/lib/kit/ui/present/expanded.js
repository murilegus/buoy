import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {planExpanded} from '../../model/presentation.js';
import {addAll, label, meter} from './parts.js';
import {dimStale, typeIn} from './motion.js';
import {actionButton, makeElement} from './elements.js';

// The expanded tier. Split out of present.js (2026-11-12).

function makeRegion(r, activity) {
    if (r?.type !== 'block')
        return makeElement(r, 'expanded', activity);
    const box = new St.BoxLayout({
        style_class: 'buoy-block', orientation: Clutter.Orientation.VERTICAL,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const texts = [
        r.title ? label(r.title, r.hero ? 'buoy-title buoy-title-hero' : 'buoy-title') : null,
        r.subtitle ? label(r.subtitle, 'buoy-subtitle') : null,
        ...(r.lines ?? []).map(l => label(l, 'buoy-subtitle buoy-line')),
    ];
    addAll(box, [...texts, r.bar !== null ? meter('bar', r.bar, 0) : null]);
    if (r.typed)
        typeIn(texts.filter(Boolean), activity);
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
        const actor = makeRegion(p[name], activity);
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
        dimStale(box);
    return box;
}
