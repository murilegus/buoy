import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {bandProfile, imageArea, wallpaperSource} from './lib/kit/model/contrast.js';

// Decoded width: the band is 40 px of a 1080–2160 px tall monitor, so a 512 px wide copy
// still gives a few rows of it, and the decode stays small.
const DECODE_WIDTH = 512;

/**
 * The wallpaper Shell draws on the primary monitor (the panel's), as a luminance profile
 * of its top band for kit/model/contrast.js (`cluster-contrast = auto`, SPEC §1, 2026-11-04).
 * Signals only: the background and color-scheme keys (the file Shell picks depends on
 * both, js/ui/background.js getBackground) and `monitors-changed`. The image is decoded
 * once per change of what is drawn, asynchronously and downscaled; a monitor change only
 * re-measures the kept copy. A slideshow (.xml) and a file replaced in place are not
 * followed.
 */
export class Wallpaper {
    /**
     * @param {function(): void} onChange  called whenever `profile` changes
     */
    constructor(onChange) {
        this._onChange = onChange;
        this.profile = null;
        this._image = null;     // {pixels…, real: {width, height}} of the drawn file
        this._key = null;
        this._status = 'unknown';
        this._cancel = null;
        this._bg = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        this._iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._ids = [
            [this._bg, this._bg.connect('changed', () => this._load())],
            [this._iface, this._iface.connect('changed::color-scheme', () => this._load())],
            [Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this._measure())],
        ];
        this._load();
    }

    _state() {
        const bg = this._bg;
        return {
            scheme: this._iface.get_string('color-scheme'),
            uri: bg.get_string('picture-uri'),
            uriDark: bg.get_string('picture-uri-dark'),
            options: bg.get_string('picture-options'),
            pattern: {
                primary: bg.get_string('primary-color'),
                secondary: bg.get_string('secondary-color'),
                shading: bg.get_string('color-shading-type'),
            },
        };
    }

    _load() {
        const source = wallpaperSource(this._state());
        const key = JSON.stringify(source);
        if (key === this._key) {
            this._measure();    // the same file: the style or a colour may have changed
            return;
        }
        this._key = key;
        this._cancel?.cancel();
        this._cancel = null;
        this._image = null;
        this._status = source.type; // pattern | unknown | image (→ loading until read)
        if (source.type !== 'image') {
            this._measure();
            return;
        }
        this._status = 'loading';   // the old profile would be wrong meanwhile: unknown
        this._measure();
        const cancel = this._cancel = new Gio.Cancellable();
        decode(Gio.File.new_for_uri(source.uri), cancel).then(image => {
            if (cancel !== this._cancel)
                return;
            this._image = image;
            this._status = image ? 'image' : 'unknown';
            this._measure();
        }).catch(e => {
            if (cancel !== this._cancel)
                return;         // cancelled, or superseded by a newer change
            if (!(e instanceof GLib.Error))
                logError(e, 'Buoy: wallpaper');
            this._status = 'unknown';   // missing or not an image: as Shell, no fuss
            this._measure();
        });
    }

    _measure() {
        const mon = Main.layoutManager.primaryMonitor;
        if (!mon || this._status === 'unknown' || this._status === 'loading') {
            this.profile = null;
        } else {
            const {options, pattern} = this._state();
            const [width, height] = global.display.get_size();
            const area = this._image ? imageArea(options, this._image.real, mon, {width, height}) : null;
            this.profile = bandProfile(this._image, area, mon, pattern);
        }
        this._onChange();
    }

    destroy() {
        this._cancel?.cancel();
        this._cancel = null;
        for (const [obj, id] of this._ids)
            obj.disconnect(id);
        this._ids = [];
        this._image = null;
        this.profile = null;
    }
}

// Real size from the header (centered and tiled images are drawn at it), then a
// downscaled decode from an async stream. Resolves null for a file that is not an image.
async function decode(file, cancel) {
    const path = file.get_path();
    if (!path)
        return null;            // not a local file: Shell's own loader would need it
    const [format, width, height] = await new Promise((resolve, reject) =>
        GdkPixbuf.Pixbuf.get_file_info_async(path, cancel, (_s, res) => {
            try {
                resolve(GdkPixbuf.Pixbuf.get_file_info_finish(res));
            } catch (e) {
                reject(e);
            }
        }));
    if (!format || !width || !height)
        return null;
    const stream = await new Promise((resolve, reject) =>
        file.read_async(GLib.PRIORITY_LOW, cancel, (_f, res) => {
            try {
                resolve(file.read_finish(res));
            } catch (e) {
                reject(e);
            }
        }));
    try {
        const pixbuf = await new Promise((resolve, reject) =>
            GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, DECODE_WIDTH, -1, true, cancel, (_s, res) => {
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
            real: {width, height},
        };
    } finally {
        stream.close(null);
    }
}
