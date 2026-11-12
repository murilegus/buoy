import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {planIdle, planMinimal} from '../../model/presentation.js';
import {addAll, label} from './parts.js';
import {dimStale} from './motion.js';
import {actionButton, badge, lightDot, makeElement} from './elements.js';

// The minimal tier: the pill in the bar, and the idle pill. Split out of present.js
// (2026-11-12).

// The pill's sizes at 1em (design/pill); the island passes the em's (kit/model/shapes.js).
const METRICS = {cell: 24, gap: 6, buttonGap: 8};

// The leading in its cell (design/pill): a cover or a colour icon fills it, Bu (20, his
// grid) and a symbolic icon (16) sit in its middle, so the gaps are the cell's.
function leadingCell(e, activity, cell) {
    const el = makeElement(e, 'minimal', activity, {art: cell});
    if (!el)
        return null;
    return new St.Bin({
        style_class: 'buoy-leading', width: cell, height: cell, child: el,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
    });
}

// One line in the pill: minimal.
function pillBox(p, activity, maxWidth, buttons, {cell, gap, buttonGap} = METRICS, side = false) {
    if (!p.leading && !p.text && !p.trailing && !buttons.length && !p.badge)
        return null;
    const box = new St.BoxLayout({style_class: 'buoy-minimal', y_align: Clutter.ActorAlign.CENTER});
    // the gaps scale with the em, so they are the island's numbers, not the stylesheet's; a
    // side pill fills its fixed width: the leading at the left edge, the trailing (and +N
    // after it) at the right (design/pill "Pill phụ", B, 2026-11-12)
    const width = maxWidth > 0 ? ` ${side ? 'width' : 'max-width'}: ${maxWidth}px;` : '';
    box.set_style(`spacing: ${gap}px;${width}`);
    const actions = buttons.map(a => actionButton(a, activity));
    actions[0]?.set_style(`margin-left: ${buttonGap - gap}px;`);  // trailing → button: 8
    addAll(box, [
        lightDot(p.light),           // edge slot first: the zones nudge inward (SPEC §2a)
        leadingCell(p.leading, activity, cell),
        side ? new St.Widget({x_expand: true}) : null,
        p.text ? label(p.text, 'buoy-text', true) : null,
        makeElement(p.trailing?.type === 'bar' && !p.text ? {...p.trailing, long: true} : p.trailing, 'minimal'),
        ...actions,
        p.badge ? badge(p.badge) : null, // +N on the last pill (SPEC §2c)
    ]);
    if (p.stale)
        dimStale(box);
    return box;
}

/**
 * @param {object} activity  presentation data (+ onAction)
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]  content width cap; the text ellipsizes to fit
 * @param {string} [opts.light]  the stack's buoy light
 * @param {number} [opts.more]  activities beyond the shown pills → +N badge
 * @param {boolean} [opts.side]  a side pill (idle-wide): leading and trailing only
 * @param {{cell: number, gap: number, buttonGap: number}} [opts.metrics]  the pill's at the em
 * @returns {?Clutter.Actor} null when there is nothing to show
 */
export function buildMinimal(activity, {maxWidth = 0, light, more, side = false, metrics = METRICS} = {}) {
    const p = planMinimal(activity, {light, more, side});
    // a side pill has no room for a button: its compact carries them
    return pillBox(p, activity, maxWidth, p.action && !side ? [p.action] : [], metrics, side);
}

/**
 * The idle pill (SPEC §2a). `none`: empty, with the buoy light at its leading edge. An
 * idle plan (clock…): its zones centred in the pill, the light (amber/red only) at the
 * edge as in minimal.
 *
 * @param {object} opts
 * @param {number} opts.width  inner width of the idle pill: the least it takes
 * @param {number} [opts.maxWidth]  the most a plan's content may take (the minimal cap)
 * @param {string} [opts.light]
 * @param {?object} [opts.plan]  the idle plan's presentation data
 * @param {{cell: number, gap: number}} [opts.metrics]  the pill's at the em
 * @returns {Clutter.Actor}
 */
export function buildIdle({width, maxWidth = 0, light, plan = null, metrics = METRICS}) {
    const p = planIdle({light, plan});
    // at least the idle size; a plan with more to say (the next event's title) grows the
    // pill up to the minimal cap, where its text ellipsizes and its trailing stays
    // (2026-11-08)
    const box = new St.BoxLayout({style_class: 'buoy-idle', min_width: width, y_align: Clutter.ActorAlign.CENTER});
    if (maxWidth > width)
        box.set_style(`max-width: ${maxWidth}px;`);
    if (!plan) {
        addAll(box, [lightDot(p.light)]);
        return box;
    }
    const zones = new St.BoxLayout({
        style_class: 'buoy-idle-zones', x_expand: true,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
    });
    zones.set_style(`spacing: ${metrics.gap}px;`);
    addAll(zones, [
        leadingCell(p.leading, null, metrics.cell),
        p.text ? label(p.text, 'buoy-text buoy-idle-text') : null,
        makeElement(p.trailing, 'minimal'),
    ]);
    addAll(box, [lightDot(p.light), zones]);
    // an icon alone says nothing to a screen reader: name the part of the day, or what
    // the plan names itself (weather: "Ho Chi Minh, 31°, Clear")
    if (typeof plan.accessibleName === 'string' && plan.accessibleName)
        box.accessible_name = plan.accessibleName;
    else if (typeof plan.daypart === 'string')
        box.accessible_name = p.text ? `${plan.daypart}, ${p.text}` : plan.daypart;
    return box;
}
