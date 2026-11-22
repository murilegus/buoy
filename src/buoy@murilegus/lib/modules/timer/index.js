import {TimerSource} from './source.js';
import {TimerTab} from './tab.js';
import {TimerGlance} from './glance.js';
import adapter from './adapter.js';

// Timers (FEATURES M4 "Timer"; design/compact "Hẹn giờ", 2026-11-22, Ethan): the pill with its
// ring, the end's card, Pomodoro; saved timers shared with GNOME Clocks.
export default {
    id: 'timer',
    title: 'Timer',
    icon: 'alarm-symbolic',
    kinds: ['timer'],
    source: TimerSource,
    adapter,
    tab: TimerTab,
    // in ⋯, not the strip (Ethan, 2026-11-13)
    tabInMore: true,
    // a tile to start one, after the phone's (design/home "Ô hẹn giờ")
    home: {Glance: TimerGlance, order: 50},
};
