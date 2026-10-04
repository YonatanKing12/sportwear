"""Small local fixes for studio renders (scripts/images/studio.py output after normalize.py), for the mistakes the
renderer makes most often. Each command reads a PNG and writes the fixed copy; keep the original until the result has
been looked at side by side.

  python3 scripts/images/retouch.py tag <in.png> <out.png> x0 y0 x1 y1
      Covers a jock tag the renderer invented (usually on the back hem) with fabric copied from beside it, towards the
      middle of the garment. The copy keeps its own texture, takes the shading around the box (a smooth fill from the
      fabric around it, the tag left out) and is feathered over a few pixels. The box is read by hand from a zoom.

  python3 scripts/images/retouch.py hanger <in.png> <out.png> [y_from y_to]
      Removes the hanger bar a render drew inside the neck of a dark jersey: a thin purple line, sometimes with a dark
      shadow under it, found in the upper middle of the garment and inpainted from the fabric around. White jerseys
      draw the bar in navy or grey; those and a bar that crosses the neck tag are re-rendered instead. It also finds
      purple trim on purple jerseys, so look at every result before using it.

  python3 scripts/images/retouch.py browns <in.png> <out.png>
      Gives a near-black render of the Cleveland Browns' brown jersey its dark brown back: dark, colourless fabric
      pixels get the chroma of Browns brown in Lab, scaled by how dark they are; numbers, stripes, logos and tags keep
      their colours.

Used on the NFL import of 2026-10-04 (catalog/sources/nfl-cyq888/README.md).
"""
import sys

import cv2
import numpy as np

BG = 244  # the normalized background (#F4F4F4)


def garment_mask(f):
    return np.abs(f - BG).max(axis=2) > 6


def cover_tag(im, x0, y0, x1, y1, feather=5, sigma=14):
    f = im.astype(np.float32)
    h, w = im.shape[:2]
    garment = garment_mask(f).astype(np.float32)
    garment = cv2.erode(garment, np.ones((9, 9), np.uint8))  # keep the background and the edge shading out
    bx0, by0, bx1, by1 = x0 - feather, y0 - feather, x1 + feather, y1 + feather
    bw, bh = bx1 - bx0, by1 - by0
    shift = bw + 16
    sx0 = bx0 - shift if (x0 + x1) / 2 > w / 2 else bx0 + shift
    known = garment.copy()
    known[y0:y1, x0:x1] = 0

    def smooth(mask):
        num = cv2.GaussianBlur(f * mask[..., None], (0, 0), sigma)
        den = cv2.GaussianBlur(mask, (0, 0), sigma)[..., None]
        return num / np.maximum(den, 1e-3)

    low_dst = smooth(known)[by0:by1, bx0:bx1]
    low_src = smooth(garment)[by0:by1, sx0:sx0 + bw]
    patch = f[by0:by1, sx0:sx0 + bw] - low_src + low_dst
    alpha = np.zeros((bh, bw), np.float32)
    alpha[feather:-feather, feather:-feather] = 1
    alpha = cv2.GaussianBlur(alpha, (0, 0), feather / 2)
    alpha[feather + 2:-feather - 2, feather + 2:-feather - 2] = 1
    out = f.copy()
    out[by0:by1, bx0:bx1] = out[by0:by1, bx0:bx1] * (1 - alpha[..., None]) + patch * alpha[..., None]
    return np.clip(out, 0, 255).round().astype(np.uint8), sx0


def remove_hanger(im, y_range=None):
    h, w = im.shape[:2]
    f = im.astype(int)
    B, G, R = f[..., 0], f[..., 1], f[..., 2]
    ys, _ = np.where(garment_mask(f))
    top = ys.min()
    y0, y1 = y_range or (top + 40, top + 320)
    x0, x1 = int(w * 0.33), int(w * 0.67)
    band = np.zeros((h, w), bool)
    band[y0:y1, x0:x1] = True
    purple = (B - G > 20) & (R - G > 8) & (B > 60)
    cand = cv2.morphologyEx((purple & band).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 9), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(cand, 8)
    mask = np.zeros((h, w), np.uint8)
    found = []
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if bw >= 40 and bh <= 10 and area >= bw * 1.2:
            mask[labels == i] = 255
            found.append((int(x), int(y), int(bw), int(bh)))
    if not found:
        return None, found
    V = f.max(axis=2)
    for x, y, bw, bh in found:  # the bar's dark shadow just under it
        ref = np.median(V[max(0, y - 8):y - 3, x:x + bw])
        for yy in range(y + bh, min(h, y + bh + 7)):
            row = V[yy, x:x + bw] < ref - 45
            if row.mean() < 0.4:
                break
            mask[yy, x:x + bw][row] = 255
    near = cv2.dilate(mask, np.ones((7, 7), np.uint8)) > 0  # the line's purple fringe
    mask[near & (B - G > 8) & (R - G > 3) & (B > 35)] = 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=2)
    return cv2.inpaint(im, mask, 5, cv2.INPAINT_TELEA), found


def browns_brown(im, target_a=7.0, target_b=15.0):
    lab = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)
    a, b = lab[..., 1] - 128, lab[..., 2] - 128
    f = im.astype(int)
    V = f.max(axis=2)
    chroma = np.sqrt(a ** 2 + b ** 2)
    w = np.clip((130 - V) / 50.0, 0, 1) * np.clip((22 - chroma) / 10.0, 0, 1) * garment_mask(f)
    w = cv2.GaussianBlur(w.astype(np.float32), (0, 0), 1.2)
    lab[..., 1] = 128 + a * (1 - w) + target_a * w
    lab[..., 2] = 128 + b * (1 - w) + target_b * w
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


def main():
    if len(sys.argv) < 4 or sys.argv[1] not in ('tag', 'hanger', 'browns'):
        sys.exit(__doc__)
    cmd, src, dst = sys.argv[1:4]
    im = cv2.imread(src)
    if cmd == 'tag':
        x0, y0, x1, y1 = map(int, sys.argv[4:8])
        out, sx0 = cover_tag(im, x0, y0, x1, y1)
        print('tag covered', src, (x0, y0, x1, y1), 'fabric from x', sx0)
    elif cmd == 'hanger':
        y_range = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else None
        out, found = remove_hanger(im, y_range)
        if out is None:
            sys.exit(f'no hanger line found in {src}')
        print('hanger line removed', src, found)
    else:
        out = browns_brown(im)
        print('brown restored', src)
    cv2.imwrite(dst, out)


if __name__ == '__main__':
    main()
