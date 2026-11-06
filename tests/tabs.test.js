// Run: gjs -m tests/tabs.test.js   (pure: which tabs the strip shows, where an open starts)
import {planStrip, stripOrder, tabFor, pressTarget, tabActivities, findTab, HOME} from '../src/buoy@murilegus/lib/kit/tabs.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const ids = strip => strip.tabs.map(t => t.id);
const act = (id, kind, extra = {}) => ({id, kind, text: id, ...extra});

const media = {id: 'media', kinds: ['media']};
const hud = {id: 'hud', kinds: ['osd']};
const progress = {id: 'progress', kinds: ['progress'], title: 'Transfers', icon: 'folder-download-symbolic'};
const timer = {id: 'timer', kinds: ['timer'], tab: true};
const clip = {id: 'clipboard', kinds: [], tab: true};
const launcher = {id: 'launcher', kinds: [], tab: true};
const home = {id: 'home', kinds: [], tab: true};

// --- the strip ------------------------------------------------------------------
eq(ids(planStrip([], [])), [HOME], 'nothing enabled, nothing running: Home only');
eq(planStrip([], []).tabs[0], {id: 'home', type: 'home', label: 'Home', icon: 'go-home-symbolic', kinds: []},
    'Home tab shape');
eq(ids(planStrip([media, hud, timer], [])), [HOME, 'media', 'timer'],
    'module kind tabs show without activities, with or without tab.js (2026-11-02)');
eq(ids(planStrip([media], [act('m', 'media')])), [HOME, 'media'], 'an activity without expanded keeps its module tab');
eq(ids(planStrip([hud], [])), [HOME], 'a feedback-only module (osd) has no tab (SPEC §2b)');
eq(ids(planStrip([{id: 'copied', kinds: ['copied']}], [])), [HOME], 'copied neither');
{
    // clipboard: the copied feedback and its own tab.js (history, M5) — SPEC §2b
    const clipboard = {id: 'clipboard', kinds: ['copied'], tab: true};
    const s = planStrip([media, clipboard], [act('c', 'copied', {expanded: true})]);
    eq(ids(s), [HOME, 'media'], 'a feedback-only module with tab.js: no kind tab, even for an expanded copied');
    eq([s.slot?.id, s.slot?.type, s.more.map(t => t.id)], ['clipboard', 'standalone', ['clipboard']],
        'its tab.js is a standalone tab: in the slot and ⋯');
    eq(ids(planStrip([clipboard], [], {pinned: ['clipboard']})), [HOME, 'clipboard'], 'pinned like any standalone tab');
    eq(tabFor(act('c', 'copied'), s), HOME, 'a copied pill opens Home, not the Clipboard tab');
}
eq(ids(planStrip([hud], [act('v', 'osd')])), [HOME], 'osd without expanded: still no tab → Home');
eq(ids(planStrip([{id: 'mix', kinds: ['osd', 'timer']}], [])), [HOME, 'mix'],
    'a module with a non-feedback kind among its kinds has its tab');
eq(ids(planStrip([{id: 'quiet', kinds: []}], [])), [HOME], 'a module without kinds and tab.js has no tab');
eq(ids(planStrip([media], [act('d', 'deploy', {expanded: {leading: null, center: null, trailing: null}})])),
    [HOME, 'media'], 'an expanded presentation with every region empty gives an unclaimed kind no tab');
eq(ids(planStrip([media], [act('d', 'deploy', {expanded: {center: {title: 'x'}}})])), [HOME, 'media', 'kind:deploy'],
    'expanded regions count for unclaimed kinds');
eq(ids(planStrip([timer, media, progress],
    [act('p', 'progress', {expanded: true}), act('m', 'media', {expanded: true})])),
[HOME, 'timer', 'media', 'progress'], 'kind tabs follow module order, not activity order');
eq(ids(planStrip([media, progress], [act('m', 'media', {expanded: true}), act('m2', 'media', {expanded: true})])),
    [HOME, 'media', 'progress'], 'one tab per module, however many activities; idle modules too');
eq(planStrip([progress], [act('p', 'progress', {expanded: true})]).tabs[1],
    {id: 'progress', type: 'kind', label: 'Transfers', icon: 'folder-download-symbolic', kinds: ['progress']},
    'module title and icon');
eq(planStrip([media], [act('m', 'media', {expanded: true})]).tabs[1].label, 'Media', 'label falls back to the id');
eq(planStrip([media], []).tabs[1].icon, 'view-app-grid-symbolic', 'a module without icon gets the generic one');
eq(planStrip([], [act('d', 'deploy', {expanded: true, leading: 'emblem-ok-symbolic'})]).tabs[1].icon, 'emblem-ok-symbolic',
    'unclaimed kind: icon from its activity');
eq(planStrip([], [act('d', 'deploy', {expanded: true, leading: {icon: 'x-symbolic'}})]).tabs[1].icon, 'x-symbolic',
    'unclaimed kind: {icon} leading');
eq(planStrip([], [act('d', 'deploy', {expanded: true, leading: {progress: 0.2}})]).tabs[1].icon, 'view-app-grid-symbolic',
    'unclaimed kind without an icon: generic');
for (const t of planStrip([media, timer, clip], [act('d', 'deploy', {expanded: true})], {pinned: ['clipboard']}).tabs)
    eq(typeof t.icon === 'string' && t.icon.length > 0, true, `every tab has an icon (${t.id}): inactive tabs show only it`);
eq(ids(planStrip([media], [act('d', 'deploy', {expanded: true}), act('d2', 'deploy', {expanded: true}),
    act('m', 'media', {expanded: true})])),
[HOME, 'media', 'kind:deploy'], 'unclaimed kinds (D-Bus) get one tab each, after the module tabs');
eq(planStrip([], [act('d', 'deploy', {expanded: true})]).tabs[1].label, 'Deploy', 'unclaimed kind label');
eq(ids(planStrip([], [act('d', 'deploy')])), [HOME], 'unclaimed kind without expanded: no tab');
eq(ids(planStrip([hud], [act('x', 'osd', {expanded: true})])), [HOME, 'hud'],
    'a claimed kind uses its module tab, never a kind: tab');

// --- standalone tabs: the slot (2026-11-02) ----------------------------------------
let s = planStrip([media, clip, launcher, home], []);
eq(ids(s), [HOME, 'media'], 'standalone tabs are not fixed tabs unless pinned in settings');
eq(s.slot?.id, 'clipboard', 'nothing chosen yet: the slot shows the first enabled standalone tab');
eq(s.slot.type, 'standalone', 'slot tab type');
eq(s.more.map(t => t.id), ['clipboard', 'launcher'], '⋯ lists every enabled standalone tab, never Home');
eq(planStrip([media], []).slot, null, 'no standalone tab: no slot');
eq(planStrip([media], []).more, [], 'no standalone tab: no ⋯');
eq(planStrip([clip, launcher], [], {slot: 'launcher'}).slot?.id, 'launcher', 'the slot shows the one chosen from ⋯');
eq(planStrip([clip], [], {slot: 'launcher'}).slot?.id, 'clipboard', 'a slot naming a disabled tab falls back to the first');
eq(planStrip([launcher], [], {slot: 'clipboard'}).slot?.id, 'launcher', 'the first enabled one, whichever it is');
s = planStrip([media, clip, launcher], [act('m', 'media', {expanded: true})], {pinned: ['clipboard'], slot: 'clipboard'});
eq(ids(s), [HOME, 'media', 'clipboard'], 'pinned (settings) standalone tabs follow the kind tabs');
eq(s.slot?.id, 'launcher', 'a pinned tab is never also in the slot: the first free one is');
eq(s.more.map(t => t.id), ['clipboard', 'launcher'], '⋯ still lists pinned ones');
eq(planStrip([clip], [], {pinned: ['clipboard']}).slot, null, 'every standalone tab pinned: no slot');
eq(ids(planStrip([media], [], {pinned: ['media', 'nope']})), [HOME, 'media'], 'pinning a kind module or unknown id adds nothing');

// --- where an open starts ---------------------------------------------------------
s = planStrip([media, hud, timer], [act('m', 'media', {expanded: true}), act('v', 'osd')]);
eq(tabFor(null, s), HOME, 'idle pill → Home');
eq(tabFor(act('m', 'media', {expanded: true}), s), 'media', 'a pill → the tab of its kind');
eq(tabFor(act('v', 'osd'), s), HOME, 'kind without a tab → Home');
eq(tabFor(act('t', 'timer'), s), 'timer', 'a module tab.js covers activities without expanded');
eq(tabFor(act('m2', 'media'), s), 'media', 'a media pill without expanded opens the (empty) Media tab');
eq(tabFor(act('z', 'unknown'), s), HOME, 'unknown kind → Home');
const strip2 = planStrip([media], [act('d', 'deploy', {expanded: true})]);
eq(tabFor(act('d', 'deploy', {expanded: true}), strip2), 'kind:deploy', 'unclaimed kind → its kind: tab');
eq(tabFor(act('m', 'media', {expanded: true}), s), tabFor(act('m', 'media', {expanded: true}), s),
    'no memory: the same context always gives the same tab');

// --- a tab only while live (Claude Code, 2026-11-07) ---------------------------------
{
    const agents = {id: 'agent', kinds: ['agent', 'ask'], tab: class {}, title: 'Claude Code', icon: 'claude-desktop', tabWhileLive: true};
    eq(planStrip([media, agents], []).tabs.map(t => t.id), [HOME, 'media'], 'no session: no Claude Code tab');
    eq(planStrip([media, agents], [act('s', 'agent')]).tabs.map(t => t.id), [HOME, 'media', 'agent'],
        'a session: the tab, after the others in module order');
    eq(planStrip([media, agents], [act('q', 'ask', {expanded: true})]).tabs.map(t => t.id), [HOME, 'media', 'agent'],
        'a prompt alone: the tab too');
    eq(planStrip([media, agents], [act('q', 'ask', {expanded: true})]).tabs.some(t => t.id === 'kind:ask'), false,
        'its kinds stay claimed while hidden: no stray "Ask" tab');
    eq(planStrip([media, agents], [act('s', 'agent')]).tabs.at(-1).icon, 'claude-desktop', 'its icon');
}

// --- what a click does -------------------------------------------------------------
const playing = act('m', 'media', {expanded: true});
const osd = Object.assign(act('v', 'osd'), {onPress: () => {}});
eq(pressTarget(null, s), {tab: HOME, press: false}, 'idle pill → Home');
eq(pressTarget(playing, s), {tab: 'media', press: false}, 'a pill → its kind tab');
eq(pressTarget(playing, s, {missed: true}), {tab: HOME, press: false},
    'pill showing the amber missed line → Home, not its kind tab');
eq(pressTarget(playing, s, {badge: true}), {tab: HOME, press: false}, '+N badge → Home');
eq(pressTarget(osd, s), {tab: HOME, press: true}, 'no tab and onPress → run onPress');
eq(pressTarget(osd, s, {missed: true}), {tab: HOME, press: false},
    'missed line wins over onPress: Home opens, onPress does not run');
eq(pressTarget(osd, s, {badge: true}), {tab: HOME, press: false}, 'badge wins over onPress');
eq(pressTarget(act('w', 'osd'), s), {tab: HOME, press: false}, 'no tab and no onPress → Home');
eq(pressTarget(Object.assign(act('x', 'osd'), {onPress: 'nope'}), s), {tab: HOME, press: false},
    'a non-function onPress is ignored');
eq(pressTarget(Object.assign(act('t', 'timer'), {onPress: () => {}}), s), {tab: 'timer', press: false},
    'a kind with a tab opens it even with onPress');
eq(pressTarget(Object.assign(act('t', 'timer'), {onPress: () => {}, pressFirst: true}), s), {tab: 'timer', press: true},
    'pressFirst: onPress first, its tab named for when onPress does nothing (CODING-AGENTS.md §2)');
eq(pressTarget(Object.assign(act('t', 'timer'), {pressFirst: true}), s), {tab: 'timer', press: false},
    'pressFirst without onPress: the tab');
eq(pressTarget(Object.assign(act('t', 'timer'), {onPress: () => {}, pressFirst: true}), s, {badge: true}),
    {tab: HOME, press: false}, 'the badge still wins');

// --- a kind tab's activities --------------------------------------------------------
const list = [act('a', 'media', {expanded: true}), act('b', 'osd'), act('c', 'media'), act('d', 'media', {expanded: true})];
eq(planStrip([clip], []).slot.icon, 'view-app-grid-symbolic', 'slot tab has an icon');
eq(tabActivities(planStrip([media], list).tabs[1], list).map(a => a.id), ['a', 'd'],
    'kind tab shows its activities with an expanded presentation, in stack order');
eq(tabActivities({kinds: ['progress']}, list), [], 'none of its kind: the tab stays empty');
eq(tabActivities({kinds: ['media']}, list, {own: true}).map(a => a.id), ['a', 'c', 'd'],
    'a tab.js of its own gets every activity of its kinds, expanded or not');

// --- findTab ----------------------------------------------------------------------------
s = planStrip([media, clip, launcher], [act('m', 'media', {expanded: true})], {slot: 'launcher'});
eq(findTab(s, 'media')?.id, 'media', 'find a strip tab');
eq(findTab(s, 'launcher')?.id, 'launcher', 'find the slot tab');
eq(findTab(s, 'clipboard')?.id, 'clipboard', 'find a ⋯ tab');
eq(findTab(s, 'nope'), null, 'unknown id');

// --- stripOrder: what ←/→ walks ------------------------------------------------------
eq(stripOrder({tabs: [{id: HOME}, {id: 'media'}], slot: {id: 'calendar'}, more: [{id: 'calendar'}, {id: 'clipboard'}]}),
    [HOME, 'media', 'calendar'], 'tabs then the slot; ⋯ is not walked');
eq(stripOrder({tabs: [{id: HOME}], slot: null, more: []}), [HOME], 'no slot: Home alone');

print('tabs: ok');
