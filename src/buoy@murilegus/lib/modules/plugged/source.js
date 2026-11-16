import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/services/source.js';
import {defaultSink, mixer, readSink, sinkPorts, watchOutput} from '../../kit/services/audio.js';
import {MODES, diffMonitors, headphonesGone, modeOf, modesFor, monitorKey, outputChanged, outputOf} from './adapter.js';

// the mixer lists every output as it comes up: offers wait until it has (no timer, a time stamp)
const MIXER_SETTLE_US = 3 * GLib.USEC_PER_SEC;

const DISPLAY = 'display';
const AUDIO = 'audio';

/**
 * A display or headphones plugged in (FEATURES M4 "Headphones / display plugged", adapter.js),
 * signals only, no polling:
 *
 * - Displays: Mutter's monitor manager (`global.backend.get_monitor_manager()`), read again on
 *   `monitors-changed`. A display that comes or goes flashes; a change of layout only (Join /
 *   Mirror, the same displays) updates the flash still up. Virtual monitors (a screen share's)
 *   are not displays. Hot plug is not testable in the headless Shell: checked on real hardware.
 * - Sound: Shell's Gvc mixer (kit/services/audio.js), its default output and that output's port.
 *   The sound moving to or from headphones flashes, in place of the volume OSD GNOME shows then
 *   (the HUD asks kit/services/audio.js outputMoving()).
 *
 * - Headphones plugged in that the sound does not go to (the card kept its speaker profile, as
 *   WirePlumber does on SOF laptops): Gvc's `output-added` for that port (gvc-mixer-control.c,
 *   a port becoming available) flashes with Use, which moves the output there
 *   (`change_output`, as Quick Settings' list). Unplugged before it is used: the flash goes.
 * - A display's flash waits for you (adapter.js DISPLAY_WAIT): the screens go dark while Mutter
 *   sets the layout. Mutter's core idle monitor says when input comes again
 *   (`add_user_active_watch`, as ui/messageTray.js); from then on its 4 s run.
 *
 * Neither flashes on the first reading (Buoy turned on, the mixer coming up).
 */
export class PluggedSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._mm = global.backend.get_monitor_manager();
        this._idle = global.backend.get_core_idle_monitor();
        this._settleId = 0;         // the user-active watch while a display's flash waits for you
        this._displayEv = null;     // that flash's event, to show again once you are back
        this._settled = true;
        this._monitors = null;      // the displays last read: [{key, name, …}]
        this._shownDisplay = null;  // the display the flash is about (its key), while plugged in
        this._mm.connectObject('monitors-changed', () => this._syncDisplays(), this);
        this._syncDisplays();

        this._control = mixer();
        this._sink = null;
        this._out = null;           // outputOf() last flashed or first read
        this._readyAt = null;       // when the mixer came up (µs, monotonic)
        this._offerId = null;       // the output the Use flash offers, while it shows
        this._control.connectObject(
            'state-changed', () => this._syncSink(),
            'default-sink-changed', () => this._syncSink(),
            'output-added', (_c, id) => this._offer(id),
            'output-removed', (_c, id) => this._withdraw(id),
            this);
        watchOutput(() => this._moving());
        this._syncSink();
    }

    disable() {
        watchOutput(null);
        this._disarmSettle();
        this._mm?.disconnectObject(this);
        this._control?.disconnectObject(this);
        this._sink?.disconnectObject(this);
        this._mm = this._control = this._sink = null;
        for (const key of [DISPLAY, AUDIO])
            this._stack?.end(this._id(key));
        this._monitors = this._shownDisplay = this._out = this._displayEv = this._readyAt = this._offerId = null;
        this._idle = null;
        super.disable();
    }

    // --- displays ---------------------------------------------------------------------------

    _readMonitors() {
        return this._mm.get_monitors().filter(m => !m.is_virtual()).map(m => ({
            key: monitorKey({connector: m.get_connector(), vendor: m.get_vendor(), product: m.get_product(), serial: m.get_serial()}),
            name: m.get_display_name(),
            monitor: m,
        }));
    }

    _syncDisplays() {
        if (!this._stack)
            return;
        const cur = this._readMonitors();
        const {added, removed} = diffMonitors(this._monitors, cur);
        this._monitors = cur;
        if (added.length) {
            this._shownDisplay = added[0].key;
            this._showDisplay(this._plugged(added[0]));
        } else if (removed.length) {
            this._shownDisplay = null;
            this._showDisplay({what: 'display-out', name: removed[0].name});
        } else if (this._shownDisplay && this._stack.has(this._id(DISPLAY))) {
            // the same displays, another layout (a button, Super+P, Settings): the flash says so
            const m = cur.find(x => x.key === this._shownDisplay);
            if (m) {
                this._displayEv = this._plugged(m);
                this._show(DISPLAY, {...this._displayEv, settled: this._settled});
            }
        }
    }

    // a display came or went: the flash waits for the first input, then runs its 4 s
    _showDisplay(ev) {
        this._displayEv = ev;
        this._settled = false;
        this._disarmSettle();
        this._settleId = this._idle.add_user_active_watch(() => {
            this._settleId = 0;
            this._settled = true;
            if (this._displayEv && this._stack?.has(this._id(DISPLAY)))
                this._show(DISPLAY, {...this._displayEv, settled: true});
        });
        this._show(DISPLAY, {...ev, settled: false}, {fresh: true, alert: ev.what === 'display-in'});
    }

    _disarmSettle() {
        if (this._settleId)
            this._idle?.remove_watch(this._settleId);
        this._settleId = 0;
    }

    _plugged(m) {
        const mm = this._mm;
        const builtin = mm.has_builtin_panel === true;
        const logical = mm.get_logical_monitors();
        const active = this._monitors.filter(x => x.monitor.is_active()).length;
        return {
            what: 'display-in',
            name: m.name,
            size: sizeOf(m.monitor, logical),
            mode: modeOf({
                count: active, builtin, builtinOn: mm.get_is_builtin_display_on(),
                mirrored: logical.some(l => l.get_monitors().length > 1),
            }),
            modes: modesFor({canSwitch: mm.can_switch_config(), builtin}),
            setMode: id => this._mm?.switch_config(Meta.MonitorSwitchConfigType[/** @type {'ALL_LINEAR'|'ALL_MIRROR'|'EXTERNAL'} */ (MODES[id].config)]),
        };
    }

    // --- sound --------------------------------------------------------------------------------

    _syncSink() {
        const sink = defaultSink(this._control);
        if (sink && this._readyAt === null)
            this._readyAt = GLib.get_monotonic_time();
        if (sink !== this._sink) {
            this._sink?.disconnectObject(this);
            this._sink = sink;
            sink?.connectObject('notify::port', () => this._syncOutput(), this);
        }
        this._syncOutput();
    }

    _syncOutput() {
        const s = readSink(this._control, this._sink);
        if (!this._stack || !s)
            return;
        const cur = outputOf(s);
        const prev = this._out;
        const moved = outputChanged(prev, cur);
        this._out = cur;
        if (!moved)
            return;
        this._offerId = null;   // the output moved: the flash says where, in place of an offer
        // the headphones left because they were unplugged or went (not switched away from by
        // hand): said so, with the speakers' level (Ethan, 2026-11-16)
        if (prev.output === 'headphones' && cur.output !== 'headphones' &&
            headphonesGone(prev, sinkPorts(this._control, prev.sinkId))) {
            this._show(AUDIO, {what: 'audio-out', name: prev.name, device: prev.device, level: s.level, muted: s.muted}, {fresh: true});
            return;
        }
        this._show(AUDIO, {what: 'audio', output: cur.output, name: cur.name, level: s.level, muted: s.muted}, {fresh: true});
    }

    // an output became available (Gvc output-added): headphones the sound does not use yet
    _offer(id) {
        const c = this._control;
        if (!this._stack || !this._out || this._readyAt === null ||
            GLib.get_monotonic_time() - this._readyAt < MIXER_SETTLE_US)
            return;
        const dev = c.lookup_output_id(id);
        if (!dev || this._out.output === 'headphones')
            return;
        const stream = dev.get_stream_id() ? c.lookup_stream_id(dev.get_stream_id()) : null;
        const out = outputOf({id, formFactor: stream?.get_form_factor() || null, port: dev.get_port() || null, description: dev.get_description() || null});
        if (out.output !== 'headphones' || c.lookup_device_from_stream(this._sink)?.get_id() === id)
            return;
        this._offerId = id;
        this._show(AUDIO, {what: 'offer', name: out.name, current: this._out.name, use: () => this._control?.change_output(dev)}, {fresh: true, alert: true});
    }

    // the offered headphones unplugged before they were used: the offer goes
    _withdraw(id) {
        if (id !== this._offerId)
            return;
        this._offerId = null;
        this._stack?.end(this._id(AUDIO));
    }

    // the HUD asks, inside GNOME's OSD for this very change, before this source has heard of it
    _moving() {
        const s = readSink(this._control, defaultSink(this._control));
        return !!s && outputChanged(this._out, outputOf(s));
    }

    // --- pills ------------------------------------------------------------------------------------

    _id(key) {
        return `device:system:${key}`;
    }

    // one pill per key: a new flash replaces the last and starts its 3 s again; a layout
    // change updates the display's in place. `alert`: a pill with a choice opens its compact on
    // its own (design/compact, Ethan 2026-11-15: the buttons are there without a hover), held
    // 5 s of your presence (kit/model/stack.js ALERT_MS) — the screens dark after a plug count not
    _show(key, ev, {fresh = false, alert = false} = {}) {
        const a = this._registry?.build('device', 'system', {id: key, open: openPanel, ...ev});
        if (!a)
            return;
        if (alert && a.compact)
            a.alert = true;
        if (!fresh && this._stack.has(a.id) && this._stack.update(a.id, a))
            return;
        this._stack.surface(a);
    }
}

// The display's size in pixels: its logical monitor's (Main.layoutManager.monitors, by the
// logical monitor's number) times its scale; Mutter gives no mode or refresh rate to extensions
function sizeOf(monitor, logical) {
    const l = logical.find(x => x.get_monitors().includes(monitor));
    const geo = l ? Main.layoutManager.monitors[l.get_number()] : null;
    if (!geo)
        return null;
    // layout.js Monitor sets geometry_scale (@girs names it geometryScale)
    const own = /** @type {any} */ (geo).geometry_scale;
    const scale = own > 0 ? own : 1;
    return `${Math.round(geo.width * scale)} × ${Math.round(geo.height * scale)}`;
}

// Settings → Displays or Sound, as Shell opens its panels (Shell.AppSystem lookup_app)
function openPanel(desktopId) {
    const app = Shell.AppSystem.get_default().lookup_app(desktopId);
    if (!app)
        return;
    Main.overview.hide();
    app.activate();
}
