/**
 * Claude Code's hook events → one pill per session (docs/CODING-AGENTS.md §2–§4, §7).
 * Pure (ARCHITECTURE rule 2): no St, no Main, no timers — source.js keeps the records and
 * the clock, this file decides what each event means and how a session looks.
 *
 *   parseEvent(text)          the hook's stdin JSON, or null
 *   step(rec, ev, now)        the session record after an event, and what to do
 *   agent(rec)                the registry adapter: a record → presentation data
 *   askOf(rec, ev, opts)      a PermissionRequest → the ask's question, buttons, look
 *   reply(choice, ev)         the button pressed → the stdout Claude Code expects
 *
 * Field names checked against code.claude.com/docs/en/hooks on 2026-11-07 (§12).
 */

import {sinceText} from '../../kit/presentation.js';

/** The agents this module knows, by the `source` the hook sends (CODING-AGENTS.md §1). */
export const AGENTS = {claude: 'Claude'};

/** A session's pill ends this long after `Stop` when no new prompt came (§2, Ethan). */
export const END_AFTER_STOP = 30 * 1000;
/** No event for this long while working → stale: the renderer dims it, Bu `stale` (§3). */
export const STALE_MS = 2 * 60 * 1000;
/** A run longer than this ends with `party` before `done` (§3). */
export const PARTY_AFTER = 10 * 60 * 1000;
/** Priorities (§2): working and done; waiting for you. The permission prompt is 90 (kit ask). */
export const PRIORITY = {working: 35, turn: 60};

/** The buttons, in order (§4). Always only when Claude Code sent a suggestion. */
export const DENY = 'Deny', ALLOW = 'Allow', ALWAYS = 'Always';
/** The ask's fallback after `agent-ask-timeout`: not a button, so never pressed. */
export const TIMEOUT = '\u0000timeout';

const WORKING = new Set(['think', 'busy', 'compact']);
// Notification types that mean "it waits for you" (the hooks reference's list)
const TURN = new Set(['idle_prompt', 'agent_needs_input', 'elicitation_dialog', 'elicitation_url_dialog']);

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * @param {string} text  the hook's stdin
 * @returns {?object} the event, or null when it is not one (no session or event name)
 */
export function parseEvent(text) {
    let ev;
    try {
        ev = JSON.parse(text);
    } catch {
        return null;
    }
    if (!isPlain(ev) || !str(ev.session_id) || !str(ev.hook_event_name))
        return null;
    return ev;
}

/**
 * @param {*} cwd
 * @returns {?string} the project: the last part of the working directory
 */
export function projectOf(cwd) {
    const parts = (str(cwd) ?? '').split('/').filter(Boolean);
    return parts.at(-1) ?? null;
}

/**
 * A path as the pill says it: relative to the project when inside it, and with the middle
 * folded when deep ("src/…/pill.js").
 *
 * @param {*} path
 * @param {*} cwd
 * @returns {?string}
 */
export function shortPath(path, cwd) {
    let p = str(path);
    if (!p)
        return null;
    const root = str(cwd)?.replace(/\/+$/, '');
    if (root && p.startsWith(`${root}/`))
        p = p.slice(root.length + 1);
    const parts = p.split('/').filter(Boolean);
    const lead = p.startsWith('/') ? '/' : '';
    if (parts.length <= 2)
        return lead + parts.join('/');
    return `${lead}${parts[0]}/…/${parts.at(-1)}`;
}

const baseName = path => str(path)?.split('/').filter(Boolean).at(-1) ?? null;
const firstLine = text => str(text)?.split('\n')[0].trim() ?? null;

function hostOf(url) {
    const m = /^[a-z][\w+.-]*:\/\/([^/?#]+)/i.exec(str(url) ?? '');
    return m ? m[1].replace(/^[^@]*@/, '') : null;
}

// mcp__<server>__<tool>; plugin servers are mcp__plugin_<plugin>_<server>__<tool>
function mcpOf(name) {
    const m = /^mcp__(.+?)__(.+)$/.exec(name);
    return m ? {server: m[1].replace(/^plugin_/, ''), tool: m[2]} : null;
}

const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const COMMANDS = new Set(['Bash', 'PowerShell', 'Monitor']);

/**
 * What a tool call is doing, in the compact's words (§3) and, for a permission prompt,
 * what it wants (§4). The `safe…` forms carry no command, path or URL (§7: shown while
 * the screen is shared).
 *
 * @param {*} name  tool_name
 * @param {*} input  tool_input
 * @param {*} [cwd]
 * @returns {{title: string, safeTitle: string, detail: ?string, safeDetail: string,
 *   want: string, safeWant: string}}
 */
export function toolDoing(name, input, cwd = null) {
    const tool = str(name) ?? 'a tool';
    const i = isPlain(input) ? input : {};
    const with_ = (title, safeTitle, what, want, safeWant) => ({
        title, safeTitle,
        detail: what ? `${tool} · ${what}` : tool, safeDetail: tool,
        want: what ? `${want}: ${what}` : safeWant, safeWant,
    });
    if (COMMANDS.has(tool))
        return with_('Running a command', 'Running a command', firstLine(i.command), 'Run', 'Run a command');
    if (EDITS.has(tool)) {
        const file = i.file_path ?? i.notebook_path;
        const b = baseName(file);
        return with_(b ? `Editing ${b}` : 'Editing a file', 'Editing a file', shortPath(file, cwd), 'Edit', 'Edit a file');
    }
    if (tool === 'Read') {
        const b = baseName(i.file_path);
        return with_(b ? `Reading ${b}` : 'Reading a file', 'Reading a file', shortPath(i.file_path, cwd), 'Read', 'Read a file');
    }
    if (tool === 'Grep' || tool === 'Glob')
        return with_('Searching', 'Searching', str(i.pattern), 'Search', 'Search the files');
    if (tool === 'WebFetch')
        return with_('Fetching a page', 'Fetching a page', hostOf(i.url), 'Fetch', 'Fetch a page');
    if (tool === 'WebSearch')
        return with_('Searching the web', 'Searching the web', str(i.query), 'Search', 'Search the web');
    if (tool === 'Agent' || tool === 'Task')
        return with_('Starting a subagent', 'Starting a subagent', str(i.description), 'Start', 'Start a subagent');
    const mcp = mcpOf(tool);
    if (mcp) {
        const r = with_(`Using ${mcp.tool}`, `Using ${mcp.tool}`, null, '', `Use: ${mcp.server} ${mcp.tool}`);
        return {...r, detail: `${mcp.server} · ${mcp.tool}`, safeDetail: `${mcp.server} · ${mcp.tool}`};
    }
    return with_(`Using ${tool}`, `Using ${tool}`, null, '', `Use: ${tool}`);
}

/**
 * @param {number} ms
 * @returns {string} "<1 min", "4 min", "1 h 5 min", "2 h" (kit presentation.js sinceText)
 */
export function durationText(ms) {
    return sinceText(0, Number.isFinite(ms) ? ms : 0);
}

/**
 * A new record for a session (nothing shown yet).
 *
 * @param {string} source  'claude'
 * @param {object} ev
 * @returns {object}
 */
export function newRecord(source, ev) {
    return {
        id: ev.session_id, source, cwd: str(ev.cwd), project: projectOf(ev.cwd),
        shown: false, startedAt: 0, finishedAt: 0, lastAt: 0,
        pose: 'think', title: 'Thinking', safeTitle: 'Thinking', detail: null, safeDetail: null,
        subagents: 0, stopped: false,
    };
}

const working = (rec, now) => ({
    ...rec, shown: true, stopped: false, finishedAt: 0,
    startedAt: rec.shown && !rec.stopped && rec.startedAt ? rec.startedAt : now,
});

function subagentTitle(n) {
    return n > 1 ? `Working with ${n} subagents` : 'Working with a subagent';
}

/**
 * One hook event applied to a session (CODING-AGENTS.md §3).
 *
 * @param {?object} rec  the session's record, or null for a session never seen
 * @param {object} ev  parseEvent()'s result
 * @param {number} now  ms
 * @param {string} [source]
 * @returns {{rec: object, show: boolean, end: boolean, alert: boolean}}
 *   show: surface or update the pill · end: end it now · alert: expand it briefly
 */
export function step(rec, ev, now, source = 'claude') {
    let r = rec ?? newRecord(source, ev);
    if (str(ev.cwd))
        r = {...r, cwd: str(ev.cwd), project: projectOf(ev.cwd)};
    const out = (next, {show = next.shown, end = false, alert = false} = {}) =>
        ({rec: {...next, lastAt: now}, show, end, alert});
    const none = () => ({rec: r, show: false, end: false, alert: false});
    const set = (pose, title, safeTitle = title) => ({...r, pose, title, safeTitle});
    const sub = str(ev.agent_id) !== null;          // fired inside a subagent

    switch (ev.hook_event_name) {
    case 'SessionStart':
        return out(r, {show: false});
    case 'UserPromptSubmit':
        // the prompt itself is never kept (§7)
        r = working(set('think', 'Thinking'), now);
        return out({...r, detail: null, safeDetail: null, subagents: 0});
    case 'PreToolUse': {
        const d = toolDoing(ev.tool_name, ev.tool_input, r.cwd);
        r = working(r, now);
        if (sub && r.subagents > 0) {
            // the subagent's tools: the parent still says it works with them (§2)
            return out({...r, pose: 'busy', detail: d.detail, safeDetail: d.safeDetail});
        }
        return out({...r, pose: 'busy', title: d.title, safeTitle: d.safeTitle, detail: d.detail, safeDetail: d.safeDetail});
    }
    case 'PostToolUse':
        if (!r.shown || r.stopped)
            return none();
        return out({...r, pose: 'busy'});
    case 'PostToolUseFailure':
        if (!r.shown || r.stopped)
            return none();
        return out(set('error', 'Something failed'));
    case 'SubagentStart': {
        const n = r.subagents + 1;
        r = working(r, now);
        return out({...r, subagents: n, pose: 'busy', title: subagentTitle(n), safeTitle: subagentTitle(n)});
    }
    case 'SubagentStop': {
        if (!r.shown || r.stopped)
            return none();
        const n = Math.max(0, r.subagents - 1);
        const title = n ? subagentTitle(n) : 'Working';
        return out({...r, subagents: n, pose: 'busy', title, safeTitle: title});
    }
    case 'PermissionRequest': {
        const d = toolDoing(ev.tool_name, ev.tool_input, r.cwd);
        r = working(r, now);
        return out({...set('ask', 'Needs your OK'), detail: d.want, safeDetail: d.safeWant});
    }
    case 'Notification': {
        const type = ev.notification_type;
        if (type === 'permission_prompt') {
            if (!r.shown || r.stopped)
                return none();
            return out(set('ask', 'Needs your OK'));
        }
        // after Stop the pill is ending: an idle reminder brings nothing back (§2)
        if (TURN.has(type) && r.shown && !r.stopped)
            return out(set('turn', 'Waiting for you'), {alert: true});
        return none();
    }
    case 'PreCompact':
        // a manual /compact between prompts takes no room
        if (!r.shown || r.stopped)
            return none();
        return out(set('compact', 'Compacting'));
    case 'PostCompact':
        if (!r.shown || r.stopped)
            return none();
        return out(set('busy', 'Working'));
    case 'Stop': {
        if (!r.shown)
            return none();
        const took = r.startedAt ? now - r.startedAt : 0;
        const pose = took > PARTY_AFTER ? 'party' : 'done';
        const title = took >= 60000 ? `Done in ${durationText(took)}` : 'Done';
        return out({...set(pose, title), detail: null, safeDetail: null, subagents: 0, stopped: true, finishedAt: now},
            {alert: true});
    }
    case 'StopFailure': {
        if (!r.shown)
            return none();
        return out({
            ...set('error', 'Stopped with an error'), detail: null, safeDetail: null, subagents: 0,
            stopped: true, finishedAt: now,
        }, {alert: true});
    }
    case 'SessionEnd':
        return {rec: r, show: false, end: true, alert: false};
    }
    return none();                                 // Claude Code adds events often
}

/**
 * The permission prompt is over (answered in Buoy, in the terminal, or its hook gone):
 * the session works again, so it can go stale if nothing follows (a denial in the
 * terminal interrupts Claude without a Stop).
 *
 * @param {object} rec
 * @param {number} now
 * @returns {object} the record, back to work when it was asking
 */
export function answered(rec, now) {
    if (rec?.pose !== 'ask')
        return rec;
    return {...rec, pose: 'busy', title: 'Working', safeTitle: 'Working', detail: null, safeDetail: null, lastAt: now};
}

/**
 * The registry adapter (kind `agent`): a session record → presentation data. The source
 * passes `shared` (the screen is shared or recorded, §7).
 *
 * @param {object} rec  step()'s record, plus `shared` and `id` (the session)
 * @returns {object}
 */
export function agent(rec) {
    const name = `${AGENTS[rec.source] ?? 'Agent'} · ${rec.project ?? 'session'}`;
    const shared = rec.shared === true;
    const pose = rec.pose;
    let trailing = null;
    if (!rec.stopped && rec.startedAt > 0)
        trailing = {since: rec.startedAt};
    else if (rec.finishedAt && rec.startedAt)
        trailing = {text: durationText(rec.finishedAt - rec.startedAt)};
    const waits = pose === 'turn' || pose === 'ask';
    return {
        text: name,
        leading: {mascot: pose},
        trailing,
        compact: {
            leading: {mascot: pose},
            text: shared ? rec.safeTitle : rec.title,
            subtitle: (shared ? rec.safeDetail : rec.detail) ?? name,
        },
        priority: waits ? PRIORITY.turn : PRIORITY.working,
        staleAfter: WORKING.has(pose) ? STALE_MS : 0,
        ttl: rec.stopped ? END_AFTER_STOP : 0,
        attributes: {project: rec.project ?? '', title: shared ? rec.safeTitle : rec.title, pose},
    };
}

/**
 * A PermissionRequest as an ask (§4).
 *
 * @param {object} rec  the session's record
 * @param {object} ev  the PermissionRequest
 * @param {object} [opts]
 * @param {boolean} [opts.shared]  hide the command, path or URL (§7)
 * @returns {{question: string, options: string[], look: object}} look: the ask's
 *   presentation (kit stack.ask `look`)
 */
export function askOf(rec, ev, {shared = false} = {}) {
    const name = `${AGENTS[rec.source] ?? 'Agent'} · ${rec.project ?? 'session'}`;
    const d = toolDoing(ev.tool_name, ev.tool_input, rec.cwd);
    const want = shared ? d.safeWant : d.want;
    const options = suggestionOf(ev) ? [DENY, ALLOW, ALWAYS] : [DENY, ALLOW];
    const question = `${name} needs your OK`;
    return {
        question,
        options,
        look: {
            leading: {mascot: 'ask'},
            compact: {leading: {mascot: 'ask'}, text: 'Needs your OK', subtitle: want, transport: true},
            expanded: {leading: {mascot: 'ask'}, center: {title: question, subtitle: want}},
            minimalAction: false,
        },
    };
}

/**
 * Whether an event means the open permission prompt was answered elsewhere (in the
 * terminal, or Claude Desktop's card, §4). Report hooks run in the background, so one
 * sent before the prompt may arrive after it: a tool's result settles the prompt only
 * when it is the same call (PermissionRequest carries no tool_use_id, so name and
 * input); a new prompt, a stop or the session's end always do. A Notification never
 * does (the terminal's own `permission_prompt` comes while the hook waits).
 *
 * @param {object} asked  the PermissionRequest
 * @param {object} ev  a later event of the same session
 * @returns {boolean}
 */
export function settles(asked, ev) {
    switch (ev.hook_event_name) {
    case 'PostToolUse':
    case 'PostToolUseFailure':
        return ev.tool_name === asked.tool_name &&
            JSON.stringify(ev.tool_input ?? null) === JSON.stringify(asked.tool_input ?? null);
    case 'UserPromptSubmit':
    case 'Stop':
    case 'StopFailure':
    case 'SessionEnd':
        return true;
    }
    return false;
}

/**
 * @param {object} ev
 * @returns {?object} the first of Claude Code's `permission_suggestions`, unchanged
 */
export function suggestionOf(ev) {
    const list = ev?.permission_suggestions;
    return Array.isArray(list) && isPlain(list[0]) ? list[0] : null;
}

/**
 * The hook's stdout for an answer (§4). null (no answer: ended, answered in the terminal,
 * Buoy gone) is '' — no decision, Claude Code's own flow stands.
 *
 * @param {?string} choice  DENY, ALLOW, ALWAYS, or TIMEOUT
 * @param {object} ev  the PermissionRequest
 * @returns {string}
 */
export function reply(choice, ev) {
    let decision;
    if (choice === ALLOW) {
        decision = {behavior: 'allow'};
    } else if (choice === ALWAYS) {
        const s = suggestionOf(ev);
        decision = s ? {behavior: 'allow', updatedPermissions: [s]} : {behavior: 'allow'};
    } else if (choice === DENY) {
        decision = {behavior: 'deny', message: 'Denied in Buoy'};
    } else if (choice === TIMEOUT) {
        decision = {behavior: 'deny', message: 'No answer in Buoy'};
    } else {
        return '';
    }
    return JSON.stringify({hookSpecificOutput: {hookEventName: 'PermissionRequest', decision}});
}

export default {agent};
