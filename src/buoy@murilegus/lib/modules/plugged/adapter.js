import {PRIORITY} from '../../kit/model/activity.js';

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

export const TTL = 3000;
// A display's flash waits for you: the screens go dark and come back while the layout is set, for
// seconds nothing tells (Ethan, 2026-11-15: 3 s, then 6 s, were over by then). It stays until the
// first input after the plug (`settled`, the source's user-active watch), then DISPLAY_TTL;
// with no input, DISPLAY_WAIT at most.
export const DISPLAY_TTL = 4000;
export const DISPLAY_WAIT = 30000;
// headphones plugged in but not used: as long, time to hover and press Use
export const OFFER_TTL = 6000;

const DISPLAY_PANEL = 'gnome-display-panel.desktop';
const SOUND_PANEL = 'gnome-sound-panel.desktop';

/**
 * The ways to use two displays, as GNOME's Super+P switcher names them (js/ui/switchMonitor.js),
 * in its order; "Built-in Only" is left out (Ethan: a display is plugged in to be used).
 * `config` is Meta.MonitorSwitchConfigType's name.
 */
export const MODES = Object.freeze({
    join: {label: 'Join', icon: 'shell-display-extend-all-symbolic', config: 'ALL_LINEAR', word: 'joined'},
    mirror: {label: 'Mirror', icon: 'shell-display-mirror-symbolic', config: 'ALL_MIRROR', word: 'mirrored'},
    external: {label: 'External Only', icon: 'shell-display-external-only-symbolic', config: 'EXTERNAL', word: 'external only'},
});

/**
 * @param {{canSwitch?: boolean, builtin?: boolean}} mm  Mutter's monitor manager: can_switch_config(), has-builtin-panel
 * @returns {string[]} the modes offered (switchMonitor.js: External Only with a built-in panel)
 */
export function modesFor({canSwitch = false, builtin = false} = {}) {
    if (!canSwitch)
        return [];
    return builtin ? ['join', 'mirror', 'external'] : ['join', 'mirror'];
}

/**
 * How the displays are used now, from what Mutter runs (get_switch_config() says UNKNOWN for a
 * layout set in Settings): the built-in panel off is external only, a logical monitor holding
 * two displays is mirrored, else joined.
 *
 * @param {{count?: number, builtinOn?: boolean, builtin?: boolean, mirrored?: boolean}} s
 * @returns {?string} a MODES key; null with one display
 */
export function modeOf({count = 0, builtinOn = true, builtin = false, mirrored = false} = {}) {
    if (count < 2 && !(builtin && !builtinOn))
        return null;
    if (builtin && !builtinOn)
        return 'external';
    return mirrored ? 'mirror' : 'join';
}

/**
 * @param {{connector?: string, vendor?: string, product?: string, serial?: string}} m
 * @returns {string} a display's identity: the same panel on the same port
 */
export function monitorKey(m) {
    return [m.connector, m.vendor, m.product, m.serial].map(v => v ?? '').join('|');
}

/**
 * @param {?Array<{key: string}>} prev  the displays last seen (null: not read yet)
 * @param {Array<{key: string}>} cur
 * @returns {{added: object[], removed: object[]}} nothing on the first reading (Buoy turned
 *   on) nor when only the layout changed (Join / Mirror: the same displays)
 */
export function diffMonitors(prev, cur) {
    if (!prev)
        return {added: [], removed: []};
    const was = new Set(prev.map(m => m.key)), is = new Set(cur.map(m => m.key));
    return {added: cur.filter(m => !was.has(m.key)), removed: prev.filter(m => !is.has(m.key))};
}

/**
 * Headphones as GNOME tells them (ui/status/volume.js OutputStreamSlider._findHeadphones): a
 * headset or headphone device (Bluetooth, USB), or a port named so (a jack).
 *
 * @param {{formFactor?: ?string, port?: ?string}} sink
 * @returns {boolean}
 */
export function isHeadphones({formFactor = null, port = null} = {}) {
    if (formFactor === 'headset' || formFactor === 'headphone')
        return true;
    return typeof port === 'string' && port.toLowerCase().includes('headphone');
}

/**
 * The output the sound goes to, as the flash says it: a device's own name for Bluetooth and
 * USB headphones, "Headphones" for a jack, "Speakers" otherwise.
 *
 * @param {{id?: *, formFactor?: ?string, port?: ?string, description?: ?string}} sink
 * @returns {{key: string, output: string, name: string, device: boolean, sinkId: *, port: ?string}}
 *   `device`: headphones of their own (Bluetooth, USB), not a jack
 */
export function outputOf(sink = {}) {
    const headphones = isHeadphones(sink);
    const device = sink.formFactor === 'headset' || sink.formFactor === 'headphone';
    const own = typeof sink.description === 'string' && sink.description.trim() ? sink.description.trim() : null;
    return {
        key: `${sink.id ?? ''}|${sink.port ?? ''}`,
        output: headphones ? 'headphones' : 'speakers',
        name: headphones ? (device && own) || 'Headphones' : 'Speakers',
        device: headphones && device,
        sinkId: sink.id ?? null,
        port: sink.port ?? null,
    };
}

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

// the volume as the HUD's pill shows it: 0–100+ %, muted said so
function volumeText(level, muted) {
    if (muted === true)
        return 'Muted';
    if (typeof level !== 'number' || !Number.isFinite(level))
        return null;
    return `${Math.max(0, Math.round(level * 100))}%`;
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
    const vol = volumeText(ev.level, ev.muted);
    return {
        leading: headphones ? 'audio-headphones-symbolic' : 'audio-speakers-symbolic',
        text: name,
        trailing: vol ? {text: vol} : null,     // a text, not an icon's name
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
    const vol = volumeText(ev.level, ev.muted);
    return {
        leading: 'audio-headphones-symbolic',
        text: ev.device === true ? `Disconnected ${own}` : 'Unplugged Headphones',
        trailing: vol ? {text: vol} : null,
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
