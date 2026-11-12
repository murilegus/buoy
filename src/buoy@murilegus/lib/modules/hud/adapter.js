/**
 * hud adapter (SPEC §2e, FEATURES M3 "hud"): every OSD GNOME shows — through
 * Main.osdWindowManager — and Buoy's own Caps / Num Lock, as one feedback pill. Pure:
 * the source hands it what the OSD was given (icon, label, level) and an opener for
 * Settings; it never measures.
 *
 * Event: {id, iconName, gicon?, label?, level?, maxLevel?, lock?: 'caps'|'num'|'fn', on?, open?}
 *
 * The leading icon is the OSD's theme name: Buoy ships a file under that name for each
 * (design/icons "Icon symbolic", kit/ui/present/elements.js iconProps), so it is drawn as
 * the rest of Buoy is; `gicon` is only for an icon that has no name (a file, bytes).
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
    // gsd shows it only for a media key with no MPRIS player to take it
    // (do_multimedia_player_action)
    'action-unavailable-symbolic': 'Nothing playing',
};

// Radio toggles say on / off as the lock keys do (Ethan, 2026-11-12), in place of gsd's
// "Bluetooth Enabled", "Airplane Mode Disabled" (gsd-media-keys-manager.c, the rfkill reply;
// its "Hardware Airplane Mode" says on too)
const TOGGLES = {
    'bluetooth-active-symbolic': 'Bluetooth on',
    'bluetooth-disabled-symbolic': 'Bluetooth off',
    'airplane-mode-symbolic': 'Airplane Mode on',
    'airplane-mode-disabled-symbolic': 'Airplane Mode off',
};

const LOCKS = {caps: 'Caps Lock', num: 'Num Lock', fn: 'Fn Lock'};

// At 0 the level icon is the muted one, as Shell's own sliders draw it (ui/status/volume.js
// StreamSlider.getIcon); gsd sends -low there (get_icon_name_for_volume)
const ZERO = {volume: 'audio-volume-muted-symbolic', mic: 'microphone-sensitivity-muted-symbolic'};

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

/**
 * An Fn Lock indicator in /sys/class/leds: the LED class name `<device>::fnlock`
 * (ideapad-laptop registers `platform::fnlock` with brightness_hw_changed). Drivers that
 * only offer a `fn_lock` file (huawei-wmi, lg-laptop, uniwill-laptop) and machines whose
 * firmware keeps Fn Lock to itself (ThinkPad, Dell, HP, ASUS) are not covered.
 *
 * @param {string} name  a directory name under /sys/class/leds
 * @returns {boolean}
 */
export function isFnLockLed(name) {
    return typeof name === 'string' && /::fnlock$/i.test(name);
}

/**
 * @param {?string} text  what a sysfs brightness file reads ("0\n", "1\n")
 * @returns {?boolean} on, off, or null when it says nothing (ENODATA before any event)
 */
export function ledOn(text) {
    const n = Number.parseInt(String(text ?? '').trim(), 10);
    return Number.isNaN(n) ? null : n > 0;
}

const hasLevel = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export default {
    osd(ev) {
        const name = typeof ev.iconName === 'string' ? ev.iconName : '';
        const fam = family(name);
        const zero = hasLevel(ev.level) && ev.level <= 0 ? ZERO[fam] : null;
        const icon = zero ?? ev.gicon ?? (name || null);
        const panel = panelFor(fam);
        // Every field is set, null when unused: the source updates one pill in place and
        // stack.update merges, so a toggle after a level must clear the old bar.
        const base = {
            leading: icon ? {icon} : null, text: null, trailing: null, sizeHint: 'normal',
            onPress: panel && typeof ev.open === 'function' ? () => ev.open(panel) : null,
            ttl: TTL,
        };

        if (ev.lock) {
            const what = LOCKS[ev.lock] ?? 'Caps Lock';
            return {...base, text: `${what} ${ev.on ? 'on' : 'off'}`};
        }
        if (hasLevel(ev.level)) {
            return {
                ...base,
                text: ev.label || null,          // gsd names an external output (Headphones)
                trailing: {
                    bar: Math.min(ev.level, 1), label: `${percent(ev.level)}%`,
                    ...isMuted(name) ? {off: true} : {},
                },
                sizeHint: 'wide',
            };
        }
        const text = TOGGLES[name] ?? (ev.label || WORDS[name] || null);
        if (!text && !icon)
            return null;
        return {...base, text};
    },
};
