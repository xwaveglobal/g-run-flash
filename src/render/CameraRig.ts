import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.ts';
import type { Player } from '../gameplay/Player.ts';
import { CAMERA, LANES, type ChasePreset } from '../config.ts';

export type CamMode = 'menu' | 'garage' | 'run' | 'crash';

/**
 * Third-person chase camera. Follows lane changes with lag, lifts a little with
 * FLY UP so the move reads on screen, widens FOV with speed, adds gentle
 * Temple-Run-style sway and trauma-based shake on impacts.
 */
export class CameraRig {
  camera: THREE.PerspectiveCamera;
  mode: CamMode = 'menu';
  /** the car is drawn from its rear render: menu / garage cameras sway behind it instead of orbiting */
  rearOnly = false;
  /** v4: the 3D car is on screen → home uses CAMERA.home, the race uses the CAMERA.chase preset */
  car3d = false;
  /**
   * v4.6 Settings "Camera motion": true = the race camera moves with the car as before (follows lane
   * changes, lifts on jumps, drops on dives, sways and rolls); false (default) = a fixed view down the
   * centre of the road — lane changes, jumps and dives never change its position or angle. Only flights
   * far above a normal hop (Roadster / HYPER / SOS) still lift it, so the car never leaves the screen.
   */
  dynamic = false;
  /** override the chase preset (previews / tests); null = CAMERA.chase */
  presetOverride: ChasePreset | null = null;
  get preset(): ChasePreset {
    return this.presetOverride ?? (this.car3d ? CAMERA.presets[CAMERA.chase] : CAMERA.presets.high);
  }
  private pos = new THREE.Vector3(0, 3, 7);
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private look = new THREE.Vector3(0, 1.2, -8);
  /** current look-at point (read-only; reports / tests) */
  get lookTarget(): THREE.Vector3 {
    return this.look;
  }
  private trauma = 0;
  /** steady low shake floor (Turbo: light camera shake) */
  rumble = 0;
  private time = 0;
  private baseFov = 70;
  private pushBack = 0;
  private orbit = 0;
  /** cinematic swing (seconds left / total) */
  private swingT = 0;
  private swingDur = 0;
  /** slow camera swing around the car, e.g. during the Roadster roll */
  swing(dur: number) {
    this.swingT = this.swingDur = dur;
  }
  private roll = 0;
  fovKick = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(70, 9 / 16, 0.1, 1500);
  }

  resize(aspect: number) {
    // keep a ~72° horizontal view so all three lanes stay readable in portrait
    const hfov = THREE.MathUtils.degToRad(72);
    let v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
    const clamped = clamp(v, 52, 80);
    this.pushBack = v > 80 ? (v - 80) * 0.07 : 0;
    v = clamped;
    this.baseFov = v;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.aspect = aspect;
  }
  private aspect = 9 / 16;

  /**
   * v4.6 fixed view: how far back the camera must sit so the car's outer edge in an outer lane stays
   * `CAMERA.fixed.margin` of the screen width inside the frame — computed for this screen's aspect, so
   * the car is as large as the screen allows (wider phones / tablets: closer camera, bigger car).
   */
  private fixedBack(C: ChasePreset) {
    const F = CAMERA.fixed;
    const vfov = THREE.MathUtils.degToRad(this.baseFov + C.fov);
    const tanH = Math.tan(vfov / 2) * this.aspect;
    const edge = LANES[2] + F.carHalfW;
    const need = edge / (tanH * (1 - 2 * F.margin)) + F.carRear; // camera z: that distance in front of the car's rear corner
    return Math.max(0, need - (C.back + this.pushBack));
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snap() {
    this.update(1, null, 0, 0, true);
  }

  update(dt: number, p: Player | null, speedFactor: number, turbo: number, snap = false) {
    this.time += dt;
    const t = this.time;
    const px = p?.x ?? 0;
    const py = p?.y ?? 1;
    const wantPos = this.wantPos; // v4.6 perf: reused every frame (no allocation)
    const wantLook = this.wantLook;
    let fov = this.baseFov;

    switch (this.mode) {
      case 'menu': {
        this.orbit += dt * 0.25;
        // slow three-quarter showcase orbit; look point below the car lifts it into the
        // gap between the logo and the menu buttons
        if (this.car3d) {
          // v4 home: slow three-quarter orbit behind the 3D car, constant distance (constant size)
          const H = CAMERA.home;
          const yaw = H.yaw + H.yawSwing * Math.sin(this.orbit * (H.speed / 0.25));
          wantPos.set(px + Math.sin(yaw) * H.dist, H.height, Math.cos(yaw) * H.dist);
          wantLook.set(px, H.lookY, H.lookZ);
          fov = this.baseFov * H.fovScale;
        } else if (this.rearOnly) {
          // showroom: glide between camera shots every ~5 s — wide chase, low hero, close left/right, high crane
          const SHOTS: [number, number, number, number, number][] = [
            // yaw, height, distance, look-y, fov scale
            [0, 2.5, 7.4, 0.65, 0.8],
            [-0.32, 1.25, 5.6, 0.75, 0.86],
            [0.3, 1.6, 5.2, 0.7, 0.84],
            [0, 4.6, 8.6, 0.2, 0.74],
            [-0.18, 0.95, 4.6, 0.85, 0.92],
          ];
          const T = 5;
          const k = this.orbit / 0.25 / T;
          const i = Math.floor(k) % SHOTS.length;
          const j = (i + 1) % SHOTS.length;
          let f = k - Math.floor(k);
          f = f < 0.65 ? 0 : (f - 0.65) / 0.35; // hold, then ease to the next shot
          f = f * f * (3 - 2 * f);
          const s0 = SHOTS[i];
          const s1 = SHOTS[j];
          const L = (n: number) => s0[n] + (s1[n] - s0[n]) * f;
          const yaw = L(0) + Math.sin(this.orbit * 1.3) * 0.04;
          const dist = L(2);
          wantPos.set(px + Math.sin(yaw) * dist, L(1), Math.cos(yaw) * dist);
          wantLook.set(px, L(3), 0);
          fov = this.baseFov * L(4);
        } else {
          const a = 0.5 + Math.sin(this.orbit) * 0.6;
          wantPos.set(px + Math.sin(a) * 7.4, 2.5 + Math.sin(this.orbit * 0.7) * 0.25, Math.cos(a) * 7.4);
          wantLook.set(px, 0.65, 0);
          fov = this.baseFov * 0.8;
        }
        break;
      }
      case 'garage': {
        this.orbit += dt * 0.5;
        // look point well below the car lifts it into the space above the garage panels
        const ga = this.rearOnly ? Math.sin(this.orbit * 0.6) * 0.2 : this.orbit;
        wantPos.set(px + Math.sin(ga) * 8.4, 3.1, Math.cos(ga) * 8.4);
        wantLook.set(px, -0.55, 0); // v2.2: car sits lower, clear of the info panel
        fov = this.baseFov * 0.72;
        break;
      }
      case 'run': {
        // cinematic swing (Roadster roll): eases out to one side and back
        if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt);
        const sk = this.swingDur > 0 ? Math.sin(Math.PI * (1 - this.swingT / this.swingDur)) : 0;
        const C = this.preset;
        const dyn = this.dynamic;
        const sway = (dyn ? Math.sin(t * 0.55) * 0.18 : 0) + sk * 2.6;
        const F = CAMERA.fixed;
        const back = C.back + this.pushBack - (dyn ? speedFactor * C.speedBack : 0) + (dyn ? 0 : this.fixedBack(C));
        // above the normal HIGH hop (Roadster / HYPER jumps) the camera climbs almost 1:1 so the car stays framed
        // a normal hop is seen rising clearly over the obstacle (camera follows only a little);
        // above it (Roadster / HYPER) the camera climbs almost 1:1 so the car stays framed
        const base = dyn ? Math.min(py, 3.05) - 1 : 0; // fixed view: no lift on a hop, no drop on a dive
        const extra = Math.max(0, py - (dyn ? 3.05 : F.hopTop));
        const fx = dyn ? px : 0; // fixed view: never follows the lane
        wantPos.set(fx * C.followX + sway, C.height + (dyn ? 0 : F.height) + base * C.lift + extra * 0.95 + sk * 0.9, back - sk * 0.8);
        wantLook.set(fx * C.lookX, C.lookY + (dyn ? 0 : F.lookY) + base * C.lookLift + extra * 0.8, C.lookZ);
        fov = this.baseFov + C.fov + speedFactor * (C.fovSpeed ?? 7) + turbo * (C.fovTurbo ?? 9) + this.fovKick;
        break;
      }
      case 'crash': {
        wantPos.set(px + 2.5, 4.6, 8.5);
        wantLook.set(px, 1, -2);
        fov = this.baseFov - 4;
        break;
      }
    }

    const P = this.preset;
    const k = snap ? 1 : damp(this.mode === 'run' ? P.hDamp : 3, dt);
    const ky = snap ? 1 : damp(this.mode === 'run' ? P.vDamp : 3, dt);
    this.pos.x = lerp(this.pos.x, wantPos.x, k);
    this.pos.y = lerp(this.pos.y, wantPos.y, ky);
    this.pos.z = lerp(this.pos.z, wantPos.z, k);
    this.look.x = lerp(this.look.x, wantLook.x, snap ? 1 : damp(this.mode === 'run' ? P.lookDamp : 3, dt));
    this.look.y = lerp(this.look.y, wantLook.y, ky);
    this.look.z = lerp(this.look.z, wantLook.z, k);
    if (snap) {
      this.pos.copy(wantPos);
      this.look.copy(wantLook);
    }

    this.camera.position.copy(this.pos);
    // trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const tr = Math.max(this.trauma, this.rumble);
    const s = tr * tr;
    if (s > 0) {
      this.camera.position.x += (Math.sin(t * 61.3) + Math.sin(t * 37.1)) * 0.18 * s;
      this.camera.position.y += (Math.sin(t * 53.7) + Math.sin(t * 29.9)) * 0.14 * s;
    }
    this.camera.lookAt(this.look);
    const wantRoll = this.mode === 'run' && p && this.dynamic ? clamp(-p.vx * 0.006, -0.06, 0.06) : 0;
    this.roll = lerp(this.roll, wantRoll, damp(6, dt));
    this.camera.rotateZ(this.roll + (s > 0 ? Math.sin(t * 47) * 0.03 * s : 0));
    this.fovKick = lerp(this.fovKick, 0, damp(4, dt));
    const nf = lerp(this.camera.fov, fov, snap ? 1 : damp(4, dt));
    if (Math.abs(nf - this.camera.fov) > 0.01) {
      this.camera.fov = nf;
      this.camera.updateProjectionMatrix();
    }
  }
}
