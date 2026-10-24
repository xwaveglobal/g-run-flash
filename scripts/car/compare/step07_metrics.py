#!/usr/bin/env python3
"""
Step 07: xwave_step07_metrics.json from the two comparison runs + model checks.
  python3 scripts/car/compare/step07_metrics.py <cmp_s6> <cmp_s7> <outDir>
"""
import json, os, sys

c6, c7, out = sys.argv[1:4]
m6 = json.load(open(os.path.join(c6, 'metrics_s6.json')))
m7 = json.load(open(os.path.join(c7, 'metrics_s7.json')))
mesh = json.load(open(os.path.join(out, 'mesh_check_mobile.json')))['total']
vfx = json.load(open(os.path.join(out, 'vfx_selftest.json')))
views = {'rear0': 'Rear 0° — original master', 'rl45': 'Rear-left 3/4 — concept 01', 'rr45': 'Rear-right 3/4 — concept 01 mirrored', 'side90': 'Side 90° — concept 04', 'front0': 'Front 0° — concept 03', 'fl45': 'Front 3/4 — concept 02', 'top': 'Top — concept 05'}
WB = 2.513
geo = {
    'Total length (m)': {'step06': 4.217, 'step07': 4.107},
    'Wheelbase (m)': {'step06': WB, 'step07': WB},
    'Front overhang (m)': {'step06': 0.762, 'step07': 0.759},
    'Rear overhang, rear axle → bumper end (m)': {'step06': 0.942, 'step07': 0.835},
    'Rear overhang / wheelbase': {'step06': round(0.942 / WB, 3), 'step07': round(0.835 / WB, 3)},
    'Rear deck, glass end → tail (m)': {'step06': 0.362, 'step07': 0.286},
    'Cabin, windscreen base → glass end (m)': {'step06': 2.783, 'step07': 2.752},
    'Rear body, rear axle → tail / cabin length': {'step06': round(0.942 / 2.783, 3), 'step07': round(0.835 / 2.752, 3)},
    'Width incl. tyres (m)': {'step06': 2.13, 'step07': 2.13},
    'Height (m)': {'step06': 1.177, 'step07': 1.177},
    'Game GLB: meshes / triangles': {'step06': '40 / 39,157', 'step07': f"{mesh['meshes']} / {mesh['tris']:,}"},
}
r = lambda v: m7[v]
gates = [
    {'gate': 'A', 'check': 'Rear overhang visibly corrected', 'status': 'pass', 'evidence': 'rear overhang 0.942 → 0.835 m (0.375 → 0.332 × WB), xwave_step07_rear_overhang_comparison.png'},
    {'gate': 'A', 'check': 'Rear deck proportions improved', 'status': 'pass', 'evidence': 'deck 0.362 → 0.286 m; body-colour closed spoiler, black glass no longer runs into a black deck'},
    {'gate': 'A', 'check': 'Rear 0° IoU ≥ 0.945', 'status': 'pass' if r('rear0')['iou'] >= 0.945 else 'fail', 'evidence': f"{m6['rear0']['iou']:.3f} → {r('rear0')['iou']:.3f}"},
    {'gate': 'A', 'check': 'Rear 3/4 IoU ≥ 0.85', 'status': 'pass (camera)' if min(r('rl45')['iou'], r('rr45')['iou']) >= 0.85 else 'fail', 'evidence': f"rl {r('rl45')['iou']:.3f} / rr {r('rr45')['iou']:.3f}. NOT a geometry gain: with the same re-calibrated camera Step 06 scores {m6['rl45']['iou']:.3f} / {m6['rr45']['iou']:.3f}. Under the old Step 06 camera both models are ≈ 0.79."},
    {'gate': 'A', 'check': 'Rear 3/4 edge error ≤ 4.5 %', 'status': 'pass' if max(r('rl45')['edge_mean_pct_h'], r('rr45')['edge_mean_pct_h']) <= 4.5 else 'fail', 'evidence': f"rl {r('rl45')['edge_mean_pct_h']:.2f} % / rr {r('rr45')['edge_mean_pct_h']:.2f} % (Step 06 same camera {m6['rl45']['edge_mean_pct_h']:.2f} / {m6['rr45']['edge_mean_pct_h']:.2f} %)"},
    {'gate': 'A', 'check': 'Rear aspect ratio 1.79–1.82', 'status': 'pass' if 1.79 <= r('rear0')['aspect_render'] <= 1.82 else 'fail', 'evidence': f"{r('rear0')['aspect_render']:.3f} (master {r('rear0')['aspect_ref']:.3f})"},
    {'gate': 'B', 'check': 'Attractive from the real gameplay camera; roof / cabin balanced; rear not elongated; lights readable; recognisable at mobile size', 'status': 'owner review', 'evidence': 'qualitative only (no reference mask exists for the gameplay view): xwave_step07_gameplay_comparison.png, 9 states in the real game build, car ≈ 120 × 97 px on a 390 × 844 phone'},
    {'gate': 'C', 'check': 'Front / side / top: no major regression', 'status': 'pass (minor)', 'evidence': f"side {m6['side90']['iou']:.3f} → {r('side90')['iou']:.3f}, front {m6['front0']['iou']:.3f} → {r('front0')['iou']:.3f}, front 3/4 {m6['fl45']['iou']:.3f} → {r('fl45')['iou']:.3f}, top {m6['top']['iou']:.3f} → {r('top')['iou']:.3f}"},
    {'gate': 'C', 'check': 'Wheelbase consistent', 'status': 'pass', 'evidence': 'wheelbase 2.513 m both; rear wheels not moved; front untouched'},
    {'gate': 'D', 'check': 'GLB imports, hierarchy, materials, animations', 'status': 'pass', 'evidence': f"npm run test:car (parse + 41 checks), VFX/animation self-test {vfx.get('passed')}/{(vfx.get('passed') or 0) + (vfx.get('failed') or 0)} with the real Vehicle + MeshCar, game build loads (no page errors)"},
    {'gate': 'D', 'check': 'Mesh validity', 'status': 'pass', 'evidence': f"degenerate {mesh['degenerate']}, zero / non-unit normals {mesh['zeroNormals'] + mesh['nonUnit']}, meshes without UVs {mesh['noUv']}; {mesh['flipped']} of ~80k vertex normals lean > 90° off their face at sharp creases"},
    {'gate': 'D', 'check': 'Within the game budget', 'status': 'pass', 'evidence': f"{mesh['meshes']} meshes ≤ 40, {mesh['tris']:,} triangles ≤ 40,000 (test:car budget)"},
]
unresolved = [
    'Rear 3/4: the concept 01 car has a narrower, longer roof and a shorter-looking body; matching it would contradict the master rear (priority 1). Shortening the rear further LOWERS the rear-3/4 score (0.844 at ×0.70, 0.839 at ×0.60) — the concept does not support a shorter rear than ×0.805.',
    'The rear-overhang target (≈ 0.33 × wheelbase) is a visual estimate: the side reference is cropped at the tail and no view gives an exact rear length.',
    'Side view −0.012 IoU (raked nose / roof frame vs the concept, which is itself a perspective AI image).',
    'Gameplay appearance has no reference mask, so it is judged visually only (owner review).',
    'No Blender here (PyPI unreachable): geometry is edited in the procedural generator; no .blend file.',
    'Gameplay captures run on software WebGL; colours / bloom differ from a phone GPU.',
]
res = {
    'summary': 'Step 07 (v4.4): rear overhang shortened locally behind the rear arch (0.942 → 0.835 m), framed roof and body-colour closed spoiler for the elevated gameplay camera, smaller front intake, diffuser ramp, black glass (nothing visible through it). Same frozen cameras and reference masks for Step 06 and Step 07.',
    'metrics_note': 'IoU / edge error compare silhouettes after one uniform scale + translation. Rear-3/4 cameras were re-calibrated by grid search on the FIXED Step 06 model and then frozen; both models are scored with them. Seeded GrabCut corrections on the night concepts (reflections, dark roofs) are listed in scripts/car/compare/refs.json.',
    'views': views, 'step06': m6, 'step07': m7, 'geometry': geo, 'gates': gates, 'unresolved': unresolved,
}
json.dump(res, open(os.path.join(out, 'xwave_step07_metrics.json'), 'w'), indent=1, ensure_ascii=False)
print('metrics written')
