import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {MprisPlayer} from 'resource:///org/gnome/shell/ui/mpris.js';

import {SAMPLE, coverColour} from '../../kit/model/cover.js';
import {appOfBusName} from '../../kit/services/apps.js';
import {readPixels} from '../../kit/services/files.js';
import {Source} from '../../kit/services/source.js';

/**
 * Media players (FEATURES M3 "media"). Each MPRIS player is one activity from the moment
 * it plays, kept while paused until `activity-linger` passes without news (the kit's
 * `linger`); Stopped or gone ends it.
 *
 * GNOME's own MprisPlayer (ui/mpris.js) reads the track, the status and drives
 * play/pause, next and previous; it validates broken metadata. Its interface has none
 * of what the compact's bar and the Media tab need, so one more proxy per player reads
 * Metadata (track id, length, album), Position, CanSeek, Shuffle and LoopStatus, and
 * sends SetPosition. All signals: MPRIS emits no Position changes (only Seeked), so the
 * position is read once on each status, track or seek change and the renderer runs it
 * on from there while shown (kit/ui/present/, ARCHITECTURE rule 8). Players are found as
 * Shell's MprisSource does, on NameOwnerChanged.
 */

const PREFIX = 'org.mpris.MediaPlayer2.';
const NAMESPACE = 'org.mpris.MediaPlayer2';   // arg0 namespace match: no trailing dot
const PATH = '/org/mpris/MediaPlayer2';
const IFACE = 'org.mpris.MediaPlayer2.Player';
const PlayerProxy = Gio.DBusProxy.makeProxyWrapper(`<node>
  <interface name="${IFACE}">
    <method name="SetPosition"><arg type="o" direction="in"/><arg type="x" direction="in"/></method>
    <signal name="Seeked"><arg type="x"/></signal>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="Shuffle" type="b" access="readwrite"/>
    <property name="LoopStatus" type="s" access="readwrite"/>
  </interface>
</node>`);
const LOOPS = ['None', 'Playlist', 'Track'];

class Player {
    constructor(busName, onChange) {
        this.busName = busName;
        this._onChange = onChange;
        this.position = null;        // ms, read at `at`
        this.at = 0;
        this._key = '';              // status + track: a change re-reads the position
        this.tint = null;            // the cover's main colour, '#rrggbb' (kit/model/cover.js)
        this._tintOf = null;         // the cover it was read from
        this._cancel = new Gio.Cancellable();
        this.mpris = new MprisPlayer(busName);
        // its app, known before the first click (2026-11-07, Ethan: the first Open was
        // refused focus while this was looked up); null: asked again on a click
        this._app = null;
        appOfBusName(busName).then(({app}) => {
            if (!this._cancel.is_cancelled())
                this._app ??= app;
        });
        this.mpris.connectObject(
            'changed', () => this._changed(),
            'notify::can-play', () => this._onChange(this), this);
        this.extra = null;
        // @ts-expect-error -- a makeProxyWrapper() wrapper is called with new, as in Shell's mpris.js; @girs types a plain function
        new PlayerProxy(Gio.DBus.session, busName, PATH, (proxy, error) => {
            if (error || this._cancel.is_cancelled())
                return;
            this.extra = proxy;
            proxy.connectObject('g-properties-changed', () => this._changed(), this);
            this._seekedId = proxy.connectSignal('Seeked', (_p, _s, [us]) => {
                this.position = us / 1000;
                this.at = Date.now();
                this._onChange(this);
            });
            this._changed();
        }, this._cancel);
    }

    // Once the player leaves, Shell's MprisPlayer drops its proxy and its `status` throws
    // (ui/mpris.js _close); our proxy still says g-properties-changed as GDBusProxy clears
    // its cache on the owner's loss, with g-name-owner already null. Gone reads Stopped.
    /** @returns {?object} the player's Shell.App, as read from its bus name (the chips' logo) */
    get app() {
        return this._app;
    }

    get status() {
        return this.extra && !this.extra.g_name_owner ? 'Stopped' : this.mpris.status;
    }

    get meta() {
        const m = this.extra?.Metadata ?? {};
        const v = k => m[k]?.deepUnpack?.();
        return {trackId: v('mpris:trackid') ?? null, length: v('mpris:length') ?? null, album: v('xesam:album') ?? ''};
    }

    _changed() {
        const key = `${this.status}|${this.meta.trackId}|${this.mpris.trackTitle}`;
        if (key !== this._key) {
            this._key = key;
            this._readPosition();
        }
        this._readTint();
        this._onChange(this);
    }

    // The cover's main colour, for the equaliser (design/pill "Equaliser"): read once per
    // cover, decoded small and off the main loop; the pill is told when it is known. A cover
    // on the web is fetched once more for it (St's own load keeps its pixels to itself).
    _readTint() {
        const url = this.mpris.trackCoverUrl || null;
        if (url === this._tintOf)
            return;
        this._tintOf = url;
        this.tint = null;
        if (!url)
            return;
        readPixels(url, SAMPLE, this._cancel).then(img => {
            if (this._cancel.is_cancelled() || this._tintOf !== url)
                return;
            this.tint = coverColour(img);
            if (this.tint)
                this._onChange(this);
        });
    }

    // Position is not in PropertiesChanged (MPRIS): ask once.
    _readPosition() {
        Gio.DBus.session.call(this.busName, PATH, 'org.freedesktop.DBus.Properties', 'Get',
            new GLib.Variant('(ss)', [IFACE, 'Position']), new GLib.VariantType('(v)'),
            Gio.DBusCallFlags.NONE, -1, this._cancel, (conn, res) => {
                try {
                    const [v] = /** @type {[GLib.Variant]} */ (conn.call_finish(res).deepUnpack());
                    this.position = Number(v.deepUnpack()) / 1000;
                    this.at = Date.now();
                    this._onChange(this);
                } catch {
                    // cancelled, or a player without Position: no bar
                }
            });
    }

    _setProperty(name, value) {
        Gio.DBus.session.call(this.busName, PATH, 'org.freedesktop.DBus.Properties', 'Set',
            new GLib.Variant('(ssv)', [IFACE, name, value]), null,
            Gio.DBusCallFlags.NONE, -1, this._cancel, (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (e) {
                    if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.warn(`Buoy: ${this.busName} ${name}: ${e.message}`);
                }
            });
    }

    // The player comes up, on its playing tab (2026-11-07, Ethan): Shell's MprisPlayer.raise
    // activates the app from `DesktopEntry`, else calls Raise() — Chrome sends neither a
    // DesktopEntry nor CanRaise, so nothing came up, and Firefox's window came up on
    // whichever tab it showed. Now: the app from the player's bus pid (kit/services/apps.js),
    // activated by Shell (always allowed), then the player's own Raise(): a browser then
    // switches to the playing tab itself (Firefox does; Chrome cannot: CanRaise false).
    async _raise(time) {
        this._app ??= (await appOfBusName(this.busName)).app;   // none yet: asked again next time
        if (this._cancel.is_cancelled())
            return;
        // the click's own timestamp (shell-app.c shell_app_activate_full: 0 would mean
        // "now", and after the await above there is no event any more)
        this._app?.activate_full(-1, time);
        Gio.DBus.session.call(this.busName, PATH, 'org.mpris.MediaPlayer2', 'Raise', null, null,
            Gio.DBusCallFlags.NONE, -1, this._cancel, (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch {}           // CanRaise false or gone: the app came up all the same
            });
    }

    /**
     * @param {string} id  prev | playpause | next | raise | shuffle | loop | seek
     * @param {number} [value]  seek: the position, ms
     */
    act(id, value) {
        switch (id) {
        case 'prev':
            this.mpris.previous();
            break;
        case 'next':
            this.mpris.next();
            break;
        case 'playpause':
            this.mpris.playPause();
            break;
        case 'raise':
            // the click's time, read now: Shell.App.activate after an await would take
            // a stale one and Mutter would refuse the focus (Firefox "is ready")
            this._raise(global.get_current_time());
            break;
        case 'shuffle':
            if (typeof this.extra?.Shuffle === 'boolean')
                this._setProperty('Shuffle', new GLib.Variant('b', !this.extra.Shuffle));
            break;
        case 'loop': {
            const now = LOOPS.indexOf(this.extra?.LoopStatus);
            if (now >= 0)
                this._setProperty('LoopStatus', new GLib.Variant('s', LOOPS[(now + 1) % LOOPS.length]));
            break;
        }
        case 'seek': {
            const {trackId} = this.meta;
            if (this.extra?.CanSeek && trackId && Number.isFinite(value)) {
                this.extra.SetPositionAsync(trackId, Math.round(value * 1000)).catch(() => {});
                this.position = value;
                this.at = Date.now();
                this._onChange(this);
            }
            break;
        }
        }
    }

    destroy() {
        this._cancel.cancel();
        this.mpris.disconnectObject(this);
        if (this.extra) {
            this.extra.disconnectObject(this);
            if (this._seekedId)
                this.extra.disconnectSignal(this._seekedId);
        }
        this.extra = null;
    }
}

export class MprisSource extends Source {
    enable(stack, registry, settings) {
        super.enable(stack, registry, settings);
        this._players = new Map();     // bus name → Player
        this._ids = new Map();         // bus name → activity id while surfaced
        this._cancel = new Gio.Cancellable();
        this._settingsId = settings?.connect('changed', (_s, key) => {
            if (key.startsWith('media-'))
                this._players.forEach(p => this._emit(p));
        }) ?? 0;
        const bus = Gio.DBus.session;
        this._ownerId = bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus',
            'NameOwnerChanged', '/org/freedesktop/DBus', NAMESPACE, Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE,
            (_c, _s, _p, _i, _n, params) => {
                const [name, oldOwner, newOwner] = /** @type {string[]} */ (params.deepUnpack());
                if (oldOwner)
                    this._remove(name);
                if (newOwner)
                    this._add(name);
            });
        bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames',
            null, new GLib.VariantType('(as)'), Gio.DBusCallFlags.NONE, -1, this._cancel, (c, res) => {
                try {
                    const [names] = /** @type {[string[]]} */ (c.call_finish(res).deepUnpack());
                    names.filter(n => n.startsWith(PREFIX)).forEach(n => this._add(n));
                } catch {
                    // cancelled by disable()
                }
            });
    }

    _add(name) {
        if (!this._stack || this._players.has(name))
            return;
        this._players.set(name, new Player(name, p => this._emit(p)));
    }

    _remove(name) {
        const p = this._players.get(name);
        if (!p)
            return;
        this._players.delete(name);
        this._end(name);
        p.destroy();
    }

    _end(name) {
        const id = this._ids.get(name);
        this._ids.delete(name);
        if (id)
            this._stack?.end(id);
    }

    _event(p) {
        const m = p.mpris, meta = p.meta;
        const title = m.trackTitle;
        return {
            id: p.busName,
            title, artist: (m.trackArtists ?? []).join(', '), album: meta.album,
            art: m.trackCoverUrl, tint: p.tint, appName: m.app?.get_name() ?? m.source?.title ?? '',
            appIcon: (m.app ?? p.app)?.get_icon() ?? null,
            status: p.status, canPrev: m.canGoPrevious, canNext: m.canGoNext,
            canSeek: p.extra?.CanSeek === true,
            position: p.position, at: p.at,
            length: meta.length !== null ? Number(meta.length) / 1000 : null,
            shuffle: typeof p.extra?.Shuffle === 'boolean' ? p.extra.Shuffle : null,
            loop: LOOPS.includes(p.extra?.LoopStatus) ? p.extra.LoopStatus : null,
            ad: String(meta.trackId ?? '').startsWith('/com/spotify/ad/') || title === 'Advertisement',
            compactOnHover: this._settings?.get_boolean('media-compact-on-hover') ?? true,
            raise: () => p.act('raise'),
            onAction: (id, value) => p.act(id, value),
        };
    }

    _emit(p) {
        if (!this._stack)
            return;
        const status = p.status;
        if (!p.mpris.canPlay || (status !== 'Playing' && status !== 'Paused')) {
            this._end(p.busName);
            return;
        }
        const a = this._registry?.build('media', p.busName, this._event(p));
        if (!a) {
            this._end(p.busName);
            return;
        }
        const id = this._ids.get(p.busName);
        // playing again is news for good: surfaced anew, it counts as the newest
        // (docs/PRIORITY.md §1.4) and leads a player paused before it
        const again = status === 'Playing' && p.shownStatus === 'Paused';
        p.shownStatus = status;
        if (id && !again && this._stack.update(id, a))
            return;
        // A pill starts only when playing: a player left paused (at login, or after its
        // paused ttl ran out) shows nothing until it plays again.
        if (status !== 'Playing') {
            this._ids.delete(p.busName);
            return;
        }
        this._ids.set(p.busName, this._stack.surface(a));
    }

    disable() {
        this._cancel?.cancel();
        if (this._ownerId)
            Gio.DBus.session.signal_unsubscribe(this._ownerId);
        this._ownerId = 0;
        if (this._settingsId)
            this._settings.disconnect(this._settingsId);
        this._settingsId = 0;
        for (const name of [...this._players.keys()])
            this._remove(name);
        super.disable();
    }
}
