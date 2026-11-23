/**
 * Timers (FEATURES M4 "Timer"; design/compact "Hẹn giờ", 2026-11-22, Ethan), pure: what runs, what
 * is left, Pomodoro's turns, GNOME Clocks' saved timers, and how times read. No GLib: source.js
 * keeps the store and the one timeout, tab.js draws.
 *
 * A timer: {id, name, seconds, state: 'running' | 'paused', end, left, pomodoro}
 *   seconds   its length (this turn's, for Pomodoro)
 *   end       ms since the epoch it ends, while running
 *   left      ms left, while paused
 *   pomodoro  null, or {phase: 'work' | 'break' | 'long', round, rounds}
 * An ended one: {id, name, seconds, at, pomodoro, clocks}
 *   clocks    GNOME Clocks' own "Time is up!", in place of its notification (no Restart)
 */

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
/** The quick lengths of the tab's setup, in minutes (design/compact "Hẹn giờ"). */
export const QUICK = [1, 3, 5, 10, 15, 30];
/** The longest the setup sets: Clocks' own (99:59:59, timer-setup.ui). */
export const MAX_SECONDS = 99 * 3600 + 59 * 60 + 59;
/** Pomodoro's defaults: 25 min work, 5 break, 15 after the last of 4 (prefs `timer-pomodoro-…`). */
export const POMODORO = Object.freeze({work: 25, break: 5, long: 15, rounds: 4});

const two = n => String(n).padStart(2, '0');

/**
 * @param {number} ms  time left
 * @returns {string} as a countdown reads: "3:18", "1:02:03", "0:00" — whole seconds up, so it
 *   says 0:00 only at the end
 */
export function clockText(ms) {
    const s = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / SECOND));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/**
 * @param {number} seconds
 * @returns {string} the setup's: "0:05:00", as Clocks shows its h:mm:ss
 */
export function setupText(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

/**
 * @param {number} seconds
 * @returns {string} a length in words: "7 min", "1 h 30 min", "45 s"
 */
export function lengthText(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
    const parts = [h ? `${h} h` : null, m ? `${m} min` : null, r ? `${r} s` : null].filter(Boolean);
    return parts.length ? parts.join(' ') : '0 s';
}

/**
 * @param {number} ms  ms since the epoch
 * @returns {string} "15:42", local time
 */
export function hourText(ms) {
    const d = new Date(ms);
    return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

// --- GNOME Clocks' saved timers ----------------------------------------------------------------------

/**
 * @param {*} list  `org.gnome.clocks timers`, unpacked: [{duration: seconds, name?}]
 *   (gnome-clocks timer-item.vala serialize; one of no length is dropped, as Clocks' deserialize)
 * @returns {{seconds: number, name: string}[]}
 */
export function presetsFromClocks(list) {
    return (Array.isArray(list) ? list : []).flatMap(p => {
        const seconds = Number(p?.duration);
        if (!Number.isInteger(seconds) || seconds <= 0)
            return [];
        return [{seconds: Math.min(seconds, MAX_SECONDS), name: typeof p.name === 'string' ? p.name.trim() : ''}];
    });
}

/**
 * @param {{seconds: number, name: string}[]} presets
 * @returns {{duration: number, name?: string}[]} for `org.gnome.clocks timers` (aa{sv}); no name
 *   key when there is none, as Clocks writes
 */
export function presetsToClocks(presets) {
    return presets.map(p => ({duration: Math.round(p.seconds), ...p.name ? {name: p.name} : {}}));
}

/**
 * @param {{seconds: number, name: string}[]} presets
 * @param {number} seconds
 * @returns {boolean} one of that length is saved already
 */
export function savedLength(presets, seconds) {
    return presets.some(p => p.seconds === seconds);
}

// --- running ------------------------------------------------------------------------------------------

/**
 * @param {{seconds: number, name?: string, pomodoro?: ?object}} what
 * @param {string} id
 * @param {number} now
 * @returns {object} a timer, running
 */
export function startTimer(what, id, now) {
    const seconds = Math.max(1, Math.min(MAX_SECONDS, Math.round(what.seconds)));
    return {
        id, name: typeof what.name === 'string' ? what.name.trim() : '', seconds, state: 'running',
        end: now + seconds * SECOND, left: seconds * SECOND, pomodoro: what.pomodoro ?? null,
    };
}

/**
 * @param {object} t  a timer
 * @param {number} now
 * @returns {number} ms left
 */
export function remaining(t, now) {
    return Math.max(0, t.state === 'running' ? t.end - now : t.left);
}

/**
 * @param {object} t  a timer
 * @param {number} now
 * @returns {object} paused, its time left kept
 */
export function pauseTimer(t, now) {
    return t.state === 'running' ? {...t, state: 'paused', left: remaining(t, now)} : t;
}

/**
 * @param {object} t  a timer
 * @param {number} now
 * @returns {object} running again from what was left
 */
export function resumeTimer(t, now) {
    return t.state === 'paused' ? {...t, state: 'running', end: now + t.left} : t;
}

/**
 * @param {object} t  a timer
 * @param {number} now
 * @returns {object} a minute more; its length grows with it, so the ring stays true
 */
export function addMinute(t, now) {
    const seconds = Math.min(MAX_SECONDS, t.seconds + 60);
    return t.state === 'running'
        ? {...t, seconds, end: t.end + MINUTE}
        : {...t, seconds, left: Math.min(seconds * SECOND, remaining(t, now) + MINUTE)};
}

/**
 * @param {object[]} timers
 * @param {number} now
 * @returns {{done: object[], left: object[]}} those that ended by now, and the rest
 */
export function split(timers, now) {
    const done = timers.filter(t => t.state === 'running' && t.end <= now);
    return {done, left: timers.filter(t => !done.includes(t))};
}

/**
 * @param {object[]} timers
 * @returns {?number} the soonest end of a running one, or null (no timeout)
 */
export function nextEnd(timers) {
    const ends = timers.filter(t => t.state === 'running').map(t => t.end);
    return ends.length ? Math.min(...ends) : null;
}

/**
 * @param {object[]} timers
 * @param {number} now
 * @returns {object[]} running first, the soonest first; then the paused, the least left first
 */
export function ordered(timers, now) {
    return [...timers].sort((a, b) => {
        if (a.state !== b.state)
            return a.state === 'running' ? -1 : 1;
        return remaining(a, now) - remaining(b, now);
    });
}

/**
 * @param {object} t  a timer
 * @returns {string} its name; Pomodoro's turn "Focus 2/4", "Break"; none: "Timer"
 */
export function titleOf(t) {
    const p = t.pomodoro;
    if (p)
        return p.phase === 'work' ? `Focus ${p.round}/${p.rounds}` : 'Break';
    return t.name || 'Timer';
}

// --- Pomodoro --------------------------------------------------------------------------------------------

/**
 * @param {*} cfg  {work, break, long, rounds} in minutes (prefs), any of them missing or out of range: the default
 * @returns {{work: number, break: number, long: number, rounds: number}}
 */
export function pomodoroOf(cfg) {
    const ok = (v, lo, hi, d) => Number.isInteger(v) && v >= lo && v <= hi ? v : d;
    return {
        work: ok(cfg?.work, 1, 120, POMODORO.work), break: ok(cfg?.break, 1, 60, POMODORO.break),
        long: ok(cfg?.long, 1, 120, POMODORO.long), rounds: ok(cfg?.rounds, 1, 10, POMODORO.rounds),
    };
}

/**
 * @param {*} cfg  prefs, as pomodoroOf
 * @returns {object} what starts Pomodoro: its first work turn
 */
export function pomodoroStart(cfg) {
    const c = pomodoroOf(cfg);
    return {seconds: c.work * 60, name: 'Pomodoro', pomodoro: {phase: 'work', round: 1, rounds: c.rounds}};
}

/**
 * The turn after one that ended: a work turn → its break (the long one after the last round); a
 * break → the next round's work, the first again after the long break.
 *
 * @param {?object} p  the ended turn's pomodoro
 * @param {*} cfg
 * @returns {?object} what to start next ({seconds, name, pomodoro}), or null (not Pomodoro)
 */
export function pomodoroNext(p, cfg) {
    if (!p)
        return null;
    const c = pomodoroOf(cfg);
    if (p.phase === 'work') {
        const last = p.round >= p.rounds;
        return {seconds: (last ? c.long : c.break) * 60, name: 'Pomodoro', pomodoro: {phase: last ? 'long' : 'break', round: p.round, rounds: p.rounds}};
    }
    const round = p.phase === 'long' ? 1 : p.round + 1;
    return {seconds: c.work * 60, name: 'Pomodoro', pomodoro: {phase: 'work', round, rounds: p.rounds}};
}

/**
 * @param {?object} p  a work turn's pomodoro
 * @param {*} cfg
 * @returns {?object} the same round's work again, skipping the break ("Keep going")
 */
export function pomodoroAgain(p, cfg) {
    if (!p)
        return null;
    const c = pomodoroOf(cfg);
    const round = p.phase === 'work' ? Math.min(p.round + 1, p.rounds) : p.round;
    return {seconds: c.work * 60, name: 'Pomodoro', pomodoro: {phase: 'work', round, rounds: p.rounds}};
}

// --- kept over a restart -----------------------------------------------------------------------------------

/**
 * @param {object[]} timers
 * @returns {string} for `timer-state`: the timers as they are (ends, not ticks)
 */
export function serialize(timers) {
    return JSON.stringify(timers.map(t => ({
        id: t.id, name: t.name, seconds: t.seconds, state: t.state, end: t.end, left: t.left, pomodoro: t.pomodoro,
    })));
}

/**
 * @param {*} text  `timer-state`
 * @returns {object[]} the timers kept; anything malformed dropped
 */
export function deserialize(text) {
    let list;
    try {
        list = JSON.parse(typeof text === 'string' && text ? text : '[]');
    } catch {
        return [];
    }
    const num = v => typeof v === 'number' && Number.isFinite(v);
    return (Array.isArray(list) ? list : []).filter(t => t && typeof t.id === 'string' && num(t.seconds) && t.seconds > 0 &&
        ((t.state === 'running' && num(t.end)) || (t.state === 'paused' && num(t.left))))
        .map(t => ({
            id: t.id, name: typeof t.name === 'string' ? t.name : '', seconds: t.seconds, state: t.state,
            end: num(t.end) ? t.end : 0, left: num(t.left) ? t.left : 0,
            pomodoro: t.pomodoro && ['work', 'break', 'long'].includes(t.pomodoro.phase) &&
                Number.isInteger(t.pomodoro.round) && Number.isInteger(t.pomodoro.rounds) ? t.pomodoro : null,
        }));
}
