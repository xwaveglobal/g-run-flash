#!/usr/bin/env python3
"""Crop the 3D renders (scripts/car/thumbs-x1.mjs) to the car and pack them as the UI's car pictures.
   python3 scripts/car/thumbs-pack.py <renderDir> <assetDir>
   card-<id>.png → <assetDir>/<id>.webp (512 × 512), rear-<id>.png → <assetDir>/rear-<id>.webp (1024 × 588)"""
import os, sys
from PIL import Image

src, dst = sys.argv[1:3]
os.makedirs(dst, exist_ok=True)
def pack(f, size, pad):
    im = Image.open(f).convert('RGBA')
    bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(bb)
    W, H = size
    k = min(W * (1 - 2 * pad) / im.width, H * (1 - 2 * pad) / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.paste(im, ((W - im.width) // 2, (H - im.height) // 2 + round(H * pad * 0.4)), im)
    return out
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'): continue
    view, car = f[:-4].split('-', 1)
    if view == 'card': pack(os.path.join(src, f), (512, 512), 0.05).save(os.path.join(dst, f'{car}.webp'), 'WEBP', quality=88, method=6)
    if view == 'rear': pack(os.path.join(src, f), (1024, 588), 0.03).save(os.path.join(dst, f'rear-{car}.webp'), 'WEBP', quality=88, method=6)
print('ok')
