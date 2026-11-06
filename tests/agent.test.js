// Run: gjs -m tests/agent.test.js   (pure: Claude Code's events → the session's pill, the
// permission reply, Buoy's entries in ~/.claude/settings.json; docs/CODING-AGENTS.md §11)
import {
    AGENTS, ALLOW, ALWAYS, DENY, DONE_STALE, END_AFTER_STOP, PARTY_AFTER, PRIORITY, STALE_MS, TIMEOUT,
    agent, answered, askOf, durationText, nameOf, parseEvent, projectOf, worktreeOf, reply, settles, shortPath, step, suggestionOf, toolDoing,
} from '../src/buoy@murilegus/lib/modules/agent/adapter.js';
import {
    ASK_EVENT, ASK_HOOK_TIMEOUT, HOOK_PATH, REPORTS, commandFor, hooksNote, install, installed, isOurs, uninstall,
} from '../src/buoy@murilegus/lib/modules/agent/hooks.js';
import {Registry} from '../src/buoy@murilegus/lib/kit/registry.js';
import {PRIORITY as KIT_PRIORITY} from '../src/buoy@murilegus/lib/kit/activity.js';
import {planCompact, planExpanded, planMinimal} from '../src/buoy@murilegus/lib/kit/presentation.js';

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
eq([named('Buoy — Optimization and security check'), named('buoy: weather'), named('Buoy - icons'), named('Buoy implementation')],
    ['Optimization and security check', 'weather', 'icons', 'implementation'], 'the project\'s name in front is dropped');
eq([named('Buoyant ideas'), named('Weather icons'), named('Buoy')], ['Buoyant ideas', 'Weather icons', 'Buoy'],
    'only a whole word; nothing left keeps the title');
eq(named('x'.repeat(200)).length, 200, 'never cut here: the renderer ellipsizes');
eq([nameOf({project: 'buoy', cwd: `${CWD}/.claude/worktrees/w1`}), nameOf({project: 'buoy', cwd: CWD})], ['w1', null],
    'no title: the worktree\'s slug, else none');
eq(nameOf({project: 'buoy', sessionTitle: 'Weather', cwd: `${CWD}/.claude/worktrees/w1`}), 'Weather', 'the title wins');
{
    const r = last([[ev('SessionStart', {source: 'startup', session_title: 'Buoy — Weather icons'})], [ev('UserPromptSubmit')]]);
    const a = agent(r.rec);
    eq([a.text, a.compact.text, a.compact.subtitle], ['Claude · buoy', 'Weather icons', 'Thinking'],
        'minimal: the label only; hover: the session\'s name, then what it does');
    const wt = agent(last([[{...ev('UserPromptSubmit'), cwd: `${CWD}/.claude/worktrees/w1`}]]).rec);
    eq([wt.text, wt.compact.text], ['Claude · buoy', 'w1'], 'a worktree: the repository\'s label, the slug on hover');
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
    eq([a.text, a.leading, a.trailing], ['Claude · buoy', {mascot: 'busy'}, {since: T0}], 'minimal: Bu, the name, the elapsed time');
    eq([a.compact.text, a.compact.subtitle], ['Claude · buoy', 'Editing src/…/c.js'], 'compact: which session, what it does');
    eq([a.priority, a.staleAfter, a.ttl], [PRIORITY.working, STALE_MS, 0], 'working: 35, stale after 1 min, no end');
    const s = agent({...rec, shared: true});
    eq([s.compact.text, s.compact.subtitle], ['Claude · buoy', 'Editing a file'], 'sharing the screen: no file name (§7)');
    if (JSON.stringify(s).includes('c.js'))
        throw new Error('sharing: the path appears nowhere');
    const turn = agent({...last([[ev('UserPromptSubmit')], [ev('Notification', {notification_type: 'idle_prompt'})]]).rec});
    eq([turn.priority, turn.staleAfter], [PRIORITY.turn, 0], 'waiting for you: 60, never stale');
    const done = agent(last([[ev('UserPromptSubmit')], [ev('Stop'), 4 * MIN]]).rec);
    eq([done.priority, done.ttl, done.staleAfter, done.trailing], [PRIORITY.done, END_AFTER_STOP, DONE_STALE, {text: '4 min'}],
        'done: under everything, dims after 1 min, ends after 2, the time frozen (Ethan 2026-11-07)');
    eq([END_AFTER_STOP, DONE_STALE, STALE_MS], [2 * MIN, MIN, MIN], 'ends at 2 min; working or done, dims after 1 min');
    eq([PRIORITY.working, PRIORITY.turn, PRIORITY.done, KIT_PRIORITY.agent, KIT_PRIORITY.ask, KIT_PRIORITY.media],
        [35, 60, 5, 35, 90, 10], 'priorities 35 / 60 / 90; done 5, under media\'s 10');
    const fail = agent(last([[ev('UserPromptSubmit')], [ev('StopFailure')]]).rec);
    eq([fail.priority, fail.ttl], [PRIORITY.done, END_AFTER_STOP], 'stopped with an error: the same');
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

// --- the permission prompt (§4) ------------------------------------------------------------
{
    const sugg = {type: 'addRules', rules: [{toolName: 'Bash', ruleContent: 'pnpm test'}], behavior: 'allow', destination: 'localSettings'};
    const req = ev(ASK_EVENT, {tool_name: 'Bash', tool_input: {command: 'pnpm test'}, permission_suggestions: [sugg]});
    const rec = last([[ev('UserPromptSubmit')], [req]]).rec;
    const q = askOf(rec, req);
    eq([q.question, q.options], ['Claude · buoy needs your OK', [DENY, ALLOW, ALWAYS]], 'Deny · Allow · Always');
    eq([q.look.expanded.center, q.look.compact.text, q.look.compact.subtitle, q.look.compact.transport, q.look.leading],
        [{title: 'Claude · buoy needs your OK', subtitle: 'Run: pnpm test'}, 'Claude · buoy', 'Run: pnpm test', true, {mascot: 'ask'}],
        'the ask: Bu ask, what it wants, the buttons in the compact');
    const titled = {...rec, sessionTitle: 'Buoy — Weather icons'};
    eq([askOf(titled, req).look.compact.text, askOf(titled, req).look.expanded.center.subtitle],
        ['Weather icons', 'Weather icons · Run: pnpm test'], 'a named session: which one asks');
    eq(askOf(rec, req, {shared: true}).look.compact.subtitle, 'Run a command', 'sharing: no command');
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
}

// --- hooks in ~/.claude/settings.json (§8) ------------------------------------------------
{
    const cmd = commandFor('/home/e/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/claude.js');
    eq(cmd, "gjs -m '/home/e/.local/share/gnome-shell/extensions/buoy@murilegus/hooks/claude.js'", 'the command');
    eq(commandFor("/it's/buoy@murilegus/hooks/claude.js"), "gjs -m '/it'\\''s/buoy@murilegus/hooks/claude.js'",
        'a quote in the path is escaped for sh');
    eq(isOurs({type: 'command', command: cmd}), true, 'ours by the script\'s path');
    eq([isOurs({command: 'my-hook.sh'}), isOurs(null)], [false, false], 'others are not');

    const empty = install({}, cmd);
    eq(Object.keys(empty.hooks), [...REPORTS, ASK_EVENT], 'every event, once');
    eq(empty.hooks.Stop, [{hooks: [{type: 'command', command: cmd, async: true}]}], 'a report runs in the background');
    eq(empty.hooks[ASK_EVENT], [{hooks: [{type: 'command', command: cmd, timeout: ASK_HOOK_TIMEOUT}]}],
        'the permission hook waits, past the longest ask timeout');
    eq(ASK_HOOK_TIMEOUT > 30 * 60, true, 'longer than agent-ask-timeout\'s 30 min');
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

print('agent: ok');
