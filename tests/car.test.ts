/** v4 3D car: the bundled X1 model parses with the game's own GLB reader and has what the game drives. */
declare const process: { exit(code: number): never };
// @ts-expect-error node built-in (no @types/node in this project)
import { readFileSync } from 'node:fs';
// @ts-expect-error node built-in (no @types/node in this project)
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { parseGlb } from '../src/render/car/glbParse.ts';
import { CAR_HALF, RENDER } from '../src/config.ts';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    fails++;
    console.error('  ✗ ' + msg);
  } else console.log('  ✓ ' + msg);
};

const bytes: Uint8Array = readFileSync(new URL('../src/assets/models/xwave-x1.glb', import.meta.url));
const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const scene = parseGlb(buf);
const car = scene.getObjectByName('X1');
check(!!car, 'GLB parses; root node X1');
const need = ['Body', 'Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'Spin_FL', 'Spin_FR', 'Spin_RL', 'Spin_RR', 'Tyre_RL', 'Rim_RL', 'Caliper_RL', 'NitroSocket_L', 'NitroSocket_R', 'Rear_LED', 'Badge_XWAVE', 'Glass_Canopy', 'Diffuser', 'Rear_LowerBumper', 'Spoiler_Pivot', 'Spoiler', 'Spoiler_Skirt', 'Front_Splitter', 'Front_Intake', 'Light_Head', 'Light_HeadHousing', 'Body_PanelGaps', 'Wheel_Liners'];
const missing = need.filter((n) => !scene.getObjectByName(n));
check(missing.length === 0, `named nodes present (${need.length})${missing.length ? ' — missing ' + missing.join(', ') : ''}`);

// wheel assemblies: spin groups sit under hub pivots at the axle, the caliper does not spin
const rl = scene.getObjectByName('Wheel_RL')!;
check(scene.getObjectByName('Spin_RL')!.parent === rl && scene.getObjectByName('Caliper_RL')!.parent === rl, 'wheel hierarchy: Wheel → Spin (tyre, rim, disc) + Caliper');
check(rl.position.y > 0.3 && rl.position.y < 0.45 && rl.position.z > 0, `rear-left hub at axle height behind the centre (y ${rl.position.y.toFixed(2)}, z ${rl.position.z.toFixed(2)})`);

// size, orientation, budgets
scene.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(scene);
const size = box.getSize(new THREE.Vector3());
check(Math.abs(box.min.y) < 0.01, `stands on the ground (min y ${box.min.y.toFixed(3)})`);
check(size.z > 4 && size.z < 5.2 && size.x > 1.9 && size.x < 2.2 && size.y > 1.0 && size.y < 1.3, `real-car size ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`);
const led = scene.getObjectByName('Rear_LED')!;
const ledZ = new THREE.Box3().setFromObject(led).getCenter(new THREE.Vector3()).z;
check(ledZ > 2, `rear lights face +Z (front toward −Z) — LED at z ${ledZ.toFixed(2)}`);
let tris = 0;
let meshes = 0;
const mats = new Set<string>();
scene.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  meshes++;
  tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  mats.add((m.material as THREE.Material).name);
  if (!m.geometry.getAttribute('normal')) fails++;
});
check(tris <= 40000, `triangle budget: ${tris} ≤ 40,000`);
check(meshes <= 40, `draw calls (meshes): ${meshes} ≤ 40`);
for (const n of ['X1_Paint', 'X1_RearLED', 'X1_Glass', 'X1_Tyre', 'X1_Badge', 'X1_Carbon']) check(mats.has(n), `material ${n}`);
const ledMat = (led as THREE.Mesh).material as THREE.MeshStandardMaterial;
check(ledMat.emissive.r > 0.5 && ledMat.emissive.g < 0.1, 'rear LED material is emissive red');

// ---- v4.1.1 rear: no hanging rods / rails / tubes; parts other than wheels stay ≥ 10 cm off the road
check(!scene.getObjectByName('Diffuser_Rail') && !scene.getObjectByName('NitroSocket_Housing'), 'no chrome rail / exposed nitro tubes');
{
  let lowest = Infinity;
  let who = '';
  const v = new THREE.Vector3();
  const body = scene.getObjectByName('Body')!;
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.y < lowest) {
        lowest = v.y;
        who = m.name;
      }
    }
  });
  check(lowest >= 0.1, `nothing hangs below the body: lowest body point ${lowest.toFixed(3)} m (${who})`);
  const bumper = new THREE.Box3().setFromObject(scene.getObjectByName('Rear_LowerBumper')!);
  const diff = new THREE.Box3().setFromObject(scene.getObjectByName('Diffuser')!);
  check(diff.min.y >= bumper.min.y - 0.001 && diff.max.z <= bumper.max.z + 0.001 && diff.min.x >= bumper.min.x, 'diffuser sits inside the lower bumper (recessed, fins attached)');
  for (const id of ['NitroSocket_L', 'NitroSocket_R']) {
    const so = scene.getObjectByName(id)!.getWorldPosition(new THREE.Vector3());
    check(Math.abs(so.x) < 0.52 && so.y > 0.155 && so.y < 0.3 && so.z > bumper.max.z - 0.12 && so.z <= bumper.max.z + 0.01, `${id} hidden in the diffuser recess (${so.toArray().map((n) => n.toFixed(2)).join(', ')})`);
  }
}
// ---- active spoiler: flush when closed, hinged at its front edge, trailing edge lifts a few cm
{
  const pivot = scene.getObjectByName('Spoiler_Pivot')!;
  const sp = scene.getObjectByName('Spoiler')!;
  const closed = new THREE.Box3().setFromObject(sp);
  check(closed.max.y < 0.79 && closed.min.y > 0.73, `closed spoiler flush with the deck (y ${closed.min.y.toFixed(3)}–${closed.max.y.toFixed(3)})`);
  const skirt = scene.getObjectByName('Spoiler_Skirt')!;
  const deckY = 0.745;
  check(new THREE.Box3().setFromObject(skirt).max.y < closed.max.y && new THREE.Box3().setFromObject(skirt).max.z < 2.2, 'closed: the pop-up skirt is hidden inside the deck well');
  const y0 = pivot.position.y;
  pivot.rotation.x = -RENDER.spoilerAngle;
  pivot.position.y = y0 + RENDER.spoilerRise;
  scene.updateMatrixWorld(true);
  const raised = new THREE.Box3().setFromObject(sp);
  const lift = raised.max.y - closed.max.y;
  check(RENDER.spoilerAngle >= 0.26 && RENDER.spoilerAngle <= 0.39, `deployed angle ${((RENDER.spoilerAngle * 180) / Math.PI).toFixed(1)}° (15–22°)`);
  check(lift > 0.12 && lift < 0.25, `raised spoiler: trailing edge up ${(lift * 100).toFixed(1)} cm (v4.1.2: 9.2 cm) — clearly visible from the chase camera`);
  check(raised.max.z <= closed.max.z + 0.01, 'raised spoiler does not swing past the tail');
  // the skirt fills the gap under the raised flap all the way down below the deck (no open slot, no rods)
  const sb = new THREE.Box3().setFromObject(skirt);
  check(sb.min.y < deckY - 0.005, `raised: skirt reaches below the deck (${sb.min.y.toFixed(3)} < ${deckY}) — no visible gap`);
  pivot.rotation.x = 0;
  pivot.position.y = y0;
  scene.updateMatrixWorld(true);
  check(sp.children.length === 0 && pivot.children.every((c) => /^Spoiler/.test(c.name)) && pivot.children.length === 3, 'pivot holds only the flap, its skirt and its edge accent (nothing else hangs off it)');
}

// ---- v4.1.2 proportions: shorter front, mirrorless, rear untouched
{
  const mirrors: string[] = [];
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (/mirror/i.test(o.name) || (m && /mirror/i.test(m.name))) mirrors.push(o.name || (m as THREE.Material).name);
  });
  check(mirrors.length === 0, `no side-mirror meshes or materials${mirrors.length ? ' — found ' + mirrors.join(', ') : ''}`);
  const len = box.max.z - box.min.z;
  check(len > 4.1 && len < 4.4, `body length ${len.toFixed(3)} m (design 4.60 m → −${((1 - len / 4.6) * 100).toFixed(1)} %)`);
  const wb = scene.getObjectByName('Wheel_RL')!.position.z - scene.getObjectByName('Wheel_FL')!.position.z;
  check(wb > 2.4 && wb < 2.62, `wheelbase ${wb.toFixed(3)} m (believable for the length: ${(wb / len).toFixed(2)} of it)`);
  check(Math.abs(size.x - 2.09) < 0.03, `overall width kept (${size.x.toFixed(3)} m = rear tyres, no mirror bulge)`);
  check(Math.abs(box.max.z - 2.242) < 0.002 && Math.abs(ledZ - 2.21) < 0.01, 'rear end unchanged (tail 2.242 m, LED plane 2.21 m)');
  check(box.min.y > -0.001, `nothing below the road (min y ${box.min.y.toFixed(3)})`);
  const fl = scene.getObjectByName('Tyre_FL')!;
  const tb = new THREE.Box3().setFromObject(fl);
  check(Math.abs(tb.max.y - tb.min.y - (tb.max.z - tb.min.z)) < 0.01, 'front tyre still round after the length change');
}

// ---- v4.1.3 front: splitter tucked under the nose, wheel arches with clearance and black liners
{
  const bb = (n: string) => new THREE.Box3().setFromObject(scene.getObjectByName(n)!);
  const paint = bb('Body_Paint');
  const split = bb('Front_Splitter');
  check(split.min.z > paint.min.z + 0.02, `splitter front edge ${((split.min.z - paint.min.z) * 100).toFixed(1)} cm behind the nose (v4.1.2: 6 cm ahead of it)`);
  check(split.max.y <= 0.215 && split.min.y >= 0.1, `splitter integrated under the bumper (y ${split.min.y.toFixed(3)}–${split.max.y.toFixed(3)})`);
  const tyre = bb('Tyre_FL');
  // the arch edge right above the front tyre (body side section at the axle) must clear the tyre top
  const fl = scene.getObjectByName('Wheel_FL')!.getWorldPosition(new THREE.Vector3());
  let archY = Infinity;
  const v = new THREE.Vector3();
  const bp = scene.getObjectByName('Body_Paint') as THREE.Mesh;
  const pos = bp.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(bp.matrixWorld);
    if (Math.abs(v.z - fl.z) < 0.02 && v.x < -0.7 && v.y > tyre.max.y - 0.2 && v.y < archY) archY = v.y;
  }
  check(archY - tyre.max.y > 0.012, `front arch clears the tyre: ${((archY - tyre.max.y) * 100).toFixed(1)} cm above it`);
  const liner = bb('Wheel_Liners');
  check(liner.max.x < size.x / 2 && liner.min.x > -size.x / 2, 'wheel-arch liners stay inside the body sides');
  check(mats.has('X1_WheelLiner') && mats.has('X1_PanelGap') && mats.has('X1_HeadlightCore'), 'materials: wheel liner, panel gaps, headlight core');
}

// in game: the visual width stays close to the hitbox (fair dodges)
const gameW = size.x * RENDER.carScale;
check(gameW < CAR_HALF.x * 2 * 1.35, `in-game width ${gameW.toFixed(2)} m vs hitbox ${(CAR_HALF.x * 2).toFixed(2)} m (≤ +35 %)`);

// Step 07 FINAL: the approved car is a locked master asset — the game GLB must stay byte-identical to it
{
  const ref = JSON.parse(readFileSync(new URL('../assets-src/x1/approved/xwave-x1-approved-v4.2.0.fingerprint.json', import.meta.url), 'utf8'));
  const sha: string = createHash('sha256').update(bytes).digest('hex');
  check(sha === ref.fileSha256, `approved GLB locked: sha256 ${sha.slice(0, 12)}… ${sha === ref.fileSha256 ? '=' : '≠'} approved ${ref.fileSha256.slice(0, 12)}…`);
}

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
if (fails) process.exit(1);
