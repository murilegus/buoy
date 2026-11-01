import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const GAP = 4;

// SPEC §1: transparent panel; left cluster = focused app (TODO); right = tray + clock;
// quick settings hidden (indicators move into the pill — TODO).
export function reworkPanel(on) {
    const panel = Main.panel;
    const {activities, dateMenu} = panel.statusArea;

    if (on) {
        panel.add_style_class_name('buoy');
        activities.container.hide();
        panel._centerBox.remove_child(dateMenu.container);
        panel._rightBox.add_child(dateMenu.container);
    } else {
        panel._rightBox.remove_child(dateMenu.container);
        panel._centerBox.add_child(dateMenu.container);
        activities.container.show();
        panel.remove_style_class_name('buoy');
    }
    for (const box of [panel._leftBox, panel._rightBox]) {
        box.margin_top = on ? GAP : 0;
        box.margin_bottom = on ? GAP : 0;
        if (on) box.add_style_class_name('buoy-cluster'); else box.remove_style_class_name('buoy-cluster');
    }
}
