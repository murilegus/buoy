// Run: gjs -m tests/call.test.js   (pure: FEATURES M4 "Privacy dot", the rest; design/compact "Đang gọi")
import adapter, {MUTE, NOTIFY} from '../src/buoy@murilegus/lib/modules/privacy/adapter.js';
import {CALL_SETTLE, SKIPPED_APPS, inUseTile, recordingApps, restoreBanners} from '../src/buoy@murilegus/lib/modules/privacy/call.js';
import {clockTime, planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {tierOf, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

eq(CALL_SETTLE, 10000, 'both on 10 s is a call; either off 10 s ends it');
eq(SKIPPED_APPS, ['org.gnome.VolumeControl', 'org.PulseAudio.pavucontrol'], 'the volume panels, as Shell skips them');

// --- who records --------------------------------------------------------------------------------------
eq(recordingApps([{name: 'Firefox', app: 'org.mozilla.firefox'}, {name: 'Firefox', app: 'org.mozilla.firefox'},
    {name: 'Volume Control', app: 'org.gnome.VolumeControl'}, {name: ' Slack ', app: null}, {name: '', app: 'x'}, null]),
['Firefox', 'Slack'], 'each app once, the volume panels and nameless ones left out');
eq(recordingApps(null), [], 'none');

// --- Do Not Disturb at the end ------------------------------------------------------------------------
eq(restoreBanners({ours: true, changed: false, banners: false}), true, 'Buoy turned it on, nobody touched it: back off');
eq(restoreBanners({ours: false, changed: false, banners: false}), false, 'on before the call: left on');
eq(restoreBanners({ours: true, changed: true, banners: false}), false, 'changed by hand during the call: left as it is');
eq(restoreBanners({ours: true, changed: false, banners: true}), false, 'already off: nothing');

// --- Home's tile --------------------------------------------------------------------------------------
eq(inUseTile({mic: true, cam: true, apps: ['Firefox']}),
    {icon: 'camera-video-symbolic', value: 'Firefox', caption: 'Microphone, camera', detail: []}, 'mic and camera: the app, both said');
eq(inUseTile({mic: true, cam: false, apps: ['Zoom', 'Slack']}),
    {icon: 'audio-input-microphone-symbolic', value: 'Zoom, Slack', caption: 'Microphone', detail: ['2 apps']}, 'two apps on the mic');
eq(inUseTile({mic: false, cam: true, apps: ['Zoom']}),
    {icon: 'camera-video-symbolic', value: 'Camera', caption: 'Camera', detail: []}, 'the camera alone: GNOME does not say whose');
eq(inUseTile({mic: true, cam: false, apps: []}).value, 'Camera', 'the mic with no app named: still a tile');
eq(inUseTile({mic: false, cam: false, apps: ['x']}), null, 'nothing in use: no tile');

// --- the call's pill and compact -------------------------------------------------------------------------
const did = [];
const T = 1795300000000;
const call = o => adapter.screen({what: 'call', since: T, app: 'Firefox', muted: false, dnd: true, onAction: id => did.push(id), ...o});
const c = call();
eq([c.leading, c.text, c.trailing, c.ttl], ['camera-video-symbolic', 'In a call', {elapsed: T}, 0], 'pill: the camera, "In a call", its clock; it stays');
eq([c.compact.card.title, c.compact.card.app], ['In a call · Firefox', `Since ${clockTime(T)} · Do Not Disturb on`], 'card: the app, since when, Do Not Disturb');
eq(c.actions, [{id: MUTE, label: 'Mute', icon: 'audio-input-microphone-symbolic', main: true}, {id: NOTIFY, label: 'Allow Notifications'}],
    'Mute (cream), Allow Notifications while Buoy holds Do Not Disturb');
eq(call({muted: true, dnd: false}).actions, [{id: MUTE, label: 'Unmute', icon: 'microphone-sensitivity-muted-symbolic', main: true}],
    'muted: Unmute; Do Not Disturb not Buoy\'s: no second button');
eq(call({app: null}).compact.card.title, 'In a call', 'no app named: "In a call"');
eq(call({dnd: false}).compact.card.app, `Since ${clockTime(T)}`, 'no Do Not Disturb: since when alone');
c.onAction(MUTE);
c.onAction(NOTIFY);
eq(did, [MUTE, NOTIFY], 'the buttons reach the source');

const a = validate({...c, id: 'screen:system:call', kind: 'screen', source: 'privacy'});
eq([tierOf(a), planMinimal(a).trailing.type], [2, 'elapsed'], 'not "needs you"; the clock runs in the renderer');
eq([planCompact(a)?.card?.title, planCompact(a)?.actions?.[0]?.main], ['In a call · Firefox', true], 'the card keeps Mute as the main button');
eq(adapter.screen({what: 'sharing', since: T}).text, null, 'the screen\'s own activities unchanged');

print('call: ok');
