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
