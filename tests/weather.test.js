// Run: gjs -m tests/weather.test.js   (pure: the weather idle plan and reading GWeather.Info)
import GLib from 'gi://GLib';

import weather, {
    REFRESH, DEFAULT_REFRESH, keys, ticks, refreshMs, degrees, conditionOf, isWet, windText, present, relevance,
    ART, artFor, card,
} from '../src/buoy@murilegus/lib/modules/weather/idle.js';
import {readInfo, nextHour, unitNames} from '../src/buoy@murilegus/lib/modules/weather/read.js';
import {STATE_COLOURS} from '../src/buoy@murilegus/lib/kit/model/palette.js';
import {planIdle, planCompact} from '../src/buoy@murilegus/lib/kit/model/presentation.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// --- the plan's shape ---------------------------------------------------------------------
eq(Object.keys(weather).sort(), ['keys', 'present', 'refreshMs', 'relevance', 'ticks'], 'default export: the plan contract');
eq(keys, ['idle-weather-automatic', 'idle-weather-refresh'], 'its own keys are idle-weather-*');
eq(ticks, false, 'no wall clock: nothing changes with the minute');
eq([REFRESH, DEFAULT_REFRESH], [{'30m': 30, '1h': 60}, '30m'], '30 min or 1 h, SPEC §2a');
eq([refreshMs({'idle-weather-refresh': '1h'}), refreshMs({'idle-weather-refresh': '30m'})], [3600000, 1800000],
    'refresh in ms');
eq([refreshMs({'idle-weather-refresh': 'nope'}), refreshMs({}), refreshMs(null)], [1800000, 1800000, 1800000],
    'a bad or missing value: 30 min');

// --- numbers and words ---------------------------------------------------------------------
eq([degrees(31.4), degrees(31.5), degrees(84.2), degrees(0)], ['31°', '32°', '84°', '0°'], 'rounded, the user\'s unit');
eq([degrees(-0.3), degrees(-4.6)], ['0°', '−5°'], 'never "-0°"; a real minus sign below zero');
eq([degrees(null), degrees(NaN), degrees('31'), degrees(undefined)], [null, null, null, null], 'no number: nothing');
eq(conditionOf('weather-few-clouds-night-symbolic'), 'Partly cloudy', 'night and symbolic suffixes dropped');
eq([conditionOf('weather-clear-symbolic'), conditionOf('weather-overcast'), conditionOf('weather-storm-symbolic')],
    ['Clear', 'Cloudy', 'Thunderstorm'], 'GNOME\'s condition icons named');
eq(conditionOf('weather-showers-scattered-symbolic'), 'Light rain', 'scattered showers before showers');
eq([conditionOf('weather-nope'), conditionOf(''), conditionOf(null)], [null, null, null], 'unknown icon: no words');
eq([isWet('weather-showers-symbolic'), isWet('weather-snow'), isWet('weather-storm-symbolic'),
    isWet('weather-showers-scattered-symbolic')], [true, true, true, true], 'rain, snow, storms are wet');
eq([isWet('weather-clear-symbolic'), isWet('weather-fog'), isWet(null)], [false, false, false], 'the rest is dry');

const kph = (speed, dir) => ({speed, unit: 'km/h', dir, beaufort: false});
eq(windText(kph(12.4, 3)), 'NE 12 km/h', 'GWeather.WindDirection 3 is NE');
eq([windText(kph(5, 1)), windText(kph(5, 16)), windText(kph(5, 9))], ['N 5 km/h', 'NNW 5 km/h', 'S 5 km/h'],
    'the 16 directions in GWeather\'s order');
eq([windText(kph(5, 0)), windText(kph(5, -1)), windText(kph(5, 17))], ['5 km/h', '5 km/h', '5 km/h'],
    'variable or unknown direction: the speed alone');
eq([windText(kph(0.3, 3)), windText(kph(0, 0))], ['Calm', 'Calm'], 'no wind: calm');
eq(windText({speed: 4, unit: 'Beaufort force', dir: 11, beaufort: true}), 'SW Force 4', 'Beaufort: a force');
eq([windText(null), windText(kph(-1, 3)), windText({speed: 'x'})], [null, null, null], 'unknown speed: nothing');

// --- our colour icons (2026-11-06, Ethan) ---------------------------------------------------
eq(ART.length, 13, 'one per GNOME condition icon, and the two night ones');
for (const name of ART) {
    const uri = artFor(`weather-${name}-symbolic`);
    if (!uri?.startsWith('file://') || !uri.endsWith(`/icons/color/weather-${name}.svg`))
        throw new Error(`${name}: its icon file: ${uri}`);
    const path = GLib.filename_from_uri(uri)[0];
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        throw new Error(`${name}: the file exists (${path})`);
    const svg = new TextDecoder().decode(GLib.file_get_contents(path)[1]);
    eq(svg.startsWith('<svg') && svg.includes('viewBox="0 0 16 16"'), true, `${name}: a 16 px SVG, as the daypart icons`);
    for (const reserved of STATE_COLOURS.map(c => c.toUpperCase()))
        eq(svg.toUpperCase().includes(reserved), false, `${name}: no state colour ${reserved} (INDICATORS)`);
}
eq(artFor('weather-showers-night-symbolic'), artFor('weather-showers'), 'a night GWeather has no own icon for: the day one');
eq(artFor('weather-clear-night-symbolic') !== artFor('weather-clear-symbolic'), true, 'clear night: the moon');
eq([artFor('weather-nope-symbolic'), artFor(''), artFor(null)], [null, null, null], 'unknown: none');

// --- the pill (SPEC §2a: icon + temperature; compact: feels like, wind, humidity) ----------
const now = new Date(2026, 10, 6, 15, 10);
const state = {
    place: 'Ho Chi Minh', temp: 31.2, tempC: 31.2, feels: 34.6, icon: 'weather-few-clouds-symbolic',
    wind: kph(12.4, 3), humidity: '75%', next: null, updated: now.getTime(),
};
{
    const p = present({now, data: state});
    const lead = {art: artFor('weather-few-clouds-symbolic'), icon: 'weather-few-clouds-symbolic'};
    eq([p.leading, p.text], [lead, '31°'], 'the pill: our colour icon (GNOME\'s symbolic as fallback) and temperature');
    eq(p.compact, {
        leading: lead, text: '31° · Partly cloudy',
        subtitle: 'Feels like 35° · Wind NE 12 km/h · Humidity 75%',
    }, 'the compact: the condition in words, then feels like, wind, humidity');
    eq(p.accessibleName, 'Ho Chi Minh, 31°, Partly cloudy', 'a screen reader hears place, temperature, condition');
    const idle = planIdle({plan: p});
    eq([idle.leading.type, idle.leading.src, idle.leading.fallback, idle.text],
        ['art', lead.art, 'weather-few-clouds-symbolic', '31°'], 'planned as idle: art, symbolic fallback');
    const c = planCompact(p);
    eq([c.leading.type, c.leading.src, c.text, c.subtitle, c.tall], ['art', lead.art, '31° · Partly cloudy',
        'Feels like 35° · Wind NE 12 km/h · Humidity 75%', false], 'planned as a compact, one row high');
}
eq(present({data: {...state, feels: 31.4}}).compact.subtitle, 'Wind NE 12 km/h · Humidity 75%',
    'feels like the same as the temperature: not said');
eq(present({data: {...state, feels: null, wind: null, humidity: null}}).compact.subtitle, null,
    'no details: no subtitle');
eq(present({data: {...state, icon: 'weather-nope-symbolic'}}).compact.text, '31°', 'unnamed condition: temperature alone');
eq(present({data: {...state, icon: 'weather-nope-symbolic'}}).leading, 'weather-nope-symbolic',
    'a condition we do not draw: GNOME\'s icon');
eq(present({data: {...state, icon: null}}).leading.icon, 'weather-overcast-symbolic', 'no icon from GWeather: a cloud');
eq(present({data: {...state, place: null}}).accessibleName, '31°, Partly cloudy', 'no place: left out');
eq([present({data: null}), present({data: {...state, temp: null}}), present({}), present()], [null, null, null, null],
    'no weather (no location, offline, loading): nothing, the pill keeps only the light');
{
    const long = {...state, place: 'Llanfairpwllgwyngyll'.repeat(5), humidity: '100%'};
    eq(present({data: long}).accessibleName.length > 100, true, 'long place kept whole (the renderer ellipsizes)');
}
{
    const keysOf = p => Object.keys(p).sort();
    eq(keysOf(present({data: state})), ['accessibleName', 'compact', 'leading', 'text'], 'idle data only');
    const json = JSON.stringify(present({data: state}));
    if (/"(width|height|w|h|px|size)":/.test(json))
        throw new Error(`weather: no measurements in the plan's output: ${json}`);
}

// --- auto (SPEC §2a-iii) --------------------------------------------------------------------
const in30 = now.getTime() + 30 * 60 * 1000;
eq(relevance({now, data: state}), {score: 35}, 'an ordinary hour: 35');
eq(relevance({now: new Date(2026, 10, 6, 7, 20), data: state}), {score: 70}, 'the first hour of the morning: 70');
eq(relevance({now: new Date(2026, 10, 6, 8, 20), data: state}), {score: 35}, 'the second hour: back to 35');
eq(relevance({now: new Date(2026, 10, 6, 6, 5), data: state, starts: [4, 6, 11, 13, 18, 22]}), {score: 70},
    'morning as daypart-starts says');
eq(relevance({now, data: {...state, next: {at: in30, tempC: 30, icon: 'weather-showers-symbolic'}}}), {score: 75},
    'rain starts within the hour: 75');
eq(relevance({now, data: {...state, icon: 'weather-showers-symbolic', next: {at: in30, tempC: 30, icon: 'weather-storm-symbolic'}}}),
    {score: 35}, 'already raining: not a change');
eq(relevance({now, data: {...state, next: {at: in30, tempC: 25.9, icon: state.icon}}}), {score: 75}, 'a 5 °C drop: 75');
eq(relevance({now, data: {...state, next: {at: in30, tempC: 27, icon: state.icon}}}), {score: 35}, '4 °C: not yet');
eq(relevance({now, data: {...state, next: {at: now.getTime() + 2 * 3600 * 1000, tempC: 20, icon: state.icon}}}),
    {score: 35}, 'a change later than the hour: not now');
eq([relevance({now, data: null}), relevance({now, data: {...state, temp: undefined}})], [null, null],
    'nothing to show: null (auto skips it)');

// --- reading GWeather.Info (read.js), with a fake info --------------------------------------
const U = {display: 0, celsius: 2, speed: 0, speedLabel: 'km/h', beaufort: false};
const t0 = Date.UTC(2026, 10, 6, 8, 10);
const fc = (secs, tempC, icon) => ({
    get_value_update: () => [true, secs],
    get_value_temp: () => [true, tempC],
    get_symbolic_icon_name: () => icon,
});
function fakeInfo(over = {}) {
    return {
        is_valid: () => true,
        get_value_temp: unit => [true, unit === 2 ? 31.2 : 88.2],
        get_value_apparent: () => [true, 94.1],
        get_value_wind: () => [true, 12.4, 3],
        get_humidity: () => '75%',
        get_symbolic_icon_name: () => 'weather-clear-symbolic',
        get_forecast_list: () => [
            fc(0, 30, 'weather-clear-symbolic'),                         // the current one: never updated
            fc(t0 / 1000 - 600, 29, 'weather-clear-symbolic'),           // earlier: skipped
            fc(t0 / 1000 + 1800, 28, 'weather-showers-symbolic'),
            fc(t0 / 1000 + 5400, 27, 'weather-showers-symbolic'),
        ],
        ...over,
    };
}
{
    const s = readInfo(fakeInfo(), {now: t0, units: U, place: 'Ho Chi Minh'});
    eq(s, {
        place: 'Ho Chi Minh', temp: 88.2, tempC: 31.2, feels: 94.1, icon: 'weather-clear-symbolic',
        wind: {speed: 12.4, unit: 'km/h', dir: 3, beaufort: false}, humidity: '75%',
        next: {at: t0 + 1800 * 1000, tempC: 28, icon: 'weather-showers-symbolic'}, updated: t0,
    }, 'every value read, in the user\'s unit and in °C; the next forecast within the hour');
    eq(present({data: s}).text, '88°', 'what the pill shows from it');
    eq(relevance({now: new Date(t0), data: s}).score, 75, 'and auto sees the rain coming');
}
eq(readInfo(fakeInfo({get_humidity: () => 'Unknown'}), {now: t0, units: U}).humidity, null,
    'GWeather\'s "Unknown" humidity: none');
eq(readInfo(fakeInfo({get_value_apparent: () => [false, 0], get_value_wind: () => [false, 0, 0]}), {now: t0, units: U}),
    {...readInfo(fakeInfo(), {now: t0, units: U}), feels: null, wind: null}, 'values the provider did not give: null');
eq(readInfo(fakeInfo(), {now: t0, units: U}).place, null, 'no place given: null');
eq([readInfo(fakeInfo({is_valid: () => false}), {now: t0, units: U}),
    readInfo(fakeInfo({get_value_temp: () => [false, 0]}), {now: t0, units: U}),
    readInfo(null, {now: t0, units: U})], [null, null, null], 'invalid info or no temperature: no state');
const broken = () => {
    throw new Error('x');
};
eq(readInfo(fakeInfo({get_forecast_list: broken}), {now: t0, units: U}).next, null,
    'a getter that throws: that value missing, the rest read');
eq(nextHour([fc(t0 / 1000 + 5400, 27, 'x')], t0, U), null, 'the first forecast later than an hour: none');
eq([nextHour([], t0, U), nextHour(null, t0, U)], [null, null], 'no forecasts');

// --- units: GNOME Weather's keys win over the locale (2026-11-06) ----------------------------
eq(unitNames('centigrade', 'kph'), {temperature: 'CENTIGRADE', speed: 'KPH'}, '°C and km/h chosen in the keys');
eq(unitNames('fahrenheit', 'bft'), {temperature: 'FAHRENHEIT', speed: 'BFT'}, '°F and Beaufort');
eq(unitNames('default', 'default'), {temperature: 'DEFAULT', speed: 'DEFAULT'},
    'Automatic: the locale\'s (GWeather DEFAULT; Buoy\'s first enable sets °C and km/h where never set)');
eq([unitNames('invalid', 'x'), unitNames(null, undefined)], [{temperature: 'DEFAULT', speed: 'DEFAULT'},
    {temperature: 'DEFAULT', speed: 'DEFAULT'}], 'invalid or missing: the locale\'s');

// --- Home's weather block (2026-11-08) ------------------------------------------------------
{
    const c = card(state);
    eq(c, {
        leading: {art: artFor('weather-few-clouds-symbolic'), icon: 'weather-few-clouds-symbolic'},
        temp: '31°', condition: 'Partly cloudy', place: 'Ho Chi Minh',
        detail: 'Feels like 35° · Wind NE 12 km/h · Humidity 75%',
        accessibleName: 'Ho Chi Minh, 31°, Partly cloudy',
    }, 'Home card: the pill\'s icon and temperature, the condition, the place, the compact\'s details');
    eq(card({...state, feels: 31.4}).detail, 'Wind NE 12 km/h · Humidity 75%', 'Home card: feels like dropped when equal');
    eq(card({...state, feels: null, wind: null, humidity: null}).detail, null, 'Home card: no details → none');
    eq(card({...state, place: null}).place, null, 'Home card: no place → none');
    eq(card({...state, place: '   '}).place, null, 'Home card: a blank place → none');
    eq(card({...state, icon: 'weather-nope-symbolic'}).condition, null, 'Home card: an icon without words → no condition');
    eq(card({...state, icon: null}).condition, 'Cloudy', 'Home card: no icon → the overcast fallback, as the pill');
    eq(card({...state, temp: -0.3}).temp, '0°', 'Home card: rounded as the pill, never −0°');
    eq([card(null), card({...state, temp: null}), card({}), card(undefined)], [null, null, null, null],
        'Home card: no temperature → null (Home leaves the block out)');
    const long = 'Thành phố Hồ Chí Minh, Việt Nam, a place name far longer than the block';
    eq(card({...state, place: long}).place, long, 'Home card: a long place is kept whole (the block ellipsizes)');
}

print('weather: ok');
