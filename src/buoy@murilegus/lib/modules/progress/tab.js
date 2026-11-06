import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {progressBar} from '../../kit/present.js';
import {clockTime} from '../../kit/presentation.js';
import {downloadedDetail} from './adapter.js';
import {doneHistory, downloadHistory} from './history.js';

/**
 * The Transfers tab (SPEC §6c, FEATURES M3 "progress", "downloads"):
 *
 *   Running     one row per app (icon, name, the count when sent, %, a thin bar; "In the
 *               background" without them when the app no longer reports) and one per
 *               download (a static download icon, the file name, size · speed; a bar only
 *               when one LauncherEntry covers that file)
 *   Done        an app's transfer that ended, with the time, for KEEP_MS (history.js)
 *   Downloaded  each finished download: its file type icon, name, folder · app · time; a
 *               click opens it, and two icon-only buttons Open / Show in Files
 *
 * An app row brings its app forward (the activity's onPress). It reads the kit's
 * activities (`update`, kit/home.js) and the module's stores. A Downloaded file deleted
 * since leaves its row when the tab is drawn.
 */
const ICON = 24;
const ACTION_ICON = 16;

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
        const now = Date.now();
        const running = this._list.filter(a => a.attributes?.phase !== 'done');
        const done = doneHistory.list(now);
        for (const d of downloadHistory.list(now)) {
            if (!GLib.file_test(d.path, GLib.FileTest.EXISTS))
                downloadHistory.remove(d.key);
        }
        const downloaded = downloadHistory.list(now);
        if (!running.length && !done.length && !downloaded.length) {
            this.actor.add_child(new St.Label({text: 'No transfers', style_class: 'buoy-transfers-empty'}));
            return;
        }
        if (running.length) {
            this.actor.add_child(header('Running'));
            for (const a of running) {
                const background = a.attributes?.phase === 'background';
                this.actor.add_child(this._row({
                    icon: a.compact?.leading?.icon ?? null, name: a.attributes?.app ?? a.text,
                    detail: background ? 'In the background' : a.attributes?.count ?? null,
                    progress: background ? null : a.leading?.progress ?? null, onPress: a.onPress,
                }));
            }
        }
        if (done.length) {
            this.actor.add_child(header('Done'));
            for (const d of done)
                this.actor.add_child(this._row({icon: d.icon, name: d.name, detail: clockTime(d.at), onPress: d.focus}));
        }
        if (downloaded.length) {
            this.actor.add_child(header('Downloaded'));
            for (const d of downloaded) {
                this.actor.add_child(this._row({
                    icon: d.icon, name: d.name, detail: downloadedDetail(d.folder, d.app, clockTime(d.at)),
                    onPress: d.open,
                    actions: [
                        {label: 'Open', icon: 'document-open-symbolic', run: d.open},
                        {label: 'Show in Files', icon: 'folder-open-symbolic', run: d.show},
                    ],
                }));
            }
        }
    }

    // icon · name over detail · % — under them a bar while a fraction is known; icon-only
    // buttons at the end, each saying what it does in the detail line while hovered or
    // focused (St has no tooltips; Shell's dash shows a label of its own the same way)
    _row({icon, name, detail = null, progress = null, onPress = null, actions = []}) {
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
        const detailLabel = detail || actions.length ? label(detail ?? '', 'buoy-transfers-detail') : null;
        if (detailLabel)
            text.add_child(detailLabel);
        if (progress !== null) {
            const bar = progressBar(progress);
            bar.add_style_class_name('buoy-transfers-bar');
            text.add_child(bar);
        }
        row.add_child(text);
        if (progress !== null)
            row.add_child(label(`${Math.round(progress * 100)}%`, 'buoy-transfers-pct'));
        button.set_child(row);
        if (!actions.length)
            return button;

        const line = new St.BoxLayout({style_class: 'buoy-transfers-actions-line', x_expand: true});
        line.add_child(button);
        for (const act of actions) {
            const b = new St.Button({
                style_class: 'buoy-transfers-action', can_focus: true, accessible_name: act.label,
                y_align: Clutter.ActorAlign.CENTER,
                child: new St.Icon({icon_name: act.icon, icon_size: ACTION_ICON}),
            });
            b.connect('clicked', () => act.run?.());
            const say = () => {
                detailLabel.text = b.hover || b.has_key_focus() ? act.label : detail ?? '';
            };
            b.connect('notify::hover', say);
            b.connect('key-focus-in', say);
            b.connect('key-focus-out', say);
            line.add_child(b);
        }
        return line;
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
