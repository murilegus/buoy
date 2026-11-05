/**
 * input adapter (SPEC §2e, FEATURES M3 "input"): the input source you switch to — an
 * xkb layout or an IBus engine, or an IBus engine's own mode (Bamboo's V / E) — as a
 * short feedback pill. Pure: the source turns Shell's InputSource and its IBus
 * properties into plain data.
 *
 * Event: {id, label, name, open?}
 */

/** Feedback lasts ~1.5 s; another switch updates the pill and restarts it. */
export const TTL = 1500;
export const ICON = 'input-keyboard-symbolic';
export const PANEL = 'gnome-keyboard-panel.desktop';

const graphemes = text => [...new Intl.Segmenter().segment(text)].length;

/**
 * What Shell's input source indicator shows for a source (ui/status/keyboard.js): the
 * visible IBus `InputMode` property's symbol (or label) when it is 1–2 graphemes
 * (_buildPropSection), else the source's short name.
 *
 * @param {?{shortName: string, props?: Array<{key: string, visible: boolean, symbol?: string, label?: string}>}} source
 * @returns {?string}
 */
export function labelOf(source) {
    if (!source)
        return null;
    const mode = (source.props ?? []).find(p => p.key === 'InputMode' && p.visible);
    const text = mode ? mode.symbol || mode.label || '' : '';
    if (text && graphemes(text) < 3)
        return text;
    return source.shortName ?? null;
}

/**
 * Whether a `current-source-changed` should flash. Shell emits it with the old source
 * for a real switch, and with null when the current source's IBus properties are
 * registered or updated — at startup, or a mode change inside the engine: then only a
 * change in what is shown counts.
 *
 * @param {object} args
 * @param {boolean} args.switched  Shell passed an oldSource other than the current one
 * @param {?string} args.label  labelOf() the current source
 * @param {?string} args.lastLabel  what Buoy last saw; null before anything
 * @returns {boolean}
 */
export function shouldFlash({switched, label, lastLabel}) {
    if (!label)
        return false;
    if (switched)
        return true;
    return lastLabel !== null && label !== lastLabel;
}

/** A press counts as the same held Super+Space only this soon after the last one. */
export const CHAIN_MS = 1500;

/**
 * Super+Space without GNOME's switcher (SPEC §2e): which source a press picks, as an
 * index into the MRU list taken when the press chain began (current source first) —
 * the order the switcher shows. A first press picks the source used before (1), or
 * backward the least recent; while Super stays held each further press moves one on.
 *
 * @param {object} args
 * @param {number} args.n  sources in that list
 * @param {?number} args.chain  the index the last press of this chain picked, or null
 * @param {boolean} args.backward  Shift (switch-input-source-backward)
 * @returns {?number} null when there is nothing to switch to
 */
export function switchStep({n, chain, backward}) {
    if (!(n >= 2))
        return null;
    const from = chain ?? 0;
    return ((from + (backward ? -1 : 1)) % n + n) % n;
}

/**
 * The modifier a keybinding is held with: its highest bit (a port of ui/switcherPopup.js
 * primaryModifier, which is not exported). 0 when there is none.
 *
 * @param {number} mask  Clutter.ModifierType bits
 * @returns {number}
 */
export function primaryModifier(mask) {
    if (!mask)
        return 0;
    let primary = 1;
    while (mask > 1) {
        mask >>= 1;
        primary <<= 1;
    }
    return primary;
}

export default {
    input(ev) {
        const label = typeof ev.label === 'string' ? ev.label.trim() : '';
        const name = typeof ev.name === 'string' ? ev.name.trim() : '';
        const short = /^[a-z]{1,3}[₀-₉]?$/.test(label) ? label.toUpperCase() : label;
        const text = [short, name].filter(Boolean).join(' · ');
        if (!text)
            return null;
        return {
            leading: {icon: ICON}, text, trailing: null, sizeHint: 'normal',
            onPress: typeof ev.open === 'function' ? () => ev.open(PANEL) : null,
            ttl: TTL,
        };
    },
};
