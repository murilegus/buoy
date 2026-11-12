import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {upNext} from './agenda.js';
import {EventReader} from './events.js';

/**
 * Home's Up next (SPEC §3, 2026-11-08): what is left of today (agenda.js `upNext`) — at
 * most three, running ones marked in the accent as the Calendar tab marks them, "+2 more"
 * when there are more — each one line: a bar, its title, its time at the end ("3:00 PM · in
 * 25 min"), so three fit under the weather in the expanded height. A click
 * opens the Calendar tab, which has the month and the week ahead. Nothing left today, or no
 * calendar → not ready, and Home leaves the card out.
 *
 * The events are the date menu's (events.js), read while Home is open; made, it brings the
 * date menu's calendar to today so today's events are loaded. No timer: Home lays out its
 * blocks again on every change of the stack and calls `refresh` then, which redoes the
 * times ("in 25 min").
 */
export class CalendarHome {
    /**
     * @param {object} [kit]
     * @param {function(string):void} [kit.open]  select a tab of the panel
     * @param {function():void} [kit.changed]  `ready` flipped: Home lays out again
     */
    constructor({open = null, changed = null} = {}) {
        this._open = open;
        this._changed = changed;
        this._up = {rows: [], more: 0};
        this._box = new St.BoxLayout({
            style_class: 'buoy-home-upnext', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        this.actor = new St.Button({
            style_class: 'buoy-home-card buoy-home-hit', child: this._box, x_expand: true, y_expand: true,
            can_focus: true, accessible_name: 'Up next', x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        this.actor.connect('clicked', () => this._open?.('calendar'));
        this._reader = new EventReader(() => this.refresh());
        this._reader.ensureToday();
        this.refresh(false);
    }

    /** @returns {boolean} something left today */
    get ready() {
        return this._up.rows.length > 0;
    }

    /**
     * Read again (the time moved, or the events changed).
     *
     * @param {boolean} [notify]  call `changed` when `ready` flipped
     */
    refresh(notify = true) {
        const was = this.ready;
        this._up = upNext(this._reader?.state.events ?? [], Date.now());
        this._render();
        if (notify && was !== this.ready)
            this._changed?.();
    }

    _render() {
        this._box.destroy_all_children();
        const {rows, more} = this._up;
        if (!rows.length)
            return;
        const header = new St.BoxLayout({style_class: 'buoy-home-header'});
        header.add_child(new St.Label({text: 'Up next', x_expand: true}));
        if (more)
            header.add_child(new St.Label({text: `+${more} more`}));
        this._box.add_child(header);
        for (const r of rows) {
            const row = new St.BoxLayout({style_class: `buoy-home-event${r.now ? ' buoy-home-event-now' : ''}`});
            row.add_child(new St.Widget({style_class: 'buoy-home-event-bar', y_expand: true}));
            const title = ellipsized(r.title, 'buoy-home-title');
            title.x_expand = true;
            row.add_child(title);
            row.add_child(ellipsized(r.detail, 'buoy-home-subtitle'));
            this._box.add_child(row);
        }
        this.actor.accessible_name = ['Up next', ...rows.map(r => `${r.title}, ${r.detail}`)].join('; ');
    }

    destroy() {
        this._reader?.destroy();
        this._reader = null;
        this._changed = null;
        this.actor.destroy();
    }
}

function ellipsized(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
