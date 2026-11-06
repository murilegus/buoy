/**
 * progress adapter (SPEC §6c, FEATURES M3 "progress"): an app's progress as Unity's
 * LauncherEntry reports it — Files on Ubuntu (its libunity patch), Chrome. LauncherEntry
 * says only which app is busy and how far: one pill per app, the fraction summed over
 * all it is doing; no names, no source → destination. Pure: the source merges the D-Bus
 * signals with applyUpdate() and asks transition() what happened.
 *
 * Event: {id, slug, name, icon, progress, count, countVisible, phase: 'running'|'done', focus?}
 *
 * Downloads (FEATURES M3 "downloads"): a browser's partial file (`.crdownload`, `.part`) in
 * a watched folder, one pill and one row per file. Nothing says how big it will be, so
 * the pill shows the size so far and the speed, never a % — unless one LauncherEntry
 * covers exactly that file (ringFor). Event: {id (path), file: true, name (file name, null
 * while the browser has not named it),
 * folder, app (browser name or null), appIcon, icon (the file type's, when done), size,
 * speed (bytes/s or null), fraction (0–1 or null), phase: 'running'|'done', focus?, open?}
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

// --- downloads ------------------------------------------------------------------------------

/** A finished download's pill stays this long; its row stays in the tab (history.js). */
export const DOWNLOADED_TTL = 4000;
/** A running download with no new bytes for this long dims (the speed shown is old). */
export const DOWNLOAD_STALE = 30 * 1000;
/** Watched folders besides Downloads (one inotify watch each, SPEC §6c). */
export const MAX_FOLDERS = 10;

// The partial file each browser writes while it downloads, and the browsers (by registry
// slug) that write it: Chromium's family `name.crdownload`, Firefox's `name.part` (beside
// an empty placeholder `name`, replaced by the rename at the end).
const PARTIALS = {
    '.crdownload': ['chrome', 'chromium', 'microsoft-edge', 'brave-browser', 'vivaldi', 'opera'],
    '.part': ['firefox', 'firefox-esr', 'librewolf', 'waterfox'],
};

// Chrome writes `Unconfirmed 123456.crdownload` until the download is checked — seen
// 2026-11-06 for the whole download, a .bin and a .pdf alike, renamed to the real name
// only at the end. The word is translated (IDS_DOWNLOAD_UNCONFIRMED_PREFIX), the number
// is random below a million: words, a space, up to 6 digits, no extension.
const UNCONFIRMED = /^[^.]+ \d{1,6}$/;

/**
 * @param {*} name  a file name in a watched folder
 * @returns {?{final: string, suffix: string, unnamed: boolean}} what it will be called,
 *   for a browser's partial file, and whether that is only Chrome's placeholder; null for
 *   anything else, hidden files (Chrome's `.com.google.Chrome.*` temporaries) and a bare
 *   suffix
 */
export function partialOf(name) {
    if (typeof name !== 'string' || name.startsWith('.'))
        return null;
    for (const suffix of Object.keys(PARTIALS)) {
        if (name.endsWith(suffix) && name.length > suffix.length) {
            const final = name.slice(0, -suffix.length);
            return {final, suffix, unnamed: suffix === '.crdownload' && UNCONFIRMED.test(final)};
        }
    }
    return null;
}

/**
 * @param {string} suffix  partialOf().suffix
 * @param {string[]} running  slugs of the running apps, in Shell's order
 * @returns {?string} the running browser that writes such files, or null (none running:
 *   the row names no app rather than guess)
 */
export function ownerOf(suffix, running) {
    const owners = PARTIALS[suffix] ?? [];
    return running.find(slug => owners.includes(slug)) ?? null;
}

/**
 * @param {?string} downloads  the user's Downloads folder (XDG), null when unset
 * @param {*} extra  `progress-folders`
 * @returns {string[]} absolute paths to watch: Downloads first, then up to MAX_FOLDERS of
 *   the others, without a trailing slash, each once; relative or empty entries dropped
 */
export function watchedFolders(downloads, extra) {
    const clean = p => typeof p === 'string' && p.startsWith('/') ? p.replace(/(.)\/+$/, '$1') : null;
    const out = [];
    const first = clean(downloads);
    if (first)
        out.push(first);
    for (const p of Array.isArray(extra) ? extra : []) {
        const c = clean(p);
        if (c && !out.includes(c) && out.length - (first ? 1 : 0) < MAX_FOLDERS)
            out.push(c);
    }
    return out;
}

/**
 * What a rename inside a watched folder means.
 *
 * @param {string} from  old name
 * @param {?string} to  new name in the same folder; null when moved out
 * @returns {?string} 'done' (partial → its final name or any other non-partial),
 *   'renamed' (partial → partial: Chrome's "Unconfirmed 1234.crdownload" once the name is
 *   known), 'gone' (moved out of the folder), null (not a download)
 */
export function renameOf(from, to) {
    if (!partialOf(from))
        return null;
    if (to === null || to === undefined)
        return 'gone';
    return partialOf(to) ? 'renamed' : 'done';
}

/**
 * The speed from two sizes, smoothed (half the last, half the new), since GFileMonitor's
 * `changed` comes about once a second and writes come in bursts.
 *
 * @param {?{size: number, at: number, speed: ?number}} prev  the last sample (at: µs)
 * @param {number} size  bytes now
 * @param {number} at  µs, a monotonic clock
 * @returns {{size: number, at: number, speed: ?number}} speed in bytes/s, null until two
 *   samples; a file that shrank (restarted) starts again
 */
export function nextRate(prev, size, at) {
    if (!prev || size < prev.size)
        return {size, at, speed: null};
    const dt = (at - prev.at) / 1e6;
    if (dt <= 0)
        return {...prev, size};
    const now = (size - prev.size) / dt;
    return {size, at, speed: prev.speed === null ? now : (prev.speed + now) / 2};
}

/**
 * A size as GNOME writes it (SI units, one decimal, as GLib.format_size).
 *
 * @param {number} bytes
 * @returns {string} "512 bytes", "1.0 kB", "12.3 MB", "1.4 GB"
 */
export function sizeText(bytes) {
    const n = Math.max(0, Math.round(Number(bytes) || 0));
    if (n < 1000)
        return `${n} ${n === 1 ? 'byte' : 'bytes'}`;
    const units = ['kB', 'MB', 'GB', 'TB'];
    let v = n / 1000, i = 0;
    while (v >= 999.95 && i < units.length - 1) {
        v /= 1000;
        i++;
    }
    return `${v.toFixed(1)} ${units[i]}`;
}

/**
 * @param {?number} bytesPerSecond
 * @returns {?string} "2.1 MB/s"; null when unknown, and when nothing came since the last
 *   sample (a paused download shows its size alone)
 */
export function speedText(bytesPerSecond) {
    return bytesPerSecond > 0 ? `${sizeText(bytesPerSecond)}/s` : null;
}

/**
 * The SPEC §6c exception: an app's LauncherEntry fraction is a file's only when that app
 * is downloading exactly one file — with two it cannot be split.
 *
 * @param {Array<{owner: ?string}>} files  the running downloads
 * @param {string} owner  the app (slug) whose LauncherEntry is running
 * @param {?number} fraction  its progress, null when it shows none
 * @returns {?number} the one file's fraction, else null
 */
export function ringFor(files, owner, fraction) {
    if (typeof fraction !== 'number' || !owner)
        return null;
    return files.filter(f => f.owner === owner).length === 1 ? fraction : null;
}

/**
 * @param {?string} folder  the folder's name
 * @param {?string} app  the browser's name
 * @param {?string} time  clockTime() of when it finished
 * @returns {string} "Downloads · Google Chrome · 14:05", what is known of it
 */
export function downloadedDetail(folder, app, time) {
    return [folder, app, time].filter(Boolean).join(' · ');
}

function download(ev) {
    // not named yet (Chrome's "Unconfirmed …"): the browser's name says what it is
    const name = ev.name || ev.app || 'Download';
    if (ev.phase === 'done') {
        const icon = ev.icon ?? 'text-x-generic-symbolic';
        return {
            leading: {icon}, text: name, trailing: ev.folder ? {text: `→ ${ev.folder}`} : null,
            compact: {
                leading: {icon}, text: name,
                subtitle: ev.folder ? `Downloaded to ${ev.folder}` : 'Downloaded',
            },
            ttl: DOWNLOADED_TTL, staleAfter: 0,
            onPress: typeof ev.open === 'function' ? () => ev.open() : null,
            attributes: {app: name, count: null, phase: 'done', file: true},
        };
    }
    const size = sizeText(ev.size);
    const speed = speedText(ev.speed);
    const ring = typeof ev.fraction === 'number';
    const detail = [size, speed].filter(Boolean).join(' · ');
    return {
        leading: ring ? {progress: ev.fraction} : {icon: 'folder-download-symbolic'},
        text: name,
        trailing: {text: ring ? `${percent(ev.fraction)}%` : size},
        compact: {
            leading: {icon: 'folder-download-symbolic'}, text: name,
            subtitle: ring ? `${detail} · ${percent(ev.fraction)}%` : detail,
            ...ring ? {progress: ev.fraction} : {},
        },
        ttl: 0, staleAfter: DOWNLOAD_STALE,
        onPress: typeof ev.focus === 'function' ? () => ev.focus() : null,
        attributes: {app: name, count: detail, phase: 'running', file: true},
    };
}

export default {
    progress(ev) {
        if (ev.file)
            return download(ev);
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
                // Files reopened mid-operation sends one LauncherEntry, then nothing until it
                // ends (seen 2026-11-06): no % either way; its own window shows one
                text: `${name} · ${ev.windowOpen ? 'working' : 'in background'}`, trailing: null,
                compact: {
                    leading: ev.icon ? {icon: ev.icon} : null, text: name,
                    subtitle: ev.windowOpen ? 'Progress shows in Files' : 'Still working in the background',
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
