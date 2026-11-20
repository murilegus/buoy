import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {buildElement, EmptyState, iconLabel, iconProps} from '../../kit/ui/present/elements.js';
import {FillBox} from '../../kit/ui/present/parts.js';
import {agenda, dayRows, dayStart} from './agenda.js';
import {calendarsOf, eventPage} from './details.js';
import {readEvent, readSources} from './eds.js';
import {EventReader} from './events.js';
import {eventIdParts, meetingLink} from './meeting.js';
import {CELL_MIN, cellFont, cellSize, isWeekend, monthDays, monthTitle, pickedTitle, stepDay, weekdayInitials} from './month.js';

/** @import GioUnix from 'gi://GioUnix' */

/**
 * The Calendar tab (FEATURES M3 "calendar"; a standalone tab, SPEC §2b; two sides,
 * 2026-11-08, Ethan): the month on the left to pick a day — the month's name in the accent
 * and the year in grey, ‹ › at its right, every date in two figures (the columns line up),
 * weekends dimmed, the months around in grey (a click goes there), today a circle filled
 * in the accent, the picked day lit, an accent dot under a day with events —
 * and the picked day under its title ("Today, 8 November") on the right: each event a card,
 * a dot in its calendar's colour (EDS's sources, eds.js readSources; 2026-11-20), its title,
 * its time at the end. Today picked: what is left of today, then the week ahead (SPEC §3
 * "Up next"); another day: that day's. ‹ › move the picked day a month, as the date menu's
 * calendar does. The month grid is this tab's, not Home's.
 *
 * The events are the date menu's (events.js), live while the tab is open; moving to a month
 * moves the date menu's calendar there, which loads that month (Shell's calendar server
 * has one range, its calendar's). A row opens the event's page in the right column, the
 * month kept (FEATURES M4 "Event details in the Calendar tab"; design/tabs "Chi tiết sự
 * kiện", 2026-11-20, Ethan, after Google Calendar's): its iCalendar read from EDS then
 * (eds.js readEvent, as the meeting's Join), the head drawn at once; ‹ or Esc back. No
 * calendar at all: Bu says so, with a button to Settings → Online Accounts.
 *
 * Loading: a new range makes Shell's source drop its events at once and get them back a
 * moment later (ui/calendar.js `_loadEvents(true)`: clear, `changed`, then the server's
 * EventsAddedOrUpdated — 21 ms apart with a local calendar, longer with an online one).
 * The empty day shows at once (Bu asleep) and the events replace it when they come
 * (2026-11-08, Ethan: Bu first, the data after).
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
        // the panel's full expanded height, the list scrolling inside it (2026-11-08)
        this.actor = new FillBox({style_class: 'buoy-calendar', x_expand: true});
        // the month scales with the tab's height (2026-11-08, Ethan): the circles take a
        // sixth of what the head and weekdays leave (month.js cellSize), measured once the
        // tab has its height and again when it changes (Home sets the body's room after its
        // first layout); laid out just before the next redraw, never inside an allocation
        this._cell = CELL_MIN;
        this._fitLater = 0;
        this.actor.connect('notify::height', () => this._fitLaterOnce());
        this._reader = new EventReader(() => this._redraw(), {everyChange: true});
        this._reader.ensureToday();
        this._event = null;         // the page: {e (agenda.js's), ics: 'reading' | string | null}
        this._calendars = new Map();    // source uid → {name, color}
        this._cancel = new Gio.Cancellable();
        readSources(this._cancel).then(list => {
            this._calendars = calendarsOf(list);
            this._redraw();
        }).catch(e => {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.warn(`Buoy: calendar: ${e.message}`);
        });
        this._render();
    }


    /** The kit's update with this module's activities: it has none. */
    update() {}

    destroy() {
        if (this._redrawId)
            GLib.source_remove(this._redrawId);
        this._redrawId = 0;
        if (this._fitLater)
            global.compositor.get_laters().remove(this._fitLater);
        this._fitLater = 0;
        this._cancel?.cancel();
        this._cancel = null;
        this._reader?.destroy();
        this._reader = null;
        this._close = null;
        this.actor.destroy();
    }

    _fitLaterOnce() {
        if (this._fitLater)
            return;
        this._fitLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._fitLater = 0;
            this._fit();
            return GLib.SOURCE_REMOVE;
        });
    }

    // The six weeks' room: the tab's content height less what the month side takes besides
    // them (its head, the weekdays, paddings) at the current size. The height is the
    // panel's viewport (the scroll view around the tab, fixed by the expanded shape), read
    // from its last allocation: `height` gives the natural size while a relayout is queued
    // (clutter-actor.c clutter_actor_get_height), often so just before a redraw, and the
    // tab's own height grows with a grid that once overflowed (as the Media tab's art,
    // 2026-11-08)
    _fit() {
        const side = this._side;
        if (!side || !this.actor.mapped)
            return;
        let view = this.actor.get_parent();
        while (view && !(view instanceof St.ScrollView))
            view = view.get_parent();
        const height = (view ?? this.actor).get_allocation_box().get_height();
        const content = height - this.actor.get_theme_node().get_vertical_padding();
        const [, natural] = side.get_preferred_height(-1);
        const cell = cellSize(content - (natural - 6 * this._cell));
        if (cell === this._cell)
            return;
        this._cell = cell;
        this._render();
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
        this._side = null;
        if (!this._reader?.state.hasCalendars) {
            this.actor.add_child(new EmptyState('No calendars', {pose: 'idle', below: this._accountsButton()}));
            return;
        }
        const month = this._monthSide();
        // the list scrolls inside the tab's height (the panel's full one); the month stays
        const list = new St.ScrollView({
            style_class: 'buoy-calendar-list', x_expand: true, y_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
        });
        list.set_child(this._event ? this._pageSide() : this._listSide());
        this.actor.add_child(month);
        this.actor.add_child(list);
        this._side = month;
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
        // the day's circle and number at the size the tab's height allows (_fit)
        const px = this._cell, size = `width: ${px}px; height: ${px}px; border-radius: ${px / 2}px; ` +
            `font-size: ${cellFont(px)}px;`;
        weekdayInitials(weekStart).forEach((d, i) => {
            const weekday = new St.Label({
                text: d, style_class: 'buoy-calendar-weekday', x_align: Clutter.ActorAlign.CENTER,
            });
            weekday.set_style(`width: ${px + 4}px;`);   // the circle and its 2 px margins
            layout.attach(weekday, i, 0, 1, 1);
        });
        monthDays(this._year, this._month, {weekStart}).forEach((d, i) => {
            const button = new St.Button({
                style_class: 'buoy-calendar-day', can_focus: true,
                accessible_name: pickedTitle(d.day, now),
            });
            button.set_style(size);
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
            child: new St.Icon({...iconProps(icon), icon_size: 16}),
        });
        // the picked day moves with the month, as in the date menu: the list stays that
        // day's, and its month is the one loaded
        button.connect('clicked', () => this._pick(stepDay(this._picked, step)));
        return button;
    }

    _pick(day) {
        this._picked = day;
        this._event = null;
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
            style_class: 'buoy-calendar-events', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true,
        });
        box.add_child(new St.Label({text: pickedTitle(this._picked, now), style_class: 'buoy-calendar-day-title'}));
        if (this._picked === today) {
            const {today: rows, upcoming} = agenda(this._reader.eventsIn(today, dayStart(now, 7)), now);
            this._rows(box, rows.filter(e => !e.past), 'Nothing else today', !upcoming.length);
            for (const g of upcoming) {
                box.add_child(header(g.label));
                this._rows(box, g.events);
            }
            return box;
        }
        const events = this._reader.eventsIn(this._picked, dayStart(this._picked, 1));
        this._rows(box, dayRows(events, this._picked, now), 'No events', true);
        return box;
    }

    // `fill`: the empty state is all the list shows, so Bu takes the space under the title
    _rows(box, rows, none = null, fill = false) {
        if (!rows.length && none)
            box.add_child(restingBu(none, fill));
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
        button.connect('clicked', () => this._open(e));
        const line = new St.BoxLayout({style_class: 'buoy-calendar-line', x_expand: true});
        const mark = new St.Widget({style_class: 'buoy-calendar-mark', y_align: Clutter.ActorAlign.CENTER});
        const color = this._calendarOf(e)?.color;
        if (color)
            mark.set_style(`background-color: ${color};`);
        line.add_child(mark);
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

    /**
     * @param {object} e  an event (agenda.js)
     * @returns {?{name: string, color: ?string}} its calendar (its id names it)
     */
    _calendarOf(e) {
        const uid = eventIdParts(e.id)?.source;
        return uid ? this._calendars.get(uid) ?? null : null;
    }

    // its page, the head at once, the rest when EDS answers
    _open(e) {
        const ev = {e, ics: 'reading'};
        this._event = ev;
        this._render();
        readEvent(e.id, this._cancel).then(ics => {
            ev.ics = ics;
        }).catch(err => {
            if (!err.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.warn(`Buoy: calendar: ${err.message}`);
            ev.ics = null;
        }).finally(() => {
            if (this._event === ev)
                this._render();
        });
    }

    /** ‹ or Esc (kit/ui/home.js back): the list again; false when it shows already. */
    back() {
        if (!this._event)
            return false;
        this._event = null;
        this._render();
        return true;
    }

    // The event's page (design/tabs "Chi tiết sự kiện"): ‹, then as Google Calendar's — the
    // title by its calendar's colour, the day and time; Join and Copy link; the place, the
    // guests, the reminders, the calendar, the description. Each part only when it has one.
    _pageSide() {
        const {e, ics} = this._event;
        const now = Date.now();
        const text = typeof ics === 'string' ? ics : null;
        const p = eventPage(e, text, now);
        const cal = this._calendarOf(e);
        const box = new St.BoxLayout({
            style_class: 'buoy-calendar-page', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        const back = new St.Button({
            style_class: 'buoy-calendar-arrow', can_focus: true, accessible_name: 'Back', x_align: Clutter.ActorAlign.START,
            child: new St.Icon({...iconProps('go-previous-symbolic'), icon_size: 16}),
        });
        back.connect('clicked', () => this.back());
        box.add_child(back);

        const square = new St.Widget({style_class: 'buoy-calendar-square', y_align: Clutter.ActorAlign.START});
        if (cal?.color)
            square.set_style(`background-color: ${cal.color};`);
        const title = wrapped(p.title, 'buoy-calendar-page-title');
        box.add_child(infoRow(square, [title, wrapped(p.when, 'buoy-calendar-page-sub')], 'buoy-calendar-page-head'));

        // Join while it has not ended, as the meeting's card
        const link = text ? meetingLink(text) : null;
        if (link && (e.end > now || e.start + 10 * 60 * 1000 > now)) {
            const join = new St.Button({
                style_class: 'buoy-calendar-join', can_focus: true, label: `Join ${link.service}`,
                x_align: Clutter.ActorAlign.START,
            });
            join.connect('clicked', () => {
                try {
                    Gio.AppInfo.launch_default_for_uri(link.url, global.create_app_launch_context(0, -1));
                } catch (err) {
                    console.warn(`Buoy: calendar: ${err.message}`);
                }
                this._close?.();
            });
            const copy = new St.Button({
                style_class: 'buoy-calendar-copy', can_focus: true, accessible_name: 'Copy link',
                child: new St.Icon({...iconProps('edit-copy-symbolic'), icon_size: 16}),
            });
            copy.connect('clicked', () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, link.url));
            const buttons = new St.BoxLayout({x_expand: true});
            buttons.add_child(join);
            buttons.add_child(new St.Widget({x_expand: true}));
            buttons.add_child(copy);
            const url = new St.Label({text: link.url.replace(/^https:\/\//, ''), style_class: 'buoy-calendar-page-link'});
            url.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            box.add_child(infoRow(pageIcon('camera-video-symbolic'), [buttons, url]));
        }
        if (p.place)
            box.add_child(infoRow(pageIcon('mark-location-symbolic'), [wrapped(p.place, 'buoy-calendar-page-text')]));
        if (p.guests) {
            /** @type {St.Widget[]} */
            const parts = [
                wrapped(`${p.guests.count} ${p.guests.count === 1 ? 'guest' : 'guests'}`, 'buoy-calendar-page-text'),
                wrapped(p.guests.line, 'buoy-calendar-page-sub'),
            ];
            p.guests.people.forEach(g => parts.push(person(g)));
            box.add_child(infoRow(pageIcon('system-users-symbolic'), parts));
        }
        if (p.description)
            box.add_child(infoRow(pageIcon('format-justify-left-symbolic'), [wrapped(p.description, 'buoy-calendar-page-text')]));
        if (p.reminders.length)
            box.add_child(infoRow(pageIcon('appointment-soon-symbolic'), p.reminders.map(r => wrapped(r, 'buoy-calendar-page-text'))));
        if (cal?.name)
            box.add_child(infoRow(pageIcon('x-office-calendar-symbolic'), [wrapped(cal.name, 'buoy-calendar-page-text')]));
        return box;
    }

    // Settings → Online Accounts, as Shell opens a panel (ui/status/network.js
    // launchSettingsPanel)
    _accountsButton() {
        const button = new St.Button({
            style_class: 'buoy-calendar-accounts', can_focus: true, child: iconLabel('external-link-symbolic', 'Add an Online Account'),
            accessible_name: 'Add an Online Account',
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

// Nothing on the picked day: Bu asleep over the words (2026-11-08, Ethan), in the list —
// not EmptyState, which fills the panel
// `fill`: centred in the space under the title, from the title's text edge (2026-11-08)
function restingBu(text, fill = false) {
    const box = new St.BoxLayout({
        style_class: 'buoy-calendar-none', orientation: Clutter.Orientation.VERTICAL,
        // the column's width, so its padding-left (the title's) moves the centre; Bu and
        // the words centre inside
        x_expand: true, x_align: Clutter.ActorAlign.FILL,
        y_expand: fill, y_align: fill ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
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

// a row of the event's page: its icon (or the calendar's square) in a column of its own, then
// its lines
function infoRow(lead, lines, styleClass = 'buoy-calendar-page-row') {
    const row = new St.BoxLayout({style_class: styleClass, x_expand: true});
    lead.y_align = Clutter.ActorAlign.START;
    row.add_child(lead);
    const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'buoy-calendar-page-lines'});
    lines.forEach(l => col.add_child(l));
    row.add_child(col);
    return row;
}

function pageIcon(name) {
    return new St.Icon({...iconProps(name), icon_size: 16, style_class: 'buoy-calendar-page-icon'});
}

function wrapped(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, x_expand: true});
    l.clutter_text.line_wrap = true;
    l.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    l.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    return l;
}

// a guest: the first letter in a circle, how they answered on it (✓ yes, × no, ? maybe or not
// yet), the address or name, "Organizer" under it
function person(g) {
    const row = new St.BoxLayout({style_class: 'buoy-calendar-person', x_expand: true});
    const face = new St.Widget({layout_manager: new Clutter.BinLayout(), style_class: 'buoy-calendar-face'});
    face.add_child(new St.Label({
        text: (g.name || g.email).charAt(0).toUpperCase(), x_expand: true, y_expand: true,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
    }));
    const badge = new St.Bin({
        style_class: `buoy-calendar-badge buoy-calendar-badge-${g.status}`, x_expand: true, y_expand: true,
        x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.END,
    });
    badge.set_child(g.status === 'yes' || g.status === 'no'
        ? new St.Icon({...iconProps(g.status === 'yes' ? 'object-select-symbolic' : 'window-close-symbolic'), icon_size: 8})
        : new St.Label({text: '?'}));
    face.add_child(badge);
    row.add_child(face);
    const who = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    const name = new St.Label({text: g.name || g.email, style_class: 'buoy-calendar-page-text'});
    name.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    who.add_child(name);
    if (g.organizer)
        who.add_child(new St.Label({text: 'Organizer', style_class: 'buoy-calendar-page-sub'}));
    row.add_child(who);
    return row;
}
