/**
 * The clock idle plan (SPEC §2a, FEATURES M3 "clock"): a second clock in the idle pill,
 * unlike the one in the right cluster — the part of the day as a colour picture, then
 * the time. Presentation only, pure (no St, no timer): the kit reads the time from
 * GNOME's wall clock (GnomeDesktop.WallClock, as Shell's lock screen) and calls
 * present() on each of its ticks.
 *
 * Styles (`idle-clock-style`): icon and time · time only · icon only · icon and time
 * with seconds. The time's format (12/24 h, locale) is GNOME's.
 */

import {DAYPARTS, daypartAt} from '../../kit/daypart.js';

export const STYLES = Object.freeze(['icon-time', 'time', 'icon', 'seconds']);
export const DEFAULT_STYLE = 'icon-time';

/** This plan's own keys (ARCHITECTURE rule 9: shown under it on the Island page). */
export const keys = Object.freeze(['idle-clock-style']);

/**
 * @param {string} daypart  one of DAYPARTS
 * @returns {string} file URI of its picture (icons/daypart-<part>.svg, a colour SVG:
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
 * @param {object} opts  this plan's keys' values
 * @returns {boolean} the wall clock must tick every second
 */
export function seconds(opts) {
    return styleOf(opts) === 'seconds';
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
    const text = typeof clock === 'string' && clock.trim() ? clock.trim() : null;
    const leading = style === 'time' ? null : {art: iconFor(daypart), icon: 'preferences-system-time-symbolic'};
    return {
        leading,
        text: style === 'icon' ? null : text,
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

export default {keys, present, seconds, relevance};
