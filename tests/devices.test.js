// Run: gjs -m tests/devices.test.js   (pure: the Device tab's plan, FEATURES M4 "Device tab", design/device)
import {
    CELL_H, CELL_GAP, TITLE_H, GROUPS, rowsFit, planDevices, batteryCell, modeCell, displayCell, audioCell, isWired,
    deviceGroups, displayPage, groupPage, wirelessCell, bluetoothPage, volumeMeter, sinkAddress,
} from '../src/buoy@murilegus/lib/kit/model/devices.js';
import {LEVEL} from '../src/buoy@murilegus/lib/kit/model/bluetooth.js';
import {STATE} from '../src/buoy@murilegus/lib/kit/model/power.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function ok(cond, msg) {
    if (!cond)
        throw new Error(msg);
}

// --- sizes (design/device "Kích thước") ---------------------------------------------------------
eq([CELL_H, CELL_GAP, TITLE_H], [58, 6, 18], 'sizes: cells 58, 6 apart, a title 18');
eq([rowsFit(212), rowsFit(276), rowsFit(308)], [3, 4, 4], 'rows: 3 at 1920 (212), 4 at 2560 (276), 4 at 3440 (308)');
eq([rowsFit(40), rowsFit(0), rowsFit(NaN)], [1, 1, 1], 'rows: never less than one');
eq(GROUPS.map(g => g.id), ['computer', 'wireless', 'plugged'], 'groups: This Computer, Wireless, Plugged In, in order');

// --- the columns ---------------------------------------------------------------------------------
const C = (id, name = id) => ({id, name, icon: 'x', value: null});
const laptop = planDevices([{id: 'computer', cells: [C('battery'), C('mode')]}, {id: 'wireless', cells: []}, {id: 'plugged', cells: [C('d1'), C('audio')]}], 3);
eq(laptop.map(c => [c.id, c.count, c.cells.length, c.more]), [['computer', 2, 2, null], ['plugged', 2, 2, null]],
    'columns: an empty group hidden, the others whole');
eq(laptop.map(c => c.title), ['This Computer', 'Plugged In'], 'columns: titled');
const many = planDevices([{id: 'plugged', cells: [C('a', 'ViewSonic'), C('b', 'Dell'), C('c', 'Logi C920'), C('d', 'USB 64 GB')]}], 3);
eq([many[0].count, many[0].cells.map(c => c.id), many[0].more.count, many[0].more.names],
    [4, ['a', 'b'], 2, 'Logi C920, USB 64 GB'], 'columns: past 3, two cells and "+2" with the rest\'s names');
eq(planDevices([{id: 'plugged', cells: [C('a'), C('b'), C('c'), C('d')]}], 4)[0].more, null, 'columns: 4 fit at 2560');
eq(planDevices([{id: 'plugged', cells: [C('a'), C('b')]}], 1)[0].cells.length, 0, 'columns: one row → only "+N"');
eq(planDevices([{id: 'plugged', cells: [C('a'), null, C('b')]}], 3)[0].count, 2, 'columns: no cell skipped as one');
eq([planDevices([], 3), planDevices(null, 3), planDevices([{id: 'other', cells: [C('a')]}], 3)], [[], [], []],
    'columns: nothing, or an unknown group: none');
eq(planDevices([{id: 'plugged', cells: [C('p')]}, {id: 'computer', cells: [C('b')]}], 3).map(c => c.id), ['computer', 'plugged'],
    'columns: in the groups\' order whatever comes first');

// --- This Computer --------------------------------------------------------------------------------
const B = o => ({present: true, percentage: 76, state: STATE.DISCHARGING, type: 2, rate: 11.05, ...o});
const bc = batteryCell(B());
eq([bc.id, bc.icon, bc.value, bc.name, bc.page, bc.open], ['battery', 'battery-good-symbolic', '76%', 'Battery · using 11 W', 'battery', 'gnome-power-panel.desktop'],
    'battery: on battery, its percentage and what it draws (Ethan, 2026-11-16)');
eq(batteryCell(B({state: STATE.CHARGING, percentage: 88, rate: 31.4})).name, 'Battery · charging 31 W', 'battery: charging, its watts');
eq([batteryCell(B({rate: null})).name, batteryCell(B({rate: 0.2})).name, batteryCell(B({state: STATE.FULL, percentage: 100})).name],
    ['Battery', 'Battery', 'Battery'], 'battery: no rate, a rate under half a watt, or full: just "Battery"');
eq(batteryCell(B({state: STATE.CHARGING})).icon, 'battery-good-charging-symbolic', 'battery: the charging icon');
eq([batteryCell(B({percentage: 140})).value, batteryCell(B({percentage: 99.6})).value], ['100%', '100%'], 'battery: clamped, rounded');
const ups = batteryCell({present: true, percentage: 100, state: STATE.DISCHARGING, type: 3, timeToEmpty: 1500, rate: 40});
eq([ups.name, ups.value], ['UPS · 25 min left', '100%'], 'UPS: a desktop\'s, its time left, no watts');
eq(batteryCell({present: true, percentage: 100, state: STATE.FULL, type: 3}).name, 'UPS', 'UPS: charged, just "UPS"');
eq([batteryCell(null), batteryCell({present: false, percentage: 50}), batteryCell(B({percentage: NaN}))], [null, null, null],
    'battery: none, not present or no percentage → no cell');

const mc = modeCell({active: 'balanced', list: ['power-saver', 'balanced', 'performance']});
eq([mc.id, mc.icon, mc.value, mc.name, mc.page], ['mode', 'power-profile-balanced-symbolic', 'Balanced', 'Power Mode', 'battery'],
    'mode: its icon and name, a click shows the battery page (Home\'s)');
eq([modeCell(null), modeCell({active: null, list: ['balanced']}), modeCell({active: 'turbo'})], [null, null, null], 'mode: no daemon, none in use, unknown → no cell');

// --- Plugged In -----------------------------------------------------------------------------------
const dc = displayCell({key: 'HDMI-1|VSC|VX2758|X1', name: 'ViewSonic 27″', size: '2560 × 1440', mode: 'join'});
eq([dc.id, dc.icon, dc.value, dc.name, dc.detail, dc.page, dc.open], ['display:HDMI-1|VSC|VX2758|X1', 'video-display-symbolic', 'Join', 'ViewSonic 27″', '2560 × 1440', 'display', 'gnome-display-panel.desktop'],
    'display: the way it is used as the value, the size as detail');
eq([displayCell({key: 'k', name: '', mode: 'weird'}).name, displayCell({key: 'k', name: 'X', mode: null}).value], ['Display', null], 'display: no name, no mode');

eq([isWired('alsa_output.usb-Logitech_Logi_USB_Headset-00.analog-stereo'), isWired('alsa_output.pci-0000_00_1f.3.HiFi__Headphones__sink'),
    isWired('bluez_output.88_92_CC_70_9C_22.1'), isWired(''), isWired(null)], [true, true, false, false, false], 'wired: USB and jack yes, Bluetooth no');
const ac = audioCell({output: 'headphones', name: 'Logi USB Headset', wired: true, level: 0.64, muted: false});
eq([ac.id, ac.icon, ac.value, ac.name, ac.page, ac.open], ['audio', 'audio-headphones-symbolic', '64%', 'Logi USB Headset', null, 'gnome-sound-panel.desktop'],
    'audio: wired headphones in use, the volume; a click opens Settings → Sound');
eq([audioCell({output: 'headphones', name: 'Buds', wired: false}), audioCell({output: 'speakers', wired: true}), audioCell(null)], [null, null, null],
    'audio: Bluetooth (Wireless\'s), speakers, nothing → no cell');
eq([audioCell({output: 'headphones', wired: true, muted: true}).value, audioCell({output: 'headphones', wired: true}).value, audioCell({output: 'headphones', wired: true}).name],
    ['Muted', null, 'Headphones'], 'audio: muted, no level, no name');
eq([ac.meter, audioCell({output: 'headphones', wired: true, level: 0.3, muted: true}).meter],
    [{type: 'bar', value: 0.64, label: '64%'}, {type: 'bar', value: 0.3, label: '30%', off: true}],
    'audio: the volume drawn as the HUD\'s bar, muted dimmed (Ethan, 2026-11-17: not read as a battery)');
eq([volumeMeter(1.3, false), volumeMeter(-0.2), volumeMeter(NaN), volumeMeter(null, true)],
    [{type: 'bar', value: 1, label: '130%'}, {type: 'bar', value: 0, label: '0%'}, null, null], 'volume: the bar clamps, the number does not; unknown none');

// --- Wireless -------------------------------------------------------------------------------------
eq([sinkAddress('bluez_output.88_92_CC_70_9C_22.1'), sinkAddress('bluez_output.88_92_cc_70_9c_22.a2dp-sink'), sinkAddress('alsa_output.pci'), sinkAddress(null)],
    ['88:92:CC:70:9C:22', '88:92:CC:70:9C:22', null, null], 'sink address: a Bluetooth sink\'s, none for the rest');
const wh = wirelessCell({id: '/org/bluez/hci0/dev_88', name: 'WH-1000XM4', kind: 'headphones', battery: {percentage: 80}, bluetooth: true});
eq([wh.id, wh.icon, wh.value, wh.meter, wh.name, wh.page, wh.open],
    ['wireless:/org/bluez/hci0/dev_88', 'audio-headphones-symbolic', '80%', {type: 'battery', value: 0.8, label: '80%'}, 'WH-1000XM4', 'bluetooth', 'gnome-bluetooth-panel.desktop'],
    'wireless: a Bluetooth device, its battery drawn at its level; a click shows its page');
eq(wirelessCell({id: 'x', name: 'WH-1000XM4', kind: 'headphones', bluetooth: true, playing: true}).name, 'WH-1000XM4 · Playing',
    'wireless: the sound on it says so under its name');
const mx = wirelessCell({id: '/org/freedesktop/UPower/devices/mouse_hidpp', name: 'MX Master 3S', kind: 'mouse', battery: {level: LEVEL.HIGH}, bluetooth: false});
eq([mx.icon, mx.value, mx.meter, mx.page, mx.open], ['input-mouse-symbolic', null, {type: 'battery', value: 0.8}, null, 'gnome-power-panel.desktop'],
    'wireless: a 2.4 GHz mouse, a coarse battery; a click opens Settings → Power');
const ph = wirelessCell({id: 'p', name: 'Pixel 8', kind: 'phone', bluetooth: true});
eq([ph.icon, ph.value, ph.meter], ['phone-symbolic', null, null], 'wireless: a phone without a battery, its name only');
const wg = deviceGroups({
    wireless: [
        {id: 'a', name: 'WH-1000XM4', kind: 'headphones', battery: {percentage: 80}, bluetooth: true},
        {id: 'b', name: 'MX Master 3S', kind: 'mouse', battery: {percentage: 15}, bluetooth: true},
        {id: 'c', name: 'Pixel 8', kind: 'phone', bluetooth: true},
    ],
});
eq(wg[1].cells.map(c => c.name), ['MX Master 3S', 'WH-1000XM4', 'Pixel 8'], 'groups: Wireless, a low battery first (design/device)');
eq(planDevices(wg, 3).map(c => c.title), ['Wireless'], 'groups: Wireless alone shown when it alone has devices');

const bp = bluetoothPage({name: 'WH-1000XM4', kind: 'headphones', address: '88:92:CC:70:9C:22', battery: {percentage: 80}}, {level: 0.64, muted: false});
eq([bp.title, bp.battery, bp.rows.map(r => r.id), bp.rows[0].meter, bp.settings.name],
    ['WH-1000XM4', {type: 'battery', value: 0.8, label: '80%'}, ['volume', 'info', 'disconnect'], {type: 'bar', value: 0.64, label: '64%'}, 'Bluetooth Settings'],
    'bluetooth page: the battery at the head, the volume while it plays, what it is, Disconnect, Bluetooth Settings (Ethan, 2026-11-17)');
eq(bp.rows[1], {id: 'info', icon: 'audio-headphones-symbolic', name: 'Headphones', value: '88:92:CC:70:9C:22'},
    'bluetooth page: its type and address, as Settings → Bluetooth (Ethan, 2026-11-17)');
const rn = bluetoothPage({name: 'Redmi Note 14', kind: 'phone', address: 'F8:43:EF:98:5A:0D'});
eq([rn.rows.map(r => r.id), rn.rows[0].name], [['info', 'disconnect'], 'Phone'], 'bluetooth page: not playing, no volume row');
eq([bluetoothPage({name: 'X', kind: 'gaming'}).rows[0], bluetoothPage({name: 'X', kind: 'weird'}).rows[0].name],
    [{id: 'info', icon: 'input-gaming-symbolic', name: 'Game Controller', value: null}, 'Device'], 'bluetooth page: no address; an unknown kind is a "Device"');
eq([bluetoothPage({name: 'Pixel 8'}).battery, bluetoothPage({name: ''}).title, bluetoothPage(null)], [null, 'Bluetooth device', null],
    'bluetooth page: no battery, no name, nothing');

// --- the groups -------------------------------------------------------------------------------------
const g = deviceGroups({
    battery: B(), modes: {active: 'balanced', list: ['balanced']},
    displays: [{key: 'a', name: 'ViewSonic 27″', mode: 'join'}], audio: {output: 'headphones', name: 'Logi USB Headset', wired: true, level: 0.6},
});
eq(g.map(x => [x.id, x.cells.map(c => c.id)]), [['computer', ['battery', 'mode']], ['wireless', []], ['plugged', ['display:a', 'audio']]],
    'groups: battery then mode; displays then sound');
eq(deviceGroups({modes: {active: 'balanced', list: ['balanced']}})[0].cells.map(c => c.id), ['mode'], 'groups: a desktop without a battery, only its mode');
eq(planDevices(deviceGroups(), 3), [], 'groups: nothing known → no column (the tab says so)');

// --- pages -----------------------------------------------------------------------------------------
const dp = displayPage({name: 'ViewSonic 27″', size: '2560 × 1440', mode: 'mirror', modes: ['join', 'mirror', 'external']});
eq([dp.title, dp.end, dp.rows.map(r => [r.id, r.name, r.selected]), dp.settings.name],
    ['ViewSonic 27″', '2560 × 1440', [['join', 'Join', false], ['mirror', 'Mirror', true], ['external', 'External Only', false]], 'Display Settings'],
    'display page: the modes, the one in use chosen, Display Settings');
eq([displayPage({name: 'X', modes: []}), displayPage(null)], [null, null], 'display page: none when Mutter cannot switch');
const gp = groupPage(many[0]);
eq([gp.title, gp.rows.map(r => r.id)], ['Plugged In · 4', ['a', 'b', 'c', 'd']], '+N page: the whole group, its count');
ok(groupPage(laptop[0]).rows.length === 2, '+N page: a group without "+N" lists its cells');

print('devices: ok');
