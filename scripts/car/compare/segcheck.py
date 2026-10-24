#!/usr/bin/env python3
"""Step 07: re-segment every reference (no cache) and write an overlay of each mask (yellow outline,
outside darkened) so the reference silhouettes themselves can be reviewed.
  python3 scripts/car/compare/segcheck.py <outDir>"""
import os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import compare as C

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
tiles = []
for v, cfg in C.REFS.items():
    if v.startswith('_'):
        continue
    cache = os.path.join(out, f'refmask_{v}.png')
    if os.path.exists(cache):
        os.remove(cache)
    img, m = C.segment(v, cfg, out)
    vis = img.copy()
    vis[~m] = (vis[~m] * 0.25).astype(np.uint8)
    e = cv2.dilate((cv2.Canny(m.astype(np.uint8) * 255, 50, 150) > 0).astype(np.uint8), np.ones((2, 2), np.uint8)) > 0
    vis[e] = (0, 255, 255)
    for key, col in (('fg', (0, 200, 0)), ('bg', (0, 0, 230))):
        for poly in cfg.get(key, []):
            cv2.polylines(vis, [np.array(poly, np.int32)], True, col, 1)
    h = 300
    tiles.append(cv2.resize(vis, (int(vis.shape[1] * h / vis.shape[0]), h)))
cv2.imwrite(os.path.join(out, 'reference_masks.png'), np.concatenate(tiles, axis=1))
print('ok')
