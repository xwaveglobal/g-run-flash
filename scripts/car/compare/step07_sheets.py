#!/usr/bin/env python3
"""
Step 07 figures from the comparison / gameplay runs:
  python3 scripts/car/compare/step07_sheets.py <cmp_s6> <cmp_s7> <play6> <play7> <side_dir> <outDir>
Writes xwave_step07_gameplay_comparison.png, xwave_step07_geometry_contact_sheet.png,
xwave_step07_roof_glass_comparison.png, step07_view_<view>.png (Step 06 vs Step 07 per view).
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
from compose import text, row, stack  # noqa: E402

c6, c7, p6, p7, side, out = sys.argv[1:7]
os.makedirs(out, exist_ok=True)
L = lambda p: Image.open(p).convert('RGB')
crop = lambda im, f=0.06: im.crop((int(im.width * f), int(im.height * f), int(im.width * (1 - f)), int(im.height * (1 - f))))
m6 = json.load(open(os.path.join(c6, 'metrics_s6.json')))
m7 = json.load(open(os.path.join(c7, 'metrics_s7.json')))


def mline(m):
    s = f"IoU {m['iou']:.3f} · edge {m['edge_mean_pct_h']:.2f} % (p95 {m['edge_p95_pct_h']:.1f} %)"
    if m.get('aspect_ref'):
        s += f" · aspect {m['aspect_render']:.3f} (ref {m['aspect_ref']:.3f})"
    return s


# per-view Step 06 vs Step 07 (reference | render | overlay | diff)
for v, title in [('rear0', 'Rear 0° vs ORIGINAL MASTER'), ('rl45', 'Rear-left 3/4 vs concept 01'), ('rr45', 'Rear-right 3/4 vs concept 01 mirrored'), ('side90', 'Side 90° vs concept 04'), ('front0', 'Front 0° vs concept 03'), ('fl45', 'Front 3/4 vs concept 02'), ('top', 'Top vs concept 05')]:
    parts = [text(title + ' — Step 06 vs Step 07 (same frozen camera, same masks)', 26, True)]
    for tag, d, m in (('s6', c6, m6), ('s7', c7, m7)):
        parts.append(text(('STEP 06  ' if tag == 's6' else 'STEP 07  ') + mline(m[v]), 19, True, color=(110, 110, 120) if tag == 's6' else (20, 24, 33)))
        parts.append(row([L(os.path.join(d, f'{v}_{tag}_sbs.png')), L(os.path.join(d, f'{v}_{tag}_overlay.png')), L(os.path.join(d, f'{v}_{tag}_diff.png'))], 280))
    stack(parts).save(os.path.join(out, f'step07_view_{v}.png'))

# gameplay: the real game build, 9 states, Step 06 vs Step 07 (full frame + car close-up)
states = ['01_normal', '02_lane_left', '03_lane_right', '04_jump_takeoff', '05_airborne', '06_landing', '07_turbo', '08_shield', '09_top_speed']
st6 = json.load(open(os.path.join(p6, 'state.json')))
st7 = json.load(open(os.path.join(p7, 'state.json')))


def car_crop(im, s):
    W, H = im.size
    # around the car (lane x shifts it sideways; jumps lift it)
    cx = 0.48 + s.get('x', 0) * 0.075
    cy = 0.62 - (s.get('y', 1) - 1) * 0.045
    return im.crop((int(W * (cx - 0.25)), int(H * (cy - 0.11)), int(W * (cx + 0.25)), int(H * (cy + 0.11))))


rows = [text('Actual game build (H5), 360 × 640 CSS px @2 = 720 × 1280, BALANCED camera, MEDIUM — Step 06 (left pair) vs Step 07 (right pair)', 24, True)]
for s in states:
    a, b = L(os.path.join(p6, s + '.png')), L(os.path.join(p7, s + '.png'))
    rows.append(text(s.replace('_', ' ')[3:].upper(), 18, True))
    rows.append(row([a.resize((270, 480)), car_crop(a, st6.get(s, {})).resize((540, 268)), b.resize((270, 480)), car_crop(b, st7.get(s, {})).resize((540, 268))], 300))
g = stack(rows)
g.save(os.path.join(out, 'xwave_step07_gameplay_comparison.png'))

# roof and rear glass: top view, gameplay close-up, rear 3/4 — Step 06 vs Step 07
parts = [text('Roof and rear glass — Step 06 vs Step 07', 26, True)]
parts.append(row([crop(L(os.path.join(c6, 'render/top_shade.png'))), crop(L(os.path.join(c7, 'render/top_shade.png')))], 520))
parts.append(row([car_crop(L(os.path.join(p6, '01_normal.png')), st6.get('01_normal', {})), car_crop(L(os.path.join(p7, '01_normal.png')), st7.get('01_normal', {}))], 300))
parts.append(row([crop(L(os.path.join(c6, 'render/rl45_shade.png'))), crop(L(os.path.join(c7, 'render/rl45_shade.png')))], 320))
parts.append(text('left: Step 06 · right: Step 07 — top (orthographic), real gameplay close-up, rear 3/4 studio', 16, color=(90, 90, 100)))
stack(parts).save(os.path.join(out, 'xwave_step07_roof_glass_comparison.png'))

# contact sheet: every studio view + gameplay normal, Step 06 row / Step 07 row
views = ['rear0', 'rl45', 'rr45', 'side90', 'front0', 'fl45', 'top']
parts = [text('Geometry contact sheet — actual GLBs, neutral studio light (gameplay frame: real game build)', 26, True)]
for tag, d, p, stx in (('STEP 06', c6, p6, st6), ('STEP 07', c7, p7, st7)):
    parts.append(text(tag, 20, True))
    ims = [crop(L(os.path.join(d, f'render/{v}_shade.png'))) for v in views] + [car_crop(L(os.path.join(p, '01_normal.png')), stx.get('01_normal', {}))]
    parts.append(row(ims[:4], 230))
    parts.append(row(ims[4:], 230))
stack(parts).save(os.path.join(out, 'xwave_step07_geometry_contact_sheet.png'))
print('ok')
