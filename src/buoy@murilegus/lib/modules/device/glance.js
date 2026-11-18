import {phoneHomePage, phoneTile} from '../../kit/model/phone.js';
import {Phones, openGsconnect} from '../../kit/services/gsconnect.js';

/**
 * Home's phone tile (design/home "Ô điện thoại", 2026-11-17, Ethan; FEATURES M4 "Phone via
 * GSConnect"): the phone GSConnect has connected, its battery and name, after the battery's tile
 * (order 40). Read through kit/services/gsconnect.js while Home is open (a glance lives as long as
 * the open). No phone connected: not ready, no tile, nothing said. A click opens the Phone tab
 * (part 3, 2026-11-18); with its module off, Find My Phone and GSConnect's settings in place of the
 * card and the row.
 */
export class PhoneGlance {
    /**
     * @param {object} [kit]
     * @param {function(string):void} [kit.open]  open a tab (the Phone tab)
     * @param {function():void} [kit.close]  close the island
     * @param {function():void} [kit.changed]  the tile changed: Home lays out again
     * @param {?object} [kit.settings]  Buoy's settings (Gio.Settings): is the Phone tab there
     */
    constructor({open = null, close = null, changed = null, settings = null} = {}) {
        this._open = open;
        this._settings = settings;
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

    // the Phone tab is there (its module on): a click opens it (design/device "Cuộc gọi và tab Điện
    // thoại", 2026-11-18), Find My Phone at its head; without it, the page as before
    _tab() {
        return !!this._open && this._settings?.get_boolean('modules-phone') === true;
    }

    /** @returns {?object} Find My Phone and GSConnect's settings (kit/ui/home.js), null without a phone or with the Phone tab */
    page() {
        if (this._tab())
            return null;
        const p = phoneHomePage(this._phone);
        const id = this._phone?.id;
        return p ? {...p, choose: c => c === 'ring' && id && this._phones?.ring(id)} : null;
    }

    // the tile with the Phone tab: the tab; else the page's settings row: GSConnect's own prefs
    activate() {
        if (this._tab()) {
            this._open('phone');
            return;
        }
        openGsconnect();
        this._close?.();
    }

    destroy() {
        this._phones?.destroy();
        this._phones = null;
        this._changed = null;
    }
}
