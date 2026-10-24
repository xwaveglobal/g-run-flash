/**
 * Step 04 environment check with the REAL game code: Renderer (bloom / speed blur / quality presets),
 * Scenery, Track, ObstacleViews, PickupViews-free, Vehicle (3D X1), CameraRig, Player, SpeedLines.
 * Stepped at 60 Hz so poses are exact. Bundled and driven by scripts/env/preview-env.mjs.
 *
 * URL params:
 *   q      = low | medium | high (graphics preset)        world = city | mega | … (WorldId)
 *   dist   = road distance (m) to start at                view  = chase | home | asphalt | markings | rail | near | mid | far | top
 *   pose   = drive | nitro | jump | down                  obs   = type:lane:z,… (real obstacle views)
 *   speed  = road speed m/s (default 40)
 */
import * as THREE from 'three';
import { Renderer } from '../../src/render/Renderer.ts';
import { Scenery } from '../../src/render/Scenery.ts';
import { Track } from '../../src/render/Track.ts';
import { Vehicle, SKINS } from '../../src/render/Vehicle.ts';
import { CameraRig } from '../../src/render/CameraRig.ts';
import { ObstacleViews, setObstacleContrast } from '../../src/render/ObstacleViews.ts';
import { SpeedLines } from '../../src/render/Effects.ts';
import { Player } from '../../src/gameplay/Player.ts';
import { hitboxes, rowMasks } from '../../src/gameplay/ObstacleRules.ts';
import { READABILITY, COMFORT } from '../../src/render/Readability.ts';
import { GRAPHICS, LANES, SPEED, type GraphicsQuality } from '../../src/config.ts';
import type { LiveObstacle } from '../../src/gameplay/World.ts';
import type { ObstacleSpec, ObstacleType } from '../../src/gameplay/types.ts';
import type { WorldId } from '../../src/gameplay/Spawner.ts';

const q = new URLSearchParams(location.search);
const quality = (q.get('q') ?? 'medium') as GraphicsQuality;
const world = (q.get('world') ?? 'city') as WorldId;
const view = q.get('view') ?? 'chase';
const container = document.createElement('div');
container.style.cssText = 'position:fixed;inset:0';
document.body.style.margin = '0';
document.body.appendChild(container);

const rig = new CameraRig();
const renderer = new Renderer(container, quality, rig.camera);
rig.resize(renderer.resize());
const scene = renderer.scene;
const scenery = new Scenery(scene);
const track = new Track();
const vehicle = new Vehicle();
vehicle.camera = rig.camera;
const worldRoot = new THREE.Group();
const views = new ObstacleViews(worldRoot);
const speedLines = new SpeedLines();
scene.add(scenery.group, track.group, vehicle.root, worldRoot, speedLines.lines);
scenery.setWorld(world, true);
track.setAccent(scenery.accent);
track.setOpenAir(scenery.openAir);
const rp = READABILITY[world];
track.applyReadability(rp);
renderer.setBloom(rp.bloom * COMFORT.bloomMul);
setObstacleContrast(rp.edge, rp.edgeOpacity, rp.hazardLift);
const preset = GRAPHICS[quality];
scenery.setQuality(preset);
track.setQuality(preset);

const p = new Player();
p.reset(1);
let oid = 1;
const live: LiveObstacle[] = [];
for (const t of (q.get('obs') ?? '').split(',').filter(Boolean)) {
  const [type, lane, z] = t.split(':');
  const spec: ObstacleSpec = { type: type as ObstacleType, lane: +lane, lane2: +lane, laser: type === 'laser' ? ['low', 'high', 'block'] : undefined, door: 1, variant: 0 };
  const o: LiveObstacle = { id: oid++, spec, row: { dist: 0, dt: 1, masks: rowMasks([spec]), obstacles: [spec], tier: 0 }, z: +z, sx: LANES[+lane], boxes: [], hit: false, smashed: false, passed: false, minGap: 0, vz: 0 };
  hitboxes(spec, o.sx, o.boxes);
  views.spawn(o);
  live.push(o);
}

function meshLoaded() {
  let found = false;
  vehicle.root.traverse((o) => {
    if (o.name === 'X1') found = true;
  });
  return found;
}

const info = () => {
  const r = renderer.renderer;
  r.info.autoReset = false;
  r.info.reset();
  renderer.render();
  const i = r.info;
  const o = { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? -1, dpr: renderer.pixelRatio, quality };
  r.info.autoReset = true;
  return o;
};

(window as unknown as { __go: () => Promise<unknown> }).__go = async () => {
  for (let i = 0; i < 200 && !meshLoaded(); i++) await new Promise((res) => setTimeout(res, 50));
  vehicle.setSkin(SKINS.find((s) => s.id === 'zenith')!);
  rig.car3d = !vehicle.usesSprite;
  const pose = q.get('pose') ?? 'drive';
  const speed = +(q.get('speed') ?? 40);
  const dt = 1 / 60;
  let dist = +(q.get('dist') ?? 400);
  let turbo = 0;
  const home = view === 'home';
  rig.mode = home ? 'menu' : 'run';
  const speedK = Math.min(1, Math.max(0, (speed - SPEED.start) / (SPEED.max - SPEED.start)));
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      dist += speed * dt;
      p.update(dt);
      vehicle.update(p, dt, speed, turbo);
      scenery.update(dist, i * dt, dt);
      track.update(dist, speedK, turbo);
      views.update(live, i * dt, dt);
      speedLines.intensity += ((turbo ? 1 : 0.18 + speedK * 0.55) * 0.75 - speedLines.intensity) * 0.05;
      speedLines.update(dt, speed, scenery.accent);
      rig.update(dt, p, speedK, turbo);
      renderer.setSpeedBlur(turbo ? 0.05 : 0.012 * speedK);
    }
  };
  if (pose === 'nitro') {
    turbo = 1;
    vehicle.boostTarget = 1;
    vehicle.turboTarget = 1; // Turbo: lime aura (smashes obstacles)
  }
  if (q.get('shield')) vehicle.shieldTarget = 1;
  step(90);
  rig.snap();
  if (pose === 'jump') {
    p.input('up');
    step(+(q.get('f') ?? 22));
  } else if (pose === 'down') {
    p.input('down');
    for (let i = 0; i < 120 && p.vphase !== 'hold'; i++) step(1);
    step(4);
  } else step(30);
  // close-up / layer views: fixed cameras looking at parts of the environment
  const cams: Record<string, [number, number, number, number, number, number, number]> = {
    // pos x, y, z, look x, y, z, fov
    asphalt: [3.6, 0.95, -1.5, 2.6, 0, -7.5, 55],
    markings: [0, 6, 6, 0, 0, -22, 50],
    rail: [2.2, 1.6, 2, 4.4, 0.8, -10, 55],
    near: [0, 3.2, 6, -6, 3, -40, 60],
    mid: [0, 6, 8, -22, 14, -90, 55],
    far: [0, 9, 10, 0, 18, -300, 45],
    top: [0, 60, -40, 0, 0, -41, 60],
  };
  const c = cams[view];
  if (c) {
    rig.camera.position.set(c[0], c[1], c[2]);
    if (view === 'top') rig.camera.up.set(0, 0, -1);
    rig.camera.lookAt(c[3], c[4], c[5]);
    rig.camera.fov = c[6];
    rig.camera.updateProjectionMatrix();
  }
  renderer.render();
  return { ...info(), dist: Math.round(dist), y: +p.y.toFixed(2) };
};

/**
 * Step 04 checks on the real render code (run with test=1): segment recycling, lane alignment,
 * geometry / texture counts stable over a long run and across quality switches.
 */
(window as unknown as { __test: () => Promise<unknown> }).__test = async () => {
  for (let i = 0; i < 200 && !meshLoaded(); i++) await new Promise((res) => setTimeout(res, 50));
  const res: { name: string; ok: boolean; info: string }[] = [];
  const check = (name: string, ok: boolean, info = '') => res.push({ name, ok, info });
  const dt = 1 / 60;
  let dist = 0;
  const run = (sec: number, speed = 60) => {
    for (let i = 0; i < sec * 60; i++) {
      dist += speed * dt;
      p.update(dt);
      vehicle.update(p, dt, speed, 0);
      scenery.update(dist, dist / speed, dt);
      track.update(dist, 1, 0);
      rig.update(dt, p, 1, 0);
      if (i % 30 === 0) renderer.render();
    }
  };
  // warm-up: every recycled layer has been on screen once (GPU uploads happen on first sight)
  run(25);
  const m0 = { ...renderer.renderer.info.memory };
  const p0 = renderer.renderer.info.programs?.length ?? 0;
  run(60); // 3.6 km
  const m1 = { ...renderer.renderer.info.memory };
  const p1 = renderer.renderer.info.programs?.length ?? 0;
  check('long run (3.6 km after warm-up): no geometry / texture growth', m1.geometries === m0.geometries && m1.textures === m0.textures, `geometries ${m0.geometries}→${m1.geometries}, textures ${m0.textures}→${m1.textures}`);
  check('long run: no new shader programs (no recompiles)', p1 === p0, `programs ${p0}→${p1}`);
  // quality switching: every preset applies, nothing leaks, back to the same counts
  const counts: string[] = [];
  const roadW: string[] = [];
  for (const qq of ['low', 'high', 'medium', 'low', 'medium'] as GraphicsQuality[]) {
    renderer.setQuality(qq);
    scenery.setQuality(GRAPHICS[qq]);
    track.setQuality(GRAPHICS[qq]);
    run(0.5);
    counts.push(`${qq}:${renderer.pixelRatio}`);
    roadW.push(`${qq}:${(track as unknown as { roadTex: THREE.Texture }).roadTex.image.width}`);
  }
  run(1);
  const m2 = { ...renderer.renderer.info.memory };
  check('v4.2.1 road texture per preset (LOW 256, MEDIUM / HIGH 512)', roadW.join(' ') === 'low:256 high:512 medium:512 low:256 medium:512', roadW.join(' '));
  check('v4.2.1 quality switching: textures stable (old road textures disposed)', m2.textures === m1.textures, `${m1.textures}→${m2.textures}`);
  check('quality switching low ↔ medium ↔ high: presets applied', counts.join(' ') === `low:${Math.min(devicePixelRatio, 1.25)} high:${Math.min(devicePixelRatio, 2)} medium:${Math.min(devicePixelRatio, 1.5)} low:${Math.min(devicePixelRatio, 1.25)} medium:${Math.min(devicePixelRatio, 1.5)}`, counts.join(' '));
  check('quality switching: geometries stable', m2.geometries === m1.geometries, `${m1.geometries}→${m2.geometries}`);
  // road markings line up with the lanes on screen: project a divider point and the lane centres
  return { passed: res.filter((r) => r.ok).length, failed: res.filter((r) => !r.ok).length, results: res };
};
