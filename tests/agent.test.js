// Run: gjs -m tests/agent.test.js   (pure: Claude Code's events → the session's pill, the
// permission reply, Buoy's entries in ~/.claude/settings.json; docs/CODING-AGENTS.md §11)
import GLib from 'gi://GLib';

import {
    AGENTS, ALLOW, ALWAYS, DENY, DESKTOP_APP, DONE_STALE, PARTY_AFTER, STALE_MS, TIMEOUT,
    STOP, STOP_REPLY, agent, answered, askOf, interrupted, stopping, isQuestion, QUESTION_TITLE, taskProgress, taskRows, taskStep, tasksFromFiles, desktopRoute, desktopShown, durationText, isScratch, nameOf, parseEvent, projectOf, worktreeOf, reply, settles, shortPath, step, suggestionOf, toolDoing,
} from '../src/buoy@murilegus/lib/modules/agent/adapter.js';
import {
    ASK_EVENT, ASK_HOOK_TIMEOUT, HOOK_PATH, REPORTS, STOP_EVENT, STOP_HOOK_TIMEOUT, commandFor, hooksNote, install, installed, isOurs, uninstall,
} from '../src/buoy@murilegus/lib/modules/agent/hooks.js';
import {Registry} from '../src/buoy@murilegus/lib/kit/services/registry.js';
import {PRIORITY as KIT_PRIORITY, SETTLE_MS, tierOf, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';
import {planCompact, planExpanded, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

function throws(fn, msg) {
    try {
        fn();
    } catch {
        return;
    }
    throw new Error(`${msg}: did not throw`);
}

const SID = 'abc-123';
const CWD = '/home/ethan/works/buoy';
const T0 = 1_000_000_000;
const MIN = 60 * 1000;
const ev = (name, more = {}) => ({session_id: SID, cwd: CWD, hook_event_name: name, ...more});

// Run events through step() from nothing; returns every result
function run(list, start = T0) {
    let rec = null;
    const out = [];
    list.forEach(([e, at]) => {
        const r = step(rec, e, start + (at ?? 0));
        out.push(r);
        rec = r.rec;
    });
    return out;
}
const last = list => run(list).at(-1);

// --- parsing --------------------------------------------------------------------------------
eq(parseEvent(JSON.stringify(ev('Stop')))?.hook_event_name, 'Stop', 'a hook event parses');
eq([parseEvent('nope'), parseEvent('[]'), parseEvent('{"session_id":"x"}'), parseEvent('{"hook_event_name":"Stop"}')],
    [null, null, null, null], 'not JSON, not an object, no event name, no session: null');
eq(AGENTS.claude, 'Claude', 'Claude Code is the source "claude"');

// --- names ----------------------------------------------------------------------------------
eq([projectOf(CWD), projectOf('/home/ethan/works/buoy/'), projectOf(''), projectOf(null)], ['buoy', 'buoy', null, null],
    'the project is the last part of cwd');
eq(shortPath(`${CWD}/src/buoy@murilegus/lib/kit/pill.js`, CWD), 'src/…/pill.js', 'inside the project: relative, middle folded');
eq(shortPath(`${CWD}/docs/SPEC.md`, CWD), 'docs/SPEC.md', 'two parts stay whole');
eq(shortPath('/etc/hosts', CWD), '/etc/hosts', 'outside the project: absolute');
eq(shortPath('/usr/share/gnome-shell/theme.css', CWD), '/usr/…/theme.css', 'deep and outside: folded, absolute');
eq([shortPath(null, CWD), shortPath('', CWD)], [null, null], 'no path: nothing');
eq([durationText(0), durationText(59_000), durationText(4 * MIN), durationText(65 * MIN), durationText(120 * MIN)],
    ['<1 min', '<1 min', '4 min', '1 h 5 min', '2 h'], 'durations in minutes');

// --- what a tool is doing (§3), and what a prompt wants (§4) ----------------------------------
const bash = toolDoing('Bash', {command: 'pnpm test\necho more', description: 'Run tests'}, CWD);
eq([bash.title, bash.want], ['Running pnpm test', 'Run: pnpm test'], 'Bash: the command\'s first line');
eq([bash.safeTitle, bash.safeWant], ['Running a command', 'Run a command'], 'Bash while sharing: no command');
const edit = toolDoing('Edit', {file_path: `${CWD}/src/buoy@murilegus/lib/kit/pill.js`}, CWD);
eq([edit.title, edit.want, edit.safeTitle, edit.safeWant],
    ['Editing src/…/pill.js', 'Edit: src/…/pill.js', 'Editing a file', 'Edit a file'], 'Edit: the file');
eq(toolDoing('Write', {file_path: `${CWD}/a.js`}, CWD).title, 'Editing a.js', 'Write edits too');
eq(toolDoing('NotebookEdit', {notebook_path: `${CWD}/n.ipynb`}, CWD).title, 'Editing n.ipynb', 'a notebook too');
eq(toolDoing('Read', {file_path: `${CWD}/docs/SPEC.md`}, CWD).title, 'Reading docs/SPEC.md', 'Read: the file');
eq([toolDoing('Grep', {pattern: 'TODO'}).title, toolDoing('Glob', {}).title], ['Searching for TODO', 'Searching'],
    'Grep and Glob search');
const fetch = toolDoing('WebFetch', {url: 'https://user:pw@example.com/a?b=1', prompt: 'x'});
eq([fetch.title, fetch.want, fetch.safeTitle], ['Fetching example.com', 'Fetch: example.com', 'Fetching a page'],
    'WebFetch: the host only, no credentials or path');
eq(toolDoing('WebSearch', {query: 'gjs dbus'}).title, 'Searching the web for gjs dbus', 'WebSearch');
eq([toolDoing('Agent', {description: 'Find the bug'}).title, toolDoing('Task', {}).title],
    ['Starting a subagent: Find the bug', 'Starting a subagent'], 'Agent (and its old name Task)');
const mcp = toolDoing('mcp__github__create_issue', {title: 'x'});
eq([mcp.title, mcp.want], ['Using github create_issue', 'Use: github create_issue'], 'an MCP tool: server and tool');
eq(toolDoing('mcp__plugin_tools_github__list', {}).title, 'Using tools_github list', 'a plugin\'s MCP server');
eq([toolDoing('Frobnicate', {}).title, toolDoing('Frobnicate', {}).want], ['Using Frobnicate', 'Use: Frobnicate'],
    'an unknown tool: its name');
eq([toolDoing(null, null).title, toolDoing('Bash', null).title], ['Using a tool', 'Running a command'], 'missing fields');

// --- names (§2): sessions of one project share the label; hover tells them apart -----------
eq([projectOf(`${CWD}/.claude/worktrees/distracted-goldberg-830c29`), worktreeOf(`${CWD}/.claude/worktrees/distracted-goldberg-830c29/src`)],
    ['buoy', 'distracted-goldberg-830c29'], 'a worktree: the repository\'s name, its slug');
eq([worktreeOf(CWD), worktreeOf(null)], [null, null], 'no worktree');
const named = t => nameOf({project: 'buoy', sessionTitle: t, cwd: CWD});
eq([named('Buoy — Optimization and security check'), named('Weather icons'), named('  Buoy  ')],
    ['Buoy — Optimization and security check', 'Weather icons', 'Buoy'], 'the title whole (Ethan), trimmed');
eq(named('x'.repeat(200)).length, 200, 'never cut here: the renderer ellipsizes');
eq([nameOf({project: 'buoy', cwd: `${CWD}/.claude/worktrees/w1`}), nameOf({project: 'buoy', cwd: CWD})], ['w1', null],
    'no title: the worktree\'s slug, else none');
eq(nameOf({project: 'buoy', sessionTitle: 'Weather', cwd: `${CWD}/.claude/worktrees/w1`}), 'Weather', 'the title wins');
{
    // a Claude Desktop session on no folder (2026-11-07)
    const SCR = '/home/ethan/.config/Claude/scratch-workspaces/bf15abeb/3f22371f/scratch-2026-11-06-38687f';
    eq([isScratch(SCR), isScratch(CWD), projectOf(SCR), worktreeOf(SCR)], [true, false, null, null],
        'a scratch workspace: no project, no worktree');
    const fresh = agent(last([[{...ev('UserPromptSubmit'), cwd: SCR}]]).rec);
    eq([fresh.text, fresh.compact.text], ['Claude · Thinking', 'New session'], 'no project: "Claude · what it does"; hover "New session" until it has a title');
    const titled = agent(last([[{...ev('SessionStart', {session_title: 'Permission test'}), cwd: SCR}], [{...ev('UserPromptSubmit'), cwd: SCR}]]).rec);
    eq([titled.text, titled.compact.text], ['Claude · Thinking', 'Permission test'], 'with a title: the title on hover');
    const moved = last([[{...ev('UserPromptSubmit'), cwd: SCR}], [ev('PreToolUse', {tool_name: 'Read', tool_input: {}})]]).rec;
    eq(agent(moved).text, 'buoy · Reading a file', 'moved to a folder: its next event names the project');
    const req = {...ev(ASK_EVENT, {tool_name: 'mcp__ccd_directory__change_directory', tool_input: {}}), cwd: SCR};
    const q = askOf(last([[{...ev('UserPromptSubmit'), cwd: SCR}], [req]]).rec, req);
    eq([q.question, q.look.compact.card.app], ['Claude needs your OK', 'New session · mcp__ccd_directory__change_directory'],
        'its prompt: the session, the tool');
}
{
    const r = last([[ev('SessionStart', {source: 'startup', session_title: 'Buoy — Weather icons'})], [ev('UserPromptSubmit')]]);
    const a = agent(r.rec);
    eq([a.text, a.compact.text, a.compact.subtitle], ['buoy · Thinking', 'Buoy — Weather icons', 'Thinking'],
        'minimal: the project · what it does (design/pill C); hover: the session\'s name, then what it does');
    const wt = agent(last([[{...ev('UserPromptSubmit'), cwd: `${CWD}/.claude/worktrees/w1`}]]).rec);
    eq([wt.text, wt.compact.text], ['buoy · Thinking', 'w1'], 'a worktree: the repository, the slug on hover');
    const plain = agent(last([[ev('UserPromptSubmit')]]).rec);
    eq(plain.compact.text, 'Claude · buoy', 'no name: the label');
}

// --- the session, event by event (§3) --------------------------------------------------------
{
    const [start] = run([[ev('SessionStart', {source: 'startup', model: 'x'})]]);
    eq([start.show, start.rec.shown, start.rec.project], [false, false, 'buoy'], 'SessionStart: remembered, nothing shown');
}
{
    const r = last([[ev('UserPromptSubmit', {prompt: 'my secret plan'})]]);
    eq([r.show, r.rec.pose, r.rec.title, r.rec.startedAt], [true, 'think', 'Thinking', T0], 'a prompt: Thinking, the clock starts');
    if (JSON.stringify(r.rec).includes('secret'))
        throw new Error('the prompt is never kept (§7)');
    const a = agent({...r.rec, shared: false});
    if (JSON.stringify(a).includes('secret'))
        throw new Error('the prompt is never shown (§7)');
}
{
    const r = last([[ev('UserPromptSubmit')], [ev('PreToolUse', {tool_name: 'Bash', tool_input: {command: 'pnpm test'}}), 5000]]);
    eq([r.rec.pose, r.rec.title, r.rec.startedAt], ['busy', 'Running pnpm test', T0],
        'PreToolUse: busy, by tool; the clock keeps running');
}
{
    const r = last([[ev('UserPromptSubmit')], [ev('PreToolUse', {tool_name: 'Read', tool_input: {}})],
        [ev('PostToolUseFailure', {tool_name: 'Read', error: 'nope'})]]);
    eq([r.rec.pose, r.rec.title], ['error', 'Something failed'], 'PostToolUseFailure: error');
    const after = step(r.rec, ev('PostToolUse', {tool_name: 'Read'}), T0 + 1);
    eq(after.rec.pose, 'busy', 'PostToolUse clears an error');
}
{
    // subagents count in the parent; no pill of their own (§2)
    const rs = run([[ev('UserPromptSubmit')], [ev('SubagentStart', {agent_id: 'a1', agent_type: 'Explore'})],
        [ev('SubagentStart', {agent_id: 'a2', agent_type: 'Explore'})],
        [ev('PreToolUse', {agent_id: 'a1', tool_name: 'Grep', tool_input: {pattern: 'x'}})],
        [ev('SubagentStop', {agent_id: 'a1'})], [ev('SubagentStop', {agent_id: 'a2'})]]);
    eq(rs[1].rec.title, 'Working with a subagent', 'one subagent');
    eq(rs[2].rec.title, 'Working with 2 subagents', 'two subagents: counted');
    eq(rs[3].rec.title, 'Working with 2 subagents', 'a subagent\'s tool: the parent still says it works with them');
    eq([rs[4].rec.title, rs[5].rec.title, rs[5].rec.subagents], ['Working with a subagent', 'Working', 0], 'they stop');
    eq(new Set(rs.map(r => r.rec.id)).size, 1, 'one session, one record');
}
{
    const r = last([[ev('UserPromptSubmit')], [ev(ASK_EVENT, {tool_name: 'Bash', tool_input: {command: 'rm -rf build'}})]]);
    eq([r.rec.pose, r.rec.title, r.rec.safeTitle], ['ask', 'Needs your OK · Run: rm -rf build', 'Needs your OK · Run a command'],
        'PermissionRequest: ask, what it wants');
    const back = answered(r.rec, T0 + 5);
    eq([back.pose, back.title, agent(back).staleAfter], ['busy', 'Working', STALE_MS],
        'the prompt over without news: back to work, so it can go stale');
    const idle = last([[ev('UserPromptSubmit')]]).rec;
    eq(answered(idle, T0), idle, 'not asking: unchanged');
}
{
    const base = [[ev('UserPromptSubmit')]];
    eq(last([...base, [ev('Notification', {notification_type: 'permission_prompt', message: 'x'})]]).rec.pose, 'ask',
        'Notification permission_prompt: ask, no buttons');
    for (const type of ['idle_prompt', 'agent_needs_input', 'elicitation_dialog', 'elicitation_url_dialog']) {
        const r = last([...base, [ev('Notification', {notification_type: type})]]);
        eq([r.rec.pose, r.rec.title, r.alert], ['turn', 'Waiting for you', true], `Notification ${type}: turn, alert once`);
    }
    const auth = last([...base, [ev('Notification', {notification_type: 'auth_success'})]]);
    eq([auth.show, auth.rec.pose], [false, 'think'], 'another notification type: nothing changes');
    const late = last([...base, [ev('Stop')], [ev('Notification', {notification_type: 'idle_prompt'})]]);
    eq([late.show, late.rec.pose], [false, 'done'], 'idle_prompt after Stop brings nothing back (§2)');
}
{
    const rs = run([[ev('UserPromptSubmit')], [ev('PreCompact', {trigger: 'auto'})], [ev('PostCompact', {trigger: 'auto'})]]);
    eq([rs[1].rec.pose, rs[1].rec.title, rs[2].rec.pose], ['compact', 'Compacting', 'busy'], 'compaction');
    const manual = last([[ev('PreCompact', {trigger: 'manual'})]]);
    eq(manual.show, false, 'a /compact between prompts takes no room');
}
{
    const quick = last([[ev('UserPromptSubmit')], [ev('Stop'), 30_000]]);
    eq([quick.rec.pose, quick.rec.title, quick.alert, quick.rec.stopped], ['done', 'Done', true, true], 'Stop: done, alert');
    const long = last([[ev('UserPromptSubmit')], [ev('Stop'), 4 * MIN]]);
    eq([long.rec.pose, long.rec.title], ['done', 'Done in 4 min'], 'Stop after minutes: how long');
    const party = last([[ev('UserPromptSubmit')], [ev('Stop'), PARTY_AFTER + 1]]);
    eq([party.rec.pose, party.rec.title], ['party', 'Done in 10 min'], 'a run over 10 min: party first');
    const fail = last([[ev('UserPromptSubmit')], [ev('StopFailure', {error: 'rate_limit'})]]);
    eq([fail.rec.pose, fail.rec.title, fail.alert, fail.rec.stopped], ['error', 'Stopped with an error', true, true],
        'StopFailure: error, alert, ends later');
    const again = last([[ev('UserPromptSubmit')], [ev('Stop'), MIN], [ev('UserPromptSubmit'), 2 * MIN]]);
    eq([again.rec.pose, again.rec.stopped, again.rec.startedAt], ['think', false, T0 + 2 * MIN],
        'the next prompt brings it back, the clock restarts');
    const idle = last([[ev('Stop')]]);
    eq(idle.show, false, 'Stop of a session never shown: nothing');
}
{
    const end = last([[ev('UserPromptSubmit')], [ev('SessionEnd', {reason: 'prompt_input_exit'})]]);
    eq([end.end, end.show], [true, false], 'SessionEnd: ends at once');
    const odd = last([[ev('UserPromptSubmit')], [ev('SomeFutureEvent', {x: 1})]]);
    eq([odd.show, odd.end, odd.rec.pose], [false, false, 'think'], 'an unknown event is ignored, never an error');
}
{
    // working events show a session whose hooks came mid-run (installed after its prompt)
    const r = last([[ev('PreToolUse', {tool_name: 'Read', tool_input: {}})]]);
    eq([r.show, r.rec.startedAt], [true, T0], 'a tool before any prompt seen: shown, the clock from now');
    const post = last([[ev('PostToolUse', {tool_name: 'Read'})]]);
    eq(post.show, false, 'a tool\'s result alone shows nothing');
}

// --- the pill (§2) -------------------------------------------------------------------------
{
    const rec = last([[ev('UserPromptSubmit')], [ev('PreToolUse', {tool_name: 'Edit', tool_input: {file_path: `${CWD}/src/a/b/c.js`}})]]).rec;
    const a = agent({...rec, shared: false});
    eq([a.text, a.leading, a.trailing], ['buoy · Editing src/…/c.js', {mascot: 'busy'}, {since: T0}],
        'minimal: Bu, the project · what it does, the elapsed time (design/pill C)');
    eq([a.compact.text, a.compact.subtitle], ['Claude · buoy', 'Editing src/…/c.js'], 'compact: which session, what it does');
    eq([a.priority, a.needsYou, a.staleAfter, a.ttl ?? 0], [35, false, STALE_MS, 0],
        'working: the kind\'s 35, set every time (a question raises it), stale after 1 min, no end');
    eq(a.pressFirst, true, 'a click brings the terminal up first, else the tab (§2)');
    eq(a.linger, false, 'working: it does not wait, it never lingers out');
    const s = agent({...rec, shared: true});
    eq([s.text, s.compact.text, s.compact.subtitle], ['buoy · Editing a file', 'Claude · buoy', 'Editing a file'], 'sharing the screen: no file name (§7)');
    if (JSON.stringify(s).includes('c.js'))
        throw new Error('sharing: the path appears nowhere');
    const turn = agent({...last([[ev('UserPromptSubmit')], [ev('Notification', {notification_type: 'idle_prompt'})]]).rec});
    eq([turn.needsYou, turn.staleAfter, turn.linger], [true, 0, true], 'waiting for you: needs you, never stale, lingers out');
    const done = agent(last([[ev('UserPromptSubmit')], [ev('Stop'), 4 * MIN]]).rec);
    eq([done.needsYou, done.linger, done.ttl ?? 0, done.staleAfter, done.trailing, done.text],
        [false, true, 0, DONE_STALE, null, 'buoy · Done in 4 min'],
        'done: waits (ends after activity-linger), dims after 10 s, its time in its words, no trailing');
    eq([DONE_STALE, SETTLE_MS, STALE_MS], [10000, 10000, MIN], 'done dims (and steps back) after 10 s; working after 1 min');
    eq([KIT_PRIORITY.agent, KIT_PRIORITY.ask, KIT_PRIORITY.media], [35, 90, 10], 'the kinds\' priorities');
    // the tiers (docs/PRIORITY.md): through the kit, as the stack ranks them
    const v = (x, stale) => ({...validate({id: 'x', kind: 'agent', ...x}), isStale: stale});
    eq([tierOf(v(a, false)), tierOf(v(turn, false)), tierOf(v(done, false)), tierOf(v(done, true)), tierOf(v(a, true))],
        [2, 1, 2, 3, 2], 'working 2; waiting for you 1; done keeps 2 until it dims, then 3; working stale stays 2');
    const fail = agent(last([[ev('UserPromptSubmit')], [ev('StopFailure')]]).rec);
    eq([fail.needsYou, fail.linger, fail.staleAfter], [false, true, DONE_STALE], 'stopped with an error: the same');
    // stale: Bu `stale`, dimmed (the renderer)
    const plan = planMinimal({...a, isStale: true});
    eq([plan.leading.pose, plan.stale], ['stale', true], 'stale: Bu stale, dimmed');
    eq(planCompact({...a, isStale: true}).leading.pose, 'stale', 'the compact too');
    eq(planMinimal(a).trailing, {type: 'since', at: T0}, 'the elapsed time is a live {since}');
}
{
    // through the registry: one id per session, profiles apply
    const reg = new Registry();
    reg.register('agent', {agent});
    const r1 = last([[ev('UserPromptSubmit')]]);
    const r2 = last([[{...ev('UserPromptSubmit'), session_id: 'other', cwd: '/x/site'}]]);
    const a1 = reg.build('agent', 'claude', {...r1.rec, shared: false});
    const a2 = reg.build('agent', 'claude', {...r2.rec, shared: false});
    eq([a1.id, a2.id, a1.app], [`agent:claude:${SID}`, 'agent:claude:other', 'claude'], 'two sessions, two pills');
    eq([a1.kind, a1.priority], ['agent', 35], 'kind agent');
}

// --- Claude Desktop's deep link to a session (§2) -------------------------------------
{
    const file = '{"sessionId":"local_b665708f-bcab-40f2","cliSessionId":"133367a0-1112","title":"x"}';
    eq(desktopRoute('local_b665708f-bcab-40f2.json', file, '133367a0-1112'), 'claude://code/continue?session=local_b665708f-bcab-40f2',
        'the session\'s file: its deep link');
    eq(desktopRoute('local_a.json', '{"lastAssistantCliSessionId":"s-2"}', 's-2'), 'claude://code/continue?session=local_a',
        'the latest CLI id counts too');
    eq([desktopRoute('local_a.json', file, 'other'), desktopRoute('deleted_a.json', file, '133367a0-1112'),
        desktopRoute('local_a.json', file, '"x'), desktopRoute('local_a.json', null, '133367a0-1112'),
        desktopRoute('local_a b.json', file, '133367a0-1112')], [null, null, null, null, null],
    'another session, a deleted file, an odd id or name, no text: none');
    eq(DESKTOP_APP, 'com.anthropic.Claude.desktop', 'Desktop\'s app id');
    const conf = '{"preferences": {"x": {"lastPrimaryCodeSession": {\n  "id": "local_406924c9-1051",\n  "type": "local"\n}}}}';
    eq(desktopShown(conf), 'local_406924c9-1051', 'the session Desktop shows');
    eq([desktopShown('{}'), desktopShown(null), desktopShown('{"lastPrimaryCodeSession": {"id": "cse_x"}}')], [null, null, null],
        'none, no file, not a local session: null');
}

// --- the permission prompt (§4) ------------------------------------------------------------
{
    const sugg = {type: 'addRules', rules: [{toolName: 'Bash', ruleContent: 'pnpm test'}], behavior: 'allow', destination: 'localSettings'};
    const req = ev(ASK_EVENT, {tool_name: 'Bash', tool_input: {command: 'pnpm test'}, permission_suggestions: [sugg]});
    const rec = last([[ev('UserPromptSubmit')], [req]]).rec;
    const q = askOf(rec, req);
    eq([q.question, q.options], ['Claude · buoy needs your OK', [DENY, ALLOW, ALWAYS]], 'Deny · Allow · Always');
    eq([q.look.expanded.center, q.look.compact.card, q.look.leading],
        [{title: 'Claude · buoy needs your OK', subtitle: 'Run: pnpm test'},
            {picture: {mascot: 'ask'}, title: 'Claude Code wants to run', app: 'buoy · Bash', body: 'pnpm test'},
            {mascot: 'ask'}],
        'the ask: a card (design/alerts-and-asks "Ask"): Bu, "wants to run", project · tool, the command');
    const titled = {...rec, sessionTitle: 'Buoy — Weather icons'};
    eq(askOf(titled, req).look.expanded.center.subtitle, 'Buoy — Weather icons · Run: pnpm test', 'a named session: which one asks');
    eq(askOf(rec, req, {shared: true}).look.compact.card.body, null, 'sharing: no command');
    const editReq = ev(ASK_EVENT, {tool_name: 'Edit', tool_input: {file_path: '/home/u/buoy/src/shapes.js'}});
    eq(askOf(rec, editReq).look.compact.card, {picture: {mascot: 'ask'}, title: 'Allow edits to shapes.js?', app: 'buoy · Edit', body: null},
        'an edit: "Allow edits to shapes.js?", no body');
    eq(askOf(rec, editReq, {shared: true}).look.compact.card.title, 'Allow edits to a file?', 'an edit while sharing: no file name');
    const web = ev(ASK_EVENT, {tool_name: 'WebFetch', tool_input: {url: 'https://example.com/a'}});
    eq([askOf(rec, web).look.compact.card.title, askOf(rec, web).look.compact.card.app], ['Claude · buoy needs your OK', 'buoy · WebFetch'],
        'another tool: the question, what it wants as the body');
    const plain = ev(ASK_EVENT, {tool_name: 'Bash', tool_input: {command: 'ls'}});
    eq(askOf(rec, plain).options, [DENY, ALLOW], 'no suggestion: no Always');
    eq(askOf(rec, {...plain, permission_suggestions: []}).options, [DENY, ALLOW], 'an empty list: no Always');
    eq(suggestionOf(req), sugg, 'the first suggestion, unchanged');
    // the kit draws it: keys on the buttons, Bu leading in expanded
    const exp = planExpanded({
        kind: 'ask', text: q.question, expanded: true, ...q.look,
        actions: q.options.map(o => ({id: o, label: o})),
    });
    eq([exp.leading.type, exp.center.title, exp.actions.map(a => a.key)], ['mascot', q.question, ['d', '2', '3']],
        'expanded: Bu, the question; D, then Allow and Always by position (they share a letter)');

    const out = c => JSON.parse(reply(c, req)).hookSpecificOutput;
    eq(out(ALLOW), {hookEventName: 'PermissionRequest', decision: {behavior: 'allow'}}, 'Allow');
    eq(out(ALWAYS).decision, {behavior: 'allow', updatedPermissions: [sugg]}, 'Always: Claude Code\'s own suggestion');
    eq(out(DENY).decision, {behavior: 'deny', message: 'Denied in Buoy'}, 'Deny');
    eq(out(TIMEOUT).decision, {behavior: 'deny', message: 'No answer in Buoy'}, 'no answer in time: deny');
    eq(JSON.parse(reply(ALWAYS, plain)).hookSpecificOutput.decision, {behavior: 'allow'}, 'Always without a suggestion: allow');
    eq([reply(null, req), reply(undefined, req), reply('Maybe', req)], ['', '', ''], 'ended or unknown: no decision');

    // answered elsewhere: which later events end the ask
    eq(settles(req, ev('PostToolUse', {tool_name: 'Bash', tool_input: {command: 'pnpm test'}})), true,
        'the same call ran: answered in the terminal');
    eq(settles(req, ev('PostToolUse', {tool_name: 'Read', tool_input: {file_path: '/x'}})), false,
        'another call\'s result (a report arriving late) does not');
    eq(settles(req, ev('PreToolUse', {tool_name: 'Bash', tool_input: {command: 'pnpm test'}})), false,
        'its own PreToolUse arriving late does not');
    eq(settles(req, ev('Notification', {notification_type: 'permission_prompt'})), false, 'the terminal\'s own prompt does not');
    for (const e of ['UserPromptSubmit', 'Stop', 'StopFailure', 'SessionEnd'])
        eq(settles(req, ev(e)), true, `${e} does`);
    // an answer may add fields (Claude Desktop's card adds `answers`, 2026-11-08)
    const pick = ev(ASK_EVENT, {tool_name: 'AskUserQuestion', tool_input: {questions: [{question: 'Which?', options: ['A', 'B']}]}});
    const answeredPick = ev('PostToolUse', {
        tool_name: 'AskUserQuestion',
        tool_input: {questions: [{question: 'Which?', options: ['A', 'B']}], answers: {'Which?': 'A'}},
    });
    eq(settles(pick, answeredPick), true, 'the same call with its answer added: settled');
    eq(settles(pick, ev('PostToolUse', {tool_name: 'AskUserQuestion', tool_input: {questions: [{question: 'Other?'}]}})), false,
        'another question: not');
    eq(settles(req, ev('PostToolUse', {tool_name: 'Bash', tool_input: {}})), false, 'a field asked for missing: not');
    eq(settles(req, ev('PostToolUse', {tool_name: 'Bash'})), false, 'no input at all: not');
}

// --- a question is not a permission (AskUserQuestion, 2026-11-08) -------------------------
{
    const q = ev(ASK_EVENT, {tool_name: 'AskUserQuestion', tool_input: {questions: [{question: 'Which?'}]}});
    eq([isQuestion(q), isQuestion(ev(ASK_EVENT, {tool_name: 'Bash'})), isQuestion(null)], [true, false, false],
        'only AskUserQuestion is a question');
    let r = step(null, ev('UserPromptSubmit', {prompt: 'go'}), 1000).rec;
    const asked = step(r, q, 2000);
    eq([asked.rec.pose, asked.rec.title, asked.alert], ['ask', QUESTION_TITLE, true],
        'its PermissionRequest: Bu\'s hand up, waiting for your answer');
    r = asked.rec;
    const prompt = step(r, ev('Notification', {notification_type: 'permission_prompt'}), 2100);
    eq([prompt.show, prompt.rec.pose, prompt.rec.title], [false, 'ask', QUESTION_TITLE],
        'the card\'s permission_prompt notification changes nothing');
    const after = step(r, ev('PostToolUse', {tool_name: 'AskUserQuestion', tool_input: {}}), 5000);
    eq(after.rec.pose === 'ask', false, 'answered (its result): back to work');
    const pill = agent({...asked.rec, shared: false});
    eq([pill.text, pill.compact.subtitle, pill.needsYou, pill.linger, pill.priority],
        ['buoy · Needs your answer', 'Needs your answer', true, false, 90],
        'the pill asks as a prompt\'s does: its words, needs you, no linger, the ask\'s 90');
    eq(agent({...after.rec, shared: false}).priority, 35, 'back to work: the kind\'s 35 again (set every time)');
}

// --- hooks in ~/.claude/settings.json (§8) ------------------------------------------------
{
    const cmd = commandFor('/home/e/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/claude.js');
    eq(cmd, "if [ -f '/home/e/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/claude.js' ]; " +
        "then exec gjs -m '/home/e/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/claude.js'; fi", 'the command');
    eq(commandFor("/it's/buoy@murilegus/hooks/claude.js"),
        "if [ -f '/it'\\''s/buoy@murilegus/hooks/claude.js' ]; then exec gjs -m '/it'\\''s/buoy@murilegus/hooks/claude.js'; fi",
        'a quote in the path is escaped for sh');
    // run as Claude Code runs it (sh -c): no script → nothing, exit 0; a script → gjs's status
    const runStatus = command => {
        const [, , , status] = GLib.spawn_sync(null, ['sh', '-c', command], null, GLib.SpawnFlags.SEARCH_PATH, null);
        try {
            return GLib.spawn_check_wait_status(status) ? 0 : status;
        } catch (e) {
            return e.code;
        }
    };
    eq(runStatus(commandFor('/nonexistent/buoy@murilegus/hooks/claude.js')), 0,
        'Buoy removed, its entries left: the hook does nothing and succeeds');
    const dir = GLib.dir_make_tmp('buoy-hook-XXXXXX');
    const script = `${dir}/it's buoy@murilegus.js`;
    GLib.file_set_contents(script, "import System from 'system'; System.exit(3);");
    eq(runStatus(commandFor(script)), 3, 'the script there: run by gjs, its exit status kept (a quote and a space in the path)');
    GLib.unlink(script);
    GLib.rmdir(dir);
    eq(isOurs({type: 'command', command: cmd}), true, 'ours by the script\'s path');
    eq([isOurs({command: 'my-hook.sh'}), isOurs(null)], [false, false], 'others are not');

    const empty = install({}, cmd);
    eq(Object.keys(empty.hooks), [...REPORTS, STOP_EVENT, ASK_EVENT], 'every event, once');
    eq(empty.hooks[STOP_EVENT], [{hooks: [{type: 'command', command: cmd, timeout: STOP_HOOK_TIMEOUT}]}],
        'PostToolUse is waited on, briefly: its answer can stop the turn (■)');
    eq([STOP_EVENT, REPORTS.includes(STOP_EVENT)], ['PostToolUse', false], 'PostToolUse is no report any more');
    const older = {...empty, hooks: {...empty.hooks, PostToolUse: [{hooks: [{type: 'command', command: cmd, async: true}]}]}};
    eq(installed(older), 'some', 'an older Buoy\'s PostToolUse in the background: some (prefs offers to update)');
    eq(empty.hooks.Stop, [{hooks: [{type: 'command', command: cmd, async: true}]}], 'a report runs in the background');
    eq(empty.hooks[ASK_EVENT], [{hooks: [{type: 'command', command: cmd, timeout: ASK_HOOK_TIMEOUT}]}],
        'the permission hook waits, past the longest ask timeout');
    eq(ASK_HOOK_TIMEOUT > 30 * 60, true, 'longer than activity-linger\'s 30 min');
    eq(install(null, cmd), empty, 'a missing file: the same');
    eq(install(install({}, cmd), cmd), empty, 'idempotent');
    eq(installed(empty), 'all', 'installed');
    throws(() => install([], cmd), 'not an object: refused');
    throws(() => install({hooks: []}, cmd), '"hooks" not an object: refused');

    const busy = {
        model: 'opus',
        permissions: {allow: ['Bash(ls)']},
        hooks: {
            Stop: [{hooks: [{type: 'command', command: 'notify-send done'}]}],
            PreToolUse: [{matcher: 'Bash', hooks: [{type: 'command', command: 'guard.sh'}, {type: 'command', command: cmd}]}],
        },
    };
    const on = install(busy, cmd);
    eq([on.model, on.permissions], ['opus', {allow: ['Bash(ls)']}], 'the rest of the file is kept');
    eq(on.hooks.Stop[0], busy.hooks.Stop[0], 'another Stop hook stays first');
    eq(on.hooks.PreToolUse[0], {matcher: 'Bash', hooks: [{type: 'command', command: 'guard.sh'}]},
        'an old entry of ours inside a user\'s is taken out, theirs kept');
    eq(on.hooks.PreToolUse.length, 2, 'and ours added once');
    const off = uninstall(on);
    eq(off, {
        model: 'opus', permissions: {allow: ['Bash(ls)']},
        hooks: {Stop: busy.hooks.Stop, PreToolUse: [{matcher: 'Bash', hooks: [{type: 'command', command: 'guard.sh'}]}]},
    }, 'uninstall removes exactly Buoy\'s entries');
    eq(uninstall(empty), {}, 'nothing else: hooks itself goes');
    eq([uninstall({}), uninstall({a: 1}), uninstall(null)], [{}, {a: 1}, {}], 'nothing of ours: unchanged');
    eq(installed({hooks: {Stop: empty.hooks.Stop}}), 'some', 'part of them: some');
    eq([installed({}), installed(null), installed(busy)], ['none', 'none', 'some'],
        'none; an old entry of ours on one event is some');
    eq(HOOK_PATH, 'buoy@murilegus/hooks/claude.js', 'the mark is the script inside the extension');

    const note = (o = {}) => hooksNote({state: 'none', found: true, error: null, moduleOn: true, file: '~/.claude/settings.json', ...o});
    eq(note({state: 'all'}), 'Hooks installed in ~/.claude/settings.json', 'installed');
    eq(note({state: 'all', moduleOn: false}), 'Hooks installed; the module is off, so they return at once', 'module off');
    eq(note({found: false}), 'Claude Code not found', 'no Claude Code');
    eq(note({error: 'not a JSON object'}).startsWith('~/.claude/settings.json could not be read'), true, 'a bad file is left alone');
    eq(note({state: 'some'}).startsWith('Part of'), true, 'partly installed');
}

// --- Claude's task list as the compact's rows (design/compact "Hàng của Claude Code") ------------
{
    const create = (id, subject) => ev('PostToolUse', {tool_name: 'TaskCreate', tool_input: {subject}, tool_response: {task: {id, subject}}});
    const update = (taskId, status) => ev('PostToolUse', {tool_name: 'TaskUpdate', tool_input: {taskId, status}, tool_response: {}});
    let tasks = taskStep([], create('1', 'Edit shapes.js'), 1);
    eq(tasks, [{id: '1', subject: 'Edit shapes.js', status: 'pending', startedAt: 0, doneAt: 0}], 'TaskCreate: its subject, the id from its result');
    eq(taskStep([], ev('PostToolUse', {tool_name: 'TaskCreate', tool_input: {subject: 'x'}, tool_response: {id: 7}}), 1)[0].id, '7',
        'a numeric id, at the result\'s top');
    eq([taskStep([], ev('PostToolUse', {tool_name: 'TaskCreate', tool_input: {}, tool_response: {id: '1'}}), 1),
        taskStep([], ev('PostToolUse', {tool_name: 'Read', tool_input: {}}), 1)], [null, null], 'no subject, or not a task tool: none');
    tasks = taskStep(tasks, create('2', 'Run pnpm test'), 2);
    tasks = taskStep(tasks, create('3', 'Update the docs'), 3);
    tasks = taskStep(tasks, update('1', 'completed'), 10);
    tasks = taskStep(tasks, update('2', 'in_progress'), 11);
    eq(tasks.map(t => [t.id, t.status, t.doneAt]), [['1', 'completed', 10], ['2', 'in_progress', 0], ['3', 'pending', 0]],
        'TaskUpdate: its status; when it was done');
    eq(taskStep(tasks, update('9', 'completed'), 12), null, 'an unknown task: nothing changes');
    eq(taskStep(tasks, update('3', 'deleted'), 12).map(t => t.id), ['1', '2'], 'deleted: gone');
    eq(taskRows(tasks), [
        {icon: 'object-select-symbolic', text: 'Edit shapes.js', dim: false},
        {icon: 'media-playback-start-symbolic', text: 'Run pnpm test', dim: false},
        {icon: 'task-todo-symbolic', text: 'Update the docs', dim: true},
    ], 'three tasks: all, ✓ ▶ ○, the one to do dimmed (Gravity UI icons)');
    eq(taskProgress(tasks), '2 / 3', 'progress: done and being done, of all');
    // more than three: the one just done, the one being done, the next
    let five = tasks;
    five = taskStep(five, create('4', 'Review'), 20);
    five = taskStep(five, create('5', 'Push'), 21);
    five = taskStep(five, update('2', 'completed'), 30);
    five = taskStep(five, update('3', 'in_progress'), 31);
    eq(taskRows(five).map(r => r.text), ['Run pnpm test', 'Update the docs', 'Review'], 'five: just done, doing, next');
    eq(taskProgress(five), '3 / 5', 'five: progress');
    const allDone = five.map(t => ({...t, status: 'completed', doneAt: Number(t.id)}));
    eq(taskRows(allDone).map(r => r.text), ['Update the docs', 'Review', 'Push'], 'all done: the last three done');

    // through step(): rows and progress on the compact; none while the screen is shared
    const rec = last([[ev('UserPromptSubmit')], [create('1', 'Edit shapes.js')], [create('2', 'Run pnpm test')], [update('1', 'completed')]]).rec;
    const a = agent(rec);
    eq([a.compact.text, a.compact.subtitle, a.compact.rows.map(r => r.icon)], ['Claude Code', 'buoy · 1 / 2', ['object-select-symbolic', 'task-todo-symbolic']],
        'the compact: "Claude Code" over project · progress, the tasks');
    eq(agent({...rec, sessionTitle: 'Weather icons'}).compact.text, 'Weather icons', 'a named session: its name on top');
    // the pill with a task list (design/pill D): the task being done, the list's progress
    const doingTask = step(rec, update('2', 'in_progress'), T0 + 50).rec;
    eq([agent(doingTask).text, agent(doingTask).trailing], ['buoy · Run pnpm test', {text: '2 / 2'}], 'D: the task ▶, progress (done and being done) for the time');
    eq([agent(rec).text, agent(rec).trailing.text], ['buoy · Thinking', '1 / 2'], 'none being done: its step, the progress still');
    eq(agent({...doingTask, shared: true}).text, 'buoy · Thinking', 'sharing: the step\'s safe words, never a task\'s');
    // how long a task took, when Buoy saw it start
    let timed = taskStep([], create('1', 'Edit'), 0);
    timed = taskStep(timed, update('1', 'in_progress'), 1000);
    timed = taskStep(timed, update('1', 'completed'), 13000);
    eq(taskRows(timed)[0].detail, durationText(12000), 'a task done: how long it took');
    eq('detail' in taskRows(taskStep(timed, update('1', 'pending'), 14000))[0], false, 'not done: no time');
    const s = agent({...rec, shared: true});
    eq([s.compact.subtitle, s.compact.rows], ['buoy · 1 / 2', []], 'sharing the screen: the progress, no task names (§7)');
    eq(agent(last([[ev('UserPromptSubmit')], [ev('PreToolUse', {tool_name: 'Read', tool_input: {file_path: 'a.js'}})]]).rec).compact.rows, [],
        'no task list: no rows, what it does in the subtitle');

    // ~/.claude/tasks/<session>/<id>.json, for a session met in its middle
    eq(tasksFromFiles([
        {name: '2.json', text: JSON.stringify({id: '2', subject: 'Run pnpm test', status: 'in_progress'})},
        {name: '10.json', text: JSON.stringify({id: '10', subject: 'Push', status: 'pending'})},
        {name: '1.json', text: JSON.stringify({id: '1', subject: 'Edit shapes.js', status: 'completed'})},
        {name: '3.json', text: JSON.stringify({id: '3', subject: 'Gone', status: 'deleted'})},
        {name: 'x.json', text: 'not json'},
        {name: '4.json', text: JSON.stringify({id: '4'})},
    ]).map(t => [t.id, t.status]), [['1', 'completed'], ['2', 'in_progress'], ['10', 'pending']],
    'the files: in their ids\' order, deleted, broken and nameless ones left out');
}

// --- ■: the turn stops at Claude's next tool call, as Desktop's Stop -----------------------
{
    const run2 = last([[ev('UserPromptSubmit')], [ev('PreToolUse', {tool_name: 'Bash', tool_input: {command: 'pnpm test'}})]]).rec;
    eq(agent(run2).actions, [], 'no ■ without hooks that can stop (an older install)');
    eq(agent({...run2, canStop: true}).actions, [{id: STOP, icon: 'media-playback-stop-symbolic'}], 'a turn running, hooks that stop: ■ (Gravity stop-fill)');
    eq([agent({...run2, canStop: true}).compact.transport, agent({...run2, canStop: true}).minimalAction], [true, false],
        'in the compact, never in the pill');
    const asked = stopping({...run2, canStop: true});
    eq([asked.stopRequested, agent(asked).compact.subtitle, agent(asked).actions], [true, 'Stopping…', []], 'pressed: "Stopping…", no ■ twice');
    eq(step(asked, ev('PreToolUse', {tool_name: 'Read', tool_input: {file_path: 'a.js'}}), T0 + 5).rec.title, 'Stopping…',
        'a tool call meanwhile keeps saying it is stopping');
    const stopped = interrupted(asked, T0 + 9);
    eq([stopped.stopped, stopped.title, stopped.pose, agent({...stopped, canStop: true}).actions], [true, 'Stopped', 'idle', []],
        'answered: the turn is over, the session waits');
    eq(step(stopped, ev('Stop'), T0 + 10).show, false, 'a Stop after it changes nothing: it says Stopped');
    const again = step(stopped, ev('UserPromptSubmit'), T0 + 20).rec;
    eq([again.stopped, again.interrupted, again.stopRequested, again.title], [false, false, false, 'Thinking'], 'a new prompt: working again');
    eq(JSON.parse(STOP_REPLY), {continue: false, stopReason: 'Stopped from Buoy'}, 'the hook\'s answer (hooks.md continue / stopReason)');
    eq(agent({...last([[ev('UserPromptSubmit')], [ev('Notification', {notification_type: 'idle_prompt'})]]).rec, canStop: true}).actions, [],
        'waiting for you: nothing to stop');
}

print('agent: ok');
