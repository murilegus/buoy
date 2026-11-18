import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {EmptyState, iconLabel, iconProps, makeElement} from '../../kit/ui/present/elements.js';
import {batteryLevel, elapsedLabel, label as textLabel} from '../../kit/ui/present/parts.js';
import {choiceRow, listBox, listHead} from '../../kit/ui/present/lists.js';
import {CELL_GAP, CELL_H, TITLE_H, planDevices, rowsFit} from '../../kit/model/devices.js';
import {batteryOf} from '../../kit/model/bluetooth.js';
import {GSCONNECT_PAGE, GSCONNECT_UUID, PHONE_GROUPS, phoneGroups, phoneSetup, shortName} from '../../kit/model/phone.js';
import {Phones, gsconnectExtension, isGsconnectSource, openGsconnect, phoneNotes} from '../../kit/services/gsconnect.js';
import {FADES, LIST_SHIFT} from '../../kit/model/motion.js';
import {slideIn} from '../../kit/ui/spring.js';
import {GREEN} from './adapter.js';

const BUTTON = 32;      // a round button (compact metrics' at the em)
const HEAD_H = 40;      // the phone's line over the columns: 32 and 8 under it

/**
 * The Phone tab (design/device "Cuộc gọi và tab Điện thoại", 2026-11-18, Ethan; FEATURES M4 "Phone
 * via GSConnect", part 3): in ⋯ as Timer, on the strip while a call is there. Its head: the phone,
 * its battery, Find My Phone. Under it three columns as the Device tab's — Calls (the one going on
 * or ringing, missed ones), Messages (an SMS, anything that can be answered), Other — read from the
 * phone's notifications in GNOME's list (kit/services/gsconnect.js phoneNotes), newest first;
 * "+N" past what a column holds. A cell's click is the notification's (GSConnect opens what it
 * opens); a message that can be answered has Reply, which opens its page: the message, an entry
 * and Send. Nothing yet: Bu and where setting the phone up stands, with what helps (as prefs'
 * Phone row: model/phone.js phoneSetup), or "No calls or messages".
 *
 * Signals only, while the tab lives: GNOME's list (its sources' notifications), GSConnect's
 * service (kit/services/gsconnect.js Phones), Shell's extension state.
 */
export class PhoneTab {
    /**
     * @param {object} [opts]
     * @param {function():void} [opts.close]  close the island
     * @param {number} [opts.height]  the body's room under the strip
     */
    constructor({close = null, height = 212} = {}) {
        this._close = close;
        this._rows = rowsFit(height - HEAD_H);
        this._page = null;          // null | {kind: 'group', id} | {kind: 'reply', id}
        this._sent = new Map();     // a reply page's id → 'sent' | 'failed', and what went
        this._since = new Map();    // a caller → when the call was answered (its pill's clock)
        this.actor = new St.BoxLayout({style_class: 'buoy-phone', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const redraw = () => this._render();
        this._phones = new Phones(redraw);
        const tray = Main.messageTray;
        tray.connectObject('source-added', (_t, src) => this._watch(src), 'source-removed', redraw, this);
        tray.getSources().forEach(src => this._watch(src));
        Main.extensionManager.connectObject('extension-state-changed', (_m, ext) => {
            if (ext?.uuid === GSCONNECT_UUID)
                redraw();
        }, this);
        this._render();
    }

    /**
     * The calls on the island (a kind tab's update, while a call puts this tab on the strip): a
     * call going on runs its pill's clock in its cell too.
     *
     * @param {object[]} activities  this kind's (`call`)
     */
    update(activities) {
        const since = new Map((activities ?? [])
            .filter(a => a.attributes?.state === 'talking' && Number.isFinite(a.trailing?.elapsed))
            .map(a => [a.attributes.caller, a.trailing.elapsed]));
        if (JSON.stringify([...since]) === JSON.stringify([...this._since]))
            return;
        this._since = since;
        this._render();
    }

    _watch(src) {
        if (!isGsconnectSource(src))
            return;
        const redraw = () => this._render();
        src.connectObject('notification-added', redraw, 'notification-removed', redraw, this);
        this._render();
    }

    // --- drawing ----------------------------------------------------------------------------------

    _render(slide = 0) {
        if (!this.actor)
            return;
        const phones = this._phones?.list() ?? [];
        const setup = phoneSetup({...gsconnectExtension(), paired: phones.filter(p => p.paired)});
        const notes = phoneNotes();
        this._notes = new Map(notes.map(x => [x.id, x]));
        const columns = planDevices(phoneGroups(notes.map(x => x.call ? {...x, since: this._since.get(x.call.caller) ?? null} : x)), this._rows, PHONE_GROUPS);
        const page = this._page ? this._pageActor(this._page, columns) : null;
        if (!page)
            this._page = null;
        this.actor.destroy_all_children();
        let body;
        if (page) {
            body = page;
        } else if (!columns.length && setup.status !== 'ready') {
            body = new EmptyState(setup.text, {pose: 'idle', below: this._helpButton(setup)});
        } else {
            body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_expand: true});
            body.add_child(this._head(phones.find(p => p.connected && p.paired) ?? null));
            body.add_child(columns.length ? this._columns(columns) : new EmptyState('No calls or messages', {pose: 'idle'}));
        }
        this.actor.add_child(body);
        if (slide)
            slideIn(body, slide, 'move', FADES.in.ms);
    }

    // the phone, its battery, Find My Phone (it rings, even silenced)
    _head(phone) {
        const head = new St.BoxLayout({style_class: 'buoy-phone-head', x_expand: true, height: BUTTON});
        head.add_child(new St.Icon({...iconProps('phone-symbolic'), icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
        head.add_child(textLabel(phone?.name ?? 'Phone', 'buoy-phone-name'));
        const b = phone?.battery ? batteryOf({percentage: phone.battery.percentage}) : null;
        if (b)
            head.add_child(batteryLevel({value: b.value, ...b.label ? {label: b.label} : {}}));
        head.add_child(new St.Widget({x_expand: true}));
        if (phone) {
            const find = new St.Button({
                style_class: 'buoy-phone-find', can_focus: true, accessible_name: 'Find My Phone',
                child: iconLabel('find-location-symbolic', 'Find My Phone'), y_align: Clutter.ActorAlign.CENTER,
            });
            find.connect('clicked', () => this._phones?.ring(phone.id));
            head.add_child(find);
        }
        return head;
    }

    _columns(columns) {
        const row = new St.BoxLayout({style_class: 'buoy-phone-columns', x_expand: true});
        for (const col of columns) {
            const box = new St.BoxLayout({style_class: 'buoy-phone-column', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            box.set_style('min-width: 0;');
            const title = new St.BoxLayout({style_class: 'buoy-phone-title', height: TITLE_H});
            title.add_child(textLabel(col.title.toUpperCase(), 'buoy-phone-title-text'));
            title.add_child(textLabel(String(col.count), 'buoy-phone-title-count'));
            box.add_child(title);
            const cells = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            cells.set_style(`spacing: ${CELL_GAP}px;`);
            for (const c of col.cells)
                cells.add_child(this._cell(c));
            if (col.more) {
                cells.add_child(this._cell({id: `more:${col.id}`, name: `+${col.more.count}`, detail: col.more.names},
                    () => this._open({kind: 'group', id: col.id})));
            }
            box.add_child(cells);
            row.add_child(box);
        }
        return row;
    }

    // a cell 58 (the Device tab's): who or what on its top line with its picture or icon, what
    // under it; a call going on runs its clock in green; one that can be answered has Reply
    _cell(c, onClick = () => this._press(c)) {
        const top = new St.BoxLayout({style_class: 'buoy-phone-cell-top', x_expand: true});
        const lead = this._lead(c);
        if (lead)
            top.add_child(lead);
        top.add_child(textLabel(c.name, 'buoy-phone-cell-name', true));
        if (c.reply) {
            const reply = new St.Button({
                style_class: 'buoy-round buoy-phone-reply', can_focus: true, accessible_name: `Reply to ${c.name}`,
                child: new St.Icon({...iconProps('mail-reply-sender-symbolic'), icon_size: 16}), width: 24, height: 24,
            });
            reply.connect('clicked', () => this._open({kind: 'reply', id: c.id}));
            top.add_child(reply);
        }
        const body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        body.add_child(top);
        if (c.call === 'talking' && Number.isFinite(c.since)) {
            const clock = elapsedLabel(c.since, 'buoy-phone-cell-detail', null);
            clock.set_style(`color: ${GREEN};`);
            body.add_child(clock);
        } else {
            body.add_child(textLabel(c.detail ?? '', 'buoy-phone-cell-detail', true));
        }
        const b = new St.Button({
            style_class: 'buoy-phone-cell', child: body, x_expand: true, can_focus: true, height: CELL_H,
            accessible_name: `${c.name}, ${c.detail ?? ''}`, x_align: Clutter.ActorAlign.FILL,
        });
        b.connect('clicked', onClick);
        return b;
    }

    // a call's green handset, a missed one's, else the notification's own picture (a sender's
    // photo, round) or icon
    _lead(c) {
        if (c.call)
            return makeElement({type: 'icon', icon: 'call-start-symbolic', color: GREEN}, 'minimal');
        const note = this._notes?.get(c.id);
        if (note?.app === 'Phone')
            return makeElement({type: 'icon', icon: 'call-missed-symbolic'}, 'minimal');
        const g = note?.gicon;
        if (!g)
            return null;
        if (g instanceof Gio.ThemedIcon)
            return makeElement({type: 'icon', gicon: g}, 'minimal');
        return makeElement({type: 'art', gicon: g, round: true}, 'minimal', null, {art: 16});
    }

    // --- a click ---------------------------------------------------------------------------------

    // the notification's own click (GSConnect opens what it opens: its messaging window for an
    // SMS, its reply dialog); a call going on has nothing to open
    _press(c) {
        if (c.call)
            return;
        const n = this._notes?.get(c.id)?.n;
        if (!n)
            return;
        n.activate();
        this._close?.();
    }

    _open(page) {
        this._page = page;
        this._render(LIST_SHIFT);
    }

    /** ‹ or Esc (kit/ui/home.js back): the columns again; false when they show already. */
    back() {
        if (!this._page)
            return false;
        this._page = null;
        this._render(-LIST_SHIFT);
        return true;
    }

    _pageActor(page, columns) {
        if (page.kind === 'group') {
            const col = columns.find(c => c.id === page.id);
            if (!col)
                return null;
            const box = listBox(listHead(`${col.title} · ${col.count}`, {back: () => this.back(), button: BUTTON}));
            const rows = new St.BoxLayout({style_class: 'buoy-home-choices', orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            for (const c of [...col.cells, ...col.more?.cells ?? []])
                rows.add_child(choiceRow({icon: 'phone-symbolic', name: c.name, detail: c.detail, plain: true}, () => this._press(c)));
            const scroll = new St.ScrollView({x_expand: true, y_expand: true, child: rows});
            box.add_child(scroll);
            return box;
        }
        if (page.kind === 'reply')
            return this._replyPage(page.id);
        return null;
    }

    // a message answered from the tab: who and what, then an entry and Send, as the card's
    // (design/compact "Trả lời ngay trong card"); "Sent: …" once GSConnect has it. Gone: the columns
    _replyPage(id) {
        const note = this._notes?.get(id);
        if (!note?.reply)
            return null;
        const box = listBox(listHead(note.title || note.app, {back: () => this.back(), button: BUTTON}));
        const message = new St.Label({text: [note.app, note.body].filter(Boolean).join(' · '), style_class: 'buoy-phone-message', x_expand: true});
        message.clutter_text.line_wrap = true;
        message.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        message.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(message);
        const done = this._sent.get(id);
        const row = new St.BoxLayout({style_class: 'buoy-card-reply buoy-phone-reply-row', x_expand: true});
        if (done?.state === 'sent') {
            row.add_child(new St.Icon({...iconProps('object-select-symbolic'), icon_size: 16, style_class: 'buoy-card-reply-note'}));
            row.add_child(textLabel(`Sent: ${done.text}`, 'buoy-card-reply-note', true));
            box.add_child(row);
            return box;
        }
        const entry = new St.Entry({
            style_class: 'buoy-reply-entry', text: done?.text ?? '', hint_text: `Reply to ${shortName(note.title) || note.app}…`,
            can_focus: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        entry.set_style(`height: ${BUTTON}px; border-radius: ${BUTTON / 2}px;`);
        const send = new St.Button({
            style_class: 'buoy-round buoy-round-main', can_focus: true, accessible_name: 'Send',
            width: BUTTON, height: BUTTON, child: new St.Icon({...iconProps('mail-send-symbolic'), icon_size: 16}),
        });
        const go = () => {
            const text = entry.get_text().trim();
            if (!text)
                return;
            const ok = this._phones?.reply(note.reply.device, note.reply.uuid, text) === true;
            this._sent.set(id, {state: ok ? 'sent' : 'failed', text});
            if (ok)
                note.n.acknowledged = true;
            this._render();
        };
        entry.clutter_text.connect('activate', go);
        send.connect('clicked', go);
        row.add_child(entry);
        row.add_child(send);
        box.add_child(row);
        if (done?.state === 'failed')
            box.add_child(textLabel('Couldn\'t send', 'buoy-card-reply-note'));
        // the keyboard to the entry once it is on the stage
        entry.connect('notify::mapped', () => {
            if (entry.mapped)
                entry.clutter_text.grab_key_focus();
        });
        return box;
    }

    // what helps where setting the phone up stands (as prefs' Phone row): GSConnect's page on
    // extensions.gnome.org, turn it on, its settings; the island goes
    _helpButton(setup) {
        if (!setup.button)
            return null;
        const button = new St.Button({
            style_class: 'buoy-phone-help', can_focus: true, accessible_name: setup.button,
            ...setup.status === 'off' ? {label: setup.button} : {child: iconLabel('external-link-symbolic', setup.button)},
            x_align: Clutter.ActorAlign.CENTER,
        });
        button.connect('clicked', () => {
            if (setup.status === 'missing') {
                try {
                    Gio.AppInfo.launch_default_for_uri(GSCONNECT_PAGE, global.create_app_launch_context(0, -1));
                } catch (e) {
                    console.debug(`Buoy: GSConnect page: ${e.message}`);
                }
                this._close?.();
            } else if (setup.status === 'off') {
                Main.extensionManager.enableExtension(GSCONNECT_UUID);
            } else {
                openGsconnect();
                this._close?.();
            }
        });
        return button;
    }

    destroy() {
        Main.messageTray.disconnectObject(this);
        Main.messageTray.getSources().forEach(src => src.disconnectObject(this));
        Main.extensionManager.disconnectObject(this);
        this._phones?.destroy();
        this._phones = null;
        this._notes = null;
        this.actor?.destroy();
        this.actor = null;
    }
}
