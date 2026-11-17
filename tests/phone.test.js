// Run: gjs -m tests/phone.test.js   (pure: FEATURES M4 "Phone via GSConnect", part 1; design/device "Điện thoại qua GSConnect")
import {GSCONNECT_UUID, batteryState, phoneNote, phonePage, phoneSetup, withPhones} from '../src/buoy@murilegus/lib/kit/model/phone.js';
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
eq([phoneSetup({installed: true, state: 1, paired: []}).status, phoneSetup({installed: true, state: 1, paired: ['  ']}).button],
    ['unpaired', 'Open GSConnect'], 'on, no phone paired: its settings');
eq(phoneSetup({installed: true, state: 1, paired: ['Redmi Note 14']}), {status: 'ready', text: 'Redmi Note 14', button: null},
    'ready: the phones paired, no button');

// --- battery ------------------------------------------------------------------------------------------
eq(batteryState([true, 'battery-good-charging-symbolic', 77, 3600]), {percentage: 77, charging: true}, 'battery: GSConnect\'s (bsii)');
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

print('phone: ok');
