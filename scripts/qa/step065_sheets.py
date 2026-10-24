#!/usr/bin/env python3
"""Step 06.5 contact sheets from the real-game captures (scripts/qa/step065.mjs):
   python3 scripts/qa/step065_sheets.py <shotDir>   → air_dash_full_animation_sequence.png, crash_sequence.png"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../car/compare'))
from compose import text, row, stack  # noqa: E402
from PIL import Image

d = sys.argv[1]
L = lambda n: Image.open(os.path.join(d, n)).convert('RGB')
seq = [('06_air_dash_pickup_left.png', 'pickup (left lane)'), ('07_air_dash_takeoff_left.png', 'take-off'), ('08_air_dash_roll_90.png', 'roll 90°'),
       ('09_air_dash_roll_180.png', 'roll 180°'), ('10_air_dash_roll_270.png', 'roll 270°'), ('11_air_dash_roll_360.png', 'roll 360°'), ('12_air_dash_landing_right.png', 'landed (right lane)')]
seq = [(f, l) for f, l in seq if os.path.exists(os.path.join(d, f))]
stack([text('AIR DASH — left → right, one sideways 360° roll across exactly two lanes (real H5 build, 360×640 @2)', 22, True),
       row([L(f) for f, _ in seq], 560), text('   ·   '.join(l for _, l in seq), 16, color=(80, 80, 90))]).save(os.path.join(d, 'air_dash_full_animation_sequence.png'))
cr = [(f, l) for f, l in [('crash_01_breaks_and_falls.png', '0.12 s: parts break off, car falling'), ('crash_02_on_the_road.png', '1.1 s: on the road, parts lie on the road')] if os.path.exists(os.path.join(d, f))]
if cr:
    stack([text('Run-ending crash in the air: breaks a little and drops to the road (no floating)', 22, True), row([L(f) for f, _ in cr], 720), text('   ·   '.join(l for _, l in cr), 16, color=(80, 80, 90))]).save(os.path.join(d, 'crash_sequence.png'))
print('ok')
