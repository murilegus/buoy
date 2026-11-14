// The mascot idle plan (MASCOT.md § Eyes, FEATURES M4): Bu's eyes in the idle pill. No
// activities, no tab; its feed watches input, the power profile and animations while the
// plan is in use (kit/services/idle.js). On by default, last in Automatic's stack (2026-11-14).
import idle from './idle.js';
import {MascotFeed} from './feed.js';

export default {id: 'mascot', kinds: [], source: null, adapter: {}, idle, feed: MascotFeed};
