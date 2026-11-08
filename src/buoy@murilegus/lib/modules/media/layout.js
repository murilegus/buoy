/**
 * The Media tab's sizes and words, pure (tab.js draws them; tests/media.test.js).
 *
 * Layout A (2026-11-08, Ethan): the art is a square as tall as the tab's room, so the tab
 * fills the panel's expanded height at every size; the track, the players and the
 * controls stand in the column beside it.
 */

export const ART_MIN = 96;
export const ART_MAX = 280;
/** the art never takes more than this share of the tab's width: the column needs the rest */
export const ART_SHARE = 0.4;

/**
 * @param {number} room  the tab's content height, px
 * @param {number} width  the tab's content width, px
 * @returns {number} the art's side: the room, at most ART_SHARE of the width, even, within
 *   ART_MIN–ART_MAX
 */
export function artSize(room, width) {
    const tall = Number.isFinite(room) ? room : 0;
    const wide = Number.isFinite(width) ? Math.floor(width * ART_SHARE) : 0;
    const side = Math.min(tall, wide);
    return Math.min(ART_MAX, Math.max(ART_MIN, side - (side % 2)));
}

/**
 * The line under the artist: the album and the player's name ("Single · Rhythmbox",
 * "YouTube · Firefox" never invented: only what the player sends).
 *
 * @param {object} at  the activity's attributes
 * @returns {string} '' when neither
 */
export function metaLine(at = {}) {
    return [at.album, at.app].filter(t => typeof t === 'string' && t.trim()).join(' · ');
}
