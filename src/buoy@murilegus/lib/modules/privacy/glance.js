import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {inUseTile} from './call.js';
import {inUse} from './store.js';

const PANEL = 'gnome-privacy-panel.desktop';

/**
 * Home's "in use" tile (design/compact "Đang gọi", 3, 2026-11-27, Ethan): first among the glances,
 * only while the microphone or the camera is in use — the apps recording by name (GNOME's mixer
 * knows them; it does not know who uses the camera). A click opens Settings → Privacy.
 */
export class InUseGlance {
    /**
     * @param {object} [kit]
     * @param {function():void} [kit.close]  close the island
     * @param {function():void} [kit.changed]  the tile changed: Home lays out again
     */
    constructor({close = null, changed = null} = {}) {
        this._close = close;
        this._changed = changed;
        this._key = JSON.stringify(this.tile);
        this._unlisten = inUse.listen(() => {
            const key = JSON.stringify(this.tile);
            if (key !== this._key) {
                this._key = key;
                this._changed?.();
            }
        });
    }

    /** @returns {boolean} something in use */
    get ready() {
        return this.tile !== null;
    }

    /** @returns {?object} the tile (kit/ui/home.js) */
    get tile() {
        return inUseTile(inUse);
    }

    activate() {
        const app = Shell.AppSystem.get_default().lookup_app(PANEL);
        if (app) {
            Main.overview.hide();
            app.activate();
        }
        this._close?.();
    }

    destroy() {
        this._unlisten?.();
        this._unlisten = null;
        this._changed = null;
    }
}
