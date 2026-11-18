// The Device tab (FEATURES M4 "Device tab", SPEC §2b): pinned after Calendar. Its three
// groups (This computer, Wireless, Plugged) fill as the modules bringing them come
// ("Power", "Bluetooth device", "Headphones / display plugged", "USB / phone / webcam
// plugged", "Phone via GSConnect"); until then Bu says so (2026-11-13, Ethan).
import {DeviceTab} from './tab.js';
import {PhoneGlance} from './glance.js';

export default {
    id: 'device',
    title: 'Devices',
    icon: 'computer-symbolic',
    kinds: [],
    source: null,
    adapter: {},
    tab: DeviceTab,
    // the phone GSConnect has connected, after the battery's tile (design/home "Ô điện thoại")
    home: {Glance: PhoneGlance, order: 40},
};
