import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {EmptyState, marquee, tick} from '../../kit/present.js';
import {livePosition, mediaTimes} from '../../kit/presentation.js';

/**
 * The Media tab (FEATURES M3 "media", 2026-11-05): what the compact has no room for.
 *
 *   players   one chip per playing or paused player, when there is more than one
 *   track     art 72 · title / artist / album · "Open <app>"
 *   position  a slider to seek (when the player can), elapsed and remaining
 *   transport shuffle · ⏮ · ⏯ · ⏭ · repeat (off → all → one), those the player has
 *
 * No volume here (Ethan: a mixer gets its own place, FEATURES "Sound tab"). It reads the
 * kit's activities (`update`, kit/home.js) and acts through each one's `onAction`.
 */
const ART = 72;

export class MediaTab {
    /** @param {{close?: function():void}} [kit]  close(): the island, after "Open <app>" */
    /**
     * @param {object} [kit]
     * @param {function():void} [kit.close]  the island, after an action
     * @param {?string} [kit.from]  the activity whose pill opened the island: its chip is
     *   chosen (a click on Firefox's pill shows Firefox, not the first player; 2026-11-07)
     */
    constructor({close = null, from = null} = {}) {
        this._close = close;
        this.actor = new St.BoxLayout({
            style_class: 'buoy-media-tab', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        this._list = [];
        this._chosen = from;     // the chip shown: the pill it was opened from, then the user's pick
        this._dragging = false;
        this._pending = false;   // a list came during a drag: render after it
    }

    /** @param {object[]} activities  this tab's media activities, stack order */
    update(activities) {
        this._list = activities;
        if (this._dragging) {
            this._pending = true;
            return;
        }
        this._render();
    }

    get _current() {
        return this._list.find(a => a.id === this._chosen) ?? this._list[0] ?? null;
    }

    _render() {
        this.actor.destroy_all_children();
        const a = this._current;
        if (!a) {
            this.actor.add_child(new EmptyState('Nothing playing'));
            return;
        }
        if (this._list.length > 1)
            this.actor.add_child(this._chips(a));
        this.actor.add_child(this._track(a));
        const live = a.state?.live;
        if (live)
            this.actor.add_child(this._position(a, live));
        this.actor.add_child(this._transport(a));
    }

    _chips(current) {
        const row = new St.BoxLayout({style_class: 'buoy-media-chips'});
        for (const a of this._list) {
            const chip = new St.Button({
                style_class: `buoy-media-chip${a === current ? ' buoy-media-chip-on' : ''}`,
                label: a.attributes?.app || a.app, can_focus: true,
            });
            chip.connect('clicked', () => {
                this._chosen = a.id;
                this._render();
            });
            row.add_child(chip);
        }
        return row;
    }

    _track(a) {
        const at = a.attributes ?? {};
        const row = new St.BoxLayout({style_class: 'buoy-media-track', x_expand: true});
        row.add_child(new St.Icon({
            style_class: 'buoy-media-art', icon_size: ART,
            ...at.art ? {gicon: new Gio.FileIcon({file: Gio.File.new_for_uri(at.art)})} : {},
            fallback_icon_name: 'audio-x-generic-symbolic',
        }));
        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        const line = (t, cls) => {
            if (!t)
                return;
            const l = new St.Label({text: t, style_class: cls});
            l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(l);
        };
        if (at.title)
            text.add_child(marquee(at.title, 'buoy-media-title'));   // scrolls when long
        line(at.artist, 'buoy-media-artist');
        line(at.album, 'buoy-media-album');
        row.add_child(text);
        if (at.app) {
            const open = new St.Button({
                style_class: 'buoy-media-chip', label: `Open ${at.app}`, can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            open.connect('clicked', () => {
                a.onAction?.('raise');
                this._close?.();
            });
            row.add_child(open);
        }
        return row;
    }

    _position(a, live) {
        const box = new St.BoxLayout({style_class: 'buoy-media-position', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const seekable = a.state?.canSeek === true;
        const slider = new Slider(live.position / live.length);
        slider.reactive = slider.can_focus = seekable;
        slider.accessible_name = 'Position';
        const times = new St.BoxLayout({x_expand: true});
        const elapsed = new St.Label({style_class: 'buoy-live-time'});
        const left = new St.Label({style_class: 'buoy-live-time'});
        times.add_child(elapsed);
        times.add_child(new St.Widget({x_expand: true}));
        times.add_child(left);
        box.add_child(slider);
        box.add_child(times);

        let setting = false;
        const show = pos => {
            [elapsed.text, left.text] = mediaTimes(pos, live.length);
            if (!this._dragging) {
                setting = true;
                slider.value = pos / live.length;
                setting = false;
            }
        };
        slider.connect('drag-begin', () => {
            this._dragging = true;
        });
        slider.connect('drag-end', () => {
            this._dragging = false;
            a.onAction?.('seek', slider.value * live.length);
            if (this._pending) {
                this._pending = false;
                this._render();
            }
        });
        // keys and scroll move it without a drag
        slider.connect('notify::value', () => {
            if (this._dragging)
                [elapsed.text, left.text] = mediaTimes(slider.value * live.length, live.length);
            else if (!setting && seekable)
                a.onAction?.('seek', slider.value * live.length);
        });
        tick(box, () => show(livePosition(live, Date.now())),
            () => live.playing && livePosition(live, Date.now()) < live.length);
        return box;
    }

    _transport(a) {
        const row = new St.BoxLayout({style_class: 'buoy-media-transport', x_align: Clutter.ActorAlign.CENTER});
        const st = a.state ?? {};
        const button = (id, icon, cls = '', on = false) => {
            const b = new St.Button({
                style_class: `buoy-media-button ${cls}${on ? ' buoy-media-on' : ''}`,
                child: new St.Icon({icon_name: icon, icon_size: cls ? 20 : 16}), can_focus: true, accessible_name: id,
            });
            b.connect('clicked', () => a.onAction?.(id));
            return b;
        };
        if (st.shuffle !== null && st.shuffle !== undefined)
            row.add_child(button('shuffle', 'media-playlist-shuffle-symbolic', '', st.shuffle));
        for (const act of a.actions ?? [])
            row.add_child(button(act.id, act.icon, act.id === 'playpause' ? 'buoy-media-play' : 'buoy-media-skip'));
        if (st.loop) {
            const icon = st.loop === 'Track' ? 'media-playlist-repeat-song-symbolic' : 'media-playlist-repeat-symbolic';
            row.add_child(button('loop', icon, '', st.loop !== 'None'));
        }
        return row;
    }

    destroy() {
        this.actor.destroy();
    }
}
