import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/services/source.js';
import {Phones, isGsconnectSource} from '../../kit/services/gsconnect.js';
import {callOf} from '../../kit/model/phone.js';

const KIND = 'call';

// The ring (design/device "Cuộc gọi và tab Điện thoại", 2026-11-18, Ethan): the sound theme's
// incoming call (freedesktop `phone-incoming-call`, 1.5 s) every 3 s, at most a minute — the
// phone stops ringing before that, and GSConnect withdraws the call
const RING_SOUND = 'phone-incoming-call';
const RING_EVERY_MS = 3000;
const RING_MAX_MS = 60000;

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
 * - The ring: GNOME plays nothing for it (a GTK notification has no sound: ui/messageTray.js
 *   playSound), so while the phone rings the computer rings too — Mutter's sound player
 *   (meta-sound-player.c: silent with system sounds off), every 3 s, till it is answered, ends,
 *   or Mute or × runs; not with Do Not Disturb, GSConnect's sound alerts off in GNOME's
 *   notification settings (its policy's enableSound), or `phone-ring` off.
 * - The same id again (GSConnect re-sends it) replaces the notification (Shell destroys the old
 *   one, REPLACED): the activity stays.
 */
export class CallSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._calls = new Map();        // device|state|caller → {key, call, n, id, since, muted, hidden}
        this._phones = new Phones(() => this._redrawAll());
        this._notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
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
            c = {
                key, call, n: null, id: null, since: call.state === 'talking' ? Date.now() : null, muted: false, hidden: false,
                ringing: 0, ringCancel: null,
            };
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
                this._stopRing(c);
                if (this._phones?.muteCall(c.call.device)) {
                    c.muted = true;
                    this._show(c);
                }
            },
            hide: () => {
                this._stopRing(c);
                c.hidden = true;
                this._show(c);
            },
        });
        if (!a)
            return;
        if (c.id && this._stack.has(c.id) && this._stack.update(c.id, a))
            return;
        c.id = this._stack.surface({...a, alert: c.call.state === 'ringing'});
        if (c.call.state === 'ringing' && !c.muted && !c.hidden)
            this._ring(c);
    }

    // the computer rings with the phone (see above): now, then every 3 s
    _ring(c) {
        if (c.ringing || !this._mayRing(c))
            return;
        const until = Date.now() + RING_MAX_MS;
        const once = () => {
            c.ringCancel?.cancel();
            c.ringCancel = new Gio.Cancellable();
            global.display.get_sound_player().play_from_theme(RING_SOUND, 'Incoming call', c.ringCancel);
        };
        once();
        c.ringing = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RING_EVERY_MS, () => {
            if (Date.now() >= until || !this._mayRing(c)) {
                c.ringing = 0;
                this._stopRing(c);
                return GLib.SOURCE_REMOVE;
            }
            once();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _mayRing(c) {
        return this._calls?.get(c.key) === c && c.call.state === 'ringing' && !c.muted && !c.hidden &&
            this._settings?.get_boolean('phone-ring') === true &&
            this._notifications?.get_boolean('show-banners') === true &&
            c.n?.source?.policy?.enableSound !== false;
    }

    _stopRing(c) {
        if (c.ringing)
            GLib.source_remove(c.ringing);
        c.ringing = 0;
        c.ringCancel?.cancel();
        c.ringCancel = null;
    }

    _end(c) {
        if (this._calls?.get(c.key) !== c)
            return;
        this._calls.delete(c.key);
        this._stopRing(c);
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
        this._notifications = null;
        super.disable();
    }
}
