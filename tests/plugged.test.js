// Run: gjs -m tests/plugged.test.js   (pure: the plugged adapter, FEATURES M4 "Headphones / display plugged")
import adapter, {
    TTL, DISPLAY_TTL, DISPLAY_WAIT, OFFER_TTL, MODES, modesFor, modeOf, monitorKey, diffMonitors, isHeadphones, outputOf, outputChanged, headphonesGone,
} from '../src/buoy@murilegus/lib/modules/plugged/adapter.js';
import {PRIORITY, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';
import {planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function ok(cond, msg) {
    if (!cond)
        throw new Error(msg);
}
// the pill's line: its leading icon, text and trailing text
const line = a => {
    const p = planMinimal(a);
    return [p.leading?.icon ?? null, p.text, p.trailing?.text ?? null];
};
const opener = () => id => {
    opened = id;
};
let opened = null;
const build = ev => {
    const d = adapter.device(ev);
    return d ? validate({id: `device:system:${ev.what}`, kind: 'device', app: 'system', ...d}) : null;
};

// --- the modes on offer, and the one in use ------------------------------------------------
eq(modesFor({canSwitch: true, builtin: true}), ['join', 'mirror', 'external'], 'modes: a laptop has Join, Mirror, External Only');
eq(modesFor({canSwitch: true, builtin: false}), ['join', 'mirror'], 'modes: no built-in panel, no External Only (switchMonitor.js)');
eq([modesFor({canSwitch: false, builtin: true}), modesFor()], [[], []], 'modes: none when Mutter cannot switch');
eq(Object.keys(MODES), ['join', 'mirror', 'external'], 'modes: GNOME\'s order, no Built-in Only (Ethan)');
eq(Object.values(MODES).map(m => m.config), ['ALL_LINEAR', 'ALL_MIRROR', 'EXTERNAL'], 'modes: Meta.MonitorSwitchConfigType names');

eq(modeOf({count: 2, builtin: true, builtinOn: true, mirrored: false}), 'join', 'mode: two displays side by side → join');
eq(modeOf({count: 2, builtin: true, builtinOn: true, mirrored: true}), 'mirror', 'mode: one logical monitor for two → mirror');
eq(modeOf({count: 2, builtin: true, builtinOn: false}), 'external', 'mode: the built-in panel off → external only');
eq(modeOf({count: 1, builtin: true, builtinOn: false}), 'external', 'mode: the laptop shut, one display → external only');
eq([modeOf({count: 1, builtin: true, builtinOn: true}), modeOf()], [null, null], 'mode: one display, nothing to say');
eq(modeOf({count: 2, builtin: false, builtinOn: false}), 'join', 'mode: a desktop without a panel is never external only');

// --- which displays came and went ----------------------------------------------------------------
const lap = {key: monitorKey({connector: 'eDP-1', vendor: 'BOE', product: '0x0a1b', serial: '0'}), name: 'Built-in display'};
const vs = {key: monitorKey({connector: 'HDMI-1', vendor: 'VSC', product: 'VX2758', serial: 'X1'}), name: 'ViewSonic 27″'};
eq(monitorKey({connector: 'HDMI-1'}), 'HDMI-1|||', 'key: missing fields empty');
ok(monitorKey({connector: 'HDMI-1', serial: 'A'}) !== monitorKey({connector: 'HDMI-1', serial: 'B'}), 'key: another panel on the same port differs');
eq(diffMonitors(null, [lap, vs]), {added: [], removed: []}, 'diff: the first reading says nothing (Buoy turned on)');
eq(diffMonitors([lap], [lap, vs]).added.map(m => m.name), ['ViewSonic 27″'], 'diff: plugged in');
eq(diffMonitors([lap, vs], [lap]).removed.map(m => m.name), ['ViewSonic 27″'], 'diff: unplugged');
eq(diffMonitors([lap, vs], [vs, lap]), {added: [], removed: []}, 'diff: Join ↔ Mirror, the same displays: nothing');

// --- headphones as GNOME tells them ------------------------------------------------------------------
eq([isHeadphones({formFactor: 'headset'}), isHeadphones({formFactor: 'headphone'}), isHeadphones({port: 'analog-output-headphones'}),
    isHeadphones({port: 'Analog-Output-HEADPHONES'}), isHeadphones({port: 'analog-output-speaker'}), isHeadphones({formFactor: 'internal'}), isHeadphones()],
[true, true, true, true, false, false, false], 'headphones: Bluetooth / USB form factor, a jack port, case-blind; speakers and nothing not');
eq(outputOf({id: 7, formFactor: 'headset', port: 'headset-output', description: ' WH-1000XM4 '}),
    {key: '7|headset-output', output: 'headphones', name: 'WH-1000XM4', device: true, sinkId: 7, port: 'headset-output'}, 'output: Bluetooth headphones by their own name');
eq(outputOf({id: 1, formFactor: 'internal', port: 'analog-output-headphones', description: 'Built-in Audio Analog Stereo'}).name,
    'Headphones', 'output: a jack says Headphones, not the card\'s name');
eq(outputOf({id: 3, formFactor: 'headphone', description: ''}).name, 'Headphones', 'output: a device without a name');
eq(outputOf({id: 1, port: 'analog-output-speaker', description: 'Built-in Audio'}), {key: '1|analog-output-speaker', output: 'speakers', name: 'Speakers', device: false, sinkId: 1, port: 'analog-output-speaker'},
    'output: speakers');
eq(outputOf(), {key: '|', output: 'speakers', name: 'Speakers', device: false, sinkId: null, port: null}, 'output: no sink read');
eq(outputOf({id: 1, port: 'analog-output-headphones'}).device, false, 'output: a jack is not a device of its own');

const spk = outputOf({id: 1, port: 'analog-output-speaker'}), jack = outputOf({id: 1, port: 'analog-output-headphones'});
const bt = outputOf({id: 9, formFactor: 'headset', description: 'Buds'}), hdmi = outputOf({id: 4, port: 'hdmi-output-0'});
eq(outputChanged(null, jack), false, 'changed: the first reading says nothing');
eq([outputChanged(spk, jack), outputChanged(jack, spk), outputChanged(jack, bt)], [true, true, true],
    'changed: to headphones, back to speakers, to other headphones');
eq([outputChanged(spk, hdmi), outputChanged(jack, jack), outputChanged(spk, spk)], [false, false, false],
    'changed: speakers to the display\'s speakers, or nothing new: no flash');

// --- the display flashes ---------------------------------------------------------------------------------
const set = [];
const inEv = {what: 'display-in', name: 'ViewSonic 27″', size: '2560 × 1440', mode: 'join', modes: ['join', 'mirror', 'external'], setMode: m => set.push(m), open: () => {}};
const din = build(inEv);
eq([din.priority, din.ttl, din.kind], [PRIORITY.device, DISPLAY_WAIT, 'device'], 'display in: priority 35, waits (30 s at most) for you');
eq(build({...inEv, settled: true}).ttl, DISPLAY_TTL, 'display in: once you are back (input), 3 s');
eq([TTL, DISPLAY_TTL, DISPLAY_WAIT], [3000, 3000, 30000], 'ttl: 3 s; a display 3 s after the first input, 30 s at most before (every flash 3 s, 2026-11-16)');
eq(build({...inEv, settled: 'yes'}).ttl, DISPLAY_WAIT, 'display in: settled only when true');
eq(line(din), ['video-display-symbolic', 'ViewSonic 27″', null],
    'display in: the display icon and its name, no trailing');
const card = planCompact(din).card;
eq([card.title, card.header.text, card.tight, card.picture.icon, card.picture.backdrop], ['ViewSonic 27″', '2560 × 1440 · joined', true, 'video-display-symbolic', true],
    'display in: its compact, the name over the size and the mode, on a plate');
eq(din.actions.map(a => [a.id, a.label, a.selected]), [['join', 'Join', true], ['mirror', 'Mirror', false], ['external', 'External Only', false]],
    'display in: the three buttons, the mode in use selected');
eq(din.actions.map(a => a.icon), Object.values(MODES).map(m => m.icon), 'display in: each button with its mode\'s icon');
din.onAction('mirror');
din.onAction('nope');
eq(set, ['mirror'], 'display in: a button switches, an unknown id does nothing');
eq(din.minimalAction, false, 'display in: no button on the pill itself');

const noSwitch = build({...inEv, setMode: undefined});
eq([noSwitch.compact, noSwitch.actions.length, noSwitch.onAction], [null, 0, null], 'display in: Mutter cannot switch → no compact, no buttons');
eq(build({...inEv, modes: []}).compact, null, 'display in: no modes → no compact');
eq(planCompact(build({...inEv, size: null, mode: null})).card.header.text, null, 'display in: nothing known under the name');
eq(build({...inEv, mode: 'weird'}).actions.some(a => a.selected), false, 'display in: an unknown mode selects nothing');
eq(build({...inEv, modes: ['join', 'bogus']}).actions.map(a => a.id), ['join'], 'display in: unknown modes left out');
eq(planMinimal(build({...inEv, name: '  '})).text, 'Display', 'display in: no name → "Display"');
const long = 'Some Very Long Monitor Vendor Name Incorporated 34″ UltraWide';
eq(planMinimal(build({...inEv, name: long})).text, long, 'display in: a long name untouched (the pill ellipsizes)');

const dout = build({what: 'display-out', name: 'ViewSonic 27″'});
eq([planMinimal(dout).text, dout.compact, dout.ttl, dout.priority], ['Unplugged ViewSonic 27″', null, DISPLAY_WAIT, PRIORITY.device], 'display out: waits for you too, nothing on hover');
eq(build({what: 'display-out', name: 'X', settled: true}).ttl, DISPLAY_TTL, 'display out: 3 s once you are back');

build({...inEv, open: opener()}).onPress();
eq(opened, 'gnome-display-panel.desktop', 'display: a click opens Settings → Displays');
eq(build({what: 'display-out', name: 'X'}).onPress, null, 'display: nothing to open without an opener');

// --- the sound's output ------------------------------------------------------------------------------------
const hp = build({what: 'audio', output: 'headphones', name: 'WH-1000XM4', level: 0.64, muted: false, open: opener()});
eq(line(hp), ['audio-headphones-symbolic', 'WH-1000XM4', '64%'],
    'headphones: their icon, name and the volume');
eq([hp.priority, hp.ttl, hp.compact], [PRIORITY.device, TTL, null], 'headphones: 3 s, no compact');
hp.onPress();
eq(opened, 'gnome-sound-panel.desktop', 'headphones: a click opens Settings → Sound');
eq(planMinimal(build({what: 'audio', output: 'speakers', level: 0.4})).text, 'Speakers', 'speakers: back to the speakers');
eq(line(build({what: 'audio', output: 'speakers', level: 0.4})), ['audio-speakers-symbolic', 'Speakers', '40%'], 'speakers: the speaker icon and the volume');
eq(planMinimal(build({what: 'audio', output: 'headphones'})).text, 'Headphones', 'headphones: no name → "Headphones"');
eq([build({what: 'audio', output: 'headphones', level: 0.5, muted: true}).trailing, build({what: 'audio', output: 'headphones', level: 1.5}).trailing,
    build({what: 'audio', output: 'headphones', level: NaN}).trailing, build({what: 'audio', output: 'headphones', level: -1}).trailing],
[{text: 'Muted'}, {text: '150%'}, null, {text: '0%'}], 'headphones: muted said so, over 100 % kept, unknown none, below 0 is 0');

// --- headphones unplugged, or only switched away from ---------------------------------------------------
eq(headphonesGone(jack, null), true, 'gone: the jack\'s sink went (a SOF card back on its speaker profile)');
eq(headphonesGone(jack, {ports: [{port: 'analog-output-headphones', available: false}]}), true, 'gone: the jack port not available');
eq(headphonesGone(jack, {ports: [{port: 'analog-output-headphones', available: true}]}), false, 'gone: the jack still in, switched by hand');
eq(headphonesGone(jack, {ports: [{port: 'analog-output-speaker', available: true}]}), true, 'gone: the port not listed any more');
eq([headphonesGone(bt, null), headphonesGone(bt, {ports: []})], [true, false], 'gone: Bluetooth sink gone; still there → switched by hand');
const unj = build({what: 'audio-out', level: 0.62, open: opener()});
eq(line(unj), ['audio-headphones-symbolic', 'Unplugged Headphones', '62%'], 'unplugged: the headphones\' icon, the speakers\' level (Ethan, 2026-11-16)');
eq([unj.ttl, unj.priority, unj.compact], [TTL, PRIORITY.device, null], 'unplugged: 3 s, nothing on hover');
unj.onPress();
eq(opened, 'gnome-sound-panel.desktop', 'unplugged: a click opens Settings → Sound');
eq(line(build({what: 'audio-out', name: 'WH-1000XM4', device: true, level: 0.3})), ['audio-headphones-symbolic', 'Disconnected WH-1000XM4', '30%'],
    'gone: Bluetooth headphones by name');
eq(line(build({what: 'audio-out', name: 'Jack name', device: false, muted: true}))[1], 'Unplugged Headphones', 'unplugged: a jack never by the card\'s name');
eq(line(build({what: 'audio-out', device: true}))[1], 'Disconnected Headphones', 'gone: a device without a name');
eq(line(build({what: 'audio-out', muted: true}))[2], 'Muted', 'unplugged: the speakers muted said so');

// --- headphones plugged in, the sound still on the speakers ---------------------------------------------
let used = 0;
const offerEv = {what: 'offer', name: 'Headphones', current: 'Speakers', use: () => used++, open: opener()};
const of = build(offerEv);
eq(line(of), ['audio-headphones-symbolic', 'Headphones plugged in', null], 'offer: the headphones, plugged in, no volume (not playing there)');
eq([of.ttl, of.priority, of.minimalAction], [OFFER_TTL, PRIORITY.device, false], 'offer: a 3 s pill (Use is on its card), priority 35, no button on the pill');
const oc = planCompact(of).card;
eq([oc.title, oc.header.text, oc.tight, oc.picture.icon], ['Headphones', 'Sound on Speakers', true, 'audio-headphones-symbolic'],
    'offer: its compact says where the sound is now');
eq(of.actions.map(a => [a.id, a.label, a.icon]), [['use', 'Use', 'audio-headphones-symbolic']], 'offer: one button, Use');
of.onAction('use');
of.onAction('other');
eq(used, 1, 'offer: Use moves the output; another id does nothing');
of.onPress();
eq(opened, 'gnome-sound-panel.desktop', 'offer: a click opens Settings → Sound');
const bare = build({what: 'offer'});
eq([line(bare)[1], bare.compact, bare.actions.length, bare.onAction], ['Headphones plugged in', null, 0, null], 'offer: nothing to call → no compact, no button');
eq(planCompact(build({...offerEv, current: ' '})).card.header.text, null, 'offer: where the sound is unknown → no line');
eq(OFFER_TTL, 3000, 'offer: 3 s, as every flash');

// --- what is not ours ---------------------------------------------------------------------------------------
eq([adapter.device(null), adapter.device({}), adapter.device({what: 'usb'}), adapter.device({what: 'audio', output: 'hdmi'})],
    [null, null, null, null], 'adapter: nothing for an unknown event');

print('plugged: ok');
