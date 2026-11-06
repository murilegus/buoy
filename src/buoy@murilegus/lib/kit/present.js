import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {SIZE as GRID, cells, frameAt, lampColour, moves} from './mascot.js';
import {ART_CODE, ART_DECLARATIONS, artRadius, effectBox} from './rounded.js';
import {element, livePosition, mediaTimes, planCompact, planExpanded, planIdle, planMinimal, sinceText, untilText} from './presentation.js';

/**
 * Render plan → St actors. The ONLY place content actors are made; the plan itself
 * (what to show, limits, fallbacks) comes from presentation.js, which is unit-tested.
 * Sizes here are the renderer's (APPLE.md B5.3: leading ≤ 20 px minimal, 40 compact,
 * 56 expanded);
 * adapters never send any.
 */

const SIZE = {
    // mascot: a multiple of Bu's 10 cells, so each cell is whole px (MASCOT.md)
    minimal: {icon: 16, art: 20, ring: 18, bar: 40, mascot: 20},
    compact: {icon: 24, art: 40, ring: 32, bar: 0, mascot: 40},  // SPEC §4, 2026-11-05
    expanded: {icon: 32, art: 56, ring: 32, bar: 0, mascot: 50}, // bar: 0 = fill the width
};

// Album art's corners, inside the pill's (kit/rounded.js artRadius): the pill's radius
// (minimal 16, compact 24; shapes.js) less the content padding (14, pill.js PAD); minimal
// at least 6. Expanded and tabs stay square.
const ART_INSET = 14;
const ART_RADIUS = {
    minimal: artRadius(16, ART_INSET, SIZE.minimal.art, 6),     // 6
    compact: artRadius(24, ART_INSET, SIZE.compact.art),        // 10
};

// One Shell.GLSLEffect per art (the ui/lightbox.js RadialShaderEffect pattern, as corners.js):
// St.Icon keeps loading the cover asynchronously; the shader rounds what it draws.
const ArtCorners = GObject.registerClass(
class ArtCorners extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, ART_DECLARATIONS, ART_CODE, false);
    }

    /**
     * @param {number} size  the art's side, logical px (its allocation: icon_size)
     * @param {number} r  radius
     * @param {number} scale  device px per logical px
     */
    setShape(size, r, scale) {
        this._loc ??= {box: this.get_uniform_location('buoy_box'), art: this.get_uniform_location('buoy_art')};
        const box = effectBox(size, size);    // the texture is the padded paint box
        this.set_uniform_float(this._loc.box, 4, [box.x, box.y, box.width, box.height]);
        this.set_uniform_float(this._loc.art, 4, [size, size, r, 1 / Math.max(scale, 1)]);
        this.queue_repaint();
    }
});

function roundArt(icon, size, r) {
    const effect = new ArtCorners();
    const sync = () => effect.setShape(size, r, icon.get_resource_scale());
    icon.add_effect_with_name('buoy-art-corners', effect);
    icon.connect('resource-scale-changed', sync);
    sync();
    return icon;
}

function label(text, styleClass, xExpand = false) {
    const l = new St.Label({text, style_class: styleClass, x_expand: xExpand, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

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

function file(src) {
    return /^[a-z][a-z0-9+.-]*:/i.test(src) ? Gio.File.new_for_uri(src) : Gio.File.new_for_path(src);
}

// One drawing area for both: a ring (value as an arc) or a rounded bar.
function meter(kind, value, size) {
    const area = new St.DrawingArea({
        style_class: `buoy-${kind}`,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: kind === 'bar' && !size,
    });
    if (kind === 'ring')
        area.set_size(size, size);
    else
        area.set_size(size || -1, 4);
    area.setValue = v => {
        value = v;
        area.queue_repaint();
    };
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const c = area.get_theme_node().get_foreground_color();
        // the theme's alpha too: a muted level is drawn at 40 % (.buoy-level-off)
        const rgba = a => cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, a * c.alpha / 255);
        if (kind === 'ring') {
            const lw = Math.max(2, w / 8), r = (Math.min(w, h) - lw) / 2;
            cr.setLineWidth(lw);
            rgba(0.25);
            cr.arc(w / 2, h / 2, r, 0, 2 * Math.PI);
            cr.stroke();
            if (value > 0) {
                rgba(1);
                cr.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + value * 2 * Math.PI);
                cr.stroke();
            }
        } else {
            const pill = (x, width) => {
                const rr = h / 2;
                cr.arc(x + rr, rr, rr, Math.PI / 2, 3 * Math.PI / 2);
                cr.arc(x + Math.max(width - rr, rr), rr, rr, -Math.PI / 2, Math.PI / 2);
                cr.closePath();
                cr.fill();
            };
            rgba(0.25);
            pill(0, w);
            if (value > 0) {
                rgba(1);
                pill(0, Math.max(h, w * value));
            }
        }
        cr.$dispose();
    });
    return area;
}

/** Set on the actor whose content height an empty state fills (Home's body view). */
export const FILL = Symbol('buoy-fill');

/**
 * A tab or list with nothing in it (2026-11-06, Ethan): one colour everywhere, the text
 * centred both ways, and as tall as the body allows — the panel opens at its full
 * expanded height instead of a thin strip. Its natural height is the content height Home
 * sets on its body view (`view[FILL]`), less the padding and borders of the actors in
 * between, so it fits exactly and never scrolls. Outside Home (no FILL above) it is as
 * tall as its text.
 */
export const EmptyState = GObject.registerClass(
class EmptyState extends St.Bin {
    /** @param {string} text */
    _init(text) {
        super._init({
            style_class: 'buoy-empty', x_expand: true, y_expand: true,
            child: new St.Label({text, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER}),
        });
    }

    vfunc_get_preferred_height(forWidth) {
        const [min, nat] = super.vfunc_get_preferred_height(forWidth);
        let between = 0;
        for (let p = this.get_parent(); p; p = p.get_parent()) {
            if (p[FILL] > 0)
                return [min, Math.max(nat, p[FILL] - between)];
            if (p instanceof St.Widget) {
                const node = p.get_theme_node();
                between += node.get_vertical_padding() +
                    node.get_border_width(St.Side.TOP) + node.get_border_width(St.Side.BOTTOM);
            }
        }
        return [min, nat];
    }
});

/**
 * The kit's thin bar (the compact's), filling the width it is given; for a module's
 * tab.js (Transfers rows). setValue(v) moves it.
 *
 * @param {number} value  0–1
 * @returns {St.DrawingArea}
 */
export function progressBar(value) {
    return meter('bar', value, 0);
}

/**
 * Once a second while `actor` is on screen and `running()` says so; never otherwise
 * (ARCHITECTURE rule 8: a live position runs only while its activity is visible). The
 * timer goes with the actor. Also for a module's tab.js (the Media tab's position).
 *
 * @param {Clutter.Actor} actor
 * @param {function():void} update  called now, on (un)map, then each second
 * @param {function():boolean} [running]  keep ticking
 * @param {number} [every]  seconds between two updates
 */
export function tick(actor, update, running = () => true, every = 1) {
    let id = 0;
    const stop = () => {
        if (id)
            GLib.source_remove(id);
        id = 0;
    };
    const sync = () => {
        if (actor.mapped && running()) {
            if (!id) {
                id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, every, () => {
                    update();
                    if (running())
                        return GLib.SOURCE_CONTINUE;
                    id = 0;
                    return GLib.SOURCE_REMOVE;
                });
            }
        } else {
            stop();
        }
    };
    actor.connect('notify::mapped', () => {
        update();
        sync();
    });
    actor.connect('destroy', stop);
    update();
}

// A level (hud, SPEC §2e): the bar, its number after it in even figures, dimmed when off
// (muted). Alone in a minimal pill (no text) the bar is the content: LONG_BAR.
const LONG_BAR = 120;

function levelBar(e, width) {
    const bar = meter('bar', e.value, width);
    if (!e.label && !e.off)
        return bar;
    // off is set before the bar is styled: its repaint reads the colour once
    const box = new St.BoxLayout({
        style_class: e.off ? 'buoy-level buoy-level-off' : 'buoy-level', y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(bar);
    if (e.label)
        box.add_child(label(e.label, 'buoy-level-label'));
    return box;
}

// A live position (media): the bar, then elapsed and remaining under it.
function liveBar(live) {
    const box = new St.BoxLayout({style_class: 'buoy-live', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    const bar = meter('bar', 0, 0);
    const times = new St.BoxLayout({style_class: 'buoy-live-times', x_expand: true});
    const elapsed = label('', 'buoy-live-time');
    const left = label('', 'buoy-live-time');
    times.add_child(elapsed);
    times.add_child(new St.Widget({x_expand: true}));
    times.add_child(left);
    box.add_child(bar);
    box.add_child(times);
    tick(box, () => {
        const pos = livePosition(live, Date.now());
        bar.setValue(pos / live.length);
        [elapsed.text, left.text] = mediaTimes(pos, live.length);
    }, () => live.playing && livePosition(live, Date.now()) < live.length);
    return box;
}

// A countdown to `at` (a Spotify ad's end), once a second while shown.
function untilLabel(at) {
    const l = label('', 'buoy-label');
    tick(l, () => {
        l.text = untilText(at, Date.now());
    }, () => Date.now() < at);
    return l;
}

// The time since `at` (an agent's run, CODING-AGENTS.md §2): its text changes once a
// minute, so it is read every 20 s while shown, never off screen.
function sinceLabel(at) {
    const l = label('', 'buoy-label');
    tick(l, () => {
        l.text = sinceText(at, Date.now());
    }, () => true, 20);
    return l;
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

function startOf(key) {
    if (!STARTS.has(key)) {
        STARTS.set(key, now());
        if (STARTS.size > STARTS_MAX)
            STARTS.delete(STARTS.keys().next().value);
    }
    return STARTS.get(key);
}

// A stale activity is dimmed (APPLE §B1): its text and icons turn grey in CSS; Bu's
// palette is fixed, so it is dimmed to 40 % as the `stale` preview (MASCOT.md).
const STALE_OPACITY = 102;

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
 * @param {Clutter.Actor} box
 */
export function dimStale(box) {
    box.add_style_class_name('buoy-stale');
    dimMascots(box);
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

/**
 * One St.DrawingArea painting Bu's grid in MASCOT.md's palette; the lamp in the stack's
 * amber/red or the pose's colour (kit/mascot.js lampColour). A moving pose swaps two
 * frames every 500 ms with one timer, only while mapped and not held still; gone on
 * unmap, destroy, and with it on pose change and disable (the content is rebuilt).
 *
 * @param {object} e  {type: 'mascot', pose, light}
 * @param {number} size  px, a multiple of 10
 * @param {?object} activity  for where the pose started (id and surface)
 * @returns {St.DrawingArea}
 */
function mascot(e, size, activity) {
    const area = new St.DrawingArea({style_class: 'buoy-mascot', y_align: Clutter.ActorAlign.CENTER});
    area.set_size(size, size);
    const start = startOf(`${activity?.id}\u0000${activity?._seq}\u0000${e.pose}`);
    const frame = held => frameAt(e.pose, now() - start, {still: held});
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
    if (moves(e.pose)) {
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
        for (const c of cells(shown.frame, lampColour(shown.pose, e.light))) {
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
 *
 * @returns {St.BoxLayout}
 */
function eqGlyph() {
    const box = new St.BoxLayout({style_class: 'buoy-eq', y_align: Clutter.ActorAlign.CENTER});
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
 * An icon by theme name, or by absolute path to an image another app installed (Claude
 * Desktop's tray glyph, the Claude Code tab, 2026-11-07); a missing file shows the
 * generic icon instead.
 *
 * @param {string} icon
 * @returns {object} St.Icon properties
 */
export function iconProps(icon) {
    if (typeof icon === 'string' && icon.startsWith('/')) {
        return {
            gicon: new Gio.FileIcon({file: Gio.File.new_for_path(icon)}),
            fallback_icon_name: 'view-app-grid-symbolic',
        };
    }
    return {icon_name: icon, fallback_icon_name: 'view-app-grid-symbolic'};
}

/**
 * One element of presentation data as an actor, for a module's tab.js (the Claude Code
 * tab draws Bu and the live elapsed time, 2026-11-07).
 *
 * @param {*} value  an adapter's leading / trailing value
 * @param {object} [opts]
 * @param {'minimal'|'compact'|'expanded'} [opts.size]  the tier whose sizes it takes
 * @param {boolean} [opts.leading]  the leading zone: Bu may be drawn
 * @param {?object} [opts.activity]  its activity (Bu's animation follows it)
 * @param {boolean} [opts.stale]  the activity is stale: Bu takes `stale`
 * @returns {?Clutter.Actor}
 */
export function buildElement(value, {size = 'minimal', leading = false, activity = null, stale = false} = {}) {
    const e = element(value, {leading});
    // a stale activity's Bu is `stale`, as on its pill (presentation.js leadingAndLight)
    return makeElement(stale && e?.type === 'mascot' ? {...e, pose: 'stale'} : e, size, activity);
}

function makeElement(e, mode, activity = null) {
    if (!e)
        return null;
    const size = SIZE[mode];
    switch (e.type) {
    case 'mascot':
        return mascot(e, size.mascot, activity);
    case 'icon':
        return new St.Icon({
            style_class: 'buoy-icon', icon_size: size.icon,
            ...e.gicon ? {gicon: e.gicon} : iconProps(e.icon),
        });
    case 'art': {
        const icon = new St.Icon({
            style_class: 'buoy-art', icon_size: size.art,
            gicon: e.gicon ?? new Gio.FileIcon({file: file(e.src)}),
            fallback_icon_name: e.fallback ?? 'audio-x-generic-symbolic',
        });
        return ART_RADIUS[mode] ? roundArt(icon, size.art, ART_RADIUS[mode]) : icon;
    }
    case 'glyph':
        return eqGlyph();
    case 'ring':
        return meter('ring', e.value, size.ring);
    case 'bar':
        return levelBar(e, e.long ? LONG_BAR : size.bar);
    case 'text':
        return label(e.text, 'buoy-label');
    case 'until':
        return untilLabel(e.at);
    case 'since':
        return sinceLabel(e.at);
    }
    return null;
}

function actionButton(a, activity) {
    const face = a.label ? {label: a.label} : {child: new St.Icon({icon_name: a.icon, icon_size: 16})};
    const button = new St.Button({
        style_class: 'buoy-action', can_focus: true,
        accessible_name: a.label ?? a.id,
        ...a.key ? {child: keyedFace(face, a.key)} : face,
    });
    button.connect('clicked', () => activity.onAction?.(a.id));
    return button;
}

// An ask's button: its key after the label, shown only while the island holds the
// keyboard (showKeys); hidden, it takes no room.
function keyedFace(face, key) {
    const box = new St.BoxLayout({style_class: 'buoy-action-face'});
    box.add_child(face.child ?? new St.Label({text: face.label, y_align: Clutter.ActorAlign.CENTER}));
    box.add_child(new St.Label({
        style_class: 'buoy-key', text: key.toUpperCase(), visible: false,
        y_align: Clutter.ActorAlign.CENTER,
    }));
    return box;
}

/**
 * Show or hide the keys printed on an ask's buttons (kit/keys.js).
 *
 * @param {?Clutter.Actor} actor  content built here
 * @param {boolean} shown
 */
export function showKeys(actor, shown) {
    if (!actor)
        return;
    if (actor.has_style_class_name?.('buoy-key'))
        actor.visible = shown;
    for (const child of actor.get_children())
        showKeys(child, shown);
}

function addAll(box, actors) {
    for (const actor of actors) {
        if (actor)
            box.add_child(actor);
    }
}

// +N: reactive so a click on it is told apart from one on the pill (it opens Home)
function badge(text) {
    const l = label(text, 'buoy-badge');
    l.reactive = true;
    return l;
}

// The buoy light (INDICATORS.md): the pill's left edge slot. Static, never blinks.
function lightDot(light) {
    return light ? new St.Widget({
        style_class: `buoy-light buoy-light-${light}`,
        y_align: Clutter.ActorAlign.CENTER,
    }) : null;
}

// One line in the pill: minimal.
function pillBox(p, activity, maxWidth, buttons) {
    if (!p.leading && !p.text && !p.trailing && !buttons.length && !p.badge)
        return null;
    const box = new St.BoxLayout({style_class: 'buoy-minimal', y_align: Clutter.ActorAlign.CENTER});
    if (maxWidth > 0)
        box.set_style(`max-width: ${maxWidth}px;`);
    addAll(box, [
        lightDot(p.light),           // edge slot first: the zones nudge inward (SPEC §2a)
        makeElement(p.leading, 'minimal', activity),
        p.text ? label(p.text, 'buoy-text', true) : null,
        makeElement(p.trailing?.type === 'bar' && !p.text ? {...p.trailing, long: true} : p.trailing, 'minimal'),
        ...buttons.map(a => actionButton(a, activity)),
        p.badge ? badge(p.badge) : null, // +N on the last pill (SPEC §2c)
    ]);
    if (p.stale)
        dimStale(box);
    return box;
}

/**
 * @param {object} activity  presentation data (+ onAction)
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]  content width cap; the text ellipsizes to fit
 * @param {string} [opts.light]  the stack's buoy light
 * @param {number} [opts.more]  activities beyond the shown pills → +N badge
 * @param {boolean} [opts.side]  a 120 px side pill: leading and trailing only
 * @returns {?Clutter.Actor} null when there is nothing to show
 */
export function buildMinimal(activity, {maxWidth = 0, light, more, side = false} = {}) {
    const p = planMinimal(activity, {light, more, side});
    // a side pill has no room for a button: its compact carries them
    return pillBox(p, activity, maxWidth, p.action && !side ? [p.action] : []);
}

// The compact (SPEC §2, §4): the grown pill. A top row — light, leading 40, title over
// subtitle, trailing, buttons — then a bar or up to 3 rows under the text column.
function compactBox(p, activity, maxWidth) {
    const box = new St.BoxLayout({
        style_class: 'buoy-compact', orientation: Clutter.Orientation.VERTICAL,
        y_align: Clutter.ActorAlign.CENTER,
    });
    if (maxWidth > 0)
        box.set_style(`max-width: ${maxWidth}px;`);
    const top = new St.BoxLayout({style_class: 'buoy-compact-top', x_expand: true});
    const lines = new St.BoxLayout({
        style_class: 'buoy-compact-lines', orientation: Clutter.Orientation.VERTICAL,
        x_expand: true, y_align: Clutter.ActorAlign.CENTER,
    });
    addAll(lines, [
        p.text ? new Marquee(p.text, 'buoy-text buoy-compact-title') : null,
        p.subtitle ? label(p.subtitle, 'buoy-compact-subtitle') : null,
    ]);
    const buttons = p.actions?.length
        ? new St.BoxLayout({style_class: 'buoy-actions', y_align: Clutter.ActorAlign.CENTER})
        : null;
    if (buttons)
        addAll(buttons, p.actions.map(a => actionButton(a, activity)));
    addAll(top, [
        lightDot(p.light),
        makeElement(p.leading, 'compact', activity),
        lines.get_n_children() ? lines : null,
        makeElement(p.trailing, 'compact'),
        buttons,
    ]);
    box.add_child(top);
    if (p.live)
        box.add_child(indented(liveBar(p.live), p, BAR_MIN));
    else if (p.progress !== null && p.progress !== undefined)
        box.add_child(indented(meter('bar', p.progress, 0), p, BAR_MIN));
    if (p.rows?.length) {
        const list = new St.BoxLayout({style_class: 'buoy-compact-rows', orientation: Clutter.Orientation.VERTICAL});
        for (const r of p.rows) {
            const row = new St.BoxLayout({style_class: 'buoy-compact-row', x_expand: true});
            addAll(row, [
                r.icon ? makeElement(r.icon, 'minimal') : null,
                label(r.text, 'buoy-compact-row-text', true),
                r.detail ? label(r.detail, 'buoy-compact-row-detail') : null,
            ]);
            list.add_child(row);
        }
        box.add_child(indented(list, p));
    }
    if (p.stale)
        dimStale(box);
    return box;
}

// Under the text column: the leading's width plus the top row's spacing
// (.buoy-compact-top in stylesheet.css).
const INDENT_GAP = 12;
// A bar has no width of its own: without this a short title leaves it a sliver (a
// progress compact is content-fit). 160 + a 24 icon and its gap fill the 240 minimum.
const BAR_MIN = 160;

function indented(actor, p, minWidth = 0) {
    const key = {icon: 'icon', glyph: 'icon', ring: 'ring', mascot: 'mascot'}[p.leading?.type] ?? 'art';
    const lead = p.leading ? SIZE.compact[key] + INDENT_GAP : 0;
    actor.x_expand = true;
    const style = [lead ? `margin-left: ${lead}px;` : '', minWidth ? `min-width: ${minWidth}px;` : ''].join(' ').trim();
    if (style)
        actor.set_style(style);
    return actor;
}

/**
 * The hover tier: the activity's `compact` (SPEC §2) in the grown pill.
 *
 * @param {object} activity  presentation data (+ onAction)
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]  content width cap (the compact's widest − padding)
 * @param {string} [opts.light]
 * @returns {?Clutter.Actor} null when the activity has no compact
 */
export function buildCompact(activity, {maxWidth = 0, light} = {}) {
    const p = planCompact(activity, {light});
    return p ? compactBox(p, activity, maxWidth) : null;
}

/**
 * The amber light's compact: "Missed · N" on the light, then up to 3 rows.
 *
 * @param {object} plan  presentation.js planMissed()
 * @param {object} [opts]
 * @param {number} [opts.maxWidth]
 * @returns {Clutter.Actor}
 */
export function buildMissedCompact(plan, {maxWidth = 0} = {}) {
    return compactBox({
        light: plan.light, text: plan.title, rows: plan.rows, actions: [], progress: null,
    }, {}, maxWidth);
}

/**
 * The idle pill (SPEC §2a). `none`: empty, with the buoy light at its leading edge. An
 * idle plan (clock…): its zones centred in the pill, the light (amber/red only) at the
 * edge as in minimal.
 *
 * @param {object} opts
 * @param {number} opts.width  inner width of the idle pill
 * @param {string} [opts.light]
 * @param {?object} [opts.plan]  the idle plan's presentation data
 * @returns {Clutter.Actor}
 */
export function buildIdle({width, light, plan = null}) {
    const p = planIdle({light, plan});
    const box = new St.BoxLayout({style_class: 'buoy-idle', width, y_align: Clutter.ActorAlign.CENTER});
    if (!plan) {
        addAll(box, [lightDot(p.light)]);
        return box;
    }
    const zones = new St.BoxLayout({
        style_class: 'buoy-idle-zones', x_expand: true,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
    });
    addAll(zones, [
        makeElement(p.leading, 'minimal'),
        p.text ? label(p.text, 'buoy-text buoy-idle-text') : null,
        makeElement(p.trailing, 'minimal'),
    ]);
    addAll(box, [lightDot(p.light), zones]);
    // an icon alone says nothing to a screen reader: name the part of the day, or what
    // the plan names itself (weather: "Ho Chi Minh, 31°, Clear")
    if (typeof plan.accessibleName === 'string' && plan.accessibleName)
        box.accessible_name = plan.accessibleName;
    else if (typeof plan.daypart === 'string')
        box.accessible_name = p.text ? `${plan.daypart}, ${p.text}` : plan.daypart;
    return box;
}

function makeRegion(r, activity) {
    if (r?.type !== 'block')
        return makeElement(r, 'expanded', activity);
    const box = new St.BoxLayout({
        style_class: 'buoy-block', orientation: Clutter.Orientation.VERTICAL,
        y_align: Clutter.ActorAlign.CENTER,
    });
    addAll(box, [
        r.title ? label(r.title, 'buoy-title') : null,
        r.subtitle ? label(r.subtitle, 'buoy-subtitle') : null,
        r.bar !== null ? meter('bar', r.bar, 0) : null,
    ]);
    return box;
}

/**
 * @param {object} activity  presentation data (+ onAction)
 * @returns {?Clutter.Actor} null when the activity has no expanded presentation
 */
export function buildExpanded(activity) {
    const p = planExpanded(activity);
    if (!p)
        return null;
    const box = new St.BoxLayout({
        style_class: 'buoy-expanded', orientation: Clutter.Orientation.VERTICAL,
        x_expand: true, // St.Bin centres a child at its natural width otherwise
    });
    const top = new St.BoxLayout({style_class: 'buoy-expanded-top', x_expand: true});
    for (const name of ['leading', 'center', 'trailing']) {
        const actor = makeRegion(p[name], activity);
        if (actor) {
            actor.x_expand = p.grow === name;
            top.add_child(actor);
        }
    }
    if (top.get_n_children())
        box.add_child(top);
    if (p.bottom) {
        const row = new St.BoxLayout({style_class: 'buoy-actions', x_align: Clutter.ActorAlign.CENTER});
        addAll(row, p.actions.map(a => actionButton(a, activity)));
        box.add_child(row);
    }
    if (p.stale)
        dimStale(box);
    return box;
}
