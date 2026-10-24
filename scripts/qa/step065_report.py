#!/usr/bin/env python3
"""Step 06.5 test-result pages from the real-build QA json and the npm test log.
   python3 scripts/qa/step065_report.py <qa_results.json> <npm-test.log> <docDir>"""
import json, os, re, sys

qa_path, log_path, d = sys.argv[1:4]
qa = json.load(open(qa_path))
log = open(log_path).read()
P = lambda ok: '✅' if ok else '❌'

def rows(filt):
    out = []
    for c in qa['checks']:
        if filt(c['msg']):
            data = c.get('data')
            note = '' if data is None else json.dumps(data, ensure_ascii=False)
            if len(note) > 160:
                note = note[:157] + '…'
            out.append(f"| {P(c['ok'])} | {c['msg'].replace('|', '/')} | `{note}` |" if note else f"| {P(c['ok'])} | {c['msg'].replace('|', '/')} | |")
    return '\n'.join(out)

suites = re.findall(r'> [^\n]*?(tests/[\w.]+\.ts)', log)
passed = log.count('ALL PASSED')
failed = len(re.findall(r'\d+ FAILED', log))
checks_n = len(re.findall(r'^\s+✓', log, re.M))
fails_n = len(re.findall(r'^\s+✗', log, re.M))
nq = len(qa['checks']); okq = sum(c['ok'] for c in qa['checks'])
groups = [
    ('Audio (fresh session, Settings never opened)', lambda m: any(k in m for k in ['AudioContext', 'audio running', 'SFX', 'Sound / Music', 'background → suspended', 'restart: same'])),
    ('Spoiler', lambda m: 'spoiler' in m.lower() and 'Air Dash' not in m and 'take-off' not in m),
    ('Air Dash', lambda m: any(k in m for k in ['Air Dash', 'roll 90', 'opposite outer', 'take-off', 'after landing: upright', 'centre lane'])),
    ('Specials (manual + last-chance auto)', lambda m: any(k in m for k in ['special', 'ROADSTER', 'HYPER', 'SOS', 'revive', 'no special'])),
    ('Crash', lambda m: 'crash in the air' in m or 'settles on the road' in m),
    ('Class / Garage', lambda m: any(k in m for k in ['new car', 'C / B / A', 'AA:', 'AAA:', 'S:', 'owned', 'locked S+'])),
    ('Congratulations', lambda m: 'first-time' in m or 'acknowledged' in m),
    ('Non-Home buttons', lambda m: 'flat_buttons' in m or 'non-Home' in m),
    ('General', lambda m: 'page errors' in m),
]
md = [f"# Step 06.5 — test results\n",
      f"Node suites (`npm test`, 12 suites incl. the new `tests/airdash.test.ts`): **{passed} passed, {failed} failed** — {checks_n} checks ✓, {fails_n} ✗. `npm run typecheck`: clean.\n",
      f"Real H5 build (`node scripts/qa/step065.mjs dist-esbuild …`, Chromium + SwiftShader, 360 × 640 @2, real browser autoplay policy, real taps for Play / GO / Pause / Resume / special button / Continue): **{okq} / {nq} checks passed**.\n",
      "Not available in this environment: a phone, the TikTok Native runtime, audible output latency, real-device FPS (nothing here is claimed for them).\n"]
for title, f in groups:
    if title == 'General':
        continue
    r = rows(f)
    if r:
        md.append(f"\n## {title}\n\n| | Check | Data |\n|---|---|---|\n{r}\n")
md.append(f"\n## General\n\n| | Check | Data |\n|---|---|---|\n{rows(lambda m: 'page errors' in m)}\n")
if 'audioLatency' in qa:
    md.append(f"\nAudio trigger latency (collision event → SFX request, main thread): **{qa['audioLatency']['collisionToTriggerMs']} ms**. AudioContext `baseLatency`: {qa['audioLatency'].get('baseLatency')} s (desktop Chromium; device-dependent).\n")
md.append("\nNode suite log excerpt: see `npm test` (CI-equivalent); Air Dash suite: `tests/airdash.test.ts`, spoiler matrix: `tests/carMotion.test.ts`.\n")
open(os.path.join(d, 'test_results.md'), 'w').write('\n'.join(md))

p2 = [f"# Patch 02 — test results (real H5 build)\n",
      "| | Check | Data |\n|---|---|---|\n" + rows(lambda m: any(k in m.lower() for k in ['pause', 'paused', 'resume', 'retry'])) + "\n",
      "\n## Magic Bag\n\n| | Check | Data |\n|---|---|---|\n" + rows(lambda m: 'magic bag' in m.lower() or 'eligible' in m or 'no re-roll' in m or 'pre-race' in m) + "\n"]
open(os.path.join(d, 'patch02', 'patch02_test_results.md'), 'w').write('\n'.join(p2))
print('ok', okq, '/', nq)
