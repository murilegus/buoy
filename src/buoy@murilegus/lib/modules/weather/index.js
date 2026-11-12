// The weather idle plan (SPEC §2a, FEATURES M3 "weather"): no activities, no tab. Its feed
// reads GNOME's weather client while the plan is in use (kit/services/idle.js).
import idle from './idle.js';
import {WeatherFeed} from './feed.js';
import {WeatherHome} from './home.js';

export default {
    id: 'weather', kinds: [], source: null, adapter: {}, idle, feed: WeatherFeed,
    home: {Block: WeatherHome, column: 'end', order: 10},   // Home's weather, above Up next
};
