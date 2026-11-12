import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {upNext, upNextTile} from './agenda.js';
import {EventReader} from './events.js';

const ICON = 'x-office-calendar-symbolic';
const WIDE_ROWS = 2;

/**
 * Home's Up next glance (design/home, 2026-11-11): a tile with the next of today's events
 * (agenda.js `upNext`: running or still to come) — its time and title; wide, the next two,
 * each a bar, its title and "3:00 PM · in 25 min", a running one's bar in the accent as the
 * Calendar tab marks it. Shell's calendar server sends no calendar colour (only id, title
 * and times), so the bar is the accent or grey. A click opens the Calendar tab. Nothing
 * left today, or no calendar → not ready, and Home leaves the tile out.
 *
 * The events are the date menu's (events.js), read while Home is open; made, it brings the
 * date menu's calendar to today so today's events are loaded. No timer: Home lays its
 * glances out again on every change of the stack and calls `refresh` then.
 */
export class CalendarGlance {
    /**
     * @param {object} [kit]
     * @param {function(string):void} [kit.open]  select a tab of the panel
     * @param {function():void} [kit.changed]  the tile changed: Home lays out again
     */
    constructor({open = null, changed = null} = {}) {
        this._open = open;
        this._changed = changed;
        this._up = {rows: [], more: 0};
        this._reader = new EventReader(() => this.refresh());
        this._reader.ensureToday();
        this.refresh(false);
    }

    /** @returns {boolean} something left today */
    get ready() {
        return this._up.rows.length > 0;
    }

    /** @returns {?object} the tile (kit/ui/home.js) */
    get tile() {
        const t = upNextTile(this._up.rows[0]);
        return t ? {icon: ICON, value: t.value, caption: t.caption, detail: this._up.rows[0].detail} : null;
    }

    /**
     * Read again (the time moved, or the events changed).
     *
     * @param {boolean} [notify]  call `changed` when the tile changed
     */
    refresh(notify = true) {
        const before = JSON.stringify(this._up.rows.slice(0, WIDE_ROWS).map(r => [r.title, r.detail, r.now]));
        this._up = upNext(this._reader?.state.events ?? [], Date.now());
        const after = JSON.stringify(this._up.rows.slice(0, WIDE_ROWS).map(r => [r.title, r.detail, r.now]));
        if (notify && before !== after)
            this._changed?.();
    }

    /**
     * The wide tile: the next two events.
     *
     * @returns {?Clutter.Actor}
     */
    wide() {
        const rows = this._up.rows.slice(0, WIDE_ROWS);
        if (!rows.length)
            return null;
        const box = new St.BoxLayout({style_class: 'buoy-home-upnext', orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        box.add_child(new St.Icon({icon_name: ICON, icon_size: 16, style_class: 'buoy-icon', x_align: Clutter.ActorAlign.START}));
        for (const r of rows) {
            const row = new St.BoxLayout({style_class: `buoy-home-event${r.now ? ' buoy-home-event-now' : ''}`, x_expand: true});
            row.add_child(new St.Widget({style_class: 'buoy-home-event-bar', y_expand: true}));
            const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            text.add_child(ellipsized(r.title, 'buoy-home-title'));
            text.add_child(ellipsized(r.detail, 'buoy-home-tile-caption'));
            row.add_child(text);
            box.add_child(row);
        }
        return box;
    }

    activate() {
        this._open?.('calendar');
    }

    destroy() {
        this._reader?.destroy();
        this._reader = null;
        this._changed = null;
    }
}

function ellipsized(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
