/**
 * Step 07: the REAL gameplay camera, extracted by running the game's own CameraRig + Player (Node):
 *   node --experimental-transform-types --no-warnings scripts/car/game-camera.ts [out.json]
 * Reports, per state (drive at start / mid / top speed, Turbo, lane change, jump apex, landing) and per
 * portrait aspect: camera position, look target, pitch, yaw, vertical FOV, distance to the car, the car's
 * on-screen box and its apparent size in pixels on a 390 × 844 phone screen.
 */
declare const process: { argv: string[] };
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { CameraRig } from '../../src/render/CameraRig.ts';
import { Player } from '../../src/gameplay/Player.ts';
import { CAMERA, CAR_HALF, HEIGHT, LANES, RENDER, type ChaseName } from '../../src/config.ts';
import { carHeight } from '../../src/render/car/carMotion.ts';

const flag = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const presetName = (flag('preset') ?? CAMERA.chase) as ChaseName;
// --set='{"back":8}' tweaks the chosen preset for this run only (camera tuning sweeps)
if (flag('set')) CAMERA.presets[presetName] = { ...CAMERA.presets[presetName], ...JSON.parse(flag('set')!) };
process.argv = process.argv.filter((a) => !a.startsWith('--'));
const s = RENDER.carScale;
// current model bounds (src/assets/models/xwave-x1.glb), filled in by the caller via argv[3..] or defaults
const B = { x: 1.065, y: 1.177, z0: -1.975, z1: +(process.argv[3] ?? 2.242) };
const out: Record<string, unknown> = { preset: presetName, presetValues: CAMERA.presets[presetName], near: 0.1, far: 1500, roll: 'camera roll = −vx × 0.006 rad (±0.06), 0 when driving straight', carScale: s, projection: 'perspective', states: {} };
const deg = (r: number) => +THREE.MathUtils.radToDeg(r).toFixed(1);
const r2 = (n: number) => +n.toFixed(2);

function measure(rig: CameraRig, p: Player, W: number, H: number) {
  const cam = rig.camera;
  cam.updateMatrixWorld(true);
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  // visual car: root at the player's lane x, lifted by the render height map (as Vehicle does)
  const y0 = carHeight(p.y, HEIGHT.LOW, HEIGHT.NORMAL, HEIGHT.HIGH, CAR_HALF.y, true) - 0.51;
  const box = new THREE.Box3(new THREE.Vector3(p.x - B.x * s, Math.max(0, y0), B.z0 * s), new THREE.Vector3(p.x + B.x * s, Math.max(0, y0) + B.y * s, B.z1 * s));
  let x0 = 1, x1 = 0, ya = 1, yb = 0;
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
    x0 = Math.min(x0, (c.x + 1) / 2); x1 = Math.max(x1, (c.x + 1) / 2);
    ya = Math.min(ya, (1 - c.y) / 2); yb = Math.max(yb, (1 - c.y) / 2);
  }
  const centre = box.getCenter(new THREE.Vector3());
  // perspective stretch: rear face vs front face apparent scale (1 = orthographic; higher = rear deck looks longer / bigger)
  const pr = (z: number) => { const a = new THREE.Vector3(p.x - 1, centre.y, z).project(cam), b = new THREE.Vector3(p.x + 1, centre.y, z).project(cam); return Math.abs(b.x - a.x); };
  const stretch = pr(B.z1 * s) / pr(B.z0 * s);
  // top-surface share: on-screen height of the car's top (roof + decks) vs its rear face — higher = more of the roof / deck seen
  const yOf = (y: number, z: number) => (1 - new THREE.Vector3(p.x, y, z).project(cam).y) / 2;
  const topH = Math.abs(yOf(box.max.y, B.z1 * s) - yOf(box.max.y, B.z0 * s));
  const rearH = Math.abs(yOf(box.max.y, B.z1 * s) - yOf(box.min.y, B.z1 * s));
  // road readability: where the road centre 40 m / 80 m ahead lands (0 top … 1 bottom) and how wide the 3 lanes look there
  const ahead = (z: number) => { const c = new THREE.Vector3(0, 0, z).project(cam), l = new THREE.Vector3(LANES[0] - 1.3, 0, z).project(cam), r = new THREE.Vector3(LANES[2] + 1.3, 0, z).project(cam); return { y: r2((1 - c.y) / 2), lanesWidth: r2((r.x - l.x) / 2) }; };
  const edgeL = new THREE.Vector3(LANES[0] - 1.3, 0, 0).project(cam), edgeR = new THREE.Vector3(LANES[2] + 1.3, 0, 0).project(cam);
  return {
    target: rig.lookTarget.toArray().map(r2),
    rollDeg: deg(cam.rotation.z),
    rearToFrontScale: +stretch.toFixed(3),
    topToRearFace: +(topH / rearH).toFixed(2),
    road40m: ahead(-40),
    road80m: ahead(-80),
    roadAtCarVisible: { left: r2((edgeL.x + 1) / 2), right: r2((edgeR.x + 1) / 2) },
    position: cam.position.toArray().map(r2),
    lookDirection: dir.toArray().map((n) => +n.toFixed(3)),
    pitchDeg: deg(Math.asin(-dir.y)),
    yawDeg: deg(Math.atan2(dir.x, -dir.z)),
    fovVerticalDeg: +cam.fov.toFixed(1),
    aspect: +cam.aspect.toFixed(3),
    distanceToCarCentre: r2(cam.position.distanceTo(centre)),
    carScreenBox: { left: r2(x0), right: r2(x1), top: r2(ya), bottom: r2(yb) },
    carPx: { w: Math.round((x1 - x0) * W), h: Math.round((yb - ya) * H), of: `${W}×${H}` },
  };
}

for (const [label, W, H] of [['9:16 720×1280', 720, 1280], ['390×844', 390, 844]] as const) {
  const st: Record<string, unknown> = {};
  const run = (name: string, sf: number, turbo: number, act?: (p: Player) => void, frames = 0) => {
    const rig = new CameraRig();
    rig.resize(W / H);
    rig.car3d = true;
    rig.presetOverride = CAMERA.presets[presetName];
    rig.mode = 'run';
    const p = new Player();
    p.reset(1);
    for (let i = 0; i < 120; i++) {
      p.update(1 / 60);
      rig.update(1 / 60, p, sf, turbo);
    }
    if (act) act(p);
    for (let i = 0; i < frames; i++) {
      p.update(1 / 60);
      rig.update(1 / 60, p, sf, turbo);
    }
    st[name] = measure(rig, p, W, H);
  };
  run('drive_start', 0, 0);
  run('drive_mid', 0.4, 0);
  run('drive_top_speed', 1, 0);
  run('turbo', 1, 1);
  run('lane_change_mid', 0.4, 0, (p) => p.input('right'), 7);
  run('lane_change_done', 0.4, 0, (p) => p.input('right'), 40);
  run('jump_rise', 0.4, 0, (p) => p.input('up'), 12);
  run('jump_apex', 0.4, 0, (p) => p.input('up'), 30);
  run('landing', 0.4, 0, (p) => p.input('up'), 62);
  (out.states as Record<string, unknown>)[label] = st;
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
const m = (out.states as Record<string, Record<string, ReturnType<typeof measure>>>)['390×844'];
for (const [k, v] of Object.entries(m)) console.log(k.padEnd(18), 'pos', v.position.join(','), 'pitch', v.pitchDeg, 'fov', v.fovVerticalDeg, 'dist', v.distanceToCarCentre, 'car', v.carPx.w + '×' + v.carPx.h + 'px', 'y', v.carScreenBox.top + '–' + v.carScreenBox.bottom, 'stretch', v.rearToFrontScale, 'top/rear', v.topToRearFace, 'r40', JSON.stringify(v.road40m));
void LANES;
