import {PowerSource} from './source.js';
import adapter from './adapter.js';

// The laptop's battery (FEATURES M4 "Power"): a 3 s flash at plug in, unplug and full;
// a low battery stays until plugged in, in place of GNOME's notification. No tab: a click
// opens Settings → Power; Home's battery glance is the home module's.
export default {id: 'power', kinds: ['power'], noTab: true, source: PowerSource, adapter};
