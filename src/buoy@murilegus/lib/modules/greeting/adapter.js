/**
 * The greeting's first run and What's new (GREETING.md §11, FEATURES M3 "greeting: first
 * run and What's new"). Pure: which case applies, the lines Bu says, and the activity. Every
 * string Bu says is here (GREETING.md principle 6). Prefs imports it for About → What's new.
 *
 * Event: {id, case, note, animations, shortcut, onMore}
 *   case        'first-run' | 'whats-new' (caseOf)
 *   note        What's new: the running version's entry of notes.js
 *   shortcut    `keybind-focus`'s first accelerator ("<Super>b"), read when it shows
 *   animations  St.Settings enable-animations: the typing counts in the ttl only then
 *   onMore()    "…and more": open prefs on About → What's new
 */

import {TYPE_MS, typingMs} from '../../kit/presentation.js';

/** How long the greeting stays once its last line is in (Ethan, 2026-11-08). */
export const SHOW_MS = 12000;
/** What's new: at most this many note lines; more end with "…and more". */
export const MAX_NOTES = 4;
export const MORE = 'more';

/** The first run: who Bu is, then the basics of using Buoy, one per line. `{shortcut}`:
 * the user's own (`keybind-focus`, 2026-11-08, Ethan: a changed key, then the intro
 * replayed, must not say Super+B); no shortcut set → that line goes. */
export const INTRO = Object.freeze({
    title: 'Hi, I\'m Bu.',
    lines: Object.freeze([
        'Hover me for more.',
        'Click me for Home.',
        '{shortcut} reaches me from the keyboard.',
        'Scroll on me when I rest to see what else I show.',
        '⚙ in Home opens my settings.',
    ]),
});

const MODIFIERS = {
    super: 'Super', shift: 'Shift', control: 'Ctrl', primary: 'Ctrl', ctrl: 'Ctrl',
    alt: 'Alt', meta: 'Meta', hyper: 'Hyper',
};

/**
 * @param {*} accel  a GTK accelerator ("<Super>b", "<Primary><Alt>space")
 * @returns {?string} as people write it ("Super+B", "Ctrl+Alt+Space"); null for none
 */
export function shortcutText(accel) {
    const m = /^((?:<[^>]+>)*)([^<>]+)$/.exec(typeof accel === 'string' ? accel.trim() : '');
    if (!m)
        return null;
    const mods = [...m[1].matchAll(/<([^>]+)>/g)].map(x => MODIFIERS[x[1].toLowerCase()] ?? x[1]);
    const key = m[2].length === 1 ? m[2].toUpperCase() : m[2][0].toUpperCase() + m[2].slice(1);
    return [...mods, key].join('+');
}

// the intro's lines with the user's shortcut, or without its line
function introLines(shortcut) {
    const keys = shortcutText(shortcut);
    return INTRO.lines.filter(l => keys || !l.includes('{shortcut}')).map(l => l.replace('{shortcut}', keys));
}

const isVersion = v => Number.isInteger(v) && v >= 0;

/**
 * @param {object} state
 * @param {boolean} state.introShown  `greeting-intro-shown`
 * @param {number} state.versionSeen  `greeting-version-seen`
 * @param {number} state.version  the running `metadata.json` `version`
 * @returns {?string} 'first-run' (a fresh install), 'whats-new' (an update since the
 *   version seen) or null (the same version, a downgrade, nothing known)
 */
export function caseOf({introShown, versionSeen, version}) {
    if (introShown !== true)
        return 'first-run';
    if (!isVersion(version) || !isVersion(versionSeen))
        return null;
    return version > versionSeen ? 'whats-new' : null;
}

/**
 * @param {*} notes  notes.js's list
 * @param {number} version
 * @returns {?object} the entry for exactly that version — after skipped releases only
 *   the newest one's notes (Ethan, 2026-11-08) — or null
 */
export function noteFor(notes, version) {
    return (Array.isArray(notes) ? notes : []).find(n => n?.version === version) ?? null;
}

const clean = list => (Array.isArray(list) ? list : [])
    .filter(l => typeof l === 'string' && l.trim()).map(l => l.trim().replace(/\s+/g, ' '));

/**
 * A version's lines, the intro for v0.1's.
 *
 * @param {object} note  a notes.js entry
 * @param {object} [opts]
 * @param {number} [opts.max]  at most this many note lines (Infinity: every one, About)
 * @param {string} [opts.shortcut]  `keybind-focus`'s accelerator, for the intro's line
 * @returns {{title: string, lines: string[], more: boolean}} "New in Buoy 0.2", then what
 *   is new, then what was fixed ("Fixed: …"); `more` when some were left out
 */
export function linesOf(note, {max = MAX_NOTES, shortcut = '<Super>b'} = {}) {
    if (note?.intro)
        return {title: INTRO.title, lines: introLines(shortcut), more: false};
    const name = typeof note?.name === 'string' && note.name ? note.name : String(note?.version ?? '');
    const all = [...clean(note?.added), ...clean(note?.fixed).map(f => `Fixed: ${f}`)];
    return {title: `New in Buoy ${name}`, lines: all.slice(0, max), more: all.length > max};
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];

/**
 * About → What's new's heading for a version (2026-11-08, Ethan): the running one
 * "Buoy 0.2 — this version", an older one "Buoy 0.1 — 8 November 2026" (its release day),
 * one with no day yet just "Buoy 0.1".
 *
 * @param {object} note  a notes.js entry
 * @param {number} running  the running `metadata.json` `version`
 * @returns {string}
 */
export function releaseLabel(note, running) {
    const name = `Buoy ${typeof note?.name === 'string' && note.name ? note.name : String(note?.version ?? '')}`;
    if (note?.version === running)
        return `${name} — this version`;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(note?.date ?? ''));
    const month = m ? MONTHS[Number(m[2]) - 1] : null;
    return month && Number(m[3]) >= 1 && Number(m[3]) <= 31 ? `${name} — ${Number(m[3])} ${month} ${m[1]}` : name;
}

/**
 * @param {number} lines  lines under the title
 * @returns {number} Bu's px: as tall as the text, a multiple of his 10 cells (GREETING.md
 *   §2: 80 for three lines or more, 60 for two)
 */
export function buSize(lines) {
    return lines >= 2 ? 80 : 60;
}

export default {
    greeting(ev) {
        const shortcut = typeof ev.shortcut === 'string' ? ev.shortcut : '<Super>b';
        const text = ev.case === 'first-run'
            ? linesOf({intro: true}, {shortcut})
            : linesOf(ev.note, {shortcut});
        const bu = {mascot: 'wave', hello: true};
        const typing = ev.animations === false ? 0 : typingMs([text.title, ...text.lines], TYPE_MS);
        return {
            text: text.title,
            leading: bu,
            trailing: null,
            compact: null,
            expanded: {
                leading: {...bu, size: buSize(text.lines.length)},
                center: {title: text.title, lines: text.lines, typed: true, hero: true},
                trailing: null,
            },
            actions: text.more ? [{id: MORE, label: '…and more'}] : [],
            minimalAction: false,
            style: 'transient',
            ttl: typing + SHOW_MS,
            onAction: id => {
                if (id === MORE)
                    ev.onMore?.();
            },
            attributes: {case: ev.case},
        };
    },
};
