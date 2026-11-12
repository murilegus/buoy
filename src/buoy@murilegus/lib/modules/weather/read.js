/**
 * GWeather.Info → the weather plan's plain state (idle.js). Pure: it only calls the
 * getters of the info it is given and takes GWeather's units as arguments, so a fake info
 * tests it without a network (tests/weather.test.js).
 *
 * Values come from the `get_value_*` getters, not the formatted strings: those keep a
 * decimal ("84.2 °F", "5.4 mph"); the plan rounds as the date menu's forecast does.
 */

/**
 * @typedef {object} Units
 * @property {number} display   GWeather.TemperatureUnit.DEFAULT (the user's)
 * @property {number} celsius   GWeather.TemperatureUnit.CENTIGRADE
 * @property {number} speed     GWeather.SpeedUnit.DEFAULT
 * @property {string} speedLabel  GWeather.SpeedUnit.to_string(DEFAULT): "km/h"
 * @property {boolean} beaufort  the default speed unit is Beaufort
 */

const HOUR = 60 * 60 * 1000;

const TEMPS = ['default', 'kelvin', 'centigrade', 'fahrenheit'];
const SPEEDS = ['default', 'ms', 'kph', 'mph', 'knots', 'bft'];

/**
 * The units the user chose, by GWeather's enum names. GWeather's DEFAULT comes from the
 * locale only (an en_US session gets °F and mph); the choice lives in GNOME Weather's own
 * keys, `org.gnome.GWeather4` `temperature-unit` and `speed-unit`, which the app reads and
 * passes in, as Buoy does now (2026-11-06, Ethan: °C set there, the pill showed °F). Buoy's
 * first enable sets them to °C and km/h where the user never had (kit/model/settings.js
 * GNOME_WEATHER); `default` is Automatic in prefs: the locale's.
 *
 * @param {*} temperature  `temperature-unit`
 * @param {*} speed  `speed-unit`
 * @returns {{temperature: string, speed: string}} e.g. {temperature: 'CENTIGRADE', speed: 'KPH'};
 *   'DEFAULT' (the locale's) for `default`, an unknown or missing value
 */
export function unitNames(temperature, speed) {
    const pick = (v, list) => (list.includes(v) ? v : 'default').toUpperCase();
    return {temperature: pick(temperature, TEMPS), speed: pick(speed, SPEEDS)};
}

const value = (info, getter, ...args) => {
    try {
        const [ok, ...rest] = info[getter](...args);
        return ok ? rest : null;
    } catch {
        return null;
    }
};
const finite = v => typeof v === 'number' && Number.isFinite(v);

/**
 * The first forecast after now and within the hour (as the date menu, dateMenu.js
 * _getInfos: a timestamp of 0 is "never updated", earlier ones are skipped).
 *
 * @param {object[]} list  GWeather.Info get_forecast_list()
 * @param {number} now  ms
 * @param {Units} units
 * @returns {?{at: number, tempC: ?number, icon: ?string}}
 */
export function nextHour(list, now, units) {
    for (const f of Array.isArray(list) ? list : []) {
        const [ts] = value(f, 'get_value_update') ?? [0];
        const at = finite(ts) ? ts * 1000 : 0;
        if (at <= now)
            continue;
        if (at - now > HOUR)
            return null;
        const [tempC] = value(f, 'get_value_temp', units.celsius) ?? [null];
        let icon = null;
        try {
            icon = f.get_symbolic_icon_name() ?? null;
        } catch {}
        return {at, tempC: finite(tempC) ? tempC : null, icon};
    }
    return null;
}

/**
 * @param {?object} info  GWeather.Info
 * @param {object} opts
 * @param {number} opts.now  ms
 * @param {Units} opts.units
 * @param {?string} [opts.place]  the location's name (feed.js, as the date menu shows it)
 * @returns {?object} idle.js state, or null when the info has no current temperature
 */
export function readInfo(info, {now, units, place = null}) {
    if (!info || typeof info.is_valid !== 'function' || !info.is_valid())
        return null;
    const [temp] = value(info, 'get_value_temp', units.display) ?? [null];
    if (!finite(temp))
        return null;
    const [tempC] = value(info, 'get_value_temp', units.celsius) ?? [null];
    const [feels] = value(info, 'get_value_apparent', units.display) ?? [null];
    const wind = value(info, 'get_value_wind', units.speed);
    let humidity = null, icon = null, list = [];
    try {
        humidity = info.get_humidity();
        icon = info.get_symbolic_icon_name();
        list = info.get_forecast_list();
    } catch {}
    return {
        place: typeof place === 'string' && place ? place : null,
        temp,
        tempC: finite(tempC) ? tempC : null,
        feels: finite(feels) ? feels : null,
        icon: typeof icon === 'string' && icon ? icon : null,
        wind: wind && finite(wind[0])
            ? {speed: wind[0], unit: units.speedLabel, dir: wind[1], beaufort: units.beaufort}
            : null,
        // GWeather says "Unknown" (translated) when the provider gave none
        humidity: typeof humidity === 'string' && /\d/.test(humidity) ? humidity : null,
        next: nextHour(list, now, units),
        updated: now,
    };
}

// --- "Use my location": which Geoclue fix becomes the place (2026-11-12, #188) ----------------

/**
 * A fix this coarse or coarser is IP-only, in metres. Geoclue (2.7, BeaconDB) asks by IP
 * alone when the Wi-Fi interface is not ready or knows fewer than 2 access points
 * (`gclue_wifi_create_query`, `gclue_mozilla_create_query`) — usual right after login —
 * and that answer comes with 25 km; a Wi-Fi fix is tens of metres, a warm city-level one
 * a few km. Vietnamese ISP addresses resolve to Hanoi wherever you are.
 */
export const IP_ONLY_METRES = 20000;

/**
 * @typedef {object} Fix  a Geoclue location, read off its proxy
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} accuracy  metres (Geoclue's `Accuracy`)
 */

/**
 * @param {?Fix} fix
 * @returns {boolean} a usable position (finite coordinates)
 */
const placed = fix => finite(fix?.latitude) && finite(fix?.longitude);

/**
 * @param {?Fix} fix
 * @returns {boolean} good enough to be the place: an accuracy under IP_ONLY_METRES. A
 *   missing, NaN or negative accuracy says nothing, so it counts as IP-only.
 */
export function goodFix(fix) {
    const a = fix?.accuracy;
    return placed(fix) && finite(a) && a >= 0 && a < IP_ONLY_METRES;
}

/**
 * One step of a "Use my location" ask (modules/weather/feed.js `_locate`), pure: called with
 * each fix Geoclue gives (`Geoclue.Simple`'s first location, then each `notify::location`)
 * and once more, with no fix, when the ask's time is up.
 *
 * - A good fix is the place, at once; the ask ends.
 * - An IP-only fix is held (the finest of them) and the ask waits for a better one.
 * - Time up with only IP-only fixes: the held one never replaces a place found by a good
 *   fix (`previous` 'good': a Wi-Fi fix, or a city the user picked, which an IP guess is no
 *   better than). With no place at all, or one that was itself an IP guess, it is used as
 *   the last resort: a city in the right country beats no weather (2026-11-12, #188).
 *
 * @param {?Fix} fix  the fix just given; null when the time is up
 * @param {object} [ctx]
 * @param {?Fix} [ctx.held]  the IP-only fix held so far
 * @param {boolean} [ctx.final]  the time is up
 * @param {?('good'|'weak')} [ctx.previous]  where the place already first in `locations`
 *   came from: a good fix or the user ('good'), an IP-only fix ('weak'), none (null)
 * @returns {{use: ?Fix, held: ?Fix, done: boolean}} `use`: the fix to make the place (null:
 *   leave the place as it is); `held`: to pass to the next step; `done`: stop asking
 */
export function nextFix(fix, {held = null, final = false, previous = null} = {}) {
    if (goodFix(fix))
        return {use: fix, held: null, done: true};
    if (placed(fix) && (!placed(held) || finer(fix, held)))
        held = fix;
    if (!placed(held))
        held = null;
    if (!final)
        return {use: null, held, done: false};
    return {use: held && previous !== 'good' ? held : null, held, done: true};
}

/**
 * How an ask ended, for prefs' place row (`idle-weather-located`, 2026-11-12): a good fix
 * made the place ('wifi'), an IP guess did ('ip'), only IP-only fixes came and the place was
 * kept ('kept'), or nothing came ('none').
 *
 * @param {{use?: ?Fix, held?: ?Fix}} [step]  nextFix's last step
 * @returns {'wifi'|'ip'|'kept'|'none'}
 */
export function locateOutcome({use = null, held = null} = {}) {
    if (use)
        return goodFix(use) ? 'wifi' : 'ip';
    return held ? 'kept' : 'none';
}

/** A locate that found no Wi-Fi fix is asked once more this long after (2026-11-13). */
export const RETRY_MS = 2 * 60 * 1000;

/**
 * Whether to ask once more (2026-11-13, Ethan): Geoclue often answers by IP alone right after
 * login or resume — its Wi-Fi list from wpa_supplicant is still empty ("No WiFi networks
 * found"), or BeaconDB times out — and a couple of minutes later the scan is there. Once,
 * not again and again.
 *
 * @param {string} outcome  locateOutcome's
 * @param {boolean} retried  this was already the second ask
 * @returns {boolean}
 */
export function shouldRetry(outcome, retried) {
    return !retried && outcome !== 'wifi';
}

// a finer accuracy wins; a known one beats an unknown one; a tie goes to the newer fix
function finer(fix, than) {
    const a = finite(fix.accuracy) && fix.accuracy >= 0 ? fix.accuracy : Infinity;
    const b = finite(than.accuracy) && than.accuracy >= 0 ? than.accuracy : Infinity;
    return a <= b;
}
