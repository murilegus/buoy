// Frames → an animated PNG that GitHub and the docs site both play inline (design/motion clips).
//
//     gjs -m scripts/apng.js <frames dir> <out.png> <fps>
//
// The frames are f0000.png, f0001.png… (docs/design/motion/render/motion.js clip-*). One 256-colour
// palette for the whole clip, cut by median from a frame a third of the way in, without dithering,
// so consecutive frames differ only where something moves; each frame stores just the box that
// changed over the last (dispose none, blend source), and a frame equal to the last only lengthens
// it. Written by hand as PNG chunks (IHDR, PLTE, acTL, fcTL, IDAT / fdAT, IEND; APNG 1.0), zlib
// from Gio. Design source, not a build step (scripts/render-design.sh); gjs only, as every render
// script (2026-11-15, Ethan: in place of the Python and Pillow one).
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const [dir, out, fpsArg] = ARGV;
if (!dir || !out || !fpsArg) {
    printerr('usage: gjs -m scripts/apng.js <frames dir> <out.png> <fps>');
    imports.system.exit(2);
}
const DELAY = Math.round(1000 / Number(fpsArg));   // ms a frame

// ---- the frames, as RGB (alpha dropped, as Pillow's convert('RGB')) -------------------------------
const names = [];
const en = Gio.File.new_for_path(dir).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
for (let info; (info = en.next_file(null));) {
    if (/^f\d+\.png$/.test(info.get_name()))
        names.push(info.get_name());
}
names.sort();
if (!names.length) {
    printerr(`apng: no frames in ${dir}`);
    imports.system.exit(1);
}

let W = 0, H = 0;
function readRGB(path) {
    const pb = GdkPixbuf.Pixbuf.new_from_file(path);
    const w = pb.get_width(), h = pb.get_height(), n = pb.get_n_channels(), stride = pb.get_rowstride();
    if (!W) {
        W = w;
        H = h;
    } else if (w !== W || h !== H) {
        throw new Error(`apng: ${path} is ${w}×${h}, the first frame ${W}×${H}`);
    }
    const src = pb.get_pixels();
    const rgb = new Uint32Array(w * h);     // 0xRRGGBB a pixel
    for (let y = 0; y < h; y++) {
        let s = y * stride, d = y * w;
        for (let x = 0; x < w; x++, s += n, d++)
            rgb[d] = (src[s] << 16) | (src[s + 1] << 8) | src[s + 2];
    }
    return rgb;
}

// ---- the palette: median cut over the reference frame's colours, weighted by how many pixels -----
function medianCut(rgb, max = 256) {
    const counts = new Map();
    for (const c of rgb)
        counts.set(c, (counts.get(c) ?? 0) + 1);
    const colours = [...counts].map(([c, n]) => ({r: c >> 16, g: (c >> 8) & 255, b: c & 255, n}));
    if (colours.length <= max)
        return colours.map(c => [c.r, c.g, c.b]);
    const box = items => {
        const lo = [255, 255, 255], hi = [0, 0, 0];
        let n = 0;
        for (const c of items) {
            const v = [c.r, c.g, c.b];
            for (let k = 0; k < 3; k++) {
                lo[k] = Math.min(lo[k], v[k]);
                hi[k] = Math.max(hi[k], v[k]);
            }
            n += c.n;
        }
        const ranges = hi.map((h, k) => h - lo[k]);
        const axis = ranges.indexOf(Math.max(...ranges));
        return {items, n, axis, range: ranges[axis]};
    };
    const boxes = [box(colours)];
    while (boxes.length < max) {
        // the box with the most pixels among those that can still be split
        let best = -1;
        for (let i = 0; i < boxes.length; i++) {
            if (boxes[i].items.length > 1 && (best < 0 || boxes[i].n > boxes[best].n))
                best = i;
        }
        if (best < 0)
            break;
        const {items, n, axis} = boxes[best];
        const key = ['r', 'g', 'b'][axis];
        items.sort((a, b) => a[key] - b[key]);
        let acc = 0, cut = 1;
        for (let i = 0; i < items.length - 1; i++) {
            acc += items[i].n;
            cut = i + 1;
            if (acc >= n / 2)
                break;
        }
        boxes.splice(best, 1, box(items.slice(0, cut)), box(items.slice(cut)));
    }
    return boxes.map(({items, n}) => {
        let r = 0, g = 0, b = 0;
        for (const c of items) {
            r += c.r * c.n;
            g += c.g * c.n;
            b += c.b * c.n;
        }
        return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });
}

// each colour to its nearest in the palette (no dithering); a colour seen once is remembered
function indexer(palette) {
    const memo = new Map();
    return c => {
        const i = memo.get(c);
        if (i !== undefined)
            return i;
        const r = c >> 16, g = (c >> 8) & 255, b = c & 255;
        let best = 0, dist = Infinity;
        for (let k = 0; k < palette.length; k++) {
            const [pr, pg, pb] = palette[k];
            const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
            if (d < dist) {
                dist = d;
                best = k;
            }
        }
        memo.set(c, best);
        return best;
    };
}

// ---- PNG chunks --------------------------------------------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes)
        c = CRC[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const u16 = v => [(v >>> 8) & 255, v & 255];
const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
function chunk(type, data) {
    const body = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++)
        body[i] = type.charCodeAt(i);
    body.set(data, 4);
    parts.push(new Uint8Array(u32(data.length)), body, new Uint8Array(u32(crc32(body))));
}
function deflate(raw) {
    const mem = Gio.MemoryOutputStream.new_resizable();
    const z = new Gio.ConverterOutputStream({
        base_stream: mem, converter: new Gio.ZlibCompressor({format: Gio.ZlibCompressorFormat.ZLIB, level: 9}),
    });
    z.write_all(raw, null);
    z.close(null);
    return mem.steal_as_bytes().toArray();
}
// a box of palette indices as PNG rows, each with filter 0 (none: the usual for palette images)
function rows(idx, x0, y0, w, h) {
    const raw = new Uint8Array(h * (w + 1));
    for (let y = 0; y < h; y++)
        raw.set(idx.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + w), y * (w + 1) + 1);
    return deflate(raw);
}

// ---- the clip ------------------------------------------------------------------------------------------
const frames = names.map(n => readRGB(`${dir}/${n}`));
const palette = medianCut(frames[Math.floor(frames.length / 3)]);
const nearest = indexer(palette);

// each frame's indices; the box that changed over the last, or none (it only lengthens the last)
const kept = [];       // {idx, x, y, w, h, delay}
let last = null;
for (const rgb of frames) {
    const idx = new Uint8Array(W * H);
    for (let i = 0; i < idx.length; i++)
        idx[i] = nearest(rgb[i]);
    if (!last) {
        kept.push({idx, x: 0, y: 0, w: W, h: H, delay: DELAY});
        last = idx;
        continue;
    }
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
        const row = y * W;
        for (let x = 0; x < W; x++) {
            if (idx[row + x] !== last[row + x]) {
                if (x < x0)
                    x0 = x;
                if (x > x1)
                    x1 = x;
                if (y < y0)
                    y0 = y;
                y1 = y;
            }
        }
    }
    if (x1 < 0) {
        kept[kept.length - 1].delay += DELAY;
        continue;
    }
    kept.push({idx, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, delay: DELAY});
    last = idx;
}

chunk('IHDR', [...u32(W), ...u32(H), 8, 3, 0, 0, 0]);         // 8-bit, palette
chunk('PLTE', palette.flat());
chunk('acTL', [...u32(kept.length), ...u32(0)]);              // plays forever
let seq = 0;
kept.forEach((f, i) => {
    // delay in ms: numerator, denominator 1000; dispose none, blend source
    chunk('fcTL', [...u32(seq++), ...u32(f.w), ...u32(f.h), ...u32(f.x), ...u32(f.y), ...u16(f.delay), ...u16(1000), 0, 0]);
    const data = rows(f.idx, f.x, f.y, f.w, f.h);
    if (i === 0) {
        chunk('IDAT', data);
    } else {
        const d = new Uint8Array(4 + data.length);
        d.set(u32(seq++));
        d.set(data, 4);
        chunk('fdAT', d);
    }
});
chunk('IEND', []);

const size = parts.reduce((s, p) => s + p.length, 0);
const file = new Uint8Array(size);
let at = 0;
for (const p of parts) {
    file.set(p, at);
    at += p.length;
}
GLib.file_set_contents(out, file);
