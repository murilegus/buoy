// Buoy's symbolic icons (design/icons "Icon symbolic", "Icon tự vẽ"; Ethan, 2026-11-12): each
// file in src/buoy@murilegus/icons/symbolic carries the name GNOME's theme gives the same icon,
// so a file missing there falls back to the theme's of that name; the drawing is Gravity UI's
// (gravity-ui/, MIT, under Gravity's names) or Buoy's own in its style (own/, draw-own.js).
// scripts/symbolic-icons.js ships them from this table; tests/icons.test.js checks it.

/** file name (without -symbolic.svg) → its drawing: a Gravity UI name, or own:<drawing> */
export const SYMBOLIC = {
    // Home and the tab strip
    'go-home': 'house',
    'view-app-grid': 'layout-cells-large',
    'view-grid': 'layout-cells-large',
    'emblem-system': 'gear',
    'view-more': 'ellipsis-vertical',
    'window-close': 'xmark',
    'object-select': 'check',
    // notifications
    'preferences-system-notifications': 'bell',
    'notifications-unread': 'bell-dot',
    'go-previous': 'chevron-left',
    'weather-clear-night': 'moon',
    'notifications-disabled': 'bell-slash',
    // media
    'audio-x-generic': 'music-note',
    'media-skip-backward': 'backward-step-fill',
    'media-playback-start': 'play-fill',
    'media-playback-pause': 'pause-fill',
    'media-skip-forward': 'forward-step-fill',
    'media-playback-stop': 'stop-fill',
    'media-playlist-shuffle': 'shuffle',
    'media-playlist-repeat': 'own:repeat',
    'media-playlist-repeat-song': 'own:repeat-1',
    'external-link': 'arrow-up-right-from-square',
    // calendar, clock, devices
    'x-office-calendar': 'calendar',
    'go-next': 'chevron-right',
    'preferences-system-time': 'clock',
    'alarm': 'alarm',
    'phone': 'smartphone',
    'battery-good': 'own:battery',
    'battery-full': 'own:battery-full',
    'battery-low': 'own:battery-low',
    'battery-good-charging': 'own:battery-charging',
    // downloads, copied, input
    'folder-download': 'arrow-down-to-line',
    'folder-open': 'folder-open',
    'document-open': 'file',
    'text-x-generic': 'file-text',
    'edit-copy': 'copy',
    'dialog-password': 'key',
    'image-x-generic': 'picture',
    'edit-paste': 'own:clipboard',
    'input-keyboard': 'keyboard',
    'mail-unread': 'envelope',
    'weather-overcast': 'cloud',
    // Claude Code, the screen
    'task-todo': 'circle-dashed',
    'mail-send': 'arrow-right',
    'media-record': 'video',
    'screen-shared': 'display-pulse',
    // HUD / OSD (gsd-media-keys, Shell's volume.js and brightnessManager.js, mutter's display.c)
    'audio-volume-muted': 'volume-slash',
    'audio-volume-low': 'volume-low',
    'audio-volume-medium': 'volume',
    'audio-volume-high': 'volume',
    'audio-volume-overamplified': 'volume',
    'microphone-sensitivity-muted': 'microphone-slash',
    'microphone-sensitivity-low': 'microphone',
    'microphone-sensitivity-medium': 'microphone',
    'microphone-sensitivity-high': 'microphone',
    'audio-input-microphone': 'microphone',
    'display-brightness': 'sun',
    'keyboard-brightness': 'own:keyboard-brightness',
    'input-touchpad': 'own:touchpad',
    'touchpad-disabled': 'own:touchpad-slash',
    'caps-lock': 'arrow-shape-up-from-line',
    'num-lock': 'own:num-lock',
    'fn-lock': 'own:fn-lock',
    'rotation-locked': 'arrows-rotate-right-slash',
    'rotation-allowed': 'arrows-rotate-right',
    'media-eject': 'own:eject',
    'action-unavailable': 'ban',
    'bluetooth-active': 'own:bluetooth',
    'bluetooth-disabled': 'own:bluetooth-slash',
    'airplane-mode': 'plane',
    'airplane-mode-disabled': 'own:plane-slash',
    'screen-privacy': 'eye-slash',
    'screen-privacy-disabled': 'eye',
    'input-tablet': 'pencil',
};

/** names of ours, for ideas the theme has no name for: nothing to fall back to */
export const OWN_NAMES = ['notifications-unread', 'task-todo', 'caps-lock', 'num-lock', 'fn-lock'];

/** @param {string} src  a drawing from SYMBOLIC @returns {string} its file, relative to this one */
export const sourceFile = src => src.startsWith('own:') ? `own/${src.slice(4)}.svg` : `gravity-ui/${src}.svg`;
