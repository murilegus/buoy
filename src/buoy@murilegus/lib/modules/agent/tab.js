import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {EmptyState, buildElement} from '../../kit/present.js';

/**
 * The Claude Code tab (CODING-AGENTS.md §2, Ethan 2026-11-07): every session the island
 * shows, one row each — Bu in its pose, the session's name, what it is doing, how long —
 * and a permission prompt's buttons on its session's row. A click on a row brings the
 * session's terminal up (the activity's onPress) and closes the island. Asks of other
 * callers (D-Bus `Ask()`, kind `ask` is this module's) get a row of their own.
 *
 * It reads the kit's activities (`update`, kit/home.js): kind `agent` and kind `ask`.
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
            this.actor.add_child(new EmptyState('No Claude Code sessions'));
            return;
        }
        for (const q of asks.filter(x => !own.has(x)))
            this.actor.add_child(this._row(q, q, {name: q.text, doing: null}));
        for (const s of sessions) {
            this.actor.add_child(this._row(s, askOf(s), {
                name: s.compact?.text ?? s.text, doing: s.compact?.subtitle ?? null,
            }));
        }
    }

    // Bu · name over what it does · the time; under them a prompt's buttons
    _row(a, ask, {name, doing}) {
        const box = new St.BoxLayout({
            style_class: 'buoy-agents-entry', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
            ...a.isStale ? {opacity: 140} : {},
        });
        const button = new St.Button({
            style_class: 'buoy-agents-row', can_focus: true, x_expand: true,
            accessible_name: [name, doing].filter(Boolean).join(', '),
            reactive: typeof a.onPress === 'function',
        });
        if (typeof a.onPress === 'function') {
            button.connect('clicked', () => {
                if (a.onPress() !== false)
                    this._close?.();
            });
        }
        const line = new St.BoxLayout({style_class: 'buoy-agents-line', x_expand: true});
        const bu = buildElement(ask ? ask.leading : a.leading, {leading: true, activity: a});
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
        button.set_child(line);
        box.add_child(button);
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

function label(text, styleClass) {
    const l = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}
