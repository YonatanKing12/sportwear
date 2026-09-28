"""Cuts a studio photo's garment out for a collector card (sections/collection-circles.liquid), cleaner than
cutout.py on the dark cards: no light outline, no specks, no halo.

mode flood: the background is what a flood fill from the border reaches within <cut> of its colour (white
            and light garments; use 3-4).
mode lum:   the garment is everything darker than luminance <cut> (dark garments on a light shadow; ~165).
Then the largest piece is kept, holes inside it are filled (logos, light trim), it is eroded by <erode> px
(the renderer's light outline), the edge is softened over ~1 px and the background colour is un-mixed from
the edge pixels, so nothing light shows around the jersey on a dark card.

Usage: python3 scripts/images/recut-card.py <photo.png> <out.png> flood|lum <cut> <erode>
Used on 2026-09-28 for the Arsenal (flood 4 2), Golden State (flood 3 1) and Juventus (lum 165 1) cards.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import cv2

def recut(src, out, mode, thresh, erode):
    im = Image.open(src).convert('RGB')
    px = np.asarray(im).astype(float)
    h, w = px.shape[:2]
    border = np.concatenate([px[0], px[-1], px[:, 0], px[:, -1]])
    bg = np.median(border, axis=0)
    if mode == 'flood':
        probe = im.copy()
        for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
            ImageDraw.floodfill(probe, (x, y), (255, 0, 255), thresh=thresh)
        fg = (~np.all(np.asarray(probe) == [255, 0, 255], axis=2)).astype('uint8')
    else:
        lum = px @ np.array([0.299, 0.587, 0.114])
        fg = (lum < thresh).astype('uint8')
    n, labels, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    fg = (labels == big).astype('uint8')
    # fill every hole not connected to the border (logos, light details inside the garment)
    inv = (1 - fg).astype('uint8')
    n2, labels2, stats2, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    for i in range(1, n2):
        x, y, ww, hh, a = stats2[i]
        if not (x == 0 or y == 0 or x + ww >= w or y + hh >= h):
            fg[labels2 == i] = 1
    if erode:
        fg = cv2.erode(fg, np.ones((2 * erode + 1, 2 * erode + 1), np.uint8))
    alpha = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 0.8)
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    a = alpha[..., None]
    with np.errstate(divide='ignore', invalid='ignore'):
        col = np.where(a > 0.05, (px - (1 - a) * bg) / np.maximum(a, 0.05), px)
    col = np.clip(col, 0, 255)
    out_img = Image.fromarray(col.astype('uint8'), 'RGB').convert('RGBA')
    out_img.putalpha(Image.fromarray((alpha * 255).astype('uint8')))
    bbox = out_img.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    out_img.crop(bbox).save(out)
    print(out, bbox)

if __name__ == '__main__':
    recut(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]))
