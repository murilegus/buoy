/**
 * Parts of the day (SPEC §2d, 2026-11-03): `dawn · morning · noon · afternoon · evening ·
 * night`, from the hour, shared by the clock plan's icon, the greeting and `auto`'s
 * `ctx.daypart`. Pure (no St, no Main, no timer), so it runs under plain gjs; a consumer
 * that must change at a boundary arms its own one-shot timer at nextBoundary().
 *
 * `daypart-starts` (ai) holds each part's start hour, in that order. One part wraps past
 * midnight (night by default); any rotation works, so long as the six hours are distinct
 * and in cyclic order. A setting that is not gives the defaults, never an exception.
 */

export const DAYPARTS = Object.freeze(['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night']);
export const DEFAULT_STARTS = Object.freeze([5, 7, 11, 13, 18, 22]);

const isHour = v => Number.isInteger(v) && v >= 0 && v <= 23;

/**
 * @param {*} value  `daypart-starts`, unpacked
 * @returns {{starts: number[], valid: boolean}} six start hours (a copy), or the defaults
 *   with valid false when the value is not six distinct hours 0–23 in cyclic order
 */
export function normaliseStarts(value) {
    const fallback = {starts: [...DEFAULT_STARTS], valid: false};
    if (!Array.isArray(value) || value.length !== DAYPARTS.length || !value.every(isHour))
        return fallback;
    // In cyclic order: going round once, the hour drops exactly once (past midnight). Equal
    // neighbours would be an empty part.
    let drops = 0;
    for (let i = 0; i < value.length; i++) {
        const a = value[i], b = value[(i + 1) % value.length];
        if (a === b)
            return fallback;
        if (b < a)
            drops++;
    }
    return drops === 1 ? {starts: [...value], valid: true} : fallback;
}

function hourOf(time) {
    const h = time instanceof Date ? time.getHours() : Math.floor(Number(time));
    return Number.isFinite(h) ? ((h % 24) + 24) % 24 : 0;
}

/**
 * @param {Date|number} time  a Date (its local hour) or an hour
 * @param {*} [starts]  `daypart-starts`; bad or missing → the defaults
 * @returns {string} one of DAYPARTS
 */
export function daypartAt(time, starts = DEFAULT_STARTS) {
    const s = normaliseStarts(starts).starts;
    const h = hourOf(time);
    // the part whose start is the latest one at or before h, going back round midnight
    let best = -1, bestDist = 25;
    s.forEach((start, i) => {
        const dist = (h - start + 24) % 24;
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    });
    return DAYPARTS[best];
}

/**
 * The next time a part starts, strictly after `time`, in local time (DST and month ends
 * are the Date constructor's).
 *
 * @param {Date} time
 * @param {*} [starts]  `daypart-starts`; bad or missing → the defaults
 * @returns {Date} a new Date on the hour
 */
export function nextBoundary(time, starts = DEFAULT_STARTS) {
    const s = [...normaliseStarts(starts).starts].sort((a, b) => a - b);
    const y = time.getFullYear(), m = time.getMonth(), d = time.getDate();
    for (const h of s) {
        const t = new Date(y, m, d, h, 0, 0, 0);
        if (t > time)
            return t;
    }
    return new Date(y, m, d + 1, s[0], 0, 0, 0);
}

/**
 * The hours a part may start at, for prefs' row (FEATURES M3 "daypart-starts in prefs"):
 * after the part before it and before the part after it, going round midnight. Unwrapped:
 * `lo`…`hi` are consecutive integers that may pass 23 (show them mod 24), `value` is the
 * part's start in that range.
 *
 * @param {*} starts  `daypart-starts`; bad or missing → the defaults
 * @param {number} i  the part, 0 (dawn) … 5 (night)
 * @returns {{lo: number, hi: number, value: number}}
 */
export function startRange(starts, i) {
    const s = normaliseStarts(starts).starts;
    const n = s.length, k = ((Math.floor(i) % n) + n) % n;
    const prev = s[(k + n - 1) % n], next = s[(k + 1) % n];
    const lo = prev + 1;
    const hi = (next > prev ? next : next + 24) - 1;
    const value = s[k] >= lo ? s[k] : s[k] + 24;
    return {lo, hi, value};
}

/**
 * `daypart-starts` with one part moved.
 *
 * @param {*} starts  `daypart-starts`; bad or missing → the defaults
 * @param {number} i  the part, 0 (dawn) … 5 (night)
 * @param {number} hour  any integer, taken mod 24 (startRange's unwrapped values)
 * @returns {?number[]} the six hours, or null when that hour leaves a part empty or out of
 *   order
 */
export function withStart(starts, i, hour) {
    const s = [...normaliseStarts(starts).starts];
    if (!Number.isInteger(i) || i < 0 || i >= s.length || !Number.isFinite(hour))
        return null;
    s[i] = ((Math.round(hour) % 24) + 24) % 24;
    const out = normaliseStarts(s);
    return out.valid ? out.starts : null;
}

/**
 * An hour as GNOME's clock writes it (`clock-format`): "05:00" in 24-hour time, "5 AM" in
 * 12-hour time.
 *
 * @param {number} hour  any integer, taken mod 24
 * @param {string} [format]  '24h' or '12h'
 * @returns {string}
 */
export function hourLabel(hour, format = '24h') {
    const h = ((Math.round(Number(hour) || 0) % 24) + 24) % 24;
    if (format === '12h')
        return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
    return `${String(h).padStart(2, '0')}:00`;
}
