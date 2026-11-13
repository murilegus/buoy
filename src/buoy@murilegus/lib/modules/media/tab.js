import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {EmptyState, iconProps, makeElement, restSlot} from '../../kit/ui/present/elements.js';
import {markShared} from '../../kit/ui/present/flight.js';
import {eqGlyph, eqLeaving, marquee, marqueeTurns} from '../../kit/ui/present/motion.js';
import {tick} from '../../kit/ui/present/parts.js';
import {element, livePosition, mediaTimes} from '../../kit/model/presentation.js';
import {FADES, TAB_SHIFT} from '../../kit/model/motion.js';
import {SpringRunner, afterLayout, slideIn} from '../../kit/ui/spring.js';
import {SlidingRow} from '../../kit/ui/strip.js';
import {artSide, cardHeight, chipNames, controls, seekOf, subLine} from './layout.js';

const NOTE = 'audio-x-generic-symbolic';
const ART_RADIUS = 8;
// the card's height until the tab has been measured (1920's: the body 212)
let knownBodyH = 212;

/**
 * The Media tab (design/media, M1, 2026-11-13): what the compact has no room for.
 *
 *   chips   with more than one player, a row of chips above the card: each player's logo,
 *           its app's name and the equaliser while it plays; the chosen one's fill a marker
 *           that slides to the next (kit/ui/strip.js, as the tab strip). Past the row's width
 *           only the chosen chip keeps its name.
 *   card    fill-1, r 16, as Home's main card: the art 8 in (the card less 16), the title,
 *           "artist · player", the album, ↗ (open the player's window); at its foot the seek
 *           bar with its times and shuffle · ⏮ · ⏯ · ⏭ · repeat — always all of them, those
 *           the player can't disabled (no hover, no press; Ethan, 2026-11-13).
 *
 * Switching players moves as the tab strip does: the card's old content fades out and moves
 * 12 px back, the new comes from 12 px. Opened from a player's pill or compact, its chip is
 * the chosen one (`from`, 2026-11-07). No volume here (a mixer gets its own place). It reads
 * the kit's activities (`update`, kit/ui/home.js) and acts through each one's `onAction`.
 */
export class MediaTab {
    /**
     * @param {object} [kit]
     * @param {function():void} [kit.close]  the island, after an action
     * @param {?string} [kit.from]  the activity whose pill opened the island: its chip is chosen
     */
    constructor({close = null, from = null} = {}) {
        this._close = close;
        this.actor = new St.BoxLayout({
            style_class: 'buoy-media-tab', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true,
        });
        this._list = [];
        this._chosen = from;      // the chip shown: the pill it was opened from, then the user's pick
        this._dragging = false;
        this._pending = false;    // a list came during a drag: render after it
        this._chips = null;       // SlidingRow, with more than one player
        this._chipsKey = '';      // what the chips show: rebuilt only when it changes
        this._card = null;        // the card: its content stacked (BinLayout), the old one leaving
        this._content = null;
        this._bodyH = knownBodyH;
        this._fitLater = 0;
        this._chipsLater = null;
        this._lineSet = null;     // the card's lines under the title: {box, at, turns, joined}
        this.actor.connect('notify::height', () => this._fitLaterOnce());
        this.actor.connect('notify::mapped', () => {
            // chips built while the tab was kept off the stage were never measured: now
            if (this.actor.mapped && this._chipsUnmeasured) {
                this._chipsKey = '';
                this._render();
            }
            this._fitLaterOnce();
        });
        this._chipsUnmeasured = false;
    }

    /** @param {object[]} activities  this tab's media activities, stack order */
    update(activities) {
        this._list = activities;
        if (this._dragging) {
            this._pending = true;
            return;
        }
        this._render();
    }

    get _current() {
        return this._list.find(a => a.id === this._chosen) ?? this._list[0] ?? null;
    }

    // --- the whole tab --------------------------------------------------------------------

    /**
     * @param {number} [dir]  a switch of player: -1 / +1, the side the new one comes from
     * @param {?Map} [before]  the chips' places before (SlidingRow.places)
     */
    _render(dir = 0, before = null) {
        const a = this._current;
        if (!a) {
            this._clear();
            this.actor.add_child(new EmptyState('Nothing playing', {pose: 'idle'}));
            return;
        }
        if (this.actor.get_children().some(c => c instanceof EmptyState))
            this._clear();
        this._renderChips(a, dir !== 0, before);
        if (!this._card) {
            this._card = new St.Widget({
                style_class: 'buoy-media-card', layout_manager: new Clutter.BinLayout(), x_expand: true,
            });
            this.actor.add_child(this._card);
        }
        this._card.set_height(cardHeight(this._bodyH, this._list.length));
        // the same player paused: its bars come down from where they are (motion.js eqGlyph)
        eqLeaving(!dir && this._content ? this._content : null);
        const next = this._buildContent(a);
        eqLeaving(null);
        const old = this._content;
        this._content = next;
        this._card.add_child(next);
        if (old && dir)
            leave(old, dir);
        else
            old?.destroy();
        if (dir)
            slideIn(next, dir * TAB_SHIFT, 'snap', FADES.in.ms);
        this._fitLaterOnce();
    }

    _clear() {
        this._chipsLater?.();
        this._chipsLater = null;
        this.actor.destroy_all_children();
        this._chips = this._card = this._content = this._lineSet = null;
        this._chipsKey = '';
    }

    // The body's height (the scroll view the kit put the tab in), measured once the tab has
    // its size, just before the next redraw; the card and the art follow it.
    _fitLaterOnce() {
        if (this._fitLater)
            return;
        this._fitLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._fitLater = 0;
            this._fit();
            return GLib.SOURCE_REMOVE;
        });
    }

    _fit() {
        if (!this.actor.mapped)
            return;
        let view = this.actor.get_parent();
        while (view && !(view instanceof St.ScrollView))
            view = view.get_parent();
        const node = this.actor.get_theme_node();
        const h = Math.floor((view ?? this.actor).get_allocation_box().get_height() - node.get_vertical_padding());
        if (h > 0 && h !== this._bodyH) {
            this._bodyH = knownBodyH = h;
            if (this._content)
                this._render();      // the card and the art at their size, no motion (fits again)
            return;
        }
        this._fitLines();
    }

    // The album joins the line above when the card has no room for its own (design/media,
    // 2026-11-13: two players' chips at 1920 leave the column 156 of the 170 it asks).
    // Measured, not a fixed height, so a larger text size gets it too; before the frame is
    // painted (BEFORE_REDRAW), so the three lines never show squeezed.
    _fitLines() {
        const l = this._lineSet;
        if (!l || l.joined || !this._content || !l.at.album)
            return;
        const [, nat] = this._content.get_preferred_height(-1);
        if (nat <= cardHeight(this._bodyH, this._list.length) + 0.5)
            return;
        l.joined = true;
        l.box.destroy_all_children();
        this._addLine(l.box, subLine(l.at, {album: true}), 'buoy-media-sub', l.turns);
    }

    // --- the players' chips ---------------------------------------------------------------

    _renderChips(current, switched, before) {
        if (this._list.length < 2) {
            this._chipsLater?.();
            this._chipsLater = null;
            this._chips?.group.destroy();
            this._chips = null;
            this._chipsKey = '';
            return;
        }
        const key = JSON.stringify([current.id, this._list.map(a => [a.id, a.attributes?.app, a.state?.status])]);
        if (this._chips && key === this._chipsKey && !switched)
            return;
        this._chipsKey = key;
        if (!this._chips) {
            this._chips = new SlidingRow({groupClass: 'buoy-media-chips', rowClass: 'buoy-media-chips-row', markerClass: 'buoy-media-chip-marker'});
            this.actor.insert_child_at_index(this._chips.group, 0);
        }
        const row = this._chips.row;
        const places = before ?? this._chips.places();
        row.destroy_all_children();
        const labels = [];
        for (const a of this._list) {
            const chosen = a === current;
            const box = new St.BoxLayout({style_class: 'buoy-media-chip-box'});
            const app = a.attributes?.app || a.app || '';
            const logo = a.attributes?.appIcon
                ? new St.Icon({gicon: a.attributes.appIcon, icon_size: 16})
                : new St.Icon({...iconProps(NOTE), icon_size: 16});
            logo.y_align = Clutter.ActorAlign.CENTER;
            box.add_child(logo);
            const name = new St.Label({text: app, y_align: Clutter.ActorAlign.CENTER});
            box.add_child(name);
            labels.push(name);
            if (a.state?.status === 'Playing')
                box.add_child(eqGlyph({color: a.attributes?.tint}));
            const chip = new St.Button({
                style_class: `buoy-media-chip${chosen ? ' buoy-media-chip-on' : ''}`,
                child: box, can_focus: true, accessible_name: app || 'Player',
            });
            chip.connect('clicked', () => this._choose(a.id));
            this._chips.tag(chip, a.id);
            row.add_child(chip);
        }
        // Which chips keep their name is known once they are measured: the row shows from the
        // frame after, when the names that do not fit are gone (one frame unseen)
        row.opacity = 0;
        const chosenIndex = this._list.indexOf(current);
        this._chipsLater?.();
        this._chipsLater = afterLayout(() => {
            this._chipsLater = null;
            if (!this._chips || this._chips.row !== row)
                return;
            // a kept tab updated off the stage (another player paused while Home shows): no
            // theme node there (St's CRITICAL for each ancestor); measured when it is shown
            if (!row.get_stage()) {
                this._chipsUnmeasured = true;
                return;
            }
            this._chipsUnmeasured = false;
            const gap = row.get_theme_node().get_length('spacing') || 6;
            const widths = row.get_children().map((chip, i) => {
                const [, named] = chip.get_preferred_width(-1);
                const [, text] = labels[i].get_preferred_width(-1);
                const spacing = /** @type {St.Widget} */ (/** @type {St.Button} */ (chip).child).get_theme_node().get_length('spacing');
                return {named, logo: named - text - spacing};
            });
            chipNames(widths, chosenIndex, this.actor.width, gap).forEach((named, i) => {
                labels[i].visible = named;
            });
            this._chips.slide(places, current.id, switched);
            this._chipsLater = afterLayout(() => {
                this._chipsLater = null;
                row.opacity = 255;
            });
        });
    }

    /**
     * Home's card or tile of a player was pressed (kit/ui/home.js _activateActivity): its chip.
     * Not on screen yet, it is just the one shown; on screen, it slides as a chip's press.
     *
     * @param {string} id  the activity's
     */
    choose(id) {
        if (this.actor.mapped) {
            this._choose(id);
            return;
        }
        if (id === this._chosen)
            return;
        this._chosen = id;
        this._render();
    }

    _choose(id) {
        if (id === this._current?.id)
            return;
        const from = this._list.indexOf(this._current);
        const to = this._list.findIndex(a => a.id === id);
        const before = this._chips?.places() ?? null;
        this._chosen = id;
        this._render(Math.sign(to - from) || 1, before);
    }

    // --- the card's content -----------------------------------------------------------------

    _buildContent(a) {
        const cardH = cardHeight(this._bodyH, this._list.length);
        const side = artSide(cardH);
        const box = new St.BoxLayout({style_class: 'buoy-media-content', x_expand: true, y_expand: true});
        box.add_child(this._art(a, side));
        const column = new St.BoxLayout({
            style_class: 'buoy-media-column', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true,
        });
        // the head, 32 tall: the title as tall as ↗, on its middle; under it the lines take
        // the column's whole width; long ones run one at a time (design/media, 2026-11-13)
        const at = a.attributes ?? {};
        const turns = marqueeTurns();
        const head = new St.BoxLayout({style_class: 'buoy-media-head', x_expand: true, height: 32});
        // the cover and the title are the pill's: they fly here from it (design/motion)
        const title = markShared(marquee(at.title || a.text || '', 'buoy-media-title', turns), 'title', a);
        title.x_expand = true;
        title.y_align = Clutter.ActorAlign.CENTER;
        head.add_child(title);
        head.add_child(this._openButton(a));
        column.add_child(head);
        column.add_child(this._lines(at, turns));
        column.add_child(new St.Widget({y_expand: true}));
        column.add_child(this._position(a));
        column.add_child(this._transport(a));
        box.add_child(column);
        return box;
    }

    // the cover, the card less 16, r 8; without one, a fill-2 tile with the note
    _art(a, side) {
        const uri = a.attributes?.art;
        const bin = markShared(new St.Bin({width: side, height: side, y_align: Clutter.ActorAlign.START}), 'leading', a);
        if (uri) {
            bin.set_child(makeElement(element({art: uri, icon: NOTE}), 'expanded', a, {art: side, artRadius: ART_RADIUS, icon: 32}));
            return bin;
        }
        bin.style_class = 'buoy-media-tile';
        bin.set_child(new St.Icon({...iconProps(NOTE), icon_size: 32}));
        return bin;
    }

    // "artist · player" and the album, each running when long, in turn with the title
    // (never "…", 2026-11-13, Ethan); the album may join the first later (_fitLines)
    _lines(at, turns) {
        const box = new St.BoxLayout({style_class: 'buoy-media-text', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this._addLine(box, subLine(at), 'buoy-media-sub', turns);
        this._addLine(box, at.album, 'buoy-media-album', turns);
        this._lineSet = {box, at, turns, joined: false};
        return box;
    }

    _addLine(box, text, cls, turns) {
        if (!text)
            return;
        const line = marquee(text, cls, turns);
        line.x_expand = true;
        box.add_child(line);
    }

    // ↗: the player's window, then the island closes; disabled without an app to raise
    _openButton(a) {
        const app = a.attributes?.app;
        const b = roundButton({
            icon: 'external-link-symbolic', kind: 'skip', enabled: Boolean(app), on: false,
            label: app ? `Open ${app}` : 'Open the player',
        });
        b.y_align = Clutter.ActorAlign.CENTER;
        b.connect('clicked', () => {
            a.onAction?.('raise');
            this._close?.();
        });
        // its slot shows the equaliser at rest, ↗ under the pointer or the keyboard's focus,
        // as the compact's ⏸ (design/media "Một player", 2026-11-13, Ethan); the pill's flies
        // here (shared parts)
        const eq = eqGlyph({paused: a.state?.status !== 'Playing', color: a.isStale ? null : a.attributes?.tint});
        return restSlot(b, markShared(eq, 'eq', a));
    }

    // The seek bar, always: it moves the track when the player can seek a track with a length;
    // else it stays (empty for a stream) and does nothing (design/media)
    _position(a) {
        const box = new St.BoxLayout({style_class: 'buoy-media-position', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const {live, enabled} = seekOf(a.state);
        const slider = new Slider(live ? live.position / live.length : 0);
        slider.add_style_class_name('buoy-media-seek');
        if (!enabled)
            slider.add_style_class_name('buoy-media-seek-off');
        slider.reactive = slider.can_focus = enabled;
        slider.accessible_name = 'Position';
        const times = new St.BoxLayout({x_expand: true});
        const off = live ? '' : ' buoy-media-time-off';
        const elapsed = new St.Label({style_class: `buoy-media-time${off}`, text: '--:--'});
        const left = new St.Label({style_class: `buoy-media-time${off}`, text: '--:--'});
        times.add_child(elapsed);
        times.add_child(new St.Widget({x_expand: true}));
        times.add_child(left);
        box.add_child(slider);
        box.add_child(times);
        if (!live)
            return box;

        let setting = false;
        const show = pos => {
            [elapsed.text, left.text] = mediaTimes(pos, live.length);
            if (!this._dragging) {
                setting = true;
                slider.value = pos / live.length;
                setting = false;
            }
        };
        slider.connect('drag-begin', () => {
            this._dragging = true;
        });
        slider.connect('drag-end', () => {
            this._dragging = false;
            a.onAction?.('seek', slider.value * live.length);
            if (this._pending) {
                this._pending = false;
                this._render();
            }
        });
        // keys and scroll move it without a drag
        slider.connect('notify::value', () => {
            if (this._dragging)
                [elapsed.text, left.text] = mediaTimes(slider.value * live.length, live.length);
            else if (!setting && enabled)
                a.onAction?.('seek', slider.value * live.length);
        });
        show(livePosition(live, Date.now()));
        tick(box, () => show(livePosition(live, Date.now())),
            () => live.playing && livePosition(live, Date.now()) < live.length);
        return box;
    }

    // shuffle · ⏮ · ⏯ · ⏭ · repeat, always all five (layout.js controls)
    _transport(a) {
        const row = new St.BoxLayout({style_class: 'buoy-media-transport', x_align: Clutter.ActorAlign.CENTER});
        for (const c of controls(a.state)) {
            const b = roundButton(c);
            b.connect('clicked', () => a.onAction?.(c.id));
            row.add_child(b);
        }
        return row;
    }

    destroy() {
        if (this._fitLater)
            global.compositor.get_laters().remove(this._fitLater);
        this._fitLater = 0;
        this._chipsLater?.();
        this._chipsLater = null;
        this._chips = this._card = this._content = null;
        this._close = null;
        this.actor.destroy();
    }
}

// A round 32 (design/media): `toggle` without a fill when off, fill-3 when on; `skip` fill-2;
// `main` cream. Disabled: fg-disabled, not reactive (no hover, no press), not focusable.
function roundButton({icon, kind, enabled, on, label}) {
    const b = new St.Button({
        style_class: `buoy-media-round buoy-media-${kind}${on ? ' buoy-media-on' : ''}${enabled ? '' : ' buoy-media-off'}`,
        child: new St.Icon({...iconProps(icon), icon_size: 16}),
        reactive: enabled, can_focus: enabled, accessible_name: label, width: 32, height: 32,
    });
    return b;
}

// The card's old content leaves where it stands (it shares the card's BinLayout with the new
// one): it fades out and moves TAB_SHIFT the other way, then goes
function leave(old, dir) {
    old.reactive = false;
    const run = new SpringRunner(old, v => {
        old.translation_x = Math.round(v.t);
    });
    run.set({t: 0});
    run.to({t: -dir * TAB_SHIFT}, 'snap');
    old.ease({
        opacity: 0, duration: FADES.out.ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onStopped: () => old.destroy(),
    });
}
