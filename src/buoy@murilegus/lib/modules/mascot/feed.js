import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// No keyboard, mouse, touchpad, touch or tablet event for this long: Bu sleeps
// (MASCOT.md § Eyes)
const IDLE_MS = 60 * 1000;

/**
 * What Bu's eyes need besides the time (MASCOT.md § Eyes), as the plan's `ctx.data`:
 *   idleInput   60 s without input: the core idle monitor (as ui/messageTray.js and
 *               ui/screenShield.js), an UNINHIBITABLE watch, since a default one never fires
 *               while an app inhibits idle (mutter meta-idle-monitor.c
 *               update_inhibited_watch) and a video would keep Bu awake all evening; the
 *               user-active watch brings it back. Both only while the pill shows.
 *   powerSaver  Shell's own power profile toggle (ui/status/powerProfiles.js
 *               PowerProfilesToggle `_proxy.ActiveProfile`, `g-properties-changed`): no
 *               proxy of Buoy's; no daemon = not saving. `_proxy` is private Shell state.
 *   animations  St.Settings `enable-animations`.
 * Made while the plan is in use, destroyed with it (kit/services/idle.js).
 */
export class MascotFeed {
    /** @param {function(): void} onChange  re-presents the plan */
    constructor(onChange) {
        this._onChange = onChange;
        this.state = {idleInput: false, powerSaver: false, animations: true};
        this._monitor = global.backend.get_core_idle_monitor();
        this._idleId = 0;
        this._activeId = 0;
        this._st = St.Settings.get();
        this._st.connectObject('notify::enable-animations', () => this._set({animations: this._st.enable_animations}), this);
        this.state.animations = this._st.enable_animations;
        this._watchPower();
    }

    // Quick Settings builds its toggles asynchronously (ui/panel.js _setupIndicators): tried
    // again each time the pill shows until it is there
    _watchPower() {
        if (this._proxy)
            return;
        // private Shell state (ui/status/powerProfiles.js Indicator): no type in @girs
        const indicator = /** @type {any} */ (Main.panel.statusArea.quickSettings?._powerProfiles);
        const proxy = indicator?._powerProfilesToggle?._proxy ?? null;
        if (!proxy)
            return;
        this._proxy = proxy;
        proxy.connectObject('g-properties-changed', () => this._readPower(), 'notify::g-name-owner', () => this._readPower(), this);
        this._readPower();
    }

    _readPower() {
        const p = this._proxy;
        this._set({powerSaver: !!p?.g_name_owner && p.ActiveProfile === 'power-saver'});
    }

    _set(patch) {
        const next = {...this.state, ...patch};
        if (Object.keys(next).every(k => next[k] === this.state[k]))
            return;
        this.state = next;
        this._onChange();
    }

    /** @param {boolean} shown  the idle pill shows (the watches exist only then) */
    shown(shown) {
        if (!shown) {
            this._unwatchIdle();
            return;
        }
        this._watchPower();
        if (this._idleId)
            return;
        // the idle time before the watch counts (meta_idle_monitor_add_idle_watch_full)
        this._idleId = this._monitor.add_idle_watch_full(IDLE_MS, () => {
            this._set({idleInput: true});
            this._watchActive();
        }, Meta.IdleMonitorWatchFlags.UNINHIBITABLE);
        if (this._monitor.get_idletime() >= IDLE_MS) {
            this._set({idleInput: true});
            this._watchActive();
        } else {
            this._set({idleInput: false});
        }
    }

    // one-shot: removed by mutter once it fires
    _watchActive() {
        if (this._activeId)
            return;
        this._activeId = this._monitor.add_user_active_watch(() => {
            this._activeId = 0;
            this._set({idleInput: false});
        });
    }

    _unwatchIdle() {
        if (this._idleId)
            this._monitor.remove_watch(this._idleId);
        if (this._activeId)
            this._monitor.remove_watch(this._activeId);
        this._idleId = this._activeId = 0;
    }

    destroy() {
        this._unwatchIdle();
        this._st.disconnectObject(this);
        this._proxy?.disconnectObject(this);
        this._proxy = null;
        this._onChange = () => {};
    }
}
