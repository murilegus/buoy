import GLib from 'gi://GLib';

/**
 * ActivityStack: which activity is on the island right now.
 *
 * An activity is a plain object:
 *   id        unique per source instance ('mpris:spotify', 'notif:42')
 *   kind      'media' | 'notification' | 'osd' | 'timer' | 'power' | ...
 *   app       app id for adapter lookup ('spotify', 'org.gnome.Nautilus')
 *   priority  higher wins (see PRIORITY)
 *   ttl       ms until auto-removed; 0 = until the source ends it
 *   shape, hoverShape?, expandedShape?, content?, onPress?, onExpand?
 *
 * Rules (mirroring iOS):
 *   - highest priority shows; ties → most recent
 *   - a transient (ttl > 0) activity interrupts, then the previous one returns
 *   API: surface(activity) · update(id, patch) · end(id) — names follow APPLE.md §B1
 *   - ending an activity removes it immediately, no fade-out hold
 */
export const PRIORITY = {
    media: 10,
    timer: 20,
    power: 30,
    osd: 40,
    notification: 50,
};

export class ActivityStack {
    constructor(island) {
        this._island = island;
        this._items = new Map();   // id → activity
        this._timers = new Map();  // id → GLib source id
    }

    surface(activity) {
        this.end(activity.id, false);
        activity.priority ??= PRIORITY[activity.kind] ?? 0;
        activity._at = GLib.get_monotonic_time();
        this._items.set(activity.id, activity);

        if (activity.ttl > 0) {
            const sid = GLib.timeout_add(GLib.PRIORITY_DEFAULT, activity.ttl, () => {
                this._timers.delete(activity.id);
                this.end(activity.id);
                return GLib.SOURCE_REMOVE;
            });
            this._timers.set(activity.id, sid);
        }
        this._render();
    }

    // Update fields of a live activity (e.g. track changed) without re-pushing.
    update(id, patch) {
        const a = this._items.get(id);
        if (!a)
            return;
        Object.assign(a, patch);
        if (this._top() === a)
            this._render();
    }

    end(id, render = true) {
        const sid = this._timers.get(id);
        if (sid) {
            GLib.source_remove(sid);
            this._timers.delete(id);
        }
        if (this._items.delete(id) && render)
            this._render();
    }

    _top() {
        let top = null;
        for (const a of this._items.values()) {
            if (!top || a.priority > top.priority ||
                (a.priority === top.priority && a._at > top._at))
                top = a;
        }
        return top;
    }

    _render() {
        const top = this._top();
        if (top)
            this._island.show(top);
        else
            this._island.clear();
    }

    destroy() {
        for (const sid of this._timers.values())
            GLib.source_remove(sid);
        this._timers.clear();
        this._items.clear();
    }
}
