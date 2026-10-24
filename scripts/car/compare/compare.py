#!/usr/bin/env python3
"""
Step 06 automated visual comparison: reference image vs. actual GLB render, per camera view.

  python3 scripts/car/compare/compare.py <renderDir> <outDir> [--views rear0,side90,...] [--tag after]

For every view in scripts/car/compare/refs.json:
  1. Segment the car in the reference (OpenCV GrabCut inside the given box; the master's white
     background is pre-marked as background). Masks are cached in <outDir>/refmask_<view>.png.
  2. Take the render's silhouette (<renderDir>/<view>_mask.png, black car on white).
  3. Align render to reference with ONE uniform scale + translation (no stretching):
     'bbox' = same silhouette height, centred on the reference bbox; 'left' = same height, ground and
     nose aligned (the side reference is cropped at the tail).
  4. Metrics: silhouette IoU, aspect-ratio difference (w/h), silhouette-edge error (mean distance from
     reference contour to render contour, as % of car height), row/column profile errors (where the
     silhouettes differ most: roof, shoulders, tyres...).
  5. Images: side-by-side (reference | render, same scale), semi-transparent overlay, difference
     (red = reference only, blue = render only, grey = both).
Geometry only: colours, lighting and background never enter a metric.
"""
import json, sys, os
import numpy as np
import cv2

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
REFS = json.load(open(os.path.join(ROOT, 'scripts/car/compare/refs.json')))


def arg(k, d=None):
    for a in sys.argv:
        if a.startswith(f'--{k}='):
            return a.split('=', 1)[1]
    return d


def segment(view, cfg, out_dir):
    cache = os.path.join(out_dir, f'refmask_{view}.png')
    img = cv2.imread(os.path.join(ROOT, cfg['file']), cv2.IMREAD_COLOR)
    if cfg.get('mirror'):
        img = cv2.flip(img, 1)  # mirrored reference (symmetric car)
    if os.path.exists(cache):
        return img, cv2.imread(cache, cv2.IMREAD_GRAYSCALE) > 127
    h, w = img.shape[:2]
    scale = 1
    if max(h, w) < 700:  # small concept crops: upsample so GrabCut has enough pixels
        scale = 3
        img_s = cv2.resize(img, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)
    else:
        img_s = img
    x0, y0, x1, y1 = [v * scale for v in cfg['rect']]
    mask = np.full(img_s.shape[:2], cv2.GC_BGD, np.uint8)
    mask[y0:y1, x0:x1] = cv2.GC_PR_FGD
    # v4.4 (Step 07): documented seed polygons (original-image pixels) where GrabCut alone fails on the
    # night concepts — dark glass roofs against a dark sky (sure car) and wet-road reflections (sure road)
    for key, val in (('fg', cv2.GC_FGD), ('bg', cv2.GC_BGD)):
        for poly in cfg.get(key, []):
            cv2.fillPoly(mask, [np.array(poly, np.int32) * scale], val)
    if view == 'rear0':
        # white studio background: near-white pixels connected to the border are background
        white = (img_s.min(axis=2) > 238).astype(np.uint8)
        n, lab = cv2.connectedComponents(white)
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
        for b in border:
            if b:
                mask[lab == b] = cv2.GC_BGD
        # soft ground shadow below the tyres is background
        mask[int(965 * scale):, :] = cv2.GC_BGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img_s, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    m = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    # keep the largest component, fill holes (glass, wheels) → solid silhouette
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        m = (lab == k).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    solid = np.zeros_like(m)
    cv2.drawContours(solid, cnts, -1, 1, -1)
    if scale != 1:
        solid = cv2.resize(solid, (w, h), interpolation=cv2.INTER_NEAREST)
    if cfg.get('ground'):
        solid[cfg['ground'] + 1:, :] = 0  # shadow / reflection below the tyre contact
    for poly in cfg.get('erase', []):  # documented exclusions (e.g. the master's mirrors)
        cv2.fillPoly(solid, [np.array(poly, np.int32)], 0)
    cv2.imwrite(cache, solid * 255)
    return img, solid > 0


def bbox(m):
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def contour(m):
    cnts, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return max(cnts, key=cv2.contourArea)[:, 0, :] if cnts else np.zeros((0, 2))


def compare(view, cfg, render_dir, out_dir, tag):
    img, ref = segment(view, cfg, out_dir)
    rmask_img = cv2.imread(os.path.join(render_dir, f'{view}_mask.png'), cv2.IMREAD_GRAYSCALE)
    rshade = cv2.imread(os.path.join(render_dir, f'{view}_shade.png'), cv2.IMREAD_COLOR)
    ren = rmask_img < 128
    rx0, ry0, rx1, ry1 = bbox(ref)
    qx0, qy0, qx1, qy1 = bbox(ren)
    s = (ry1 - ry0) / (qy1 - qy0)
    if cfg['anchor'] == 'left':
        tx = rx0 - qx0 * s
        ty = ry1 - qy1 * s
    else:
        tx = (rx0 + rx1) / 2 - (qx0 + qx1) / 2 * s
        ty = ry1 - qy1 * s
    M = np.float32([[s, 0, tx], [0, s, ty]])
    H, W = ref.shape
    ren_a = cv2.warpAffine(ren.astype(np.uint8), M, (W, H), flags=cv2.INTER_NEAREST) > 0
    shade_a = cv2.warpAffine(rshade, M, (W, H), flags=cv2.INTER_AREA, borderValue=(241, 242, 244))
    region = np.zeros_like(ref)
    x0, y0, x1, y1 = cfg['rect']
    region[y0:y1, x0:x1] = True
    if cfg['anchor'] == 'left':
        region[:, rx1 - 2:] = False  # the reference is cropped at the image edge: compare only inside it
    a, b = ref & region, ren_a & region
    iou = float((a & b).sum() / max(1, (a | b).sum()))
    # aspect ratio (w / h) of the full silhouettes (side: the reference is cropped, so n/a)
    ar_ref = (rx1 - rx0) / (ry1 - ry0)
    bx0, by0, bx1, by1 = bbox(ren_a)
    ar_ren = (bx1 - bx0) / (by1 - by0)
    # edge error: mean distance from each reference contour point to the render contour, % of height
    dist = cv2.distanceTransform((~(cv2.Canny(b.astype(np.uint8) * 255, 50, 150) > 0)).astype(np.uint8), cv2.DIST_L2, 3)
    cref = contour(a)
    keep = cref[(cref[:, 0] < rx1 - 3)] if cfg['anchor'] == 'left' else cref
    edge = float(np.mean(dist[keep[:, 1], keep[:, 0]]) / (ry1 - ry0) * 100) if len(keep) else 0
    p95 = float(np.percentile(dist[keep[:, 1], keep[:, 0]], 95) / (ry1 - ry0) * 100) if len(keep) else 0
    # where they differ: per horizontal band (top→bottom, 10 bands) the width difference in % of width
    bands = []
    hh = ry1 - ry0
    for i in range(10):
        ya, yb = int(ry0 + hh * i / 10), int(ry0 + hh * (i + 1) / 10)
        wr = a[ya:yb].any(axis=0).sum()
        wn = b[ya:yb].any(axis=0).sum()
        bands.append(round(float((wn - wr) / max(1, rx1 - rx0) * 100), 1))
    # images ------------------------------------------------------------------------------------
    pad = 12
    crop = lambda im: im[max(0, ry0 - pad * 3):min(H, ry1 + pad * 3), max(0, min(rx0, bx0) - pad * 3):min(W, max(rx1, bx1) + pad * 3)]
    ref_c, shade_c = crop(img), crop(shade_a)
    th = 520
    k = th / ref_c.shape[0]
    rs = lambda im: cv2.resize(im, (int(im.shape[1] * k), th), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
    sbs = np.concatenate([rs(ref_c), np.full((th, 8, 3), 255, np.uint8), rs(shade_c)], axis=1)
    over = img.copy().astype(np.float32)
    over = over * 0.55 + 0.45 * shade_a.astype(np.float32)
    edge_img = cv2.Canny(ren_a.astype(np.uint8) * 255, 50, 150) > 0
    edge_img = cv2.dilate(edge_img.astype(np.uint8), np.ones((2, 2), np.uint8)) > 0
    over[edge_img] = (255, 200, 0)
    over = rs(crop(over.astype(np.uint8)))
    diff = np.full((H, W, 3), 255, np.uint8)
    diff[a & b] = (170, 170, 170)
    diff[a & ~b] = (40, 40, 230)  # red: reference only (render too small there)
    diff[~a & b] = (230, 120, 30)  # blue: render only (render too big there)
    diff = rs(crop(diff))
    cv2.imwrite(os.path.join(out_dir, f'{view}_{tag}_sbs.png'), sbs)
    cv2.imwrite(os.path.join(out_dir, f'{view}_{tag}_overlay.png'), over)
    cv2.imwrite(os.path.join(out_dir, f'{view}_{tag}_diff.png'), diff)
    return {
        'view': view, 'label': cfg['label'], 'iou': round(iou, 3), 'edge_mean_pct_h': round(edge, 2), 'edge_p95_pct_h': round(p95, 2),
        'aspect_ref': round(ar_ref, 3) if cfg['anchor'] != 'left' else None, 'aspect_render': round(ar_ren, 3) if cfg['anchor'] != 'left' else None,
        'band_width_diff_pct': bands,
    }


def main():
    render_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    tag = arg('tag', 'cmp')
    views = arg('views', ','.join(k for k in REFS if not k.startswith('_'))).split(',')
    res = {}
    for v in views:
        if not os.path.exists(os.path.join(render_dir, f'{v}_mask.png')):
            continue
        res[v] = compare(v, REFS[v], render_dir, out_dir, tag)
        r = res[v]
        print(f"{v:7s} IoU {r['iou']:.3f}  edge {r['edge_mean_pct_h']:.2f}% (p95 {r['edge_p95_pct_h']:.1f}%)  aspect ref {r['aspect_ref']} / render {r['aspect_render']}  bands {r['band_width_diff_pct']}")
    json.dump(res, open(os.path.join(out_dir, f'metrics_{tag}.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
