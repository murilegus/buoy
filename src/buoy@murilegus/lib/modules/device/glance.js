import {phoneHomePage, phoneTile} from '../../kit/model/phone.js';
import {Phones, openGsconnect} from '../../kit/services/gsconnect.js';

/**
 * Home's phone tile (design/home "Ô điện thoại", 2026-11-17, Ethan; FEATURES M4 "Phone via
 * GSConnect"): the phone GSConnect has connected, its battery and name, after the battery's tile
 * (order 40). Read through kit/services/gsconnect.js while Home is open (a glance lives as long as
 * the open). No phone connected: not ready, no tile, nothing said. A click shows Find My Phone and
 * GSConnect's settings in place of the card and the row.
 */
export class PhoneGlance {
    /**
     * @param {object} [kit]
     * @param {function():void} [kit.close]  close the island
     * @param {function():void} [kit.changed]  the tile changed: Home lays out again
     */
    constructor({close = null, changed = null} = {}) {
        this._close = close;
        this._changed = changed;
        this._key = '';
        this._phone = null;
        this._tile = null;
        this._phones = new Phones(() => this._sync());
    }

    _sync() {
        const before = this._key;
        this._phone = this._phones?.list().find(p => p.connected && p.paired) ?? null;
        this._tile = phoneTile(this._phone);
        this._key = JSON.stringify([this._tile, this._phone?.name ?? null]);
        if (before !== this._key)
            this._changed?.();
    }

    /** @returns {boolean} a phone to show */
    get ready() {
        return this._tile !== null;
    }

    /** @returns {?object} the tile (kit/ui/home.js) */
    get tile() {
        return this._tile;
    }

    /** @returns {?object} Find My Phone and GSConnect's settings (kit/ui/home.js), null without a phone */
    page() {
        const p = phoneHomePage(this._phone);
        const id = this._phone?.id;
        return p ? {...p, choose: c => c === 'ring' && id && this._phones?.ring(id)} : null;
    }

    // the page's settings row: GSConnect's own prefs
    activate() {
        openGsconnect();
        this._close?.();
    }

    destroy() {
        this._phones?.destroy();
        this._phones = null;
        this._changed = null;
    }
}
