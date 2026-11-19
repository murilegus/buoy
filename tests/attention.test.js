// Run: gjs -m tests/attention.test.js   (pure: FEATURES M4 "Attention on another workspace"; design/compact "Cửa sổ cần chú ý")
import adapter, {DISMISS, GO} from '../src/buoy@murilegus/lib/modules/attention/adapter.js';
import {element, planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {tierOf, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

class Icon {}       // a Gio.Icon, not a plain object
const logo = new Icon();
const did = [];
const ev = o => ({
    id: 'firefox.desktop', appName: 'Firefox', appIcon: logo, title: 'Pull request #284 — GitHub', workspace: 2, more: 0,
    at: 1000, shared: false, activate: () => did.push('go'), dismiss: () => did.push('dismiss'), ...o,
});

// --- on another workspace ------------------------------------------------------------------------------
const a = adapter.attention(ev());
eq([a.text, a.leading, a.trailing, a.ttl, a.pressFirst], ['Pull request #284 — GitHub', logo, {workspace: 2, more: 0}, 0, true],
    'the app\'s logo, the window\'s title, its workspace; it stays; a click goes to it');
eq([a.compact.card.title, a.compact.card.app, a.compact.card.close, a.compact.card.tight, a.compact.card.actionsOnHover],
    ['Pull request #284 — GitHub', 'Firefox · Workspace 2', DISMISS, true, false], 'card: the title, "Firefox · Workspace 2", ×, its button at once');
eq(a.actions, [{id: GO, label: 'Go to Window', icon: 'go-jump-symbolic'}], 'Go to Window');
a.onPress();
a.onAction(GO);
a.onAction(DISMISS);
a.onAction('x');
eq(did, ['go', 'go', 'dismiss'], 'a click and Go go to the window; × dismisses');

// --- on this workspace, several, no title, shared ----------------------------------------------------
const here = adapter.attention(ev({workspace: null}));
eq([here.trailing, here.compact.card.app], [null, 'Firefox'], 'on this workspace: no number (Ethan, 2026-11-19: shown, without it)');
const more = adapter.attention(ev({more: 1}));
eq([more.trailing, more.compact.card.app], [{workspace: 2, more: 1}, 'Firefox · Workspace 2 · +1'], 'another window of it asks too: "+1"');
eq(adapter.attention(ev({workspace: null, more: 2})).trailing, {workspace: null, more: 2}, '"+2" alone on this workspace');
const bare = adapter.attention(ev({title: '  ', appIcon: null}));
eq([bare.text, bare.leading, bare.compact.card.app], ['Firefox', 'view-app-grid-symbolic', 'Workspace 2'], 'no title: the app (not twice on the card); no icon: a generic one');
const sh = adapter.attention(ev({shared: true}));
eq([sh.text, sh.compact.card.title, JSON.stringify(sh).includes('Pull request')], ['Firefox', 'Firefox', false], 'a shared screen: the app only');
eq(adapter.attention(ev({appName: '', title: ''})).text, 'App', 'nothing known: "App"');
eq([adapter.attention(ev({workspace: 0})).trailing, adapter.attention(ev({workspace: 1.5})).trailing], [null, null], 'no workspace number that is not 1…');

// --- the kit: the element, the tier ------------------------------------------------------------------
eq([element({workspace: 3}), element({workspace: null, more: 1}), element({workspace: 2, more: 1}), element({workspace: 0, more: 0})],
    [{type: 'workspace', n: 3, more: 0}, {type: 'workspace', n: null, more: 1}, {type: 'workspace', n: 2, more: 1}, null],
    'the workspace element: its number, "+N", both; nothing to say: none');
const v = validate({id: 'attention:firefox:x', kind: 'attention', app: 'firefox', ...a});
eq([planMinimal(v).trailing?.type, planCompact(v).card.actions?.length ?? planCompact(v).actions.length, tierOf(v)], ['workspace', 1, 2],
    'planned: the square on the pill, its button; running, not "needs you"');

print('attention: ok');
