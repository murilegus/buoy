import GLib from 'gi://GLib';

import {Source} from '../../kit/services/source.js';
import {WeatherFeed} from './feed.js';
import {keys} from './idle.js';

const ASK = 'idle-weather-locate-now';
// the most a refresh may take: Geoclue's 15 s, then the fetch (feed.js LOCATE_TIMEOUT)
const CAP_SECONDS = 40;

/**
 * Prefs' refresh button for the weather (2026-11-12, Ethan; design prefs weather refresh A):
 * prefs runs in a process of its own and cannot ask where we are without GNOME asking the
 * user, so it writes the time to `idle-weather-locate-now`, and this source — Buoy in the
 * Shell, `org.gnome.Shell` to Geoclue — answers: a feed of its own locates again, Wi-Fi first
 * (feed.js `_locate`, #188's rules), and fetches the weather, once; feed.js writes how it
 * went for prefs' place row. No activity, no polling: one signal, and while a refresh runs,
 * one feed and one cap timer, both gone when it ends or on disable.
 */
export class WeatherSource extends Source {
    enable(stack, registry = null, settings = null, opts = {}) {
        super.enable(stack, registry, settings, opts);
        this._feed = null;
        this._cap = 0;
        this._settings?.connectObject(`changed::${ASK}`, () => this._refresh(), this);
    }

    _refresh() {
        if (this._feed || !this._settings)
            return;                    // one at a time: the running one answers
        const opts = {};
        for (const key of keys)
            opts[key] = this._settings.get_value(key).deepUnpack();
        this._feed = new WeatherFeed(() => {});
        this._cap = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, CAP_SECONDS, () => {
            this._cap = 0;
            this._end();
            return GLib.SOURCE_REMOVE;
        });
        this._feed.refreshNow(opts, () => this._end());
    }

    _end() {
        if (this._cap)
            GLib.source_remove(this._cap);
        this._cap = 0;
        const feed = this._feed;
        this._feed = null;
        // after the current call: the feed's own `changed` handler is calling back
        if (feed)
            Promise.resolve().then(() => feed.destroy());
    }

    disable() {
        this._settings?.disconnectObject(this);
        this._end();
        super.disable();
    }
}
