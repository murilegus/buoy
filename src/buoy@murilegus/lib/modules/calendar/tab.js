import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {EmptyState, buildElement} from '../../kit/present.js';
import {agenda, dayRows, dayStart} from './agenda.js';
import {EventReader} from './events.js';
import {isWeekend, monthDays, monthTitle, pickedTitle, stepDay, weekdayInitials} from './month.js';

/**
 * The Calendar tab (FEATURES M3 "calendar"; a standalone tab, SPEC §2b; two sides,
 * 2026-11-08, Ethan): the month on the left to pick a day — the month's name in the accent
 * and the year in grey, ‹ › at its right, every date in two figures (the columns line up),
 * weekends dimmed, the months around in grey (a click goes there), today a circle filled
 * in the accent, the picked day lit, an accent dot under a day with events —
 * and the picked day under its title ("Today, 8 November") on the right: each event a card,
 * a dot, its title, its time at the end. Today picked: what is left of today, then the
 * week ahead (SPEC §3 "Up next"); another day: that day's. ‹ › move the picked day a
 * month, as the date menu's calendar does. The month grid is this tab's, not Home's. No
 * calendar colours: Shell's calendar server sends only id, title and times.
 *
 * The events are the date menu's (events.js), live while the tab is open; moving to a month
 * moves the date menu's calendar there, which loads that month (Shell's calendar server
 * has one range, its calendar's). A row opens the calendar app as the date menu's event list
 * does (ui/dateMenu.js EventsSection vfunc_clicked) and closes the island. No calendar at
 * all: Bu says so, with a button to Settings → Online Accounts.
 */
export class CalendarTab {
    /** @param {{close?: function():void}} [kit]  close(): the island, after an action */
    constructor({close = null} = {}) {
        this._close = close;
        this._redrawId = 0;
        const now = new Date();
        this._picked = dayStart(now.getTime());
        this._year = now.getFullYear();
        this._month = now.getMonth();
        this.actor = new St.BoxLayout({style_class: 'buoy-calendar', x_expand: true});
        this._reader = new EventReader(() => this._redraw(), {everyChange: true});
        this._reader.ensureToday();
        this._render();
    }

    /** The kit's update with this module's activities: it has none. */
    update() {}

    destroy() {
        if (this._redrawId)
            GLib.source_remove(this._redrawId);
        this._redrawId = 0;
        this._reader?.destroy();
        this._reader = null;
        this._close = null;
        this.actor.destroy();
    }

    // A recurring event's instances come in one signal each: draw once
    _redraw() {
        if (this._redrawId)
            return;
        this._redrawId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._redrawId = 0;
            this._render();
            return GLib.SOURCE_REMOVE;
        });
    }

    _render() {
        this.actor.destroy_all_children();
        if (!this._reader?.state.hasCalendars) {
            this.actor.add_child(new EmptyState('No calendars', {pose: 'idle', below: this._accountsButton()}));
            return;
        }
        const month = this._monthSide();
        const list = new St.ScrollView({
            style_class: 'buoy-calendar-list', x_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
        });
        list.set_child(this._listSide());
        // the list scrolls inside the month's height; the month never scrolls away
        month.connect('notify::height', () => {
            if (month.height > 0)
                list.height = month.height;
        });
        this.actor.add_child(month);
        this.actor.add_child(list);
    }

    // ‹ November › over the weekday heads and six weeks of days
    _monthSide() {
        const now = Date.now();
        const today = dayStart(now);
        const weekStart = this._reader.weekStart;
        const side = new St.BoxLayout({
            style_class: 'buoy-calendar-month', orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.START,
        });
        const head = new St.BoxLayout({style_class: 'buoy-calendar-month-head', x_expand: true});
        const title = monthTitle(this._year, this._month);
        head.add_child(new St.Label({
            text: title.month.toUpperCase(), style_class: 'buoy-calendar-month-name', y_align: Clutter.ActorAlign.CENTER,
        }));
        head.add_child(new St.Label({
            text: title.year, style_class: 'buoy-calendar-month-year', x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        }));
        head.add_child(this._arrow('go-previous-symbolic', 'Previous month', -1));
        head.add_child(this._arrow('go-next-symbolic', 'Next month', 1));
        side.add_child(head);

        const layout = new Clutter.GridLayout();
        const grid = new St.Widget({style_class: 'buoy-calendar-grid', layout_manager: layout});
        weekdayInitials(weekStart).forEach((d, i) => layout.attach(new St.Label({
            text: d, style_class: 'buoy-calendar-weekday', x_align: Clutter.ActorAlign.CENTER,
        }), i, 0, 1, 1));
        monthDays(this._year, this._month, {weekStart}).forEach((d, i) => {
            const button = new St.Button({
                style_class: 'buoy-calendar-day', can_focus: true,
                accessible_name: pickedTitle(d.day, now),
            });
            if (!d.inMonth)
                button.add_style_class_name('buoy-calendar-other');
            else if (isWeekend(d.day))
                button.add_style_class_name('buoy-calendar-weekend');
            if (d.day === today)
                button.add_style_class_name('buoy-calendar-today');
            if (d.day === this._picked)
                button.add_style_class_name('buoy-calendar-picked');
            // the number at the circle's centre; the dot over its bottom edge, out of the
            // layout, so it never lifts the number
            const cell = new St.Widget({
                layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true,
                x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL,
            });
            cell.add_child(new St.Label({
                text: String(d.date).padStart(2, '0'),
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
            }));
            // BinLayout honours an align only on a child that expands (clutter-bin-layout.c)
            const dot = new St.Widget({
                style_class: 'buoy-calendar-dot', x_expand: true, y_expand: true,
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.END,
            });
            dot.opacity = this._reader.hasEvents(d.day) ? 255 : 0;
            cell.add_child(dot);
            button.set_child(cell);
            button.connect('clicked', () => this._pick(d.day));
            layout.attach(button, i % 7, 1 + Math.floor(i / 7), 1, 1);
        });
        side.add_child(grid);
        return side;
    }

    _arrow(icon, name, step) {
        const button = new St.Button({
            style_class: 'buoy-calendar-arrow', can_focus: true, accessible_name: name,
            child: new St.Icon({icon_name: icon, icon_size: 16}),
        });
        // the picked day moves with the month, as in the date menu: the list stays that
        // day's, and its month is the one loaded
        button.connect('clicked', () => this._pick(stepDay(this._picked, step)));
        return button;
    }

    _pick(day) {
        this._picked = day;
        const d = new Date(day);
        if (d.getFullYear() !== this._year || d.getMonth() !== this._month) {
            this._year = d.getFullYear();
            this._month = d.getMonth();
            this._reader.show(day);
        }
        this._render();
    }

    // Today: today's events, then the week ahead; another day: that day's
    _listSide() {
        const now = Date.now();
        const today = dayStart(now);
        const box = new St.BoxLayout({
            style_class: 'buoy-calendar-events', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        box.add_child(new St.Label({text: pickedTitle(this._picked, now), style_class: 'buoy-calendar-day-title'}));
        if (this._picked === today) {
            const {today: rows, upcoming} = agenda(this._reader.eventsIn(today, dayStart(now, 7)), now);
            this._rows(box, rows.filter(e => !e.past), 'Nothing else today');
            for (const g of upcoming) {
                box.add_child(header(g.label));
                this._rows(box, g.events);
            }
            return box;
        }
        const events = this._reader.eventsIn(this._picked, dayStart(this._picked, 1));
        this._rows(box, dayRows(events, this._picked, now), 'No events');
        return box;
    }

    _rows(box, rows, none = null) {
        if (!rows.length && none)
            box.add_child(restingBu(none));
        rows.forEach(e => box.add_child(this._row(e)));
    }

    // a card: a dot · the title · its time at the end; the running one "until 4:00 PM"
    // with an accent dot
    _row(e) {
        const button = new St.Button({
            style_class: 'buoy-calendar-row', can_focus: true, x_expand: true,
            accessible_name: `${e.title}, ${e.time}`,
        });
        if (e.past)
            button.add_style_class_name('buoy-calendar-past');
        if (e.now)
            button.add_style_class_name('buoy-calendar-now');
        button.connect('clicked', () => this._openCalendar());
        const line = new St.BoxLayout({style_class: 'buoy-calendar-line', x_expand: true});
        line.add_child(new St.Widget({style_class: 'buoy-calendar-mark', y_align: Clutter.ActorAlign.CENTER}));
        const title = new St.Label({
            text: e.title, style_class: 'buoy-calendar-title', x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        line.add_child(title);
        line.add_child(new St.Label({
            text: e.now && e.endText ? `until ${e.endText}` : e.time, style_class: 'buoy-calendar-time',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        button.set_child(line);
        return button;
    }

    // The date menu's choice of app (EventsSection._appInstalledChanged): the default for
    // text/calendar when it is a recommended one, else the first recommended; Evolution
    // opens on its calendar
    _openCalendar() {
        const apps = Gio.AppInfo.get_recommended_for_type('text/calendar');
        if (!apps?.length)
            return;
        const preferred = Gio.AppInfo.get_default_for_type('text/calendar', false);
        const app = preferred && apps.some(a => a.equal(preferred)) ? preferred : apps[0];
        const context = global.create_app_launch_context(0, -1);
        try {
            if (app.get_id() === 'org.gnome.Evolution.desktop')
                app.launch_action('calendar', context);
            else
                app.launch([], context);
        } catch (e) {
            console.warn(`Buoy: could not open the calendar: ${e.message}`);
        }
        this._close?.();
    }

    // Settings → Online Accounts, as Shell opens a panel (ui/status/network.js
    // launchSettingsPanel)
    _accountsButton() {
        const button = new St.Button({
            style_class: 'buoy-calendar-accounts', can_focus: true, label: 'Add an Online Account',
            x_align: Clutter.ActorAlign.CENTER,
        });
        button.connect('clicked', () => {
            const param = new GLib.Variant('av', [new GLib.Variant('(sav)', ['online-accounts', []])]);
            const settings = Shell.AppSystem.get_default().lookup_app('org.gnome.Settings.desktop');
            settings?.activate_action('launch-panel', param, 0, -1, null)
                .catch(e => console.warn(`Buoy: could not open Settings: ${e.message}`));
            this._close?.();
        });
        return button;
    }
}

// Nothing on the picked day: Bu asleep over the words (2026-11-08, Ethan), the list's
// own size — not EmptyState, which fills the panel
function restingBu(text) {
    const box = new St.BoxLayout({
        style_class: 'buoy-calendar-none', orientation: Clutter.Orientation.VERTICAL,
        x_align: Clutter.ActorAlign.CENTER,
    });
    const bu = buildElement({mascot: 'sleep'}, {size: 'compact', leading: true});
    bu.x_align = Clutter.ActorAlign.CENTER;
    box.add_child(bu);
    box.add_child(new St.Label({text, x_align: Clutter.ActorAlign.CENTER}));
    return box;
}

// St has no text-transform: the section heads are written in capitals
function header(text) {
    return new St.Label({text: text.toUpperCase(), style_class: 'buoy-calendar-header'});
}
