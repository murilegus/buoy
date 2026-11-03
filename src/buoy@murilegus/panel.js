import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// cluster-background, -radius, -opacity (SPEC §1). St has no CSS variables, so the
// background is the box's inline style, repainted when the look or its hover changes.
let look = {mode: 'never', radius: 12, opacity: 35};

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
        saved = boxes.map(box => ({
            reactive: box.reactive, track_hover: box.track_hover, visible: box.visible, style: box.get_style(),
        }));
    } else {
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
            saved[i].hover = box.connect('notify::hover', paint);
            paint(box);
        } else {
            box.disconnect(saved[i].hover);
            box.set_style(saved[i].style);
            box.remove_style_class_name('buoy-cluster');
            unfollowEmpty(box, saved[i]);
            box.visible = saved[i].visible;
        }
    });
    if (!on)
        saved = null;
}

/**
 * @param {object} next
 * @param {string} next.mode  `cluster-background`: never | hover | always
 * @param {number} next.radius  `cluster-radius`, px
 * @param {number} next.opacity  `cluster-opacity`, percent
 */
export function setClusterBackground(next) {
    look = next;
    if (saved)
        [Main.panel._leftBox, Main.panel._rightBox].forEach(paint);
}

// The stylesheet's transition-duration fades the change in both directions.
function paint(box) {
    const shown = look.mode === 'always' || (look.mode === 'hover' && box.hover);
    const alpha = shown ? look.opacity / 100 : 0;
    box.set_style(`border-radius: ${look.radius}px; background-color: rgba(0, 0, 0, ${alpha});`);
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
