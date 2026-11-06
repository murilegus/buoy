/**
 * clipboard adapter (SPEC §2e, FEATURES M3 "clipboard: copied"): GNOME shows nothing when
 * something is copied; Buoy flashes it on pill 1 for a second — the snippet, an image's
 * thumbnail, the file names. Feedback: minimal only, no compact, no tab of its kind.
 * Pure: the source reads the clipboard's mimetypes and content and asks what they are.
 *
 * Event: {id, what: 'text'|'image'|'files'|'secret'|'hidden', text?, files?, image?}
 *   hidden  `clipboard-show-preview` off: nothing was read, the pill only says so
 *   secret  a password manager marked it (`x-kde-passwordManagerHint`): never read
 */

/** As long as the other feedback (SPEC §2e; 1 s read too short, Ethan 2026-11-06). */
export const TTL = 1500;

// Owners that are not a copy made here, by their GType name (mutter core/):
//   MetaSelectionSourceMemory  Shell set it (st_clipboard_set_content): a screenshot,
//                              Looking Glass, a clipboard-manager extension restoring
//   MetaSelectionSourceRemote  another machine's clipboard through RemoteDesktop:
//                              mutter-devkit syncing the host's (mdk-session.c, at start
//                              and on each host copy), gnome-remote-desktop's RDP/VNC
const NOT_HERE = new Set(['MetaSelectionSourceMemory', 'MetaSelectionSourceRemote']);

/**
 * @param {*} typeName  the new owner's GType name
 * @returns {boolean} a copy made by an app on this machine (Wayland or X11 client)
 */
export function copiedHere(typeName) {
    return typeof typeName === 'string' && typeName !== '' && !NOT_HERE.has(typeName);
}

// KeePassXC, KDE's and other password managers offer this with the secret (value
// "secret"): the clipboard is not read and nothing of it shows
const SECRET = 'x-kde-passwordManagerHint';
// Files (and Nemo, Caja) put copied files as `x-special/gnome-copied-files`
// ("copy\nfile:///…"); others offer `text/uri-list` (one URI per line, # comments)
const FILES = ['x-special/gnome-copied-files', 'text/uri-list'];
const TEXT = ['text/plain;charset=utf-8', 'text/plain', 'UTF8_STRING', 'STRING', 'TEXT'];

/**
 * What the new clipboard holds, by its mimetypes; the first that applies wins: a secret,
 * files (Files also offers their paths as text), an image, text.
 *
 * @param {*} mimetypes  the owner's (Meta.SelectionSource get_mimetypes)
 * @returns {?string} 'secret' | 'files' | 'image' | 'text' | null (nothing to show)
 */
export function contentOf(mimetypes) {
    const m = Array.isArray(mimetypes) ? mimetypes.filter(t => typeof t === 'string') : [];
    if (m.includes(SECRET))
        return 'secret';
    if (FILES.some(t => m.includes(t)))
        return 'files';
    if (m.some(t => t.startsWith('image/')))
        return 'image';
    if (m.some(t => TEXT.includes(t) || t.startsWith('text/')))
        return 'text';
    return null;
}

/**
 * @param {string[]} mimetypes
 * @returns {?string} the image type to read: PNG when offered (every app that copies an
 *   image offers it), else the first image type
 */
export function imageMime(mimetypes) {
    if (mimetypes.includes('image/png'))
        return 'image/png';
    return mimetypes.find(t => t.startsWith('image/')) ?? null;
}

/**
 * @param {string[]} mimetypes
 * @returns {?string} the files type to read, Files' own first
 */
export function filesMime(mimetypes) {
    return FILES.find(t => mimetypes.includes(t)) ?? null;
}

/**
 * The names of copied files, from either files type.
 *
 * @param {*} text  `copy\nfile:///…` or a uri-list
 * @returns {string[]} each file's name, decoded; the `copy` / `cut` line and comments
 *   dropped
 */
export function filesOf(text) {
    if (typeof text !== 'string')
        return [];
    return text.split(/\r?\n/).map(l => l.trim())
        .filter(l => l && !l.startsWith('#') && l !== 'copy' && l !== 'cut')
        .map(uri => {
            const last = uri.replace(/\/+$/, '').split('/').pop() ?? '';
            try {
                return decodeURIComponent(last);
            } catch {
                return last;
            }
        })
        .filter(Boolean);
}

/**
 * @param {*} text
 * @returns {string} on one line: every run of whitespace (newlines, tabs) one space,
 *   trimmed; the renderer ellipsizes it, nothing is cut here
 */
export function oneLine(text) {
    return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

/**
 * @param {string[]} names
 * @returns {?string} "report.pdf", "3 items"
 */
export function filesText(names) {
    if (!names.length)
        return null;
    return names.length === 1 ? names[0] : `${names.length} items`;
}

const COPY = 'edit-copy-symbolic';

// Every output sets the same fields: a repeat updates the one pill in place
// (stack.update merges), so nothing of an earlier copy may stay.
function pill(leading, text) {
    return {
        leading, text, trailing: null, sizeHint: 'wide', ttl: TTL,
        compact: null, expanded: null, onPress: null,
    };
}

export default {
    copied(ev) {
        switch (ev.what) {
        case 'hidden':
            return pill(COPY, 'Copied');
        case 'secret':
            return pill('dialog-password-symbolic', 'Copied · hidden');
        case 'image':
            return pill(ev.image ? {art: ev.image, icon: 'image-x-generic-symbolic'} : 'image-x-generic-symbolic',
                'Copied image');
        case 'files': {
            const text = filesText(ev.files ?? []);
            return text ? pill(COPY, text) : null;
        }
        case 'text': {
            const text = oneLine(ev.text);
            return text ? pill(COPY, text) : null;   // emptied (a password manager clearing)
        }
        }
        return null;
    },
};
