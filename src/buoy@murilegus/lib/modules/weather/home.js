import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {WeatherFeed} from './feed.js';
import {card, keys} from './idle.js';

const ICON = 36;
const WEATHER_APP = 'org.gnome.Weather.desktop';

/**
 * Home's weather (SPEC §3, 2026-11-08): the pill's icon and temperature, the condition,
 * then the place and the details the pill's compact gives (idle.js `card`). Its data is the
 * weather plan's feed (feed.js: the date menu's weather client), made with the block and
 * gone with it — Home's blocks live while the island is open — and told it shows, so a
 * stale reading is fetched once and then on `idle-weather-refresh` while Home stays open
 * (rule 8: nothing while closed). No weather (no place, nothing fetched yet) → not ready,
 * and Home leaves the card out until the feed's change brings it.
 *
 * A click opens GNOME Weather when it is installed (Ubuntu ships without it) and closes the
 * island; without it the card is not a button.
 */
export class WeatherHome {
    /**
     * @param {object} [kit]
     * @param {function():void} [kit.close]  close the island
     * @param {function():void} [kit.changed]  `ready` flipped: Home lays out again
     * @param {?Gio.Settings} [kit.settings]  Buoy's: the plan's keys (refresh, Use my location)
     */
    constructor({close = null, changed = null, settings = null} = {}) {
        this._close = close;
        this._changed = changed;
        this._app = Shell.AppSystem.get_default().lookup_app(WEATHER_APP);
        this._box = new St.BoxLayout({style_class: 'buoy-home-weather', x_expand: true});
        this.actor = this._app
            ? new St.Button({
                style_class: 'buoy-home-card buoy-home-hit', child: this._box, x_expand: true,
                can_focus: true, x_align: Clutter.ActorAlign.FILL,
            })
            : new St.Bin({style_class: 'buoy-home-card', child: this._box, x_expand: true, x_align: Clutter.ActorAlign.FILL});
        if (this._app) {
            this.actor.connect('clicked', () => {
                this._app.activate();
                this._close?.();
            });
        }
        this._card = null;
        this._feed = new WeatherFeed(() => this._read());
        const opts = {};
        for (const key of keys)
            opts[key] = settings ? settings.get_value(key).deepUnpack() : undefined;
        this._read(false);
        this._feed.shown(true, opts);
    }

    /** @returns {boolean} weather to show */
    get ready() {
        return this._card !== null;
    }

    _read(notify = true) {
        const was = this.ready;
        this._card = card(this._feed?.state ?? null);
        this._render();
        if (notify && was !== this.ready)
            this._changed?.();
    }

    _render() {
        this._box.destroy_all_children();
        const c = this._card;
        if (!c)
            return;
        this.actor.accessible_name = c.accessibleName;
        const art = typeof c.leading === 'object' ? c.leading.art : null;
        const symbolic = typeof c.leading === 'object' ? c.leading.icon : c.leading;
        this._box.add_child(new St.Icon({
            style_class: 'buoy-home-weather-icon', icon_size: ICON, y_align: Clutter.ActorAlign.CENTER,
            ...art ? {gicon: new Gio.FileIcon({file: Gio.File.new_for_uri(art)})} : {icon_name: symbolic},
            fallback_icon_name: symbolic || 'weather-overcast-symbolic',
        }));
        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        const top = new St.BoxLayout({style_class: 'buoy-home-weather-top'});
        top.add_child(new St.Label({text: c.temp, style_class: 'buoy-home-temp', y_align: Clutter.ActorAlign.CENTER}));
        if (c.condition)
            top.add_child(ellipsized(c.condition, 'buoy-home-title'));
        text.add_child(top);
        // one line, so Up next keeps its room under it: the place, then the details
        const sub = [c.place, c.detail].filter(Boolean).join(' · ');
        if (sub)
            text.add_child(ellipsized(sub, 'buoy-home-subtitle'));
        this._box.add_child(text);
    }

    destroy() {
        this._feed?.destroy();
        this._feed = null;
        this._changed = null;
        this.actor.destroy();
    }
}

function ellipsized(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
