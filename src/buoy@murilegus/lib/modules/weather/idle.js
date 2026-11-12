/**
 * The weather idle plan (SPEC §2a, FEATURES M3 "weather"): the condition icon and the
 * temperature in the idle pill; its compact (hover) adds what it feels like, the wind and
 * the humidity. Presentation only, pure (no St, no GWeather, no timer): feed.js reads
 * GNOME's weather client (the date menu's, same location) into the plain state below and
 * the kit hands it over as `ctx.data`.
 *
 * State (read.js `readInfo`), null while there is none (no location, offline, not loaded):
 *   {place, temp, tempC, feels?, icon, wind?: {speed, unit, dir, beaufort}, humidity?,
 *    next?: {at, tempC, icon}, updated}
 *   temp, feels  in the user's unit (GWeather's default: Weather's, else the locale's)
 *   tempC        the same in °C, for `relevance` (a 5 °C swing)
 *   wind.dir     GWeather.WindDirection (0 variable, 1 N … 16 NNW, -1 unknown)
 *   next         the first forecast within the next hour
 */

import {DEFAULT_STARTS, normaliseStarts} from '../../kit/model/daypart.js';

/** How often the client is asked again while the idle pill shows it, in minutes. */
export const REFRESH = Object.freeze({'30m': 30, '1h': 60});
export const DEFAULT_REFRESH = '30m';

/** This plan's own keys (ARCHITECTURE rule 9: shown under it on the Island page). */
export const keys = Object.freeze(['idle-weather-automatic', 'idle-weather-refresh']);

/** No wall clock: nothing here changes with the minute (kit/services/idle.js). */
export const ticks = false;

/**
 * @param {object} opts  this plan's keys' values
 * @returns {number} ms between two asks while the idle pill shows the weather
 */
export function refreshMs(opts) {
    const minutes = REFRESH[opts?.['idle-weather-refresh']] ?? REFRESH[DEFAULT_REFRESH];
    return minutes * 60 * 1000;
}

const isNum = v => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {*} t  a temperature in the user's unit
 * @returns {?string} "31°", "−4°" — rounded as the date menu's forecast (dateMenu.js
 *   _addForecasts), never "-0°"
 */
export function degrees(t) {
    if (!isNum(t))
        return null;
    const r = Math.round(t) || 0;
    return r < 0 ? `−${-r}°` : `${r}°`;
}

// GWeather's icon names (libgweather gweather-weather.c, the conditions' icons), without
// -symbolic and -night: the words GNOME's own Weather shows for them
const CONDITIONS = [
    ['weather-clear', 'Clear'],
    ['weather-few-clouds', 'Partly cloudy'],
    ['weather-overcast', 'Cloudy'],
    ['weather-fog', 'Fog'],
    ['weather-showers-scattered', 'Light rain'],
    ['weather-showers', 'Rain'],
    ['weather-snow', 'Snow'],
    ['weather-storm', 'Thunderstorm'],
    ['weather-windy', 'Windy'],
    ['weather-tornado', 'Tornado'],
    ['weather-severe-alert', 'Severe weather'],
];
const WET = new Set(['weather-showers-scattered', 'weather-showers', 'weather-snow', 'weather-storm']);

function baseOf(icon) {
    return typeof icon === 'string' ? icon.replace(/-symbolic$/, '').replace(/-night$/, '') : '';
}

/**
 * @param {*} icon  GWeather's (symbolic) icon name
 * @returns {?string} the condition in words, null for an icon it does not name
 */
export function conditionOf(icon) {
    const base = baseOf(icon);
    return CONDITIONS.find(([name]) => name === base)?.[1] ?? null;
}

/**
 * @param {*} icon
 * @returns {boolean} rain, snow or a storm
 */
export function isWet(icon) {
    return WET.has(baseOf(icon));
}

// GWeather.WindDirection, in its order: 0 variable, then 1 N … 16 NNW
const DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/**
 * @param {*} wind  {speed, unit, dir, beaufort}
 * @returns {?string} "NE 12 km/h", "Calm", "Force 4", "12 km/h" (no direction known)
 */
export function windText(wind) {
    if (!wind || !isNum(wind.speed) || wind.speed < 0)
        return null;
    const speed = Math.round(wind.speed);
    if (speed === 0)
        return 'Calm';
    const dir = Number.isInteger(wind.dir) ? DIRECTIONS[wind.dir - 1] ?? null : null;
    const amount = wind.beaufort ? `Force ${speed}` : `${speed} ${wind.unit ?? ''}`.trim();
    return dir ? `${dir} ${amount}` : amount;
}

const ICON = 'weather-overcast-symbolic';

// Our own colour icon per condition (icons/color/weather-<condition>.svg, 2026-11-06, Ethan: the
// symbolic ones read flat next to the clock's daypart icons): one family with the
// dayparts, drawn by scripts/icons.js (#131, palette A, none of the status colours). Night
// has its own only where GWeather has one (clear, few clouds).
export const ART = Object.freeze(CONDITIONS.map(([name]) => name.replace(/^weather-/, ''))
    .concat(['clear-night', 'few-clouds-night']));

/**
 * @param {*} icon  GWeather's (symbolic) icon name
 * @returns {?string} file URI of our colour icon for it, null for a condition we do not draw
 */
export function artFor(icon) {
    if (typeof icon !== 'string')
        return null;
    const name = icon.replace(/-symbolic$/, '').replace(/^weather-/, '');
    const art = ART.includes(name) ? name : name.replace(/-night$/, '');
    if (!ART.includes(art))
        return null;
    // the extension's root: this file is <root>/lib/modules/weather/idle.js (no URL in gjs)
    const root = import.meta.url.split('/').slice(0, -4).join('/');
    return `${root}/icons/color/weather-${art}.svg`;
}

/**
 * @param {object} ctx
 * @param {?object} ctx.data  the feed's state (read.js)
 * @returns {?object} presentation data for the idle pill: {leading, text, compact,
 *   accessibleName}; null while there is no weather (the pill shows nothing)
 */
export function present({data: weather} = {}) {
    const temp = degrees(weather?.temp);
    if (!temp)
        return null;
    const icon = typeof weather.icon === 'string' && weather.icon ? weather.icon : ICON;
    const condition = conditionOf(icon);
    // the colour icon, GNOME's symbolic one if it cannot load (or for an unknown condition)
    const art = artFor(icon);
    const leading = art ? {art, icon} : icon;
    const feels = degrees(weather.feels);
    const wind = windText(weather.wind);
    const humidity = typeof weather.humidity === 'string' && /\d/.test(weather.humidity) ? weather.humidity : null;
    const details = [
        feels && feels !== temp ? `Feels like ${feels}` : null,
        wind ? `Wind ${wind}` : null,
        humidity ? `Humidity ${humidity}` : null,
    ].filter(Boolean);
    return {
        leading,
        text: temp,
        compact: {
            leading,
            text: condition ? `${temp} · ${condition}` : temp,
            subtitle: details.length ? details.join(' · ') : null,
        },
        accessibleName: [weather.place, temp, condition].filter(Boolean).join(', '),
    };
}

/**
 * Home's weather block (SPEC §3, 2026-11-08): the same icon and temperature as the pill,
 * the condition beside it, and the place over the details the compact gives on hover.
 *
 * @param {?object} weather  the feed's state (read.js)
 * @returns {?{leading: (string|object), temp: string, condition: ?string, place: ?string,
 *   detail: ?string, accessibleName: string}} null while there is no weather (Home leaves
 *   the block out); `detail` "Feels like 34° · Wind NE 12 km/h · Humidity 75%" (feels
 *   only when it differs)
 */
export function card(weather) {
    const shown = present({data: weather});
    if (!shown)
        return null;
    const temp = shown.text;
    const condition = conditionOf(weather.icon ?? ICON);
    const place = typeof weather.place === 'string' && weather.place.trim() ? weather.place.trim() : null;
    return {
        leading: shown.leading,
        temp,
        condition,
        place,
        detail: shown.compact.subtitle,
        accessibleName: shown.accessibleName,
    };
}

const HOUR = 60 * 60 * 1000;

/**
 * `auto` (SPEC §2a-iii): the first hour of the morning 70, a change in the next hour (rain
 * starts, a swing of 5 °C or more) 75, else 35; nothing to show → null.
 *
 * @param {object} ctx
 * @param {Date} ctx.now
 * @param {?object} ctx.data  the feed's state (read.js)
 * @param {*} [ctx.starts]  `daypart-starts`
 * @returns {?{score: number}}
 */
export function relevance({now, data: weather, starts} = {}) {
    if (!degrees(weather?.temp))
        return null;
    const next = weather.next;
    const t = now instanceof Date ? now.getTime() : Date.now();
    if (next && isNum(next.at) && next.at > t && next.at - t <= HOUR) {
        const rainStarts = isWet(next.icon) && !isWet(weather.icon);
        const swing = isNum(next.tempC) && isNum(weather.tempC) && Math.abs(next.tempC - weather.tempC) >= 5;
        if (rainStarts || swing)
            return {score: 75};
    }
    const morning = normaliseStarts(starts ?? DEFAULT_STARTS).starts[1];
    if (now instanceof Date && now.getHours() === morning)
        return {score: 70};
    return {score: 35};
}

export default {keys, ticks, present, refreshMs, relevance};
