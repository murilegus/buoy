// Run: gjs -m tests/phone.test.js   (pure: FEATURES M4 "Phone via GSConnect", parts 1 and 2; design/device "Điện thoại qua GSConnect")
import {PHONE_GROUPS, callOf, phoneGroups, replyOf, shortName, GSCONNECT_UUID, OTP_MS, batteryState, otpOf, phoneHomePage, phoneNote, phonePage, phoneSetup, phoneTile, plateOf, spacedCode, withPhones} from '../src/buoy@murilegus/lib/kit/model/phone.js';
import callAdapter, {GREEN, HIDE, MUTE} from '../src/buoy@murilegus/lib/modules/phone/adapter.js';
import {validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';
import {planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
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

// --- part 3: calls, replies, the Phone tab ------------------------------------------------------------
eq(callOf('abc123|ringing|Quỳnh Trâm'), {device: 'abc123', state: 'ringing', caller: 'Quỳnh Trâm'}, 'call: ringing, from the id');
eq(callOf('abc123|talking|+84 912 345 678'), {device: 'abc123', state: 'talking', caller: '+84 912 345 678'}, 'call: talking, a number');
eq(callOf('abc123|ringing|A|B'), {device: 'abc123', state: 'ringing', caller: 'A|B'}, 'call: a | in the name kept');
eq([callOf('abc123|missedCall|X'), callOf('abc|ringing|'), callOf('|ringing|X'), callOf('ringing|X'), callOf(null)], [null, null, null, null, null],
    'not a call: another event, no caller, no device, too short, nothing');
const U = '0f8fad5b-d9cb-469f-a165-70867728950e';
eq(replyOf(`abc123|0|com.zing.zalo|12|null|10123|${U}`), {device: 'abc123', uuid: U}, 'reply: the UUID at the end, the device at the start');
eq([replyOf('abc123|0|com.zing.zalo|12|null|10123'), replyOf(`|x|${U}`), replyOf(U), replyOf(null)], [null, null, null, null],
    'no reply: not repliable, no device, the uuid alone, nothing');
eq([shortName('Quỳnh Trâm'), shortName('Lan'), shortName('  '), shortName(null)], ['Trâm', 'Lan', '', ''], 'a reply\'s hint: the last word');
eq(PHONE_GROUPS.map(g => g.id), ['calls', 'messages', 'other'], 'the tab\'s columns');
{
    const now = 1_800_000_000_000;
    const g = phoneGroups([
        {id: 'm1', app: 'Zalo', title: 'Quỳnh Trâm', body: 'Tối nay họp', at: now - 60000, reply: {uuid: U}},
        {id: 'c1', app: 'Phone', title: 'Mẹ', body: 'Missed call', at: now - 600000},
        {id: 's1', app: 'Messages', title: 'Vietcombank', body: 'Ma OTP', at: now - 120000},
        {id: 'g1', app: 'Grab', title: 'Tài xế đã đến', body: '59X1-234.56', at: now - 30000},
        {id: 't1', app: 'Phone', title: 'Lan', body: 'On a call', at: now - 5000, call: {state: 'talking', caller: 'Lan'}, since: now - 222000},
    ], now);
    eq(g.map(x => x.cells.map(c => c.id)), [['t1', 'c1'], ['m1', 's1'], ['g1']], 'tab: the call first, then missed; messages newest first; the rest');
    eq(g[0].cells[0], {id: 't1', name: 'Lan', call: 'talking', detail: 'On a call', since: now - 222000}, 'tab: a call going on, its clock');
    eq(g[0].cells[1].detail, 'Missed call · 10 min', 'tab: a missed call, how long ago');
    eq([g[1].cells[0].reply, g[1].cells[1].reply, g[1].cells[0].detail], [true, false, 'Zalo · Tối nay họp'], 'tab: a message, can be answered or not');
    eq(phoneGroups([{id: 'r', app: 'Phone', title: 'X', at: now, call: {state: 'ringing', caller: 'X'}}], now)[0].cells[0].detail, 'Incoming call', 'tab: ringing');
    eq(phoneGroups(null).map(x => x.cells.length), [0, 0, 0], 'tab: nothing');
    eq(phoneGroups([{id: 'z', app: 'Zalo', title: 'Lan', body: 'hi', at: now}], now).map(x => x.cells.length), [0, 1, 0],
        'tab: a messaging app\'s, even one that cannot be answered: Messages');
}

// --- part 3: a call on the pill -------------------------------------------------------------------------
{
    class BytesIcon {}       // a Gio.Icon, not a plain object
    const photo = new BytesIcon();
    const did = [];
    const ev = o => ({
        id: 'k', caller: 'Quỳnh Trâm', state: 'ringing', photo: null, phoneName: 'Redmi Note 14', since: null,
        muted: false, hidden: false, canMute: true, mute: () => did.push('mute'), hide: () => did.push('hide'), ...o,
    });
    const r = callAdapter.call(ev());
    eq([r.text, r.leading, r.trailing, r.ttl, r.needsYou, r.alertStays], ['Quỳnh Trâm', {icon: 'call-start-symbolic', color: GREEN},
        {text: 'Incoming', color: GREEN}, 0, true, true], 'ringing: the green handset, the caller, "Incoming" green; it needs you, its card stays');
    eq([r.compact.card.app, r.compact.card.close, r.compact.card.tight, r.actions], ['Incoming Call · Redmi Note 14', HIDE, true,
        [{id: MUTE, label: 'Mute', icon: 'audio-volume-muted-symbolic'}]], 'ringing card: where, ×, Mute 12 under the head');
    r.onAction(MUTE);
    r.onAction(HIDE);
    r.onAction('other');
    eq(did, ['mute', 'hide'], 'Mute and × reach the source');
    const p = callAdapter.call(ev({photo}));
    eq([p.leading, p.compact.card.picture, p.compact.card.icon], [{art: photo, round: true, icon: 'phone-symbolic'}, {art: photo, round: true, icon: 'phone-symbolic'}, 'phone-symbolic'],
        'ringing with a photo: round, the phone on its corner');
    const m = callAdapter.call(ev({muted: true}));
    eq([m.trailing.text, m.actions, m.needsYou, m.alertStays], ['Silenced', [], false, false], 'muted: "Silenced", no Mute, the card may go');
    const h = callAdapter.call(ev({hidden: true}));
    eq([h.alertStays, h.actions.length], [false, 1], 'hidden (×): the card goes, the pill and Mute stay');
    eq(callAdapter.call(ev({canMute: false})).actions, [], 'GSConnect cannot silence it: no Mute');
    const t = callAdapter.call(ev({state: 'talking', since: 1000, photo}));
    eq([t.leading, t.trailing, t.needsYou, t.alertStays, t.compact.card.close, t.actions, t.compact.card.app],
        [{icon: 'call-start-symbolic', color: GREEN}, {elapsed: 1000, color: GREEN}, false, false, null, [], 'On a Call · Redmi Note 14'],
        'talking: the green handset, a clock from when it was answered, no button');
    eq(callAdapter.call(ev({state: 'talking', since: null})).trailing, null, 'talking, the start unknown: no clock');
    eq(callAdapter.call(ev({caller: '', phoneName: null})).compact.card.app, 'Incoming Call', 'no caller, no phone name');
    const a = validate({id: 'call:phone:k', kind: 'call', app: 'phone', ...t});
    eq([planMinimal(a).trailing?.type, planMinimal(a).trailing?.color, planCompact(validate({id: 'c', kind: 'call', app: 'phone', ...r})).card.header.icon.color],
        ['elapsed', GREEN, GREEN], 'planned: the clock and the handset keep their green');
}

print('phone: ok');

// --- part 2: an OTP code ------------------------------------------------------------------------------
eq(otpOf('Vietcombank: Ma OTP cua Quy khach la 482913. Khong chia se ma nay. Het han 18/11/2026'), '482913',
    'OTP: a bank SMS without accents, the code after the word, not the year');
eq(otpOf('G-482913 is your Google verification code.'), '482913', 'OTP: Google\'s, G- before it, the word after');
eq(otpOf('Your Grab code is 4829'), '4829', 'OTP: four digits');
eq(otpOf('Mã xác thực của bạn là 12345678'), '12345678', 'OTP: eight digits, accented words');
eq(otpOf('Mã OTP: 482913, giao dịch 2,000,000 VND lúc 08:30'), '482913', 'OTP: not the amount nor the time');
eq(otpOf('Tối nay họp lúc 8 giờ, phòng 1203'), null, 'no OTP word: a number alone is not a code');
eq(otpOf('Mã giao dịch: số dư 2,000,000 VND'), null, 'OTP word but no code: amounts are not codes');
eq(otpOf('OTP 0912345678'), null, 'ten digits (a phone number): not a code');
eq(otpOf('Ma OTP la 123'), null, 'three digits: too short');
eq([otpOf(null), otpOf('')], [null, null], 'no text, no code');
eq(otpOf('Dữ liệu được mã hoá từ 2026'), null, 'a year is not a code');
eq(otpOf('Pin dự phòng 5000mAh, mã giảm SALE2026'), null, 'digits in a word (5000mAh, SALE2026): not a code');
eq(otpOf('Smartcode 482913'), null, '"code" inside a word: not the word');
eq([spacedCode('482913'), spacedCode('4829'), spacedCode('12345678'), spacedCode('1234567')], ['482 913', '4829', '1234 5678', '1234 567'],
    'the code as read: two halves from six digits');
eq(OTP_MS, 30000, 'an OTP stays 30 s');

// --- part 2: a ride's licence plate (Grab, Be) -------------------------------------------------------
eq([plateOf('Nguyễn Văn An · Honda Vision trắng · 59X1-234.56'), plateOf('xe 30A-123.45 đang đến'), plateOf('Toyota Vios 51F-12345')],
    ['59X1-234.56', '30A-123.45', '51F-12345'], 'plates: with a dot, without');
eq([plateOf('xe 59-X1 234.56 màu trắng'), plateOf('gọi 0912345678'), plateOf('Nhập mã GRAB50'), plateOf(null)], ['59-X1 234.56', null, null, null],
    'plates: written apart; a phone number, a promo code: none');
