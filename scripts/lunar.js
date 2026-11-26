// The Vietnamese lunar calendar's days Buoy greets (GREETING.md §7), as Gregorian dates for the lunar
// years 2026–2099. Run by hand, like scripts/icons.js; its output is data, written into
// src/…/lib/modules/greeting/holidays.js between its LUNAR markers — nothing is computed at runtime.
//   gjs -m scripts/lunar.js            print the table
//   gjs -m scripts/lunar.js --write    write it into holidays.js
//
// Hồ Ngọc Đức's algorithm (https://www.informatik.uni-leipzig.de/~duc/amlich/, "Thuật toán tính âm
// lịch"), at UTC+7: the new moons and the sun's longitude after Jean Meeus, "Astronomical Algorithms"
// (1998), the month 11 holding the winter solstice, a leap month the first with no major term.
import GLib from 'gi://GLib';

const TZ = 7;
const PI = Math.PI;
const INT = Math.floor;

// the Julian day number of a Gregorian date
function jdFromDate(dd, mm, yy) {
    const a = INT((14 - mm) / 12);
    const y = yy + 4800 - a;
    const m = mm + 12 * a - 3;
    let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
    if (jd < 2299161)
        jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
    return jd;
}

function jdToDate(jd) {
    let a, b, c;
    if (jd > 2299160) {
        a = jd + 32044;
        b = INT((4 * a + 3) / 146097);
        c = a - INT((b * 146097) / 4);
    } else {
        b = 0;
        c = jd + 32082;
    }
    const d = INT((4 * c + 3) / 1461);
    const e = c - INT((1461 * d) / 4);
    const m = INT((5 * e + 2) / 153);
    const day = e - INT((153 * m + 2) / 5) + 1;
    const month = m + 3 - 12 * INT(m / 10);
    const year = b * 100 + d - 4800 + INT(m / 10);
    return [day, month, year];
}

// the k-th new moon since 1900-01-01, as a Julian day (Meeus)
function newMoon(k) {
    const T = k / 1236.85;
    const T2 = T * T, T3 = T2 * T;
    const dr = PI / 180;
    let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    const deltat = T < -11
        ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
        : -0.000278 + 0.000265 * T + 0.000262 * T2;
    return Jd1 + C1 - deltat;
}

// the sun's longitude at a Julian day, in radians, 0..2π (Meeus)
function sunLongitude(jdn) {
    const T = (jdn - 2451545.0) / 36525;
    const T2 = T * T;
    const dr = PI / 180;
    const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    let L = (L0 + DL) * dr;
    L -= PI * 2 * INT(L / (PI * 2));
    return L;
}

const newMoonDay = k => INT(newMoon(k) + 0.5 + TZ / 24);
const sunSector = jd => INT(sunLongitude(jd - 0.5 - TZ / 24) / PI * 6);   // 0..11, a major term each

// the day the lunar month 11 of `yy` begins (it holds the winter solstice)
function lunarMonth11(yy) {
    const off = jdFromDate(31, 12, yy) - 2415021;
    const k = INT(off / 29.530588853);
    let nm = newMoonDay(k);
    if (sunSector(nm) >= 9)
        nm = newMoonDay(k - 1);
    return nm;
}

// which month after month 11 is the leap one (the first with no major term)
function leapMonthOffset(a11) {
    const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    let last, i = 1;
    let arc = sunSector(newMoonDay(k + i));
    do {
        last = arc;
        i++;
        arc = sunSector(newMoonDay(k + i));
    } while (arc !== last && i < 14);
    return i - 1;
}

/**
 * @param {number} day  lunar day
 * @param {number} month  lunar month (not a leap one)
 * @param {number} year  lunar year
 * @returns {[number, number, number]} its Gregorian [day, month, year]
 */
function lunarToSolar(day, month, year) {
    let a11, b11;
    if (month < 11) {
        a11 = lunarMonth11(year - 1);
        b11 = lunarMonth11(year);
    } else {
        a11 = lunarMonth11(year);
        b11 = lunarMonth11(year + 1);
    }
    const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
    let off = month - 11;
    if (off < 0)
        off += 12;
    // a year of 13 months: the months from the leap one on move one along
    if (b11 - a11 > 365 && off >= leapMonthOffset(a11))
        off++;
    const start = newMoonDay(k + off);
    return jdToDate(start + day - 1);
}

// the days of a lunar year (GREETING.md §7): Tết, the first full moon, Hùng Kings' day, Vesak,
// Vu Lan, Mid-Autumn, Kitchen Gods' day (23/12, in January or February of the next year)
const DAYS = [[1, 1], [15, 1], [10, 3], [15, 4], [15, 7], [15, 8], [23, 12]];
const two = n => String(n).padStart(2, '0');

const table = {};
for (let y = 2026; y <= 2099; y++)
    table[y] = DAYS.map(([d, m]) => lunarToSolar(d, m, y)).map(([dd, mm]) => `${two(mm)}${two(dd)}`).join(' ');

// the anchors (GREETING.md §7): Tết 2026 = 17 February; 2027 6 February; 2028 26 January
const [tet26, tet27, tet28] = [lunarToSolar(1, 1, 2026), lunarToSolar(1, 1, 2027), lunarToSolar(1, 1, 2028)];
if (`${tet26}` !== '17,2,2026' || `${tet27}` !== '6,2,2027' || `${tet28}` !== '26,1,2028')
    throw new Error(`anchors: ${tet26} ${tet27} ${tet28}`);

const lines = Object.entries(table).map(([y, v]) => `    ${y}: '${v}',`);
const block = `// LUNAR — written by scripts/lunar.js (gjs -m scripts/lunar.js --write); do not edit by hand.\n` +
    `// Per lunar year, "MMDD" of: Tết, first full moon, Hùng Kings, Vesak, Vu Lan, Mid-Autumn, Kitchen Gods (next year).\n` +
    `export const LUNAR = Object.freeze({\n${lines.join('\n')}\n});\n// /LUNAR`;

if (ARGV.includes('--write')) {
    const path = GLib.build_filenamev([GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]), '..',
        'src', 'buoy@murilegus', 'lib', 'modules', 'greeting', 'holidays.js']);
    const [, bytes] = GLib.file_get_contents(path);
    const text = new TextDecoder().decode(bytes);
    const out = text.replace(/\/\/ LUNAR —[\s\S]*?\/\/ \/LUNAR/, block);
    if (out === text && !text.includes(block))
        throw new Error('holidays.js has no LUNAR markers');
    GLib.file_set_contents(path, out);
    print(`lunar: ${Object.keys(table).length} years written`);
} else {
    print(block);
}
