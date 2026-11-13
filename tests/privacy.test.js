// Run: gjs -m tests/privacy.test.js   (the privacy module's adapter: the screen's activities)
import adapter from '../src/buoy@murilegus/lib/modules/privacy/adapter.js';
import {validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';
import {planMinimal, planCompact, clockTime} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {tileOf} from '../src/buoy@murilegus/lib/kit/model/home.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const SINCE = new Date(2026, 10, 14, 14, 3, 0).getTime();
const act = (ev, id = 'screen:system:x') => validate({id, kind: 'screen', app: 'system', ...adapter.screen(ev)});

// --- default: Shell's own screencast ----------------------------------------------
{
    const a = act({id: 'shell', what: 'shell', since: SINCE});
    eq([a.priority, a.ttl, a.minimalAction], [55, 0, false], 'screen: priority 55, until ended, no button in the bar');
    const m = planMinimal(a, {});
    eq([m.leading, m.text, m.trailing], [{type: 'icon', icon: 'media-record-symbolic'}, null, {type: 'elapsed', at: SINCE}],
        'pill: the record icon, the clock in trailing (every pill shows it)');
    eq(m.action ?? null, null, 'pill: no Stop in the bar');
    const c = planCompact(a);
    eq([c.text, c.subtitle], ['Recording the screen', {type: 'elapsed', at: SINCE, text: `from ${clockTime(SINCE)}`}],
        'compact: the title and "0:42 · from 14:03" running');
    eq(c.leading, {type: 'icon', icon: 'media-record-symbolic', backdrop: true}, 'compact: the icon on its fill-2 plate');
    eq(c.actions, [{id: 'stop', label: null, icon: 'media-playback-stop-symbolic'}], 'compact: Stop, an icon alone (■)');
    eq(clockTime(SINCE), '14:03', 'the start as HH:MM');
    const t = tileOf(a);
    eq([t.value, t.caption], [{type: 'elapsed', at: SINCE}, 'Recording'], 'Home tile: the running clock, "Recording"');
}

// --- each kind ------------------------------------------------------------------
{
    const portal = act({id: 'portal', what: 'portal', since: SINCE});
    eq(planCompact(portal).text, 'An app is recording the screen', 'portal: no app name from Mutter');
    eq(planMinimal(portal, {}).leading.icon, 'media-record-symbolic', 'portal: the record icon');
    const share = act({id: 'sharing', what: 'sharing', since: SINCE});
    eq([planMinimal(share, {}).leading.icon, planCompact(share).text, tileOf(share).caption],
        ['screen-shared-symbolic', 'Sharing the screen', 'Sharing'], 'sharing: its icon, title and caption');
}

// --- Stop goes to the source --------------------------------------------------------
{
    const got = [];
    const a = act({id: 'shell', what: 'shell', since: SINCE, onAction: id => got.push(id)});
    a.onAction('stop');
    eq(got, ['stop'], 'onAction reaches the source');
    eq(act({id: 'shell', what: 'shell', since: SINCE, onAction: 'nope'}).onAction ?? null, null, 'onAction not a function: none');
}

// --- missing and bad fields ---------------------------------------------------------
eq([adapter.screen({what: 'camera'}), adapter.screen({}), adapter.screen(null)], [null, null, null],
    'unknown or missing what: no activity');
{
    const a = act({id: 'shell', what: 'shell'});
    eq([planMinimal(a, {}).trailing, planCompact(a).subtitle, tileOf(a).value], [null, null, null],
        'no start time: no clock, no subtitle, no tile value');
    eq(planMinimal(a, {}).leading.icon, 'media-record-symbolic', 'no start time: still the icon');
    const nan = act({id: 'shell', what: 'shell', since: NaN});
    eq(planMinimal(nan, {}).trailing, null, 'a start that is not a number: no clock');
}

console.log('privacy: ok');
