import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {iconProps} from './elements.js';
import {label as textLabel} from './parts.js';

/**
 * A page in place of a body: ‹ and its title over rows of 36 rounded 18, 4 apart (design/home "Ô pin
 * và chế độ năng lượng", design/device "Bấm vào"). Home's glance pages and the Device tab's pages
 * are built here, so both look alike.
 */

/**
 * @param {St.Widget} head  listHead()
 * @returns {St.BoxLayout} the page's box; rows go under the head
 */
export function listBox(head) {
    const box = new St.BoxLayout({style_class: 'buoy-home-list', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    box.add_child(head);
    return box;
}

/**
 * ‹ (back; Esc too, the caller's), the title, then an end: a detail or an action.
 *
 * @param {string} title
 * @param {object} opts
 * @param {function():void} opts.back
 * @param {number} opts.button  the round button's side (compact metrics)
 * @param {?Clutter.Actor} [opts.end]
 * @returns {St.BoxLayout}
 */
export function listHead(title, {back, button, end = null}) {
    const head = new St.BoxLayout({style_class: 'buoy-home-list-head', x_expand: true});
    const b = new St.Button({
        style_class: 'buoy-round', can_focus: true, accessible_name: 'Back',
        child: new St.Icon({...iconProps('go-previous-symbolic'), icon_size: 16}),
        width: button, height: button,
    });
    b.connect('clicked', () => back());
    head.add_child(b);
    head.add_child(textLabel(title, 'buoy-home-title', true));
    if (end)
        head.add_child(end);
    return head;
}

/**
 * A row of 36: icon 16, name, an optional detail, then a value or the end icon (✓ for the chosen,
 * ↗ for settings). `plain`: on fill-1 (a list of things, not a choice).
 *
 * @param {object} r
 * @param {string} r.icon
 * @param {string} r.name
 * @param {?string} [r.detail]
 * @param {?string} [r.value]
 * @param {boolean} [r.on]  the chosen one
 * @param {boolean} [r.settings]  the settings row, last
 * @param {boolean} [r.plain]
 * @param {?Clutter.Actor} [r.end]  drawn in place of the value: a level (the Device tab's volume)
 * @param {?function():void} onClick  none: not reactive
 * @returns {St.Button}
 */
export function choiceRow({icon, name, detail = null, value = null, on = false, settings = false, plain = false, end = null}, onClick) {
    const content = new St.BoxLayout({style_class: 'buoy-home-list-row-box', x_expand: true});
    content.add_child(new St.Icon({...iconProps(icon), icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
    content.add_child(textLabel(name, 'buoy-home-choice-name', !detail));
    if (detail)
        content.add_child(textLabel(detail, 'buoy-home-list-detail', true));
    if (end)
        content.add_child(end);
    else if (value)
        content.add_child(textLabel(value, 'buoy-home-choice-value'));
    let endIcon = null;
    if (on)
        endIcon = 'object-select-symbolic';
    else if (settings)
        endIcon = 'external-link-symbolic';
    if (endIcon)
        content.add_child(new St.Icon({...iconProps(endIcon), icon_size: 16, style_class: 'buoy-home-choice-end', y_align: Clutter.ActorAlign.CENTER}));
    let style = 'buoy-home-choice';
    if (on)
        style += ' buoy-home-choice-on';
    if (settings)
        style += ' buoy-home-choice-settings';
    if (plain)
        style += ' buoy-home-choice-plain';
    const b = new St.Button({
        style_class: style, child: content, x_expand: true, can_focus: !!onClick, reactive: !!onClick,
        accessible_name: name, x_align: Clutter.ActorAlign.FILL,
    });
    if (onClick)
        b.connect('clicked', onClick);
    return b;
}

/**
 * A choice page (kit/ui/home.js Glance `page()`, the Device tab's): its rows, the chosen with ✓,
 * then its settings row.
 *
 * @param {{title: string, end?: ?string, rows: Array<{id: string, icon: string, name: string, selected: boolean, value?: ?string, plain?: boolean}>, settings?: ?{name: string}}} page
 *   `plain`: an action, not a choice (the phone's Find My Phone)
 * @param {object} opts
 * @param {function():void} opts.back
 * @param {number} opts.button
 * @param {function(string):void} opts.choose
 * @param {?function():void} [opts.settings]
 * @returns {St.BoxLayout}
 */
export function choicePage(page, {back, button, choose, settings = null}) {
    const end = page.end ? textLabel(page.end, 'buoy-home-list-detail') : null;
    const box = listBox(listHead(page.title, {back, button, end}));
    const rows = new St.BoxLayout({style_class: 'buoy-home-choices', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    for (const r of page.rows)
        rows.add_child(choiceRow({icon: r.icon, name: r.name, on: r.selected, value: r.value ?? null, plain: r.plain === true}, () => choose(r.id)));
    if (page.settings && settings)
        rows.add_child(choiceRow({icon: 'emblem-system-symbolic', name: page.settings.name, settings: true}, settings));
    box.add_child(rows);
    return box;
}
