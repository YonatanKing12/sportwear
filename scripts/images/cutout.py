"""Cuts studio product photos (flat #F4F4F4 background, design/imagery/README.md) out to transparent PNGs.

The background is the region connected to the image border within a small colour distance; its
anti-aliased edge pixels fade out, and a light garment edge (white trim) stays opaque. Used for the
share image (design/share/README.md).

Usage: python3 scripts/images/cutout.py <out_dir> <name>=<photo path or URL> [...]
       (use --thresh 4 for white garments; the default 18 suits coloured ones. For a photo that was
       never normalised, whose background is not exactly #F4F4F4, add --bg auto: the background is
       then the median colour of the photo's border, with a little noise allowed)
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


def specks(solid):
    """Small islands the flood fill did not reach (noise in a photo that was never normalised)."""
    try:
        import cv2
    except ImportError:
        opened = Image.fromarray(solid.astype('uint8') * 255).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
        return solid & (np.asarray(opened) == 0)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(solid.astype('uint8'), connectivity=8)
    if count <= 1:
        return np.zeros_like(solid)
    areas = stats[:, cv2.CC_STAT_AREA]
    keep = areas >= areas[1:].max() * 0.002
    keep[0] = True
    return solid & ~keep[labels]


def cut(image, thresh, auto_background=False):
    pixels = np.asarray(image).astype(int)
    background_colour = BACKGROUND
    seed_limit = 2
    if auto_background:
        border = np.concatenate([pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]])
        background_colour = np.median(border, axis=0)
        seed_limit = 8
    distance = np.abs(pixels - background_colour).max(axis=2)
    probe = image.copy()
    width, height = image.size
    seeds = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1),
             (width // 2, 0), (width // 2, height - 1), (0, height // 2), (width - 1, height // 2)]
    for x, y in seeds:
        if distance[y, x] <= seed_limit:
            ImageDraw.floodfill(probe, (x, y), (255, 0, 255), thresh=thresh)
    background = np.all(np.asarray(probe) == [255, 0, 255], axis=2)
    if auto_background:
        background |= specks(~background)
    ramp = 10.0 if thresh > 6 else 4.0
    floor = seed_limit if auto_background else (2 if thresh > 6 else 1)
    alpha = np.where(background, np.clip((distance - floor) / ramp, 0, 1), 1.0)
    # Only the background next to the garment keeps a soft edge: further out it is fully transparent,
    # so the noise of a photo that was never normalised leaves no specks.
    band = 3 if auto_background else 7  # a noisy photo's shadow is not part of the edge
    garment = Image.fromarray(np.where(background, 0, 255).astype('uint8')).filter(ImageFilter.MaxFilter(band))
    alpha = np.where(background & (np.asarray(garment) == 0), 0.0, alpha)
    mask = Image.fromarray((alpha * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6))
    out = image.convert('RGBA')
    out.putalpha(mask)
    return out.crop(mask.point(lambda v: 255 if v > 8 else 0).getbbox())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out_dir')
    parser.add_argument('items', nargs='+', help='name=path-or-url')
    parser.add_argument('--thresh', type=int, default=18)
    parser.add_argument('--bg', choices=['studio', 'auto'], default='studio')
    args = parser.parse_args()
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for item in args.items:
        name, source = item.split('=', 1)
        result = cut(load(source), args.thresh, args.bg == 'auto')
        result.save(out_dir / f'{name}.png')
        print(name, result.size)


if __name__ == '__main__':
    main()
