import {PRIORITY} from '../../kit/model/activity.js';
import {MODES} from '../../kit/model/displays.js';

export {MODES, modesFor, modeOf, monitorKey, diffMonitors} from '../../kit/model/displays.js';
export {isHeadphones, outputOf} from '../../kit/model/audio.js';

/**
 * A display or headphones plugged in (FEATURES M4 "Headphones / display plugged", design/compact
 * "Cắm màn hình và tai nghe", 2026-11-15, Ethan). Pure: the source reads Mutter's monitors and
 * Shell's Gvc mixer and hands the facts here.
 *
 * Event: {what: 'display-in', name, size?, mode?, modes?, setMode?, settled?, open?}
 *        {what: 'display-out', name, settled?, open?}
 *        {what: 'audio', output: 'headphones'|'speakers', name?, level?, muted?, open?}
 *        {what: 'audio-out', name?, device?, level?, muted?, open?}  headphones unplugged (a jack)
 *          or gone (Bluetooth, USB: `device`); the level is the speakers' now
 *        {what: 'offer', name?, current?, use?, open?}  headphones plugged in that the sound does not
 *          use yet (a card whose profiles part speakers and headphones, kept on the speakers)
 */

// every flash that only tells is 3 s (Ethan, 2026-11-16: 2.5, 3, 4 and 6 s made one)
export const TTL = 3000;
// A display's flash waits for you: the screens go dark and come back while the layout is set, for
// seconds nothing tells (Ethan, 2026-11-15: 3 s, then 6 s, were over by then). It stays until the
// first input after the plug (`settled`, the source's user-active watch), then DISPLAY_TTL;
// with no input, DISPLAY_WAIT at most.
export const DISPLAY_TTL = 3000;
export const DISPLAY_WAIT = 30000;
// headphones plugged in but not used: Use is on its card (an alert, held while you are there), so
// the pill after it is a flash like the others
export const OFFER_TTL = 3000;

const DISPLAY_PANEL = 'gnome-display-panel.desktop';
const SOUND_PANEL = 'gnome-sound-panel.desktop';

/**
 * The headphones the sound just left: unplugged or gone, or only switched away from by hand
 * (Quick Settings' list) while still there.
 *
 * @param {{device: boolean, port: ?string}} prev  outputOf() of the headphones
 * @param {?{ports: Array<{port: string, available: boolean}>}} sink  their sink now (null: gone,
 *   as a Bluetooth sink, or a SOF card's headphones profile left)
 * @returns {boolean}
 */
export function headphonesGone(prev, sink) {
    if (!sink)
        return true;
    if (prev.device)
        return false;       // a Bluetooth / USB sink still there: switched by hand
    const p = sink.ports.find(x => x.port === prev.port);
    return !p || p.available === false;
}

/**
 * @param {?{key: string, output: string}} shown  the output last flashed (null: not read yet)
 * @param {{key: string, output: string}} cur
 * @returns {boolean} the sound moved to or from headphones, or to other headphones
 */
export function outputChanged(shown, cur) {
    if (!shown)
        return false;
    if (shown.output !== cur.output)
        return true;
    return cur.output === 'headphones' && shown.key !== cur.key;
}

// the volume as the HUD's pill shows it: its bar and number (0–100+ %), muted dimmed at its level
// — a bar, so it is not read as a battery (Ethan, 2026-11-17)
function volume(level, muted) {
    if (typeof level !== 'number' || !Number.isFinite(level))
        return null;
    return {bar: Math.min(Math.max(level, 0), 1), label: `${Math.max(0, Math.round(level * 100))}%`, ...muted === true ? {off: true} : {}};
}

function display(ev) {
    const name = typeof ev.name === 'string' && ev.name.trim() ? ev.name.trim() : 'Display';
    const open = typeof ev.open === 'function' ? () => ev.open(DISPLAY_PANEL) : null;
    const ttl = ev.settled === true ? DISPLAY_TTL : DISPLAY_WAIT;
    if (ev.what === 'display-out') {
        return {
            leading: 'video-display-symbolic', text: `Unplugged ${name}`, trailing: null, sizeHint: 'wide',
            ttl, priority: PRIORITY.device, compact: null, expanded: null, onPress: open,
        };
    }
    const set = typeof ev.setMode === 'function' ? ev.setMode : null;
    const modes = (Array.isArray(ev.modes) ? ev.modes : []).filter(m => MODES[m]);
    const mode = MODES[ev.mode] ? ev.mode : null;
    const line = [ev.size, mode ? MODES[mode].word : null].filter(Boolean).join(' · ');
    return {
        leading: 'video-display-symbolic',
        text: name,
        trailing: null,
        sizeHint: 'wide',
        ttl,
        priority: PRIORITY.device,
        // hovered: the ways to use it, as the power-mode compact (design/compact)
        compact: set && modes.length ? {
            card: {picture: {icon: 'video-display-symbolic', backdrop: true}, title: name, app: line || null, tight: true},
        } : null,
        expanded: null,
        actions: set ? modes.map(m => ({id: m, label: MODES[m].label, icon: MODES[m].icon, selected: m === mode})) : [],
        minimalAction: false,
        attributes: {mode},
        onAction: set ? id => MODES[id] && set(id) : null,
        onPress: open,
    };
}

function audio(ev) {
    const headphones = ev.output === 'headphones';
    const fallback = headphones ? 'Headphones' : 'Speakers';
    const name = typeof ev.name === 'string' && ev.name.trim() ? ev.name.trim() : fallback;
    return {
        leading: headphones ? 'audio-headphones-symbolic' : 'audio-speakers-symbolic',
        text: name,
        trailing: volume(ev.level, ev.muted),
        sizeHint: 'wide',
        ttl: TTL,
        priority: PRIORITY.device,
        compact: null,
        expanded: null,
        attributes: {output: headphones ? 'headphones' : 'speakers'},
        onPress: typeof ev.open === 'function' ? () => ev.open(SOUND_PANEL) : null,
    };
}

// Headphones plugged in that the sound does not go to: the system kept the speakers (WirePlumber
// keeps a card's profile; on a SOF card speakers and headphones are two profiles). Hovered: Use,
// which moves the output there as Quick Settings' output list does (Ethan, 2026-11-15)
function offer(ev) {
    const name = typeof ev.name === 'string' && ev.name.trim() ? ev.name.trim() : 'Headphones';
    const current = typeof ev.current === 'string' && ev.current.trim() ? ev.current.trim() : null;
    const use = typeof ev.use === 'function' ? ev.use : null;
    return {
        leading: 'audio-headphones-symbolic',
        text: `${name} plugged in`,
        trailing: null,
        sizeHint: 'wide',
        ttl: OFFER_TTL,
        priority: PRIORITY.device,
        compact: use ? {
            card: {
                picture: {icon: 'audio-headphones-symbolic', backdrop: true}, title: name,
                app: current ? `Sound on ${current}` : null, tight: true,
            },
        } : null,
        expanded: null,
        actions: use ? [{id: 'use', label: 'Use', icon: 'audio-headphones-symbolic'}] : [],
        minimalAction: false,
        attributes: {output: 'offer'},
        onAction: use ? id => id === 'use' && use() : null,
        onPress: typeof ev.open === 'function' ? () => ev.open(SOUND_PANEL) : null,
    };
}

// Headphones unplugged or gone (Ethan, 2026-11-16: plugging in says so, unplugging too): their
// icon, as a display's unplug; the level is where the sound is now, the speakers
function audioOut(ev) {
    const own = typeof ev.name === 'string' && ev.name.trim() ? ev.name.trim() : 'Headphones';
    return {
        leading: 'audio-headphones-symbolic',
        text: ev.device === true ? `Disconnected ${own}` : 'Unplugged Headphones',
        trailing: volume(ev.level, ev.muted),
        sizeHint: 'wide',
        ttl: TTL,
        priority: PRIORITY.device,
        compact: null,
        expanded: null,
        attributes: {output: 'speakers'},
        onPress: typeof ev.open === 'function' ? () => ev.open(SOUND_PANEL) : null,
    };
}

export default {
    device(ev) {
        if (ev?.what === 'audio-out')
            return audioOut(ev);
        if (ev?.what === 'offer')
            return offer(ev);
        if (ev?.what === 'display-in' || ev?.what === 'display-out')
            return display(ev);
        if (ev?.what === 'audio' && (ev.output === 'headphones' || ev.output === 'speakers'))
            return audio(ev);
        return null;
    },
};
