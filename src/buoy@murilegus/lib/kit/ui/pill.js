import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {buildCompact, buildMissedCompact} from './present/compact.js';
import {buildExpanded} from './present/expanded.js';
import {buildIdle, buildMinimal} from './present/minimal.js';
import {lightSlot, planCompact, planExpanded, keyline} from '../model/presentation.js';
import {compactCx, shrinkStop} from '../model/shapes.js';

const COMPACT_DELAY = 300;  // ms of hover before the pill grows into its compact (SPEC §2)
const COMPACT_GRACE = 200;  // ms the compact stays after the pointer leaves it (SPEC §2c)
const MERGE_MS = 360;    // side pills sliding into / out of an expanded one (SPEC §2c)
const MORPH_MODE = Clutter.AnimationMode.EASE_OUT_BACK;
// The morphs' durations, a fifth slower than the first ones (380 / 200 / 250, merge 300;
// 2026-11-06, Ethan: the back-out read hurried): a shape (expand, collapse, into the
// compact), a size (out of the compact, a longer text), the press's settle
const SHAPE_MS = 460;
const SIZE_MS = 240;
// out of the compact: a little quicker than into it (SHAPE_MS), not snapped (Ethan, 2026-11-06)
const COMPACT_OUT_MS = 360;
const PRESS_MS = 300;
const REVEAL_FROM = 0.8; // the bg grows by more than this ratio: it uncovers the content
// A long shrink (pill.js _morph, shapes.js shrinkStop): its share of the time to reach the
// turning point, then it settles out to its size
const SHRINK_TURN = 0.7;

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
        this._morphTo = null;        // target of the running bg transition
        this._collapsing = false;    // until the collapse morph lands: bg clips the content
        this._follow = null;         // {t, id}: bg transition the content clip follows
        this._destroyed = false;
        this._dot = null;            // the buoy light at the left end (_syncDot)

        this.bg = new St.Widget({style_class: 'buoy-island', reactive: true, track_hover: true});
        this.content = new St.Bin({style_class: 'buoy-content', reactive: true, track_hover: true});
        parent.add_child(this.bg);
        parent.add_child(this.content);

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
        this._setContent(this._restingContent(), same && !fade ? 'follow' : true);
        // A pill that appears (or changes activity) under a resting pointer is hovered
        // without an enter event: look again, so its compact still opens.
        if (!same)
            this._hoverChanged();
    }

    // Move the pill's centre; `animate` slides it (slide-to-fill, merge/split).
    setCx(cx, animate) {
        this.cx = cx;
        const shape = this.currentShape();
        this._layoutContent();
        if (animate)
            this._morph(shape, MERGE_MS);
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
                a.ease({opacity, duration: MERGE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            else
                a.opacity = opacity;
        }
    }

    // Under another pill's compact (SPEC §5): fade where it stands, 100 ms out, 200 ms in;
    // reactivity is left alone.
    dim(dimmed) {
        for (const a of [this.bg, this.content]) {
            a.remove_transition('opacity');
            a.ease({opacity: dimmed ? 0 : 255, duration: dimmed ? 100 : 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
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
        const shape = this._s.compact(this._compactW, this._compactH);
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
        const h = Math.min(cap.h, Math.max(Math.ceil(natural), 2 * this._s.idle.h));
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
        this.bg.remove_transition('x');
        this.bg.remove_transition('width');
        this.bg.remove_transition('height');
        this.bg.set_size(shape.w, shape.h);
        this.bg.set_position((shape.cx ?? this.cx) - shape.w / 2, 0);
        this.bg.set_style(this._bgStyle(shape));
        this._resetContentTransform();
    }

    morph(shape = this.currentShape(), duration = SHAPE_MS) {
        this._morph(shape, duration);
    }

    _morph(shape, duration) {
        if (this._destroyed)
            return;
        const x = (shape.cx ?? this.cx) - shape.w / 2;
        this.bg.set_style(this._bgStyle(shape));
        const t = this.bg.get_transition('width') || this.bg.get_transition('x');
        if (!t && this.bg.x === x && this.bg.width === shape.w && this.bg.height === shape.h)
            return; // already there: start no transition (nothing animates at rest)
        const to = this._morphTo;
        if (t && to?.x === x && to.w === shape.w && to.h === shape.h)
            return; // already heading there: restarting would hold the morph at its start
        this._morphTo = {x, w: shape.w, h: shape.h};
        const from = {cx: this.bg.x + this.bg.width / 2, w: this.bg.width, h: this.bg.height};
        this.bg.remove_transition('x');
        this.bg.remove_transition('width');
        this.bg.remove_transition('height');
        const done = finished => {
            if (finished)
                this._collapsing = false;
        };
        const stop = shrinkStop(from, shape);
        if (!stop) {
            this.bg.ease({x, width: shape.w, height: shape.h, duration, mode: MORPH_MODE, onStopped: done});
            this._followBg(from, shape, duration);
            return;
        }
        // A long shrink: EASE_OUT_BACK would bounce ~10 % of it past the size, into the
        // text. Shrink to just short of it (at most SHRINK_BOUNCE px), then settle out —
        // the same overshoot-and-return, bounded (2026-11-06, Ethan)
        const turn = Math.round(duration * SHRINK_TURN);
        const cx = shape.cx ?? this.cx;
        this.bg.ease({
            x: cx - stop.w / 2, width: stop.w, height: stop.h, duration: turn,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onStopped: finished => {
                const heading = this._morphTo;
                if (!finished || this._destroyed || heading?.x !== x || heading.w !== shape.w || heading.h !== shape.h)
                    return;     // stopped or sent elsewhere meanwhile
                this.bg.ease({
                    x, width: shape.w, height: shape.h, duration: duration - turn,
                    mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD, onStopped: done,
                });
            },
        });
        this._followBg(from, {...stop, cx}, turn);
    }

    // The content sits at its final place at once and never scales (SPEC §5). While the
    // bg grows into it (expand, a much longer text) or shrinks past it (collapse, the
    // EASE_OUT_BACK undershoot), the content is clipped to the bg every frame of the bg's
    // own transition, so it is uncovered exactly as fast as the pill opens. A plain slide
    // (slide-to-fill, merge) moves it with the bg on the same curve instead.
    _followBg(from, to, duration) {
        this._resetContentTransform();
        const grow = Math.min(from.w / to.w, from.h / to.h);
        if (grow < REVEAL_FROM || this._collapsing) {
            const t = ['width', 'height', 'x'].map(p => this.bg.get_transition(p)).find(Boolean);
            if (t)
                this._clipToBg(t, from, to, !this._collapsing);
            return;
        }
        const dx = from.cx - (to.cx ?? this.cx);
        if (Math.abs(dx) < 0.5)
            return;
        this.content.translation_x = dx;
        // @ts-expect-error -- snake_case, as Shell's environment.js _easeActor reads it; @girs lists camelCase only
        this.content.ease({translation_x: 0, duration, mode: MORPH_MODE});
    }

    // fade: opening; the content also fades in with the same progress, so a word the
    // bg's edge is still cutting through stays faint (full from halfway through the morph)
    _clipToBg(t, from, to, fade) {
        const c = this.content;
        // the clip is a rectangle; keep it off the pill's round ends
        const inset = Math.ceil(to.r * 0.15);
        const x0 = from.cx - from.w / 2, x1 = (to.cx ?? this.cx) - to.w / 2;
        const clip = e => {
            const w = from.w + (to.w - from.w) * e;
            const h = from.h + (to.h - from.h) * e;
            const x = x0 + (x1 - x0) * e;
            c.set_clip(x + inset - c.x, -c.y, Math.max(0, w - 2 * inset), Math.max(0, h));
            if (fade)
                c.opacity = Math.round(255 * Math.min(1, Math.max(0, 2 * e - 1)));
        };
        clip(0);
        // new-frame runs as the timeline advances, before layout: no allocation is touched
        const id = t.connect('new-frame', () => clip(t.get_progress()));
        t.connect('stopped', () => {
            if (!this._destroyed && this._follow?.t === t)
                this._resetContentTransform();
        });
        this._follow = {t, id, fade};
    }

    _resetContentTransform() {
        const c = this.content;
        const f = this._follow;
        if (f) {
            f.t.disconnect(f.id);
            this._follow = null;
            // retargeted mid-reveal: finish the fade instead of leaving it part-way
            if (f.fade && c.opacity < 255)
                c.ease({opacity: 255, duration: 100, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        }
        c.remove_clip();
        c.remove_transition('translation-x');
        c.translation_x = 0;
    }

    // Press feedback for the idle pill and activities without an expanded presentation;
    // also how a non-expandable activity shows an alert.
    pulse() {
        if (this._destroyed)
            return;
        const rest = this.currentShape();
        // from the compact when it is open: the bar's press shape (32 + 4 px) would squash
        // it under its content (a click raising a session's terminal, 2026-11-07)
        const press = this._compact
            ? {...rest, w: rest.w + 8, h: rest.h + 4}
            : this._s.press(this.restShape());
        this._morphTo = null;
        this.bg.remove_all_transitions();
        this.bg.set_style(this._bgStyle(press));
        this.bg.ease({
            x: (press.cx ?? this.cx) - press.w / 2, width: press.w, height: press.h,
            duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: finished => {
                if (finished)
                    this._morph(rest, PRESS_MS);
            },
        });
    }

    // --- expanded (Island decides when) ---------------------------------------------

    /**
     * @param {?Clutter.Actor} [panel]  Home's panel (a click-open); without it the
     *   activity's own expanded presentation (alert, ask, transient)
     */
    expand(panel = null) {
        this.expanded = true;
        this._panel = panel;
        this._dropCompact();          // the panel replaces the compact's content
        this._syncDot();
        this._setContent(panel ?? buildExpanded(this.activity), false);
        this._layoutContent();
        this._morph(this.currentShape(), SHAPE_MS); // fades the content in with the reveal
    }

    collapse() {
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
        this._morph(this.currentShape(), SHAPE_MS);
        this._fadeContent();
    }

    // Soften the swap between minimal and expanded content (the bg uncovers it).
    _fadeContent() {
        this.content.remove_transition('opacity');
        this.content.opacity = 0;
        this.content.ease({opacity: 255, duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
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
        this._builtHovered = this.hoverCounts;
        return buildCompact(shown, {maxWidth, metrics, hovered: this._builtHovered, light: this.role === 'centre' ? this.light : null});
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
                opacity: 0, duration: 100,
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
            actor.ease({opacity: 255, duration: 200, delay: from ? 0 : 100, onStopped: done});
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

    _applyContentSize(duration = SIZE_MS) {
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
            this._morph(this.currentShape(), duration);
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
            this._swapResting(SIZE_MS);
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
            this._morph(this.currentShape(), SIZE_MS);
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
        this._swapResting(SHAPE_MS);  // a shape morph that uncovers its content (SPEC §5)
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
        this._swapResting(COMPACT_OUT_MS);
        // _applyContentSize morphs an activity's pill back; the idle pill (its compact is
        // the amber Missed list) is left to the island at rest, which does not move it:
        // without this its bg stayed at the compact's size around the clock (2026-11-06)
        if (!this.activity)
            this._morph(this.currentShape(), COMPACT_OUT_MS);
    }

    // Compact in or out: a content of another size. Measure and place it now, before
    // this frame paints; waiting for notify::width (next frame) showed the new text for
    // one frame at the old place, unclipped, before the bg started to uncover it.
    _swapResting(duration = SIZE_MS) {
        this._setContent(this._restingContent(), false);
        this._applyContentSize(duration);
    }

    // --- leaving ------------------------------------------------------------------------

    // Activity gone from the shown pills: fade out where it is, then destroy.
    leave(onGone) {
        this._stopCompact();
        this.bg.reactive = this.content.reactive = false;
        this.bg.ease({opacity: 0, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this.content.ease({
            opacity: 0, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
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
        this.bg.destroy();
        this.content.destroy();
    }
}
