"""Cuts studio product photos (flat #F4F4F4 background, design/imagery/README.md) out to transparent PNGs.

The background is the region connected to the image border within a small colour distance; its
anti-aliased edge pixels fade out, and a light garment edge (white trim) stays opaque. Used for the
share image (design/share/README.md).

Usage: python3 scripts/images/cutout.py <out_dir> <name>=<photo path or URL> [...]
       (use --thresh 4 for white garments; the default 18 suits coloured ones)
"""
import argparse
import io
import pathlib
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BACKGROUND = np.array([244, 244, 244])


def load(source):
    if source.startswith('http'):
        with urllib.request.urlopen(source) as response:
            return Image.open(io.BytesIO(response.read())).convert('RGB')
    return Image.open(source).convert('RGB')


def cut(image, thresh):
    pixels = np.asarray(image).astype(int)
    distance = np.abs(pixels - BACKGROUND).max(axis=2)
    probe = image.copy()
    width, height = image.size
    seeds = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1),
             (width // 2, 0), (width // 2, height - 1), (0, height // 2), (width - 1, height // 2)]
    for x, y in seeds:
        if distance[y, x] <= 2:
            ImageDraw.floodfill(probe, (x, y), (255, 0, 255), thresh=thresh)
    background = np.all(np.asarray(probe) == [255, 0, 255], axis=2)
    ramp = 10.0 if thresh > 6 else 4.0
    alpha = np.where(background, np.clip((distance - (2 if thresh > 6 else 1)) / ramp, 0, 1), 1.0)
    mask = Image.fromarray((alpha * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6))
    out = image.convert('RGBA')
    out.putalpha(mask)
    return out.crop(mask.point(lambda v: 255 if v > 8 else 0).getbbox())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out_dir')
    parser.add_argument('items', nargs='+', help='name=path-or-url')
    parser.add_argument('--thresh', type=int, default=18)
    args = parser.parse_args()
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for item in args.items:
        name, source = item.split('=', 1)
        result = cut(load(source), args.thresh)
        result.save(out_dir / f'{name}.png')
        print(name, result.size)


if __name__ == '__main__':
    main()
