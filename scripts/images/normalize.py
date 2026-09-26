"""Normalizes studio product photos to the store's line: exact #F4F4F4 background, 1254 x 1254, product
centered and scaled to ~95% of the height (at most 90% of the width). Product pixels are only scaled.
Usage: python3 scripts/images/normalize.py <in_dir> <out_dir> [--force]  (reads *.png / *.jpg, writes <name>.png)
Prints one JSON line per image with the detected background, box and flags."""
import glob, json, os, sys
import cv2
import numpy as np
from PIL import Image

TARGET = np.array([244.0, 244.0, 244.0])
CANVAS = 1254
FILL_H, FILL_W = 0.95, 0.90

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)


def normalize(path):
    name = os.path.splitext(os.path.basename(path))[0]
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    h, w, _ = im.shape
    border = np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3), im[:, :8].reshape(-1, 3), im[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    spread = float(np.abs(border - bg).max(axis=1).mean())
    dist = np.abs(im - bg).max(axis=2)

    # Product box. A white garment differs from the light background by only a few levels and is often
    # held by a thin outline, so the fine mask (low threshold, no speck removal) finds its full extent;
    # the coarse mask (specks removed) is the fallback when the fine one reaches frame edges the coarse
    # one does not, which means background noise rather than garment.
    boxes = []
    for threshold, opening in ((4, False), (6, True)):
        mask = (dist > threshold).astype(np.uint8)
        if opening:
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
        keep = [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] > 0.0015 * h * w]
        if not keep:
            boxes.append(None)
            continue
        boxes.append((min(stats[i, cv2.CC_STAT_LEFT] for i in keep),
                      min(stats[i, cv2.CC_STAT_TOP] for i in keep),
                      max(stats[i, cv2.CC_STAT_LEFT] + stats[i, cv2.CC_STAT_WIDTH] for i in keep),
                      max(stats[i, cv2.CC_STAT_TOP] + stats[i, cv2.CC_STAT_HEIGHT] for i in keep)))
    edges = lambda b: {side for side, hit in (('top', b[1] <= 2), ('bottom', b[3] >= h - 2), ('left', b[0] <= 2),
                                               ('right', b[2] >= w - 2)) if hit}
    fine, coarse = boxes
    if fine is None and coarse is None:
        return {'name': name, 'error': 'no product found'}
    noisy = fine is not None and coarse is not None and not edges(fine) <= edges(coarse)
    x0, y0, x1, y1 = coarse if (fine is None or noisy) else fine
    touches = sorted(edges((x0, y0, x1, y1)))

    # Shift the background (and only the background) to the exact target colour.
    alpha = np.clip((dist - 3.0) / 15.0, 0.0, 1.0)[..., None]
    recolored = np.clip(im + (1.0 - alpha) * (TARGET - bg), 0, 255)

    crop = recolored[y0:y1, x0:x1]
    bw, bh = x1 - x0, y1 - y0
    scale = min(FILL_H * CANVAS / bh, FILL_W * CANVAS / bw)
    nw, nh = max(1, round(bw * scale)), max(1, round(bh * scale))
    resized = np.asarray(Image.fromarray(crop.astype(np.uint8)).resize((nw, nh), Image.LANCZOS))
    canvas = np.empty((CANVAS, CANVAS, 3), np.uint8)
    canvas[:] = TARGET.astype(np.uint8)
    left = (CANVAS - nw) // 2
    top = (CANVAS - nh) // 2
    # A garment the model cut at the frame edge stays anchored to that edge instead of floating.
    if 'bottom' in touches and 'top' not in touches:
        top = CANVAS - nh
    elif 'top' in touches and 'bottom' not in touches:
        top = 0
    canvas[top:top + nh, left:left + nw] = resized
    Image.fromarray(canvas).save(os.path.join(dst, name + '.png'), optimize=True)
    return {'name': name, 'bg': [round(float(c)) for c in bg], 'bg_spread': round(spread, 1),
            'box': [int(x0), int(y0), int(x1), int(y1)], 'size': [w, h],
            'fill': [round(nw / CANVAS, 2), round(nh / CANVAS, 2)], 'touches': touches,
            'mask': 'coarse' if (fine is None or noisy) else 'fine'}


for path in sorted(glob.glob(os.path.join(src, '*.png')) + glob.glob(os.path.join(src, '*.jpg'))):
    target = os.path.join(dst, os.path.splitext(os.path.basename(path))[0] + '.png')
    if os.path.exists(target) and '--force' not in sys.argv:
        continue
    print(json.dumps(normalize(path)), flush=True)
