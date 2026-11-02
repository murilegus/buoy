import Clutter from 'gi://Clutter';
import St from 'gi://St';

// TODO M5 "Clipboard tab" (history, search, pin; excludes password managers).
// Built when chosen from ⋯ or its pinned tab, destroyed when expanded closes.
export class ClipboardTab {
    constructor() {
        this.actor = new St.BoxLayout({
            style_class: 'buoy-clipboard', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
    }

    destroy() {
        this.actor.destroy();
    }
}
