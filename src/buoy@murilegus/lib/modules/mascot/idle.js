/**
 * The mascot idle plan (MASCOT.md § Eyes, FEATURES M4 "Idle plan `mascot`"): Bu's eyes in
 * the idle pill. Pure (no St, no timer): the mode comes from the part of the day and the
 * feed's state (no input for 60 s, power-saver, animations); the light's modes (missed,
 * waiting) are put over it by the kit (presentation.js planIdle), which also owns the
 * stroll's one timer (ui/present/motion.js).
 */

import {daypartAt} from '../../kit/model/daypart.js';
import {eyesMode} from '../../kit/model/mascot.js';

/** This plan's own keys (ARCHITECTURE rule 9: shown under it on the Island page). */
export const keys = Object.freeze(['idle-mascot-stroll']);

const NAMES = {idle: 'Bu', sleep: 'Bu, asleep'};

/**
 * @param {object} ctx
 * @param {Date} ctx.now
 * @param {*} [ctx.starts]  `daypart-starts`
 * @param {?object} [ctx.data]  the feed's state {idleInput, powerSaver, animations}
 * @param {object} [opts]  this plan's keys' values
 * @returns {object} presentation data for the idle pill: {leading: {eyes, stroll}}
 */
export function present({now, starts, data = null}, opts = {}) {
    const d = data ?? {};
    const mode = eyesMode({
        daypart: daypartAt(now, starts),
        idleInput: d.idleInput === true,
        powerSaver: d.powerSaver === true,
        animations: d.animations !== false,
    });
    return {
        leading: {eyes: mode, stroll: opts['idle-mascot-stroll'] !== false},
        text: null,
        accessibleName: NAMES[mode],
    };
}

/**
 * `auto` (SPEC §2a-iii): 10, like the clock (ties take turns), when listed in
 * `idle-auto-plans`.
 *
 * @returns {{score: number}}
 */
export function relevance() {
    return {score: 10};
}

export default {keys, present, relevance};
