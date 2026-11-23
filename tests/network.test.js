// Run: gjs -m tests/network.test.js   (pure: FEATURES M4 "VPN / Wi-Fi / captive portal"; design/compact "Mạng")
import adapter, {DISMISS, SIGN_IN} from '../src/buoy@murilegus/lib/modules/network/adapter.js';
import {FLAKY, LIMITED_WAIT, QUIET, TTL, changes, iconOf, nameOr, wifiIcon} from '../src/buoy@murilegus/lib/modules/network/model.js';
import {planCompact, planMinimal} from '../src/buoy@murilegus/lib/kit/model/presentation.js';
import {PRIORITY, tierOf, validate} from '../src/buoy@murilegus/lib/kit/model/activity.js';

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg}: expected ${e}, got ${a}`);
}

eq([TTL, QUIET, FLAKY, LIMITED_WAIT], [3000, 15000, 3000, 5000], 'a flash 3 s; quiet 15 s; a drop under 3 s; 5 s of no Internet');
eq(PRIORITY.network, PRIORITY.device, 'as the other things plugged in or connected');

// --- icons --------------------------------------------------------------------------------------------
eq([100, 81, 80, 56, 55, 31, 30, 6, 5, 0, null].map(wifiIcon), [
    'network-wireless-signal-excellent-symbolic', 'network-wireless-signal-excellent-symbolic', 'network-wireless-signal-good-symbolic',
    'network-wireless-signal-good-symbolic', 'network-wireless-signal-ok-symbolic', 'network-wireless-signal-ok-symbolic',
    'network-wireless-signal-weak-symbolic', 'network-wireless-signal-weak-symbolic', 'network-wireless-signal-none-symbolic',
    'network-wireless-signal-none-symbolic', 'network-wireless-signal-good-symbolic',
], 'Wi-Fi strengths as Shell\'s levels (80, 55, 30, 5)');
eq([iconOf({type: 'wired'}), iconOf({type: 'other'}), iconOf(null)], ['network-wired-symbolic', 'network-wired-symbolic', 'network-offline-symbolic'],
    'wired, a modem or the like, none');
eq([nameOr(' Highlands ', 'x'), nameOr('', 'x'), nameOr(null, 'x')], ['Highlands', 'x', 'x'], 'a name, or the fallback');

// --- what changed ---------------------------------------------------------------------------------------
const wifi = {id: '/a/1', type: 'wifi', name: 'Highlands Coffee', strength: 70};
const home = {id: '/a/2', type: 'wifi', name: 'Nhà', strength: 90};
const wired = {id: '/a/3', type: 'wired', name: 'Wired connection 1', strength: null};
const vpn = {id: '/a/9', name: 'Công ty'};
const R = (primary, vpns = []) => ({primary, vpns});
eq(changes(null, R(wifi)), [], 'the first reading: nothing to say');
eq(changes(R(null), R(wifi)), [{what: 'connected', type: 'wifi', name: 'Highlands Coffee', strength: 70}], 'Wi-Fi connected');
eq(changes(R(wifi), R(home)).map(e => e.name), ['Nhà'], 'another network: one flash, the new one');
eq(changes(R(wifi), R({...wifi, strength: 20})), [], 'the same connection (roaming, the signal): nothing');
eq(changes(R(wifi), R(null)), [{what: 'offline'}], 'none left: offline');
eq(changes(R(wifi), R(wired)).map(e => e.type), ['wired'], 'the cable plugged: wired');
eq(changes(R(wifi), R(wifi, [vpn])), [{what: 'vpn-on', name: 'Công ty'}], 'VPN on');
eq(changes(R(wifi, [vpn]), R(wifi)), [{what: 'vpn-off', name: 'Công ty'}], 'VPN off');
eq(changes(R(wifi, [vpn]), R(home, [vpn])).map(e => e.what), ['connected'], 'the VPN stays: only the network');
eq(changes(R(null), R(null)), [], 'nothing, still nothing');

// --- the adapter ----------------------------------------------------------------------------------------
const a = ev => adapter.network(ev);
const c = a({what: 'connected', type: 'wifi', name: 'Highlands Coffee', strength: 70});
eq([c.leading, c.text, c.trailing, c.ttl, c.compact, c.sizeHint], ['network-wireless-signal-good-symbolic', 'Highlands Coffee', null, 3000, null, 'wide'],
    'Wi-Fi: its strength, its name, 3 s, no compact');
eq([a({what: 'connected', type: 'wired', name: ''}).text, a({what: 'connected', type: 'wired', name: 'Wired connection 1'}).text],
    ['Wired', 'Wired connection 1'], 'wired: its name, else "Wired"');
eq(a({what: 'connected', type: 'wifi', name: 'Highlands Coffee', shared: true}).text, 'Wi-Fi', 'screen shared: no network name');
const ni = a({what: 'no-internet', type: 'wifi', name: 'Highlands Coffee', strength: 70});
eq([ni.text, ni.trailing], ['Highlands Coffee', {text: 'No Internet'}], 'connected, no Internet');
eq([a({what: 'offline'}).leading, a({what: 'offline'}).text], ['network-offline-symbolic', 'Offline'], 'offline');
eq([a({what: 'vpn-on', name: 'Công ty'}).text, a({what: 'vpn-on', name: 'Công ty', shared: true}).text, a({what: 'vpn-off', name: 'Công ty'}).text],
    ['VPN · Công ty', 'VPN', 'VPN Off'], 'VPN on (shared: no name), off');
eq([a({what: 'failed', name: 'Highlands Coffee'}).text, a({what: 'failed', name: ''}).text, a({what: 'failed', name: 'X', shared: true}).text],
    ['Couldn\'t Connect to Highlands Coffee', 'Couldn\'t Connect', 'Couldn\'t Connect'], 'failed: in place of GNOME\'s "Connection failed"');
eq(a({what: 'nope'}), null, 'an unknown event: nothing');

const did = [];
const p = a({what: 'portal', type: 'wifi', name: 'Highlands Coffee', strength: 70, signIn: () => did.push('in'), dismiss: () => did.push('x')});
eq([p.text, p.trailing, p.ttl, p.compact.card.title, p.compact.card.app, p.compact.card.picture, p.compact.card.close],
    ['Sign In to Network', {text: 'Highlands Coffee'}, 0, 'Sign In to Network', 'Highlands Coffee',
        {icon: 'network-wireless-signal-good-symbolic', backdrop: true}, DISMISS], 'portal: stays, the card names the network');
eq(p.actions, [{id: SIGN_IN, label: 'Sign In', main: true}], 'Sign In (cream)');
p.onPress();
p.onAction(SIGN_IN);
p.onAction(DISMISS);
eq(did, ['in', 'in', 'x'], 'a click and Sign In open GNOME\'s sign-in; × dismisses');
eq(a({what: 'portal', type: 'wifi', name: 'Highlands Coffee', shared: true}).trailing, {text: 'Wi-Fi'}, 'portal, shared: no name');

// --- through the kit ----------------------------------------------------------------------------------------
const v = validate({...c, id: 'network:system:flash', kind: 'network', source: 'network'});
eq([tierOf(v), planMinimal(v).leading.icon, planMinimal(v).text], [2, 'network-wireless-signal-good-symbolic', 'Highlands Coffee'], 'a flash: minimal');
const pv = validate({...p, id: 'network:system:portal', kind: 'network', source: 'network'});
eq(planCompact(pv)?.card?.title, 'Sign In to Network', 'the portal is a card');

print('network: ok');
