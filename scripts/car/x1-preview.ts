/**
 * Visual check of the in-game 3D car with the REAL game code (Vehicle + MeshCar + CameraRig + Player),
 * stepped frame by frame so poses are exact. Bundled and driven by scripts/car/preview-x1.mjs.
 * Output is 9:16 (720 × 1280).
 *
 * URL params:
 *   view    = chase | rear0 | rl45 | rr45 | side90 | diff (low rear close-up) | deck (spoiler close-up)
 *   pose    = drive | lane | jump | land | nitro
 *   cam     = low | balanced | high (chase preset; default = CAMERA.chase)
 *   spoiler = 0 | 1 (force closed / raised)
 *   blocks  = 1 (obstacle blocks on the road, to judge readability)
 *   car     = mesh | sprite (config RENDER override)
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Vehicle, SKINS } from '../../src/render/Vehicle.ts';
import { CameraRig } from '../../src/render/CameraRig.ts';
import { Player } from '../../src/gameplay/Player.ts';
import { CAMERA, LANES } from '../../src/config.ts';
import { ObstacleViews } from '../../src/render/ObstacleViews.ts';
import { DebugCollision, solidBounds } from '../../src/render/DebugCollision.ts';
import { makeShield } from '../../src/render/Effects.ts';
import { hitboxes, rowMasks } from '../../src/gameplay/ObstacleRules.ts';
import type { LiveObstacle } from '../../src/gameplay/World.ts';
import type { ObstacleSpec, ObstacleType } from '../../src/gameplay/types.ts';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') ?? 720);
const H = +(q.get('h') ?? 1280);
const view = q.get('view') ?? 'chase';
const studio = view !== 'chase' && view !== 'home';
const followCamera = new THREE.PerspectiveCamera(34, W / H, 0.1, 300);
const followAt = new THREE.Vector3();
function followCam(at: THREE.Vector3) {
  followAt.copy(at);
  followCamera.position.set(at.x - 2.7, at.y + 1.35, at.z + 7.4);
  followCamera.lookAt(at.x + 0.15, at.y - 0.15, at.z + 0.2);
  return followCamera;
}
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H);
r.outputColorSpace = THREE.SRGBColorSpace;
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 1.05;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(r);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
(scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = studio ? 0.8 : 0.6;
scene.background = new THREE.Color(studio ? 0xe9eaee : 0x2a1846);
if (!studio) scene.fog = new THREE.Fog(0x8c6aa8, 60, 330);
// game-like light rig (city world: hemisphere + warm sun + cool rim)
scene.add(new THREE.HemisphereLight(0xbfd4ff, studio ? 0xcfd2d8 : 0x5a3d6e, studio ? 0.8 : 1.1));
const sun = new THREE.DirectionalLight(studio ? 0xffffff : 0xffc59a, studio ? 1.6 : 2.2);
sun.position.set(-6, 10, -8);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x9fdcff, 1.0);
rim.position.set(5, 4, 8);
scene.add(rim);
// road
const road = new THREE.Mesh(new THREE.PlaneGeometry(studio ? 40 : 8.6, 400), new THREE.MeshStandardMaterial({ color: studio ? 0xdfe1e5 : 0x3a3d48, roughness: 0.6, metalness: studio ? 0 : 0.4 }));
road.rotation.x = -Math.PI / 2;
road.position.z = -160;
scene.add(road);
if (!studio) {
  for (const x of [-1.3, 1.3])
    for (let z = 20; z > -300; z -= 6) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.6), new THREE.MeshBasicMaterial({ color: 0xe8ecff }));
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.01, z);
      scene.add(d);
    }
  for (const x of [-4.3, 4.3]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 400), new THREE.MeshStandardMaterial({ color: 0x24305a, emissive: 0x39b6ff, emissiveIntensity: 0.15 }));
    rail.position.set(x, 0.6, -160);
    scene.add(rail);
  }
}
if (q.get('blocks')) {
  // crates (1.7 m) and an overhead beam at typical reaction distances, in different lanes
  const mat = new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0x7a2a00, emissiveIntensity: 0.4 });
  for (const [lane, z] of [[1, -22], [0, -34], [2, -34], [1, -52], [0, -70]] as [number, number][]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), mat);
    b.position.set(LANES[lane], 0.85, z);
    scene.add(b);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0xd04dff, emissive: 0x5a0a7a, emissiveIntensity: 0.5 }));
  beam.position.set(LANES[2], 2.1, -46);
  scene.add(beam);
}

const v = new Vehicle();
scene.add(v.root, v.crash.group);
const rig = new CameraRig();
rig.resize(W / H);
v.camera = rig.camera;
rig.mode = 'run';
const camQ = q.get('cam') as 'low' | 'balanced' | 'high' | null;
if (camQ) rig.presetOverride = CAMERA.presets[camQ];
const p = new Player();
p.reset(1);

// real obstacle views at fixed z (obs=type:lane:z,…), with their real collision boxes
const views = new ObstacleViews(scene);
const live: LiveObstacle[] = [];
let oid = 1;
function addObstacle(spec: ObstacleSpec, z: number) {
  const o: LiveObstacle = { id: oid++, spec, row: { dist: 0, dt: 1, masks: rowMasks([spec]), obstacles: [spec], tier: 0 }, z, sx: LANES[spec.lane], boxes: [], hit: false, smashed: false, passed: false, minGap: 0, vz: 0 };
  hitboxes(o.spec, o.sx, o.boxes);
  for (const b of o.boxes) {
    b.minZ += z;
    b.maxZ += z;
  }
  views.spawn(o);
  views.update([o], 0, 0);
  live.push(o);
  return o;
}
const specOf = (type: string, lane: number): ObstacleSpec => ({
  type: type as ObstacleType,
  lane,
  lane2: lane,
  laser: type === 'laser' ? ['low', 'high', 'block'] : undefined,
  door: 1,
  variant: 0,
});
for (const t of (q.get('obs') ?? '').split(',').filter(Boolean)) {
  const [type, lane, z] = t.split(':');
  addObstacle(specOf(type, +lane), +z);
}
const debugOverlay = q.get('debug') === 'collision' ? new DebugCollision() : null;
if (debugOverlay) scene.add(debugOverlay.group);

function meshLoaded() {
  let found = false;
  v.root.traverse((o) => {
    if (o.name === 'X1') found = true;
  });
  return q.get('car') === 'sprite' ? true : found;
}

(window as unknown as { __go: () => Promise<unknown> }).__go = async () => {
  for (let i = 0; i < 200 && !meshLoaded(); i++) await new Promise((res) => setTimeout(res, 50));
  v.setSkin(SKINS.find((s) => s.id === (q.get('skin') ?? 'zenith'))!);
  rig.car3d = !v.usesSprite;
  const mesh = (v as unknown as { mesh: { spoilerForce: number | null; spoilerK: number } | null }).mesh;
  if (mesh && q.get('spoiler') !== null) mesh.spoilerForce = +q.get('spoiler')!;
  const pose = q.get('pose') ?? 'drive';
  const dt = 1 / 60;
  // sf = speed factor 0..1 (camera pull-back / FOV with speed, wheel spin); default a mid-run 0.4
  const sf = +(q.get('sf') ?? 0.4);
  const speed = 21 + 25 * sf;
  let turbo = 0;
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      p.update(dt);
      v.update(p, dt, speed, turbo);
      rig.update(dt, p, sf, turbo);
    }
  };
  if (q.get('shield')) v.shieldTarget = 1;
  if (q.get('turbo')) v.turboTarget = 1; // Turbo (smashes obstacles): lime aura
  if (q.get('ghost')) v.showcase = { kind: 'ghost', e: 1 };
  step(60);
  rig.snap();
  if (pose === 'lane') {
    p.input(q.get('dir') === 'left' ? 'left' : 'right');
    step(7); // mid lane change: body rolls and yaws, front wheels steer
  } else if (pose === 'jump') {
    p.input('up');
    step(9); // rising: nose up
  } else if (pose === 'land') {
    p.input('up');
    let prevAir = 0;
    for (let i = 0; i < 200; i++) {
      step(1);
      if (prevAir > 0.3 && p.air < 0.05) break;
      prevAir = p.air;
    }
    step(4); // just after touch-down: body dips
  } else if (pose === 'nitro') {
    turbo = 1;
    v.boostTarget = 1;
    step(40);
  } else if (pose === 'air') {
    p.input('up');
    step(30); // airborne, spoiler up
  } else if (pose === 'jumpnitro') {
    turbo = 1;
    v.boostTarget = 1;
    step(30);
    p.input('up');
    step(30);
  } else if (pose === 'down') {
    p.input('down');
    for (let i = 0; i < 120 && p.vphase !== 'hold'; i++) step(1);
    step(6); // holding low: wheels folded, body down
  } else if (pose === 'takeoff') {
    p.input('up');
    step(+(q.get('f') ?? 5));
  } else if (pose === 'descend') {
    p.input('up');
    for (let i = 0; i < 300 && p.vphase !== 'recover'; i++) step(1);
    step(+(q.get('f') ?? 4)); // coming down, still airborne
  } else if (pose === 'landing') {
    p.input('up');
    for (let i = 0; i < 300 && p.vmode !== 'up'; i++) step(1);
    for (let i = 0; i < 300 && p.vmode === 'up'; i++) step(1);
    step(Math.round(+(q.get('after') ?? 0.45) * 60)); // after touch-down: spoiler retracting
  }
  if (q.get('sweep')) {
    v.boostKick(1);
    step(+(q.get('sweep') ?? 12));
  }
  // crash presentation: impact=<seconds after the hit> (the game stops updating the car and settles it)
  if (q.get('impact') !== null) {
    v.crashRecoil();
    v.crashBreak();
    rig.shake(0.45);
    const n = Math.round(+q.get('impact')! * 60);
    for (let i = 0; i < n; i++) {
      v.crashUpdate(dt);
      rig.update(dt, p, 0, 0);
    }
  }
  // collision check: a crate whose front face touches the hitbox front (the moment a hit registers)
  if (q.get('crate')) {
    const hb = p.hitbox({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), new THREE.MeshStandardMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.75 }));
    crate.position.set(p.x, 0.85, hb.minZ - 0.85);
    scene.add(crate);
    if (q.get('crash')) v.crashRecoil();
  }
  if (q.get('hitbox')) {
    const hb = p.hitbox({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
    const g = new THREE.BoxGeometry(hb.maxX - hb.minX, hb.maxY - hb.minY, hb.maxZ - hb.minZ);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x00c853, depthTest: false }));
    box.position.set((hb.minX + hb.maxX) / 2, (hb.minY + hb.maxY) / 2, (hb.minZ + hb.maxZ) / 2);
    box.renderOrder = 20;
    scene.add(box);
  }
  if (view === 'home') {
    // home screen camera: orbit phase t (seconds) — the game steps the rig in 'menu' mode
    rig.mode = 'menu';
    const t = +(q.get('t') ?? 0);
    for (let i = 0; i < Math.round(t * 60) + 120; i++) {
      v.update(p, dt, 0, 0);
      rig.update(dt, p, 0, 0);
    }
  }
  // the car's on-screen bounds (fractions of width / height, 0 = left / top)
  const bounds = () => {
    const car = v.root.getObjectByName('X1') ?? v.root;
    car.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(car);
    const cam = rig.camera;
    cam.updateMatrixWorld(true);
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
      x0 = Math.min(x0, (c.x + 1) / 2); x1 = Math.max(x1, (c.x + 1) / 2);
      y0 = Math.min(y0, (1 - c.y) / 2); y1 = Math.max(y1, (1 - c.y) / 2);
    }
    return [x0, x1, y0, y1].map((n) => +n.toFixed(3));
  };
  if (q.get('oldshield')) {
    // the pre-v4.1.3 3D shield (mote cloud from Effects.makeShield), placed exactly as Game did
    const sh = makeShield();
    sh.mesh.visible = true;
    sh.mesh.position.copy(v.root.position);
    sh.mesh.quaternion.copy(v.root.quaternion);
    sh.mat.uniforms.time.value = 3.2;
    scene.add(sh.mesh);
  }
  if (debugOverlay) {
    const hb = p.hitbox({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
    debugOverlay.update(hb, v.visualObject, live.map((o) => ({ boxes: o.boxes, view: views.viewOf(o.id) })));
  }
  if (view === 'follow') {
    // close rear-left camera that follows the car (shows the deck and the spoiler)
    const cam = followCam(v.root.position);
    v.camera = cam;
    v.update(p, 0, speed, turbo);
    r.render(scene, cam);
  } else if (studio && view !== 'home') {
    const shots: Record<string, [number, number, number, number, number]> = {
      // yaw (deg), distance, camera height, look height, fov
      rear0: [0, 10.5, 1.35, 0.45, 16],
      rl45: [-45, 24, 2.4, 0.42, 16],
      rr45: [45, 24, 2.4, 0.42, 16],
      side90: [-90, 19, 0.9, 0.45, 16],
      diff: [-18, 5.6, 0.42, 0.24, 22],
      deck: [-62, 4.6, 1.0, 0.62, 24],
      fl45: [-140, 22, 2.2, 0.42, 16],
      sidec: [-90, 11, 0.9, 0.55, 22],
      front45: [-140, 8.5, 1.0, 0.36, 22],
      wheelf: [-115, 5.2, 1.2, 0.4, 24],
      wheelfl: [-60, 5.2, 0.9, 0.4, 24],
      front0: [180, 9.5, 0.75, 0.42, 20],
      top: [0.01, 0.01, 30, 0, 22],
      sideg: [-90, 26, 1.0, 0.8, 22],
      reargame: [0, 14, 2.4, 0.9, 30],
    };
    const [yd, dist, ch, ly, fov] = shots[view] ?? shots.rear0;
    const yaw = THREE.MathUtils.degToRad(yd);
    const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 300);
    // studio shots look at the rear half of the car (the subject of Step 03)
    const zc = +(q.get('zc') ?? (view === 'side90' || view === 'rl45' || view === 'rr45' || view === 'fl45' || view === 'top' || view === 'sideg' ? 0 : view === 'sidec' || view === 'front45' || view === 'front0' || view === 'wheelf' || view === 'wheelfl' ? -1.2 : view === 'deck' ? 1.45 : 0.9));
    cam.position.set(p.x + Math.sin(yaw) * dist, ch, zc + Math.cos(yaw) * dist);
    if (view === 'top') cam.up.set(0, 0, -1);
    cam.lookAt(p.x, ly, zc);
    v.camera = cam;
    v.update(p, 0, speed, turbo);
    r.render(scene, cam);
  } else {
    r.render(scene, rig.camera);
    // the old rear image lives on the overlay layer (drawn last by the game's Renderer)
    r.autoClear = false;
    r.clearDepth();
    const bg = scene.background;
    scene.background = null;
    rig.camera.layers.set(1);
    r.render(scene, rig.camera);
    rig.camera.layers.set(0);
    scene.background = bg;
    r.autoClear = true;
  }
  return { box: view === 'chase' || view === 'home' ? bounds() : null, air: +p.air.toFixed(3), x: +p.x.toFixed(3), y: +p.y.toFixed(3), spoiler: mesh ? +mesh.spoilerK.toFixed(3) : null, cam: rig.camera.position.toArray().map((n) => +n.toFixed(2)), fov: +rig.camera.fov.toFixed(1) };
};

/**
 * Deterministic animation capture (the real Vehicle / MeshCar / Player code, 60 Hz steps).
 *   seq=jump       normal → jump → airborne → landing → normal
 *   seq=nitrojump  normal → nitro → jump → landing → nitro end → normal
 * Returns one PNG data URL every `every` frames plus the state at that frame.
 */
(window as unknown as { __seq: () => Promise<unknown> }).__seq = async () => {
  for (let i = 0; i < 200 && !meshLoaded(); i++) await new Promise((res) => setTimeout(res, 50));
  v.setSkin(SKINS[0]);
  rig.car3d = true;
  const name = q.get('seq') ?? 'jump';
  const every = +(q.get('every') ?? 4);
  const dt = 1 / 60;
  const mesh = (v as unknown as { mesh: { spoilerK: number } }).mesh;
  let turbo = 0;
  const frames: { url: string; t: number; spoiler: number; jumping: boolean; nitro: number; air: number; label: string }[] = [];
  // timeline (seconds): events fire once
  const events: [number, string][] =
    name === 'nitrojump'
      ? [[0.6, 'nitro on'], [1.4, 'jump'], [3.6, 'nitro off']]
      : [[0.8, 'jump']];
  const total = name === 'nitrojump' ? 5.6 : 4.2;
  let phase = 'normal';
  const n = Math.round(total * 60);
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    for (const [et, ev] of events)
      if (Math.abs(t - et) < dt / 2) {
        if (ev === 'jump') p.input('up');
        if (ev === 'nitro on') {
          turbo = 1;
          v.boostTarget = 1;
        }
        if (ev === 'nitro off') {
          turbo = 0;
          v.boostTarget = 0;
        }
      }
    p.update(dt);
    v.update(p, dt, 30, turbo);
    rig.update(dt, p, 0.4, turbo);
    const jumping = p.vmode === 'up';
    phase = jumping ? (p.air > 0.6 ? 'airborne' : p.vphase === 'recover' ? 'landing' : 'take-off') : turbo > 0 ? 'nitro' : mesh.spoilerK > 0.02 ? 'retracting' : 'normal';
    if (i % every === 0) {
      const cam = q.get('view') === 'chase' ? rig.camera : followCam(v.root.position);
      v.camera = cam;
      r.render(scene, cam);
      frames.push({ url: r.domElement.toDataURL('image/png'), t: +t.toFixed(2), spoiler: +mesh.spoilerK.toFixed(3), jumping, nitro: turbo, air: +p.air.toFixed(2), label: phase });
    }
  }
  return frames;
};

/** Phase 1 measurements: car visual bounds vs hitbox, each obstacle's visual bounds vs collision boxes. */
(window as unknown as { __measure: () => Promise<unknown> }).__measure = async () => {
  for (let i = 0; i < 200 && !meshLoaded(); i++) await new Promise((res) => setTimeout(res, 50));
  v.setSkin(SKINS.find((s) => s.id === 'zenith')!);
  for (let i = 0; i < 60; i++) {
    p.update(1 / 60);
    v.update(p, 1 / 60, 30, 0);
  }
  const r3 = (b: THREE.Box3) => ({ min: b.min.toArray().map((n) => +n.toFixed(3)), max: b.max.toArray().map((n) => +n.toFixed(3)) });
  const hb = p.hitbox({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
  const car = solidBounds(v.visualObject!, new THREE.Box3());
  const root = v.root.position.toArray().map((n) => +n.toFixed(3));
  const obstacles: Record<string, unknown> = {};
  for (const type of ['crate', 'barrier', 'beam', 'drone', 'platform', 'traffic', 'asteroid', 'ring', 'laser', 'gate']) {
    const o = addObstacle(specOf(type, 1), 0);
    const parts: { name: string; box: THREE.Box3 }[] = [];
    const vis = solidBounds(views.viewOf(o.id)!, new THREE.Box3(), parts);
    const col = new THREE.Box3();
    for (const b of o.boxes) col.union(new THREE.Box3(new THREE.Vector3(b.minX, b.minY, b.minZ), new THREE.Vector3(b.maxX, b.maxY, b.maxZ)));
    // parts that reach outside the collision volume (x / y / z), biggest first
    const out = parts
      .map((pt) => ({ name: pt.name, over: Math.max(col.min.x - pt.box.min.x, pt.box.max.x - col.max.x, col.min.y - pt.box.min.y, pt.box.max.y - col.max.y, col.min.z - pt.box.min.z, pt.box.max.z - col.max.z), ...r3(pt.box) }))
      .filter((pt) => pt.over > 0.02)
      .sort((a, b) => b.over - a.over)
      .slice(0, 4);
    obstacles[type] = { visual: r3(vis), collision: r3(col), boxes: o.boxes.length, outside: out };
    views.despawn(o);
    live.pop();
  }
  return { player: { x: p.x, y: p.y }, root, hitbox: hb, carVisual: r3(car), obstacles };
};

/**
 * v4.1.3 VFX regression checks on the REAL Vehicle / MeshCar / CarFx code in a browser (WebGL).
 * Run: node scripts/car/preview-x1.mjs <dir> "selftest=1=vfx_selftest" → <dir>/vfx_selftest.json
 */
(window as unknown as { __selftest: () => Promise<unknown> }).__selftest = async () => {
  for (let i = 0; i < 200 && !meshLoaded(); i++) await new Promise((res) => setTimeout(res, 50));
  v.setSkin(SKINS.find((s) => s.id === 'zenith')!);
  const mesh = (v as unknown as { mesh: import('../../src/render/car/MeshCar.ts').MeshCar }).mesh;
  const dt = 1 / 60;
  const results: { name: string; ok: boolean; info: string }[] = [];
  const check = (name: string, ok: boolean, info = '') => results.push({ name, ok, info });
  // hitbox size and z span (x follows the lane)
  const hb = () => {
    const b = p.hitbox({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
    return JSON.stringify([+(b.maxX - b.minX).toFixed(4), +(b.maxY - b.minY).toFixed(4), b.minZ, b.maxZ]);
  };
  let turbo = 0;
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      p.update(dt);
      v.update(p, dt, 30, turbo);
      rig.update(dt, p, 0.4, turbo);
    }
  };
  const finite = () => {
    let ok = true;
    v.root.updateMatrixWorld(true);
    v.root.traverse((o) => {
      for (const e of o.matrixWorld.elements) if (!Number.isFinite(e)) ok = false;
    });
    return ok;
  };
  const aura = mesh.aura;
  step(30);
  const hbBefore = hb();
  // shield on → visible around the car; off → fades out and hides (nothing left behind)
  v.shieldTarget = 1;
  step(30);
  check('shield activates: aura visible', aura.mesh.visible && aura.k > 0.95, `k ${aura.k.toFixed(3)}`);
  check('aura is attached to the car pose (follows lane changes / jumps)', aura.mesh.parent === mesh.root, '');
  p.input('right');
  step(20);
  const ax = aura.mesh.getWorldPosition(new THREE.Vector3()).x;
  check('aura followed the lane change', Math.abs(ax - p.x) < 0.05, `aura x ${ax.toFixed(2)}, car x ${p.x.toFixed(2)}`);
  // shield + jump
  p.input('up');
  step(30);
  const ay = aura.mesh.getWorldPosition(new THREE.Vector3()).y;
  const groundY = mesh.root.getWorldPosition(new THREE.Vector3()).y;
  check('shield + jump: aura rises with the car', aura.mesh.visible && Math.abs(ay - groundY) < 0.05 && ay > 1.5, `aura y ${ay.toFixed(2)}, car underside ${groundY.toFixed(2)}`);
  for (let i = 0; i < 300 && p.vmode === 'up'; i++) step(1);
  // shield + nitro
  turbo = 1;
  v.boostTarget = 1;
  step(40);
  check('shield + nitro: both visible, spoiler open', aura.mesh.visible && mesh.spoilerK > 0.95, `aura ${aura.k.toFixed(2)}, spoiler ${mesh.spoilerK.toFixed(2)}`);
  turbo = 0;
  v.boostTarget = 0;
  step(240); // the boost light envelope fades first, then hold 0.25 s, then the slower close
  check('nitro end (no jump): spoiler retracted', mesh.spoilerK < 0.03, `spoiler ${mesh.spoilerK.toFixed(3)}`);
  // Turbo aura (Turbo smashes obstacles): on with the shield, both visible, Turbo shell outside
  v.turboTarget = 1;
  step(30);
  const ta = mesh.turboAura;
  check('turbo: lime aura visible, follows the car', ta.mesh.visible && ta.k > 0.95 && ta.mesh.parent === mesh.root, `k ${ta.k.toFixed(2)}`);
  check('turbo + shield: both shells, turbo outside', aura.mesh.visible && ta.mesh.scale.x > aura.mesh.scale.x, `${ta.mesh.scale.x.toFixed(2)} > ${aura.mesh.scale.x.toFixed(2)}`);
  v.turboTarget = 0;
  step(90);
  check('turbo ends: its aura fades out and hides', !ta.mesh.visible && ta.k === 0, `k ${ta.k}`);
  v.shieldTarget = 0;
  step(90);
  check('shield expires: aura faded out and hidden', !aura.mesh.visible && aura.k === 0, `k ${aura.k}`);
  // phase ghost → materials restored exactly
  v.showcase = { kind: 'ghost', e: 1 };
  step(10);
  check('ghost on: car translucent with edge light', !mesh.materialsRestored && mesh.fx.uFxGhost.value > 0, `rim ${mesh.fx.uFxGhost.value}`);
  turbo = 1;
  v.boostTarget = 1;
  step(20);
  check('ghost + nitro: thrust visible while translucent', mesh.spoilerK > 0.5, `spoiler ${mesh.spoilerK.toFixed(2)}`);
  turbo = 0;
  v.boostTarget = 0;
  v.showcase = null;
  step(5);
  check('ghost off: every material restored exactly', mesh.materialsRestored, '');
  // dive
  p.input('down');
  for (let i = 0; i < 120 && p.vphase !== 'hold'; i++) step(1);
  step(10);
  const sq = v.root.getObjectByName('X1')!.scale;
  check('DOWN: car pressed toward the road', sq.y < 0.6 && sq.x > 0.76, `scale ${sq.x.toFixed(3)} / ${sq.y.toFixed(3)}`);
  for (let i = 0; i < 300 && p.vmode === 'down'; i++) step(1);
  step(40);
  check('DOWN released: back to normal shape', Math.abs(sq.y - 0.76) < 0.005, `scale y ${sq.y.toFixed(4)}`);
  // crash → debris → cleanup; restart restores the intact car
  v.crashRecoil();
  v.crashBreak();
  check('crash: flash + shards spawned', v.crash.visibleCount >= 10, `${v.crash.visibleCount} pieces`);
  check('crash: car stays visible', v.root.visible && mesh.root.visible, '');
  for (let i = 0; i < 30; i++) v.crashUpdate(dt);
  check('crash: no missing / invalid transforms mid-crash', finite(), '');
  for (let i = 0; i < 120; i++) v.crashUpdate(dt);
  check('crash: debris cleaned up by itself', v.crash.visibleCount === 0, `${v.crash.visibleCount} left`);
  check('game over: spoiler settled closed (stable pose)', mesh.spoilerK < 0.03, `spoiler ${mesh.spoilerK.toFixed(3)}`);
  v.crashBreak();
  for (let i = 0; i < 10; i++) v.crashUpdate(dt);
  v.resetPose();
  v.resetFx();
  check('restart mid-crash: no debris left', v.crash.visibleCount === 0, '');
  const mroot = v.root.getObjectByName('X1')!;
  const k0 = mesh.spoilerK;
  p.reset(1);
  step(1);
  check('restart: intact car (scale, recoil, spoiler)', Math.abs(mroot.scale.y - 0.76) < 1e-6 && mesh.root.position.z === 0 && k0 === 0, `scale ${mroot.scale.y}, z ${mesh.root.position.z}, spoiler ${k0}`);
  step(30);
  check('restart: car updates normally, transforms finite', finite(), '');
  check('gameplay hitbox unchanged by every effect', hb() === hbBefore, `${hbBefore} → ${hb()}`);
  return { passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
};
