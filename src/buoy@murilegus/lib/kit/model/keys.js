/**
 * Keyboard (SPEC §2c, decided 2026-11-03), the pure part: which key answers which
 * button of an ask, and moving between pills. The island owns the grab and the events.
 *
 *   an ask's buttons  each takes the first letter of its label (Allow → a, Deny → d,
 *                     Yes → y); labels sharing a first letter (Allow, Always) or not
 *                     starting with a letter take their position instead (1–9)
 */

// Letters are compared as typed on a plain layout: no case, no diacritics (Đồng ý → d).
function fold(s) {
    return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

function firstLetter(label) {
    const c = fold(String(label ?? '').trim()).charAt(0);
    return /^\p{L}$/u.test(c) ? c : null;
}

/**
 * @param {string[]} labels  the buttons, in order
 * @returns {Array<?string>} one key per button: a lower-case letter, a digit '1'–'9',
 *   or null (a tenth button sharing a letter has no key)
 */
export function mnemonics(labels) {
    const first = labels.map(firstLetter);
    const count = new Map();
    for (const f of first) {
        if (f)
            count.set(f, (count.get(f) ?? 0) + 1);
    }
    return first.map((f, i) => {
        if (f && count.get(f) === 1)
            return f;
        return i < 9 ? String(i + 1) : null;
    });
}

/**
 * @param {Array<{id: string, key: ?string}>} actions  planned actions with their keys
 * @param {string} typed  the key's unicode text (Clutter.Event.get_key_unicode())
 * @returns {?string} the id of the action that key answers
 */
export function actionForKey(actions, typed) {
    if (!typed)
        return null;
    const k = fold(typed);
    return actions.find(a => a.key && a.key === k)?.id ?? null;
}

/**
 * ←/→ between pills: stops at the ends, no wrap (the centre pill is the first).
 *
 * @param {number} index  focused pill
 * @param {number} delta  -1 or +1
 * @param {number} count  pills shown
 * @returns {number}
 */
export function step(index, delta, count) {
    if (count <= 0)
        return 0;
    return Math.max(0, Math.min(count - 1, index + delta));
}

/**
 * How a caret blinks, as GNOME's own text fields do (org.gnome.desktop.interface, GTK's
 * gtktext.c: `cursor-blink-time` is one whole cycle, on then off; after
 * `cursor-blink-timeout` seconds with no typing it stays on). Shell's own entries do not
 * blink (Mutter 50's ClutterText has no blink), Buoy's typed answer does (2026-11-13, Ethan).
 *
 * @param {object} s
 * @param {boolean} s.blink  `cursor-blink`
 * @param {number} s.time  `cursor-blink-time`, ms
 * @param {number} s.timeout  `cursor-blink-timeout`, s
 * @returns {?{half: number, stopAfter: number}}  ms on and ms off each, ms of blinking after the
 *   last key; null: a steady caret
 */
export function caretBlink({blink, time, timeout}) {
    if (blink !== true || !Number.isFinite(time) || time < 200)
        return null;
    const half = Math.round(time / 2);
    const stopAfter = Number.isFinite(timeout) && timeout > 0 ? Math.round(timeout * 1000) : Infinity;
    return {half, stopAfter};
}
