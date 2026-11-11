import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {agoText, planCompact} from '../../model/presentation.js';
import {addAll, label, liveBar, meter, tick} from './parts.js';
import {dimStale, marquee} from './motion.js';
import {SIZE, actionButton, lightDot, makeElement} from './elements.js';

// The compact tier, the hover: the compact, the card, the amber light's. Split out of
// present.js (2026-11-12).

// The compact (SPEC §2, §4): the grown pill. A top row — light, leading 40, title over
// subtitle, trailing, buttons — then a bar or up to 3 rows under the text column.
function compactBox(p, activity, maxWidth) {
    const box = new St.BoxLayout({
        style_class: 'buoy-compact', orientation: Clutter.Orientation.VERTICAL,
        y_align: Clutter.ActorAlign.CENTER,
    });
    if (maxWidth > 0)
        box.set_style(`max-width: ${maxWidth}px;`);
    const top = new St.BoxLayout({style_class: 'buoy-compact-top', x_expand: true});
    const lines = new St.BoxLayout({
        style_class: 'buoy-compact-lines', orientation: Clutter.Orientation.VERTICAL,
        x_expand: true, y_align: Clutter.ActorAlign.CENTER,
    });
    addAll(lines, [
        p.text ? marquee(p.text, 'buoy-text buoy-compact-title') : null,
        p.subtitle ? label(p.subtitle, 'buoy-compact-subtitle') : null,
    ]);
    const buttons = p.actions?.length
        ? new St.BoxLayout({style_class: 'buoy-actions', y_align: Clutter.ActorAlign.CENTER})
        : null;
    if (buttons)
        addAll(buttons, p.actions.map(a => actionButton(a, activity)));
    addAll(top, [
        lightDot(p.light),
        makeElement(p.leading, 'compact', activity),
        lines.get_n_children() ? lines : null,
        makeElement(p.trailing, 'compact'),
        buttons,
    ]);
    box.add_child(top);
    if (p.live)
        box.add_child(indented(liveBar(p.live), p, BAR_MIN));
    else if (p.progress !== null && p.progress !== undefined)
        box.add_child(indented(meter('bar', p.progress, 0), p, BAR_MIN));
    if (p.rows?.length) {
        const list = new St.BoxLayout({style_class: 'buoy-compact-rows', orientation: Clutter.Orientation.VERTICAL});
        for (const r of p.rows) {
            const row = new St.BoxLayout({style_class: 'buoy-compact-row', x_expand: true});
            addAll(row, [
                r.icon ? makeElement(r.icon, 'minimal') : null,
                label(r.text, 'buoy-compact-row-text', true),
                r.detail ? label(r.detail, 'buoy-compact-row-detail') : null,
            ]);
            list.add_child(row);
        }
        box.add_child(indented(list, p));
    }
    if (p.stale)
        dimStale(box);
    return box;
}

// Under the text column: the leading's width plus the top row's spacing
// (.buoy-compact-top in stylesheet.css).
const INDENT_GAP = 12;
// A bar has no width of its own: without this a short title leaves it a sliver (a
// progress compact is content-fit). 160 + a 24 icon and its gap fill the 240 minimum.
const BAR_MIN = 160;

function indented(actor, p, minWidth = 0) {
    const key = {icon: 'icon', glyph: 'icon', ring: 'ring', mascot: 'mascot'}[p.leading?.type] ?? 'art';
    const lead = p.leading ? SIZE.compact[key] + INDENT_GAP : 0;
    actor.x_expand = true;
    const style = [lead ? `margin-left: ${lead}px;` : '', minWidth ? `min-width: ${minWidth}px;` : ''].join(' ').trim();
    if (style)
        actor.set_style(style);
    return actor;
}

/**
 * The hover tier: the activity's `compact` (SPEC §2) in the grown pill.
 *
 * @param {object} activity  presentation data (+ onAction)
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]  content width cap (the compact's widest − padding)
 * @param {string} [opts.light]
 * @returns {?Clutter.Actor} null when the activity has no compact
 */
export function buildCompact(activity, {maxWidth = 0, light} = {}) {
    const p = planCompact(activity, {light});
    if (!p)
        return null;
    return p.card ? cardBox(p, activity, maxWidth) : compactBox(p, activity, maxWidth);
}

// A card (NOTIFICATIONS.md §3, 2026-11-07): GNOME's banner layout in the island's black —
// header (icon 16, app, time, ×), picture 40 beside a title and a body of up to 2 lines,
// then the buttons in a row of equal widths. The compact's full width; pill.js gives it
// up to CARD_MAX_H. A click on it but a button is the pill's click (island.js).
function cardBox(p, activity, maxWidth) {
    const c = p.card;
    const box = new St.BoxLayout({style_class: 'buoy-card', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    if (maxWidth > 0)
        box.set_style(`width: ${maxWidth}px;`);

    const header = new St.BoxLayout({style_class: 'buoy-card-header', x_expand: true});
    addAll(header, [
        lightDot(p.light),
        makeElement(c.header.icon, 'minimal'),
        c.header.text ? label(c.header.text, 'buoy-card-app') : null,
        c.header.at !== null ? agoLabel(c.header.at) : null,
        new St.Widget({x_expand: true}),
        c.close ? closeButton(c.close, activity) : null,
    ]);
    box.add_child(header);

    const lines = new St.BoxLayout({
        style_class: 'buoy-card-lines', orientation: Clutter.Orientation.VERTICAL,
        x_expand: true, y_align: Clutter.ActorAlign.START,
    });
    addAll(lines, [
        c.title ? label(c.title, 'buoy-card-title') : null,
        c.body ? wrapped(c.body, 'buoy-card-body') : null,
    ]);
    const main = new St.BoxLayout({style_class: 'buoy-card-main', x_expand: true});
    addAll(main, [
        c.picture ? makeElement(c.picture, 'compact', activity) : null,
        lines.get_n_children() ? lines : null,
    ]);
    if (main.get_n_children())
        box.add_child(main);

    if (p.actions.length) {
        const row = new St.BoxLayout({style_class: 'buoy-card-actions', x_expand: true});
        row.layout_manager.homogeneous = true;      // equal widths, as GNOME's banner
        for (const a of p.actions) {
            const b = actionButton(a, activity);
            b.x_expand = true;
            row.add_child(b);
        }
        box.add_child(row);
    }
    return box;
}

// Wrapped and ellipsized at its CSS max-height (MAX_CARD_LINES lines): Clutter.Text gives
// Pango the allocated height when it both wraps and ellipsizes (clutter-text.c
// clutter_text_create_layout), so the last line that fits ends in …
function wrapped(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, x_expand: true});
    l.clutter_text.line_wrap = true;
    l.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

// "· now", "· 3 min": re-read while shown, as `since` (NOTIFICATIONS.md §3)
function agoLabel(at) {
    const l = label('', 'buoy-card-time');
    tick(l, () => {
        l.text = `· ${agoText(at, Date.now())}`;
    }, () => true, 20);
    return l;
}

function closeButton(id, activity) {
    const button = new St.Button({
        style_class: 'buoy-card-close', can_focus: true, accessible_name: 'Dismiss',
        child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 12}),
        y_align: Clutter.ActorAlign.CENTER,
    });
    button.connect('clicked', () => activity.onAction?.(id));
    return button;
}

/**
 * The amber light's compact: "Missed · N" on the light, then up to 3 rows.
 *
 * @param {object} plan  presentation.js planMissed()
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]
 * @returns {Clutter.Actor}
 */
export function buildMissedCompact(plan, {maxWidth = 0} = {}) {
    return compactBox({
        light: plan.light, text: plan.title, rows: plan.rows, actions: [], progress: null,
    }, {}, maxWidth);
}
