import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {SIZE as GRID, cells, frameAt, lampColour, moves} from './mascot.js';
import {livePosition, mediaTimes, planCompact, planExpanded, planIdle, planMinimal, untilText} from './presentation.js';

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

function label(text, styleClass, xExpand = false) {
    const l = new St.Label({text, style_class: styleClass, x_expand: xExpand, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
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
        const rgba = a => cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, a);
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

/**
 * Once a second while `actor` is on screen and `running()` says so; never otherwise
 * (ARCHITECTURE rule 8: a live position runs only while its activity is visible). The
 * timer goes with the actor. Also for a module's tab.js (the Media tab's position).
 *
 * @param {Clutter.Actor} actor
 * @param {function():void} update  called now, on (un)map, then each second
 * @param {function():boolean} [running]  keep ticking
 */
export function tick(actor, update, running = () => true) {
    let id = 0;
    const stop = () => {
        if (id)
            GLib.source_remove(id);
        id = 0;
    };
    const sync = () => {
        if (actor.mapped && running()) {
            if (!id) {
                id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
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

function dimStale(box) {
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

function eqGlyph() {
    const box = new St.BoxLayout({style_class: 'buoy-eq', y_align: Clutter.ActorAlign.CENTER});
    for (const h of [6, 10, 8]) // static: nothing animates (SPEC §8)
        box.add_child(new St.Widget({style_class: 'buoy-eq-bar', height: h, y_align: Clutter.ActorAlign.END}));
    return box;
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
            ...e.gicon ? {gicon: e.gicon} : {icon_name: e.icon},
        });
    case 'art':
        return new St.Icon({
            style_class: 'buoy-art', icon_size: size.art,
            gicon: new Gio.FileIcon({file: file(e.src)}),
            fallback_icon_name: e.fallback ?? 'audio-x-generic-symbolic',
        });
    case 'glyph':
        return eqGlyph();
    case 'ring':
        return meter('ring', e.value, size.ring);
    case 'bar':
        return meter('bar', e.value, size.bar);
    case 'text':
        return label(e.text, 'buoy-label');
    case 'until':
        return untilLabel(e.at);
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
        makeElement(p.trailing, 'minimal'),
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
        p.text ? label(p.text, 'buoy-text buoy-compact-title') : null,
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
        box.add_child(indented(liveBar(p.live), p));
    else if (p.progress !== null && p.progress !== undefined)
        box.add_child(indented(meter('bar', p.progress, 0), p));
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

// Under the text column: the leading's width plus the row's spacing (stylesheet.css).
function indented(actor, p) {
    const key = {icon: 'icon', glyph: 'icon', ring: 'ring', mascot: 'mascot'}[p.leading?.type] ?? 'art';
    const lead = p.leading ? SIZE.compact[key] + 10 : 0;
    actor.x_expand = true;
    if (lead)
        actor.set_style(`margin-left: ${lead}px;`);
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
    // an icon alone says nothing to a screen reader: name the part of the day
    if (typeof plan.daypart === 'string')
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
