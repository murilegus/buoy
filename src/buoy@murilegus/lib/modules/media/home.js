import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {progressBar, tick} from '../../kit/ui/present/parts.js';
import {livePosition} from '../../kit/model/presentation.js';

const ART = 56;

/**
 * Home's Now playing (SPEC §3, 2026-11-08, Ethan: layout A): the first player of the
 * stack — the one the pill shows — as a card in Home's start column: art, title, artist and
 * the player's name, the position as a thin bar, and the player's own
 * transport buttons (its activity's actions). A click anywhere on the card but those
 * buttons opens the Media tab, which has the rest: the other players, seeking, shuffle and
 * repeat. Nothing playing → not ready, and Home leaves the card out.
 *
 * It reads the kit's activities (`update`, kit/ui/home.js) and acts through each one's
 * `onAction`, as the Media tab does. The bar moves once a second only while it is on
 * screen and the track plays (kit `tick`, rule 8).
 */
export class MediaHome {
    /**
     * @param {object} [kit]
     * @param {function(string):void} [kit.open]  select a tab of the panel
     * @param {function():void} [kit.changed]  `ready` flipped: Home lays out again
     */
    constructor({open = null, changed = null} = {}) {
        this._open = open;
        this._changed = changed;
        this._list = [];
        // the whole card is the button (2026-11-08, Ethan); the transport buttons inside
        // take their own clicks, as the media controls inside Shell's notification do
        // (ui/messageList.js Message, an St.Button, and its addMediaControl buttons)
        this._box = new St.BoxLayout({
            style_class: 'buoy-home-media', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true,
        });
        this.actor = new St.Button({
            style_class: 'buoy-home-card buoy-home-hit', child: this._box, x_expand: true, y_expand: true,
            can_focus: true, accessible_name: 'Now playing',
            x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL,
        });
        this.actor.connect('clicked', () => this._open?.('media'));
    }

    /** @returns {boolean} a player to show */
    get ready() {
        return this._list.length > 0;
    }

    /** @param {object[]} activities  this module's activities (media), stack order */
    update(activities) {
        const was = this.ready;
        this._list = activities;
        this._render();
        if (was !== this.ready)
            this._changed?.();
    }

    _render() {
        this._box.destroy_all_children();
        const a = this._list[0];
        if (!a)
            return;
        const at = a.attributes ?? {};
        this.actor.accessible_name = [at.title || a.text, at.artist].filter(Boolean).join(', ') || 'Now playing';
        this._box.add_child(this._track(a));
        this._box.add_child(new St.Widget({y_expand: true}));
        const live = a.state?.live;
        if (live?.length > 0)
            this._box.add_child(this._position(live));
        this._box.add_child(this._transport(a));
    }

    _track(a) {
        const at = a.attributes ?? {};
        const row = new St.BoxLayout({style_class: 'buoy-home-media-track', x_expand: true});
        // the cover; without one (or until it loads) a grey tile with the note, not a
        // 56 px glyph
        const tile = new St.Bin({style_class: 'buoy-home-media-tile', width: ART, height: ART});
        tile.set_child(new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: 24}));
        if (at.art) {
            tile.set_child(new St.Icon({
                style_class: 'buoy-home-media-art', icon_size: ART,
                gicon: new Gio.FileIcon({file: Gio.File.new_for_uri(at.art)}),
                fallback_icon_name: 'audio-x-generic-symbolic',
            }));
        }
        row.add_child(tile);
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
        line(at.title || a.text, 'buoy-home-title');
        line(at.artist, 'buoy-home-subtitle');
        line(at.app || a.app, 'buoy-home-meta');
        row.add_child(text);
        return row;
    }

    _position(live) {
        const bar = progressBar(livePosition(live, Date.now()) / live.length);
        bar.add_style_class_name('buoy-home-media-bar');
        bar.x_expand = true;
        tick(bar, () => bar.setValue(livePosition(live, Date.now()) / live.length),
            () => live.playing && livePosition(live, Date.now()) < live.length);
        return bar;
    }

    _transport(a) {
        const row = new St.BoxLayout({style_class: 'buoy-home-media-transport', x_align: Clutter.ActorAlign.CENTER});
        for (const act of a.actions ?? []) {
            const play = act.id === 'playpause';
            const b = new St.Button({
                style_class: `buoy-media-button ${play ? 'buoy-home-media-play' : 'buoy-media-skip'}`,
                child: new St.Icon({icon_name: act.icon, icon_size: play ? 18 : 16}),
                can_focus: true, accessible_name: act.label ?? act.id,
            });
            b.connect('clicked', () => a.onAction?.(act.id));
            row.add_child(b);
        }
        return row;
    }

    destroy() {
        this._changed = null;
        this.actor.destroy();
    }
}
