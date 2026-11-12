import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {EmptyState, iconProps} from '../../kit/ui/present/elements.js';
import {marquee} from '../../kit/ui/present/motion.js';
import {tick} from '../../kit/ui/present/parts.js';
import {livePosition, mediaTimes} from '../../kit/model/presentation.js';
import {artSize, metaLine, ART_MIN} from './layout.js';

/**
 * The Media tab (FEATURES M3 "media", 2026-11-05): what the compact has no room for.
 * Layout A (2026-11-08, Ethan: the tab left the panel's lower part empty):
 *
 *   top row   the players' chips, when there is more than one — one per player, its
 *             app's name (each app has one player; a browser's is whichever tab plays)
 *   art       a square as tall as the room under that row (layout.js `artSize`): the
 *             cover in it (a 16:9 thumbnail comes out cropped to the square: St.Icon's
 *             texture-cache load), on a grey tile with the note for none
 *   column    title (scrolls when long) / artist / album · app, ↗ beside them (open the
 *             player's window); then, at the bottom, a
 *             slider to seek (when the player can) with elapsed and remaining, and
 *             shuffle · ⏮ · ⏯ · ⏭ · repeat (off → all → one), those the player has
 *
 * No volume here (Ethan: a mixer gets its own place, FEATURES "Sound tab"). It reads the
 * kit's activities (`update`, kit/ui/home.js) and acts through each one's `onAction`.
 */
export class MediaTab {
    /**
     * @param {object} [kit]
     * @param {function():void} [kit.close]  the island, after an action
     * @param {?string} [kit.from]  the activity whose pill opened the island: its chip is
     *   chosen (a click on Firefox's pill shows Firefox, not the first player; 2026-11-07)
     */
    constructor({close = null, from = null} = {}) {
        this._close = close;
        this.actor = new St.BoxLayout({
            style_class: 'buoy-media-tab', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true,
        });
        this._list = [];
        this._chosen = from;     // the chip shown: the pill it was opened from, then the user's pick
        this._dragging = false;
        this._pending = false;   // a list came during a drag: render after it
        this._art = ART_MIN;     // the art's side, measured from the tab (_fit)
        this._tile = null;
        this._cover = null;      // the cover's icon in the tile, when the player sends one
        this._body = null;       // the art and the column, under the top row
        this._top = null;        // the players' chips, with more than one
        this._fitLater = 0;
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

    // measured once the tab has its size, just before the next redraw (as the Calendar
    // tab's month: modules/calendar/tab.js)
    _fitLaterOnce() {
        if (this._fitLater)
            return;
        this._fitLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._fitLater = 0;
            this._fit();
            return GLib.SOURCE_REMOVE;
        });
    }

    _fit() {
        const body = this._body;
        if (!body?.mapped)
            return;
        // the room: the panel's viewport (the scroll view around the tab, its height fixed
        // by the expanded shape) less the tab's padding and the top row — not the body's
        // own height, which grows with the art and would keep a too-big art (and a
        // scrollbar) once it had one
        let view = this.actor.get_parent();
        while (view && !(view instanceof St.ScrollView))
            view = view.get_parent();
        const node = this.actor.get_theme_node();
        // the last allocations: `width` / `height` give the natural size instead while a
        // relayout is queued (clutter-actor.c clutter_actor_get_width), which is often so
        // just before a redraw
        const height = (view ?? this.actor).get_allocation_box().get_height();
        const top = this._top ? this._top.get_allocation_box().get_height() + node.get_length('spacing') : 0;
        const art = artSize(height - node.get_vertical_padding() - top, body.get_allocation_box().get_width());
        if (art === this._art)
            return;
        this._art = art;
        this._sizeTile();
    }

    _render() {
        this.actor.destroy_all_children();
        this._tile = this._body = this._top = this._cover = null;
        const a = this._current;
        if (!a) {
            this.actor.add_child(new EmptyState('Nothing playing', {pose: 'idle'}));
            return;
        }
        this._top = this._topRow(a);
        if (this._top)
            this.actor.add_child(this._top);
        // y_expand: the room left under the top row; the art takes its height (_fit)
        this._body = new St.BoxLayout({style_class: 'buoy-media-body', x_expand: true, y_expand: true});
        this._body.connect('notify::height', () => this._fitLaterOnce());
        this._body.connect('notify::width', () => this._fitLaterOnce());
        // Home lays a tab out before it is on screen (kit/ui/home.js _setBody): a size given
        // while unmapped is fitted once it maps
        this._body.connect('notify::mapped', () => this._fitLaterOnce());
        this._body.add_child(this._artTile(a));
        const column = new St.BoxLayout({
            style_class: 'buoy-media-column', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true,
        });
        const text = this._text(a);
        const open = this._openButton(a);
        if (open) {
            const head = new St.BoxLayout({style_class: 'buoy-media-head', x_expand: true});
            head.add_child(text);
            head.add_child(open);
            column.add_child(head);
        } else {
            column.add_child(text);
        }
        column.add_child(new St.Widget({y_expand: true}));
        const live = a.state?.live;
        if (live)
            column.add_child(this._position(a, live));
        column.add_child(this._transport(a));
        this._body.add_child(column);
        this.actor.add_child(this._body);
        this._fitLaterOnce();
    }

    // the players' chips; only with more than one player
    _topRow(a) {
        if (this._list.length < 2)
            return null;
        const row = new St.BoxLayout({style_class: 'buoy-media-top', x_expand: true});
        row.add_child(this._chips(a));
        return row;
    }

    _artTile(a) {
        const uri = a.attributes?.art;
        // the note in the middle of the grey tile, the cover over it: a cover that is
        // missing, still loading or fails to load (no fallback icon, which would be drawn
        // at the art's size) leaves the note showing
        this._tile = new St.Widget({
            style_class: 'buoy-media-tile', layout_manager: new Clutter.BinLayout(),
            y_align: Clutter.ActorAlign.START,
        });
        this._tile.add_child(new St.Icon({
            icon_name: 'audio-x-generic-symbolic', icon_size: 24,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, x_expand: true, y_expand: true,
        }));
        this._cover = null;
        if (uri) {
            // through the texture cache, async, as Shell's own media message
            // (ui/messageList.js MediaMessage); not a CSS background-image, which St loads
            // at once and keeps for good (st-texture-cache.c
            // st_texture_cache_load_file_to_cairo_surface, POLICY_FOREVER) — a browser
            // writes a new thumbnail file per track
            this._cover = new St.Icon({
                style_class: 'buoy-media-art',
                gicon: new Gio.FileIcon({file: Gio.File.new_for_uri(uri)}),
            });
            this._tile.add_child(this._cover);
        }
        this._sizeTile();
        return this._tile;
    }

    _sizeTile() {
        if (!this._tile)
            return;
        this._tile.set_size(this._art, this._art);
        if (this._cover)
            this._cover.icon_size = this._art;
    }

    _chips(current) {
        const row = new St.BoxLayout({style_class: 'buoy-media-chips', x_expand: true});
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

    _text(a) {
        const at = a.attributes ?? {};
        const text = new St.BoxLayout({
            style_class: 'buoy-media-text', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        const line = (t, cls) => {
            if (!t)
                return;
            const l = new St.Label({text: t, style_class: cls});
            l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(l);
        };
        const title = at.title || a.text;
        if (title)
            text.add_child(marquee(title, 'buoy-media-title'));   // scrolls when long
        line(at.artist, 'buoy-media-artist');
        line(metaLine(at), 'buoy-media-album');
        return text;
    }

    // ↗: the player's window (MPRIS Raise), then the island closes; Yaru's
    // external-link, Adwaita's window-new where Yaru is not the theme
    _openButton(a) {
        const app = a.attributes?.app;
        if (!app)
            return null;
        const open = new St.Button({
            style_class: 'buoy-media-button buoy-media-open', can_focus: true,
            child: new St.Icon({icon_name: 'external-link-symbolic', fallback_icon_name: 'window-new-symbolic', icon_size: 14}),
            accessible_name: `Open ${app}`, y_align: Clutter.ActorAlign.START,
        });
        open.connect('clicked', () => {
            a.onAction?.('raise');
            this._close?.();
        });
        return open;
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
                child: new St.Icon({...iconProps(icon), icon_size: cls ? 20 : 16}), can_focus: true, accessible_name: id,
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
        if (this._fitLater)
            global.compositor.get_laters().remove(this._fitLater);
        this._fitLater = 0;
        this._tile = this._body = this._top = this._cover = null;
        this._close = null;
        this.actor.destroy();
    }
}
