// Home's own glances (design/home): the battery, from GNOME's own battery object. The
// phone and the timer's glances come with their FEATURES items.
import {BatteryGlance} from './home.js';

export default {id: 'home', kinds: [], source: null, adapter: {}, home: {Glance: BatteryGlance, order: 30}};
