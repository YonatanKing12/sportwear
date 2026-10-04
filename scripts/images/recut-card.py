"""Cuts a studio photo's garment out for a collector card (sections/collection-circles.liquid), cleaner than
cutout.py on the dark cards: no light outline, no specks, no halo.

mode flood: the background is what a flood fill from the border reaches within <cut> of its colour (white
            and light garments; use 3-4).
mode lum:   the garment is everything darker than luminance <cut> (dark garments on a light shadow; ~165).
mode grey:  the background is the grey (chroma under 14) brighter than luminance <cut> that touches the border
            (coloured garments on a background that darkens towards them, where flood leaves a light rim; ~160).
mode auto:  flood (thresh 4) and grey (<cut>) together: the studio renders sit in a soft grey shadow 5-8 px wide
            that flood keeps as a light rim, and grey takes white parts of the garment with it. Auto removes the
            grey only within 10 px of what flood calls background (20 px where it is darker than a white trim, as
            under the hem), and keeps it next to flat grey or white areas thicker than ~12 px (a white jersey, a silver
            side panel, a collar), so a
            white stripe that runs to the edge of a sleeve loses at most its last few pixels. The default for the cards of 2026-10-04.
Then the largest piece is kept, holes inside it are filled (logos, light trim), it is eroded by <erode> px
(the renderer's light outline), the edge is softened over ~1 px and the background colour is un-mixed from
the edge pixels, so nothing light shows around the jersey on a dark card.

Usage: python3 scripts/images/recut-card.py <photo.png> <out.png> flood|lum|grey|auto <cut> <erode>
Used on 2026-09-28 for the Arsenal (flood 4 2), Golden State (flood 3 1) and Juventus (lum 165 1) cards.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import cv2

def flood_fg(im, thresh):
    w, h = im.size
    probe = im.copy()
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        ImageDraw.floodfill(probe, (x, y), (255, 0, 255), thresh=thresh)
    return (~np.all(np.asarray(probe) == [255, 0, 255], axis=2)).astype('uint8')


def grey_fg(px, thresh):
    lum = px @ np.array([0.299, 0.587, 0.114])
    grey = ((px.max(axis=2) - px.min(axis=2)) < 14) & (lum > thresh)
    n0, lab0 = cv2.connectedComponents(grey.astype('uint8'), connectivity=4)
    edge = set(np.unique(np.concatenate([lab0[0], lab0[-1], lab0[:, 0], lab0[:, -1]]))) - {0}
    return (~np.isin(lab0, list(edge))).astype('uint8')


def recut(src, out, mode, thresh, erode):
    im = Image.open(src).convert('RGB')
    px = np.asarray(im).astype(float)
    h, w = px.shape[:2]
    border = np.concatenate([px[0], px[-1], px[:, 0], px[:, -1]])
    bg = np.median(border, axis=0)
    if mode == 'flood':
        fg = flood_fg(im, thresh)
    elif mode == 'grey':
        fg = grey_fg(px, thresh)
    elif mode == 'auto':
        flood = flood_fg(im, 4)
        grey_bg = (flood & ~grey_fg(px, thresh).astype(bool)).astype('uint8')
        # the shadow is 5-8 px wide at the sides and up to ~16 px under the hem, where it gets darker than a
        # white trim: light grey goes up to 10 px in, darker grey up to 20 px
        dist = cv2.distanceTransform(flood, cv2.DIST_L2, 5)
        lum = px @ np.array([0.299, 0.587, 0.114])
        halo = (grey_bg & ((dist <= 10) | ((dist <= 20) & (lum < 232)))).astype('uint8')
        disk = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
        # grey that belongs to the garment is flat (a white jersey, a silver side panel); the shadow is a slope
        smooth = cv2.GaussianBlur(lum.astype(np.float32), (0, 0), 1.2)
        slope = np.hypot(cv2.Sobel(smooth, cv2.CV_32F, 1, 0), cv2.Sobel(smooth, cv2.CV_32F, 0, 1)) / 8
        core = cv2.erode((grey_bg & (slope < 1.5)).astype('uint8'), disk(6))
        halo &= ~cv2.dilate(core, disk(9)).astype(bool)
        fg = (flood & ~halo.astype(bool)).astype('uint8')
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
