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

/** A session's pill ends this long after `Stop` when no new prompt came (§2; Ethan,
 * 2026-11-07: 30 s, 2 min, then 5 min). */
export const END_AFTER_STOP = 5 * 60 * 1000;
/** No news for this long → stale: the renderer dims it, Bu `stale` (§3). Working or done
 * alike (Ethan, 2026-11-07: one minute for both; was 2 min while working). */
export const STALE_MS = 60 * 1000;
/** The done pill dims after the same minute. */
export const DONE_STALE = STALE_MS;
/** A run longer than this ends with `party` before `done` (§3). */
export const PARTY_AFTER = 10 * 60 * 1000;
/** Priorities (§2): working; waiting for you; done, under everything else while it lingers
 * (Ethan, 2026-11-07: any other activity takes the centre). The permission prompt is 90
 * (kit ask). */
export const PRIORITY = {working: 35, turn: 60, done: 5};

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

const WORKTREE = /\/\.claude\/worktrees\/([^/]+)/;
// Claude Desktop's sessions opened on no folder run in one of its own:
// ~/.config/Claude/scratch-workspaces/<id>/<id>/scratch-2026-11-06-38687f (seen 2026-11-07)
const SCRATCH = /\/scratch-workspaces\//;

/**
 * @param {*} cwd
 * @returns {boolean} a Claude Desktop session on no folder (its scratch workspace)
 */
export function isScratch(cwd) {
    return SCRATCH.test(str(cwd) ?? '');
}

/**
 * @param {*} cwd
 * @returns {?string} the project: the last part of the working directory; for a Claude
 *   Code worktree (`<repo>/.claude/worktrees/<slug>`), the repository's; none for a Claude
 *   Desktop scratch workspace
 */
export function projectOf(cwd) {
    if (isScratch(cwd))
        return null;                  // its folder's name means nothing to you (§2)
    const dir = (str(cwd) ?? '').split(WORKTREE)[0];
    const parts = dir.split('/').filter(Boolean);
    return parts.at(-1) ?? null;
}

/**
 * @param {*} cwd
 * @returns {?string} the worktree's slug, when the session runs in a Claude Code worktree
 */
export function worktreeOf(cwd) {
    return WORKTREE.exec(str(cwd) ?? '')?.[1] ?? null;
}

/**
 * The session's own name for the compact (§2, Ethan 2026-11-07: sessions of one project
 * share "Claude · buoy"; hover tells them apart): its title when Claude Code sent one,
 * whole (Ethan: the project's name in front stays), else its worktree's slug, else null.
 * Never cut here: the renderer ellipsizes.
 *
 * @param {object} rec
 * @returns {?string}
 */
export function nameOf(rec) {
    return str(rec?.sessionTitle) ?? worktreeOf(rec?.cwd);
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
 * What a tool call is doing, in one line of the compact (§3), and for a permission prompt
 * what it wants (§4). The `safe…` forms carry no command, path or URL (§7: shown while the
 * screen is shared).
 *
 * @param {*} name  tool_name
 * @param {*} input  tool_input
 * @param {*} [cwd]
 * @returns {{title: string, safeTitle: string, want: string, safeWant: string}}
 *   title "Running pnpm test", "Editing src/…/pill.js"; want "Run: pnpm test"
 */
export function toolDoing(name, input, cwd = null) {
    const tool = str(name) ?? 'a tool';
    const i = isPlain(input) ? input : {};
    const with_ = (doing, safeTitle, what, want, safeWant, sep = ' ') => ({
        title: what ? `${doing}${sep}${what}` : safeTitle, safeTitle,
        want: what ? `${want}: ${what}` : safeWant, safeWant,
    });
    if (COMMANDS.has(tool))
        return with_('Running', 'Running a command', firstLine(i.command), 'Run', 'Run a command');
    if (EDITS.has(tool))
        return with_('Editing', 'Editing a file', shortPath(i.file_path ?? i.notebook_path, cwd), 'Edit', 'Edit a file');
    if (tool === 'Read')
        return with_('Reading', 'Reading a file', shortPath(i.file_path, cwd), 'Read', 'Read a file');
    if (tool === 'Grep' || tool === 'Glob')
        return with_('Searching for', 'Searching', str(i.pattern), 'Search', 'Search the files');
    if (tool === 'WebFetch')
        return with_('Fetching', 'Fetching a page', hostOf(i.url), 'Fetch', 'Fetch a page');
    if (tool === 'WebSearch')
        return with_('Searching the web for', 'Searching the web', str(i.query), 'Search', 'Search the web');
    if (tool === 'Agent' || tool === 'Task')
        return with_('Starting a subagent', 'Starting a subagent', str(i.description), 'Start', 'Start a subagent', ': ');
    const mcp = mcpOf(tool);
    if (mcp) {
        const t = `Using ${mcp.server} ${mcp.tool}`;
        return {title: t, safeTitle: t, want: `Use: ${mcp.server} ${mcp.tool}`, safeWant: `Use: ${mcp.server} ${mcp.tool}`};
    }
    return {title: `Using ${tool}`, safeTitle: `Using ${tool}`, want: `Use: ${tool}`, safeWant: `Use: ${tool}`};
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
        pose: 'think', title: 'Thinking', safeTitle: 'Thinking', sessionTitle: null,
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
    if (str(ev.session_title))                    // any event once the session has one (/rename)
        r = {...r, sessionTitle: str(ev.session_title)};
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
        return out({...r, subagents: 0});
    case 'PreToolUse': {
        const d = toolDoing(ev.tool_name, ev.tool_input, r.cwd);
        r = working(r, now);
        if (sub && r.subagents > 0)
            return out({...r, pose: 'busy'});    // the parent still says it works with them (§2)
        return out({...r, pose: 'busy', title: d.title, safeTitle: d.safeTitle});
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
        return out(set('ask', `Needs your OK · ${d.want}`, `Needs your OK · ${d.safeWant}`));
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
        return out({...set(pose, title), subagents: 0, stopped: true, finishedAt: now},
            {alert: true});
    }
    case 'StopFailure': {
        if (!r.shown)
            return none();
        return out({
            ...set('error', 'Stopped with an error'), subagents: 0,
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
    return {...rec, pose: 'busy', title: 'Working', safeTitle: 'Working', lastAt: now};
}

/**
 * The registry adapter (kind `agent`): a session record → presentation data. The source
 * passes `shared` (the screen is shared or recorded, §7).
 *
 * @param {object} rec  step()'s record, plus `shared` and `id` (the session)
 * @returns {object}
 */
export function agent(rec) {
    const label = labelOf(rec);
    const shared = rec.shared === true;
    const pose = rec.pose;
    let trailing = null;
    if (!rec.stopped && rec.startedAt > 0)
        trailing = {since: rec.startedAt};
    else if (rec.finishedAt && rec.startedAt)
        trailing = {text: durationText(rec.finishedAt - rec.startedAt)};
    let priority = PRIORITY.working;
    if (rec.stopped)
        priority = PRIORITY.done;
    else if (pose === 'turn' || pose === 'ask')
        priority = PRIORITY.turn;
    let staleAfter = 0;
    if (rec.stopped)
        staleAfter = DONE_STALE;
    else if (WORKING.has(pose))
        staleAfter = STALE_MS;
    return {
        text: label,
        leading: {mascot: pose},
        trailing,
        // hover: which session (its name, or the label), then what it is doing (§2)
        compact: {
            leading: {mascot: pose},
            text: hoverName(rec),
            subtitle: shared ? rec.safeTitle : rec.title,
        },
        priority,
        staleAfter,
        ttl: rec.stopped ? END_AFTER_STOP : 0,
        // a click brings its terminal up first; without one, the Claude Code tab (§2)
        pressFirst: true,
        attributes: {project: rec.project ?? '', name: nameOf(rec) ?? '', title: shared ? rec.safeTitle : rec.title, pose},
    };
}

/**
 * @param {object} rec
 * @returns {string} what the minimal pill says: "Claude · buoy", or "Claude" alone with no
 *   project (a Desktop scratch session) (§2; the agent first, MASCOT.md: Bu does not say
 *   which agent it is)
 */
export function labelOf(rec) {
    const who = AGENTS[rec?.source] ?? 'Agent';
    return rec?.project ? `${who} · ${rec.project}` : who;
}

/** Claude Desktop's app id (its .desktop file), whose sessions open by deep link (§2). */
export const DESKTOP_APP = 'com.anthropic.Claude.desktop';

/**
 * The deep link that opens a session in Claude Desktop (§2, 2026-11-07): Desktop keeps
 * each of its sessions in `~/.config/Claude/claude-code-sessions/<id>/<id>/local_<uuid>.json`
 * with the CLI's `cliSessionId` (the hook's `session_id`), and its handler opens
 * `claude://code/continue?session=local_<uuid>` (seen in Desktop 4.23118, both
 * undocumented: no match → null, and the caller brings Desktop up as before).
 *
 * @param {string} fileName  `local_<uuid>.json`
 * @param {string} text  the file's contents (searched, not parsed)
 * @param {string} sessionId  the hook's session_id
 * @returns {?string} the URI, or null when this file is not that session
 */
export function desktopRoute(fileName, text, sessionId) {
    const local = /^(local_[A-Za-z0-9-]{1,64})\.json$/.exec(String(fileName ?? ''))?.[1];
    const id = str(sessionId);
    if (!local || !id || !/^[\w-]{1,80}$/.test(id) || typeof text !== 'string')
        return null;
    const ours = text.includes(`"cliSessionId":"${id}"`) || text.includes(`"lastAssistantCliSessionId":"${id}"`);
    return ours ? `claude://code/continue?session=${local}` : null;
}

/**
 * Which session Claude Desktop shows (§2, 2026-11-07): its own `claude_desktop_config.json`
 * keeps `lastPrimaryCodeSession: {id: 'local_<uuid>'}` and writes it as you switch
 * (undocumented, seen in Desktop 4.23118).
 *
 * @param {*} text  the file's contents
 * @returns {?string} `local_<uuid>`, or null
 */
export function desktopShown(text) {
    const m = /"lastPrimaryCodeSession"\s*:\s*\{\s*"id"\s*:\s*"(local_[A-Za-z0-9-]{1,64})"/.exec(typeof text === 'string' ? text : '');
    return m?.[1] ?? null;
}

/**
 * @param {object} rec
 * @returns {string} the compact's title: the session's name, else "New session" for a
 *   Desktop session on no folder, else the label (§2)
 */
export function hoverName(rec) {
    return nameOf(rec) ?? (isScratch(rec?.cwd) ? 'New session' : labelOf(rec));
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
    const label = labelOf(rec);
    const name = nameOf(rec);
    const d = toolDoing(ev.tool_name, ev.tool_input, rec.cwd);
    const want = shared ? d.safeWant : d.want;
    const options = suggestionOf(ev) ? [DENY, ALLOW, ALWAYS] : [DENY, ALLOW];
    const question = `${label} needs your OK`;
    return {
        question,
        options,
        look: {
            leading: {mascot: 'ask'},
            compact: {leading: {mascot: 'ask'}, text: hoverName(rec), subtitle: want, transport: true},
            expanded: {leading: {mascot: 'ask'}, center: {title: question, subtitle: name ? `${name} · ${want}` : want}},
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
