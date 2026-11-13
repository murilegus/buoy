import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {buildElement, EmptyState, iconProps} from '../../kit/ui/present/elements.js';
import {dimStale} from '../../kit/ui/present/motion.js';

import {DISMISS, canDismiss} from './adapter.js';

/**
 * The Claude Code tab (CODING-AGENTS.md §2, Ethan 2026-11-07): every session the island
 * shows, one row each — Bu in its pose, the session's name, what it is doing, how long —
 * and a permission prompt's buttons on its session's row. A click on a row brings the
 * session's terminal up (the activity's onPress) and closes the island. Asks of other
 * callers (D-Bus `Ask()`, kind `ask` is this module's) get a row of their own.
 *
 * It reads the kit's activities (`update`, kit/ui/home.js): kind `agent` and kind `ask`.
 */
export class AgentsTab {
    /** @param {{close?: function():void}} [kit]  close(): the island, after an action */
    constructor({close = null} = {}) {
        this._close = close;
        this.actor = new St.BoxLayout({
            style_class: 'buoy-agents-tab', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
    }

    /** @param {object[]} activities  this tab's activities (agent, ask), stack order */
    update(activities) {
        this.actor.destroy_all_children();
        const sessions = activities.filter(a => a.kind === 'agent');
        const asks = activities.filter(a => a.kind === 'ask');
        // a session's prompt is `<its id>:ask` (source.js)
        const askOf = s => asks.find(q => q.id === `${s.id}:ask`) ?? null;
        const own = new Set(sessions.map(askOf).filter(Boolean));
        if (!sessions.length && asks.length === own.size) {
            this.actor.add_child(new EmptyState('No Claude Code sessions', {pose: 'idle'}));
            return;
        }
        // Two parts when some are stale (2026-11-13, Ethan): Active — what works or asks, and
        // other callers' prompts — then Stale, with its count and Clear (each row its ×)
        const stale = sessions.filter(s => canDismiss(s, askOf(s) !== null));
        const active = sessions.filter(s => !stale.includes(s));
        const loose = asks.filter(x => !own.has(x));
        if (stale.length && (active.length || loose.length))
            this.actor.add_child(this._section('Active', active.length + loose.length));
        // a prompt whose session is hidden behind it (source.js) or another caller's
        for (const q of loose)
            this.actor.add_child(this._row(q, q, {name: q.compact?.text ?? q.text, doing: q.compact?.subtitle ?? null}));
        for (const s of active)
            this.actor.add_child(this._sessionRow(s, askOf(s)));
        if (!stale.length)
            return;
        this.actor.add_child(this._section('Stale', stale.length, () => stale.forEach(s => s.onAction?.(DISMISS))));
        for (const s of stale)
            this.actor.add_child(this._sessionRow(s, null));
    }

    _sessionRow(s, ask) {
        return this._row(s, ask, {name: s.compact?.text ?? s.text, doing: s.compact?.subtitle ?? null});
    }

    // A part's head: its name and count; Stale's has Clear (every stale session leaves)
    _section(title, count, onClear = null) {
        const bar = new St.BoxLayout({style_class: 'buoy-agents-bar', x_expand: true});
        bar.add_child(new St.Label({text: `${title} · ${count}`, style_class: 'buoy-agents-count', y_align: Clutter.ActorAlign.CENTER}));
        bar.add_child(new St.Widget({x_expand: true}));
        if (onClear) {
            const clear = new St.Button({
                style_class: 'buoy-agents-clear', can_focus: true, label: 'Clear', accessible_name: 'Clear the stale sessions',
                y_align: Clutter.ActorAlign.CENTER,
            });
            clear.connect('clicked', () => onClear());
            bar.add_child(clear);
        }
        return bar;
    }

    // Bu · name over what it does · the time; under them a prompt's buttons
    _row(a, ask, {name, doing}) {
        const box = new St.BoxLayout({
            style_class: 'buoy-agents-entry', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        const button = new St.Button({
            style_class: 'buoy-agents-row', can_focus: true, x_expand: true,
            accessible_name: [name, doing].filter(Boolean).join(', '),
            reactive: typeof a.onPress === 'function',
        });
        if (typeof a.onPress === 'function') {
            // its terminal comes up and the island closes; already in front, the island
            // closes all the same (the row's own click has nowhere else to go)
            button.connect('clicked', () => {
                a.onPress({row: true});      // that session, even from its own app
                this._close?.();
            });
        }
        const line = new St.BoxLayout({style_class: 'buoy-agents-line', x_expand: true});
        const bu = buildElement(ask ? ask.leading : a.leading, {leading: true, activity: a, stale: a.isStale && !ask});
        if (bu)
            line.add_child(bu);
        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
            style_class: 'buoy-agents-text',
        });
        text.add_child(label(name, 'buoy-agents-name'));
        const said = ask && ask !== a ? ask.compact?.subtitle : doing;
        if (said)
            text.add_child(label(said, 'buoy-agents-detail'));
        line.add_child(text);
        const time = a.kind === 'agent' ? buildElement(a.trailing) : null;
        if (time) {
            time.add_style_class_name('buoy-agents-time');
            line.add_child(time);
        }
        if (canDismiss(a, ask !== null))
            line.add_child(dismissButton(`Dismiss ${name}`, () => a.onAction?.(DISMISS)));
        button.set_child(line);
        box.add_child(button);
        // stale as on its pill: grey text, Bu `stale` at 40 % (kit dimStale); a prompt
        // waiting is never stale
        if (a.isStale && !ask)
            dimStale(line);
        if (ask)
            box.add_child(this._buttons(ask));
        return box;
    }

    // The prompt's answers, as in its expanded view; answering keeps the island open on
    // this tab (the prompt's row goes, the session stays)
    _buttons(ask) {
        const line = new St.BoxLayout({style_class: 'buoy-agents-buttons', x_align: Clutter.ActorAlign.END});
        for (const act of ask.actions ?? []) {
            const b = new St.Button({
                style_class: 'buoy-action', can_focus: true, label: act.label ?? act.id,
                accessible_name: act.label ?? act.id,
            });
            b.connect('clicked', () => ask.onAction?.(act.id));
            line.add_child(b);
        }
        return line;
    }
}

// the row's ×, as a notification's (its own button: the row's click stays the row's)
function dismissButton(name, onClick) {
    const x = new St.Button({
        style_class: 'buoy-agents-close', can_focus: true, accessible_name: name,
        child: new St.Icon({...iconProps('window-close-symbolic'), icon_size: 12}),
        y_align: Clutter.ActorAlign.CENTER,
    });
    x.connect('clicked', () => onClick());
    return x;
}

function label(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
