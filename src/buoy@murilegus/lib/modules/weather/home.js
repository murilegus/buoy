import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {fallbackIcon} from '../../kit/ui/present/elements.js';
import {sinceLabel} from '../../kit/ui/home.js';

import {WeatherFeed} from './feed.js';
import {card, keys} from './idle.js';

/** The colour icon on a tile: 24, 2 past each side of the 20 cell (design/home). */
const TILE_ICON = 24;
/** On the wide tile: 48 (design/home "Quyết định"). */
const WIDE_ICON = 48;
const OVERCAST = 'weather-overcast-symbolic';
const WEATHER_APP = 'org.gnome.Weather.desktop';

/**
 * Home's weather glance (design/home, 2026-11-11): a tile with Buoy's colour icon, the
 * temperature and the condition; wide, the icon at 48 and "the place · feels like" under the
 * condition. Its data is the weather plan's feed (feed.js: the date menu's weather client),
 * made with the glance and gone with it — Home's glances live while the island is open — and
 * told it shows, so a stale reading is fetched once and then on `idle-weather-refresh` while
 * Home stays open (rule 8: nothing while closed). No weather → not ready, and Home leaves
 * the tile out until the feed's change brings it.
 *
 * A click opens GNOME Weather when it is installed (Ubuntu ships without it) and closes the
 * island; without it, nothing.
 */
export class WeatherGlance {
    /**
     * @param {object} [kit]
     * @param {function():void} [kit.close]  close the island
     * @param {function():void} [kit.changed]  the tile changed: Home lays out again
     * @param {?Gio.Settings} [kit.settings]  Buoy's: the plan's keys (refresh, Use my location)
     */
    constructor({close = null, changed = null, settings = null} = {}) {
        this._close = close;
        this._changed = changed;
        this._app = Shell.AppSystem.get_default().lookup_app(WEATHER_APP);
        this._card = null;
        this._at = null;          // the reading's own time: the tile's corner, "12 min ago"
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

    /** @returns {?object} the tile (kit/ui/home.js): icon, value, caption, detail */
    get tile() {
        const c = this._card;
        if (!c)
            return null;
        return {
            icon: this._icon(), iconSize: TILE_ICON, value: c.temp, caption: c.condition ?? c.place ?? '',
            detail: [c.place, c.detail].filter(Boolean).join(' · ') || null,
            since: this._at ?? undefined,
        };
    }

    // Buoy's colour SVG, the symbolic one as its fallback
    _icon() {
        const c = this._card;
        const art = typeof c.leading === 'object' ? c.leading.art : null;
        const symbolic = (typeof c.leading === 'object' ? c.leading.icon : c.leading) || OVERCAST;
        if (art)
            return new Gio.FileIcon({file: Gio.File.new_for_uri(art)});
        return fallbackIcon(symbolic);
    }

    /**
     * The wide tile: the icon at 48, the temperature, the condition, the place and details.
     *
     * @returns {?Clutter.Actor}
     */
    wide() {
        const c = this._card;
        if (!c)
            return null;
        const row = new St.BoxLayout({style_class: 'buoy-home-weather-wide', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        row.add_child(new St.Icon({
            icon_size: WIDE_ICON, y_align: Clutter.ActorAlign.CENTER,
            gicon: this._icon(), fallback_gicon: fallbackIcon(OVERCAST),
        }));
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        // the temperature, and how old the reading is at its right (design/home, 2026-11-13,
        // Ethan: in the top right corner, left empty by the tile; the lines below keep the
        // whole width)
        const first = new St.BoxLayout({x_expand: true});
        const temp = ellipsized(c.temp, 'buoy-home-tile-value');
        temp.x_expand = true;
        first.add_child(temp);
        if (Number.isFinite(this._at))
            first.add_child(sinceLabel(this._at));
        text.add_child(first);
        if (c.condition)
            text.add_child(ellipsized(c.condition, 'buoy-home-title'));
        const sub = [c.place, c.detail].filter(Boolean).join(' · ');
        if (sub)
            text.add_child(ellipsized(sub, 'buoy-home-tile-caption'));
        row.add_child(text);
        return row;
    }

    activate() {
        if (!this._app)
            return;
        this._app.activate();
        this._close?.();
    }

    _read(notify = true) {
        const before = JSON.stringify([this._card, this._at]);
        this._card = card(this._feed?.state ?? null);
        this._at = this._card ? this._feed?.at ?? null : null;
        if (notify && before !== JSON.stringify([this._card, this._at]))
            this._changed?.();
    }

    destroy() {
        this._feed?.destroy();
        this._feed = null;
        this._changed = null;
    }
}

function ellipsized(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
