/**
 * Step 07 FINAL geometry lock: fingerprint of an X1 GLB (runs in Node through the game's own parser).
 *   node --experimental-transform-types --no-warnings scripts/car/fingerprint.ts [file.glb] [out.json]
 *   node ... scripts/car/fingerprint.ts --verify <reference.json> [file.glb]   (exit 1 on any difference)
 * Records: SHA-256 of the file bytes, SHA-256 of all vertex positions / indices (per mesh and overall),
 * hierarchy (node names, parents, local transforms), mesh / vertex / triangle counts, world bounding box.
 * The geometry hash ignores materials, so material-only changes keep the same geometry fingerprint.
 */
declare const process: { argv: string[]; exit(c: number): never };
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseGlb } from '../../src/render/car/glbParse.ts';

const args = process.argv.slice(2);
const verify = args[0] === '--verify' ? args.splice(0, 2)[1] : null;
const file = args[0] ?? 'src/assets/models/xwave-x1.glb';
const bytes = readFileSync(file);
const scene = parseGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
scene.updateMatrixWorld(true);

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const all = createHash('sha256');
const meshes: Record<string, unknown>[] = [];
const hierarchy: Record<string, unknown>[] = [];
let verts = 0, tris = 0;
const box = new THREE.Box3();
scene.traverse((o) => {
  hierarchy.push({ name: o.name, parent: o.parent?.name ?? null, type: o.type, pos: o.position.toArray().map(r6), quat: o.quaternion.toArray().map(r6), scale: o.scale.toArray().map(r6) });
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  const g = m.geometry;
  const p = g.getAttribute('position');
  const idx = g.getIndex();
  const h = createHash('sha256');
  const pa = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { pa[i * 3] = p.getX(i); pa[i * 3 + 1] = p.getY(i); pa[i * 3 + 2] = p.getZ(i); }
  h.update(Buffer.from(pa.buffer));
  if (idx) h.update(Buffer.from(new Uint32Array(Array.from({ length: idx.count }, (_, i) => idx.getX(i))).buffer));
  const n = g.getAttribute('normal');
  const hn = createHash('sha256');
  if (n) { const na = new Float32Array(n.count * 3); for (let i = 0; i < n.count; i++) { na[i * 3] = n.getX(i); na[i * 3 + 1] = n.getY(i); na[i * 3 + 2] = n.getZ(i); } hn.update(Buffer.from(na.buffer)); }
  const geo = h.digest('hex');
  all.update(m.name).update(geo).update(m.matrixWorld.elements.map(r6).join(','));
  const t = idx ? idx.count / 3 : p.count / 3;
  verts += p.count; tris += t;
  const mb = new THREE.Box3().setFromObject(m);
  box.union(mb);
  meshes.push({ mesh: m.name, material: (m.material as THREE.Material).name, verts: p.count, tris: t, geometrySha256: geo, normalsSha256: n ? hn.digest('hex') : null, bbox: [mb.min.toArray().map(r6), mb.max.toArray().map(r6)] });
});
const size = box.getSize(new THREE.Vector3());
const out = {
  file,
  fileBytes: bytes.length,
  fileSha256: createHash('sha256').update(bytes).digest('hex'),
  geometrySha256: all.digest('hex'),
  meshCount: meshes.length,
  vertexCount: verts,
  triangleCount: tris,
  bbox: { min: box.min.toArray().map(r6), max: box.max.toArray().map(r6), size: size.toArray().map(r6) },
  hierarchy,
  meshes,
};
if (verify) {
  const ref = JSON.parse(readFileSync(verify, 'utf8'));
  const diffs: string[] = [];
  for (const k of ['geometrySha256', 'meshCount', 'vertexCount', 'triangleCount']) if (ref[k] !== (out as Record<string, unknown>)[k]) diffs.push(`${k}: ${ref[k]} → ${(out as Record<string, unknown>)[k]}`);
  if (JSON.stringify(ref.bbox) !== JSON.stringify(out.bbox)) diffs.push('bbox differs');
  console.log(diffs.length ? `GEOMETRY CHANGED\n  ${diffs.join('\n  ')}` : `geometry identical (${out.geometrySha256.slice(0, 16)}…, file ${ref.fileSha256 === out.fileSha256 ? 'identical' : 'bytes differ'})`);
  process.exit(diffs.length ? 1 : 0);
}
if (args[1]) writeFileSync(args[1], JSON.stringify(out, null, 1));
console.log(JSON.stringify({ fileSha256: out.fileSha256, geometrySha256: out.geometrySha256, meshCount: out.meshCount, vertexCount: verts, triangleCount: tris, bbox: out.bbox }));
