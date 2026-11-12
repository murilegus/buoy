#!/usr/bin/env python3
"""Frames → an animated PNG that GitHub and the docs site both play inline (design/motion clips).

    python3 -I scripts/apng.py <frames dir> <out.png> <fps>

The frames are f0000.png, f0001.png… (docs/design/motion/render/motion.js clip-*). One 256-colour
palette for the whole clip, taken from a frame a third of the way in, without dithering, so
consecutive frames differ only where something moves and Pillow stores just that part of each.
Design source, not a build step (scripts/render-design.sh); needs Pillow (Ubuntu: python3-pil).
"""
import glob
import os
import sys

from PIL import Image


def main(frames_dir, out, fps):
    files = sorted(glob.glob(os.path.join(frames_dir, 'f*.png')))
    if not files:
        sys.exit(f'apng: no frames in {frames_dir}')
    frames = [Image.open(f).convert('RGB') for f in files]
    palette = frames[len(frames) // 3].quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 / fps), loop=0,
                   optimize=True)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]))
