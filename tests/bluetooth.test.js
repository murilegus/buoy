// Run: gjs -m tests/bluetooth.test.js   (pure: FEATURES M4 "Bluetooth device", design/device "Không dây")
import {
    BATTERY_TYPE, BT_TYPE, LEVEL, UP_KIND, LOW, batteryOf, bluetoothBattery, btKind, connectedOf, diffConnected, kindIcon, sortWireless, upKind, upowerOnly,
} from '../src/buoy@murilegus/lib/kit/model/bluetooth.js';
import adapter, {TTL} from '../src/buoy@murilegus/lib/modules/bluetooth/adapter.js';
import {validate, PRIORITY} from '../src/buoy@murilegus/lib/kit/model/activity.js';
import {planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function ok(cond, msg) {
    if (!cond)
        throw new Error(msg);
}

// --- kinds and icons ------------------------------------------------------------------------------
eq([BT_TYPE.HEADSET, BT_TYPE.HEADPHONES, BT_TYPE.KEYBOARD, BT_TYPE.MOUSE, BT_TYPE.SPEAKERS], [32, 64, 256, 512, 1048576],
    'GnomeBluetooth.Type bits as bluetooth-enums.h has them (the typelib\'s values, 2026-11-17)');
eq([UP_KIND.MOUSE, UP_KIND.KEYBOARD, UP_KIND.GAMING_INPUT, UP_KIND.HEADSET, LEVEL.NONE, LEVEL.LOW, LEVEL.FULL], [5, 6, 12, 17, 1, 3, 8],
    'UPower DeviceKind / DeviceLevel as up-types.h has them');
eq([btKind(BT_TYPE.HEADSET), btKind(BT_TYPE.HEADPHONES), btKind(BT_TYPE.OTHER_AUDIO), btKind(BT_TYPE.SPEAKERS), btKind(BT_TYPE.KEYBOARD),
    btKind(BT_TYPE.MOUSE), btKind(BT_TYPE.JOYPAD), btKind(BT_TYPE.TABLET), btKind(BT_TYPE.PHONE), btKind(1), btKind(undefined)],
['headphones', 'headphones', 'headphones', 'speakers', 'keyboard', 'mouse', 'gaming', 'tablet', 'phone', 'other', 'other'],
'bluetooth kinds: by its type; any or none is "other"');
eq([upKind(UP_KIND.MOUSE), upKind(UP_KIND.KEYBOARD), upKind(UP_KIND.GAMING_INPUT), upKind(UP_KIND.PEN), upKind(UP_KIND.HEADSET), upKind(2), upKind(3), upKind(1)],
    ['mouse', 'keyboard', 'gaming', 'tablet', 'headphones', null, null, null], 'UPower kinds: peripherals only (not the battery, a UPS, the charger)');
eq(['headphones', 'speakers', 'keyboard', 'mouse', 'gaming', 'phone', 'weird'].map(kindIcon),
    ['audio-headphones-symbolic', 'audio-speakers-symbolic', 'input-keyboard-symbolic', 'input-mouse-symbolic', 'input-gaming-symbolic',
        'phone-symbolic', 'bluetooth-active-symbolic'], 'icons: by kind, Bluetooth\'s for the rest');

// --- battery --------------------------------------------------------------------------------------
eq(batteryOf({percentage: 80}), {value: 0.8, label: '80%', low: false}, 'battery: a percentage, drawn and said');
eq([batteryOf({percentage: LOW}).low, batteryOf({percentage: LOW + 1}).low, batteryOf({percentage: 140}).label, batteryOf({percentage: 79.6}).label],
    [true, false, '100%', '80%'], 'battery: low at or under 20 %; clamped, rounded');
eq([batteryOf({level: LEVEL.HIGH}), batteryOf({level: LEVEL.LOW}), batteryOf({level: LEVEL.CRITICAL}).low],
    [{value: 0.8, label: null, low: false}, {value: 0.2, label: null, low: true}, true], 'battery: a coarse level drawn, no number');
eq([bluetoothBattery(BATTERY_TYPE.PERCENTAGE, 80, 0), bluetoothBattery(BATTERY_TYPE.COARSE, 0, LEVEL.HIGH), bluetoothBattery(BATTERY_TYPE.NONE, 0, 0)],
    [{percentage: 80}, {level: LEVEL.HIGH}, null], 'bluetooth battery: a percentage, a coarse level, or none, as gnome-bluetooth tells it');
eq([batteryOf(null), batteryOf({}), batteryOf({level: LEVEL.NONE}), batteryOf({percentage: NaN})], [null, null, null, null], 'battery: none told');

// --- connected, came and went ---------------------------------------------------------------------
const D = (id, o = {}) => ({id, name: id.toUpperCase(), kind: 'mouse', connected: true, ...o});
const first = connectedOf([D('a'), D('b', {connected: false}), null, D('', {})]);
eq([...first.keys()], ['a'], 'connected: only the connected, with an id');
eq(diffConnected(null, first), {connected: [], disconnected: []}, 'first reading (Buoy on, the adapter just on): nothing said');
const next = connectedOf([D('a', {connected: false}), D('c')]);
eq([diffConnected(first, next).connected.map(d => d.id), diffConnected(first, next).disconnected.map(d => d.id)], [['c'], ['a']],
    'came and went between two readings');
eq(diffConnected(next, next), {connected: [], disconnected: []}, 'nothing changed, nothing said');

// --- the Wireless column's order and UPower's own -------------------------------------------------
const order = sortWireless([D('hp', {battery: {percentage: 80}}), D('ms', {battery: {percentage: 15}}), D('ph'), D('kb', {battery: {level: LEVEL.LOW}}), D('x', {name: ' '})]);
eq(order.map(d => d.id), ['ms', 'kb', 'hp', 'ph'], 'order: low batteries first, the rest as they came; a nameless one dropped');
const ups = [
    {id: 'u1', kind: 'mouse', nativePath: 'hidpp_battery_0', serial: '4087-a1-b2'},
    {id: 'u2', kind: 'headphones', nativePath: '/org/bluez/hci0/dev_88_92_CC_70_9C_22'},
    {id: 'u3', kind: 'keyboard', nativePath: 'hid-88:92:cc:70:9c:23-battery'},
    {id: 'u4', kind: null, nativePath: 'BAT0'},
    {id: 'u5', kind: 'mouse', nativePath: 'hid-11:22:33:44:55:66-battery'},
];
eq(upowerOnly(ups, ['88:92:CC:70:9C:23']).map(u => u.id), ['u1', 'u5'],
    'UPower: a 2.4 GHz receiver\'s kept; BlueZ\'s own and a known Bluetooth address dropped (Quick Settings lists those); not a peripheral dropped');
eq(upowerOnly(null, null), [], 'UPower: nothing');

// --- the flash --------------------------------------------------------------------------------------
let opened = null;
const open = id => {
    opened = id;
};
const build = ev => {
    const d = adapter.bluetooth(ev);
    return d ? validate({id: 'bluetooth:system:device', kind: 'bluetooth', app: 'system', ...d}) : null;
};
const hp = build({what: 'connected', name: 'WH-1000XM4', kind: 'headphones', battery: {percentage: 80}, open});
const pm = planMinimal(hp);
eq([pm.leading?.icon, pm.text, pm.trailing], ['audio-headphones-symbolic', 'WH-1000XM4', {type: 'battery', value: 0.8, label: '80%'}],
    'connected: its kind\'s icon, its name, its battery drawn with its number (Ethan, 2026-11-17)');
eq([hp.ttl, hp.priority, hp.kind], [TTL, PRIORITY.device, 'bluetooth'], 'connected: a 3 s flash at the devices\' priority');
eq(TTL, 3000, 'every telling flash 3 s (Ethan, 2026-11-16)');
hp.onPress();
eq(opened, 'gnome-bluetooth-panel.desktop', 'a click: Settings → Bluetooth');
eq(planMinimal(build({what: 'connected', name: 'K380', kind: 'keyboard', battery: {level: LEVEL.NORMAL}})).trailing, {type: 'battery', value: 0.55},
    'connected: a coarse battery, no number');
eq(planMinimal(build({what: 'connected', name: 'Redmi Note 14', kind: 'phone', battery: {percentage: 80}})).trailing,
    {type: 'battery', value: 0.8, label: '80%'}, 'a phone telling its battery (in steps of 20): said as it comes, no "~" (Ethan, 2026-11-17)');
const phone = build({what: 'connected', name: 'Pixel 8', kind: 'phone'});
eq([planMinimal(phone).leading?.icon, phone.trailing], ['phone-symbolic', null], 'a phone: its name only (no battery over Bluetooth; GSConnect brings it)');
const gone = build({what: 'disconnected', name: 'WH-1000XM4', kind: 'headphones', battery: {percentage: 80}});
eq([planMinimal(gone).text, gone.trailing], ['Disconnected WH-1000XM4', null], 'disconnected: said so, no battery');
eq(planMinimal(build({what: 'connected', name: '  ', kind: 'nope'})).text, 'Bluetooth device', 'no name: "Bluetooth device"');
const long = 'A very long Bluetooth headset name that goes on and on';
eq(planMinimal(build({what: 'connected', name: long, kind: 'headphones'})).text, long, 'long name: not cut in the adapter');
eq([adapter.bluetooth({what: 'paired'}), adapter.bluetooth(null)], [null, null], 'anything else: nothing');
ok(build({what: 'connected', name: 'X', kind: 'mouse'}).onPress === null, 'no opener: no click');

print('bluetooth: ok');
