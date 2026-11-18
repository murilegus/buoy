// Run: gjs -m tests/phone.test.js   (pure: FEATURES M4 "Phone via GSConnect", part 1; design/device "Điện thoại qua GSConnect")
import {GSCONNECT_UUID, batteryState, phoneHomePage, phoneNote, phonePage, phoneSetup, phoneTile, withPhones} from '../src/buoy@murilegus/lib/kit/model/phone.js';
import {wirelessCell} from '../src/buoy@murilegus/lib/kit/model/devices.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

eq(GSCONNECT_UUID, 'gsconnect@andyholmes.github.io', 'GSConnect\'s UUID');

// --- setting it up (prefs' Phone row) ---------------------------------------------------------------
eq([phoneSetup(null).status, phoneSetup({installed: false}).button], ['missing', 'Install GSConnect'], 'missing: install it (its EGO page)');
eq([phoneSetup({installed: true, state: 2}).status, phoneSetup({installed: true, state: 3}).button, phoneSetup({installed: true}).status],
    ['off', 'Turn On GSConnect', 'off'], 'installed, not active (off, an error, unknown): turn it on');
eq([phoneSetup({installed: true, state: 1, paired: []}).status, phoneSetup({installed: true, state: 1, paired: [{name: '  ', connected: true}]}).button],
    ['unpaired', 'Open GSConnect'], 'on, no phone paired: its settings');
eq(phoneSetup({installed: true, state: 1, paired: [{name: 'Redmi Note 14', connected: true}]}),
    {status: 'ready', text: 'Redmi Note 14 · connected', button: null}, 'ready: the phone connected, no button');
const away = phoneSetup({installed: true, state: 1, paired: [{name: 'Redmi Note 14', connected: false}]});
eq([away.status, away.button, away.text.startsWith('Redmi Note 14 · not connected')], ['away', 'Open GSConnect', true],
    'paired but not connected: said so, not ready (Ethan, 2026-11-18: it showed as ready)');
eq(phoneSetup({installed: true, state: 1, paired: [{name: 'Old', connected: false}, {name: 'Redmi', connected: true}]}).text,
    'Redmi · connected', 'two paired: the connected one');

// --- battery ------------------------------------------------------------------------------------------
eq(batteryState([true, 'battery-good-charging-symbolic', 77, 3600]), {percentage: 77, charging: true, time: 3600}, 'battery: GSConnect\'s (bsii), its time estimate');
eq(batteryState([false, 'x', 50, -1]).time, 0, 'battery: no estimate, 0');
eq([batteryState([false, 'x', -1, 0]), batteryState(null), batteryState([false, 'x', 'n', 0])], [null, null, null], 'battery: unknown level, nothing');
eq(batteryState([false, 'x', 120, 0]).percentage, 100, 'battery: clamped');

// --- the Wireless column ---------------------------------------------------------------------------
const bt = [{id: '/org/bluez/rn', name: 'Redmi Note 14', kind: 'phone', battery: {percentage: 80}, bluetooth: true},
    {id: '/org/bluez/hp', name: 'WH-1000XM4', kind: 'headphones', bluetooth: true}];
const phones = [{id: 'abc', name: 'redmi note 14 ', connected: true, paired: true, battery: {percentage: 77, charging: true}},
    {id: 'off', name: 'Old Phone', connected: false, paired: true, battery: null}];
const w = withPhones(bt, phones);
eq(w.map(d => [d.id, d.name, d.battery?.percentage ?? null]), [['gsconnect:abc', 'redmi note 14 ', 77], ['/org/bluez/hp', 'WH-1000XM4', null]],
    'phones: one cell for the phone, GSConnect\'s exact battery over Bluetooth\'s steps (Ethan, 2026-11-17); not connected: none');
eq([withPhones(bt, []).length, withPhones(null, null).length], [2, 0], 'phones: none, the column as it was');
const pc = wirelessCell(w[0]);
eq([pc.icon, pc.value, pc.name, pc.page, pc.open], ['phone-symbolic', '77%', 'redmi note 14  · Charging', 'phone', null],
    'phone cell: its battery, charging said under its name, a click shows its page');
eq(wirelessCell({...w[0], charging: false}).name, 'redmi note 14 ', 'phone cell: not charging, just its name');
const pp = phonePage({name: 'Redmi Note 14'});
eq([pp.title, pp.rows.map(r => [r.id, r.icon, r.name]), pp.settings.name],
    ['Redmi Note 14', [['ring', 'find-location-symbolic', 'Find My Phone']], 'GSConnect Settings'], 'phone page: Find My Phone, GSConnect\'s settings');
eq([phonePage(null), phonePage({name: ''}).title], [null, 'Phone'], 'phone page: none, no name');

// --- a phone's notification (GSConnect's notification.js _receiveNotification) ---------------------
eq(phoneNote('Zalo', 'Quỳnh Trâm: Tối nay họp lúc 8 giờ nhé'), {app: 'Zalo', title: 'Quỳnh Trâm', body: 'Tối nay họp lúc 8 giờ nhé'},
    'notification: the app as GSConnect\'s title, the sender and text from "sender: text"');
eq(phoneNote('Grab', 'Your driver is arriving'), {app: 'Grab', title: 'Grab', body: 'Your driver is arriving'}, 'notification: the app naming itself, the text alone');
eq(phoneNote('Quỳnh Trâm', 'Ok nhé', 'sms-symbolic'), {app: 'Messages', title: 'Quỳnh Trâm', body: 'Ok nhé'}, 'an SMS: Messages, the contact as the title');
eq(phoneNote('Mẹ', 'Missed call', 'call-missed-symbolic').app, 'Phone', 'a missed call: Phone');
eq(phoneNote('', ''), {app: 'Phone', title: 'Phone', body: ''}, 'notification: nothing, "Phone"');
eq(phoneNote('Bank', ': 123456 is your code').title, 'Bank', 'notification: a body starting with ": " is not split');

// --- Home's tile (design/home "Ô điện thoại") --------------------------------------------------------
const P = o => ({id: 'abc', name: 'Redmi Note 14', connected: true, paired: true, battery: {percentage: 77, charging: true, time: 2400}, ...o});
eq(phoneTile(P()), {icon: 'phone-symbolic', value: '77%', caption: 'Redmi Note 14', cornerIcon: 'battery-good-charging-symbolic', detail: ['Full in 40 min', 'Charging']},
    'tile: the phone\'s battery, its name; charging in the corner; wide: the time and the state (Ethan, 2026-11-17)');
eq(phoneTile(P({battery: {percentage: 54, charging: false, time: 32400}})), {icon: 'phone-symbolic', value: '54%', caption: 'Redmi Note 14', detail: ['9 h left']},
    'tile: on battery, the corner empty, the time left');
eq([phoneTile(P({battery: {percentage: 15, charging: false, time: 0}})).cornerIcon, phoneTile(P({battery: {percentage: 15, charging: false, time: 0}})).detail],
    ['battery-low-symbolic', ['Low battery']], 'tile: low under 20 %, no estimate');
eq([phoneTile(P({connected: false})), phoneTile(P({battery: null})), phoneTile(null)], [null, null, null],
    'tile: not connected, no battery, nothing: no tile (nothing said)');
eq(phoneTile(P({name: ''})).caption, 'Phone', 'tile: no name, "Phone"');
const hp = phoneHomePage(P());
eq([hp.title, hp.end, hp.rows.map(r => [r.id, r.name, r.value, r.plain, r.selected]), hp.settings.name],
    ['Redmi Note 14 · 77% · charging', 'full in 40 min', [['ring', 'Find My Phone', 'Rings it', true, false]], 'GSConnect Settings'],
    'tile\'s page: its battery in the title, the time at the end, Find My Phone, GSConnect\'s settings');
eq([phoneHomePage(P({battery: null})).title, phoneHomePage(P({connected: false}))], ['Redmi Note 14', null], 'tile\'s page: no battery, not connected');

print('phone: ok');
