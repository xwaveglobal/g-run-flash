#!/usr/bin/env python3
"""
Step 07 camera calibration for a perspective concept reference: grid search over azimuth, elevation and
field of view, scoring silhouette IoU of a FIXED model (the Step 06 rollback GLB) against the reference
mask. The chosen camera is then frozen and used for every model — so a better score later comes from
geometry, not from re-fitting the camera to the new model.
  python3 scripts/car/compare/calibrate.py <view> <glb> <workDir> "az1,az2,…" "el1,…" "fov1,…"
"""
import json, os, subprocess, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import compare as C

view, glb, work = sys.argv[1:4]
azs = [float(a) for a in sys.argv[4].split(',')]
els = [float(a) for a in sys.argv[5].split(',')]
fovs = [float(a) for a in sys.argv[6].split(',')]
os.makedirs(work, exist_ok=True)
jobs = []
for az in azs:
    for el in els:
        for fv in fovs:
            jobs.append(dict(src=glb, name=f'c_{az}_{el}_{fv}_mask', view=view, az=az, elev=el, fov=fv, mode='mask', w=1000, h=700))
json.dump(jobs, open(os.path.join(work, 'jobs.json'), 'w'))
subprocess.run(['node', os.path.join(C.ROOT, 'scripts/car/studio-x1.mjs'), work, os.path.join(work, 'jobs.json')], check=True, stdout=subprocess.DEVNULL)
cfg = C.REFS[view]
_, ref = C.segment(view, cfg, work)
res = []
for j in jobs:
    ren = cv2.imread(os.path.join(work, j['name'] + '.png'), 0) < 128
    rx0, ry0, rx1, ry1 = C.bbox(ref)
    qx0, qy0, qx1, qy1 = C.bbox(ren)
    s = (ry1 - ry0) / (qy1 - qy0)
    M = np.float32([[s, 0, (rx0 + rx1) / 2 - (qx0 + qx1) / 2 * s], [0, s, ry1 - qy1 * s]])
    a = cv2.warpAffine(ren.astype(np.uint8), M, (ref.shape[1], ref.shape[0]), flags=cv2.INTER_NEAREST) > 0
    iou = float((a & ref).sum() / max(1, (a | ref).sum()))
    res.append((iou, j['az'], j['elev'], j['fov']))
res.sort(reverse=True)
for r in res[:8]:
    print('IoU %.3f  az %.0f  elev %.0f  fov %.0f' % r)
json.dump([dict(iou=r[0], az=r[1], elev=r[2], fov=r[3]) for r in res], open(os.path.join(work, 'calibration.json'), 'w'), indent=1)
