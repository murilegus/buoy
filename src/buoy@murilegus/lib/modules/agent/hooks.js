/**
 * Buoy's entries in Claude Code's `~/.claude/settings.json` (CODING-AGENTS.md §8). Pure:
 * an object in, a new object out; prefs reads and writes the file. Imports nothing, so
 * prefs (its own process, no Shell) may import it — the one module file it does.
 *
 * An entry is Buoy's when its command runs Buoy's hook script (`HOOK_PATH`, wherever the
 * extension is installed); everything else in the file is left as it is.
 */

/** The script's path inside the extension, the mark of Buoy's entries. */
export const HOOK_PATH = 'buoy@murilegus/hooks/claude.js';

/** Events that only report: they run in the background and never slow Claude down (§1). */
export const REPORTS = [
    'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUseFailure',
    'SubagentStart', 'SubagentStop', 'Notification', 'PreCompact', 'PostCompact', 'Stop',
    'StopFailure', 'SessionEnd',
];
/**
 * The event Claude Code waits on after every tool call, so Buoy's ■ can stop the turn there
 * (`{"continue": false}`: Claude stops, the session stays, as Desktop's Stop or Esc; an
 * async hook's answer has no effect, hooks.md "Run hooks in the background"). Buoy answers
 * at once: '' or the stop (2026-11-12).
 */
export const STOP_EVENT = 'PostToolUse';
/** Seconds Claude Code waits for it: Buoy answers in a few ms; gone, the script returns. */
export const STOP_HOOK_TIMEOUT = 5;
/** The one event that waits for an answer (§4). */
export const ASK_EVENT = 'PermissionRequest';
/**
 * Seconds Claude Code waits for the permission hook: above the longest `activity-linger`
 * (30 min), so Buoy always answers first — Deny on its own timeout.
 */
export const ASK_HOOK_TIMEOUT = 30 * 60 + 10;

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {string} path  the script, absolute
 * @returns {string} the hook's command (sh -c), the path single-quoted. Without the script
 *   (Buoy removed, its entries left behind) it does nothing and exits 0, so Claude Code
 *   reports no failing hook on every event (2026-11-08); with it, gjs's own exit status
 *   (`exec`)
 */
export function commandFor(path) {
    const quoted = `'${path.replaceAll('\'', '\'\\\'\'')}'`;
    return `if [ -f ${quoted} ]; then exec gjs -m ${quoted}; fi`;
}

/**
 * @param {*} hook  one item of an entry's `hooks`
 * @returns {boolean} it runs Buoy's script
 */
export function isOurs(hook) {
    return isPlain(hook) && typeof hook.command === 'string' && hook.command.includes(HOOK_PATH);
}

// Every event's list without Buoy's hooks; an entry left with none goes, an event left
// with none goes. Entries that are not objects are kept as they are.
function without(hooks) {
    const out = {};
    for (const [event, list] of Object.entries(hooks)) {
        if (!Array.isArray(list)) {
            out[event] = list;
            continue;
        }
        const kept = [];
        for (const entry of list) {
            if (!isPlain(entry) || !Array.isArray(entry.hooks)) {
                kept.push(entry);
                continue;
            }
            const rest = entry.hooks.filter(h => !isOurs(h));
            if (rest.length === entry.hooks.length)
                kept.push(entry);
            else if (rest.length)
                kept.push({...entry, hooks: rest});
        }
        if (kept.length)
            out[event] = kept;
    }
    return out;
}

/**
 * @param {*} settings  the parsed file; null or missing → {}
 * @param {string} command  commandFor(the script)
 * @returns {object} a new settings object with Buoy's entries, once each, after the user's
 * @throws {Error} when the file is not a JSON object, or its `hooks` is not one
 */
export function install(settings, command) {
    const s = settings ?? {};
    if (!isPlain(s))
        throw new Error('settings.json is not a JSON object');
    if (s.hooks !== undefined && !isPlain(s.hooks))
        throw new Error('"hooks" in settings.json is not an object');
    const hooks = without(s.hooks ?? {});
    const add = (event, hook) => {
        const list = Array.isArray(hooks[event]) ? hooks[event] : [];
        hooks[event] = [...list, {hooks: [{type: 'command', command, ...hook}]}];
    };
    for (const event of REPORTS)
        add(event, {async: true});
    add(STOP_EVENT, {timeout: STOP_HOOK_TIMEOUT});
    add(ASK_EVENT, {timeout: ASK_HOOK_TIMEOUT});
    return {...s, hooks};
}

/**
 * @param {*} settings  the parsed file
 * @returns {object} a new settings object without Buoy's entries; `hooks` itself goes
 *   when nothing else was in it
 */
export function uninstall(settings) {
    if (!isPlain(settings))
        return settings ?? {};
    if (!isPlain(settings.hooks))
        return settings;
    const hooks = without(settings.hooks);
    const rest = {...settings};
    delete rest.hooks;
    return Object.keys(hooks).length ? {...rest, hooks} : rest;
}

/**
 * @param {*} settings  the parsed file
 * @returns {'all'|'some'|'none'} whether every event has Buoy's hook (prefs' switch: on
 *   only for 'all'; 'some' says an older Buoy left part of them)
 */
export function installed(settings) {
    const hooks = isPlain(settings) && isPlain(settings.hooks) ? settings.hooks : {};
    // ours, and run the way this Buoy installs it: a report in the background, the stop
    // and the ask waited on (an older Buoy ran PostToolUse in the background: 'some')
    const async = event => REPORTS.includes(event);
    const ours = (event, right) => Array.isArray(hooks[event]) &&
        hooks[event].some(e => isPlain(e) && Array.isArray(e.hooks) &&
            e.hooks.some(h => isOurs(h) && (!right || (h.async === true) === async(event))));
    const events = [...REPORTS, STOP_EVENT, ASK_EVENT];
    if (events.every(e => ours(e, true)))
        return 'all';
    return events.some(e => ours(e, false)) ? 'some' : 'none';
}

/**
 * The prefs row's subtitle (CODING-AGENTS.md §8).
 *
 * @param {object} s
 * @param {'all'|'some'|'none'} s.state  installed()
 * @param {boolean} s.found  Claude Code is there (its folder, or `claude` on the PATH)
 * @param {?string} s.error  the file could not be read or is not a JSON object
 * @param {boolean} s.moduleOn  `modules-agent`
 * @param {string} s.file  the file as shown, `~/.claude/settings.json`
 * @returns {string}
 */
export function hooksNote({state, found, error, moduleOn, file}) {
    if (error)
        return `${file} could not be read (${error}): Buoy leaves it alone`;
    if (state === 'all')
        return moduleOn ? `Hooks installed in ${file}` : 'Hooks installed; the module is off, so they return at once';
    if (state === 'some')
        return `Part of Buoy's hooks are in ${file}: turn on to add the rest`;
    if (!found)
        return 'Claude Code not found';
    return `Adds Buoy's hooks to ${file}; off removes them`;
}
