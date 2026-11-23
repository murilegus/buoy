import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import NM from 'gi://NM';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

import {Source} from '../../kit/services/source.js';
import {SharingWatch} from '../../kit/services/sharing.js';
import {FLAKY, LIMITED_WAIT, QUIET, changes} from './model.js';

const KIND = 'network';
const FLASH = 'flash';
const PORTAL = 'portal';
const isVpn = a => a.get_vpn() || a.get_connection_type() === 'wireguard';
const LIMITED = new Set([NM.ConnectivityState.LIMITED, NM.ConnectivityState.NONE]);

/**
 * The network (FEATURES M4 "VPN / Wi-Fi / captive portal"; design/compact "Mạng", 2026-11-23,
 * Ethan), from Shell's own NM.Client (Quick Settings' network indicator, ui/status/network.js);
 * one of Buoy's own only where Shell has none. Signals only.
 *
 * - A flash (3 s) when the primary connection is new, none is left, a VPN (WireGuard too) comes
 *   or goes (model.js changes). A drop is told after FLAKY, and not at all when the same network is
 *   back by then. Nothing for QUIET after Buoy starts (a login, an unlock) or the machine wakes:
 *   NetworkManager reconnects then, nobody just changed anything.
 * - "No Internet" once per connection when its connectivity stays LIMITED / NONE for LIMITED_WAIT
 *   (NetworkManager checks right after it connects); a portal is the card below.
 * - Shell's "Sign in to Network" (CaptivePortalHandler.addConnection) is read as it is added — no
 *   banner, so no notification pill — and is a card, then a pill that stays while it is there;
 *   Sign In activates it, as a click on it would (Shell launches its portal helper). When the
 *   connection gets full connectivity Shell takes it back: the pill goes, and the network's flash
 *   says it is online.
 * - Shell's "Connection failed" (Indicator._onActivationFailed) is read and destroyed as it is
 *   added; a flash with the connection that was activating says it.
 */
export class NetworkSource extends Source {
    enable(stack, registry = null, settings = null) {
        super.enable(stack, registry, settings);
        this._last = null;
        this._ids = new Map();
        this._timers = new Map();       // 'drop' | 'limited' | 'drops' → source id
        this._dropped = null;           // the connection that dropped: {type, name}
        this._told = new Set();         // connections told "No Internet"
        this._wasPortal = false;
        this._portal = null;            // Shell's notification, while it is up
        this._portalHidden = false;
        this._activating = '';          // the name of the connection last activating (a failure's)
        this._drops = new Set();
        this._quietUntil = Date.now() + QUIET;
        this._sharing = new SharingWatch(() => this._redraw());
        LoginManager.getLoginManager().connectObject('prepare-for-sleep', (_m, sleeping) => {
            if (!sleeping)
                this._quietUntil = Date.now() + QUIET;
        }, this);
        // Shell's system source goes when its last notification does and comes anew
        // (ui/messageTray.js getSystemSource): every source, as it is added; the notification
        // itself tells (_notified)
        const tray = Main.messageTray;
        const watch = src => src.connectObject('notification-added', (_s, n) => this._notified(n), this);
        tray.connectObject('source-added', (_t, src) => watch(src), this);
        tray.getSources().forEach(watch);
        const client = this._indicator?._client ?? null;   // Shell's, when Quick Settings has it already
        if (client) {
            this._watch(client);
        } else {
            // Shell's not ready yet (or no indicator): a client of Buoy's own
            this._cancel = new Gio.Cancellable();
            NM.Client.new_async(this._cancel, (_o, res) => {
                try {
                    const c = NM.Client.new_finish(res);
                    if (this._stack)
                        this._watch(this._indicator?._client ?? c);
                } catch (e) {
                    if (this._stack)
                        console.warn(`Buoy: network: ${e.message}`);
                }
            });
        }
    }

    // Shell's network indicator (ui/status/network.js Indicator), read when needed: Quick Settings
    // makes it after Buoy may start (panel.js _setupIndicators). Its _client, _portalHandler and
    // _notification are its own, only read
    get _indicator() {
        return /** @type {any} */ (Main.panel.statusArea.quickSettings?._network ?? null);
    }

    _watch(client) {
        this._client = client;
        client.connectObject(
            'notify::primary-connection', () => this._sync(),
            'notify::connectivity', () => this._sync(),
            'notify::activating-connection', () => {
                const a = client.get_activating_connection();
                if (a)
                    this._activating = a.get_id() ?? '';
                this._sync();
            },
            'active-connection-added', (_c, a) => this._watchActive(a),
            'active-connection-removed', (_c, a) => {
                a.disconnectObject(this);
                this._sync();
            }, this);
        client.get_active_connections().forEach(a => this._watchActive(a, false));
        this._sync();
    }

    _watchActive(a, sync = true) {
        a.connectObject('notify::state', () => this._sync(), this);
        if (sync)
            this._sync();
    }

    // the primary connection that is not a VPN (a VPN can be NM's primary when it routes everything)
    _reading() {
        const c = this._client;
        const actives = c.get_active_connections().filter(a => a.get_state() === NM.ActiveConnectionState.ACTIVATED);
        let prim = c.get_primary_connection();
        if (prim && (isVpn(prim) || prim.get_state() !== NM.ActiveConnectionState.ACTIVATED))
            prim = actives.find(a => !isVpn(a) && (a.get_default() || a.get_default6())) ?? null;
        let primary = null;
        if (prim) {
            const [dev] = prim.get_devices() ?? [];
            const kind = dev?.get_device_type();
            let type = 'other';
            if (kind === NM.DeviceType.WIFI)
                type = 'wifi';
            else if (kind === NM.DeviceType.ETHERNET)
                type = 'wired';
            const ap = type === 'wifi' ? /** @type {NM.DeviceWifi} */ (dev).get_active_access_point() : null;
            primary = {id: prim.get_path(), type, name: prim.get_id() ?? '', strength: ap ? ap.get_strength() : null};
        }
        return {primary, vpns: actives.filter(isVpn).map(a => ({id: a.get_path(), name: a.get_id() ?? ''}))};
    }

    _sync() {
        if (!this._stack || !this._client)
            return;
        const cur = this._reading();
        const quiet = Date.now() < this._quietUntil;
        for (const ev of changes(this._last, cur)) {
            if (ev.what === 'offline') {
                this._dropped = this._last.primary;
                this._after('drop', FLAKY, () => {
                    if (!this._last?.primary)
                        this._flash({what: 'offline'});
                    this._dropped = null;
                });
                continue;
            }
            if (ev.what === 'connected' && this._timers.has('drop')) {
                this._clear('drop');
                const back = this._dropped && this._dropped.type === ev.type && this._dropped.name === ev.name;
                this._dropped = null;
                if (back)
                    continue;       // a flaky Wi-Fi, the same network back
            }
            if (!quiet)
                this._flash(ev);
        }
        this._last = cur;
        this._connectivity(cur, quiet);
    }

    _connectivity(cur, quiet) {
        const state = this._client.get_connectivity();
        const id = cur.primary?.id ?? null;
        if (state === NM.ConnectivityState.PORTAL) {
            this._wasPortal = true;
            this._clear('limited');
            return;
        }
        if (state === NM.ConnectivityState.FULL) {
            this._clear('limited');
            // signed in at last: the network's flash says it is online
            if (this._wasPortal && cur.primary && !quiet)
                this._flash({what: 'connected', ...cur.primary});
            this._wasPortal = false;
            return;
        }
        if (!id || !LIMITED.has(state) || this._told.has(id) || this._timers.has('limited'))
            return;
        this._after('limited', LIMITED_WAIT, () => {
            const now = this._last?.primary;
            if (now?.id === id && LIMITED.has(this._client.get_connectivity()) && Date.now() >= this._quietUntil) {
                this._told.add(id);
                this._flash({what: 'no-internet', ...now});
            }
        });
    }

    // Shell's own notifications this module says instead
    _notified(n) {
        const ind = this._indicator;
        if (!ind)
            return;
        if ([...ind._portalHandler?._notifications?.values() ?? []].includes(n)) {
            // read now: no banner (ui/messageTray.js _onNotificationRequestBanner); GNOME's list keeps it
            n.acknowledged = true;
            this._portal = n;
            this._portalHidden = false;
            n.connectObject('destroy', () => {
                if (this._portal === n)
                    this._portal = null;
                this._end(PORTAL);
                this._syncSharing();
            }, this);
            this._showPortal(true);
            return;
        }
        if (n === ind._notification) {
            // "Connection failed": read, destroyed once addNotification is done (calendar/source.js)
            n.acknowledged = true;
            this._drops.add(n);
            this._after('drops', 0, () => {
                for (const x of this._drops)
                    x.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
                this._drops.clear();
            });
            this._flash({what: 'failed', name: this._activating});
        }
    }

    _showPortal(alert = false) {
        const n = this._portal;
        if (!n || this._portalHidden || !this._stack)
            return;
        this._sharing.start();
        const p = this._last?.primary ?? null;
        const a = this._registry?.build(KIND, PORTAL, {
            what: 'portal', type: p?.type ?? 'wifi', name: n.body || p?.name || '', strength: p?.strength ?? null,
            shared: this._sharing.shared,
            signIn: () => {
                if (this._portal === n)
                    n.activate();
            },
            dismiss: () => {
                this._portalHidden = true;
                this._end(PORTAL);
                this._syncSharing();
            },
        });
        this._put(PORTAL, a, alert);
    }

    // a flash: the last one replaces the one before and starts its 3 s again
    _flash(ev) {
        this._sharing.start();
        const a = this._registry?.build(KIND, FLASH, {...ev, shared: this._sharing.shared});
        this._end(FLASH);
        this._put(FLASH, a, false);
        this._after('sharing', a?.ttl ?? 3000, () => this._syncSharing());
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

    _redraw() {
        this._showPortal();
    }

    // the shared screen is watched only while something here could show a name
    _syncSharing() {
        const flashUp = this._ids.has(FLASH) && this._stack?.has(this._ids.get(FLASH));
        if (!flashUp && !(this._portal && !this._portalHidden))
            this._sharing?.stop();
    }

    _after(key, ms, fn) {
        this._clear(key);
        this._timers.set(key, GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timers.delete(key);
            fn();
            return GLib.SOURCE_REMOVE;
        }));
    }

    _clear(key) {
        const id = this._timers.get(key);
        if (id)
            GLib.source_remove(id);
        this._timers.delete(key);
    }

    disable() {
        this._cancel?.cancel();
        this._cancel = null;
        for (const key of [...this._timers.keys()])
            this._clear(key);
        // a "Connection failed" read but not destroyed yet: let it go now
        for (const x of this._drops ?? [])
            x.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
        this._drops = null;
        LoginManager.getLoginManager().disconnectObject(this);
        Main.messageTray.disconnectObject(this);
        Main.messageTray.getSources().forEach(src => src.disconnectObject(this));
        this._portal?.disconnectObject(this);
        this._portal = null;
        if (this._client) {
            this._client.disconnectObject(this);
            this._client.get_active_connections().forEach(a => a.disconnectObject(this));
        }
        this._client = null;
        for (const key of [...this._ids.keys()])
            this._end(key);
        this._sharing?.stop();
        this._sharing = null;
        super.disable();
    }
}
