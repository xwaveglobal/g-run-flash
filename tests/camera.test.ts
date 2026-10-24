/**
 * v4 cameras (render-only): the 3D car stays fully in frame, obstacles at reaction distance are
 * visible above it, the horizon sits in a sane band, and the home orbit keeps the car in the free
 * band above the difficulty panel. HIGH must stay identical to the pre-v4 camera (old rear image).
 */
declare const process: { exit(code: number): never };
import * as THREE from 'three';
import { CameraRig } from '../src/render/CameraRig.ts';
import { Player } from '../src/gameplay/Player.ts';
import { CAMERA, CAR_HALF, FAIRNESS, HEIGHT, LANES, LEVELS, RENDER, SPEED, type ChaseName } from '../src/config.ts';
import { carHeight } from '../src/render/car/carMotion.ts';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    fails++;
    console.error('  ✗ ' + msg);
  } else console.log('  ✓ ' + msg);
};

// the 3D car's in-game box (v4.1.3 model 2.09 × 1.18 × 4.22 m, rear at +2.242, front at −1.976) × scale
const s = RENDER.carScale;
const car = new THREE.Box3(new THREE.Vector3(-1.045 * s, 0, -1.976 * s), new THREE.Vector3(1.045 * s, 1.18 * s, 2.242 * s));
const ASPECTS: [string, number][] = [['9:16', 9 / 16], ['390×844', 390 / 844]];

function rigFor(aspect: number, mode: 'run' | 'menu', preset: ChaseName | null) {
  const rig = new CameraRig();
  rig.resize(aspect);
  rig.car3d = true;
  rig.mode = mode;
  rig.dynamic = true; // the framing checks below are for the moving chase camera (Settings → Camera motion ON)
  if (preset) rig.presetOverride = CAMERA.presets[preset];
  return rig;
}
function screenBox(cam: THREE.PerspectiveCamera, b: THREE.Box3) {
  cam.updateMatrixWorld(true);
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(cam);
    x0 = Math.min(x0, (c.x + 1) / 2);
    x1 = Math.max(x1, (c.x + 1) / 2);
    y0 = Math.min(y0, (1 - c.y) / 2);
    y1 = Math.max(y1, (1 - c.y) / 2);
  }
  return { x0, x1, y0, y1 };
}
const f = (n: number) => n.toFixed(2);

// ---- HIGH == the pre-v4 chase camera (the old rear image keeps its exact framing)
const hi = CAMERA.presets.high;
check(hi.height === 3.25 && hi.back === 6.6 && hi.speedBack === 0.6 && hi.lookY === 1.15 && hi.lookZ === -9 && hi.followX === 0.72 && hi.lookX === 0.55 && hi.fov === 0, 'HIGH preset = the v1–v4.1.0 camera');
{
  const rig = new CameraRig();
  rig.resize(9 / 16);
  rig.car3d = false;
  check(rig.preset === CAMERA.presets.high, 'old rear image always uses HIGH, whatever CAMERA.chase is');
}
check(['low', 'balanced', 'high'].includes(CAMERA.chase), `default chase preset: ${CAMERA.chase}`);

// ---- chase presets
const reactDist = SPEED.max * SPEED.turboMul * LEVELS.hard.speed * FAIRNESS.minRowTime; // metres covered in the minimum reaction time at top speed
for (const name of ['low', 'balanced', 'high'] as const) {
  for (const [label, aspect] of ASPECTS) {
    for (const lane of [0, 1, 2]) {
      const rig = rigFor(aspect, 'run', name);
      const p = new Player();
      p.reset(lane);
      rig.update(1 / 60, p, 1, 0, true);
      const cam = rig.camera;
      const box = car.clone().translate(new THREE.Vector3(LANES[lane], 0, 0));
      const b = screenBox(cam, box);
      const inFrame = b.x0 > 0 && b.x1 < 1 && b.y0 > 0.05 && b.y1 < 0.97;
      // an obstacle (1.7 m crate) in the same lane at reaction distance: some of it above the car's roof
      const crate = new THREE.Box3(new THREE.Vector3(LANES[lane] - 0.85, 0, -reactDist - 0.85), new THREE.Vector3(LANES[lane] + 0.85, 1.7, -reactDist + 0.85));
      const o = screenBox(cam, crate);
      const visible = o.y0 < b.y0 - 0.005;
      const tall = (o.y1 - o.y0) * 844 >= 10; // at least ~10 px tall on a 844 px phone screen
      const horizon = new THREE.Vector3(LANES[lane], 0, -400).project(cam);
      const hy = (1 - horizon.y) / 2;
      if (lane === 1 || !inFrame || !visible || !tall)
        check(inFrame && visible && tall && hy > 0.2 && hy < 0.62, `${name} ${label} lane ${lane}: car in frame [${f(b.x0)}–${f(b.x1)}, ${f(b.y0)}–${f(b.y1)}], crate at ${reactDist.toFixed(0)} m visible above the roof (${f(o.y0)} < ${f(b.y0)}, ${((o.y1 - o.y0) * 844).toFixed(0)} px), horizon ${f(hy)}`);
    }
  }
}
// balanced is the recommended setup: the car reads bigger than on HIGH, with the rear in view
{
  const size = (name: 'balanced' | 'high' | 'low') => {
    const rig = rigFor(390 / 844, 'run', name);
    const p = new Player();
    p.reset(1);
    rig.update(1 / 60, p, 1, 0, true);
    const b = screenBox(rig.camera, car);
    return b.x1 - b.x0;
  };
  check(size('low') > size('balanced') && size('balanced') > size('high'), `car width on screen: low ${f(size('low'))} > balanced ${f(size('balanced'))} > high ${f(size('high'))}`);
}

// ---- v4.2.1 airborne framing: during a normal hop the 3D car stays in the middle band of the screen
// (it used to climb to ~0.36 H and sit over the lane ahead), the camera moves smoothly
{
  const vis = (y: number) => carHeight(y, HEIGHT.LOW, HEIGHT.NORMAL, HEIGHT.HIGH, CAR_HALF.y, true) - 0.51;
  for (const name of ['low', 'balanced'] as const)
    for (const [label, aspect] of ASPECTS) {
      const rig = rigFor(aspect, 'run', name);
      const p = new Player();
      p.reset(1);
      for (let i = 0; i < 60; i++) {
        p.update(1 / 60);
        rig.update(1 / 60, p, 0.5, 0);
      }
      p.input('up');
      let top = 1;
      let bot = 0;
      let step = 0;
      let carStep = 0;
      let crate = 0;
      let prevY = rig.camera.position.y;
      let prevCar = vis(p.y);
      for (let i = 0; i < 110; i++) {
        p.update(1 / 60);
        rig.update(1 / 60, p, 0.5, 0);
        const b0 = vis(p.y);
        const b = screenBox(rig.camera, new THREE.Box3(new THREE.Vector3(car.min.x, b0, car.min.z), new THREE.Vector3(car.max.x, b0 + car.max.y, car.max.z)));
        top = Math.min(top, b.y0);
        bot = Math.max(bot, b.y1);
        step = Math.max(step, Math.abs(rig.camera.position.y - prevY));
        prevY = rig.camera.position.y;
        carStep = Math.max(carStep, Math.abs(b0 - prevCar));
        prevCar = b0;
        // a 1.7 m crate 24–44 m ahead in the same lane: share hidden behind the airborne car
        if (i >= 20 && i < 60)
          for (const z of [24, 30, 36, 44]) {
            const o = screenBox(rig.camera, new THREE.Box3(new THREE.Vector3(-0.85, 0, -z - 0.85), new THREE.Vector3(0.85, 1.7, -z + 0.85)));
            crate = Math.max(crate, Math.max(0, Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0)) / (o.y1 - o.y0));
          }
      }
      // the camera climbs above the car and looks down: the car stays in the middle of the screen and the
      // lane ahead stays visible above it; it never moves faster than the car itself (no snap)
      // (BALANCED is the default; LOW is a close, low camera and keeps more of the car in front of the lane)
      check(top > 0.38 && bot < 0.85 && step <= carStep && crate < (name === 'balanced' ? 0.3 : 1), `${name} ${label} jump: car between ${f(top)} and ${f(bot)} of the height, obstacle ahead hidden ≤ ${(crate * 100).toFixed(0)} %, camera ≤ ${(step * 100).toFixed(1)} cm / frame (car ${(carStep * 100).toFixed(1)})`);
    }
}

// ---- home orbit: constant distance, car inside the free band above the difficulty panel.
// The home UI has fixed CSS sizes, measured on real screenshots: difficulty panel top at 0.676 H
// (360×640, 9:16) / 0.754 H (390×844); side buttons end at 0.50 / 0.40 H and cover x < 0.19, x > 0.81.
const PANEL: Record<string, number> = { '9:16': 0.676, '390×844': 0.754 };
const SIDE: Record<string, number> = { '9:16': 0.5, '390×844': 0.4 };
for (const [label, aspect] of ASPECTS) {
  const rig = rigFor(aspect, 'menu', null);
  const p = new Player();
  p.reset(1);
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  const dists: number[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 30; i++) {
    rig.update(dt, p, 0, 0);
    if (i > 240 && i % 30 === 0) {
      const b = screenBox(rig.camera, car);
      x0 = Math.min(x0, b.x0);
      x1 = Math.max(x1, b.x1);
      y0 = Math.min(y0, b.y0);
      y1 = Math.max(y1, b.y1);
      dists.push(rig.camera.position.distanceTo(new THREE.Vector3(0, rig.camera.position.y, 0)));
    }
  }
  const spread = Math.max(...dists) - Math.min(...dists);
  // the box is the car's 3D bounding box projected (larger than the visible car)
  check(y1 < PANEL[label] - 0.02 && y0 > 0.3, `home ${label}: car between ${f(y0)} and ${f(y1)} of the height — clear of the difficulty panel at ${PANEL[label]}`);
  check(x0 > 0.03 && x1 < 0.97 && (y0 > SIDE[label] || (x0 > 0.12 && x1 < 0.88)), `home ${label}: car x ${f(x0)}–${f(x1)} stays clear of the side buttons`);
  check(spread < 0.05, `home ${label}: orbit distance constant (spread ${spread.toFixed(3)} m)`);
}

// v4.6 Settings "Camera motion": OFF (default) = fixed view — lane changes, jumps and dives never move
// the race camera; the car stays fully on screen in every lane. ON = the camera moves with the car as before.
{
  const trial = (dynamic: boolean, aspect: number) => {
    const rig = rigFor(aspect, 'run', null);
    rig.dynamic = dynamic;
    const p = new Player();
    p.reset(1);
    const step = (n: number) => { for (let i = 0; i < n; i++) { p.update(1 / 60); rig.update(1 / 60, p, 0.4, 0); } };
    step(120);
    const pos0 = rig.camera.position.clone();
    const q0 = rig.camera.quaternion.clone();
    let move = 0, ang = 0, worstEdge = 1;
    const track = () => {
      move = Math.max(move, rig.camera.position.distanceTo(pos0));
      ang = Math.max(ang, (rig.camera.quaternion.angleTo(q0) * 180) / Math.PI);
      const vy = carHeight(p.y, HEIGHT.LOW, HEIGHT.NORMAL, HEIGHT.HIGH, CAR_HALF.y, true) - 0.51;
      // fixed view draws the car RENDER.carScaleFixed / carScale bigger (and 15 % taller)
      const k = dynamic ? 1 : RENDER.carScaleFixed / RENDER.carScale;
      const big = new THREE.Box3(car.min.clone().multiply(new THREE.Vector3(k, k * RENDER.carHeightScale, k)), car.max.clone().multiply(new THREE.Vector3(k, k * RENDER.carHeightScale, k)));
      const b = screenBox(rig.camera, big.translate(new THREE.Vector3(p.x, Math.max(0, vy), 0)));
      worstEdge = Math.min(worstEdge, b.x0, 1 - b.x1, b.y0, 1 - b.y1);
    };
    for (const a of ['left', 'up', 'down', 'right', 'right', 'up', 'down'] as const) {
      p.input(a);
      for (let i = 0; i < 70; i++) { step(1); track(); }
    }
    return { move, ang, worstEdge };
  };
  check(new CameraRig().dynamic === false, 'Camera motion is OFF by default');
  for (const [label, aspect] of ASPECTS) {
    const off = trial(false, aspect), on = trial(true, aspect);
    check(off.move < 0.02 && off.ang < 0.05, `${label} Camera motion OFF: lanes / jumps / dives never move the camera (max ${(off.move * 100).toFixed(1)} cm, ${off.ang.toFixed(3)}°)`);
    check(off.worstEdge > 0, `${label} Camera motion OFF: the car stays fully on screen in every lane, jumping and diving (closest edge ${(off.worstEdge * 100).toFixed(1)} % of the screen)`);
    check(on.move > 0.5, `${label} Camera motion ON: the camera follows as before (moves up to ${on.move.toFixed(2)} m)`);
  }
}

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
if (fails) process.exit(1);
