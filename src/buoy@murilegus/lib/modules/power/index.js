import {PowerSource} from './source.js';
import adapter from './adapter.js';
import idle from './idle.js';
import {PowerFeed} from './feed.js';

// The laptop's battery (FEATURES M4 "Power"): a 3 s flash at plug in, unplug and full;
// a low battery stays until plugged in, in place of GNOME's notification. No tab: a click
// opens Settings → Power; Home's battery glance is the home module's. The battery idle plan
// (FEATURES M4 "Idle plan `power`") with its feed.
export default {id: 'power', kinds: ['power'], noTab: true, source: PowerSource, adapter, idle, feed: PowerFeed};
