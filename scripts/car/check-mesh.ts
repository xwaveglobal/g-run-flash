/**
 * Step 06 mesh validation of an X1 GLB (runs in Node through the game's own parser):
 *   node --experimental-transform-types --no-warnings scripts/car/check-mesh.ts [file.glb] [out.json]
 * Per mesh: vertices, triangles, degenerate triangles, missing / zero / non-unit normals, normals that
 * disagree with their triangles' facing (smooth-shading errors), UV presence and NaNs, UV extent.
 */
declare const process: { argv: string[]; exit(c: number): never };
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseGlb } from '../../src/render/car/glbParse.ts';

const file = process.argv[2] ?? 'src/assets/models/xwave-x1.glb';
const bytes = readFileSync(file);
const scene = parseGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
scene.updateMatrixWorld(true);
const rows: Record<string, unknown>[] = [];
const tot = { meshes: 0, verts: 0, tris: 0, degenerate: 0, zeroNormals: 0, nonUnit: 0, flipped: 0, noUv: 0, uvNaN: 0 };
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
scene.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  const g = m.geometry;
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const idx = g.getIndex();
  const tri = idx ? idx.count / 3 : p.count / 3;
  let degenerate = 0, zero = 0, nonUnit = 0, flipped = 0, uvNaN = 0;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  if (n)
    for (let i = 0; i < n.count; i++) {
      const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
      if (l < 1e-4) zero++;
      else if (Math.abs(l - 1) > 0.01) nonUnit++;
    }
  if (uv)
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      if (!Number.isFinite(u) || !Number.isFinite(v)) uvNaN++;
      else {
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
    }
  // vertex normal vs face normal: a vertex normal pointing away (> 90°) from its face = wrong shading
  let checked = 0;
  for (let t = 0; t < tri; t++) {
    const ia = idx ? idx.getX(t * 3) : t * 3, ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
    fn.subVectors(c, b).cross(a.clone().sub(b));
    const area = fn.length() / 2;
    if (area < 1e-9) { degenerate++; continue; }
    fn.normalize();
    if (!n) continue;
    for (const i of [ia, ib, ic]) {
      vn.fromBufferAttribute(n, i);
      checked++;
      if (vn.lengthSq() > 1e-8 && vn.normalize().dot(fn) < 0) flipped++;
    }
  }
  const row = { mesh: m.name, material: (m.material as THREE.Material).name, verts: p.count, tris: tri, degenerate, zeroNormals: zero, nonUnitNormals: nonUnit, normalsAgainstFace: flipped, normalsChecked: checked, uv: !!uv, uvNaN, uvExtent: uv ? [+u0.toFixed(2), +v0.toFixed(2), +u1.toFixed(2), +v1.toFixed(2)] : null };
  rows.push(row);
  tot.meshes++; tot.verts += p.count; tot.tris += tri; tot.degenerate += degenerate; tot.zeroNormals += zero; tot.nonUnit += nonUnit; tot.flipped += flipped; if (!uv) tot.noUv++; tot.uvNaN += uvNaN;
});
const out = { file, total: tot, meshes: rows };
// optional: UV triangles of the paint (for the UV-layout figure)
if (process.argv[4]) {
  const paint = scene.getObjectByName('Body_Paint') as THREE.Mesh;
  const uv = paint.geometry.getAttribute('uv');
  const ix = paint.geometry.getIndex()!;
  const tris: number[][] = [];
  for (let t = 0; t < ix.count; t += 3) tris.push([0, 1, 2].flatMap((k) => [+uv.getX(ix.getX(t + k)).toFixed(3), +uv.getY(ix.getX(t + k)).toFixed(3)]));
  writeFileSync(process.argv[4], JSON.stringify(tris));
}
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(JSON.stringify(tot));
for (const r of rows) if ((r.normalsAgainstFace as number) > 0 || (r.zeroNormals as number) > 0 || (r.degenerate as number) > 0) console.log(' ', r.mesh, `deg ${r.degenerate} zero ${r.zeroNormals} against ${r.normalsAgainstFace}/${r.normalsChecked}`);
