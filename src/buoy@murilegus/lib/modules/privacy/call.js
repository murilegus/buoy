/**
 * The rest of the privacy dot (FEATURES M4 "Privacy dot"; design/compact "Đang gọi", 2026-11-27, Ethan),
 * pure: when the camera and the microphone make a call, what Do Not Disturb does about it, and
 * Home's "in use" tile. The source reads GNOME's indicators and the mixer.
 */

/** Both on this long is a call; either off this long ends it (a camera blinking off, a reconnect). */
export const CALL_SETTLE = 10 * 1000;

/** The volume panels record to show a level: not someone using the microphone (ui/status/volume.js). */
export const SKIPPED_APPS = Object.freeze(['org.gnome.VolumeControl', 'org.PulseAudio.pavucontrol']);

/**
 * @param {Array<{name: ?string, app: ?string}>} outputs  the mixer's source outputs: their names
 *   ("Firefox") and application ids
 * @returns {string[]} the apps recording, by name, each once, the volume panels left out
 */
export function recordingApps(outputs) {
    const names = (Array.isArray(outputs) ? outputs : [])
        .filter(o => o && !SKIPPED_APPS.includes(o.app))
        .map(o => typeof o.name === 'string' ? o.name.trim() : '')
        .filter(Boolean);
    return [...new Set(names)];
}

/**
 * Do Not Disturb at the end of a call: turned back off only when Buoy turned it on and nobody
 * changed it meanwhile (design/compact "Đang gọi", 2).
 *
 * @param {object} f
 * @param {boolean} f.ours  Buoy turned it on at the call's start
 * @param {boolean} f.changed  someone else changed `show-banners` during the call
 * @param {boolean} f.banners  `show-banners` now (false: Do Not Disturb on)
 * @returns {boolean} turn the banners back on
 */
export function restoreBanners({ours, changed, banners}) {
    return ours === true && changed !== true && banners === false;
}

/**
 * Home's "in use" tile (design/compact "Đang gọi", 3): only while the microphone or the camera is
 * in use — a screen being shared or recorded has its own tile already.
 *
 * @param {object} f
 * @param {boolean} f.mic  the microphone in use (GNOME's input indicator)
 * @param {boolean} f.cam  a camera in use
 * @param {string[]} f.apps  recordingApps
 * @returns {?{icon: string, value: string, caption: string, detail: string[]}}
 */
export function inUseTile({mic, cam, apps}) {
    if (!mic && !cam)
        return null;
    const list = mic && Array.isArray(apps) ? apps : [];
    const caption = [mic ? 'Microphone' : null, cam ? 'camera' : null].filter(Boolean).join(', ');
    return {
        icon: cam ? 'camera-video-symbolic' : 'audio-input-microphone-symbolic',
        value: list.length ? list.join(', ') : 'Camera',
        caption: caption.charAt(0).toUpperCase() + caption.slice(1),
        detail: list.length > 1 ? [`${list.length} apps`] : [],
    };
}
