import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/services/source.js';
import {Phones, isGsconnectSource} from '../../kit/services/gsconnect.js';
import {callOf} from '../../kit/model/phone.js';

const KIND = 'call';

/**
 * A call on the phone (FEATURES M4 "Phone via GSConnect", part 3; design/device "Cuộc gọi và tab
 * Điện thoại", 2026-11-18, Ethan). GSConnect shows a ringing call and one going on as its own
 * notifications (src/service/plugins/telephony.js _notifyEvent) and withdraws them when they end;
 * their id says which ("<device>|ringing|<caller>", model/phone.js callOf). This source watches
 * GSConnect's notification source in Shell's tray — signals only — and makes each a `call`
 * activity; the notification module lets them pass without a pill of their own.
 *
 * - Ringing: an alert that stays till the phone stops ringing; Mute silences the phone through
 *   GSConnect's `muteCall` (the notification's own button would make Shell destroy it); × hides
 *   the card, the pill stays.
 * - Talking: a clock from when it was answered (seen here), till the call ends.
 * - The same id again (GSConnect re-sends it) replaces the notification (Shell destroys the old
 *   one, REPLACED): the activity stays.
 */
export class CallSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._calls = new Map();        // device|state|caller → {key, call, n, id, since, muted, hidden}
        this._phones = new Phones(() => this._redrawAll());
        const tray = Main.messageTray;
        tray.connectObject('source-added', (_t, src) => this._watch(src), this);
        tray.getSources().forEach(src => this._watch(src));
    }

    _watch(src) {
        if (!isGsconnectSource(src))
            return;
        src.connectObject('notification-added', (_s, n) => this._add(n), this);
        src.notifications.forEach(n => this._add(n));
    }

    _add(n) {
        const call = callOf(n.id);
        if (!call || !this._stack)
            return;
        const key = `${call.device}|${call.state}|${call.caller}`;
        let c = this._calls.get(key);
        if (!c) {
            c = {key, call, n: null, id: null, since: call.state === 'talking' ? Date.now() : null, muted: false, hidden: false};
            this._calls.set(key, c);
        }
        c.n?.disconnectObject(this);
        c.n = n;
        // after the current call: a replacement comes in it
        n.connectObject('destroy', () => Promise.resolve().then(() => {
            if (c.n === n)
                this._end(c);
        }), this);
        // answered: the ringing is over
        if (call.state === 'talking') {
            for (const o of [...this._calls.values()]) {
                if (o.call.state === 'ringing' && o.call.device === call.device && o.call.caller === call.caller)
                    this._end(o);
            }
        }
        this._show(c);
    }

    _show(c) {
        if (!this._stack || this._calls.get(c.key) !== c)
            return;
        const phone = this._phones?.list().find(p => p.id === c.call.device) ?? null;
        const gicon = c.n?.gicon ?? null;
        const a = this._registry?.build(KIND, 'phone', {
            id: c.key, caller: c.call.caller, state: c.call.state,
            // the caller's picture (a thumbnail's bytes); GSConnect's own handset is no photo
            photo: gicon && !(gicon instanceof Gio.ThemedIcon) ? gicon : null,
            phoneName: phone?.name ?? null, since: c.since, muted: c.muted, hidden: c.hidden,
            canMute: c.call.state === 'ringing' && !!this._phones?.canMute(c.call.device),
            mute: () => {
                if (this._phones?.muteCall(c.call.device)) {
                    c.muted = true;
                    this._show(c);
                }
            },
            hide: () => {
                c.hidden = true;
                this._show(c);
            },
        });
        if (!a)
            return;
        if (c.id && this._stack.has(c.id) && this._stack.update(c.id, a))
            return;
        c.id = this._stack.surface({...a, alert: c.call.state === 'ringing'});
    }

    _end(c) {
        if (this._calls?.get(c.key) !== c)
            return;
        this._calls.delete(c.key);
        c.n?.disconnectObject(this);
        if (c.id && this._stack?.has(c.id))
            this._stack.end(c.id);
    }

    _redrawAll() {
        for (const c of this._calls?.values() ?? [])
            this._show(c);
    }

    disable() {
        for (const c of [...this._calls?.values() ?? []])
            this._end(c);
        this._calls = null;
        Main.messageTray.disconnectObject(this);
        Main.messageTray.getSources().forEach(src => src.disconnectObject(this));
        this._phones?.destroy();
        this._phones = null;
        super.disable();
    }
}
