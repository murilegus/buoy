import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {buildElement, iconProps} from '../../kit/ui/present/elements.js';
import {tick} from '../../kit/ui/present/parts.js';
import {MAX_SECONDS, QUICK, clockText, hourText, ordered, remaining, savedLength, setupText, titleOf} from './model.js';
import {store} from './store.js';

const RING = 116;
const RING_W = 6;

/**
 * The tab's ring (design/compact "Hẹn giờ", 2): 116, a 6 px line; the part left in the
 * stylesheet's colour (fg), the track at .2 of it (fill-3), from 12 o'clock.
 *
 * @param {number} value  the part left, 0..1
 * @returns {St.DrawingArea & {setValue: function(number):void}}
 */
function bigRing(value) {
    const area = /** @type {any} */ (new St.DrawingArea({style_class: 'buoy-timer-ring', width: RING, height: RING}));
    area.setValue = v => {
        value = v;
        area.queue_repaint();
    };
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const c = area.get_theme_node().get_foreground_color();
        const r = (Math.min(w, h) - RING_W) / 2;
        cr.setLineWidth(RING_W);
        cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, 0.2);
        cr.arc(w / 2, h / 2, r, 0, 2 * Math.PI);
        cr.stroke();
        if (value > 0) {
            cr.setLineCap(1);   // Cairo.LineCap.ROUND
            cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, 1);
            cr.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + value * 2 * Math.PI);
            cr.stroke();
        }
        cr.$dispose();
    });
    return area;
}

const icon = (name, size = 16) => new St.Icon({...iconProps(name), icon_size: size, y_align: Clutter.ActorAlign.CENTER});
const text = (t, styleClass) => new St.Label({text: t, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});

/**
 * A round button: an icon, a label, or both; `main`: cream (fill-inverse), the one to press.
 *
 * @param {{icon?: string, label?: string, main?: boolean, name?: string}} o
 * @param {function():void} fn
 * @returns {St.Button}
 */
function button({icon: ic = null, label = null, main = false, name = null}, fn) {
    const face = new St.BoxLayout({style_class: 'buoy-timer-face', x_align: Clutter.ActorAlign.CENTER});
    if (ic)
        face.add_child(icon(ic));
    if (label)
        face.add_child(text(label, ''));
    const b = new St.Button({
        style_class: `buoy-timer-button${main ? ' buoy-timer-main' : ''}`, can_focus: true, x_expand: true,
        accessible_name: label ?? name ?? '', child: face,
    });
    b.connect('clicked', () => fn());
    return b;
}

/**
 * The Timer tab (FEATURES M4 "Timer"; design/compact "Hẹn giờ", 2026-11-22, Ethan), in ⋯.
 *
 * Left: the length to start (h:mm:ss, − / + a minute, the quick lengths, Start; Save when that
 * length is not saved), or, with a timer chosen, its ring, what is left and its buttons. Right:
 * the timers running, then the saved ones — GNOME Clocks' own list and Pomodoro; ▶ starts one,
 * a right click edits it (its name, the length on the left, delete). Esc goes back from a timer
 * to the setup, then leaves (back()). Everything it does goes through store.actions (source.js).
 */
export class TimerTab {
    constructor({width = 536} = {}) {
        this._width = width;
        this._seconds = store.last;
        this._editing = -1;             // the preset being edited, or -1
        this._setup = !store.timers.length;  // the setup on the left; with timers, the soonest's ring
        this.actor = new St.BoxLayout({style_class: 'buoy-timer', x_expand: true, y_expand: true});
        this._left = new St.BoxLayout({style_class: 'buoy-timer-left', orientation: Clutter.Orientation.VERTICAL, y_expand: true});
        this._left.set_width(Math.round((width - 16) * 0.44));
        this._list = new St.BoxLayout({style_class: 'buoy-timer-list', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const scroll = new St.ScrollView({
            style_class: 'buoy-timer-scroll', x_expand: true, y_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        scroll.set_child(this._list);
        this.actor.add_child(this._left);
        this.actor.add_child(scroll);
        this._unlisten = store.listen(() => this._draw());
        this._draw();
    }

    /** The kit's update with this kind's activities: the tab reads the store instead. */
    update() {}

    // the timer the left shows: the chosen one, else the soonest; none in the setup
    _current() {
        if (this._setup)
            return null;
        const list = ordered(store.timers, Date.now());
        return list.find(t => t.id === store.selected) ?? list[0] ?? null;
    }

    _draw() {
        if (!this.actor)
            return;
        if (!store.timers.length)
            this._setup = true;
        this._left.destroy_all_children();
        this._list.destroy_all_children();
        const t = this._current();
        if (t)
            this._drawTimer(t);
        else
            this._drawSetup();
        this._drawList(t);
    }

    // --- the left: the setup ------------------------------------------------------------------------
    _drawSetup() {
        const row = new St.BoxLayout({style_class: 'buoy-timer-setup', x_expand: true});
        const value = text(setupText(this._seconds), 'buoy-timer-value');
        value.x_expand = true;
        value.x_align = Clutter.ActorAlign.CENTER;
        const step = d => {
            this._seconds = Math.max(60, Math.min(MAX_SECONDS, this._seconds + d * 60));
            this._draw();
        };
        row.add_child(this._round('list-remove-symbolic', 'One minute less', () => step(-1)));
        row.add_child(value);
        row.add_child(this._round('list-add-symbolic', 'One minute more', () => step(1)));
        this._left.add_child(row);
        const chips = new St.BoxLayout({style_class: 'buoy-timer-chips', x_expand: true});
        for (const m of QUICK) {
            const on = this._seconds === m * 60;
            const c = new St.Button({
                style_class: `buoy-timer-chip${on ? ' buoy-timer-chip-on' : ''}`, label: String(m), can_focus: true,
                x_expand: true, accessible_name: `${m} min`,
            });
            c.connect('clicked', () => {
                this._seconds = m * 60;
                this._draw();
            });
            chips.add_child(c);
        }
        this._left.add_child(chips);
        const unit = text('min', 'buoy-timer-unit');
        unit.x_align = Clutter.ActorAlign.CENTER;
        this._left.add_child(unit);
        this._left.add_child(new St.Widget({y_expand: true}));
        const buttons = new St.BoxLayout({style_class: 'buoy-timer-buttons', x_expand: true});
        if (this._editing >= 0) {
            buttons.add_child(button({label: 'Save', icon: 'object-select-symbolic', main: true}, () => this._saveEdit()));
        } else {
            const start = button({label: 'Start', icon: 'media-playback-start-symbolic', main: true}, () => this._startSetup());
            buttons.add_child(start);
            if (store.clocks && !savedLength(store.presets, this._seconds))
                buttons.add_child(button({label: 'Save', icon: 'list-add-symbolic'}, () => store.actions?.savePreset({seconds: this._seconds, name: ''})));
        }
        this._left.add_child(buttons);
    }

    _round(ic, name, fn) {
        const b = new St.Button({style_class: 'buoy-timer-round', can_focus: true, accessible_name: name, child: icon(ic)});
        b.connect('clicked', () => fn());
        return b;
    }

    _startSetup() {
        store.actions?.start({seconds: this._seconds, name: ''});
        this._setup = false;
    }

    // --- the left: a timer ------------------------------------------------------------------------------
    _drawTimer(t) {
        const paused = t.state === 'paused';
        const now = Date.now();
        const total = t.seconds * 1000;
        const ring = bigRing(remaining(t, now) / total);
        const left = text(clockText(remaining(t, now)), 'buoy-timer-left-value');
        const lines = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        for (const l of [left, text(titleOf(t), 'buoy-timer-name'), text(paused ? 'Paused' : `ends ${hourText(t.end)}`, 'buoy-timer-ends')]) {
            l.x_align = Clutter.ActorAlign.CENTER;
            lines.add_child(l);
        }
        const stack = new St.Widget({layout_manager: new Clutter.BinLayout(), x_align: Clutter.ActorAlign.CENTER, y_expand: true});
        stack.add_child(ring);
        stack.add_child(lines);
        this._left.add_child(stack);
        if (!paused) {
            // once a second while shown (parts.js tick): the ring and the number
            tick(ring, () => {
                const ms = remaining(t, Date.now());
                ring.setValue(ms / total);
                left.text = clockText(ms);
            }, () => Date.now() < t.end);
        }
        const buttons = new St.BoxLayout({style_class: 'buoy-timer-buttons', x_expand: true});
        const a = store.actions;
        const pr = paused
            ? button({icon: 'media-playback-start-symbolic', main: true, name: 'Resume'}, () => a?.resume(t.id))
            : button({icon: 'media-playback-pause-symbolic', main: true, name: 'Pause'}, () => a?.pause(t.id));
        buttons.add_child(pr);
        buttons.add_child(button({label: '+1 min'}, () => a?.add(t.id)));
        buttons.add_child(button({icon: 'media-playback-stop-symbolic', name: 'Stop'}, () => a?.stop(t.id)));
        this._left.add_child(buttons);
    }

    // --- the right: running, then saved ----------------------------------------------------------------
    _drawList(current) {
        const now = Date.now();
        const running = ordered(store.timers, now);
        if (running.length) {
            this._list.add_child(text('RUNNING', 'buoy-timer-header'));
            for (const t of running) {
                const row = this._row({
                    lead: t.state === 'paused' ? {progress: remaining(t, now) / (t.seconds * 1000)} : {ring: {from: t.end - t.seconds * 1000, until: t.end}},
                    name: titleOf(t),
                    end: t.state === 'paused' ? {text: clockText(remaining(t, now))} : {until: t.end},
                    on: current?.id === t.id,
                }, () => {
                    store.selected = t.id;
                    this._setup = false;
                    this._draw();
                });
                this._list.add_child(row);
            }
            this._list.add_child(this._row({lead: 'list-add-symbolic', name: 'New Timer'}, () => {
                this._setup = true;
                this._draw();
            }));
        }
        this._list.add_child(text(store.clocks ? 'SAVED · SHARED WITH CLOCKS' : 'SAVED', 'buoy-timer-header'));
        const p = store.pomodoro ?? {work: 25, break: 5, rounds: 4};
        this._list.add_child(this._row({name: 'Pomodoro', chip: `×${p.rounds}`, end: {text: `${p.work} + ${p.break}`}, play: true},
            () => store.actions?.startPomodoro()));
        store.presets.forEach((s, i) => {
            if (i === this._editing) {
                this._list.add_child(this._editRow(s, i));
                return;
            }
            const row = this._row({name: s.name || clockText(s.seconds * 1000), end: {text: clockText(s.seconds * 1000)}, play: true},
                () => {
                    store.actions?.start({seconds: s.seconds, name: s.name});
                    this._setup = false;
                });
            // a right click, the menu key or Delete: edit it, or delete it
            row.connect('button-press-event', (_a, ev) => {
                if (ev.get_button() !== Clutter.BUTTON_SECONDARY)
                    return Clutter.EVENT_PROPAGATE;
                this._edit(i);
                return Clutter.EVENT_STOP;
            });
            row.connect('key-press-event', (_a, ev) => {
                const k = ev.get_key_symbol();
                if (k === Clutter.KEY_Delete) {
                    store.actions?.deletePreset(i);
                    return Clutter.EVENT_STOP;
                }
                if (k === Clutter.KEY_Menu) {
                    this._edit(i);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            this._list.add_child(row);
        });
    }

    /**
     * @param {{lead?: *, name: string, chip?: string, end?: *, on?: boolean, play?: boolean}} o
     * @param {function():void} fn
     * @returns {St.Button}
     */
    _row({lead = null, name, chip = null, end = null, on = false, play = false}, fn) {
        const line = new St.BoxLayout({style_class: 'buoy-timer-line', x_expand: true});
        const l = lead ? buildElement(lead) : null;
        if (l)
            line.add_child(l);
        const n = text(name, 'buoy-timer-row-name');
        n.clutter_text.ellipsize = 3;   // Pango.EllipsizeMode.END
        line.add_child(n);
        if (chip)
            line.add_child(text(chip, 'buoy-timer-row-chip'));
        line.add_child(new St.Widget({x_expand: true}));
        const e = end ? buildElement(end) : null;
        if (e)
            line.add_child(e);
        if (play)
            line.add_child(new St.Bin({style_class: 'buoy-timer-play', child: icon('media-playback-start-symbolic', 14)}));
        const row = new St.Button({
            style_class: `buoy-timer-row${on ? ' buoy-timer-row-on' : ''}`, can_focus: true, x_expand: true,
            accessible_name: name, child: line,
        });
        row.connect('clicked', () => fn());
        return row;
    }

    _edit(i) {
        this._editing = i;
        this._setup = true;
        this._seconds = store.presets[i]?.seconds ?? this._seconds;
        this._draw();
    }

    // a saved timer being edited: its name in an entry, delete; its length is the setup's
    _editRow(s, i) {
        const line = new St.BoxLayout({style_class: 'buoy-timer-row buoy-timer-row-on buoy-timer-line', x_expand: true});
        this._entry = new St.Entry({style_class: 'buoy-timer-entry', text: s.name, hint_text: 'Name', can_focus: true, x_expand: true});
        this._entry.clutter_text.connect('activate', () => this._saveEdit());
        line.add_child(this._entry);
        line.add_child(this._round('user-trash-symbolic', 'Delete', () => {
            this._editing = -1;
            store.actions?.deletePreset(i);
        }));
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._entry?.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });
        return line;
    }

    _saveEdit() {
        const i = this._editing;
        this._editing = -1;
        if (i >= 0 && store.presets[i])
            store.actions?.editPreset(i, {seconds: this._seconds, name: this._entry?.get_text().trim() ?? ''});
        this._entry = null;
        this._draw();
    }

    /** ‹ / Esc: an edit, then a timer, go back to the setup; then the tab has nothing more. */
    back() {
        if (this._editing >= 0) {
            this._editing = -1;
            this._entry = null;
            this._draw();
            return true;
        }
        if (!this._setup && store.timers.length) {
            this._setup = true;
            store.selected = null;
            this._draw();
            return true;
        }
        return false;
    }

    destroy() {
        this._unlisten?.();
        this._unlisten = null;
        this.actor?.destroy();
        this.actor = null;
    }
}
