/**
 * Step 07 FINAL: PBR factors of every material in an X1 GLB, as parsed by the game (before MeshCar's runtime
 * tweaks). node --experimental-transform-types --no-warnings scripts/car/materials-report.ts [file.glb] [out.json]
 */
declare const process: { argv: string[] };
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseGlb } from '../../src/render/car/glbParse.ts';

const file = process.argv[2] ?? 'src/assets/models/xwave-x1.glb';
const bytes = readFileSync(file);
const scene = parseGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
const seen = new Map<string, Record<string, unknown>>();
const r3 = (n: number) => +n.toFixed(3);
scene.traverse((o) => {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh) return;
  const m = mesh.material as THREE.MeshPhysicalMaterial;
  const row = seen.get(m.name) ?? {
    type: m.type, color: '#' + m.color.getHexString(), metalness: r3(m.metalness), roughness: r3(m.roughness),
    clearcoat: m.isMeshPhysicalMaterial ? r3(m.clearcoat) : null, clearcoatRoughness: m.isMeshPhysicalMaterial ? r3(m.clearcoatRoughness) : null,
    emissive: '#' + m.emissive.getHexString(), emissiveIntensity: r3(m.emissiveIntensity), transparent: m.transparent, opacity: r3(m.opacity), side: m.side, meshes: [] as string[],
  };
  (row.meshes as string[]).push(mesh.name);
  seen.set(m.name, row);
});
const out = Object.fromEntries(seen);
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
for (const [k, v] of seen) console.log(k.padEnd(18), v.type, v.color, 'met', v.metalness, 'rough', v.roughness, 'cc', v.clearcoat, v.clearcoatRoughness, 'em', v.emissive, v.emissiveIntensity, v.transparent ? 'T' + v.opacity : '', (v.meshes as string[]).length);
