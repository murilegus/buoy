import {NetworkSource} from './source.js';
import adapter from './adapter.js';

// The network (FEATURES M4 "VPN / Wi-Fi / captive portal"; design/compact "Mạng", 2026-11-23,
// Ethan): a flash when Wi-Fi, a cable or a VPN connects or drops, in place of GNOME's "Connection
// failed"; a network that asks you to sign in, in place of "Sign in to Network". No tab.
export default {id: 'network', kinds: ['network'], noTab: true, source: NetworkSource, adapter};
