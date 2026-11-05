import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {progressBar} from '../../kit/present.js';
import {clockTime} from '../../kit/presentation.js';
import {doneHistory} from './history.js';

/**
 * The Transfers tab (SPEC §6c, FEATURES M3 "progress"). LauncherEntry says which app is
 * busy and how far, nothing more, so the tab lists apps:
 *
 *   Running   one row per app: icon, name, the count when sent, %, a thin bar
 *   Done      an app's transfer that ended, with the time, for KEEP_MS (history.js)
 *
 * A row brings its app forward (the activity's onPress). It reads the kit's activities
 * (`update`, kit/home.js) and the module's Done store.
 */
const ICON = 24;

export class TransfersTab {
    constructor() {
        this.actor = new St.BoxLayout({
            style_class: 'buoy-transfers-tab', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        this._list = [];
    }

    /** @param {object[]} activities  this tab's progress activities, stack order */
    update(activities) {
        this._list = activities;
        this._render();
    }

    _render() {
        this.actor.destroy_all_children();
        const running = this._list.filter(a => a.trailing);      // a Done pill has none
        const done = doneHistory.list(Date.now());
        if (!running.length && !done.length) {
            this.actor.add_child(new St.Label({text: 'No transfers', style_class: 'buoy-transfers-empty'}));
            return;
        }
        if (running.length) {
            this.actor.add_child(header('Running'));
            for (const a of running) {
                this.actor.add_child(this._row(a.compact?.leading?.icon ?? null, a.attributes?.app ?? a.text,
                    a.attributes?.count ?? null, a.leading?.progress ?? 0, a.onPress));
            }
        }
        if (done.length) {
            this.actor.add_child(header('Done'));
            for (const d of done)
                this.actor.add_child(this._row(d.icon, d.name, clockTime(d.at), null, d.focus));
        }
    }

    // icon · name over detail · % — and under them a bar while running
    _row(icon, name, detail, progress, onPress) {
        const button = new St.Button({
            style_class: 'buoy-transfers-row', can_focus: true, x_expand: true,
            accessible_name: name, reactive: typeof onPress === 'function',
        });
        if (typeof onPress === 'function')
            button.connect('clicked', () => onPress());
        const row = new St.BoxLayout({style_class: 'buoy-transfers-line', x_expand: true});
        row.add_child(new St.Icon({
            style_class: 'buoy-transfers-icon', icon_size: ICON, y_align: Clutter.ActorAlign.CENTER,
            ...icon && typeof icon === 'object' ? {gicon: icon} : {icon_name: icon || 'folder-download-symbolic'},
        }));
        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
            style_class: 'buoy-transfers-text',
        });
        text.add_child(label(name, 'buoy-transfers-name'));
        if (detail)
            text.add_child(label(detail, 'buoy-transfers-detail'));
        if (progress !== null) {
            const bar = progressBar(progress);
            bar.add_style_class_name('buoy-transfers-bar');
            text.add_child(bar);
        }
        row.add_child(text);
        if (progress !== null)
            row.add_child(label(`${Math.round(progress * 100)}%`, 'buoy-transfers-pct'));
        button.set_child(row);
        return button;
    }
}

function header(text) {
    return new St.Label({text, style_class: 'buoy-transfers-header'});
}

function label(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
