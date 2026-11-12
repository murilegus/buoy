import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {EmptyState} from '../../kit/ui/present/elements.js';

// TODO M4 "Device tab" (design/device): the three groups. Until the modules feeding it
// come, Bu says so, as the other tabs not built yet (timer/tab.js).
export class DeviceTab {
    constructor() {
        this.actor = new St.BoxLayout({
            style_class: 'buoy-device', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        this.actor.add_child(new EmptyState('Coming soon', {pose: 'idle'}));
    }

    destroy() {
        this.actor.destroy();
    }
}
