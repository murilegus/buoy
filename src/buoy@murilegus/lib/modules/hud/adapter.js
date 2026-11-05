/**
 * hud adapter (SPEC §2e, FEATURES M3 "hud"): every OSD GNOME shows — through
 * Main.osdWindowManager — and Buoy's own Caps / Num Lock, as one feedback pill. Pure:
 * the source hands it what the OSD was given (icon, label, level) and an opener for
 * Settings; it never measures.
 *
 * Event: {id, iconName, gicon?, label?, level?, maxLevel?, lock?: 'caps'|'num', on?, open?}
 */

/** Feedback lasts ~1.5 s; a repeat updates the pill and restarts it (SPEC §2e). */
export const TTL = 1500;

// OSDs without a label of their own (gsd-media-keys-manager.c sends none for these)
const WORDS = {
    'input-touchpad-symbolic': 'Touchpad on',
    'touchpad-disabled-symbolic': 'Touchpad off',
    'rotation-locked-symbolic': 'Rotation locked',
    'rotation-allowed-symbolic': 'Rotation unlocked',
    'media-eject-symbolic': 'Eject',
};

const PANELS = {
    volume: 'gnome-sound-panel.desktop',
    mic: 'gnome-sound-panel.desktop',
    brightness: 'gnome-display-panel.desktop',
    keyboard: 'gnome-keyboard-panel.desktop',
    battery: 'gnome-power-panel.desktop',
    touchpad: 'gnome-mouse-panel.desktop',
};

/**
 * What an OSD is about, from its icon name (gsd-media-keys get_icon_name_for_volume,
 * Shell's volume.js / brightnessManager.js).
 *
 * @param {?string} name
 * @returns {string} volume | mic | brightness | keyboard | battery | touchpad | other
 */
export function family(name) {
    const n = typeof name === 'string' ? name : '';
    if (/^(microphone-|audio-input-microphone)/.test(n))
        return 'mic';
    if (n.startsWith('audio-volume-'))
        return 'volume';
    if (n.startsWith('display-brightness'))
        return 'brightness';
    if (n.startsWith('keyboard-brightness'))
        return 'keyboard';
    if (n.startsWith('battery'))
        return 'battery';
    if (n === 'input-touchpad-symbolic' || n === 'touchpad-disabled-symbolic')
        return 'touchpad';
    return 'other';
}

/** @param {?string} name @returns {boolean} the volume or mic icon says muted */
export function isMuted(name) {
    return typeof name === 'string' && name.includes('-muted');
}

/** @param {number} level 0…maxLevel @returns {number} 0–100, more when amplified */
export function percent(level) {
    return Math.max(0, Math.round(level * 100));
}

/** @param {string} fam @returns {?string} the Settings panel a click opens */
export function panelFor(fam) {
    return PANELS[fam] ?? null;
}

const hasLevel = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export default {
    osd(ev) {
        const name = typeof ev.iconName === 'string' ? ev.iconName : '';
        const icon = ev.gicon ?? (name || null);
        const fam = family(name);
        const panel = panelFor(fam);
        // Every field is set, null when unused: the source updates one pill in place and
        // stack.update merges, so a toggle after a level must clear the old bar.
        const base = {
            leading: icon ? {icon} : null, text: null, trailing: null, sizeHint: 'normal',
            onPress: panel && typeof ev.open === 'function' ? () => ev.open(panel) : null,
            ttl: TTL,
        };

        if (ev.lock) {
            const what = ev.lock === 'num' ? 'Num Lock' : 'Caps Lock';
            return {...base, text: `${what} ${ev.on ? 'on' : 'off'}`};
        }
        if (hasLevel(ev.level)) {
            return {
                ...base,
                text: ev.label || null,          // gsd names an external output (Headphones)
                trailing: {
                    bar: Math.min(ev.level, 1), label: String(percent(ev.level)),
                    ...isMuted(name) ? {off: true} : {},
                },
                sizeHint: 'wide',
            };
        }
        const text = ev.label || WORDS[name] || null;
        if (!text && !icon)
            return null;
        return {...base, text};
    },
};
