/**
 * Media (FEATURES M3 "media", SPEC §6, 2026-11-05). Pure: event → presentation data.
 *
 *   minimal   art · "title · artist" · equaliser while playing, its bars stopped low when
 *             paused (2026-11-07, Ethan: was ⏸); no button
 *             (Ethan: the transport lives in the compact). A side pill keeps art + glyph.
 *   compact   art 40 · title / artist · app · ⏮ ⏯ ⏭ (only those the player can) · the
 *             position, live, with elapsed and remaining; display only
 *   expanded  the stack's own view (alert): art, title, artist, transport
 *
 * Paused, the pill goes after `media-hide-paused-after` minutes (the event's
 * `hideAfter`, ms) through its ttl; playing again clears it.
 *
 * The event (source.js): {id, title, artist, album, art, appName, status, canPrev,
 * canNext, canSeek, position, length, at (ms), shuffle, loop, ad, hideAfter,
 * compactOnHover, raise(), onAction(id, value?)}.
 */

export const ICON = 'audio-x-generic-symbolic';
export const PAUSED_ICON = 'media-playback-pause-symbolic';
/** The minimal pill's trailing while paused: the equaliser stopped low (kit glyph). */
export const PAUSED_EQ = 'eq-paused';
export const DEFAULT_HIDE_AFTER = 5 * 60 * 1000;

const str = v => typeof v === 'string' && v.trim() ? v.trim() : '';
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * @param {object} ev
 * @returns {object[]} ⏮ ⏯ ⏭, only those the player can do
 */
export function transport(ev) {
    const playing = ev.status === 'Playing';
    return [
        ev.canPrev ? {id: 'prev', icon: 'media-skip-backward-symbolic'} : null,
        {id: 'playpause', icon: playing ? PAUSED_ICON : 'media-playback-start-symbolic'},
        ev.canNext ? {id: 'next', icon: 'media-skip-forward-symbolic'} : null,
    ].filter(Boolean);
}

/**
 * @param {object} ev
 * @returns {?object} a live position for the compact's bar, or null when unknown
 */
export function liveOf(ev) {
    const length = num(ev.length), position = num(ev.position);
    if (!length || length <= 0 || position === null)
        return null;
    return {position, length, at: num(ev.at) ?? 0, playing: ev.status === 'Playing'};
}

export default {
    media(ev, _profile) {
        const playing = ev.status === 'Playing';
        const title = str(ev.title) || 'Unknown title';
        const artist = str(ev.artist);
        const app = str(ev.appName);
        const art = {art: str(ev.art) || null, icon: ICON};
        const hideAfter = num(ev.hideAfter) ?? DEFAULT_HIDE_AFTER;
        return {
            attributes: {title, artist, album: str(ev.album), art: art.art, app},
            state: {
                status: ev.status, canSeek: ev.canSeek === true, shuffle: ev.shuffle ?? null,
                loop: ev.loop ?? null, live: liveOf(ev),
            },
            leading: art,
            text: artist ? `${title} · ${artist}` : title,    // a profile `title` is the registry's
            trailing: playing ? 'eq' : PAUSED_EQ,
            ttl: playing ? 0 : hideAfter,
            compact: ev.compactOnHover === false ? null : {
                leading: art, text: title,
                subtitle: [artist, app].filter(Boolean).join(' · ') || null,
                transport: true, progress: liveOf(ev),
            },
            expanded: {
                leading: {art: art.art, icon: ICON},
                center: {title, subtitle: artist || app || null},
                bottom: {transport: true},
            },
            actions: transport(ev),
            minimalAction: false,
            onPress: ev.raise,
            onAction: ev.onAction,
        };
    },
};
