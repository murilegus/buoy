/**
 * network adapter (FEATURES M4 "VPN / Wi-Fi / captive portal"; design/compact "Mạng", 2026-11-23,
 * Ethan). Pure: the source reads Shell's NM.Client and hands the facts here.
 *
 * Event: {what: 'connected', type, name, strength, shared}       Wi-Fi or wired, new
 *        {what: 'no-internet', type, name, strength, shared}     connected, no Internet (not a portal)
 *        {what: 'offline'}                                       no network left
 *        {what: 'vpn-on' | 'vpn-off', name, shared}
 *        {what: 'failed', name, shared}                          in place of GNOME's "Connection failed"
 *        {what: 'portal', type, name, strength, shared, signIn, dismiss}  in place of "Sign in to Network"
 */
import {TTL, iconOf, nameOr} from './model.js';

export const SIGN_IN = 'sign-in';
export const DISMISS = 'dismiss';

// the network's name; a shared or recorded screen gets the kind of network only
function named(ev, fallback) {
    return ev.shared === true ? fallback : nameOr(ev.name, fallback);
}

const KIND_NAMES = {wifi: 'Wi-Fi', wired: 'Wired'};
const kindName = ev => KIND_NAMES[ev.type] ?? 'Network';

function flash(leading, text, trailing = null) {
    return {leading, text, trailing, sizeHint: 'wide', ttl: TTL, compact: null, expanded: null, actions: []};
}

function portal(ev) {
    const name = named(ev, kindName(ev));
    const icon = iconOf(ev);
    return {
        leading: icon,
        text: 'Sign In to Network',
        trailing: {text: name},
        compact: {
            card: {icon: null, picture: {icon, backdrop: true}, title: 'Sign In to Network', app: name, at: null, body: null, close: DISMISS, actionsOnHover: false, tight: true},
        },
        expanded: null,
        actions: [{id: SIGN_IN, label: 'Sign In', main: true}],
        minimalAction: false,
        // it stays till signed in or left (the source ends it)
        ttl: 0,
        pressFirst: true,
        onPress: ev.signIn ?? null,
        onAction: id => {
            if (id === SIGN_IN)
                ev.signIn?.();
            else if (id === DISMISS)
                ev.dismiss?.();
        },
    };
}

export default {
    network(ev) {
        let out;
        switch (ev.what) {
        case 'connected':
            out = flash(iconOf(ev), named(ev, kindName(ev)));
            break;
        case 'no-internet':
            out = flash(iconOf(ev), named(ev, kindName(ev)), {text: 'No Internet'});
            break;
        case 'offline':
            out = flash('network-offline-symbolic', 'Offline');
            break;
        case 'vpn-on':
            out = flash('network-vpn-symbolic', ev.shared === true ? 'VPN' : `VPN · ${nameOr(ev.name, 'On')}`);
            break;
        case 'vpn-off':
            out = flash('network-vpn-disabled-symbolic', 'VPN Off');
            break;
        case 'failed':
            out = flash('network-error-symbolic', ev.shared === true || !nameOr(ev.name, '') ? 'Couldn\'t Connect' : `Couldn't Connect to ${ev.name.trim()}`);
            break;
        case 'portal':
            out = portal(ev);
            break;
        default:
            return null;
        }
        return {...out, attributes: {what: ev.what}};
    },
};
