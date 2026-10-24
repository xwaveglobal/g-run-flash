#!/bin/bash
# Step 06 reference matching, end to end:
#   scripts/car/compare/run.sh <src: builder | path/to.glb> <outDir> <tag>
# 1. studio renders (shade + silhouette mask) from the 7 reference cameras  2. compare with the refs
set -e
SRC=${1:-src/assets/models/xwave-x1.glb}; OUT=${2:-/tmp/x1cmp}; TAG=${3:-cmp}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
mkdir -p "$OUT/render"
python3 - "$SRC" "$OUT/jobs.json" <<'PY'
import json, sys
src, out = sys.argv[1], sys.argv[2]
jobs = []
for v in ['rear0', 'rl45', 'rr45', 'side90', 'front0', 'fl45', 'top']:
    w, h = (700, 1000) if v == 'top' else (1000, 700)
    for mode in ['shade', 'mask']:
        jobs.append(dict(src=src, name=f'{v}_{mode}', view=v, mode=mode, w=w, h=h))
json.dump(jobs, open(out, 'w'))
PY
cd "$ROOT"
node scripts/car/studio-x1.mjs "$OUT/render" "$OUT/jobs.json" | tail -1
python3 scripts/car/compare/compare.py "$OUT/render" "$OUT" --tag="$TAG"
