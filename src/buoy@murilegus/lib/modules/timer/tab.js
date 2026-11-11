import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {EmptyState} from '../../kit/ui/present/elements.js';

// TODO M4 "Timer / pomodoro ring, keep-awake". Until it is built Bu says so, as the other
// tabs not built yet (2026-11-08, Ethan: "No timer" read as if there could be one).
export class TimerTab {
    constructor() {
        this.actor = new St.BoxLayout({
            style_class: 'buoy-timer', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        this.actor.add_child(new EmptyState('Coming soon', {pose: 'idle'}));
    }

    /** The kit's update with this kind's activities: none until M4. */
    update() {}

    destroy() {
        this.actor.destroy();
    }
}
