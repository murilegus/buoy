// Run: gjs -m tests/progress.test.js   (no Shell needed; adapters are pure)
import adapter, {
    DONE_TTL, DONE_AT, appIdOf, applyUpdate, transition, countText, percent,
} from '../src/buoy@murilegus/lib/modules/progress/adapter.js';
import {DoneHistory, KEEP_MS, MAX_DONE} from '../src/buoy@murilegus/lib/modules/progress/history.js';
import {planMinimal, planCompact} from '../src/buoy@murilegus/lib/kit/presentation.js';
import {validate} from '../src/buoy@murilegus/lib/kit/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

// --- the app, from the signal's app_uri (as Ubuntu Dock's launcherAPI.js) ------------------
eq(appIdOf('application://org.gnome.Nautilus.desktop'), 'org.gnome.Nautilus.desktop', 'application:// scheme dropped');
eq(appIdOf('google-chrome.desktop'), 'google-chrome.desktop', 'no scheme: as is');
eq(appIdOf('//x.desktop'), 'x.desktop', 'a bare // dropped');
eq([appIdOf(''), appIdOf(null), appIdOf(7)], [null, null, null], 'nothing usable: null');

// --- LauncherEntry properties: only the known ones, typed, clamped -------------------------
{
    const e = applyUpdate(undefined, {'progress': 0.4, 'progress-visible': true});
    eq(e, {progress: 0.4, progressVisible: true, count: 0, countVisible: false, urgent: false},
        'defaults as libunity\'s, with what was sent');
    const f = applyUpdate(e, {'progress': 0.55});
    eq([f.progress, f.progressVisible], [0.55, true], 'a later update keeps what it does not send');
    eq(e.progress, 0.4, 'the old entry is not changed');
    eq(applyUpdate(e, {'progress': 1.7}).progress, 1, 'progress clamped to 1');
    eq(applyUpdate(e, {'progress': -1}).progress, 0, 'and to 0');
    eq(applyUpdate(e, {'progress': 'x', 'count': 2.5, 'urgent': 'yes'}), e, 'wrong types ignored');
    eq(applyUpdate(e, {'count': 2, 'count-visible': true}).count, 2, 'a count');
    eq(applyUpdate(e, {'quicklist': '/menu', 'updating': true}), e, 'other keys ignored');
}

// --- transitions: start, update, done (≥ DONE_AT), stop -----------------------------------
const run = p => ({progress: p, progressVisible: true, count: 0, countVisible: false, urgent: false});
const idle = p => ({...run(p), progressVisible: false});
eq(transition(undefined, run(0.1)), 'start', 'first visible progress: start');
eq(transition(idle(0), run(0.1)), 'start', 'visible again: start');
eq(transition(run(0.1), run(0.2)), 'update', 'progress moves: update');
eq(transition(run(0.2), run(0.2)), null, 'nothing changed: nothing');
eq(transition(run(0.995), idle(0.995)), 'done', 'hidden at the end: done');
eq(transition(run(1), idle(0)), 'done', 'Files resets to 0 as it hides: the last seen was the end');
eq(transition(run(0.4), idle(0.4)), 'stop', 'hidden half way (cancelled): stop, no Done');
eq(transition(run(0.4), null), 'stop', 'the app went away: stop');
eq(transition(undefined, idle(0)), null, 'never ran: nothing');
eq(DONE_AT, 0.99, 'Done from 99 %');

// --- the pill -------------------------------------------------------------------------------
eq([percent(0), percent(0.555), percent(1)], [0, 56, 100], 'percent rounds');
eq([countText(0, true, 'x'), countText(2, false, 'x'), countText(2, true, 'nautilus'),
    countText(1, true, 'nautilus'), countText(3, true, 'chrome')],
[null, null, '2 items', '1 item', '3 downloads'], 'count only when visible; downloads for browsers');
{
    const focused = [];
    const ev = {
        id: 'org.gnome.Nautilus.desktop', slug: 'org.gnome.Nautilus', name: 'Files', icon: 'org.gnome.Nautilus',
        progress: 0.55, count: 0, countVisible: false, phase: 'running', focus: () => focused.push(1),
    };
    const p = adapter.progress(ev, null);
    eq(p.leading, {progress: 0.55}, 'minimal: a ring with the fraction');
    eq(p.text, 'Files', 'the app\'s name');
    eq(p.trailing, {text: '55%'}, 'and its percentage');
    eq(p.ttl, 0, 'running: until it ends');
    eq(p.compact, {leading: {icon: 'org.gnome.Nautilus'}, text: 'Files', subtitle: '55%', progress: 0.55},
        'compact: the app icon, name, percentage and a bar');
    p.onPress();
    eq(focused.length, 1, 'click: focus the app');
    const m = planMinimal(validate({id: 'progress:x:y', kind: 'progress', ...p}));
    eq([m.leading.type, m.text, m.trailing.text], ['ring', 'Files', '55%'], 'planned');
    eq(planCompact(validate({id: 'progress:x:y', kind: 'progress', ...p})).progress, 0.55, 'the compact bar');
    eq(adapter.progress({...ev, count: 2, countVisible: true, slug: 'chrome', name: 'Chrome'}, null).compact.subtitle,
        '2 downloads · 55%', 'a visible count in the compact');
    const d = adapter.progress({...ev, phase: 'done', progress: 1}, null);
    eq([d.leading, d.text, d.trailing, d.ttl, d.compact], [{icon: 'object-select-symbolic'}, 'Files · Done', null, DONE_TTL, null],
        'done: a tick, "Done", a short ttl, no compact');
    eq(DONE_TTL > 0 && DONE_TTL <= 3000, true, 'Done is brief');
    const keys = ['leading', 'text', 'trailing', 'compact', 'ttl', 'onPress'];
    for (const x of [p, d])
        eq(keys.filter(k => !(k in x)), [], 'every field set: the pill is updated in place');
    eq(adapter.progress({...ev, name: ''}, null).text, 'org.gnome.Nautilus', 'no name: the app id');
    eq(adapter.progress({...ev, focus: undefined}, null).onPress, null, 'no app to focus: no onPress');
    const long = 'A File Manager With A Very Long Display Name For Testing';
    eq(adapter.progress({...ev, name: long}, null).text, long, 'long name kept whole');
    if (/"(width|height|w|h|px|size)":/.test(JSON.stringify(p)))
        throw new Error('progress: no measurements in the adapter');
}

// --- Done rows for the Transfers tab: kept a while, newest first --------------------------
{
    const h = new DoneHistory();
    h.add({appId: 'a.desktop', name: 'A', icon: 'a', at: 1000});
    h.add({appId: 'b.desktop', name: 'B', icon: 'b', at: 2000});
    eq(h.list(2000).map(r => r.name), ['B', 'A'], 'newest first');
    h.add({appId: 'a.desktop', name: 'A', icon: 'a', at: 3000});
    eq(h.list(3000).map(r => `${r.name}@${r.at}`), ['A@3000', 'B@2000'], 'an app done again moves up, once');
    eq(h.list(2000 + KEEP_MS).map(r => r.name), ['A'], 'older than KEEP_MS: gone');
    eq(KEEP_MS, 10 * 60 * 1000, 'kept 10 minutes');
    for (let i = 0; i < 10; i++)
        h.add({appId: `x${i}`, name: `X${i}`, icon: 'x', at: 4000 + i});
    eq(h.list(5000).length, MAX_DONE, `at most ${MAX_DONE}`);
    h.clear();
    eq(h.list(5000), [], 'cleared with the module');
}

print('progress: ok');
