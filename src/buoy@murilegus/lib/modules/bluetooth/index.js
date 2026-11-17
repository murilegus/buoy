import {BluetoothSource} from './source.js';
import adapter from './adapter.js';

// A Bluetooth device connected or gone (FEATURES M4 "Bluetooth device"): a 3 s flash with its
// battery. No tab: the Device tab's Wireless column lists them.
export default {id: 'bluetooth', kinds: ['bluetooth'], noTab: true, source: BluetoothSource, adapter};
