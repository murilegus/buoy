import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {Source} from '../../kit/services/source.js';
import {ADD, AGAIN, DISMISS, NEXT, PAUSE, RESTART, RESUME, STOP} from './adapter.js';
import {
    addMinute, deserialize, nextEnd, ordered, pauseTimer, pomodoroAgain, pomodoroNext, pomodoroOf, pomodoroStart,
    presetsFromClocks, presetsToClocks, resumeTimer, serialize, split, startTimer, titleOf,
} from './model.js';
import {store} from './store.js';

const KIND = 'timer';
const CLOCKS_SCHEMA = 'org.gnome.clocks';
const CLOCKS_APP = 'org.gnome.clocks';
// Clocks' own id for its "Time is up!" (gnome-clocks timer-face.vala ring)
const CLOCKS_UP = 'timer-is-up';
// GNOME's session inhibitor, suspend only (gnome-session's GsmInhibitorFlag SUSPEND = 4)
const SM = /** @type {[string, string, string]} */ (['org.gnome.SessionManager', '/org/gnome/SessionManager', 'org.gnome.SessionManager']);
const INHIBIT_SUSPEND = 4;
const POMODORO_KEYS = ['timer-pomodoro-work', 'timer-pomodoro-break', 'timer-pomodoro-long', 'timer-pomodoro-rounds'];

let serial = 0;
const newId = () => `t${Date.now().toString(36)}${(++serial).toString(36)}`;

/**
 * Timers (FEATURES M4 "Timer"; design/compact "Hẹn giờ", 2026-11-22, Ethan).
 *
 * - Ends, not ticks: one timeout to the soonest end (model.js nextEnd); the pill counts down by
 *   itself while shown (kit `{until}`, `{ring}`), nothing runs while it is not.
 * - Running and paused timers are one pill: the soonest, "+N" for the others; × hides it till
 *   the timers change. An ended one is a card of its own that waits for you; its sound is the
 *   theme's "complete" (as Clocks' own bell), none in Do Not Disturb.
 * - Kept in store.js over disable / enable (a lock) and in `timer-state` over a restart: one that
 *   ended while Buoy was off shows its card when it is back.
 * - GNOME Clocks: its saved timers (`org.gnome.clocks timers`) are the tab's, both ways. Its
 *   running ones live in its process alone (no D-Bus), so only its "Time is up!" is taken, as
 *   it is added: read and destroyed, an ended card in its place (calendar's reminders the same).
 * - Keep awake (`timer-keep-awake`): while one runs, gnome-session is asked not to suspend
 *   (Inhibit, suspend only: the screen still blanks and locks).
 */
export class TimerSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._timer = 0;
        this._ids = new Map();          // activity key → stack id
        this._hidden = false;           // the running pill dismissed till the timers change
        this._cookie = 0;
        this._inhibiting = false;
        this._drops = new Set();
        this._dropId = 0;
        if (!store.loaded) {
            store.timers = deserialize(settings?.get_string('timer-state'));
            store.loaded = true;
        }
        store.last = settings?.get_int('timer-last') ?? store.last;
        this._readPomodoro();
        settings?.connectObject(
            'changed::timer-keep-awake', () => this._keepAwake(),
            ...POMODORO_KEYS.flatMap(k => [`changed::${k}`, () => this._readPomodoro()]), this);
        // GNOME Clocks' saved timers, when it is installed
        const schema = Gio.SettingsSchemaSource.get_default()?.lookup(CLOCKS_SCHEMA, true) ?? null;
        this._clocks = schema?.has_key('timers') ? new Gio.Settings({settings_schema: schema}) : null;
        store.clocks = !!this._clocks;
        this._clocks?.connectObject('changed::timers', () => this._readPresets(), this);
        this._readPresets();
        // Clocks' "Time is up!"
        const tray = Main.messageTray;
        tray.connectObject('source-added', (_t, src) => this._watch(src), this);
        tray.getSources().forEach(src => this._watch(src));
        store.actions = {
            start: what => this._start(what), startPomodoro: () => this._start(pomodoroStart(store.pomodoro)),
            pause: id => this._map(id, t => pauseTimer(t, Date.now())),
            resume: id => this._map(id, t => resumeTimer(t, Date.now())),
            add: id => this._map(id, t => addMinute(t, Date.now())),
            stop: id => this._stop(id),
            savePreset: p => this._writePresets([...store.presets, p]),
            editPreset: (i, p) => this._writePresets(store.presets.map((x, j) => j === i ? p : x)),
            deletePreset: i => this._writePresets(store.presets.filter((_, j) => j !== i)),
        };
        this._sync(false);
    }

    _readPomodoro() {
        const s = this._settings;
        store.pomodoro = pomodoroOf(s ? {
            work: s.get_int('timer-pomodoro-work'), break: s.get_int('timer-pomodoro-break'),
            long: s.get_int('timer-pomodoro-long'), rounds: s.get_int('timer-pomodoro-rounds'),
        } : null);
        store.changed();
    }

    _readPresets() {
        store.presets = this._clocks ? presetsFromClocks(this._clocks.get_value('timers').recursiveUnpack()) : [];
        store.changed();
    }

    _writePresets(presets) {
        if (!this._clocks)
            return;
        const v = presetsToClocks(presets).map(p => {
            const d = {duration: new GLib.Variant('i', p.duration)};
            if (p.name)
                d.name = new GLib.Variant('s', p.name);
            return d;
        });
        this._clocks.set_value('timers', new GLib.Variant('aa{sv}', v));
    }

    _watch(src) {
        const policy = src.policy;
        if (!(policy instanceof MessageTray.NotificationApplicationPolicy) || policy.id !== CLOCKS_APP)
            return;
        src.connectObject('notification-added', (_s, n) => {
            if (n.id !== CLOCKS_UP)
                return;
            // read now: no banner; destroyed once addNotification is done (calendar/source.js)
            n.acknowledged = true;
            this._drops.add(n);
            this._dropId ||= GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._dropId = 0;
                for (const x of this._drops ?? [])
                    x.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
                this._drops?.clear();
                return GLib.SOURCE_REMOVE;
            });
            store.ended = [...store.ended, {id: newId(), name: '', seconds: 0, at: Date.now(), pomodoro: null, clocks: true}];
            this._sync(true, false);
        }, this);
    }

    _start(what) {
        const t = startTimer(what, newId(), Date.now());
        store.timers = [...store.timers, t];
        store.selected = t.id;
        if (!t.pomodoro) {
            store.last = t.seconds;
            this._settings?.set_int('timer-last', t.seconds);
        }
        this._hidden = false;
        this._sync(true);
    }

    _map(id, fn) {
        store.timers = store.timers.map(t => t.id === id ? fn(t) : t);
        this._sync(true);
    }

    _stop(id) {
        store.timers = store.timers.filter(t => t.id !== id);
        if (store.selected === id)
            store.selected = null;
        this._sync(true);
    }

    // timers that ended move to their cards; the pill, the timeout, the inhibitor, `timer-state`
    _sync(save = true, sound = true) {
        if (!this._stack)
            return;
        const now = Date.now();
        const {done, left} = split(store.timers, now);
        if (done.length) {
            store.timers = left;
            store.ended = [...store.ended, ...done.map(t => ({id: t.id, name: t.name, seconds: t.seconds, at: t.end, pomodoro: t.pomodoro, clocks: false}))];
            if (sound)
                this._ring();
            save = true;
        }
        if (save)
            this._settings?.set_string('timer-state', serialize(store.timers));
        this._showRunning();
        this._showEnded(done.map(t => t.id));
        this._schedule();
        this._keepAwake();
        store.changed();
    }

    _schedule() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        const at = nextEnd(store.timers);
        if (at === null)
            return;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1, Math.min(at - Date.now(), 2 ** 31 - 1)), () => {
            this._timer = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _showRunning() {
        const list = ordered(store.timers, Date.now());
        const key = 'running';
        if (!list.length || this._hidden) {
            this._end(key);
            if (!list.length)
                this._hidden = false;
            return;
        }
        const t = list[0];
        const a = this._registry?.build(KIND, key, {
            kind: 'running', title: titleOf(t), seconds: t.seconds, end: t.end, left: t.left,
            paused: t.state === 'paused', more: list.length - 1,
            act: id => {
                if (id === PAUSE)
                    store.actions?.pause(t.id);
                else if (id === RESUME)
                    store.actions?.resume(t.id);
                else if (id === ADD)
                    store.actions?.add(t.id);
                else if (id === STOP)
                    store.actions?.stop(t.id);
                else if (id === DISMISS)
                    this._dismiss();
            },
        });
        this._put(key, a, false);
    }

    _dismiss() {
        this._hidden = true;
        this._end('running');
    }

    // one card per ended timer; `fresh`: those that ended now come as alerts
    _showEnded(fresh) {
        const keys = new Set(store.ended.map(e => `ended:${e.id}`));
        for (const key of [...this._ids.keys()]) {
            if (key.startsWith('ended:') && !keys.has(key))
                this._end(key);
        }
        for (const e of store.ended) {
            const key = `ended:${e.id}`;
            const next = pomodoroNext(e.pomodoro, store.pomodoro);
            const a = this._registry?.build(KIND, key, {
                kind: 'ended', name: e.name, seconds: e.seconds, at: e.at, pomodoro: e.pomodoro, clocks: e.clocks,
                next: next ? {title: titleOf(next), seconds: next.seconds} : null,
                act: id => this._answer(e, id),
            });
            this._put(key, a, fresh.includes(e.id) || (e.clocks && !this._ids.has(key)));
        }
    }

    _answer(e, id) {
        store.ended = store.ended.filter(x => x !== e);
        if (id === RESTART)
            this._start({seconds: e.seconds, name: e.name});
        else if (id === NEXT && e.pomodoro)
            this._start(pomodoroNext(e.pomodoro, store.pomodoro));
        else if (id === AGAIN && e.pomodoro)
            this._start(pomodoroAgain(e.pomodoro, store.pomodoro));
        else
            this._sync(false);
        // DONE, STOP, ×: the card goes
    }

    _put(key, a, alert) {
        if (!a)
            return;
        const id = this._ids.get(key);
        if (id && this._stack.has(id) && this._stack.update(id, a, {alert}))
            return;
        this._ids.set(key, this._stack.surface({...a, alert}));
    }

    _end(key) {
        const id = this._ids.get(key);
        if (id && this._stack?.has(id))
            this._stack.end(id);
        this._ids.delete(key);
    }

    // the theme's "complete", as Clocks' bell (gnome-clocks timer-face.vala); none in Do Not Disturb
    _ring() {
        try {
            const banners = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'}).get_boolean('show-banners');
            if (banners)
                global.display.get_sound_player().play_from_theme('complete', 'Timer', null);
        } catch (e) {
            console.warn(`Buoy: timer sound: ${e.message}`);
        }
    }

    // gnome-session's inhibitor while a timer runs (`timer-keep-awake`): suspend only
    _keepAwake() {
        const want = this._settings?.get_boolean('timer-keep-awake') !== false && store.timers.some(t => t.state === 'running');
        if (want && !this._cookie && !this._inhibiting) {
            this._inhibiting = true;
            Gio.DBus.session.call(...SM, 'Inhibit', new GLib.Variant('(susu)', ['buoy', 0, 'A timer is running', INHIBIT_SUSPEND]),
                new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, -1, null, (c, res) => {
                    this._inhibiting = false;
                    try {
                        [this._cookie] = /** @type {[number]} */ (c.call_finish(res).deepUnpack());
                    } catch (e) {
                        // once: no gnome-session (another desktop) says so on every start otherwise
                        if (!this._warned)
                            console.warn(`Buoy: timer keep awake: ${e.message}`);
                        this._warned = true;
                        return;
                    }
                    // the timers or the switch changed meanwhile, or Buoy went off
                    if (!this._stack || !this._wantAwake())
                        this._release();
                });
        } else if (!want && this._cookie) {
            this._release();
        }
    }

    _wantAwake() {
        return this._settings?.get_boolean('timer-keep-awake') !== false && store.timers.some(t => t.state === 'running');
    }

    _release() {
        const cookie = this._cookie;
        this._cookie = 0;
        if (cookie) {
            Gio.DBus.session.call(...SM, 'Uninhibit', new GLib.Variant('(u)', [cookie]), null,
                Gio.DBusCallFlags.NONE, -1, null, (c, res) => {
                    try {
                        c.call_finish(res);
                    } catch {}
                });
        }
    }

    disable() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        if (this._dropId)
            GLib.source_remove(this._dropId);
        this._dropId = 0;
        this._drops = null;
        Main.messageTray.disconnectObject(this);
        for (const src of Main.messageTray.getSources())
            src.disconnectObject(this);
        this._settings?.disconnectObject(this);
        this._clocks?.disconnectObject(this);
        this._clocks = null;
        this._release();
        for (const key of [...this._ids.keys()])
            this._end(key);
        store.actions = null;
        super.disable();
    }
}
