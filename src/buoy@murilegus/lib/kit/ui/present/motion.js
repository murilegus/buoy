import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {SIZE as GRID, cells, frameAt, helloAt, lampColour, moves} from '../../model/mascot.js';
import {TYPE_MS, nextTurn, typedLine, typedSplit} from '../../model/presentation.js';
import {label} from './parts.js';

// What moves, each only as ARCHITECTURE rule 8 allows: the marquee, Bu, the equaliser and
// typed text. Split out of present.js (2026-11-12).

// A long title scrolls right to left — the compact's, and the Media tab's through
// marquee() (2026-11-05, Ethan): rests MARQUEE_PAUSE at the start, then slides one copy
// plus the gap out while a second copy follows it in, so each loop ends where it began.
// Only while the title overflows, it is mapped and animations are on (ARCHITECTURE
// rule 8); otherwise it stands still, ellipsized. One Clutter.Timeline on the frame clock;
// translation only, no relayout.
//
// Lines that share a MarqueeTurns take turns (the Media tab's three, design/media
// 2026-11-13, Ethan): one loop each, one at a time, the others still at their start —
// clipped, not ellipsized, since they will run.
const MARQUEE_GAP = 40;       // px between the copies
const MARQUEE_SPEED = 30;     // px per second
const MARQUEE_PAUSE = 2000;   // ms at the start of each loop

const Marquee = GObject.registerClass(
class Marquee extends St.Widget {
    _init(text, styleClass, turns = null) {
        super._init({clip_to_allocation: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._turns = turns;
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
            this._turns?.remove(this);
        });
        this._turns?.add(this);
    }

    /** Long, shown, animations on: it can take a turn. */
    get ready() {
        return this._dist > 0 && this.mapped && this._settings.enable_animations;
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
        if (this._turns) {
            this._turns.changed(this);
            return;
        }
        if (this.ready)
            this._run(-1);
    }

    // one loop (`repeat` 0, then `done`) or loops for ever (-1)
    _run(repeat, done = null) {
        this._stop();
        const dist = this._dist;
        const scrollMs = dist / MARQUEE_SPEED * 1000;
        this._timeline = new Clutter.Timeline({
            actor: this, duration: Math.round(MARQUEE_PAUSE + scrollMs), repeat_count: repeat,
        });
        this._timeline.connect('new-frame', tl => {
            const t = tl.get_elapsed_time() - MARQUEE_PAUSE;
            const x = t > 0 ? -Math.round(dist * Math.min(t / scrollMs, 1)) : 0;
            this._first.translation_x = this._second.translation_x = x;
        });
        // stop() does not emit 'completed' (clutter-timeline.c clutter_timeline_stop), so a
        // loop cut short by _stop() hands no turn on
        if (done) {
            this._timeline.connect('completed', () => {
                this._stop();
                done();
            });
        }
        this._timeline.start();
    }

    /** @param {function():void} done  called once the loop ends where it began */
    runOnce(done) {
        this._run(0, done);
    }

    halt() {
        this._stop();
    }
});

// Who runs among lines that take turns: the kit's only scheduler of them, no timer of its
// own — each loop's end (its Timeline's 'completed') starts the next (nextTurn).
class MarqueeTurns {
    constructor() {
        /** @type {any[]} */
        this._lines = [];
        this._current = null;
        this._last = -1;
    }

    add(line) {
        this._lines.push(line);
    }

    remove(line) {
        const i = this._lines.indexOf(line);
        if (i < 0)
            return;
        this._lines.splice(i, 1);
        if (this._last >= i)
            this._last--;
        if (this._current === line) {
            this._current = null;
            this._next();
        }
    }

    // a line's length, mapping or the setting changed (its own loop already stopped)
    changed(line) {
        if (this._current === line) {
            this._current = null;
            this._last = this._lines.indexOf(line) - 1;    // it again, if it still can
        } else if (this._current && !this._current.ready) {
            this._current.halt();
            this._current = null;
        }
        if (!this._current)
            this._next();
    }

    _next() {
        const i = nextTurn(this._lines.map(l => l.ready), this._last);
        if (i < 0)
            return;
        const line = this._lines[i];
        this._current = line;
        this._last = i;
        line.runOnce(() => {
            if (this._current !== line)
                return;
            this._current = null;
            this._next();
        });
    }
}

/**
 * Lines that take turns running (above): pass the same one to each marquee().
 *
 * @returns {MarqueeTurns}
 */
export function marqueeTurns() {
    return new MarqueeTurns();
}

/**
 * A one-line label that scrolls when its text is wider than the room it gets (above);
 * for a module's tab.js (the Media tab's title).
 *
 * @param {string} text
 * @param {string} styleClass  the label's
 * @param {?MarqueeTurns} [turns]  shared by lines that take turns (marqueeTurns())
 * @returns {St.Widget}
 */
export function marquee(text, styleClass, turns = null) {
    return new Marquee(text, styleClass, turns);
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
// playing. Unequal periods keep the six out of step, so the motion never visibly repeats.
// Paused: the bars stopped low, 4 · 6 · 7 · 5 · 6 · 3 px of their 14 (Ethan, 2026-11-07: a
// near flat line, each a little different, 2 px apart; six bars since 2026-11-13)
const EQ_PAUSED = [4, 6, 7, 5, 6, 3].map(px => px / 14);

const EQ_BARS = [
    {rest: 0.45, from: 0.25, to: 0.9, ms: 430},
    {rest: 0.8, from: 0.4, to: 1, ms: 610},
    {rest: 1, from: 0.5, to: 1, ms: 520},
    {rest: 0.6, from: 0.2, to: 0.85, ms: 690},
    {rest: 0.85, from: 0.35, to: 1, ms: 470},
    {rest: 0.4, from: 0.25, to: 0.8, ms: 570},
];

/** Paused, the bars come down to their low line in this long (2026-11-13, Ethan). */
export const EQ_DROP_MS = 200;

// The heights an equaliser is leaving, for the paused one built in its place: a pill
// rebuilds its content on every update (more than once for one pause), so the new glyph
// cannot see the old one. A paused glyph hands its heights on too: one rebuilt while it
// comes down goes on from there, one rebuilt later is low already.
let eqFrom = null;
/** @type {WeakMap<Clutter.Actor, St.Widget[]>} an equaliser's bars, by its box */
const eqBars = new WeakMap();

function playingBars(actor) {
    if (!actor)
        return null;
    if (eqBars.has(actor))
        return eqBars.get(actor);
    for (const child of actor.get_children?.() ?? []) {
        const bars = playingBars(child);
        if (bars)
            return bars;
    }
    return null;
}

/**
 * Called by a pill around the rebuild of its content: with the content about to go, then
 * with null once the new one is built. The first paused equaliser built in between starts
 * at the heights the old one's bars have right now.
 *
 * @param {?Clutter.Actor} content  the content being replaced, or null to forget
 */
export function eqLeaving(content) {
    eqFrom = playingBars(content)?.map(bar => bar.scale_y) ?? null;
}

/**
 * The equaliser (SPEC §6 media): six bars, 2 px wide and 14 tall (design/pill "Equaliser",
 * 2026-11-13, Ethan; four of 3 × 12 before), that grow from their middle, up and
 * down at once (2026-11-05, Ethan). While mapped they stretch and shrink, one endless
 * auto-reversing transition per bar on `scale-y`
 * (a transform: no relayout, no repaint of anything else); unmapped, or with animations
 * off (St.Settings enable-animations), they stand at rest and no transition exists. An
 * activity shows it only while playing (ARCHITECTURE rule 8: this is an activity, not
 * idle). Unlike Bu it does not rest after `mascot-rest-after`: music plays without input.
 * Paused (`eq-paused`): the same bars stopped low, a near flat line through the middle,
 * with nothing connected (2026-11-07, Ethan). Built in place of a playing one (eqLeaving),
 * its bars come down from where those were in EQ_DROP_MS, once, when it is on screen; built
 * any other time, or with animations off, they are low at once (2026-11-13, Ethan).
 *
 * `color`: the bars in a colour of the activity's own, its cover's main colour
 * (kit/model/cover.js), set on each bar over the stylesheet's `fg`. Not in GNOME's high
 * contrast: there the bars stay `fg` (read when the glyph is built).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.paused]
 * @param {?string} [opts.color]  '#rrggbb'
 * @returns {St.BoxLayout}
 */
export function eqGlyph({paused = false, color = null} = {}) {
    const box = new St.BoxLayout({style_class: 'buoy-eq', y_align: Clutter.ActorAlign.CENTER});
    const style = color && /^#[0-9a-f]{6}$/i.test(color) && !St.Settings.get().high_contrast
        ? `background-color: ${color};` : null;
    if (paused) {
        const from = St.Settings.get().enable_animations ? eqFrom : null;
        eqFrom = null;
        const low = EQ_PAUSED.map((scale, i) => {
            const bar = new St.Widget({
                style_class: 'buoy-eq-bar', style, y_align: Clutter.ActorAlign.CENTER,
                pivot_point: new Graphene.Point({x: 0.5, y: 0.5}), scale_y: from?.[i] ?? scale,
            });
            box.add_child(bar);
            return bar;
        });
        eqBars.set(box, low);
        if (from) {
            // an explicit transition, as the playing bars': an implicit one is skipped on an
            // actor not mapped yet (mutter clutter-actor.c _clutter_actor_create_transition),
            // and the next rebuild reads these heights on their way down
            const drop = () => low.forEach((bar, i) => {
                const t = new Clutter.PropertyTransition({
                    property_name: 'scale-y',
                    interval: new Clutter.Interval({value_type: GObject.TYPE_DOUBLE}),
                    duration: EQ_DROP_MS * St.Settings.get().slow_down_factor,
                    progress_mode: Clutter.AnimationMode.EASE_OUT_QUAD, remove_on_complete: true,
                });
                t.set_from(from[i]);
                t.set_to(EQ_PAUSED[i]);
                // cut short (the actor moved to another parent: Home puts its card in the new
                // body after building it), Clutter leaves the bar where it was — low at once
                t.connect('stopped', () => {
                    bar.scale_y = EQ_PAUSED[i];
                });
                bar.add_transition('buoy-eq', t);
            });
            if (box.mapped) {
                drop();
            } else {
                const id = box.connect('notify::mapped', () => {
                    if (!box.mapped)
                        return;
                    box.disconnect(id);
                    drop();
                });
            }
        }
        return box;
    }
    const bars = EQ_BARS.map(b => {
        const bar = new St.Widget({
            style_class: 'buoy-eq-bar', style, y_align: Clutter.ActorAlign.CENTER,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}), scale_y: b.rest,
        });
        box.add_child(bar);
        return bar;
    });
    eqBars.set(box, bars);          // eqLeaving reads where they are
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
 * another. The text not yet typed is there but transparent (Pango alpha; a line not begun is
 * hidden whole, model/presentation.js typedLine), so the size never moves while it types.
 * How far it got comes from when this activity first showed it, so a rebuild (an update, a
 * re-render) goes on where it was. One timer while mapped and
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
        const {visible, markup} = typedLine(texts[i], n);
        labels[i].clutter_text.set_markup(markup);
        labels[i].opacity = visible ? 255 : 0;
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
