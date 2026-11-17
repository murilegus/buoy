import {UsbSource} from './source.js';
import adapter from './adapter.js';

// A drive, a phone or a webcam plugged in (FEATURES M4 "USB / phone / webcam plugged"): a drive's
// compact opens on its own with Open and Eject; the rest are 3 s flashes. No tab: the Device
// tab's Plugged In column lists them.
export default {id: 'usb', kinds: ['usb'], noTab: true, source: UsbSource, adapter};
