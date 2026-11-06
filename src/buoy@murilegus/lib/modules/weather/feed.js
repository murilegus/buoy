import Geoclue from 'gi://Geoclue';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {withPlace} from '../../kit/settings.js';
import {refreshMs} from './idle.js';
import {readInfo} from './read.js';

// As long as Geoclue may take for a first fix before this ask gives up (Wi-Fi scan, IP)
const LOCATE_TIMEOUT = 15;

/**
 * The weather plan's feed (ARCHITECTURE "feed.js"): what idle.js shows, read from GNOME's
 * own weather client — the date menu's (ui/dateMenu.js WeatherSection._weatherClient, a
 * misc/weather.js WeatherClient), so the location is the one the clock's popover shows
 * and no second GWeather.Info, Geoclue client or permission lookup runs. A client of our
 * own could not be dropped on disable: WeatherClient has no destroy and keeps its
 * AppSystem `installed-changed` handler, its Geoclue client and its settings.
 *
 * - Its `changed` signal re-reads the state (an update, the location, the loading flag),
 *   whoever asked for it (the date menu asks each time its popover opens).
 * - Asking for news (WeatherClient.update, a network fetch) happens only while the idle
 *   pill shows the weather (rule 8): at once when the last data is older than
 *   `idle-weather-refresh`, then every `idle-weather-refresh`. Hidden → no timer.
 * - No client (another Shell's date menu) or no location → state null: the plan shows
 *   nothing and the pill keeps only the light, as with Show set to nothing.
 * - "Use my location" (`idle-weather-automatic`, 2026-11-06, Ethan: GNOME Weather is not
 *   installed on Ubuntu, and without it Shell's client never locates — misc/weather.js
 *   `_useAutoLocation` wants org.gnome.Weather's permission): each ask first asks
 *   Geoclue once, as `org.gnome.Shell` (a system app in /etc/geoclue/geoclue.conf, as
 *   Shell's own client does), at city accuracy, and writes the nearest GWeather city first
 *   in `org.gnome.shell.weather` `locations` when it changed — the client follows that key
 *   (`_onLocationsChanged`) and fetches. Geoclue is stopped right after: nothing tracks the
 *   position between asks. Needs Location Services (`org.gnome.system.location`); off,
 *   the last place stays. Off, the place is the city picked in prefs.
 */
export class WeatherFeed {
    /** @param {function(): void} onChanged  the state changed: present again */
    constructor(onChanged) {
        this._onChanged = onChanged;
        this._timer = 0;
        this._every = 0;
        this._automatic = true;
        this._locating = null;            // the Gio.Cancellable of a Geoclue ask running
        this._client = Main.panel.statusArea.dateMenu?._weatherItem?._weatherClient ?? null;
        // when the client last had news; its own _lastUpdate (set on every `updated`)
        // when it already has data, so enabling does not fetch what it fetched a minute ago
        const last = this._client?.info?.is_valid?.() ? this._client._lastUpdate?.to_unix?.() : 0;
        this._fetched = last > 0 ? last * 1000 : 0;
        this.state = null;
        this._client?.connectObject('changed', () => this._read(), this);
        this._read(false);
    }

    _read(notify = true) {
        const client = this._client;
        let state = null;
        if (client?.hasLocation) {
            const info = client.info;
            if (!client.loading && info.is_valid())
                this._fetched = Date.now();
            state = readInfo(info, {now: Date.now(), units: units(), place: placeOf(info.location)});
            // while loading the info keeps the last values; GWeather drops them on a
            // location change (info.set_location), which reads as no data — right then
            if (!state && client.loading && this.state)
                return;
        }
        const same = JSON.stringify(state) === JSON.stringify(this.state);
        this.state = state;
        if (notify && !same)
            this._onChanged();
    }

    /**
     * @param {boolean} shown  the idle pill is on screen with this plan
     * @param {object} [opts]  the plan's keys' values
     */
    shown(shown, opts = {}) {
        this._stopTimer();
        if (!shown || !this._client)
            return;
        this._every = refreshMs(opts);
        this._automatic = opts['idle-weather-automatic'] !== false;
        const age = Date.now() - this._fetched;
        if (age >= this._every || (this._automatic && !this._client.hasLocation)) {
            this._ask();
            this._arm(this._every);
        } else {
            this._arm(this._every - age);
        }
    }

    _arm(ms) {
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Math.max(1, Math.ceil(ms / 1000)), () => {
            this._timer = 0;
            this._ask();
            this._arm(this._every);
            return GLib.SOURCE_REMOVE;
        });
    }

    // Ask for news: where we are first, with "Use my location"; a new place makes the
    // client fetch on its own, the same place is an update
    _ask() {
        this._fetched = Date.now();       // asked: the next ask is a full interval away
        if (!this._automatic || !locationOn()) {
            this._client?.update();
            return;
        }
        this._locate(moved => {
            if (!moved)
                this._client?.update();
        });
    }

    /** @param {function(boolean): void} done  whether the place changed */
    _locate(done) {
        if (this._locating)
            return;
        const cancel = new Gio.Cancellable();
        this._locating = cancel;
        const timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, LOCATE_TIMEOUT, () => {
            cancel.cancel();
            return GLib.SOURCE_REMOVE;
        });
        Geoclue.Simple.new('org.gnome.Shell', Geoclue.AccuracyLevel.CITY, cancel, (_o, res) => {
            if (!cancel.is_cancelled())
                GLib.source_remove(timeout);
            let simple = null, moved = false;
            try {
                simple = Geoclue.Simple.new_finish(res);
                const {latitude, longitude} = simple.get_location();
                moved = setPlace(GWeather.Location.get_world().find_nearest_city(latitude, longitude));
            } catch (e) {
                // denied (Location Services off for this user), no fix in time, no
                // Geoclue: the last place stays, and prefs says why
                console.debug(`Buoy: weather: no location: ${e.message}`);
            }
            // stop it now: nothing tracks the position between two asks
            simple?.get_client()?.call_stop(null, null);
            if (this._locating !== cancel)
                return;                       // destroyed meanwhile
            this._locating = null;
            done(moved);
        });
    }

    _stopTimer() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
    }

    destroy() {
        this._stopTimer();
        this._locating?.cancel();
        this._locating = null;
        this._client?.disconnectObject(this);
        this._client = null;
        this._onChanged = () => {};
        this.state = null;
    }
}

function locationOn() {
    return new Gio.Settings({schema_id: 'org.gnome.system.location'}).get_boolean('enabled');
}

/**
 * Put a city first in Shell's weather locations (what GNOME Weather does when you pick
 * one): the date menu's client follows. Nothing is written when it is already first.
 *
 * @param {?GWeather.Location} city
 * @returns {boolean} the place changed
 */
function setPlace(city) {
    if (!city)
        return false;
    const settings = new Gio.Settings({schema_id: 'org.gnome.shell.weather'});
    const list = settings.get_value('locations').deepUnpack();
    const place = city.serialize();
    const key = v => v.print(true);
    if (list.length && key(list[0]) === key(place))
        return false;
    settings.set_value('locations', new GLib.Variant('av', withPlace(list, place, key)));
    return true;
}

// GWeather's units, the user's (org.gnome.GWeather4, else the locale's): DEFAULT resolves
// to one of them; to_string(DEFAULT) names it ("km/h")
function units() {
    const speed = GWeather.SpeedUnit.DEFAULT;
    const speedLabel = GWeather.SpeedUnit.to_string(speed);
    return {
        display: GWeather.TemperatureUnit.DEFAULT,
        celsius: GWeather.TemperatureUnit.CENTIGRADE,
        speed,
        speedLabel,
        beaufort: speedLabel === GWeather.SpeedUnit.to_string(GWeather.SpeedUnit.BFT),
    };
}

// As the date menu names it (dateMenu.js WeatherSection._findBestLocationName): a city by
// its name, an automatic location by the nearest city when its name contains it
function placeOf(loc) {
    if (!loc)
        return null;
    try {
        const name = loc.get_name();
        if (loc.get_level() === GWeather.LocationLevel.CITY || !loc.has_coords())
            return name;
        const city = GWeather.Location.get_world().find_nearest_city(...loc.get_coords());
        const cityName = city?.get_name();
        return cityName && name.includes(cityName) ? cityName : name;
    } catch {
        return null;
    }
}
