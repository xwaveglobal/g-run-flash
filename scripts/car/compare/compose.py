#!/usr/bin/env python3
"""
Step 06: lay out the reference-matching deliverables from two compare runs (before / after).

  python3 scripts/car/compare/compose.py <beforeDir> <afterDir> <outDir>

Each <dir> is the output of scripts/car/compare/run.sh (render/*, <view>_<tag>_{sbs,overlay,diff}.png,
metrics_<tag>.json). Writes 01–08 into <outDir>.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f = lambda s, b=False: ImageFont.truetype(BOLD if b else FONT, s)


def fit(im, h):
    return im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)


def row(images, h, gap=10):
    ims = [fit(i, h) for i in images]
    out = Image.new('RGB', (sum(i.width for i in ims) + gap * (len(ims) - 1), h), 'white')
    x = 0
    for i in ims:
        out.paste(i, (x, 0))
        x += i.width + gap
    return out


def stack(parts, pad=16, bg='white'):
    w = max(p.width for p in parts) + pad * 2
    h = sum(p.height for p in parts) + pad * (len(parts) + 1)
    out = Image.new('RGB', (w, h), bg)
    y = pad
    for p in parts:
        out.paste(p, (pad, y))
        y += p.height + pad
    return out


def text(s, size=22, bold=False, w=None, color=(20, 24, 33)):
    ft = f(size, bold)
    lines = s.split('\n')
    tw = max(ft.getbbox(l)[2] for l in lines) + 4
    im = Image.new('RGB', (w or tw, int(size * 1.35 * len(lines)) + 4), 'white')
    d = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        d.text((0, i * size * 1.35), l, font=ft, fill=color)
    return im


def metric_line(m):
    a = f"IoU {m['iou']:.3f} · edge error {m['edge_mean_pct_h']:.2f} % of height (p95 {m['edge_p95_pct_h']:.1f} %)"
    if m.get('aspect_ref'):
        a += f" · aspect w/h ref {m['aspect_ref']:.3f} / 3D {m['aspect_render']:.3f}"
    return a


def view_panel(view, title, bd, ad, mb, ma, h=300):
    parts = [text(title, 28, True)]
    for tag, d, m in (('BEFORE  v4.2 model', bd, mb), ('AFTER  v4.3 model (Step 06)', ad, ma)):
        t = 'before' if 'BEFORE' in tag else 'after'
        sbs = Image.open(os.path.join(d, f'{view}_{t}_sbs.png'))
        ov = Image.open(os.path.join(d, f'{view}_{t}_overlay.png'))
        df = Image.open(os.path.join(d, f'{view}_{t}_diff.png'))
        parts.append(text(f'{tag}  —  {metric_line(m)}', 20, True, color=(20, 24, 33) if t == 'after' else (110, 110, 120)))
        parts.append(row([sbs, ov, df], h))
    parts.append(text('left: reference | actual GLB render (same scale)   middle: overlay, yellow = 3D silhouette edge   right: red = reference only, blue = 3D only, grey = both', 16, color=(90, 90, 100)))
    return stack(parts)


def main():
    bd, ad, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    mb = json.load(open(os.path.join(bd, 'metrics_before.json')))
    ma = json.load(open(os.path.join(ad, 'metrics_after.json')))
    # 01: original master vs 3D, big, after only + before small
    master = Image.open(os.path.join(os.path.dirname(__file__), '../../../assets-src/x1/XWAVE_REAR_0_MASTER_DO_NOT_OVERRIDE.png')).convert('RGB')
    sb = Image.open(os.path.join(bd, 'rear0_before_sbs.png'))
    sa = Image.open(os.path.join(ad, 'rear0_after_sbs.png'))
    p01 = stack([
        text('01 · Original XWAVE rear master (authoritative) vs the actual 3D GLB — rear 0°, neutral studio light', 28, True),
        text('AFTER (v4.3, Step 06)  —  ' + metric_line(ma['rear0']), 20, True),
        row([sa], 520),
        text('BEFORE (v4.2)  —  ' + metric_line(mb['rear0']), 20, True, color=(110, 110, 120)),
        row([sb], 300),
        text('Same uniform scale (silhouette height), aligned on the ground. The master\'s side mirrors are excluded from the silhouette (the approved X1 is mirrorless).', 16, color=(90, 90, 100)),
    ])
    p01.save(os.path.join(out, '01_original_rear_vs_3d.png'))
    ob = Image.open(os.path.join(bd, 'rear0_before_overlay.png'))
    oa = Image.open(os.path.join(ad, 'rear0_after_overlay.png'))
    db = Image.open(os.path.join(bd, 'rear0_before_diff.png'))
    da = Image.open(os.path.join(ad, 'rear0_after_diff.png'))
    p02 = stack([
        text('02 · Rear overlay on the master — before / after', 28, True),
        text('AFTER  —  ' + metric_line(ma['rear0']), 20, True),
        row([oa, da], 440),
        text('BEFORE  —  ' + metric_line(mb['rear0']), 20, True, color=(110, 110, 120)),
        row([ob, db], 300),
        text('overlay: 55 % master + 45 % render, yellow = 3D silhouette · diff: red = master only, blue = 3D only', 16, color=(90, 90, 100)),
    ])
    p02.save(os.path.join(out, '02_rear_overlay.png'))
    names = {
        'rl45': ('03_rear_left_45_comparison.png', '03 · Rear-left three-quarter vs concept 01 (camera ≈ 30° az, 8° up — estimated from the silhouette)'),
        'rr45': ('04_rear_right_45_comparison.png', '04 · Rear-right three-quarter vs concept 01 MIRRORED (no rear-right reference; the car is symmetric)'),
        'side90': ('05_side_profile_comparison.png', '05 · Side profile (orthographic) vs concept 04 — reference cropped at the tail; nose and ground aligned'),
        'front0': ('06_front_comparison.png', '06 · Front 0° vs concept 03 (concept shows mirrors and a wide-angle lens)'),
        'fl45': ('07_front_left_45_comparison.png', '07 · Front three-quarter vs concept 02 (camera ≈ 32° az, 7° up)'),
        'top': ('08_top_view_comparison.png', '08 · Top view (orthographic) vs concept 05'),
    }
    for v, (fn, title) in names.items():
        view_panel(v, title, bd, ad, mb[v], ma[v]).save(os.path.join(out, fn))
    # metrics table for the report
    json.dump({'before': mb, 'after': ma}, open(os.path.join(out, 'metrics.json'), 'w'), indent=1)
    print('written to', out)


if __name__ == '__main__':
    main()
