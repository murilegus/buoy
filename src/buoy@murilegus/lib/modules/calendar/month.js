/**
 * The Calendar tab's month (pure, 2026-11-08, Ethan: pick a day on the month, see its
 * events beside it): six weeks of days around a month, starting on GNOME's first day of the
 * week (the date menu's calendar's, ui/calendar.js `_getWeekStartDay`: `week-start-day`,
 * else the locale's), as the date menu's grid lays them out.
 */

import {dayStart} from './agenda.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
const INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const weekStartOf = v => Number.isInteger(v) && v >= 0 && v <= 6 ? v : 0;

/**
 * @param {number} year
 * @param {number} month  0–11
 * @param {object} [opts]
 * @param {number} [opts.weekStart]  0 Sunday … 6 Saturday
 * @returns {{day: number, date: number, inMonth: boolean}[]} 42 days, six weeks: `day` its
 *   local midnight (ms), `date` 1–31
 */
export function monthDays(year, month, {weekStart = 0} = {}) {
    const first = new Date(year, month, 1);
    const back = (first.getDay() - weekStartOf(weekStart) + 7) % 7;
    const days = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(year, month, 1 - back + i);
        days.push({day: d.getTime(), date: d.getDate(), inMonth: d.getMonth() === month});
    }
    return days;
}

/**
 * @param {number} [weekStart]  0 Sunday … 6 Saturday
 * @returns {string[]} the seven column heads, from the first day of the week
 */
export function weekdayInitials(weekStart = 0) {
    const s = weekStartOf(weekStart);
    return [...INITIALS.slice(s), ...INITIALS.slice(0, s)];
}

/**
 * @param {number} year
 * @param {number} month  0–11
 * @returns {{month: string, year: string}} "November", "2026" (the tab sets them apart)
 */
export function monthTitle(year, month) {
    return {month: MONTHS[((month % 12) + 12) % 12], year: String(year)};
}

/**
 * @param {number} day  ms
 * @returns {boolean} a Saturday or a Sunday (the grid dims them)
 */
export function isWeekend(day) {
    const d = new Date(day).getDay();
    return d === 0 || d === 6;
}

/**
 * ‹ › move the picked day a month, as the date menu's calendar does (ui/calendar.js
 * `_onPrevMonthButtonClicked`): the same date, or the month's last when it is shorter
 * (31 Jan → 28 Feb).
 *
 * @param {number} day  a local midnight, ms
 * @param {number} step  -1 or +1
 * @returns {number} that day a month away, local midnight, ms
 */
export function stepDay(day, step) {
    const d = new Date(day);
    const last = new Date(d.getFullYear(), d.getMonth() + step + 1, 0).getDate();
    return new Date(d.getFullYear(), d.getMonth() + step, Math.min(d.getDate(), last)).getTime();
}

/**
 * The list's title for a picked day: "Today, 8 November", "Tomorrow, 9 November", else
 * "Wednesday, 18 November" (and the year when not this one).
 *
 * @param {number} day  a local midnight, ms
 * @param {number} now  ms
 * @returns {string}
 */
export function pickedTitle(day, now) {
    const diff = Math.round((day - dayStart(now)) / (24 * 60 * 60 * 1000));
    const d = new Date(day);
    const name = {0: 'Today', 1: 'Tomorrow', [-1]: 'Yesterday'}[diff] ?? WEEKDAYS[d.getDay()];
    const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
    return `${name}, ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}
