// Home's layout (design/home, decided 2026-11-11/12): a main card on top and one row of
// tiles under it, worked out again each time Home opens and each time the stack changes —
// never empty, never scrolling. Pure: the sizes come in, the plan goes out; kit/ui/home.js
// makes the actors.

import {planMinimal} from './presentation.js';

/** Tiles of at least this width fit in a row; with the gap, 128 per tile (design/home). */
export const TILE_MIN = 120;
export const TILE_GAP = 8;
/** The row of tiles, and the gap between it and the main card. */
export const TILE_H = 100;
export const CARD_GAP = 8;
/** A main card this tall or more has the tall form (the title larger, buttons under the bar). */
export const TALL_FROM = 160;
/** A tile this wide or more shows its detail column. */
export const DETAIL_FROM = 200;

/** Icons in a tile's corner before "+N", at most (the Missed tile's apps). */
export const CORNER_ICONS = 3;

/**
 * How many icons a tile's corner holds beside its leading cell, keeping room for "+N": the
 * tile less its padding (12 each side), the 20 cell and the 8 before the corner; each icon
 * 16 and its 4 gap, "+N" about 24 (2026-11-13: a 128 tile has room for two and "+N").
 *
 * @param {number} width  the tile's
 * @returns {number} 1 … CORNER_ICONS
 */
export function cornerMax(width) {
    const room = (Number.isFinite(width) ? width : 0) - 24 - 20 - 8;
    return Math.max(1, Math.min(CORNER_ICONS, Math.floor((room - 24) / 20)));
}

/**
 * What the Missed tile's corner shows (design/home, 2026-11-13, Ethan): the apps behind it,
 * as icons, each once in its first place, up to CORNER_ICONS, then how many more.
 *
 * @param {string[]} icons  in order, repeats allowed
 * @param {number} [max]
 * @returns {{icons: string[], more: number}}
 */
export function cornerIcons(icons, max = CORNER_ICONS) {
    const all = [...new Set((Array.isArray(icons) ? icons : []).filter(i => typeof i === 'string' && i))];
    return {icons: all.slice(0, max), more: Math.max(0, all.length - max)};
}

/**
 * @param {number} width  the row's width (expanded less its 12 each side)
 * @returns {number} N, how many tiles a row holds, each at least TILE_MIN: 4 at 1920, 5 at
 *   2560 and 3440
 */
export function tilesPerRow(width) {
    return Math.max(1, Math.floor((width + TILE_GAP) / (TILE_MIN + TILE_GAP)));
}

/**
 * Home's plan (design/home "Cách lấp hàng ô"):
 *
 * 1. N tiles a row (tilesPerRow).
 * 2. The main card is the stack's first activity, or the greeting with none. The other
 *    activities get a tile each, the Missed tile first; more than N: N − 1 tiles and a
 *    `+K` tile, so every activity can be reached.
 * 3. Room left: the glances, in their order, one tile each; past N they are left out (they
 *    never go into +K).
 * 4. Still room: the glances that can (`wide`: the weather, then Up next) take two units;
 *    still room and nothing to widen: every tile widens to fill the row (`units`).
 *
 * The main card takes the height the row leaves: `low` under TALL_FROM, `tall` from it; no
 * tile at all, the whole height.
 *
 * @param {object} opts
 * @param {object[]} opts.list  visible activities, stack order
 * @param {number} [opts.missed]  things missed (the stack's and the sources' flags)
 * @param {{id: string, wide?: boolean}[]} [opts.glances]  the ready glances, in order
 * @param {number} opts.width  the row's width
 * @param {number} opts.height  the body's height: under the head, less the 12 at the bottom
 * @returns {{n: number, main: ?object, tiles: object[], units: number, mainH: number,
 *   form: 'low'|'tall'}}  main: the first activity, or null for the greeting; each tile
 *   {type: 'missed'|'activity'|'more'|'glance', units, …}
 */
export function planHome({list, missed = 0, glances = [], width, height}) {
    const n = tilesPerRow(width);
    const [main = null, ...rest] = Array.isArray(list) ? list : [];
    /** @typedef {{type: string, units: number, wide?: boolean, canWide?: boolean, id?: string, count?: number, activity?: object}} Tile */
    /** @type {Tile[]} */
    const items = [
        ...Number.isInteger(missed) && missed > 0 ? [{type: 'missed', count: missed, units: 1}] : [],
        ...rest.map(activity => ({type: 'activity', activity, units: 1})),
    ];
    let tiles = items;
    // an ask with choices takes the whole height: the row of tiles waits (wantsWhole)
    if (wantsWhole(main))
        return {n, main, tiles: [], units: 0, mainH: Math.max(0, height), form: height >= TALL_FROM ? 'tall' : 'low'};
    if (items.length > n) {
        const shown = items.slice(0, n - 1);
        // +K: what did not fit; its list ("Ongoing") shows every activity, in stack order
        tiles = [...shown, {type: 'more', count: items.length - shown.length, units: 1}];
    }
    tiles = tiles.map(t => ({...t}));
    for (const g of glances) {
        if (tiles.length >= n)
            break;
        tiles.push({type: 'glance', id: g.id, wide: false, canWide: g.wide === true, units: 1});
    }
    let room = n - tiles.length;
    for (const t of tiles) {
        if (room <= 0)
            break;
        if (t.type === 'glance' && t.canWide) {
            t.units = 2;
            t.wide = true;
            room--;
        }
    }
    tiles.forEach(t => delete t.canWide);
    const units = tiles.reduce((sum, t) => sum + t.units, 0);
    const mainH = Math.max(0, height - (tiles.length ? CARD_GAP + TILE_H : 0));
    return {n, main, tiles, units, mainH, form: mainH >= TALL_FROM ? 'tall' : 'low'};
}

/**
 * Whether Home's main card takes the whole height: an ask with choices (2026-11-13, Ethan:
 * its rows and buttons need more than the low card's 104; a notification's buttons go top
 * right instead and the tiles stay).
 *
 * @param {?object} a  the main activity
 * @returns {boolean}
 */
export function wantsWhole(a) {
    const card = a?.compact?.card;
    return Boolean(card && typeof card === 'object' && card.choices);
}

/**
 * Each tile's width: a unit is the row less its gaps over the units; a wide tile spans two
 * units and the gap between them, so it lines up with the grid (264 = 128 + 8 + 128 at 1920).
 * Whole px, the last taking what rounding leaves — the row is always exactly full.
 *
 * @param {{units: number}[]} tiles
 * @param {number} width  the row's width
 * @returns {number[]}
 */
export function tileWidths(tiles, width) {
    if (!tiles.length)
        return [];
    const units = tiles.reduce((sum, t) => sum + t.units, 0);
    const unit = (width - TILE_GAP * (units - 1)) / units;
    const widths = tiles.map(t => Math.floor(t.units * unit + (t.units - 1) * TILE_GAP));
    widths[widths.length - 1] += width - TILE_GAP * (tiles.length - 1) - widths.reduce((a, b) => a + b, 0);
    return widths;
}

/**
 * An activity as a tile (design/home "Kích thước"): its minimal's leading as the icon, then
 * a value in large figures over a caption. An adapter's own `tile: {value, caption}` or
 * `tile: {live, caption}` (a player's position, the elapsed time) wins;
 * else a text trailing ("2 / 3", "4:59") or a ring ("42%") is the value and the text the
 * caption; else the text alone is the value.
 *
 * @param {object} a  a validated activity
 * @returns {{leading: ?object, value: ?object, caption: ?string, corner: ?object}}  value: an
 *   element (presentation.js element: text, until, since…); corner: the pill's glyph (the
 *   equaliser) for the top right corner, or null
 */
export function tileOf(a) {
    const p = planMinimal(a, {});
    const own = a.tile !== null && typeof a.tile === 'object' ? a.tile : null;
    // the pill's glyph — the equaliser, moving or low, in its cover's colour — in the tile's top
    // right corner (design/home "Ô nhạc", 2026-11-13, Ethan): which tile plays, at a glance
    const corner = p.trailing?.type === 'glyph' ? p.trailing : null;
    // a player's: its live position, the elapsed time running (presentation.js livePosition)
    const live = own?.live;
    if (live && Number.isFinite(live.position) && Number.isFinite(live.length) && live.length > 0)
        return {leading: p.leading, value: {type: 'live', live}, caption: str(own.caption) ?? p.text, corner};
    const text = typeof own?.value === 'string' && own.value ? own.value : null;
    if (text)
        return {leading: p.leading, value: {type: 'text', text}, caption: str(own.caption) ?? p.text, corner};
    const t = p.trailing;
    if (t?.type === 'ring')
        return {leading: p.leading, value: {type: 'text', text: `${Math.round(t.value * 100)}%`}, caption: p.text, corner};
    if (t && ['text', 'until', 'since'].includes(t.type))
        return {leading: p.leading, value: t, caption: p.text, corner};
    return {leading: p.leading, value: p.text ? {type: 'text', text: p.text} : null, caption: null, corner};
}

/**
 * The greeting card's line (design/home: no activity → the greeting).
 *
 * @param {string} daypart  kit/model/daypart.js
 * @param {*} name  the user's real name; its first word is used
 * @returns {string} "Good afternoon, Ethan"; "Good afternoon" without a name
 */
export function greetingLine(daypart, name) {
    const word = {dawn: 'morning', morning: 'morning', noon: 'afternoon', afternoon: 'afternoon', evening: 'evening', night: 'evening'}[daypart] ?? 'day';
    const first = typeof name === 'string' ? name.trim().split(/\s+/)[0] : '';
    return first && first !== 'Unknown' ? `Good ${word}, ${first}` : `Good ${word}`;
}

function str(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}
