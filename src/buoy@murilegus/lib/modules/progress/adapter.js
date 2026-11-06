/**
 * progress adapter (SPEC §6c, FEATURES M3 "progress"): an app's progress as Unity's
 * LauncherEntry reports it — Files on Ubuntu (its libunity patch), Chrome. LauncherEntry
 * says only which app is busy and how far: one pill per app, the fraction summed over
 * all it is doing; no names, no source → destination. Pure: the source merges the D-Bus
 * signals with applyUpdate() and asks transition() what happened.
 *
 * Event: {id, slug, name, icon, progress, count, countVisible, phase: 'running'|'done', focus?}
 */

/** "Done" stays this long in the pill, then the activity ends (SPEC §6c). */
export const DONE_TTL = 2500;
/** A progress hidden at or above this ended; below, it was stopped (cancelled, closed). */
export const DONE_AT = 0.99;
/** A pill left "in the background" dims after this without word from the app. */
export const BACKGROUND_STALE = 10 * 60 * 1000;

// What an app's own notifications say about its progress, by GNotification id (the same
// in every language). Files, closed while an operation runs, stops sending LauncherEntry
// and posts "N file operations active" (id `progress`), then "All file operations have
// been completed" (`transfer-complete`) — seen in headless Shell 2026-11-05.
const APP_NOTIFICATIONS = {
    'org.gnome.Nautilus.desktop': {'progress': 'background', 'transfer-complete': 'done'},
};

/**
 * @param {?string} appId  the notification's app (desktop id)
 * @param {?string} notificationId  its GNotification id
 * @returns {?string} 'background' | 'done' | null
 */
export function appSignal(appId, notificationId) {
    return APP_NOTIFICATIONS[appId]?.[notificationId] ?? null;
}

// libunity's defaults (as Ubuntu Dock's launcherAPI.js launcherEntryDefaults)
const DEFAULTS = Object.freeze({progress: 0, progressVisible: false, count: 0, countVisible: false, urgent: false});
const KEYS = {
    'progress': ['progress', v => typeof v === 'number' && Number.isFinite(v), v => Math.min(Math.max(v, 0), 1)],
    'progress-visible': ['progressVisible', v => typeof v === 'boolean', v => v],
    'count': ['count', v => Number.isInteger(v), v => Math.max(0, v)],
    'count-visible': ['countVisible', v => typeof v === 'boolean', v => v],
    'urgent': ['urgent', v => typeof v === 'boolean', v => v],
};

// Apps whose count means downloads (libunity's count is the app's own number), by the
// registry's slug: google-chrome.desktop and com.google.Chrome.desktop are both `chrome`
const DOWNLOADERS = new Set(['chrome', 'chromium', 'microsoft-edge', 'brave-browser']);

/**
 * @param {*} uri  the signal's app_uri ("application://org.gnome.Nautilus.desktop")
 * @returns {?string} the desktop id
 */
export function appIdOf(uri) {
    if (typeof uri !== 'string')
        return null;
    return uri.replace(/(^\w+:|^)\/\//, '') || null;
}

/**
 * @param {?object} entry  the app's last state, or undefined
 * @param {object} props  the signal's properties, unpacked
 * @returns {object} a new state: the known keys, typed and clamped; the rest kept
 */
export function applyUpdate(entry, props) {
    const next = {...DEFAULTS, ...entry};
    for (const [key, value] of Object.entries(props ?? {})) {
        const rule = KEYS[key];
        if (rule && rule[1](value))
            next[rule[0]] = rule[2](value);
    }
    return next;
}

/**
 * What a new state means for the pill. Files resets progress to 0 as it hides it, so the
 * end is judged on the last progress seen while visible.
 *
 * @param {?object} prev  the last state (undefined: never seen)
 * @param {?object} next  the new state; null when the app left the bus
 * @returns {?string} 'start' | 'update' | 'done' | 'stop' | null
 */
export function transition(prev, next) {
    const was = prev?.progressVisible === true;
    const is = next?.progressVisible === true;
    if (!was)
        return is ? 'start' : null;
    if (!is)
        return next && prev.progress >= DONE_AT ? 'done' : 'stop';
    const same = next.progress === prev.progress && next.count === prev.count &&
        next.countVisible === prev.countVisible;
    return same ? null : 'update';
}

/** @param {number} fraction @returns {number} 0–100 */
export function percent(fraction) {
    return Math.round(fraction * 100);
}

/**
 * @param {number} count
 * @param {boolean} visible
 * @param {string} slug  the app
 * @returns {?string} "2 downloads" for browsers, "2 items" otherwise; null when hidden
 */
export function countText(count, visible, slug) {
    if (!visible || !(count > 0))
        return null;
    const noun = DOWNLOADERS.has(slug) ? 'download' : 'item';
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export default {
    progress(ev) {
        const name = ev.name || ev.slug || ev.id;
        const onPress = typeof ev.focus === 'function' ? () => ev.focus() : null;
        if (ev.phase === 'done') {
            return {
                leading: {icon: 'object-select-symbolic'}, text: `${name} · Done`, trailing: null,
                compact: null, ttl: DONE_TTL, staleAfter: 0, onPress,
                attributes: {app: name, count: null, phase: 'done'},
            };
        }
        if (ev.phase === 'background') {
            return {
                leading: ev.icon ? {icon: ev.icon} : {icon: 'folder-download-symbolic'},
                text: `${name} · in background`, trailing: null,
                compact: {
                    leading: ev.icon ? {icon: ev.icon} : null, text: name,
                    subtitle: 'Still working in the background',
                },
                ttl: 0, staleAfter: BACKGROUND_STALE, onPress,
                attributes: {app: name, count: null, phase: 'background'},
            };
        }
        const pct = `${percent(ev.progress)}%`;
        const count = countText(ev.count, ev.countVisible, ev.slug);
        return {
            leading: {progress: ev.progress}, text: name, trailing: {text: pct},
            compact: {
                leading: ev.icon ? {icon: ev.icon} : null, text: name,
                subtitle: count ? `${count} · ${pct}` : pct, progress: ev.progress,
            },
            ttl: 0, staleAfter: 0, onPress,
            attributes: {app: name, count, phase: 'running'},
        };
    },
};
