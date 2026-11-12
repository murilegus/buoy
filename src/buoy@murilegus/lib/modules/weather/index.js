// The weather idle plan (SPEC §2a, FEATURES M3 "weather"): no activities, no tab. Its feed
// reads GNOME's weather client while the plan is in use (kit/services/idle.js); its source
// answers prefs' refresh button (2026-11-12).
import idle from './idle.js';
import {WeatherFeed} from './feed.js';
import {WeatherSource} from './source.js';
import {WeatherGlance} from './home.js';

export default {
    id: 'weather', kinds: [], source: WeatherSource, adapter: {}, idle, feed: WeatherFeed,
    home: {Glance: WeatherGlance, order: 10, wide: true},   // Home's first glance; wide when there is room
};
