import {CallSource} from './source.js';
import adapter from './adapter.js';
import {PhoneTab} from './tab.js';

// The phone through GSConnect, part 3 (FEATURES M4 "Phone via GSConnect"; design/device "Cuộc
// gọi và tab Điện thoại", 2026-11-18, Ethan): a call on the phone on the pill, and the Phone tab —
// in ⋯ as Timer, on the strip while a call is there. The phone's notifications are the
// notification module's (its apps, a reply in the card); its battery, the Device tab's.
export default {
    id: 'phone',
    title: 'Phone',
    icon: 'phone-symbolic',
    kinds: ['call'],
    source: CallSource,
    adapter,
    tab: PhoneTab,
    tabInMore: true,
    tabWhileLive: true,
};
