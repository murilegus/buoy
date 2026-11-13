import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Source} from '../../kit/services/source.js';

/**
 * What the microphone, the camera and the screen are doing, read from GNOME's own
 * indicators (FEATURES M4 "Privacy dot", INDICATORS "Privacy dot"):
 *   mic     Quick Settings' input slider (ui/status/volume.js InputStreamSlider
 *           _maybeShowInput: a source running and an app recording, the volume panels
 *           skipped), not muted — GNOME drops its privacy colour when muted (InputIndicator
 *           _updatePrivacyIndicator)
 *   cam     the camera icon, bound to Shell.CameraMonitor `cameras-in-use` (status/camera.js)
 *   screen  Shell's screencast (ui/screenshot.js `screencast-in-progress`) or any of
 *           Mutter's remote access handles (status/remoteAccess.js): recording ones are an
 *           app recording through the portal, the others a share
 * Each is told to the stack (setPrivacy → the dot); the screencast, an app's recording and
 * a share are also activities with their clock and Stop (adapter.js). No polling and no
 * timer: every read is on a signal; the clocks run in the renderer while shown.
 *
 * GNOME's own indicators for the same things (the three icons in Quick Settings, the
 * recording and sharing buttons in the bar) are hidden while `privacy-dot` is `pill`;
 * `system` keeps them and draws no dot, `both` both. Quick Settings builds its indicators
 * asynchronously (ui/panel.js QuickSettings _setupIndicators): until they are there, the
 * source waits for them on the indicator box.
 */
export class PrivacySource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._handles = new Map();      // MetaRemoteAccessHandle → {recording, since}
        this._shown = new Map();        // what ('shell' | 'portal' | 'sharing') → activity id
        this._since = {};               // what → when it started
        this._hidden = [];              // GNOME's indicators Buoy hides: [{actor, restore}]

        const controller = global.backend.get_remote_access_controller?.() ?? null;
        controller?.connectObject('new-handle', (_c, handle) => this._addHandle(handle), this);
        // handles from before Buoy: Mutter has no list of them (meta-remote-access-controller.c
        // emits new-handle only), but GNOME's own indicators kept theirs
        const {screenSharing} = Main.panel.statusArea;
        for (const handle of screenSharing?._handles ?? [])
            this._addHandle(handle);

        Main.screenshotUI.connectObject('notify::screencast-in-progress', () => this._screencast(), this);
        this._screencast({seeded: true});

        this._settings?.connectObject('changed::privacy-dot', () => this._syncHidden(), this);
        this._whenIndicators(() => this._watchIndicators());
    }

    disable() {
        global.backend.get_remote_access_controller?.()?.disconnectObject(this);
        Main.screenshotUI.disconnectObject(this);
        this._settings?.disconnectObject(this);
        this._qsBox?.disconnectObject(this);
        this._qsBox = null;
        for (const handle of this._handles.keys())
            handle.disconnectObject(this);
        this._handles.clear();
        this._input?.disconnectObject(this);
        this._camIcon?.disconnectObject(this);
        this._input = this._camIcon = this._volumeInput = this._camera = this._remoteAccess = null;
        this._restoreHidden();
        for (const id of this._shown.values())
            this._stack?.end(id);
        this._shown.clear();
        this._stack?.setPrivacy({});
        super.disable();
    }

    // --- GNOME's indicators ---------------------------------------------------------

    _whenIndicators(then) {
        const qs = Main.panel.statusArea.quickSettings;
        if (!qs)
            return;
        if (qs._volumeInput && qs._camera) {
            then();
            return;
        }
        this._qsBox = qs._indicators;
        this._qsBox?.connectObject('child-added', () => {
            if (!qs._volumeInput || !qs._camera)
                return;
            this._qsBox.disconnectObject(this);
            this._qsBox = null;
            then();
        }, this);
    }

    _watchIndicators() {
        const qs = Main.panel.statusArea.quickSettings;
        this._volumeInput = qs._volumeInput;
        this._camera = qs._camera;
        this._remoteAccess = qs._remoteAccess ?? null;
        this._input = this._volumeInput._input ?? null;
        this._camIcon = this._camera._indicator ?? null;
        this._input?.connectObject('notify::visible', () => this._sync(),
            'stream-updated', () => this._sync(), this);
        this._camIcon?.connectObject('notify::visible', () => this._sync(), this);
        // recording handles from before Buoy: GNOME's applet kept them
        for (const handle of this._remoteAccess?._handles ?? [])
            this._addHandle(handle);
        this._syncHidden();
        this._sync();
    }

    _mode() {
        const mode = this._settings?.get_string('privacy-dot') ?? 'pill';
        return ['pill', 'system', 'both'].includes(mode) ? mode : 'pill';
    }

    // GNOME's indicators hidden while the dot stands for them (`pill`). A Quick Settings
    // indicator shows itself whenever one of its icons does (quickSettings.js
    // SystemIndicator _syncIndicatorsVisible): its own copy keeps it hidden. The bar's
    // two buttons are hidden by their container, which only _addToPanelBox shows.
    _syncHidden() {
        this._restoreHidden();
        if (this._mode() === 'pill') {
            for (const ind of [this._remoteAccess, this._camera, this._volumeInput].filter(Boolean)) {
                ind._syncIndicatorsVisible = function () {
                    this.visible = false;
                };
                ind.visible = false;
                this._hidden.push({
                    actor: ind, restore: () => {
                        delete ind._syncIndicatorsVisible;
                        ind._syncIndicatorsVisible();
                    },
                });
            }
            const {screenRecording, screenSharing} = Main.panel.statusArea;
            for (const button of [screenRecording, screenSharing].filter(Boolean)) {
                const c = button.container;
                c.hide();
                this._hidden.push({actor: c, restore: () => c.show()});
            }
        }
        this._sync();
    }

    _restoreHidden() {
        for (const {restore} of this._hidden)
            restore();
        this._hidden = [];
    }

    // --- the screen -----------------------------------------------------------------

    _addHandle(handle) {
        if (this._handles.has(handle))
            return;
        // Shell's own screencast: its recorder's session starts while the screenshot UI
        // waits for it (ui/screenshot.js _startScreencast sets _screencastStarting around
        // the Screencast call), so a recording handle born then is Shell's
        const recording = handle.is_recording === true;
        const shell = recording && Main.screenshotUI._screencastStarting === true;
        this._handles.set(handle, {recording, shell});
        handle.connectObject('stopped', () => {
            handle.disconnectObject(this);
            this._handles.delete(handle);
            this._sync();
        }, this);
        this._sync();
    }

    _screencast({seeded = false} = {}) {
        const on = Main.screenshotUI.screencast_in_progress === true;
        if (on && !this._since.shell) {
            // started before Buoy: GNOME's button counted the seconds (remoteAccess.js
            // ScreenRecordingIndicator _secondsPassed)
            const passed = seeded ? Main.panel.statusArea.screenRecording?._secondsPassed : 0;
            this._since.shell = Date.now() - (Number.isFinite(passed) ? passed * 1000 : 0);
        }
        this._sync();
    }

    // What runs now: Shell's screencast; an app's recording (the recording handles not
    // Shell's — one seen before Buoy is not marked, so then one of them is taken for
    // Shell's, as remoteAccess.js RemoteAccessApplet _isRecording counts); a share (the
    // other handles, ScreenSharingIndicator)
    _screen() {
        const shell = Main.screenshotUI.screencast_in_progress === true;
        const handles = [...this._handles.values()];
        const marked = handles.some(h => h.shell);
        const apps = handles.filter(h => h.recording && !h.shell).length;
        return {
            shell,
            portal: apps > (shell && !marked ? 1 : 0),
            sharing: handles.some(h => !h.recording),
        };
    }

    _stop(what) {
        if (what === 'shell') {
            Main.screenshotUI.stopScreencast();
            return;
        }
        // as GNOME's sharing button (ScreenSharingIndicator _stopSharing): every share; an
        // app's recording: the recording handles not Shell's (Mutter gives no app name to
        // tell apps apart)
        for (const [handle, h] of this._handles) {
            if (what === 'portal' ? h.recording && !h.shell : !h.recording)
                handle.stop();
        }
    }

    // --- the stack ------------------------------------------------------------------

    _sync() {
        if (!this._stack)
            return;
        const screen = this._screen();
        for (const what of ['shell', 'portal', 'sharing']) {
            if (screen[what]) {
                this._since[what] ??= Date.now();
                this._show(what);
            } else {
                delete this._since[what];
                const id = this._shown.get(what);
                if (id)
                    this._stack.end(id);
                this._shown.delete(what);
            }
        }
        const mic = this._input?.visible === true && this._input.stream?.is_muted !== true;
        const cam = this._camIcon?.visible === true;
        const dot = this._mode() !== 'system';
        this._stack.setPrivacy(dot ? {mic, cam, screen: screen.shell || screen.portal || screen.sharing} : {});
    }

    _show(what) {
        const a = this._registry?.build('screen', 'system', {
            id: what, what, since: this._since[what], onAction: id => {
                if (id === 'stop')
                    this._stop(what);
            },
        });
        if (!a)
            return;
        const id = this._shown.get(what);
        if (id && this._stack.has(id))
            return;     // its content never changes: the clock runs in the renderer
        this._shown.set(what, this._stack.surface(a));
    }
}
