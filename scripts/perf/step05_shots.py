#!/usr/bin/env python3
"""
Step 05 screenshot set (docs/3d-upgrade/step05/01–12 + gameplay sequence) from:
  before/after env-harness shots (v4.2.0 worktree vs v4.2.1+), real-game captures
  (scripts/car/gameplay-states.mjs: drive set + --set=effects) and preset shots.
  python3 scripts/perf/step05_shots.py <s5dir> <playDir> <fxDir> <outDir>
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../car/compare'))
from compose import text, row, stack  # noqa: E402
from PIL import Image

s5, play, fx, out = sys.argv[1:5]
L = lambda p: Image.open(p).convert('RGB')
os.makedirs(out, exist_ok=True)
H = 640


def pair(title, items, note=''):
    parts = [text(title, 24, True)]
    parts.append(row([L(p) for p, _ in items], H))
    parts.append(text('   ·   '.join(lbl for _, lbl in items), 16, color=(80, 80, 90)))
    if note:
        parts.append(text(note, 15, color=(90, 90, 100)))
    return stack(parts)


B, A = os.path.join(s5, 'before'), os.path.join(s5, 'after')
pair('01 · Ring Coins — v4.2.0 (thick blue tube + glowing disc) vs v4.2.1 (thin gold ring, open centre)',
     [(f'{B}/ring_near.png', 'before, near'), (f'{A}/ring_near.png', 'after, near'), (f'{B}/ring_ahead.png', 'before, ahead'), (f'{A}/ring_ahead.png', 'after, ahead')],
     'Environment harness with the game\'s own Renderer / Scenery / Track / ObstacleViews / Vehicle, 720 × 1280. Car: model of that time.').save(f'{out}/01_ring_coins_before_after.png')
pair('02 · Jump camera — v4.2.0 vs v4.2.1 (BALANCED): the car stays mid-screen, the lane ahead stays visible',
     [(f'{B}/jump.png', 'before, take-off'), (f'{A}/jump.png', 'after, take-off'), (f'{B}/apex.png', 'before, apex'), (f'{A}/apex.png', 'after, apex')],
     'Same harness and frames; physics unchanged (camera lift / look only).').save(f'{out}/02_jump_camera_before_after.png')
real = 'Real game build v4.4.0 (current), 360 × 640 @2 = 720 × 1280, MEDIUM, BALANCED camera. Bottom-left green text = the ?perf=1 readout used to drive the capture.'
for n, src, t in [('03_shield', f'{play}/08_shield.png', 'Shield'), ('04_turbo', f'{play}/07_turbo.png', 'Turbo'), ('05_shield_turbo', f'{fx}/05_shield_turbo.png', 'Shield + Turbo'),
                  ('06_phase_ghost', f'{fx}/06_phase_ghost.png', 'Phase Ghost'), ('07_down_action', f'{fx}/07_down_action.png', 'Down (dive)'), ('08_crash', f'{fx}/08_crash.png', 'Crash')]:
    if os.path.exists(src):
        stack([text(f'{n[:2]} · {t}', 24, True), row([L(src)], 960), text(real, 15, color=(90, 90, 100))]).save(f'{out}/{n}.png')
CB, CA = os.path.join(s5, 'city_before'), os.path.join(s5, 'city_after')
pair('09 · City variation — v4.2.0 vs v4.2.1: slim towers, low blocks, roof crowns, per-building window patterns, dimmer far field',
     [(f'{CB}/mid.png', 'before, mid layer'), (f'{CA}/mid.png', 'after, mid layer'), (f'{CB}/far.png', 'before, far'), (f'{CA}/far.png', 'after, far')]).save(f'{out}/09_city_variation.png')
for n, q, lab in [('10_low', 'low', 'LOW — DPR 1.25, no post, 256 road texture, 50 % particles'), ('11_medium', 'medium', 'MEDIUM — DPR 1.5, half-res bloom (default)'), ('12_high', 'high', 'HIGH — DPR 2, bloom + speed blur')]:
    stack([text(f'{n[:2]} · {lab}', 24, True), row([L(f'{CA}/{q}.png')], 960), text('Environment harness, same frame for the three presets (game Renderer + presets).', 15, color=(90, 90, 100))]).save(f'{out}/{n}.png')
seq = [(f'{play}/01_normal.png', 'Normal'), (f'{play}/04_jump_takeoff.png', 'Jump'), (f'{play}/06_landing.png', 'Landing'), (f'{play}/08_shield.png', 'Shield'), (f'{play}/07_turbo.png', 'Turbo'), (f'{fx}/seq6_ring_ahead.png', 'Ring Coins ahead'), (f'{fx}/seq7_ring_collect.png', 'Ring collected')]
seq = [(p, l) for p, l in seq if os.path.exists(p)]
stack([text('Gameplay sequence — real game build: ' + ' → '.join(l for _, l in seq), 22, True), row([L(p) for p, _ in seq], 520), text(real, 15, color=(90, 90, 100))]).save(f'{out}/13_gameplay_sequence.png')
print('ok')
