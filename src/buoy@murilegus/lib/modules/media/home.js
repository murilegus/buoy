import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {progressBar, tick} from '../../kit/ui/present/parts.js';
import {iconProps, makeElement} from '../../kit/ui/present/elements.js';
import {markShared} from '../../kit/ui/present/flight.js';
import {livePosition, mediaTimes, element} from '../../kit/model/presentation.js';

/** The cover: the card's height less 8 above and below, at most 160 (design/home). */
const ART_MAX = 160;
const ART_INSET = 8;
const ART_RADIUS = 8;

/**
 * Home's main card for a player (design/home, 2026-11-11): the cover as tall as the card
 * allows, the title over "artist · player", the position as a bar with its times, and the
 * player's own transport (its activity's actions). Two forms by the card's height:
 *
 * - `low` (under 160): the transport at the top right, the bar at the bottom;
 * - `tall`: the title larger, the transport centred under the bar.
 *
 * A click anywhere but the buttons opens the Media tab (the other players, seeking, shuffle
 * and repeat). It acts through the activity's `onAction`, as the Media tab does; the bar and
 * its times move once a second only while on screen and playing (kit `tick`, rule 8). Made
 * once per open by kit/ui/home.js and shown again on every change of the stack.
 */
export class MediaCard {
    /**
     * @param {object} [kit]
     * @param {function(string, ?string):void} [kit.open]  select a tab of the panel, on that
     *   activity (the Media tab's chip of this player)
     */
    constructor({open = null} = {}) {
        this._box = new St.BoxLayout({style_class: 'buoy-home-media', x_expand: true, y_expand: true});
        // the whole card is the button; the transport buttons inside take their own clicks,
        // as the media controls inside Shell's notification do (ui/messageList.js)
        this.actor = new St.Button({
            style_class: 'buoy-home-hit buoy-home-card-hit', child: this._box, x_expand: true, y_expand: true,
            can_focus: true, accessible_name: 'Now playing',
            x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL,
        });
        this._id = null;    // the activity shown
        this.actor.connect('clicked', () => open?.('media', this._id));
    }

    /**
     * @param {object} a  the media activity on the main card
     * @param {{height: number, form: 'low'|'tall'}} opts  the card's
     */
    show(a, {height, form}) {
        this._box.destroy_all_children();
        this._id = a.id ?? null;
        const at = a.attributes ?? {};
        const tall = form === 'tall';
        this.actor.accessible_name = [at.title || a.text, at.artist].filter(Boolean).join(', ') || 'Now playing';
        const size = Math.max(0, Math.min(ART_MAX, height - 2 * ART_INSET));
        const art = makeElement(
            element({art: at.art || null, icon: 'audio-x-generic-symbolic'}) ?? element('audio-x-generic-symbolic'),
            'expanded', a, {art: size, artRadius: ART_RADIUS, icon: Math.round(size / 3)});
        // the cover and the title are the pill's: they fly here from it (design/motion)
        const cover = markShared(new St.Bin({style_class: 'buoy-home-media-cover', width: size, height: size, child: art}), 'leading', a);
        this._box.add_child(cover);

        const col = new St.BoxLayout({
            style_class: 'buoy-home-media-text', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true,
        });
        const head = new St.BoxLayout({x_expand: true});
        const lines = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        lines.add_child(markShared(ellipsized(at.title || a.text || '', tall ? 'buoy-home-media-title-tall' : 'buoy-home-title'), 'title', a));
        const sub = [at.artist, at.app].filter(Boolean).join(' · ');
        if (sub)
            lines.add_child(ellipsized(sub, 'buoy-home-subtitle'));
        head.add_child(lines);
        if (!tall)
            head.add_child(this._transport(a));
        col.add_child(head);
        col.add_child(new St.Widget({y_expand: true}));
        const live = a.state?.live;
        if (live?.length > 0)
            col.add_child(this._position(live));
        if (tall) {
            const t = this._transport(a);
            t.x_align = Clutter.ActorAlign.CENTER;
            col.add_child(t);
        }
        this._box.add_child(col);
    }

    // The bar, the elapsed time under its start and the remaining under its end
    _position(live) {
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const bar = progressBar(livePosition(live, Date.now()) / live.length);
        bar.add_style_class_name('buoy-home-media-bar');
        bar.x_expand = true;
        const times = new St.BoxLayout({x_expand: true});
        const [from, left] = [new St.Label({style_class: 'buoy-home-media-time', x_expand: true}), new St.Label({style_class: 'buoy-home-media-time'})];
        times.add_child(from);
        times.add_child(left);
        const update = () => {
            const pos = livePosition(live, Date.now());
            bar.setValue(pos / live.length);
            [from.text, left.text] = mediaTimes(pos, live.length);
        };
        update();
        tick(bar, update, () => live.playing && livePosition(live, Date.now()) < live.length);
        box.add_child(bar);
        box.add_child(times);
        return box;
    }

    // The player's own buttons (back, play/pause, next): round 32, play/pause cream
    _transport(a) {
        const row = new St.BoxLayout({style_class: 'buoy-home-media-transport', y_align: Clutter.ActorAlign.START});
        for (const act of a.actions ?? []) {
            const main = act.id === 'playpause';
            const b = new St.Button({
                style_class: `buoy-round${main ? ' buoy-round-main' : ''}`,
                child: new St.Icon({...iconProps(act.icon), icon_size: 16}),
                can_focus: true, accessible_name: act.label ?? act.id, width: 32, height: 32,
            });
            b.connect('clicked', () => a.onAction?.(act.id));
            row.add_child(b);
        }
        return row;
    }

    destroy() {
        this.actor.destroy();
    }
}

function ellipsized(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
