import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {EmptyState} from '../../kit/present.js';

// TODO M5 "Clipboard tab" (history, search, pin; excludes password managers).
// Built when chosen from ⋯ or its pinned tab, destroyed when expanded closes.
export class ClipboardTab {
    constructor() {
        this.actor = new St.BoxLayout({
            style_class: 'buoy-clipboard', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        // until it is built: Bu says so, as every empty tab (2026-11-07)
        this.actor.add_child(new EmptyState('Coming soon', {pose: 'idle'}));
    }

    destroy() {
        this.actor.destroy();
    }
}
