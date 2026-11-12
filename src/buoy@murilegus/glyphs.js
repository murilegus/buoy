import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {glyphTint, lightGlyph} from './lib/kit/model/contrast.js';

const EFFECT = 'buoy-glyph';
const SIZE = 32;    // read size: enough to tell one colour from a logo

/**
 * Tray icons that are one light colour on a bitmap — Electron's white tray glyphs (Claude,
 * Discord…), which `color` cannot reach — follow cluster-contrast like the text: on a
 * dark-text side they are drawn in the text colour (Clutter.ColorizeEffect: mutter
 * clutter-colorize-effect.c, gray × tint, alpha kept). Logos keep their look (SPEC §1,
 * Ethan 2026-11-04). Signals only: the tray box's children, each icon's `notify::gicon`.
 * Each picture is read once (Gio.LoadableIcon, 32 px) and remembered by its GIcon.
 */
export class TrayGlyphs {
    /**
     * @param {St.BoxLayout} box  the right box (the tray)
     * @param {Clutter.Actor} skip  the system cluster inside it: GNOME's own, symbolic
     */
    constructor(box, skip) {
        this._box = box;
        this._skip = skip;
        /** @type {'dark-text'|'light-text'} */
        this._text = 'light-text';
        this._icons = new Map();        // St.Icon → {light, cancel, ids}
        this._known = new WeakMap();    // GIcon → lightGlyph()
        this._ids = [
            box.connect('child-added', () => this._scan()),
            box.connect('child-removed', () => this._scan()),
        ];
        this._scan();
    }

    /** @param {'dark-text'|'light-text'} text  the right side's text */
    setText(text) {
        this._text = text;
        for (const [icon, s] of this._icons)
            this._apply(icon, s);
    }

    _scan() {
        const found = new Set();
        const walk = a => {
            if (a === this._skip)
                return;
            if (a instanceof St.Icon)
                found.add(a);
            a.get_children().forEach(walk);
        };
        this._box.get_children().forEach(walk);
        for (const icon of [...this._icons.keys()]) {
            if (!found.has(icon))
                this._forget(icon);
        }
        for (const icon of found) {
            if (!this._icons.has(icon))
                this._track(icon);
        }
    }

    _track(icon) {
        const s = {light: false, cancel: null};
        s.ids = [
            icon.connect('notify::gicon', () => this._read(icon, s)),
            icon.connect('destroy', () => this._forget(icon, true)),
        ];
        this._icons.set(icon, s);
        this._read(icon, s);
    }

    _forget(icon, destroyed = false) {
        const s = this._icons.get(icon);
        if (!s)
            return;
        s.cancel?.cancel();
        s.ids.forEach(id => icon.disconnect(id));
        if (!destroyed)
            icon.remove_effect_by_name(EFFECT);
        this._icons.delete(icon);
    }

    _read(icon, s) {
        s.cancel?.cancel();
        s.cancel = null;
        const g = picture(icon.gicon);
        if (!g || this._known.has(g)) {
            s.light = g ? this._known.get(g) : false;
            this._apply(icon, s);
            return;
        }
        const cancel = s.cancel = new Gio.Cancellable();
        read(g, cancel).then(img => {
            if (cancel !== s.cancel)
                return;
            s.cancel = null;
            s.light = lightGlyph(img);
            this._known.set(g, s.light);
            this._apply(icon, s);
        }).catch(e => {
            if (cancel !== s.cancel)
                return;         // cancelled: a newer picture, or gone
            s.cancel = null;
            if (!(e instanceof GLib.Error))
                logError(e, 'Buoy: tray icon');
        });
    }

    _apply(icon, s) {
        const tint = glyphTint(s.light, this._text);
        const effect = icon.get_effect(EFFECT);
        if (!tint) {
            if (effect)
                icon.remove_effect(effect);
            return;
        }
        const [, color] = Cogl.Color.from_string(tint);
        if (effect)
            effect.tint = color;
        else
            icon.add_effect_with_name(EFFECT, new Clutter.ColorizeEffect({tint: color}));
    }

    destroy() {
        this._ids.forEach(id => this._box.disconnect(id));
        this._ids = [];
        for (const icon of [...this._icons.keys()])
            this._forget(icon);
    }
}

// The bitmap behind an icon, if it has one: AppIndicator wraps a FileIcon in an
// EmblemedIcon (appIndicator.js StTextureCacheSkippingFileIcon); a pixmap is a
// BytesIcon or a GdkPixbuf. A ThemedIcon is the theme's: symbolic ones take `color`.
function picture(gicon) {
    let g = gicon;
    while (g instanceof Gio.EmblemedIcon)
        g = g.get_icon();
    if (!g || g instanceof Gio.ThemedIcon || !(g instanceof Gio.LoadableIcon))
        return null;
    return g;
}

async function read(g, cancel) {
    const [stream] = await new Promise((resolve, reject) =>
        g.load_async(SIZE, cancel, (_g, res) => {
            try {
                resolve(g.load_finish(res));
            } catch (e) {
                reject(e);
            }
        }));
    try {
        const pixbuf = await new Promise((resolve, reject) =>
            GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, SIZE, SIZE, true, cancel, (_s, res) => {
                try {
                    resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(res));
                } catch (e) {
                    reject(e);
                }
            }));
        return {
            width: pixbuf.get_width(),
            height: pixbuf.get_height(),
            rowstride: pixbuf.get_rowstride(),
            channels: pixbuf.get_n_channels(),
            alpha: pixbuf.get_has_alpha(),
            pixels: pixbuf.read_pixel_bytes().toArray(),
        };
    } finally {
        stream.close(null);
    }
}
