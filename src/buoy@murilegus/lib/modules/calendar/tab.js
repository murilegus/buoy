import Clutter from 'gi://Clutter';
import St from 'gi://St';

// TODO M4 "Meeting in 5 min · Join" / calendar idle plan: the month and today's events.
// Built when chosen from ⋯ or the slot, destroyed when expanded closes.
export class CalendarTab {
    constructor() {
        this.actor = new St.BoxLayout({
            style_class: 'buoy-calendar', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
    }

    destroy() {
        this.actor.destroy();
    }
}
