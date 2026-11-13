import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {buildCompact, buildMissedCompact} from './present/compact.js';
import {buildExpanded} from './present/expanded.js';
import {buildIdle, buildMinimal} from './present/minimal.js';
import {eqLeaving} from './present/motion.js';
import {lightSlot, planCompact, planExpanded, keyline} from '../model/presentation.js';
import {compactCx} from '../model/shapes.js';
import {FADES, PRESS_HOLD, progressOf, radiusAt, springFor} from '../model/motion.js';
import {SpringRunner} from './spring.js';
import {Flights} from './present/flight.js';

const COMPACT_DELAY = 300;  // ms of hover before the pill grows into its compact (SPEC §2)
const COMPACT_GRACE = 200;  // ms the compact stays after the pointer leaves it (SPEC §2c)
// Every move, size and shape is a spring (design/motion, model/motion.js SPRINGS): `open`
// into expanded, `move` into the compact and for slides, `size` for a content's new size,
// `snap` for hover and press, `close` for every shrink back (springFor turns a shrinking
// `open` / `move` into `close`). Fades stay plain: FADES.
const REVEAL_FROM = 0.8; // the bg grows by more than this ratio: it uncovers the content

/**
 * One pill on the island: a background that morphs and a content actor on top, bound
 * to one activity (or none: the idle pill). The Island decides where it sits (its
 * centre `cx` in the container), its role and when it opens; the pill does its own
 * sizing, hover → compact, keyline, press pulse and expanded content.
 *
 *   role 'centre'  pill 1, the highest priority, at the screen centre, content-fit; carries
 *                  the buoy light
 *   role 'side'    pills 2 and 3 to the right (SPEC §2c): a fixed 120 × 32, leading and
 *                  trailing only
 *
 * Compact (SPEC §2, §2c, 2026-11-05): after COMPACT_DELAY of hover the pill grows in place
 * into its compact — its top edge kept, centred on it, shifted only to stay on screen —
 * raised over its neighbours, which the island fades where they stand. It stays while
 * the pointer is on it and COMPACT_GRACE after; another pill hovered meanwhile takes over
 * at once.
 *
 * bg and content are siblings in the island's container, not parent and child, so the
 * content never moves with the morph; both are reactive so a click on text lands here.
 */
export class Pill {
    constructor(island, parent) {
        this._island = island;
        this.id = null;
        this.activity = null;
        this._pendingIn = undefined; // content waiting for the old to fade out (_setContent)
        this._fadingIn = null;       // content fading in
        this.role = 'centre';
        this.cx = 0;
        this.light = 'off';
        this.more = 0;
        this.expanded = false;
        this._panel = null;          // Home's panel while a click has it open (kit/ui/home.js)
        this.fresh = true;           // not placed yet: first layout puts it there, then fades in
        this._compact = false;
        this._contentW = 0;          // resting content size, measured in _applyContentSize()
        this._contentH = 0;
        this._compactW = 0;          // the compact's content size, the same way
        this._compactH = 0;
        this._graceId = 0;
        this._resizeLater = 0;
        this._hoverLater = 0;
        this._compactId = 0;
        this._held = false;          // the island holds the compact open (an alert, an ask)
        this._ignoreHover = false;   // held open under a resting pointer: not hovered till it leaves
        this._builtHovered = false;  // the compact's card was built for a pointer on it
        this._morphTo = null;        // where the bg's springs are heading
        this._collapsing = false;    // until the collapse morph lands: bg clips the content
        this._follow = null;         // {from, to, reveal, fade}: how the content follows the bg
        this._targetR = 0;           // the radius on the way: never past half the height (_applyBg)
        this._destroyed = false;
        this._dot = null;            // the buoy light at the left end (_syncDot)

        this.bg = new St.Widget({style_class: 'buoy-island', reactive: true, track_hover: true});
        this.content = new St.Bin({style_class: 'buoy-content', reactive: true, track_hover: true});
        parent.add_child(this.bg);
        parent.add_child(this.content);
        // shared parts in flight between forms, above the content, clipped to the bg
        // (present/flight.js, design/motion "Phần chung đi tới chỗ mới")
        // 0 × 0: the clones draw past it, never counting in the island's size
        this._flightLayer = new Clutter.Actor({reactive: false, width: 0, height: 0});
        parent.add_child(this._flightLayer);
        this._flights = new Flights(this._flightLayer, () => this.content);
        this._span = null;
        this._bgRun = new SpringRunner(this.bg, v => this._applyBg(v));

        this.content.connect('notify::width', () => this._contentResized());
        this.content.connect('notify::height', () => this._contentResized());
        for (const a of [this.bg, this.content]) {
            a.connect('notify::hover', () => this._hoverChanged());
            a.connect('button-press-event', (_a, ev) => island._onPillPress(this, ev));
            a.connect('button-release-event', (_a, ev) => island._onPillRelease(this, ev));
            a.connect('scroll-event', (_a, ev) => island._onPillScroll(this, ev));
        }
    }

    get _s() {
        return this._island.shapes;
    }

    /** The pill's compact is the amber missed list, not its activity (a click opens Home). */
    get showingMissed() {
        return this._compact && this._missed() !== null;
    }

    /** Its compact is open, or about to close (the grace after the pointer left). */
    get compact() {
        return this._compact;
    }

    /** The pointer is on it, and counts: not a pointer it opened under (holdCompact). */
    get hoverCounts() {
        return this.hovered && !this._ignoreHover;
    }

    /** It has a compact to open (the activity's, the idle plan's, the amber list). */
    get hasCompact() {
        return this._hasCompact();
    }

    /**
     * The island opens the compact and keeps it open whatever the pointer does (an alert,
     * an ask: design/alerts-and-asks), or lets it go: then it closes unless the pointer is
     * on it, and hover takes over.
     *
     * @param {boolean} held
     */
    holdCompact(held) {
        this._held = held;
        // a card that opens under a resting pointer is not hovered until the pointer leaves
        // and comes back (Shell's banner, ui/messageTray.js _onNotificationHoverChanged)
        this._ignoreHover = held && this.hovered;
        if (held) {
            this._clearGrace();
            this._openCompact();
        } else if (!this.hoverCounts) {
            this._stopCompact();     // a pointer it opened under does not keep it
        }
    }

    get expandable() {
        return this.activity !== null && planExpanded(this.activity) !== null;
    }

    // St's hover is only the trigger: after a modal grab or a merge Clutter can keep a
    // stale actor under the pointer and report hover where there is none. Confirm with
    // the real pointer against the resting box (the hover growth must not flip it).
    get hovered() {
        if (!this.bg.reactive || !(this.bg.hover || this.content.hover))
            return false;
        const [px, py] = global.get_pointer();
        const [ax, ay] = this._island.actor.get_transformed_position();
        let box = this._compact ? this.compactShape() : this.restShape();
        if (this.expanded)
            box = this._expandedShape();
        const x0 = ax + (box.cx ?? this.cx) - box.w / 2;
        return px >= x0 && px < x0 + box.w && py >= ay && py < ay + box.h + 2;
    }

    // --- configuration (Island) ------------------------------------------------

    /**
     * @param {?object} activity  null = idle pill
     * @param {object} [opts]
     * @param {string} [opts.role]  'centre' | 'side'
     * @param {string} [opts.light]  buoy light (drawn on the centre pill only)
     * @param {number} [opts.more]  +N on this pill (the last one)
     * @param {boolean} [opts.fade]  cross-fade though the activity is the same (the idle
     *   pill switching plans in `auto`, SPEC §2a-iii)
     */
    configure(activity, {role = 'centre', light = 'off', more = 0, fade = false} = {}) {
        const same = (activity?.id ?? null) === this.id;
        // a held card takes another activity in place (a burst's next turn): it stays open,
        // its content cross-fades (design/alerts-and-asks)
        if (!same && !this._held)
            this._stopCompact();
        this.id = activity?.id ?? null;
        this.activity = activity;
        Object.assign(this, {role, light, more});
        this._syncDot();
        if (this.expanded) {
            if (activity && !this._panel)  // the panel updates itself (Home.update)
                this._setContent(buildExpanded(activity), false);
            return;
        }
        if (this._compact && !this._hasCompact())
            this._stopCompact();     // its compact went away in this update
        // the same activity's equaliser, playing until now: a paused one built in its place
        // comes down from where these bars are (present/motion.js eqGlyph)
        eqLeaving(same ? this.content.child : null);
        const next = this._restingContent();
        eqLeaving(null);
        this._setContent(next, same && !fade ? 'follow' : true);
        // the same activity's new content, in place at once: measured and placed now, before
        // this frame paints, as _swapResting does — waiting for notify::width showed a longer
        // text for one frame at the old place, unclipped (2026-11-13, Ethan: "text bị glitch")
        if (!this.fresh && next && this.content.child === next && this._fadingIn !== next)
            this._applyContentSize();
        // A pill that appears (or changes activity) under a resting pointer is hovered
        // without an enter event: look again, so its compact still opens.
        if (!same)
            this._hoverChanged();
    }

    // Move the pill's centre; `animate` slides it (slide-to-fill, merge/split).
    setCx(cx, animate) {
        const slides = Math.abs(cx - this.cx) >= 0.5;
        this.cx = cx;
        const shape = this.currentShape();
        this._layoutContent();
        // a slide is `move`; the same place at a new width (pill 1's longer text, laid out
        // again by the island) is `size`, uncovered without a fade (_followBg)
        if (animate)
            this._morph(shape, slides ? 'move' : 'size');
        else
            this.applyShape(shape);
    }

    // The keyboard ring (SPEC §2c): Super+B is on this pill. A style class, so nothing
    // relayouts or animates; the ring is the border, so the keyline steps aside.
    setFocused(focused) {
        this._focused = focused;
        if (focused)
            this.bg.add_style_class_name('buoy-focused');
        else
            this.bg.remove_style_class_name('buoy-focused');
        if (this._radius !== undefined)
            this.bg.set_style(this._bgStyle({r: this._radius}));
    }

    // Shown (side pills fade out while another pill is open, SPEC §2c merge). `dim`: shown
    // but at opacity 0, under another pill's compact (still reactive, so hovering where it
    // shows from under the compact switches to it).
    setShown(shown, animate, dim = false) {
        for (const a of [this.bg, this.content]) {
            // Hidden: no leave event will come. Shown again (no grab by then): ask St.
            // Only on a real change: the pill that just closed stays as collapse() left it.
            if (a.reactive !== shown) {
                a.reactive = shown;
                if (shown)
                    a.sync_hover();
                else
                    a.hover = false;
            }
            const opacity = shown && !dim ? 255 : 0;
            if (animate)
                a.ease({opacity, duration: shown ? FADES.in.ms : FADES.out.ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            else
                a.opacity = opacity;
        }
    }

    // Under another pill's compact (SPEC §5): fade where it stands, 100 ms out, 200 ms in;
    // reactivity is left alone.
    dim(dimmed) {
        // the parts in flight too: going back from a compact while another opens, they stood
        // bright beside it until they landed (2026-11-13, Ethan)
        for (const a of [this.bg, this.content, this._flightLayer]) {
            a.remove_transition('opacity');
            a.ease({opacity: dimmed ? 0 : 255, duration: dimmed ? FADES.out.ms : FADES.in.ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        }
    }

    // --- shapes -------------------------------------------------------------------

    restShape() {
        // pill 1 with a light grows at both ends (design/pill "Đèn ở hai đầu"); idle: the
        // idle size, wider only for a plan that needs it (content-fit as minimal)
        const lit = this._light() !== null;
        if (!this.activity) {
            if (this._contentW > this._s.idle.w - 2 * this._s.pad)
                return this._s.minimal(this._contentW, 'normal', lit);
            return lit ? this._s.lit(this._s.idle) : this._s.idle;
        }
        if (this.role === 'side')
            return this._s.side;
        return this._s.minimal(this._contentW, this.activity.sizeHint, lit);
    }

    // The light pill 1 has at its ends (SPEC §2a-i): amber or red, the grey `off` only on an
    // empty idle pill; side pills never. Its room stays in the resting shape while a compact
    // or expanded covers it, so the pills beside it do not move.
    _light() {
        if (this.role !== 'centre')
            return null;
        return lightSlot(this.light, {idle: !this.activity && !this._island.idle});
    }

    // The dot: at the centre of the left end's round cap (16 from the edge at 1×), drawn on
    // the bg so it rides the morph; not in a compact, a card or expanded, back as soon as
    // the pill is (design/pill, 2026-11-10).
    _syncDot() {
        const light = this.expanded || this._compact ? null : this._light();
        if (!light) {
            this._dot?.destroy();
            this._dot = null;
            return;
        }
        if (!this._dot) {
            this._dot = new St.Widget({});
            this.bg.add_child(this._dot);
        }
        const d = this._s.dot, at = Math.round((this._s.idle.h - d) / 2);
        this._dot.style_class = `buoy-light buoy-light-${light}`;
        this._dot.set_style(`border-radius: ${d / 2}px;`);
        this._dot.set_size(d, d);
        this._dot.set_position(at, at);
    }

    // The grown pill: from its content's size, centred on the pill and kept on screen;
    // `cx` says where (the other shapes centre on this.cx).
    compactShape() {
        const shape = this._s.compact(this._compactW, this._compactH, {choices: this._cardChoices === true});
        return {...shape, cx: compactCx(this.cx, shape.w, this._s.container.w)};
    }

    currentShape() {
        if (this.expanded)
            return this._expandedShape();
        if (this._compact)
            return this.compactShape();
        return this.hovered ? this._s.hover(this.restShape()) : this.restShape();
    }

    _expandedShape() {
        const cap = this._s.expanded;
        const child = this.content.child;
        const [, natural] = child ? child.get_preferred_height(cap.w) : [0, 0];
        const h = this._s.expandedH(natural);     // 56 + 16n, up to the cap (design/expanded)
        return {w: cap.w, h, r: Math.min(cap.r, Math.floor(h / 2))};
    }

    _bgStyle(shape) {
        this._radius = shape.r;
        const k = this._focused ? null : keyline(this.activity?.keyline);
        return `border-radius: ${shape.r}px;${k ? ` border-color: ${k};` : ''}`;
    }

    applyShape(shape) {
        this._morphTo = null;
        this._collapsing = false;
        this._targetR = shape.r;
        this._radius = undefined;
        this._bgRun.set({x: (shape.cx ?? this.cx) - shape.w / 2, w: shape.w, h: shape.h});
        this._resetContentTransform();
    }

    // Every frame of a spring (and once at a jump): the bg's place and size, its radius
    // following its height (design/motion "Bo góc đi theo chiều cao"), set only when it
    // changes by a whole px.
    _applyBg({x, w, h}) {
        if (this._destroyed)
            return;
        this.bg.set_position(x, 0);
        this.bg.set_size(Math.max(0, w), Math.max(0, h));
        const r = radiusAt(h, this._targetR);
        if (r !== this._radius)
            this.bg.set_style(this._bgStyle({r}));
    }

    /**
     * @param {object} [shape]
     * @param {string} [spring]  a motion.js SPRINGS key: `open` by default (the island's
     *   expand)
     */
    morph(shape = this.currentShape(), spring = 'open') {
        this._morph(shape, spring);
    }

    _morph(shape, spring) {
        if (this._destroyed)
            return;
        const x = (shape.cx ?? this.cx) - shape.w / 2;
        const run = this._bgRun;
        const at = {x: run.value('x') ?? this.bg.x, w: run.value('w') ?? this.bg.width, h: run.value('h') ?? this.bg.height};
        // On the way the radius is the larger of where it is and where it goes, never past
        // half the height: it follows the height down as up, and is the shape's own at the
        // end (design/motion "Bo góc đi theo chiều cao")
        this._targetR = Math.max(this._radius ?? shape.r, shape.r);
        const endR = shape.r;
        this.bg.set_style(this._bgStyle({r: radiusAt(at.h, this._targetR)}));  // the keyline too
        if (!run.running && at.x === x && at.w === shape.w && at.h === shape.h) {
            this._targetR = endR;
            this.bg.set_style(this._bgStyle({r: radiusAt(at.h, endR)}));
            return; // already there: start nothing (nothing animates at rest)
        }
        const to = this._morphTo;
        if (run.running && to?.x === x && to.w === shape.w && to.h === shape.h)
            return; // already heading there
        this._morphTo = {x, w: shape.w, h: shape.h};
        const from = {cx: at.x + at.w / 2, w: at.w, h: at.h};
        if (run.value('x') === null)
            run.set({x: at.x, w: at.w, h: at.h});
        this._followBg(from, shape, spring);
        this._span = {from: {w: at.w, h: at.h}, to: {w: shape.w, h: shape.h}};
        run.to({x, w: shape.w, h: shape.h}, springFor(spring, from, shape), {
            onFrame: () => {
                this._followFrame();
                this._stepFlights();
            },
            onDone: finished => {
                if (!finished || this._destroyed)
                    return;
                this._flights.land();
                this._targetR = endR;
                this.bg.set_style(this._bgStyle({r: radiusAt(this._bgRun.value('h'), endR)}));
                this._collapsing = false;
                this._morphTo = null;
                this._resetContentTransform();
            },
        });
    }

    // The content sits at its final place at once and never scales (SPEC §5). While the
    // bg grows into it (expand, a much longer text) or shrinks past it (collapse), the
    // content is clipped to the bg every frame of the bg's spring, so it is uncovered
    // exactly as fast as the pill opens, its opacity following the same progress (full
    // from halfway). A plain slide (slide-to-fill, merge) moves it with the bg.
    // A new size of the same content (`size`: a longer text) is only uncovered, never faded:
    // the text is the one already shown, and fading it to 0 first read as a blink.
    _followBg(from, to, spring) {
        this._resetContentTransform();
        const grow = Math.min(from.w / to.w, from.h / to.h);
        const reveal = grow < REVEAL_FROM || this._collapsing;
        const dx = from.cx - (to.cx ?? this.cx);
        if (!reveal && Math.abs(dx) < 0.5)
            return;
        const fade = reveal && !this._collapsing && spring !== 'size';
        this._follow = {from, to: {...to, cx: to.cx ?? this.cx}, reveal, fade};
        this._followFrame();
    }

    _followFrame() {
        const f = this._follow;
        if (!f || this._destroyed)
            return;
        const c = this.content;
        const x = this._bgRun.value('x'), w = this._bgRun.value('w'), h = this._bgRun.value('h');
        if (!f.reveal) {
            c.translation_x = Math.round(x + w / 2 - f.to.cx);
            return;
        }
        // the clip is a rectangle; keep it off the pill's round ends
        const inset = Math.ceil(radiusAt(h, f.to.r) * 0.15);
        c.set_clip(x + inset - c.x, -c.y, Math.max(0, w - 2 * inset), Math.max(0, h));
        if (f.fade) {
            const dw = Math.abs(f.to.w - f.from.w), dh = Math.abs(f.to.h - f.from.h);
            const e = dw >= dh ? progressOf(f.from.w, f.to.w, w) : progressOf(f.from.h, f.to.h, h);
            c.opacity = Math.round(255 * Math.min(1, Math.max(0, 2 * e - 1)));
        }
    }

    // How far the bg has gone on its way, by the size that changes most (as the reveal)
    _progress() {
        const s = this._span;
        if (!s)
            return 1;
        const w = this._bgRun.value('w') ?? s.to.w, h = this._bgRun.value('h') ?? s.to.h;
        const dw = Math.abs(s.to.w - s.from.w), dh = Math.abs(s.to.h - s.from.h);
        return dw >= dh ? progressOf(s.from.w, s.to.w, w) : progressOf(s.from.h, s.to.h, h);
    }

    // The shared parts of the form just set take off from `boxes` (Flights.departures, read
    // before the swap) and go with the bg; with nothing on its way (animations off, the same
    // shape) they are there at once.
    _fly(boxes) {
        if (this._destroyed)
            return;
        this._flights.launch(boxes, this.content, this._progress());
        if (!this._bgRun.running)
            this._flights.land();
        else
            this._stepFlights();
    }

    _stepFlights() {
        if (!this._flights.flying || this._destroyed)
            return;
        // the bg's edge cuts the parts in flight as it cuts the content
        const x = this._bgRun.value('x') ?? this.bg.x, w = this._bgRun.value('w') ?? this.bg.width;
        const h = this._bgRun.value('h') ?? this.bg.height;
        // the clip is a rectangle; kept off the round ends, as the content's (_followFrame)
        const inset = Math.ceil(radiusAt(h, this._targetR ?? h / 2) * 0.15);
        this._flightLayer.set_clip(x + inset, 0, Math.max(0, w - 2 * inset), Math.max(0, h));
        this._flights.step(this._progress());
    }

    _resetContentTransform() {
        const c = this.content;
        const f = this._follow;
        this._follow = null;
        // retargeted mid-reveal: finish the fade instead of leaving it part-way
        if (f?.fade && c.opacity < 255)
            c.ease({opacity: 255, duration: FADES.out.ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        c.remove_clip();
        c.translation_x = 0;
    }

    // Press feedback for the idle pill and activities without an expanded presentation;
    // also how a non-expandable activity shows an alert (design/motion "Nhấn pill"): the bg
    // shrinks 4 px each way on `snap`, held PRESS_HOLD, then springs back on `snap` — from
    // where it is, with its speed.
    pulse() {
        if (this._destroyed)
            return;
        const rest = this.currentShape();
        // from the compact when it is open: the bar's press shape would squash it under its
        // content (a click raising a session's terminal, 2026-11-07)
        const press = this._compact
            ? {...rest, w: rest.w - 4, h: rest.h - 4}
            : this._s.press(this.restShape());
        const t0 = GLib.get_monotonic_time();
        let back = false;
        this._morph(press, 'snap');
        this._bgRun.to({}, 'snap', {
            onFrame: () => {
                if (back || GLib.get_monotonic_time() - t0 < PRESS_HOLD * 1000)
                    return;
                back = true;
                this._morph(this.currentShape(), 'snap');
            },
            onDone: finished => {
                if (finished && !back)
                    this._morph(this.currentShape(), 'snap');
            },
        });
    }

    /** Above the other pills: its bg, its content and the parts in flight over them. */
    raise() {
        const parent = this.bg.get_parent();
        for (const a of [this.bg, this.content, this._flightLayer])
            parent?.set_child_above_sibling(a, null);
    }

    // --- expanded (Island decides when) ---------------------------------------------

    /**
     * @param {?Clutter.Actor} [panel]  Home's panel (a click-open); without it the
     *   activity's own expanded presentation (alert, ask, transient)
     */
    expand(panel = null) {
        const boxes = this._flights.departures(this.content);
        this.expanded = true;
        this._panel = panel;
        this._dropCompact();          // the panel replaces the compact's content
        this._syncDot();
        this._setContent(panel ?? buildExpanded(this.activity), false);
        this._layoutContent();
        this._morph(this.currentShape(), 'open'); // fades the content in with the reveal
        this._fly(boxes);
    }

    collapse() {
        const boxes = this._flights.departures(this.content);
        this.expanded = false;
        this._panel = null;
        // Under the modal grab the pointer left without a leave event, and Clutter still
        // reports the actor it pressed on; sync_hover() would read that stale actor.
        // Clear it; the next real enter sets it again.
        this.bg.hover = false;
        this.content.hover = false;
        this._syncDot();
        this._setContent(this._restingContent(), false);
        this._layoutContent();
        this._collapsing = true;
        this._morph(this.currentShape(), 'close');
        this._fadeContent();
        this._fly(boxes);
    }

    // Soften the swap between minimal and expanded content (the bg uncovers it).
    _fadeContent() {
        this.content.remove_transition('opacity');
        this.content.opacity = 0;
        this.content.ease({opacity: 255, duration: FADES.in.ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    // --- content ------------------------------------------------------------------

    _restingContent() {
        const compact = this._compact ? this._compactContent() : null;
        if (compact)
            return compact;
        // the content box: the pill less its padding each side (design/pill), the leading
        // in its cell, the gaps of the em
        // the light's ends come off the cap (design/pill: the cap counts the light)
        const s = this._s, pad = 2 * s.pad + (this._light() ? 2 * s.ends : 0);
        const metrics = {cell: s.cell, gap: s.gap, buttonGap: s.buttonGap};
        if (!this.activity)
            return buildIdle({width: s.idle.w - 2 * s.pad, maxWidth: s.minimal(Infinity).w - pad, plan: this._island.idle, metrics});
        if (this.role === 'side')
            return buildMinimal(this.activity, {maxWidth: s.side.w - pad, more: this.more, side: true, metrics});
        const capW = s.minimal(Infinity, this.activity.sizeHint).w;
        return buildMinimal(this.activity, {maxWidth: capW - pad, more: this.more, metrics});
    }

    // The amber missed list over the activity's own compact (INDICATORS.md), else that;
    // the idle pill's is its plan's (weather: feels like, wind, humidity — SPEC §2a)
    _compactContent() {
        // the content carries its own paddings (design/compact): it is the compact's size
        const maxWidth = this._s.compactMax, metrics = this._s.compactMetrics;
        const missed = this._missed();
        if (missed)
            return buildMissedCompact(missed, {maxWidth, metrics});
        const shown = this._compactOf();
        if (!shown)
            return null;
        const plan = planCompact(shown);
        this._cardOnHover = plan?.card?.actionsOnHover === true;
        this._cardChoices = !!plan?.card?.choices;     // taller than a compact (shapes.js)
        this._builtHovered = this.hoverCounts;
        return buildCompact(shown, {
            maxWidth, metrics, hovered: this._builtHovered, light: this.role === 'centre' ? this.light : null,
            onType: () => this._island._typeIn(this),      // a card's Other: the keyboard
        });
    }

    // What the compact shows besides the missed list: the activity, or the idle plan
    _compactOf() {
        if (this.activity)
            return this.activity;
        const plan = this.role === 'centre' ? this._island.idle : null;
        return plan && planCompact(plan) !== null ? plan : null;
    }

    _hasCompact() {
        const shown = this._compactOf();
        return this._missed() !== null || (shown !== null && planCompact(shown) !== null);
    }

    // fade: cross-fade between activities; without it the new content replaces the
    // old one at once (updates of the same activity, light, compact, expand/collapse).
    /**
     * @param {?Clutter.Actor} actor  the new content
     * @param {boolean|string} fade  true: cross-fade (another activity in this pill);
     *   false: at once (expand, compact, the same activity's update); 'follow': at once,
     *   unless a cross-fade is under way — then the newer content takes the place of the
     *   one in it. The idle plan's setIdle reconfigures the pill the same frame an
     *   activity leaves it; swapping at once there cut the fade off and the clock popped
     *   in, one frame at the old place (2026-11-06, Ethan: after a short copy).
     */
    _setContent(actor, fade) {
        const old = this.content.child;
        if (old === actor)
            return;
        const fadingOut = this._pendingIn !== undefined;
        const fadingIn = this._fadingIn !== null && old === this._fadingIn;
        if (fade === 'follow' && fadingOut) {
            this._pendingIn?.destroy();         // never parented
            this._pendingIn = actor;
            return;
        }
        if (fade === 'follow' && fadingIn) {
            const opacity = old.opacity;        // go on from where the fade is
            this._dropContent(old);
            if (actor)
                this._fadeIn(actor, opacity);
            return;
        }
        if (fadingOut) {                        // any other swap ends a fade under way
            this._pendingIn?.destroy();
            this._pendingIn = undefined;
        }
        if (!fade || fade === 'follow') {
            this._dropContent(old);
            this.content.set_child(actor);
            return;
        }
        if (old) {
            this._pendingIn = actor;
            old.ease({
                opacity: 0, duration: FADES.out.ms,
                onComplete: () => {
                    if (this.content.child === old)
                        this.content.set_child(null);
                    old.destroy();
                    const next = this._pendingIn;
                    this._pendingIn = undefined;
                    if (next && !this._destroyed)
                        this._fadeIn(next);
                },
            });
        } else if (actor) {
            this._fadeIn(actor);
        }
    }

    _dropContent(old) {
        if (!old)
            return;
        old.remove_all_transitions();
        if (this._fadingIn === old)
            this._fadingIn = null;
        if (this.content.child === old)
            this.content.set_child(null);
        old.destroy();
    }

    _fadeIn(actor, from = 0) {
        actor.opacity = from;
        this._fadingIn = actor;
        this.content.set_child(actor);
        const done = () => {
            if (this._fadingIn === actor)
                this._fadingIn = null;
        };
        // Easing an actor that has never been allocated makes Clutter warn ("needs an
        // allocation"): start the fade on its first allocation instead. One-shot handler,
        // gone with the actor; no timer to clean up.
        const id = actor.connect('notify::allocation', () => {
            actor.disconnect(id);
            actor.ease({opacity: 255, duration: FADES.in.ms, delay: from ? 0 : FADES.out.ms, onStopped: done});
        });
    }

    // notify::width/height fire inside Clutter's allocation; moving the content there
    // leaves it needing an allocation when stage views update (Clutter warns). So read
    // the size and re-place it just before the next redraw, once per frame.
    _contentResized() {
        if (this._resizeLater || this._destroyed)
            return;
        this._resizeLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._resizeLater = 0;
            this._applyContentSize();
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyContentSize(spring = 'size') {
        if (!this.expanded) {
            // natural size, not the allocation: another relayout may already be queued
            // (an icon finished loading). The content has been allocated once by now,
            // so measuring it does not touch an unallocated label.
            const child = this.content.child;
            const [, w] = child ? this.content.get_preferred_width(-1) : [0, 0];
            const [, h] = child ? this.content.get_preferred_height(w) : [0, 0];
            if (this._compact) {
                // the compact's size never moves the neighbours: they rest under it
                this._compactW = Math.ceil(w);
                this._compactH = Math.ceil(h);
            } else {
                const restW = this.restShape().w;
                this._contentW = Math.ceil(w);
                this._contentH = Math.ceil(h);
                if (this.restShape().w !== restW) {
                    this.content.y = Math.max(0, Math.round((this._s.idle.h - this._contentH) / 2));
                    this._island._pillResized(this); // neighbours slide to fit
                    return;
                }
            }
        }
        this._layoutContent();
        // the idle pill opens on Home's panel and its missed compact too
        if (this.activity || this.expanded || this._compact)
            this._morph(this.currentShape(), spring);
    }

    _contentX() {
        if (this.expanded)
            return Math.round(this.cx - this._s.expanded.w / 2);
        if (this._compact)
            return Math.round(this.compactShape().cx - this._compactW / 2);
        return Math.round(this.cx - this._contentW / 2);
    }

    _layoutContent() {
        if (this.expanded) {
            this.content.set_width(this._s.expanded.w);
            this.content.set_position(this._contentX(), 0);
            return;
        }
        if (this.content.natural_width_set)
            this.content.set_width(-1); // back to natural width after expanded
        // stored sizes only: this also runs right after a new child was set
        // a compact's content is laid out from its top edge, its head first (design/compact)
        const y = this._compact ? 0 : Math.round((this._s.idle.h - this._contentH) / 2);
        this.content.set_position(this._contentX(), Math.max(0, y));
    }

    // --- hover and compact ------------------------------------------------------------

    // bg and content are siblings: moving between them flips one hover off before the
    // other on. Settle the combined state once per frame so the compact does not flicker.
    _hoverChanged() {
        if (this._hoverLater || this._destroyed)
            return;
        this._hoverLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._hoverLater = 0;
            this._applyHover();
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyHover() {
        if (this._destroyed)
            return;
        // hover holds its ttl (SPEC §2e) — open too: a greeting being read stays (2026-11-08,
        // Ethan: hovered, it still closed at 12 s)
        if (!this.hovered)
            this._ignoreHover = false;
        this._island._holdHovered(this, this.hoverCounts);
        if (this.expanded)
            return;
        // a card whose buttons show on hover (a notification's, design/alerts-and-asks)
        if (this._compact && this._cardOnHover && this.hoverCounts !== this._builtHovered)
            this._swapResting('size');
        if (this.hovered) {
            this._clearGrace();
            if (!this._compact && !this._compactId && this._hasCompact()) {
                const other = this._island.compactPill;
                if (other && other !== this) {
                    // moving straight from another compact: take over at once (SPEC §2c)
                    other._stopCompact();
                    this._openCompact();
                } else {
                    this._compactId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COMPACT_DELAY, () => {
                        this._compactId = 0;
                        this._openCompact();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
        } else {
            if (this._compactId) {
                GLib.source_remove(this._compactId);
                this._compactId = 0;
            }
            if (this._compact && !this._graceId && !this._held) {
                this._graceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COMPACT_GRACE, () => {
                    this._graceId = 0;
                    if (!this.hovered && !this._held)
                        this._stopCompact();
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
        if (!this._compact)
            this._morph(this.currentShape(), 'snap');   // hover on and off (design/motion)
    }

    // The amber light's compact (INDICATORS.md): on the centre pill, while amber.
    _missed() {
        return this.role === 'centre' && this.light === 'missed' ? this._island.missedCompact() : null;
    }

    _openCompact() {
        if (this._compact || this.expanded || this._destroyed || !this._hasCompact())
            return;
        this._compact = true;
        this._syncDot();
        this._island._compactShown(this, true);
        const boxes = this._flights.departures(this.content);
        this._swapResting('move');  // a shape morph that uncovers its content (SPEC §5)
        this._fly(boxes);
    }

    _clearGrace() {
        if (this._graceId) {
            GLib.source_remove(this._graceId);
            this._graceId = 0;
        }
    }

    // Forget the compact without swapping content (expand puts its own).
    _dropCompact() {
        if (this._compactId) {
            GLib.source_remove(this._compactId);
            this._compactId = 0;
        }
        this._clearGrace();
        if (!this._compact)
            return false;
        this._compact = false;
        this._syncDot();
        this._island._compactShown(this, false);
        return true;
    }

    _stopCompact() {
        if (!this._dropCompact() || this.expanded)
            return;
        const boxes = this._flights.departures(this.content);
        this._swapResting('close');
        // _applyContentSize morphs an activity's pill back; the idle pill (its compact is
        // the amber Missed list) is left to the island at rest, which does not move it:
        // without this its bg stayed at the compact's size around the clock (2026-11-06)
        if (!this.activity)
            this._morph(this.currentShape(), 'close');
        this._fly(boxes);
    }

    // Compact in or out: a content of another size. Measure and place it now, before
    // this frame paints; waiting for notify::width (next frame) showed the new text for
    // one frame at the old place, unclipped, before the bg started to uncover it.
    _swapResting(spring = 'size') {
        this._setContent(this._restingContent(), false);
        this._applyContentSize(spring);
    }

    // --- leaving ------------------------------------------------------------------------

    // Activity gone from the shown pills: fade out where it is, then destroy.
    leave(onGone) {
        this._stopCompact();
        this._flights.land();
        this.bg.reactive = this.content.reactive = false;
        this.bg.ease({opacity: 0, duration: FADES.in.ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this.content.ease({
            opacity: 0, duration: FADES.in.ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                this.destroy();
                onGone?.(this);
            },
        });
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        for (const id of [this._resizeLater, this._hoverLater]) {
            if (id)
                global.compositor.get_laters().remove(id);
        }
        this._resizeLater = this._hoverLater = 0;
        if (this._compactId) {
            GLib.source_remove(this._compactId);
            this._compactId = 0;
        }
        this._clearGrace();
        this._pendingIn?.destroy();      // waiting for a fade, never parented
        this._pendingIn = undefined;
        this._fadingIn = null;
        this._flights.land();
        this._bgRun.destroy();
        this.bg.destroy();
        this.content.destroy();
        this._flightLayer.destroy();
    }
}
