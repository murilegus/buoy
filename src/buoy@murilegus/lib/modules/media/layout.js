/**
 * The Media tab's sizes, controls and words, pure (tab.js draws them; tests/media.test.js).
 *
 * design/media (2026-11-13, Ethan, M1): the body is one card as Home's main card — the
 * art 8 in, as tall as the card less 16 — the text column beside it, the seek bar and the
 * transport at its foot; every control always there, disabled where the player can't.
 * With more than one player, a row of chips above the card.
 */

/** The card's inset around the art (design/media "Kích thước"). */
export const ART_INSET = 8;
/** A chip's height and the gap under the chips' row. */
export const CHIP_H = 32;
export const CHIP_GAP = 8;

/**
 * @param {number} cardH  the card's height, px
 * @returns {number} the art's side: the card less its inset above and below, never below 0
 */
export function artSide(cardH) {
    return Math.max(0, Math.floor(Number.isFinite(cardH) ? cardH : 0) - 2 * ART_INSET);
}

/**
 * @param {number} bodyH  the tab's height, px
 * @param {number} players  how many
 * @returns {number} the card's height: the body, less the chips' row with more than one
 */
export function cardHeight(bodyH, players) {
    const h = Number.isFinite(bodyH) ? Math.floor(bodyH) : 0;
    return Math.max(0, players > 1 ? h - CHIP_H - CHIP_GAP : h);
}

/**
 * The line under the title: "artist · player" (only what the player sends). With `album`,
 * "artist · album · player": the album joins it when the card has no room for its own line
 * (design/media, 2026-11-13, Ethan: two players' chips at 1920).
 *
 * @param {object} at  the activity's attributes
 * @param {{album?: boolean}} [opts]
 * @returns {string} '' when none
 */
export function subLine(at = {}, {album = false} = {}) {
    return [at.artist, album ? at.album : null, at.app].filter(t => typeof t === 'string' && t.trim()).join(' · ');
}

/**
 * The five controls, always all of them (Ethan, 2026-11-13): those the player can't are
 * disabled. `kind`: 'toggle' (no fill when off, fill-3 when on), 'skip' (fill-2), 'main'
 * (cream).
 *
 * @param {object} state  the activity's state: {status, canPrev, canNext, shuffle, loop}
 *   (shuffle: boolean or null when the player has none; loop: 'None'|'Playlist'|'Track' or null)
 * @returns {{id: string, icon: string, kind: string, enabled: boolean, on: boolean, label: string}[]}
 */
export function controls(state = {}) {
    const playing = state.status === 'Playing';
    const loop = typeof state.loop === 'string' ? state.loop : null;
    return [
        {
            id: 'shuffle', icon: 'media-playlist-shuffle-symbolic', kind: 'toggle', label: 'Shuffle',
            enabled: typeof state.shuffle === 'boolean', on: state.shuffle === true,
        },
        {id: 'prev', icon: 'media-skip-backward-symbolic', kind: 'skip', label: 'Previous', enabled: state.canPrev === true, on: false},
        {
            id: 'playpause', icon: playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
            kind: 'main', label: playing ? 'Pause' : 'Play', enabled: true, on: false,
        },
        {id: 'next', icon: 'media-skip-forward-symbolic', kind: 'skip', label: 'Next', enabled: state.canNext === true, on: false},
        {
            id: 'loop', icon: loop === 'Track' ? 'media-playlist-repeat-song-symbolic' : 'media-playlist-repeat-symbolic',
            kind: 'toggle', label: 'Repeat', enabled: loop !== null, on: loop === 'Playlist' || loop === 'Track',
        },
    ];
}

/**
 * The seek bar: always there; it moves the track only when the player can seek and the
 * track has a length (design/media: a stream's bar stays empty and disabled).
 *
 * @param {object} state  {canSeek, live: ?{position, length, at, playing}}
 * @returns {{live: ?object, enabled: boolean}}
 */
export function seekOf(state = {}) {
    const live = state.live && state.live.length > 0 ? state.live : null;
    return {live, enabled: live !== null && state.canSeek === true};
}

/**
 * Which chips keep their name (design/media "Nhiều player"): all of them when they fit the
 * row; else only the chosen one, the others their logo.
 *
 * @param {{named: number, logo: number}[]} widths  each chip's width with and without its name
 * @param {number} chosen  the chosen chip's index
 * @param {number} room  the row's width
 * @param {number} gap  between chips
 * @returns {boolean[]} named, per chip
 */
export function chipNames(widths, chosen, room, gap) {
    const all = widths.reduce((n, w) => n + w.named, 0) + Math.max(0, widths.length - 1) * gap;
    return widths.map((_w, i) => all <= room || i === chosen);
}
