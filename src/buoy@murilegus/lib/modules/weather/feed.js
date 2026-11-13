import Geoclue from 'gi://Geoclue';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {withPlace} from '../../kit/model/settings.js';
import {refreshMs} from './idle.js';
import {RETRY_MS, goodFix, keptReading, locateOutcome, nextFix, readInfo, shouldRetry, unitNames, useOwnInfo} from './read.js';

// As long as Geoclue may take for a first fix before this ask gives up (Wi-Fi scan, IP)
const LOCATE_TIMEOUT = 15;

// The one Geoclue ask running, whichever feed made it (the idle plan's, Home's, prefs'
// refresh): another feed that wants to locate meanwhile waits for its answer instead of
// asking too, so two asks never write the place or prefs' status over each other
// (2026-11-12). {ask, waiters: [function(moved)]}
let shared = null;

// Buoy's own GWeather.Info (read.js useOwnInfo), one for every feed (2026-11-13, Ethan: Home's
// weather tile came and went): Home makes a feed each time it opens, and a fresh Info has no
// weather until its fetch comes back — so the tile was missing, then came and made Home lay
// out again. Kept with its last weather between feeds, as Shell keeps its client's; it never
// fetches by itself (each update() is a feed's ask, only while shown: rule 8). Made for a
// place, replaced when Buoy's place changes, dropped on disable (source.js) and when its
// place is not wanted any more. {info, id, last, loading, users: Set<function()>}
let ownInfo = null;

// The last good reading, whichever feed read it (read.js keptReading): a failed fetch leaves
// GWeather empty, and this is shown instead while it is recent. {state, at, key}
let lastGood = null;

function ownFor(place) {
    if (ownInfo?.info.location?.equal?.(place))
        return ownInfo;
    dropOwnInfo();
    const info = new GWeather.Info({
        application_id: 'org.gnome.Shell',
        contact_info: 'https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/HEAD/gnome-shell.doap',
        enabled_providers: GWeather.Provider.METAR | GWeather.Provider.MET_NO | GWeather.Provider.OWM,
    });
    info.set_location(place);
    const o = {info, id: 0, last: 0, loading: false, users: new Set()};
    o.id = info.connect_after('updated', () => {
        o.last = Date.now();
        o.loading = false;
        [...o.users].forEach(fn => fn());
    });
    ownInfo = o;
    return o;
}

/** On disable (the weather module's source): Buoy's own Info and the last good reading go. */
export function dropWeather() {
    dropOwnInfo();
    lastGood = null;
}

// Buoy's own Info goes (disable; a new place)
function dropOwnInfo() {
    const o = ownInfo;
    ownInfo = null;
    if (!o)
        return;
    o.info.disconnect(o.id);
    o.info.abort?.();
    o.users.clear();
}

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
 *   (`_onLocationsChanged`) and fetches. An IP-only fix (≥ 20 km) waits for a better one
 *   and never replaces a place found by a good fix (`_locate`, 2026-11-12, #188). Geoclue
 *   is stopped as soon as the ask ends: nothing tracks the position between asks. Needs
 *   Location Services (`org.gnome.system.location`); off, the last place stays. Off, the
 *   place is the city picked in prefs.
 * - For prefs' place row (2026-11-12): how each locate ended (`idle-weather-located`:
 *   wifi, ip, kept, none) and when, and when the weather last came
 *   (`idle-weather-updated-at`), written to Buoy's settings. `refreshNow` is prefs' refresh
 *   button (source.js): locate and fetch once, then call back.
 * - When Shell's client locates on its own (GNOME Weather installed: `_useAutoLocation`) it
 *   ignores `locations` and keeps whatever Geoclue gave it — often an IP guess, Hanoi for a
 *   Vietnamese ISP — so the plan read a place Buoy had not chosen (2026-11-13, Ethan). Then,
 *   when the client's place is not Buoy's (read.js useOwnInfo), the feed reads a GWeather.Info
 *   of its own for Buoy's place, made as Shell makes its own, fetched on the same terms
 *   (only while shown) — one for every feed, kept with its last weather (ownInfo, below).
 */
export class WeatherFeed {
    /** @param {function(): void} onChanged  the state changed: present again */
    constructor(onChanged) {
        this._onChanged = onChanged;
        this._timer = 0;
        this._every = 0;
        this._updatedAt = 0;              // the weather's time last written for prefs
        this._asked = 0;                  // refreshNow: the time of the ask (whole seconds)
        this._waitFetch = null;           // refreshNow's callback, until new weather comes
        this._automatic = true;
        this._locating = null;            // the Geoclue ask running (_locate)
        this._waiting = null;             // waiting for another feed's ask (shared)
        this._retryId = 0;                // the second ask, RETRY_MS after one with no Wi-Fi fix
        this._retried = false;            //   it already came in this round
        this._retryDone = null;           // source.js waits for it
        this._weakPlace = null;           // placeKey of the place an IP-only fix wrote last
        this._client = Main.panel.statusArea.dateMenu?._weatherItem?._weatherClient ?? null;
        this._own = null;                 // the shared own Info while this feed reads it (_pick)
        this._ownRead = () => this._read();
        this._shown = false;
        // when the client last had news; its own _lastUpdate (set on every `updated`)
        // when it already has data, so enabling does not fetch what it fetched a minute ago
        const last = this._client?.info?.is_valid?.() ? this._client._lastUpdate?.to_unix?.() : 0;
        this._fetched = last > 0 ? last * 1000 : 0;
        this.state = null;
        this._client?.connectObject('changed', () => this._read(), this);
        // the user's units (GNOME Weather's keys): read again when they change
        this._units = settingsOf('org.gnome.GWeather4');
        this._units?.connectObject('changed', () => this._read(), this);
        // Buoy's place (first in `locations`): whose weather to read may change with it
        this._places = settingsOf('org.gnome.shell.weather');
        this._places?.connectObject('changed::locations', () => this._read(), this);
        this._read(false);
    }

    // Shell's client, or Buoy's own Info while the client is somewhere else (read.js
    // useOwnInfo); the own one is made here and fetched only while shown
    _pick() {
        const client = this._client;
        const place = firstPlace();
        let apart = null;
        try {
            const at = client?.hasLocation ? client.info.location : null;
            if (place && at)
                apart = place.get_distance(at);
        } catch {}
        const own = client !== null && useOwnInfo({
            clientAuto: client._useAutoLocation === true, hasPlace: place !== null, apartKm: apart,
        });
        if (!own) {
            this._leaveOwn();
            if (ownInfo && !ownInfo.users.size)
                dropOwnInfo();            // the client is at Buoy's place again
            return;
        }
        const o = ownFor(place);
        if (this._own === o)
            return;
        this._leaveOwn();
        this._own = o;
        o.users.add(this._ownRead);
        this._fetched = o.last;           // what it has; none yet for this place: the show asks
        if (this._shown && !o.last && !o.loading)
            this._update();
    }

    _leaveOwn() {
        this._own?.users.delete(this._ownRead);
        this._own = null;
    }

    // what the plan reads now: {hasLocation, loading, info, lastMs}
    _src() {
        const o = this._own;
        if (o)
            return {hasLocation: true, loading: o.loading, info: o.info, lastMs: o.last};
        const c = this._client;
        if (!c)
            return null;
        return {hasLocation: c.hasLocation, loading: c.loading, info: c.info, lastMs: (c._lastUpdate?.to_unix?.() ?? 0) * 1000};
    }

    // ask whichever the plan reads for news
    _update() {
        const o = this._own;
        if (o) {
            if (o.loading)
                return;                   // another feed's fetch is on its way
            o.loading = true;
            o.info.update();
            return;
        }
        this._client?.update();
    }

    _read(notify = true) {
        this._pick();
        const src = this._src();
        let state = null;
        if (src?.hasLocation) {
            const info = src.info;
            if (!src.loading && info.is_valid()) {
                // the weather's own time, not this read's: a feed made now (Home opens) must
                // still see an old reading as old and ask, on `idle-weather-refresh`
                if (src.lastMs > this._fetched)
                    this._fetched = src.lastMs;
                this._recordUpdate(src);
            }
            const u = units(this._units);
            const fresh = readInfo(info, {now: Date.now(), units: u, place: placeOf(info.location)});
            // GWeather empties the reading as a fetch starts and leaves it empty when one
            // fails: the last good one stays while it is recent (read.js keptReading)
            const kept = keptReading({
                fresh: fresh && !src.loading ? fresh : null, loading: src.loading, kept: lastGood,
                key: readingKey(info.location, u), at: src.lastMs, now: Date.now(),
                maxAgeMs: 2 * (this._every || refreshMs({})),
            });
            lastGood = kept.kept;
            state = kept.state;
        }
        const same = JSON.stringify(state) === JSON.stringify(this.state);
        this.state = state;
        if (notify && !same)
            this._onChanged();
    }

    // The weather's own time (the client's last `updated`), for prefs' row; written once per
    // new reading, whichever feed sees it
    _recordUpdate(src) {
        const at = src.lastMs;
        if (at > 0 && at !== this._updatedAt) {
            this._updatedAt = at;
            const settings = buoySettings();
            if (settings && settings.get_int64('idle-weather-updated-at') !== at)
                settings.set_int64('idle-weather-updated-at', at);
        }
        if (this._waitFetch && at >= this._asked)
            this._fetchDone();
    }

    _fetchDone() {
        const done = this._waitFetch;
        this._waitFetch = null;
        done?.();
    }

    /**
     * Prefs' refresh (source.js): where we are again, Wi-Fi first (with "Use my location"),
     * then the weather, once; `done` when new weather came (or the caller's cap ends it).
     *
     * @param {object} opts  the plan's keys' values
     * @param {function():void} done
     */
    refreshNow(opts, done) {
        if (!this._client) {
            done();
            return;
        }
        this._automatic = opts['idle-weather-automatic'] !== false;
        this._fetched = Date.now();
        this._asked = Math.floor(Date.now() / 1000) * 1000;   // the client's time is whole seconds
        this._waitFetch = done;
        if (!this._automatic || !locationOn()) {
            this._update();
            return;
        }
        this._locate(moved => {
            if (!moved)
                this._update();
        });
    }

    /**
     * @param {boolean} shown  the idle pill is on screen with this plan
     * @param {object} [opts]  the plan's keys' values
     */
    shown(shown, opts = {}) {
        this._stopTimer();
        this._shown = shown;
        if (!shown && this._retryId && !this._retryDone) {
            GLib.source_remove(this._retryId);   // hidden: nothing runs (rule 8); source.js's waits
            this._retryId = 0;
        }
        if (!shown || !this._client)
            return;
        this._every = refreshMs(opts);
        this._automatic = opts['idle-weather-automatic'] !== false;
        const age = Date.now() - this._fetched;
        if (age >= this._every || (this._automatic && !this._src()?.hasLocation)) {
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
        this._retried = false;            // a new round: one retry again
        if (!this._automatic || !locationOn()) {
            this._update();
            return;
        }
        this._locate(moved => {
            if (!moved)
                this._update();
        });
    }

    /**
     * Where we are, from Geoclue (SPEC §2a weather, 2026-11-12, #188); read.js nextFix
     * decides on each fix. A good one is the place at once. An IP-only one (20 km or
     * coarser: usual right after login, and Hanoi for any Vietnamese ISP) makes the ask keep
     * the client and wait on Simple's `notify::location` (as Shell's own misc/weather.js
     * `_updateLocationMonitoring` does) for a better one, up to LOCATE_TIMEOUT. Time up with
     * only IP-only fixes: one never replaces a place from a good fix or the user; with no
     * place, or one that was itself an IP guess, it is the place as the last resort.
     * Geoclue is stopped as soon as the ask ends (stopAsk).
     *
     * @param {function(boolean): void} done  whether the place changed
     */
    _locate(done) {
        if (this._locating || this._waiting)
            return;
        if (shared) {                     // another feed is asking: its answer is ours
            this._waiting = moved => {
                this._waiting = null;
                done(moved);
            };
            shared.waiters.push(this._waiting);
            return;
        }
        const ask = {cancel: new Gio.Cancellable(), simple: null, held: null, notifyId: 0, timeout: 0, done};
        this._locating = ask;
        shared = {ask, waiters: []};
        ask.timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, LOCATE_TIMEOUT, () => {
            ask.timeout = 0;
            if (ask.simple)
                this._onFix(ask, null);   // fixes came, none good: decide with the one held
            else
                ask.cancel.cancel();      // none yet: Simple.new fails, the place stays
            return GLib.SOURCE_REMOVE;
        });
        Geoclue.Simple.new('org.gnome.Shell', Geoclue.AccuracyLevel.CITY, ask.cancel, (_o, res) => {
            try {
                ask.simple = Geoclue.Simple.new_finish(res);
            } catch (e) {
                // denied (Location Services off for this user), no fix in time, no
                // Geoclue: the last place stays, and prefs says why
                console.debug(`Buoy: weather: no location: ${e.message}`);
            }
            if (this._locating !== ask) {
                stopAsk(ask);                 // destroyed meanwhile
                return;
            }
            if (!ask.simple) {
                recordLocate('none');
                this._armRetry('none');
                this._endLocate(ask, false);
                return;
            }
            ask.notifyId = ask.simple.connect('notify::location', s => this._onFix(ask, fixOf(s)));
            this._onFix(ask, fixOf(ask.simple));
        });
    }

    /**
     * @param {object} ask  the running ask (_locate)
     * @param {?import('./read.js').Fix} fix  the fix just given; null: the time is up
     */
    _onFix(ask, fix) {
        if (this._locating !== ask)
            return;
        const step = nextFix(fix, {held: ask.held, final: !fix, previous: this._previousPlace()});
        ask.held = step.held;
        if (!step.done)
            return;
        recordLocate(locateOutcome(step));
        this._armRetry(locateOutcome(step));
        let moved = false;
        if (step.use) {
            try {
                const city = GWeather.Location.get_world().find_nearest_city(step.use.latitude, step.use.longitude);
                moved = setPlace(city);
                // a place from an IP guess: a later IP-only fix may still replace it
                this._weakPlace = city && !goodFix(step.use) ? placeKey(city.serialize()) : null;
            } catch (e) {
                console.debug(`Buoy: weather: no place for the fix: ${e.message}`);
            }
        }
        this._endLocate(ask, moved);
    }

    // where the place first in `locations` came from (read.js nextFix `previous`): none,
    // the IP-only fix this feed wrote last ('weak'), else a good fix or the user ('good')
    _previousPlace() {
        const first = placeList()[0];
        if (!first)
            return null;
        return this._weakPlace && placeKey(first) === this._weakPlace ? 'weak' : 'good';
    }

    _endLocate(ask, moved) {
        stopAsk(ask);
        if (this._locating !== ask)
            return;
        this._locating = null;
        ask.done(moved);
        answerWaiters(ask, moved);
    }

    // No Wi-Fi fix: ask once more in RETRY_MS (read.js shouldRetry), the scan is usually there
    // by then; the weather follows a new place, or is asked for again
    _armRetry(outcome) {
        if (this._retryId || !shouldRetry(outcome, this._retried))
            return;
        this._retryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, RETRY_MS / 1000, () => {
            this._retryId = 0;
            this._retried = true;
            this._locate(moved => {
                if (!moved)
                    this._update();
                const done = this._retryDone;
                this._retryDone = null;
                done?.();
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    /** @returns {boolean} a second ask is due or running (source.js keeps the feed for it) */
    get retryPending() {
        return this._retryId !== 0 || this._retryDone !== null;
    }

    /** @param {function():void} fn  called once the second ask ended */
    whenRetried(fn) {
        this._retryDone = fn;
    }

    _stopTimer() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
    }

    destroy() {
        this._stopTimer();
        if (this._retryId)
            GLib.source_remove(this._retryId);
        this._retryId = 0;
        this._retryDone = null;
        this._waitFetch = null;
        this._units?.disconnectObject(this);
        this._units = null;
        this._places?.disconnectObject(this);
        this._places = null;
        this._leaveOwn();
        const ask = this._locating;
        this._locating = null;
        if (ask) {
            stopAsk(ask);
            answerWaiters(ask, false);    // the others ask again on their next turn
        }
        if (this._waiting && shared)
            shared.waiters = shared.waiters.filter(w => w !== this._waiting);
        this._waiting = null;
        this._client?.disconnectObject(this);
        this._client = null;
        this._onChanged = () => {};
        this.state = null;
    }
}

// The shared ask ended: the feeds that waited for it get its answer
function answerWaiters(ask, moved) {
    if (shared?.ask !== ask)
        return;
    const {waiters} = shared;
    shared = null;
    waiters.forEach(w => w(moved));
}

// Buoy's settings, to write what prefs' place row reads (the feed has only the plan's
// values); null if the extension is not found
function buoySettings() {
    try {
        return Extension.lookupByURL(import.meta.url)?.getSettings() ?? null;
    } catch {
        return null;
    }
}

// how a locate ended, and when (prefs' place row)
function recordLocate(how) {
    const settings = buoySettings();
    if (!settings)
        return;
    settings.set_string('idle-weather-located', how);
    settings.set_int64('idle-weather-located-at', Date.now());
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
    const list = placeList();
    const place = city.serialize();
    if (list.length && placeKey(list[0]) === placeKey(place))
        return false;
    new Gio.Settings({schema_id: 'org.gnome.shell.weather'})
        .set_value('locations', new GLib.Variant('av', withPlace(list, place, placeKey)));
    return true;
}

// Buoy's place: the first of `locations`, as Shell's client reads it (_onLocationsChanged)
function firstPlace() {
    const first = placeList()[0];
    try {
        return first ? GWeather.Location.get_world().deserialize(first) : null;
    } catch {
        return null;
    }
}

// `org.gnome.shell.weather` `locations` (av), one level unpacked
function placeList() {
    const settings = new Gio.Settings({schema_id: 'org.gnome.shell.weather'});
    return /** @type {GLib.Variant[]} */ (settings.get_value('locations').deepUnpack());
}

// a serialized GWeather.Location as `locations` compares them
const placeKey = v => v.print(true);

/**
 * End a Geoclue ask in whatever state it is: its timeout removed, Simple.new cancelled if
 * still running, its `notify::location` disconnected, Geoclue stopped (nothing tracks the
 * position between two asks). Safe to call twice.
 *
 * @param {object} ask  _locate's
 */
function stopAsk(ask) {
    if (ask.timeout)
        GLib.source_remove(ask.timeout);
    ask.timeout = 0;
    ask.cancel.cancel();
    const simple = ask.simple;
    ask.simple = null;
    if (!simple)
        return;
    if (ask.notifyId)
        simple.disconnect(ask.notifyId);
    ask.notifyId = 0;
    simple.get_client()?.call_stop(null, null);
}

// Geoclue.Simple's location (a LocationProxy: Latitude, Longitude, Accuracy in metres) as
// read.js's plain Fix
function fixOf(simple) {
    const loc = simple?.get_location();
    return loc ? {latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy} : null;
}

// A reading's place and units: a kept one is shown again only for both the same
function readingKey(loc, u) {
    let place = '';
    try {
        place = loc?.serialize?.()?.print(true) ?? '';
    } catch {}
    return `${place}|${u.display}|${u.speed}`;
}

function settingsOf(id) {
    return Gio.SettingsSchemaSource.get_default()?.lookup(id, true) ? new Gio.Settings({schema_id: id}) : null;
}

// The units the user chose in GNOME Weather's keys (read.js unitNames), else the locale's
// (Automatic): GWeather's DEFAULT reads only the locale. to_string names the speed unit ("km/h")
function units(settings) {
    const names = unitNames(settings?.get_string('temperature-unit'), settings?.get_string('speed-unit'));
    const speed = GWeather.SpeedUnit[names.speed] ?? GWeather.SpeedUnit.DEFAULT;
    const speedLabel = GWeather.SpeedUnit.to_string(speed);
    return {
        display: GWeather.TemperatureUnit[names.temperature] ?? GWeather.TemperatureUnit.DEFAULT,
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
