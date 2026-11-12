// The calendar (FEATURES M3 "calendar"): the date menu's events, from every calendar EDS
// knows. The next-event idle plan (SPEC §2a, `idle-content` 'calendar') with its feed, and
// the Calendar tab (Today and the week ahead) — a standalone tab, in the slot until another
// is chosen (SPEC §2b). The meeting alert with Join is M4.
import idle from './idle.js';
import {CalendarFeed} from './feed.js';
import {CalendarTab} from './tab.js';
import {CalendarGlance} from './home.js';

export default {
    id: 'calendar',
    title: 'Calendar',
    icon: 'x-office-calendar-symbolic',
    kinds: [],
    source: null,
    adapter: {},
    idle,
    feed: CalendarFeed,
    tab: CalendarTab,
    // Home's Up next glance, after the weather; wide when there is room (design/home)
    home: {Glance: CalendarGlance, order: 20, wide: true},
};
