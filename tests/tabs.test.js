// Run: gjs -m tests/tabs.test.js   (pure: which tabs the strip shows, where an open starts)
import {planStrip, tabFor, tabActivities, findTab, HOME} from '../src/buoy@murilegus/lib/kit/tabs.js';

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
eq(ids(planStrip([media, hud, timer], [])), [HOME, 'timer'], 'a module with tab.js has its tab without activities');
eq(ids(planStrip([media], [act('m', 'media')])), [HOME],
    'an activity without an expanded presentation gives its kind no tab');
eq(ids(planStrip([media], [act('m', 'media', {expanded: true})])), [HOME, 'media'],
    'an activity with an expanded presentation gives its kind a tab (no tab.js yet)');
eq(ids(planStrip([media], [act('m', 'media', {expanded: {center: {title: 'x'}}})])), [HOME, 'media'],
    'expanded regions count too');
eq(ids(planStrip([media], [act('m', 'media', {expanded: {leading: null, center: null, trailing: null}})])), [HOME],
    'an expanded presentation with every region empty is none');
eq(ids(planStrip([hud], [act('v', 'osd')])), [HOME], 'osd has no expanded: no tab (SPEC §2b → Home)');
eq(ids(planStrip([timer, media, progress],
    [act('p', 'progress', {expanded: true}), act('m', 'media', {expanded: true})])),
[HOME, 'timer', 'media', 'progress'], 'kind tabs follow module order, not activity order');
eq(ids(planStrip([media, progress], [act('m', 'media', {expanded: true}), act('m2', 'media', {expanded: true})])),
    [HOME, 'media'], 'one tab per module, however many activities');
eq(planStrip([progress], [act('p', 'progress', {expanded: true})]).tabs[1],
    {id: 'progress', type: 'kind', label: 'Transfers', icon: 'folder-download-symbolic', kinds: ['progress']},
    'module title and icon');
eq(planStrip([media], [act('m', 'media', {expanded: true})]).tabs[1].label, 'Media', 'label falls back to the id');
eq(ids(planStrip([media], [act('d', 'deploy', {expanded: true}), act('d2', 'deploy', {expanded: true}),
    act('m', 'media', {expanded: true})])),
[HOME, 'media', 'kind:deploy'], 'unclaimed kinds (D-Bus) get one tab each, after the module tabs');
eq(planStrip([], [act('d', 'deploy', {expanded: true})]).tabs[1].label, 'Deploy', 'unclaimed kind label');
eq(ids(planStrip([], [act('d', 'deploy')])), [HOME], 'unclaimed kind without expanded: no tab');
eq(ids(planStrip([hud], [act('x', 'osd', {expanded: true})])), [HOME, 'hud'],
    'a claimed kind uses its module tab, never a kind: tab');

// --- standalone tabs ------------------------------------------------------------
let s = planStrip([media, clip, launcher, home], []);
eq(ids(s), [HOME], 'standalone tabs are not fixed unless pinned');
eq(s.slot, null, 'empty slot');
eq(s.more.map(t => t.id), ['clipboard', 'launcher'], '⋯ lists every enabled standalone tab, never Home');
eq(planStrip([media], []).more, [], 'no standalone tab: no ⋯');
s = planStrip([clip, launcher], [], {slot: 'launcher'});
eq(s.slot?.id, 'launcher', 'the slot shows the last chosen standalone tab');
eq(s.slot.type, 'standalone', 'slot tab type');
eq(planStrip([clip], [], {slot: 'launcher'}).slot, null, 'a slot naming a disabled tab is empty');
s = planStrip([media, clip, launcher], [act('m', 'media', {expanded: true})], {pinned: ['clipboard'], slot: 'clipboard'});
eq(ids(s), [HOME, 'media', 'clipboard'], 'pinned standalone tabs follow the kind tabs');
eq(s.slot, null, 'a pinned tab is not also in the slot');
eq(s.more.map(t => t.id), ['clipboard', 'launcher'], '⋯ still lists pinned ones');
eq(ids(planStrip([media], [], {pinned: ['media', 'nope']})), [HOME], 'pinning a kind module or unknown id adds nothing');

// --- where an open starts ---------------------------------------------------------
s = planStrip([media, hud, timer], [act('m', 'media', {expanded: true}), act('v', 'osd')]);
eq(tabFor(null, s), HOME, 'idle pill → Home');
eq(tabFor(act('m', 'media', {expanded: true}), s), 'media', 'compact pill → the tab of its kind');
eq(tabFor(act('v', 'osd'), s), HOME, 'kind without a tab → Home');
eq(tabFor(act('t', 'timer'), s), 'timer', 'a module tab.js covers activities without expanded');
eq(tabFor(act('z', 'unknown'), s), HOME, 'unknown kind → Home');
const strip2 = planStrip([media], [act('d', 'deploy', {expanded: true})]);
eq(tabFor(act('d', 'deploy', {expanded: true}), strip2), 'kind:deploy', 'unclaimed kind → its kind: tab');
eq(tabFor(act('m', 'media', {expanded: true}), s), tabFor(act('m', 'media', {expanded: true}), s),
    'no memory: the same context always gives the same tab');

// --- a kind tab's activities --------------------------------------------------------
const list = [act('a', 'media', {expanded: true}), act('b', 'osd'), act('c', 'media'), act('d', 'media', {expanded: true})];
eq(tabActivities(planStrip([media], list).tabs[1], list).map(a => a.id), ['a', 'd'],
    'kind tab shows its activities with an expanded presentation, in stack order');
eq(tabActivities({kinds: ['progress']}, list), [], 'none of its kind');

// --- findTab ----------------------------------------------------------------------------
s = planStrip([media, clip, launcher], [act('m', 'media', {expanded: true})], {slot: 'launcher'});
eq(findTab(s, 'media')?.id, 'media', 'find a strip tab');
eq(findTab(s, 'launcher')?.id, 'launcher', 'find the slot tab');
eq(findTab(s, 'clipboard')?.id, 'clipboard', 'find a ⋯ tab');
eq(findTab(s, 'nope'), null, 'unknown id');

print('tabs: ok');
