import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {SIZE as GRID, cells, frameAt, helloAt, lampColour, moves} from '../../model/mascot.js';
import {TYPE_MS, typedSplit} from '../../model/presentation.js';
import {label} from './parts.js';

// What moves, each only as ARCHITECTURE rule 8 allows: the marquee, Bu, the equaliser and
// typed text. Split out of present.js (2026-11-12).

// A long title scrolls right to left — the compact's, and the Media tab's through
// marquee() (2026-11-05, Ethan): rests MARQUEE_PAUSE at the start, then slides one copy
// plus the gap out while a second copy follows it in, so each loop ends where it began.
// Only while the title overflows, it is mapped and animations are on (ARCHITECTURE
// rule 8); otherwise it stands still, ellipsized. One Clutter.Timeline on the frame clock;
// translation only, no relayout.
const MARQUEE_GAP = 40;       // px between the copies
const MARQUEE_SPEED = 30;     // px per second
const MARQUEE_PAUSE = 2000;   // ms at the start of each loop

const Marquee = GObject.registerClass(
class Marquee extends St.Widget {
    _init(text, styleClass) {
        super._init({clip_to_allocation: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._first = label(text, styleClass);
        this._second = label(text, styleClass);
        this.add_child(this._first);
        this.add_child(this._second);
        this._dist = 0;          // the scroll per loop; 0 = fits or held still
        this._overflow = false;
        this._timeline = null;
        this._animId = 0;
        this._settings = St.Settings.get();
        this.connect('notify::mapped', () => {
            if (this._animId)
                this._settings.disconnect(this._animId);
            this._animId = this.mapped
                ? this._settings.connect('notify::enable-animations', () => {
                    this.queue_relayout();
                    this._sync();
                })
                : 0;
            // allocate() decides moving or not with mapped and the setting: ask it again
            this.queue_relayout();
            this._sync();
        });
        this.connect('destroy', () => {
            if (this._animId)
                this._settings.disconnect(this._animId);
            this._animId = 0;
            this._stop();
        });
    }

    // Asks for nothing: the column gives what it has, the copies are clipped to it.
    /**
     * @param {number} forHeight
     * @returns {[number, number]}
     */
    vfunc_get_preferred_width(forHeight) {
        const [, nat] = this._first.get_preferred_width(forHeight);
        return [0, nat];
    }

    vfunc_get_preferred_height(_forWidth) {
        return this._first.get_preferred_height(-1);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const w = box.get_width(), h = box.get_height();
        const [, nat] = this._first.get_preferred_width(h);
        this._overflow = nat > w + 0.5;
        const moving = this._overflow && this.mapped && this._settings.enable_animations;
        const one = new Clutter.ActorBox();
        one.set_origin(0, 0);
        one.set_size(moving ? nat : w, h);
        this._first.allocate(one);
        const two = new Clutter.ActorBox();
        two.set_origin(moving ? nat + MARQUEE_GAP : w + MARQUEE_GAP, 0);
        two.set_size(nat, h);
        this._second.allocate(two);
        const dist = moving ? nat + MARQUEE_GAP : 0;
        if (dist !== this._dist) {
            this._dist = dist;
            this._sync();
        }
    }

    _stop() {
        this._timeline?.stop();
        this._timeline = null;
        this._first.translation_x = this._second.translation_x = 0;
    }

    _sync() {
        this._stop();
        if (!this._dist || !this.mapped || !this._settings.enable_animations)
            return;
        const dist = this._dist;
        const scrollMs = dist / MARQUEE_SPEED * 1000;
        this._timeline = new Clutter.Timeline({
            actor: this, duration: Math.round(MARQUEE_PAUSE + scrollMs), repeat_count: -1,
        });
        this._timeline.connect('new-frame', tl => {
            const t = tl.get_elapsed_time() - MARQUEE_PAUSE;
            const x = t > 0 ? -Math.round(dist * Math.min(t / scrollMs, 1)) : 0;
            this._first.translation_x = this._second.translation_x = x;
        });
        this._timeline.start();
    }
});

/**
 * A one-line label that scrolls when its text is wider than the room it gets (above);
 * for a module's tab.js (the Media tab's title).
 *
 * @param {string} text
 * @param {string} styleClass  the label's
 * @returns {St.Widget}
 */
export function marquee(text, styleClass) {
    return new Marquee(text, styleClass);
}

// --- Bu (MASCOT.md) ------------------------------------------------------------------

// Bu holds still while nobody is at the desk (`mascot-rest-after` s without input, 60 by
// default, on the core idle monitor as ui/messageTray.js uses it; UNINHIBITABLE so a
// playing video does not keep it moving, mutter meta-idle-monitor.c
// update_inhibited_watch) or with animations off (St.Settings enable-animations, which
// also counts Shell's inhibitors). The watches and the settings signal exist only while
// a moving Bu is mapped.
const stillness = {
    _subs: new Set(),
    _restMs: 60 * 1000,
    _away: false,
    _idleId: 0,
    _activeId: 0,
    _animId: 0,

    get held() {
        return this._away || !St.Settings.get().enable_animations;
    },

    /**
     * @param {function():void} cb  called when `held` may have changed
     * @returns {function():void} unsubscribe
     */
    subscribe(cb) {
        if (!this._subs.size)
            this._start();
        this._subs.add(cb);
        return () => {
            if (this._subs.delete(cb) && !this._subs.size)
                this._stop();
        };
    },

    _start() {
        const monitor = global.backend.get_core_idle_monitor();
        this._away = false;
        // fires at once when already idle that long (its ready time counts from the
        // last event, meta-idle-monitor.c make_watch)
        this._idleId = monitor.add_idle_watch_full(this._restMs, () => this._setAway(true),
            Meta.IdleMonitorWatchFlags.UNINHIBITABLE);
        this._animId = St.Settings.get().connect('notify::enable-animations', () => this._emit());
    },

    _setAway(away) {
        this._away = away;
        if (away && !this._activeId) {
            // one-shot: Mutter removes it once fired (meta_idle_monitor_watch_fire)
            this._activeId = global.backend.get_core_idle_monitor().add_user_active_watch(() => {
                this._activeId = 0;
                this._setAway(false);
            });
        }
        this._emit();
    },

    _emit() {
        for (const cb of [...this._subs])
            cb();
    },

    setRest(ms) {
        if (ms === this._restMs)
            return;
        this._restMs = ms;
        if (!this._subs.size)
            return;
        this._stop();    // a new watch; one already idle that long fires at once
        this._start();
        this._emit();
    },

    _stop() {
        const monitor = global.backend.get_core_idle_monitor();
        for (const id of [this._idleId, this._activeId]) {
            if (id)
                monitor.remove_watch(id);
        }
        this._idleId = this._activeId = 0;
        if (this._animId)
            St.Settings.get().disconnect(this._animId);
        this._animId = 0;
        this._away = false;
    },
};

/**
 * How long without input before a moving Bu holds still (`mascot-rest-after`, set by the
 * extension from GSettings; present.js has no settings of its own).
 *
 * @param {number} seconds
 */
export function setMascotRest(seconds) {
    stillness.setRest(Math.max(1, seconds) * 1000);
}

// When each Bu was first shown, per activity surface and pose: content is rebuilt on
// every update, light change and hover, and a rebuilt Bu carries on (a once pose does not
// replay). A short list: an entry outlives its activity only until 32 newer ones.
const STARTS = new Map();
const STARTS_MAX = 32;
const now = () => GLib.get_monotonic_time() / 1000;

/**
 * Forget when every Bu and typed text started: the stack is made anew on each enable, its
 * surface counter starts again at 1, and a new activity must not inherit an old one's
 * start (Bu would not wave, the text would be typed in already). Called on disable.
 */
export function forgetStarts() {
    STARTS.clear();
}

function startOf(key) {
    if (!STARTS.has(key)) {
        STARTS.set(key, now());
        if (STARTS.size > STARTS_MAX)
            STARTS.delete(STARTS.keys().next().value);
    }
    return STARTS.get(key);
}

// A stale activity is dimmed (CONTRACT.md §1): its text and icons turn fg-subtle (50 %) in
// CSS; Bu's palette is fixed, so he is dimmed to the same 50 % (design/colours, 2026-11-11).
const STALE_OPACITY = 128;

function dimMascots(actor) {
    for (const a of actor.get_children()) {
        if (a.has_style_class_name?.('buoy-mascot'))
            a.opacity = STALE_OPACITY;
        else
            dimMascots(a);
    }
}

/**
 * Dims an actor as the pills dim a stale activity (grey text and icons, Bu at 40 %): for
 * a module's tab.js, so its rows match the pill (the Claude Code tab, 2026-11-07).
 *
 * @param {St.Widget} box
 */
export function dimStale(box) {
    box.add_style_class_name('buoy-stale');
    dimMascots(box);
}

const rgb = hex => /** @type {[number, number, number]} */ ([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255));

/**
 * One St.DrawingArea painting Bu's grid in MASCOT.md's palette; the lamp in the pose's
 * colour (kit/model/mascot.js lampColour). A moving pose swaps two
 * frames every 500 ms with one timer, only while mapped and not held still; gone on
 * unmap, destroy, and with it on pose change and disable (the content is rebuilt).
 *
 * @param {object} e  {type: 'mascot', pose}
 * @param {number} size  px, a multiple of 10
 * @param {?object} activity  for where the pose started (id and surface)
 * @returns {St.DrawingArea}
 */
export function mascot(e, size, activity) {
    const area = new St.DrawingArea({style_class: 'buoy-mascot', y_align: Clutter.ActorAlign.CENTER});
    const px = e.size ?? size;      // the adapter's size (expanded greeting), else the mode's
    area.set_size(px, px);
    const start = startOf(`${activity?.id}\u0000${activity?._seq}\u0000${e.pose}`);
    // `hello`: wave for HELLO_MS, then idle, as the About page (kit/model/mascot.js helloAt)
    const frame = held => e.hello
        ? helloAt(now() - start, {still: held})
        : frameAt(e.pose, now() - start, {still: held});
    let shown = frame(false);
    let timer = 0, unsubscribe = null;

    const clear = () => {
        if (timer)
            GLib.source_remove(timer);
        timer = 0;
    };
    const step = () => {
        clear();
        const f = frame(unsubscribe ? stillness.held : false);
        if (f.frame !== shown.frame || f.pose !== shown.pose) {
            shown = f;
            area.queue_repaint();
        }
        if (f.nextIn !== null && unsubscribe) {
            timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1, Math.ceil(f.nextIn)), () => {
                timer = 0;
                step();
                return GLib.SOURCE_REMOVE;
            });
        }
    };
    const stop = () => {
        clear();
        unsubscribe?.();
        unsubscribe = null;
    };
    if (moves(e.pose) || e.hello) {
        area.connect('notify::mapped', () => {
            stop();
            if (area.mapped)
                unsubscribe = stillness.subscribe(step);
            step();
        });
        area.connect('destroy', stop);
    }

    area.connect('repaint', () => {
        const cr = area.get_context();
        const [w] = area.get_surface_size();
        const cell = w / GRID;
        cr.setAntialias(Cairo.Antialias.NONE);  // crisp cells (MASCOT.md: no partial opacity)
        for (const c of cells(shown.frame, lampColour(shown.pose))) {
            cr.setSourceRGB(...rgb(c.colour));
            cr.rectangle(c.x * cell, c.y * cell, c.w * cell, cell);
            cr.fill();
        }
        cr.$dispose();
    });
    return area;
}

// Each bar: its height at rest and the range and half-period it swings through while
// playing. Unequal periods keep the four out of step, so the motion never visibly repeats.
// Paused: the bars stopped low, 4 · 6 · 4 · 2 px of their 12 (Ethan, 2026-11-07: a
// near flat line, each a little different, 2 px apart)
const EQ_PAUSED = [4, 6, 4, 2].map(px => px / 12);

const EQ_BARS = [
    {rest: 0.5, from: 0.25, to: 1, ms: 430},
    {rest: 0.85, from: 0.45, to: 1, ms: 610},
    {rest: 0.65, from: 0.2, to: 0.85, ms: 520},
    {rest: 0.4, from: 0.3, to: 0.95, ms: 690},
];

/**
 * The equaliser (SPEC §6 media): four 12 px bars that grow from their middle, up and
 * down at once (2026-11-05, Ethan). While mapped they stretch and shrink, one endless
 * auto-reversing transition per bar on `scale-y`
 * (a transform: no relayout, no repaint of anything else); unmapped, or with animations
 * off (St.Settings enable-animations), they stand at rest and no transition exists. An
 * activity shows it only while playing (ARCHITECTURE rule 8: this is an activity, not
 * idle). Unlike Bu it does not rest after `mascot-rest-after`: music plays without input.
 * Paused (`eq-paused`): the same bars stopped low, a near flat line through the middle,
 * with no transition and nothing connected (2026-11-07, Ethan).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.paused]
 * @returns {St.BoxLayout}
 */
export function eqGlyph({paused = false} = {}) {
    const box = new St.BoxLayout({style_class: 'buoy-eq', y_align: Clutter.ActorAlign.CENTER});
    if (paused) {
        for (const scale of EQ_PAUSED) {
            box.add_child(new St.Widget({
                style_class: 'buoy-eq-bar', y_align: Clutter.ActorAlign.CENTER,
                pivot_point: new Graphene.Point({x: 0.5, y: 0.5}), scale_y: scale,
            }));
        }
        return box;
    }
    const bars = EQ_BARS.map(b => {
        const bar = new St.Widget({
            style_class: 'buoy-eq-bar', y_align: Clutter.ActorAlign.CENTER,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}), scale_y: b.rest,
        });
        box.add_child(bar);
        return bar;
    });
    const settings = St.Settings.get();
    let animId = 0;
    const still = () => {
        bars.forEach((bar, i) => {
            bar.remove_transition('buoy-eq');
            bar.scale_y = EQ_BARS[i].rest;
        });
    };
    const sync = () => {
        still();
        if (!box.mapped || !settings.enable_animations)
            return;
        bars.forEach((bar, i) => {
            const b = EQ_BARS[i];
            const t = new Clutter.PropertyTransition({
                property_name: 'scale-y',
                interval: new Clutter.Interval({value_type: GObject.TYPE_DOUBLE}),
                duration: b.ms, repeat_count: -1, auto_reverse: true,
                progress_mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
            });
            t.set_from(b.from);
            t.set_to(b.to);
            bar.add_transition('buoy-eq', t);
        });
    };
    const disconnect = () => {
        if (animId)
            settings.disconnect(animId);
        animId = 0;
    };
    box.connect('notify::mapped', () => {
        disconnect();
        if (box.mapped)
            animId = settings.connect('notify::enable-animations', sync);
        sync();
    });
    box.connect('destroy', () => {
        disconnect();
        still();
    });
    return box;
}

/**
 * Typed in (GREETING.md principle 7): the labels fill a character at a time, one after
 * another. The text not yet typed is there but transparent (Pango alpha), so the size never
 * moves while it types. How far it got comes from when this activity first showed it, so a
 * rebuild (an update, a re-render) goes on where it was. One timer while mapped and
 * typing; none once all is in, unmapped, destroyed, or with animations off (whole at once).
 *
 * @param {St.Label[]} labels
 * @param {?object} activity  for where the typing started (id and surface)
 */
export function typeIn(labels, activity) {
    if (!labels.length)
        return;
    const texts = labels.map(l => l.text);
    const total = texts.reduce((n, t) => n + [...t].length, 0);
    const start = startOf(`${activity?.id}\u0000${activity?._seq}\u0000typed`);
    const draw = chars => typedSplit(texts, chars).forEach((n, i) => {
        const all = [...texts[i]];
        const shown = GLib.markup_escape_text(all.slice(0, n).join(''), -1);
        const rest = GLib.markup_escape_text(all.slice(n).join(''), -1);
        labels[i].clutter_text.set_markup(rest ? `${shown}<span alpha="1">${rest}</span>` : shown);
    });
    let timer = 0;
    const stop = () => {
        if (timer)
            GLib.source_remove(timer);
        timer = 0;
    };
    const typeStep = () => {
        const chars = St.Settings.get().enable_animations ? Math.floor((now() - start) / TYPE_MS) : total;
        draw(Math.min(chars, total));
        return chars < total;
    };
    const area = labels[0];
    area.connect('notify::mapped', () => {
        stop();
        if (!area.mapped || !typeStep())
            return;
        timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TYPE_MS, () => {
            if (typeStep())
                return GLib.SOURCE_CONTINUE;
            timer = 0;
            return GLib.SOURCE_REMOVE;
        });
    });
    area.connect('destroy', stop);
    typeStep();
}
