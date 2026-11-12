import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {agoText, planCompact} from '../../model/presentation.js';
import {compactMetrics} from '../../model/shapes.js';
import {addAll, label, liveBar, meter, tick} from './parts.js';
import {dimStale, marquee} from './motion.js';
import {actionButton, makeElement} from './elements.js';

// The compact tier, the hover: the compact, the card, the amber light's. Split out of
// present.js (2026-11-12); laid out as design/compact (2026-11-12, M4 "Compact layout").
//
// Every compact starts with the same head, 56 at 1em: the leading's cell 40, 8 above and
// below, 14 at the sides, the title (1em) over the subtitle (0.85em), round buttons of 32
// centred on the head's middle. Under it, by rows of 16: a bar, up to three rows, or a
// card's body and buttons. The content carries its own paddings, so the compact is as big
// as its content (kit/model/shapes.js compact: 56 + 16n). No light here: the light is the
// pill's (design/pill). The numbers are compactMetrics(em), set inline like the pill's.

const px = v => `${v}px`;

// The leading's cell: a cover or Bu fills it, an icon sits in its middle.
function cell(e, activity, size) {
    const el = makeElement(e, 'compact', activity, {art: size});
    if (!el)
        return null;
    return new St.Bin({
        style_class: 'buoy-leading', width: size, height: size, child: el,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
    });
}

// A round button of the head: play/pause and stop are its main action, cream with a black
// glyph (fill-inverse), the others fill-2 (design/compact "Nút tròn", design/icons).
const MAIN = new Set(['playpause', 'stop']);

function roundButton(a, activity, m) {
    const b = actionButton(a, activity);
    b.add_style_class_name(MAIN.has(a.id) ? 'buoy-round buoy-round-main' : 'buoy-round');
    b.set_size(m.button, m.button);
    b.y_align = Clutter.ActorAlign.CENTER;
    return b;
}

// The head's buttons: its main action alone when it has one (media: ⏸, design/compact),
// the rest live in the activity's tab
function buttons(list, activity, m) {
    if (!list?.length)
        return null;
    const main = list.filter(a => MAIN.has(a.id));
    const box = new St.BoxLayout({style_class: 'buoy-round-row', y_align: Clutter.ActorAlign.CENTER});
    addAll(box, (main.length ? main : list).map(a => roundButton(a, activity, m)));
    return box;
}

function lines(title, subtitle, titleClass = 'buoy-compact-title') {
    const box = new St.BoxLayout({
        style_class: 'buoy-compact-lines', orientation: Clutter.Orientation.VERTICAL,
        x_expand: true, y_align: Clutter.ActorAlign.CENTER,
    });
    addAll(box, [
        title ? marquee(title, `buoy-text ${titleClass}`) : null,
        subtitle ? label(subtitle, 'buoy-compact-subtitle') : null,
    ]);
    return box.get_n_children() ? box : null;
}

// The head: [leading 40] title / subtitle [trailing] [buttons]
function head(parts, m) {
    const row = new St.BoxLayout({style_class: 'buoy-compact-head', x_expand: true});
    // St's height is the content's, padding outside it: 56 = 8 + 40 + 8
    row.set_style(`spacing: ${px(m.gap)}; padding: ${px(m.vpad)} ${px(m.side)}; height: ${px(m.head - 2 * m.vpad)};`);
    addAll(row, parts);
    return row;
}

// Under the text column (the leading's cell and its gap), as wide as the rest
function underText(actor, m, {leading = true} = {}) {
    actor.x_expand = true;
    actor.set_style(`margin-left: ${px(m.side + (leading ? m.lead + m.gap : 0))}; margin-right: ${px(m.side)};`);
    return actor;
}

// The compact (SPEC §2, §4): the grown pill.
function compactBox(p, activity, maxWidth, m) {
    const box = new St.BoxLayout({style_class: 'buoy-compact', orientation: Clutter.Orientation.VERTICAL});
    box.set_style(`min-width: ${px(m.min)};${maxWidth > 0 ? ` max-width: ${px(maxWidth)};` : ''}`);
    const btns = buttons(p.actions, activity, m);
    // media with its position: the art 72 takes the head and the bar's row, 8 from the
    // edges, radius 20 (design/compact "Nhạc"): 8 + 72 + 8 = 88
    if (p.live && p.leading?.type === 'art') {
        box.add_child(mediaRow(p, activity, btns, m));
    } else {
        box.add_child(head([
            cell(p.leading, activity, m.lead),
            lines(p.text, p.subtitle),
            makeElement(p.trailing, 'compact'),
            btns,
        ], m));
        const under = underHead(p, m);
        if (under) {
            // a bar is a row of 16 (two with its times), with 8 above and below
            const wrap = new St.Bin({child: under, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
            if (!p.rows?.length)
                wrap.set_height(p.live ? 2 * m.row : m.row);
            // rows carry their own leading column (their icons); a bar sits under the text
            const holder = underText(new St.BoxLayout({x_expand: true}), m, {leading: !!p.leading && !p.rows?.length});
            holder.set_style(`${holder.get_style()} margin-top: ${px(m.vpad)}; margin-bottom: ${px(m.vpad)};`);
            holder.add_child(wrap);
            under.x_expand = true;
            box.add_child(holder);
        }
    }
    if (p.stale)
        dimStale(box);
    return box;
}

// What goes under the head: a live position, a bar, or rows
function underHead(p, m) {
    if (p.live)
        return liveBar(p.live);
    if (p.progress !== null && p.progress !== undefined)
        return meter('bar', p.progress, 0);
    return p.rows?.length ? rowList(p.rows, m) : null;
}

function mediaRow(p, activity, btns, m) {
    const row = new St.BoxLayout({style_class: 'buoy-compact-media', x_expand: true});
    row.set_style(`spacing: ${px(m.gap)}; padding: ${px(m.artInset)} ${px(m.side)} ${px(m.artInset)} ${px(m.artInset)};`);
    const art = makeElement(p.leading, 'compact', activity, {art: m.art, artRadius: m.artRadius});
    const column = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    // the head's lines and buttons on the head's middle (y 28), the bar at 60, its times
    // under it: 40 + 12 + 4 + 16 = 72, the art's height
    const top = new St.BoxLayout({x_expand: true, height: m.lead});
    top.set_style(`spacing: ${px(m.gap)};`);
    addAll(top, [lines(p.text, p.subtitle), btns]);
    const live = liveBar(p.live);
    live.x_expand = true;
    live.set_style(`margin-top: ${px(m.gap)};`);
    live.set_height(m.art - m.lead - m.gap);      // the bar (4) and its times (16)
    addAll(column, [top, live]);
    addAll(row, [art, column]);
    return row;
}

// Up to three rows of 16: the icon (16) in the leading's column, the text under the title,
// the detail at the right edge (design/compact "Danh sách hàng"); 8 above and below.
function rowList(rows, m) {
    const list = new St.BoxLayout({style_class: 'buoy-compact-rows', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    for (const r of rows) {
        const row = new St.BoxLayout({style_class: 'buoy-compact-row', x_expand: true, height: m.row});
        const icon = r.icon ? makeElement(r.icon, 'minimal') : null;
        if (icon && 'icon_size' in icon)
            icon.icon_size = m.rowIcon;
        const lead = new St.Bin({width: m.lead, child: icon, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        lead.set_style(`margin-right: ${px(m.gap)};`);
        const text = label(r.text, 'buoy-compact-row-text', true);
        text.x_expand = true;
        text.y_align = Clutter.ActorAlign.CENTER;
        const detail = r.detail ? label(r.detail, 'buoy-compact-row-detail') : null;
        if (detail) {
            detail.y_align = Clutter.ActorAlign.CENTER;
            detail.set_style(`margin-left: ${px(m.vpad)};`);
        }
        addAll(row, [lead, text, detail]);
        list.add_child(row);
    }
    return list;
}

/**
 * The hover tier: the activity's `compact` (SPEC §2) in the grown pill.
 *
 * @param {object} activity  presentation data (+ onAction)
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]  the compact's widest (its content carries its paddings)
 * @param {string} [opts.light]  unused: the light is the pill's, never the compact's
 * @param {object} [opts.metrics]  kit/model/shapes.js compactMetrics at the em
 * @returns {?Clutter.Actor} null when the activity has no compact
 */
export function buildCompact(activity, {maxWidth = 0, light, metrics = compactMetrics()} = {}) {
    const p = planCompact(activity, {light});
    if (!p)
        return null;
    return p.card ? cardBox(p, activity, maxWidth, metrics) : compactBox(p, activity, maxWidth, metrics);
}

// A card (NOTIFICATIONS.md §3, design/compact "Card thông báo"): the head as every compact's
// — the picture 40 with the app's logo on its corner (the logo alone, 40, without one), the
// sender over "App · time", × round 32 — then the message across the full width, up to 2
// lines of 16, 8 under the head, and the buttons in a row 12 from the edges, 32 tall, 12
// above and below: 136 with one line, 152 with two (104 without buttons). The compact's full
// width. A click on it but a button is the pill's click (island.js).
function cardBox(p, activity, maxWidth, m) {
    const c = p.card;
    const box = new St.BoxLayout({style_class: 'buoy-card', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    if (maxWidth > 0)
        box.set_style(`width: ${px(maxWidth)};`);

    const sub = new St.BoxLayout({style_class: 'buoy-card-sub'});
    addAll(sub, [
        c.header.text ? label(c.header.text, 'buoy-compact-subtitle') : null,
        c.header.at !== null ? agoLabel(c.header.at) : null,
    ]);
    const text = new St.BoxLayout({
        style_class: 'buoy-compact-lines', orientation: Clutter.Orientation.VERTICAL,
        x_expand: true, y_align: Clutter.ActorAlign.CENTER,
    });
    addAll(text, [
        c.title ? label(c.title, 'buoy-text buoy-card-title') : null,
        sub.get_n_children() ? sub : null,
    ]);
    box.add_child(head([
        avatar(c, activity, m),
        text.get_n_children() ? text : null,
        c.close ? closeButton(c.close, activity, m) : null,
    ], m));

    const hasActions = p.actions.length > 0;
    if (c.body) {
        const body = wrapped(c.body, 'buoy-card-body');
        body.set_style(`margin: ${px(m.bodyGap)} ${px(m.side)} ${hasActions ? 0 : px(m.vpad)}; max-height: ${px(2 * m.row)};`);
        box.add_child(body);
    }
    if (hasActions) {
        const row = new St.BoxLayout({style_class: 'buoy-card-actions', x_expand: true});
        // under the head with no message: 8 + 12 (design/alerts-and-asks "Ask 120")
        const above = c.body ? m.actionsGap : m.bodyGap + m.actionsGap;
        row.set_style(`margin: ${px(above)} ${px(m.edge)} ${px(m.actionsGap)}; height: ${px(m.button)};`);
        row.layout_manager.homogeneous = true;      // equal widths, as GNOME's banner
        for (const a of p.actions) {
            const b = actionButton(a, activity);
            b.x_expand = true;
            if (a.main)
                b.add_style_class_name('buoy-action-main');   // an ask's answer: cream
            row.add_child(b);
        }
        box.add_child(row);
    }
    return box;
}

// The card's leading: the picture with the app's logo on its lower right corner, or the
// logo alone at 40.
function avatar(c, activity, m) {
    if (!c.picture) {
        // no picture: the app's logo at 40, without a badge (design/compact "Card thông báo")
        const logo = makeElement(c.header.icon, 'compact', activity, {icon: m.lead, art: m.lead});
        return logo ? new St.Bin({style_class: 'buoy-leading', width: m.lead, height: m.lead, child: logo}) : null;
    }
    const main = cell(c.picture, activity, m.lead);
    if (!main || !c.header.icon)
        return main;
    const badge = makeElement(c.header.icon, 'minimal');
    if (!badge)
        return main;
    // the logo 18 with its 2 px black ring, at (24, 24) of the picture: 2 px past its
    // corner (design/compact "Card thông báo")
    if ('icon_size' in badge)
        badge.icon_size = m.badge - 4;
    const ring = new St.Bin({style_class: 'buoy-card-badge', child: badge, width: m.badge, height: m.badge});
    const stack = new St.Widget({width: m.lead, height: m.lead, layout_manager: new Clutter.FixedLayout()});
    stack.add_child(main);
    stack.add_child(ring);
    ring.set_position(m.lead - m.badge + 2, m.lead - m.badge + 2);
    return stack;
}

// Wrapped and ellipsized at its max-height (MAX_CARD_LINES lines): Clutter.Text gives
// Pango the allocated height when it both wraps and ellipsizes (clutter-text.c
// clutter_text_create_layout), so the last line that fits ends in …
function wrapped(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, x_expand: true});
    l.clutter_text.line_wrap = true;
    l.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

// " · now", " · 3 min": re-read while shown, as `since` (NOTIFICATIONS.md §3)
function agoLabel(at) {
    const l = label('', 'buoy-compact-subtitle');
    tick(l, () => {
        l.text = ` · ${agoText(at, Date.now())}`;
    }, () => true, 20);
    return l;
}

function closeButton(id, activity, m) {
    const button = new St.Button({
        style_class: 'buoy-round', can_focus: true, accessible_name: 'Dismiss',
        child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 16}),
        y_align: Clutter.ActorAlign.CENTER,
    });
    button.set_size(m.button, m.button);
    button.connect('clicked', () => activity.onAction?.(id));
    return button;
}

/**
 * The amber light's compact: Bu looking (the `missed` pose), "Missed · N", then up to 3 rows.
 *
 * @param {object} plan  presentation.js planMissed()
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]
 * @param {object} [opts.metrics]  compactMetrics at the em
 * @returns {Clutter.Actor}
 */
export function buildMissedCompact(plan, {maxWidth = 0, metrics = compactMetrics()} = {}) {
    return compactBox({
        leading: {type: 'mascot', pose: 'missed'}, text: plan.title, rows: plan.rows,
        actions: [], progress: null,
    }, {}, maxWidth, metrics);
}
