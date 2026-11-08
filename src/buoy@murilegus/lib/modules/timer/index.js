// TODO M4 "Timer / pomodoro ring, keep-awake". Until then only its tab, "Coming soon".
import {TimerTab} from './tab.js';

export default {
    id: 'timer',
    title: 'Timer',
    icon: 'alarm-symbolic',
    kinds: ['timer'],
    source: null,
    adapter: {},
    tab: TimerTab,
};
