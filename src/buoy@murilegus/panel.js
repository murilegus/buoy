import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// cluster-background (SPEC §1): 'hover' is the stylesheet's own rule (.buoy-cluster:hover);
// the other two are a class on the panel.
const BACKGROUNDS = ['always', 'never'];

// What reworkPanel(true) changed on each cluster box, to put back on disable.
let saved = null;

/**
 * SPEC §1: transparent panel; left cluster = focused app (TODO); right = tray + clock;
 * quick settings hidden (indicators move into the pill — TODO).
 *
 * @param {boolean} on  apply (enable) or revert (disable)
 */
export function reworkPanel(on) {
    const panel = Main.panel;
    const {activities, dateMenu} = panel.statusArea;
    const boxes = [panel._leftBox, panel._rightBox];

    if (on) {
        panel.add_style_class_name('buoy');
        activities.container.hide();
        panel._centerBox.remove_child(dateMenu.container);
        panel._rightBox.add_child(dateMenu.container);
        saved = boxes.map(box => ({reactive: box.reactive, track_hover: box.track_hover, visible: box.visible}));
    } else {
        setClusterBackground('hover');
        panel._rightBox.remove_child(dateMenu.container);
        panel._centerBox.add_child(dateMenu.container);
        activities.container.show();
        panel.remove_style_class_name('buoy');
    }
    boxes.forEach((box, i) => {
        // St only sets :hover on a widget that tracks it, and only a reactive actor gets
        // the crossing events (st-widget.c st_widget_enter); the boxes are neither.
        box.reactive = on || saved[i].reactive;
        box.track_hover = on || saved[i].track_hover;
        if (on) {
            box.add_style_class_name('buoy-cluster');
            followEmpty(box, saved[i]);
        } else {
            box.remove_style_class_name('buoy-cluster');
            unfollowEmpty(box, saved[i]);
            box.visible = saved[i].visible;
        }
    });
    if (!on)
        saved = null;
}

/**
 * @param {string} mode  `cluster-background`: hover | always | never
 */
export function setClusterBackground(mode) {
    for (const m of BACKGROUNDS) {
        if (m === mode)
            Main.panel.add_style_class_name(`buoy-cluster-${m}`);
        else
            Main.panel.remove_style_class_name(`buoy-cluster-${m}`);
    }
}

// A cluster with nothing showing would still draw its padding as a small dark stub
// (`always`, or under the pointer): hide the box until a child shows. Signals only — a
// child coming, going, or changing its visibility.
function followEmpty(box, state) {
    state.children = new Map();
    const sync = () => {
        box.visible = box.get_children().some(c => c.visible);
    };
    const watch = child => state.children.set(child, child.connect('notify::visible', sync));
    state.added = box.connect('child-added', (_b, child) => {
        watch(child);
        sync();
    });
    state.removed = box.connect('child-removed', (_b, child) => {
        child.disconnect(state.children.get(child));
        state.children.delete(child);
        sync();
    });
    box.get_children().forEach(watch);
    sync();
}

function unfollowEmpty(box, state) {
    box.disconnect(state.added);
    box.disconnect(state.removed);
    for (const [child, id] of state.children)
        child.disconnect(id);
    state.children = null;
}
