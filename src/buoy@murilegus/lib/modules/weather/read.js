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
