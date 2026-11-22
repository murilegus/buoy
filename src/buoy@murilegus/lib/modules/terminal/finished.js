/**
 * A terminal command that finished (FEATURES M4 "Terminal command finished in an unfocused tab";
 * design/compact "Lệnh terminal xong", 2026-11-21, Ethan), pure: Buoy's shell hook's records
 * (hooks/shell.sh) and how their times read. No Gio: source.js reads the files.
 */

/** Ptyxis's ids (meson.build `app-id`: the release, the nightly). */
export const PTYXIS_APPS = ['org.gnome.Ptyxis', 'org.gnome.Ptyxis.Devel'];

/** The hook's files in $XDG_RUNTIME_DIR: `buoy-shell-<pid>`. */
export const RECORD_PREFIX = 'buoy-shell-';

/**
 * How long before Ptyxis's notification a record may end and still be its command's. Ptyxis
 * notifies on the same precmd the hook writes on, its D-Bus message a moment after; a few
 * seconds cover a busy Shell.
 */
export const MATCH_WINDOW = 10 * 1000;

/**
 * @param {string} t  EPOCHREALTIME as zsh says it ("1795269986.1263375282", a comma in some
 *   locales) or bash's microseconds ("1795269988952907")
 * @returns {?number} ms since the epoch
 */
function time(t) {
    if (/^\d+[.,]\d+$/.test(t))
        return Number(t.replace(',', '.')) * 1000;
    if (/^\d+$/.test(t))
        return Number(t) / 1000;
    return null;
}

/**
 * @param {*} text  a record: "1 <exit> <start> <end>", the directory, the command line
 * @returns {?{exit: number, start: number, end: number, dir: string, cmd: string}} times in ms
 */
export function parseRecord(text) {
    if (typeof text !== 'string')
        return null;
    const [head = '', dir = '', ...rest] = text.split('\n');
    const m = /^1 (\d+) (\S+) (\S+)$/.exec(head);
    if (!m)
        return null;
    const start = time(m[2]), end = time(m[3]);
    if (start === null || end === null || end < start)
        return null;
    // a command of several lines is one line here
    const cmd = rest.join('\n').trim().replace(/\s*\n\s*/g, ' ');
    return {exit: Number(m[1]), start, end, dir, cmd};
}

// words, a path to a program as its name (Ptyxis says `/usr/bin/pnpm`, you typed `pnpm`), the
// shell's ; & | apart
const words = s => typeof s === 'string'
    ? s.replace(/[;&|]+/g, ' ').trim().split(/\s+/).filter(Boolean).map(w => w.replace(/^\/(?:[^/\s]+\/)+(?=[^/])/, ''))
    : [];

// `part` runs, word by word, somewhere in `all`
const within = (all, part) => part.length > 0 &&
    all.some((_, i) => part.every((w, j) => all[i + j] === w));

/**
 * The record of the command Ptyxis's notification is about: one that ended within
 * MATCH_WINDOW before it; of those, one whose command line and Ptyxis's say the same — Ptyxis
 * reads the process running then, so its line can be longer (`node /usr/bin/pnpm verify` for
 * `pnpm verify`) or a part (`sleep 2` of `sleep 2; make`): the last words of one run in the
 * other — else the newest without a command line (bash's). One whose command is another is
 * not it.
 *
 * @param {Array<?object>} records  parseRecord's
 * @param {*} body  the notification's body: Ptyxis's command line
 * @param {number} now  ms since the epoch the notification came
 * @returns {?object} the record, or null
 */
export function matchRecord(records, body, now) {
    const near = (Array.isArray(records) ? records : [])
        .filter(r => r && r.end <= now + 2000 && now - r.end <= MATCH_WINDOW)
        .sort((a, b) => b.end - a.end);
    const said = words(body);
    const same = r => {
        const typed = words(r.cmd);
        return within(typed, said.slice(-3)) || within(said, typed.slice(-3));
    };
    return near.find(same) ?? near.find(r => !r.cmd) ?? null;
}

/**
 * @param {number} ms
 * @returns {string} the pill's: "<1 s", "48 s", "2:03", "1:05:10"
 */
export function shortTime(ms) {
    if (!(ms >= 1000))
        return '<1 s';
    const s = Math.round(ms / 1000);
    if (s < 60)
        return `${s} s`;
    const two = n => String(n).padStart(2, '0');
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/**
 * @param {number} ms
 * @returns {string} the card's: "<1 s", "48 s", "2 min 3 s", "1 h 5 min"
 */
export function longTime(ms) {
    if (!(ms >= 1000))
        return '<1 s';
    const s = Math.round(ms / 1000);
    if (s < 60)
        return `${s} s`;
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    if (h)
        return m ? `${h} h ${m} min` : `${h} h`;
    return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

/**
 * @param {*} dir  a directory
 * @param {string} home  $HOME
 * @returns {string} with ~ for home ("~/works/buoy")
 */
export function dirText(dir, home) {
    if (typeof dir !== 'string' || !dir)
        return '';
    if (home && (dir === home || dir.startsWith(`${home}/`)))
        return `~${dir.slice(home.length)}`;
    return dir;
}

/**
 * @param {string} path  the hook's file (<extension>/hooks/shell.sh)
 * @param {string} home  $HOME
 * @returns {string} the line for ~/.zshrc or ~/.bashrc (prefs): `source ~/…`, quoted when the
 *   path has a character the shell would read
 */
export function hookLine(path, home) {
    const short = dirText(path, home);
    if (/^[\w~@%+=:,./-]+$/.test(short))
        return `source ${short}`;
    return `source '${path.replace(/'/g, "'\\''")}'`;
}

/**
 * @param {*} text  a shell's rc file
 * @returns {boolean} it sources Buoy's hook (a line not commented out)
 */
export function hookAdded(text) {
    return typeof text === 'string' && /^[ \t]*(?:source|\.)[ \t]+\S*buoy@murilegus\/hooks\/shell\.sh\b/m.test(text);
}
