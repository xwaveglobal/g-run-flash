#!/usr/bin/env python3
"""
Step 07: self-contained HTML report (images embedded) from the step07 folder.
  python3 scripts/car/compare/step07_report.py docs/3d-upgrade/step07
"""
import base64, io, json, os, sys
from PIL import Image

d = sys.argv[1]
M = json.load(open(os.path.join(d, 'xwave_step07_metrics.json')))


def img(name, alt):
    p = os.path.join(d, name)
    if not os.path.exists(p):
        return f'<p class="miss">missing: {name}</p>'
    im = Image.open(p).convert('RGB')
    if im.width > 1600:
        im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=84, optimize=True)  # keeps the single-file report small (artifact limit)
    b = base64.b64encode(buf.getvalue()).decode()
    return f'<figure><img src="data:image/jpeg;base64,{b}" alt="{alt}" loading="lazy"><figcaption>{alt}</figcaption></figure>'


rows = []
for v, lab in M['views'].items():
    a, b = M['step06'][v], M['step07'][v]
    asp = lambda m: f"{m['aspect_render']:.3f}" if m.get('aspect_render') else '—'
    d_iou = b['iou'] - a['iou']
    cls = 'up' if d_iou > 0.002 else 'down' if d_iou < -0.002 else ''
    rows.append(f"<tr><td>{lab}</td><td>{a['iou']:.3f}</td><td class='{cls}'>{b['iou']:.3f}</td><td>{a['edge_mean_pct_h']:.2f} %</td><td>{b['edge_mean_pct_h']:.2f} %</td><td>{a['edge_p95_pct_h']:.1f} %</td><td>{b['edge_p95_pct_h']:.1f} %</td><td>{asp(a)}</td><td>{asp(b)}</td><td>{(b.get('aspect_ref') or 0) and round(b['aspect_ref'],3) or '—'}</td></tr>")
geo = M['geometry']
grow = ''.join(f"<tr><td>{k}</td><td>{v['step06']}</td><td>{v['step07']}</td></tr>" for k, v in geo.items())
gates = ''.join(f"<tr><td>{g['gate']}</td><td>{g['check']}</td><td class='{ 'up' if g['status']=='pass' else 'down' if g['status']=='fail' else 'warn'}'>{g['status']}</td><td>{g['evidence']}</td></tr>" for g in M['gates'])
html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>XWAVE Step 07 Report</title>
<style>
:root{{--bg:#f6f7f9;--fg:#171a21;--mut:#5d6472;--card:#fff;--line:#dde1e7;--up:#13824a;--down:#c0392b;--warn:#a26800}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#111318;--fg:#e8eaef;--mut:#9aa1ad;--card:#1a1d24;--line:#2b303a;--up:#4cc685;--down:#ff7b6b;--warn:#f0b54a}}}}
:root[data-theme=dark]{{--bg:#111318;--fg:#e8eaef;--mut:#9aa1ad;--card:#1a1d24;--line:#2b303a;--up:#4cc685;--down:#ff7b6b;--warn:#f0b54a}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:1180px;margin:0 auto;padding:24px 16px 64px}}
h1{{font-size:26px;margin:0 0 4px}} h2{{font-size:19px;margin:36px 0 10px}} p{{color:var(--mut);margin:6px 0}}
table{{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:13.5px}}
th,td{{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}} th{{color:var(--mut);font-weight:600}}
.tw{{overflow-x:auto}} .up{{color:var(--up);font-weight:600}} .down{{color:var(--down);font-weight:600}} .warn{{color:var(--warn);font-weight:600}}
figure{{margin:14px 0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px}} figure img{{width:100%;height:auto;display:block;border-radius:4px}}
figcaption{{color:var(--mut);font-size:13px;margin-top:6px}} .miss{{color:var(--down)}}
</style></head><body><main>
<h1>XWAVE X1 — Step 07 multi-view report (v4.4)</h1>
<p>{M['summary']}</p>
<h2>Quality gates</h2><div class="tw"><table><tr><th>Gate</th><th>Check</th><th>Status</th><th>Evidence</th></tr>{gates}</table></div>
<h2>Silhouette metrics (same frozen cameras and reference masks for both models)</h2>
<div class="tw"><table><tr><th>View</th><th>IoU S06</th><th>IoU S07</th><th>Edge S06</th><th>Edge S07</th><th>p95 S06</th><th>p95 S07</th><th>Aspect S06</th><th>Aspect S07</th><th>Aspect ref</th></tr>{''.join(rows)}</table></div>
<p>{M['metrics_note']}</p>
<h2>Geometry (model metres, same coordinate system)</h2><div class="tw"><table><tr><th>Measure</th><th>Step 06</th><th>Step 07</th></tr>{grow}</table></div>
<h2>Rear overhang</h2>{img('xwave_step07_rear_overhang_comparison.png','Rear overhang — orthographic side, same scale')}
<h2>Actual gameplay (real game build)</h2>{img('xwave_step07_gameplay_comparison.png','Nine gameplay states, Step 06 vs Step 07')}
<h2>Roof and rear glass</h2>{img('xwave_step07_roof_glass_comparison.png','Top, gameplay close-up, rear 3/4')}
<h2>Per view</h2>{''.join(img(f'step07_view_{v}.png', lab) for v, lab in M['views'].items())}
<h2>Contact sheet</h2>{img('xwave_step07_geometry_contact_sheet.png','All views')}
<h2>Unresolved</h2><ul>{''.join(f'<li>{u}</li>' for u in M['unresolved'])}</ul>
</main></body></html>"""
open(os.path.join(d, 'xwave_step07_multiview_report.html'), 'w').write(html)
print('report', os.path.getsize(os.path.join(d, 'xwave_step07_multiview_report.html')) // 1024, 'KB')
