import {clockText} from './model.js';
import {store} from './store.js';

/**
 * Home's timer tile (design/home "Ô hẹn giờ", 2026-11-22, Ethan; FEATURES M4 "Timer"): a tile to
 * start one, even when none runs — the length last started, "Timer"; a click opens the tab with it
 * set. While one runs or is paused Home shows its activity's own tile, so this one steps aside.
 */
export class TimerGlance {
    /**
     * @param {object} [kit]
     * @param {function(string):void} [kit.open]  open a tab
     * @param {function():void} [kit.changed]  the tile changed: Home lays out again
     */
    constructor({open = null, changed = null} = {}) {
        this._open = open;
        this._changed = changed;
        this._key = this._state();
        this._unlisten = store.listen(() => {
            const key = this._state();
            if (key !== this._key) {
                this._key = key;
                this._changed?.();
            }
        });
    }

    _state() {
        return `${store.timers.length > 0}:${store.last}`;
    }

    /** @returns {boolean} none running: the tile to start one */
    get ready() {
        return store.timers.length === 0;
    }

    /** @returns {object} the tile (kit/ui/home.js) */
    get tile() {
        return {icon: 'alarm-symbolic', value: clockText(store.last * 1000), caption: 'Timer'};
    }

    activate() {
        this._open?.('timer');
    }

    destroy() {
        this._unlisten?.();
        this._unlisten = null;
        this._changed = null;
    }
}
