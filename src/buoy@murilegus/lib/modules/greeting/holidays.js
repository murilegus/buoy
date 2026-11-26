/**
 * The days Bu says something special on (GREETING.md §7, FEATURES M4 "Greeting" part 3; Ethan
 * 2026-11-06, 11-16). Data and pure functions only (ARCHITECTURE rule 7): which day a date is,
 * for a region and a birthday. The lunar days are a table written by scripts/lunar.js, nothing
 * is computed from the moon at runtime; past 2099 they are skipped.
 *
 * Two kinds: `celebrate` takes line 1 (Bu `party`), and Leaving's title on its evening;
 * `observe` adds "Today is {name}." to line 2.
 */

/** The regions a time zone tells (GLib.TimeZone identifier). A region comes with its data. */
const ZONES = Object.freeze({'Asia/Ho_Chi_Minh': 'vn', 'Asia/Saigon': 'vn'});

/**
 * @param {*} tz  the local time zone's identifier ("Asia/Ho_Chi_Minh")
 * @returns {?string} the region, 'vn', or null (the global days only)
 */
export function regionOf(tz) {
    return typeof tz === 'string' ? ZONES[tz] ?? null : null;
}

// "MMDD" → its line; {name} is the person
const GLOBAL = Object.freeze({
    '0101': {kind: 'celebrate', line: 'Happy New Year, {name}!'},
    '0214': {kind: 'observe', name: 'Valentine\'s Day'},
    '0308': {kind: 'observe', name: 'International Women\'s Day'},
    '0501': {kind: 'observe', name: 'Labour Day'},
    '1031': {kind: 'celebrate', line: 'Happy Halloween, {name}!'},
    '1224': {kind: 'celebrate', line: 'Merry Christmas Eve, {name}!'},
    '1225': {kind: 'celebrate', line: 'Merry Christmas, {name}!'},
    '1231': {kind: 'celebrate', line: 'Last day of the year, {name}.'},
});
const VN = Object.freeze({
    '0227': {kind: 'observe', name: 'Vietnamese Doctors\' Day'},
    '0430': {kind: 'observe', name: 'Reunification Day'},
    '0601': {kind: 'observe', name: 'Children\'s Day'},
    '0628': {kind: 'observe', name: 'Vietnamese Family Day'},
    '0902': {kind: 'observe', name: 'National Day'},
    '1020': {kind: 'observe', name: 'Vietnamese Women\'s Day'},
    '1120': {kind: 'observe', name: 'Teachers\' Day'},
});
// the lunar days, in LUNAR's order
const LUNAR_DAYS = Object.freeze([
    {kind: 'celebrate', line: 'Happy Lunar New Year, {name}!', days: 3},   // Tết, its 1st–3rd
    {kind: 'observe', name: 'the First Full Moon Festival'},
    {kind: 'observe', name: 'Hùng Kings\' Day'},
    {kind: 'observe', name: 'Vesak'},
    {kind: 'observe', name: 'Vu Lan'},
    {kind: 'celebrate', line: 'Happy Mid-Autumn, {name}!'},
    {kind: 'observe', name: 'Kitchen Gods\' Day', nextYear: true},
]);

// LUNAR — written by scripts/lunar.js (gjs -m scripts/lunar.js --write); do not edit by hand.
// Per lunar year, "MMDD" of: Tết, first full moon, Hùng Kings, Vesak, Vu Lan, Mid-Autumn, Kitchen Gods (next year).
export const LUNAR = Object.freeze({
    2026: '0217 0303 0426 0531 0827 0925 0130',
    2027: '0206 0220 0416 0520 0816 0915 0119',
    2028: '0126 0209 0404 0509 0903 1003 0206',
    2029: '0213 0227 0423 0527 0824 0922 0126',
    2030: '0202 0216 0412 0516 0813 0912 0116',
    2031: '0123 0206 0401 0604 0901 1001 0204',
    2032: '0211 0225 0419 0523 0820 0919 0123',
    2033: '0131 0214 0409 0513 0809 0908 0211',
    2034: '0219 0305 0428 0601 0828 0926 0131',
    2035: '0208 0222 0417 0522 0818 0916 0120',
    2036: '0128 0211 0406 0510 0905 1004 0207',
    2037: '0215 0301 0424 0529 0825 0924 0127',
    2038: '0204 0218 0413 0518 0815 0913 0117',
    2039: '0124 0207 0403 0507 0903 1002 0205',
    2040: '0212 0226 0420 0525 0822 0920 0125',
    2041: '0201 0215 0410 0514 0811 0909 0114',
    2042: '0122 0205 0429 0602 0830 0928 0202',
    2043: '0210 0224 0419 0523 0819 0917 0122',
    2044: '0130 0213 0407 0512 0808 1005 0209',
    2045: '0217 0303 0426 0531 0827 0925 0129',
    2046: '0206 0220 0415 0520 0816 0915 0118',
    2047: '0126 0209 0404 0509 0904 1004 0206',
    2048: '0214 0228 0422 0527 0824 0922 0126',
    2049: '0202 0216 0411 0516 0813 0911 0116',
    2050: '0123 0206 0401 0604 0831 0930 0204',
    2051: '0211 0225 0420 0524 0820 0919 0124',
    2052: '0201 0215 0409 0513 0809 0907 0211',
    2053: '0218 0304 0428 0601 0828 0926 0131',
    2054: '0208 0222 0417 0522 0818 0916 0120',
    2055: '0128 0211 0406 0511 0906 1005 0208',
    2056: '0215 0229 0424 0528 0825 0924 0127',
    2057: '0204 0218 0413 0517 0814 0913 0117',
    2058: '0124 0207 0402 0507 0902 1002 0205',
    2059: '0212 0226 0421 0526 0822 0921 0125',
    2060: '0202 0216 0410 0514 0810 0909 0114',
    2061: '0121 0204 0331 0602 0829 0928 0202',
    2062: '0209 0223 0419 0523 0819 0917 0121',
    2063: '0129 0212 0408 0512 0809 1006 0209',
    2064: '0217 0302 0426 0530 0827 0925 0129',
    2065: '0205 0219 0415 0519 0816 0914 0118',
    2066: '0126 0209 0404 0508 0904 1003 0206',
    2067: '0214 0228 0423 0527 0824 0923 0127',
    2068: '0203 0217 0411 0516 0812 0911 0115',
    2069: '0123 0206 0401 0505 0831 0929 0203',
    2070: '0211 0225 0420 0524 0820 0919 0123',
    2071: '0131 0214 0409 0514 0810 0908 0211',
    2072: '0219 0304 0427 0601 0828 0926 0130',
    2073: '0207 0221 0416 0521 0818 0916 0119',
    2074: '0127 0210 0405 0510 0905 1005 0208',
    2075: '0215 0301 0424 0529 0826 0924 0128',
    2076: '0205 0219 0413 0517 0814 0912 0117',
    2077: '0124 0207 0402 0507 0901 1001 0205',
    2078: '0212 0226 0421 0526 0822 0920 0125',
    2079: '0202 0216 0411 0515 0811 0910 0114',
    2080: '0122 0205 0330 0602 0829 0927 0201',
    2081: '0209 0223 0418 0523 0819 0917 0121',
    2082: '0129 0212 0407 0512 0808 1006 0209',
    2083: '0217 0303 0426 0531 0827 0926 0130',
    2084: '0206 0220 0414 0519 0816 0914 0118',
    2085: '0126 0209 0403 0508 0903 1003 0206',
    2086: '0214 0228 0422 0527 0823 0922 0127',
    2087: '0203 0217 0412 0517 0813 0911 0116',
    2088: '0124 0207 0401 0505 0830 0929 0203',
    2089: '0210 0224 0420 0524 0820 0918 0123',
    2090: '0130 0213 0409 0514 0810 0908 0210',
    2091: '0218 0304 0428 0601 0829 0927 0131',
    2092: '0207 0221 0416 0520 0817 0916 0119',
    2093: '0127 0210 0405 0509 0905 1005 0208',
    2094: '0215 0301 0424 0528 0825 0924 0128',
    2095: '0205 0219 0413 0518 0814 0913 0118',
    2096: '0125 0208 0402 0507 0901 0930 0204',
    2097: '0212 0226 0421 0526 0821 0920 0124',
    2098: '0201 0215 0411 0515 0811 0909 0113',
    2099: '0121 0204 0429 0603 0830 0928 0201',
});
// /LUNAR

const two = n => String(n).padStart(2, '0');
const key = d => `${two(d.getMonth() + 1)}${two(d.getDate())}`;
const sameDay = (a, y, m, d) => a.getFullYear() === y && a.getMonth() + 1 === m && a.getDate() === d;

/**
 * Easter Sunday, Gregorian (the anonymous computus, Meeus/Jones/Butcher).
 *
 * @param {number} y
 * @returns {[number, number]} [month, day]
 */
export function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    return [month, ((h + l - 7 * m + 114) % 31) + 1];
}

/**
 * @param {number} y
 * @param {number} month  1–12
 * @param {number} n  1st, 2nd…
 * @returns {number} the day of the month of its n-th Sunday
 */
export function nthSunday(y, month, n) {
    const first = new Date(y, month - 1, 1).getDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
}

// the lunar days on a date (this lunar year's, and Kitchen Gods' of the one before)
function lunarOn(date) {
    const y = date.getFullYear();
    const out = [];
    for (const [year, offset] of [[y, 0], [y - 1, 1]]) {
        const row = LUNAR[year];
        if (!row)
            continue;
        row.split(' ').forEach((md, i) => {
            const def = LUNAR_DAYS[i];
            if (Boolean(def.nextYear) !== Boolean(offset))
                return;
            const start = new Date(year + offset, Number(md.slice(0, 2)) - 1, Number(md.slice(2)));
            for (let k = 0; k < (def.days ?? 1); k++) {
                const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k);
                if (sameDay(date, d.getFullYear(), d.getMonth() + 1, d.getDate()))
                    out.push(def);
            }
        });
    }
    return out;
}

/**
 * Which special day a date is (GREETING.md §7).
 *
 * @param {Date} date  local
 * @param {object} [opts]
 * @param {?string} [opts.region]  regionOf(), null: the global days
 * @param {string} [opts.holidays]  `greeting-holidays`: 'auto' (global + the region's), 'global', 'off'
 * @param {string} [opts.birthday]  `greeting-birthday`, "MM-DD" or ''
 * @returns {{birthday: boolean, celebrate: ?{line: string}, observe: ?{name: string}}} the birthday
 *   wins over a celebration, a celebration over an observance (which still goes on line 2); of two
 *   observances, the region's
 */
export function specialDay(date, {region = null, holidays = 'auto', birthday = ''} = {}) {
    const k = key(date);
    const out = {birthday: typeof birthday === 'string' && birthday.replace('-', '') === k, celebrate: null, observe: null};
    if (holidays === 'off')
        return out;
    const y = date.getFullYear();
    const global = [];
    if (GLOBAL[k])
        global.push(GLOBAL[k]);
    const [em, ed] = easter(y);
    if (sameDay(date, y, em, ed))
        global.push({kind: 'celebrate', line: 'Happy Easter, {name}!'});
    if (sameDay(date, y, 5, nthSunday(y, 5, 2)))
        global.push({kind: 'observe', name: 'Mother\'s Day'});
    if (sameDay(date, y, 6, nthSunday(y, 6, 3)))
        global.push({kind: 'observe', name: 'Father\'s Day'});
    const local = holidays === 'auto' && region === 'vn' ? [...VN[k] ? [VN[k]] : [], ...lunarOn(date)] : [];
    const all = [...local, ...global];      // the region's first
    const c = all.find(d => d.kind === 'celebrate');
    const o = all.find(d => d.kind === 'observe');
    out.celebrate = c ? {line: c.line} : null;
    out.observe = o ? {name: o.name} : null;
    return out;
}
