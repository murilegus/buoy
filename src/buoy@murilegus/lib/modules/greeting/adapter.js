/**
 * The greeting's first run and What's new (GREETING.md §11, FEATURES M3 "greeting: first
 * run and What's new"). Pure: which case applies, the lines Bu says, and the activity. Every
 * string Bu says is here (GREETING.md principle 6). Prefs imports it for About → What's new.
 *
 * Event: {id, case, note, animations, shortcut, onMore, update, running, onCopy, onNotes}
 *   case        'first-run' | 'whats-new' (caseOf) | 'update' (updateOf)
 *   note        What's new: the running version's entry of notes.js
 *   shortcut    `keybind-focus`'s first accelerator ("<Super>b"), read when it shows
 *   animations  St.Settings enable-animations: the typing counts in the ttl only then
 *   onMore()    "…and more": open prefs on About → What's new
 *   update      a newer Buoy (updateOf): {from: 'shell'} or {from: 'github', name}
 *   running     the running `version-name` ("0.1.1")
 *   onCopy(), onNotes()  the update's buttons: copy install.sh's command, open the release
 *
 * A newer Buoy (GREETING.md §11 "A newer Buoy", FEATURES M3): also pure here — the tag's
 * version, which is newer, when to look again, whether Bu has said it — so the source only
 * asks and shows.
 */

import {TYPE_MS, typingMs} from '../../kit/model/presentation.js';
import {daypartAt, normaliseStarts} from '../../kit/model/daypart.js';
import {conditionOf} from '../../kit/model/weather.js';

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

// --- a newer Buoy -------------------------------------------------------------------------

/** GitHub's latest release of Buoy: the one request Buoy makes (FEATURES M3). */
export const LATEST_URL = 'https://api.github.com/repos/murilegus/buoy/releases/latest';
/** Its page for people: `${RELEASES}/tag/v0.2`. */
export const RELEASES = 'https://github.com/murilegus/buoy/releases';
/** What install.sh's own header says to run. */
export const UPDATE_COMMAND = 'curl -fsSL https://murilegus.dev/buoy/install.sh | bash -s -- --update';
/** A release is looked for at most once a day (s). */
export const CHECK_EVERY = 24 * 60 * 60;
/** install.sh leaves this file in the extension's folder: only then is GitHub asked. */
export const MARKER = '.check-updates';
export const COPY = 'copy';
export const NOTES = 'notes';

/**
 * @param {*} tag  a release tag ("v0.2", "0.1.1")
 * @returns {?string} its version-name ("0.2"): one to four numbers of up to four digits,
 *   nothing else — what comes off the network is never shown or opened as it is
 */
export function versionName(tag) {
    const m = /^v?(\d{1,4}(?:\.\d{1,4}){0,3})$/.exec(typeof tag === 'string' ? tag : '');
    return m ? m[1] : null;
}

/**
 * @param {*} a  a version-name
 * @param {*} b  another
 * @returns {boolean} a is a later release than b ("0.10" after "0.9", "0.1.1" after
 *   "0.1"); false when either is not a version-name
 */
export function newer(a, b) {
    const [x, y] = [versionName(a), versionName(b)];
    if (!x || !y)
        return false;
    const [p, q] = [x, y].map(v => v.split('.').map(Number));
    for (let i = 0; i < Math.max(p.length, q.length); i++) {
        if ((p[i] ?? 0) !== (q[i] ?? 0))
            return (p[i] ?? 0) > (q[i] ?? 0);
    }
    return false;
}

/**
 * @param {*} text  the body GitHub answered LATEST_URL with
 * @returns {?string} the latest release's version-name; null for anything else (not JSON,
 *   no tag, a tag that is not a version, a draft or a pre-release)
 */
export function latestOf(text) {
    let json;
    try {
        json = JSON.parse(typeof text === 'string' ? text : '');
    } catch {
        return null;
    }
    if (!json || typeof json !== 'object' || json.draft === true || json.prerelease === true)
        return null;
    return versionName(json.tag_name);
}

/**
 * @param {number} now  seconds since the epoch
 * @param {number} checkedAt  `greeting-update-checked`
 * @returns {boolean} a day has passed since GitHub was asked, or the clock went back
 */
export function due(now, checkedAt) {
    if (!Number.isFinite(now) || !Number.isFinite(checkedAt))
        return false;
    return checkedAt <= 0 || now - checkedAt >= CHECK_EVERY || checkedAt > now;
}

/**
 * Whether Bu has something to say about a newer Buoy, once per release.
 *
 * @param {object} state
 * @param {boolean} state.shell  Shell has an update of Buoy downloaded (`hasUpdate`)
 * @param {?string} [state.latest]  GitHub's latest version-name, when it was asked
 * @param {string} state.running  the running `version-name`
 * @param {number} state.version  the running `version`
 * @param {string} state.told  `greeting-update-told`: what Bu said last
 * @returns {?{from: string, name?: string, key: string}} `from` 'shell' (it applies at the
 *   next login; said once per running version) or 'github' (said once per release);
 *   `key` goes to `greeting-update-told` once it showed; null: nothing to say
 */
export function updateOf({shell, latest = null, running, version, told}) {
    let update = null;
    if (shell === true)
        update = {from: 'shell', key: `shell:${version}`};
    else if (newer(latest, running))
        update = {from: 'github', name: versionName(latest), key: versionName(latest)};
    return update && update.key !== told ? update : null;
}

// what Bu says about it
function updateLines(update, running) {
    if (update?.from === 'github') {
        const have = versionName(running);
        return {
            title: `Buoy ${update.name} is out.`,
            lines: [...have ? [`You have ${have}.`] : [], 'Paste the command in a terminal to update.'],
            actions: [{id: COPY, label: 'Copy command', icon: 'edit-copy-symbolic'}, {id: NOTES, label: 'Release notes', icon: 'external-link-symbolic'}],
        };
    }
    return {title: 'A newer Buoy is ready.', lines: ['Log out and back in to use it.'], actions: []};
}

/**
 * @param {number} lines  lines under the title
 * @returns {number} Bu's px: as tall as the text, a multiple of his 10 cells (GREETING.md
 *   §2: 80 for three lines or more, 60 for two)
 */
export function buSize(lines) {
    return lines >= 2 ? 80 : 60;
}

// --- Start, Wake, Welcome back, Leaving (GREETING.md §1–§6, FEATURES M4 "Greeting" part 1) ---------

/** A sleep this long (s) is a fresh start: Wake (GREETING.md §1). */
export const WAKE_S = 3 * 3600;
/** Awake this long (s) on a boot: "Long day. Rest well." at shut down (§5). */
export const LONG_DAY_S = 10 * 3600;
/** A line this long or shorter fits pill 1 at rest: minimal; longer, or with a subtitle, compact (§6). */
export const MINIMAL_MAX = 24;
/** How long each shows (§1): Start and Wake ~8 s, Welcome back 4 s, Leaving till the session ends. */
export const HELLO_MS = 8000;
export const WELCOME_MS = 4000;
export const LEAVE_MS = 10000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Which moment this enable is (GREETING.md §1), from facts read at enable and the bookkeeping
 * keys: a new boot_id is Start; the same boot after a sleep of WAKE_S or more since the last
 * reading is Wake; another logind session on the same boot is Welcome back; else nothing (a
 * lock, a short sleep, Buoy turned off and on).
 *
 * @param {object} f
 * @param {string} f.boot  /proc/sys/kernel/random/boot_id now
 * @param {string} f.lastBoot  `greeting-boot`
 * @param {string} f.session  this Shell's logind session id
 * @param {string} f.lastSession  `greeting-session`
 * @param {number} f.asleep  seconds asleep since boot now (CLOCK_BOOTTIME − CLOCK_MONOTONIC)
 * @param {number} f.lastAsleep  `greeting-asleep`
 * @returns {?string} 'start' | 'wake' | 'welcome' | null
 */
export function momentOf({boot, lastBoot, session, lastSession, asleep, lastAsleep}) {
    if (typeof boot === 'string' && boot && boot !== lastBoot)
        return 'start';
    if (Number.isFinite(asleep) && Number.isFinite(lastAsleep) && asleep - lastAsleep >= WAKE_S)
        return 'wake';
    if (typeof session === 'string' && session && session !== lastSession)
        return 'welcome';
    return null;
}

/**
 * @param {*} setName  `greeting-name`
 * @param {*} realName  GLib.get_real_name() ("Unknown" when none)
 * @param {*} userName  GLib.get_user_name()
 * @returns {string} who Bu greets: the setting, else the real name's first word, else the user name
 */
export function nameOf(setName, realName, userName) {
    const set = typeof setName === 'string' ? setName.trim() : '';
    if (set)
        return set;
    const real = typeof realName === 'string' ? realName.trim() : '';
    if (real && real !== 'Unknown')
        return real.split(/\s+/)[0];
    return typeof userName === 'string' && userName ? userName : 'there';
}

const timeOf = (d, clock) => {
    const two = n => String(n).padStart(2, '0');
    if (clock === '12h') {
        const h = d.getHours() % 12 || 12;
        return `${h}:${two(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
    }
    return `${two(d.getHours())}:${two(d.getMinutes())}`;
};

/**
 * Line 2 (§2): "It's 07:42 on Friday, 6 November 2026." — the time in GNOME's `clock-format`.
 *
 * @param {number} now  ms since the epoch
 * @param {string} clock  '24h' | '12h'
 * @returns {string}
 */
export function whenLine(now, clock = '24h') {
    const d = new Date(now);
    return `It's ${timeOf(d, clock)} on ${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}.`;
}

/**
 * Line 1 of Start, Wake (§3, rules 3–6; the intro, a birthday and the celebrations come first,
 * part 3): late at night, Monday morning, the weekend, else by daypart.
 *
 * @param {object} f
 * @param {number} f.now  ms since the epoch
 * @param {*} [f.starts]  `daypart-starts`
 * @param {string} f.name
 * @returns {{title: string, pose: string}}
 */
export function helloLine({now, starts, name}) {
    const d = new Date(now);
    const s = normaliseStarts(starts).starts;
    const part = daypartAt(d, s);
    const h = d.getHours(), day = d.getDay();
    // 01:00 until dawn starts
    if (h >= 1 && h < s[0])
        return {title: `Still up, ${name}? Don't stay too late.`, pose: 'wave'};
    const early = part === 'dawn' || part === 'morning';
    if (day === 1 && early)
        return {title: `New week, ${name}.`, pose: 'wave'};
    if ((day === 6 || day === 0) && (early || part === 'noon'))
        return {title: day === 6 ? `Happy Saturday, ${name}.` : `Easy Sunday, ${name}.`, pose: 'wave'};
    if (day === 6 || day === 0)
        return {title: `Enjoy your weekend, ${name}.`, pose: 'wave'};
    const by = {
        dawn: `Good morning, ${name}.`, morning: `Good morning, ${name}.`, noon: `Good day, ${name}.`,
        afternoon: `Good afternoon, ${name}.`, evening: `Good evening, ${name}.`, night: `Still up, ${name}?`,
    };
    return {title: by[part], pose: 'wave'};
}

/**
 * Leaving's title (§5; a celebration's evening is part 3).
 *
 * @param {object} f
 * @param {string} f.leave  'update' | 'restart' | 'logout' | 'shutdown'
 * @param {number} f.now
 * @param {*} [f.starts]
 * @param {string} f.name
 * @returns {{title: string, pose: string}}
 */
export function leavingLine({leave, now, starts, name}) {
    if (leave === 'update')
        return {title: 'Updating. Back in a moment.', pose: 'busy'};
    if (leave === 'restart')
        return {title: 'Be right back.', pose: 'wave'};
    if (leave === 'logout')
        return {title: `Catch you later, ${name}.`, pose: 'wave'};
    const d = new Date(now);
    const part = daypartAt(d, starts);
    if (d.getDay() === 5 && ['afternoon', 'evening', 'night'].includes(part))
        return {title: `Have a good weekend, ${name}.`, pose: 'done'};
    if (part === 'evening' || part === 'night')
        return {title: `Good night, ${name}.`, pose: 'sleep'};
    return {title: `See you soon, ${name}.`, pose: 'wave'};
}

/**
 * @param {string} title
 * @param {?string} subtitle
 * @returns {string} 'minimal' (one short line) | 'compact' (a subtitle, or a line too long for pill 1)
 */
export function sizeOf(title, subtitle = null) {
    return subtitle || title.length > MINIMAL_MAX ? 'compact' : 'minimal';
}

// --- the weather (GREETING.md §8, FEATURES M4 "Greeting" part 2) ----------------------------------

/** How long Start and Wake wait for a first weather reading before showing without it (§2). */
export const WEATHER_WAIT_MS = 3000;

/**
 * @param {*} force  the wind on Beaufort's scale
 * @returns {?string} 0 "calm", 1–3 "light breeze", 4–5 "breezy", 6 and up "strong wind"
 */
export function windWords(force) {
    if (!Number.isFinite(force) || force < 0)
        return null;
    if (force < 1)
        return 'calm';
    if (force <= 3)
        return 'light breeze';
    return force <= 5 ? 'breezy' : 'strong wind';
}

/**
 * Line 3 (§8): "Ho Chi Minh City: 28 °C, partly cloudy, light breeze." — a part not known left out.
 *
 * @param {?object} w  the weather's state (kit/model/weather.js readInfo)
 * @returns {?string} null without a place or a temperature
 */
export function weatherLine(w) {
    if (!w || typeof w.place !== 'string' || !w.place || !Number.isFinite(w.temp))
        return null;
    const t = Math.round(w.temp) || 0;
    const temp = w.unit ? `${t} ${w.unit}` : `${t}°`;
    const cond = conditionOf(w.icon);
    const wind = windWords(w.wind?.force);
    return `${w.place}: ${[temp, cond ? cond.toLowerCase() : null, wind].filter(Boolean).join(', ')}.`;
}

/**
 * The umbrella (§8): "Rain around 17:00, take an umbrella.", snow and storms their own.
 *
 * @param {?{at: number, kind: string}} rain  kit/model/weather.js rainSoon
 * @param {string} [clock]  '24h' | '12h'
 * @returns {?string}
 */
export function rainLine(rain, clock = '24h') {
    if (!rain || !Number.isFinite(rain.at))
        return null;
    const at = timeOf(new Date(rain.at), clock);
    if (rain.kind === 'snow')
        return `Snow around ${at}, dress warm.`;
    if (rain.kind === 'storm')
        return `Storms around ${at}, stay dry.`;
    return `Rain around ${at}, take an umbrella.`;
}

// the rain line when rain is coming before the evening (Leaving, §5: not for a night's sleep)
function rainBefore(ev) {
    const rain = ev.weather?.rain;
    if (!rain || daypartAt(new Date(rain.at), ev.starts) === 'evening' || daypartAt(new Date(rain.at), ev.starts) === 'night')
        return null;
    return rainLine(rain, ev.clock);
}

const buOf = pose => pose === 'wave' ? {mascot: 'wave', hello: true} : {mascot: pose};

// Start, Wake (expanded, or minimal by `greeting-style`), Welcome back, Leaving
function moment(ev) {
    const name = typeof ev.name === 'string' && ev.name ? ev.name : 'there';
    let line, sub = null, ttl;
    if (ev.case === 'leaving') {
        line = leavingLine({leave: ev.leave, now: ev.now, starts: ev.starts, name});
        // at most one note, rain first (§5)
        if (ev.leave === 'shutdown' || ev.leave === 'logout')
            sub = rainBefore(ev);
        if (!sub && ev.leave === 'shutdown' && ev.longDay === true)
            sub = 'Long day. Rest well.';
        ttl = LEAVE_MS;
    } else if (ev.case === 'welcome') {
        line = {title: `Welcome back, ${name}.`, pose: 'wave'};
        sub = rainLine(ev.weather?.rain, ev.clock);
        ttl = WELCOME_MS;
    } else {
        line = helloLine({now: ev.now, starts: ev.starts, name});
        ttl = HELLO_MS;
    }
    const bu = buOf(line.pose);
    const hello = (ev.case === 'start' || ev.case === 'wake') && ev.style !== 'minimal';
    if (hello) {
        // line 3: rain coming, else the weather; none known yet, left out (§2)
        const third = rainLine(ev.weather?.rain, ev.clock) ?? weatherLine(ev.weather);
        const lines = [whenLine(ev.now, ev.clock), ...third ? [third] : []];
        const typing = ev.animations === false ? 0 : typingMs([line.title, ...lines], TYPE_MS);
        return {
            text: line.title, leading: bu, trailing: null, compact: null,
            expanded: {leading: {...bu, size: buSize(lines.length)}, center: {title: line.title, lines, typed: true, hero: true}, trailing: null},
            actions: [], minimalAction: false, style: 'transient', ttl: typing + ttl,
            attributes: {case: ev.case, size: 'expanded'},
        };
    }
    const size = sizeOf(line.title, sub);
    return {
        text: line.title, leading: bu, trailing: null,
        compact: size === 'compact' ? {leading: bu, text: line.title, subtitle: sub} : null,
        expanded: null, actions: [], minimalAction: false,
        ttl: ev.case === 'start' || ev.case === 'wake' ? WELCOME_MS : ttl,
        // a note opens the compact on its own (an alert), as a flash with a choice
        alert: size === 'compact',
        attributes: {case: ev.case, size},
    };
}

export default {
    greeting(ev) {
        if (['start', 'wake', 'welcome', 'leaving'].includes(ev.case))
            return moment(ev);
        const shortcut = typeof ev.shortcut === 'string' ? ev.shortcut : '<Super>b';
        const about = ev.case === 'update' ? updateLines(ev.update, ev.running) : null;
        const said = ev.case === 'first-run' ? linesOf({intro: true}, {shortcut}) : linesOf(ev.note, {shortcut});
        const text = about ?? said;
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
            actions: about?.actions ?? (said.more ? [{id: MORE, label: '…and more'}] : []),
            minimalAction: false,
            style: 'transient',
            ttl: typing + SHOW_MS,
            onAction: id => {
                if (id === MORE)
                    ev.onMore?.();
                else if (about && id === COPY)
                    ev.onCopy?.();
                else if (about && id === NOTES)
                    ev.onNotes?.();
            },
            attributes: {case: ev.case},
        };
    },
};
