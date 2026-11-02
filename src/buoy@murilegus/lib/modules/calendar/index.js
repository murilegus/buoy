import {CalendarTab} from './tab.js';

// Standalone tab for now, the first one (SPEC §2b, 2026-11-02): in the slot until another
// is chosen. The next-event activity (M4) and the idle plan (SPEC §2a) come later; with a
// kind it would move to the kind tabs.
export default {
    id: 'calendar',
    title: 'Calendar',
    icon: 'x-office-calendar-symbolic',
    kinds: [],
    source: null,
    adapter: {},
    idle: null,
    tab: CalendarTab,
};
