/**
 * The clock idle plan (SPEC §2a, FEATURES M3 "clock"): a second clock in the idle pill,
 * unlike the one in the right cluster — the part of the day as a colour icon, then
 * the time. Presentation only, pure (no St, no timer): the kit reads the time from
 * GNOME's wall clock (GnomeDesktop.WallClock, as Shell's lock screen) and calls
 * present() on each of its ticks.
 *
 * Styles (`idle-clock-style`, 2026-11-08, Ethan): icon and the part of the day in words
 * (the default) · icon and time · icon only · the part of the day in words · time only.
 * The time is GNOME's own, as Date & Time sets it — 12/24 h (`clock-format`) and seconds
 * (`clock-show-seconds`, which the wall clock follows) — so no style of its own for
 * seconds any more.
 */

import {DAYPARTS, daypartAt} from '../../kit/daypart.js';

export const STYLES = Object.freeze(['icon-text', 'icon-time', 'icon', 'text', 'time']);
export const DEFAULT_STYLE = 'icon-text';

/** The part of the day in words, as `icon-text` and `text` show it. */
export const WORDS = Object.freeze({
    dawn: 'Dawn', morning: 'Morning', noon: 'Noon', afternoon: 'Afternoon', evening: 'Evening', night: 'Night',
});

/** This plan's own keys (ARCHITECTURE rule 9: shown under it on the Island page). */
export const keys = Object.freeze(['idle-clock-style']);

/**
 * @param {string} daypart  one of DAYPARTS
 * @returns {string} file URI of its icon (icons/daypart-<part>.svg, a colour SVG:
 *   the pill is always black, MASCOT/INDICATORS keep amber and red for the light)
 */
export function iconFor(daypart) {
    const part = DAYPARTS.includes(daypart) ? daypart : 'noon';
    // the extension's root: this file is <root>/lib/modules/clock/idle.js (no URL in gjs)
    const root = import.meta.url.split('/').slice(0, -4).join('/');
    return `${root}/icons/daypart-${part}.svg`;
}

function styleOf(opts) {
    const s = opts?.['idle-clock-style'];
    return STYLES.includes(s) ? s : DEFAULT_STYLE;
}

/**
 * @param {object} ctx
 * @param {Date} ctx.now
 * @param {string} ctx.clock  GNOME's formatted time (WallClock `clock`, time only)
 * @param {*} [ctx.starts]  `daypart-starts`
 * @param {object} [opts]  this plan's keys' values
 * @returns {object} presentation data for the idle pill: {leading?, text?}
 */
export function present({now, clock, starts}, opts = {}) {
    const style = styleOf(opts);
    const daypart = daypartAt(now, starts);
    const time = typeof clock === 'string' && clock.trim() ? clock.trim() : null;
    const icon = style.startsWith('icon');
    const leading = icon ? {art: iconFor(daypart), icon: 'preferences-system-time-symbolic'} : null;
    let text = null;
    if (style === 'icon-time' || style === 'time')
        text = time;
    else if (style === 'icon-text' || style === 'text')
        text = WORDS[daypart] ?? null;
    return {
        leading,
        text,
        daypart,                        // for the accessible name; not drawn
    };
}

/**
 * `auto` (SPEC §2a-iii): the floor, always available.
 *
 * @returns {{score: number}}
 */
export function relevance() {
    return {score: 10};
}

export default {keys, present, relevance};
