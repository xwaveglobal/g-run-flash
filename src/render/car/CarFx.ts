import * as THREE from 'three';
import { RENDER } from '../../config.ts';
import { glowTexture } from '../textures.ts';
import { approach } from './carMotion.ts';

/**
 * v4.1.3 special-item VFX for the 3D XWAVE X1 — one restrained visual language:
 * thin luminous edges and light, no smoke, no fog, nothing opaque over the car.
 *
 * Layering (back to front): car materials → car edge light (ghost rim / pickup sweep, added inside
 * the car's own shaders) → nitro thrust (additive, MeshCar) → shield aura shell (additive) →
 * crash flash (additive). The car's GLB materials are never swapped or cloned: Phase Ghost only
 * changes their opacity (restored exactly by MeshCar.setFade) and the edge light is a uniform
 * that rests at 0. Everything is built once and reused; nothing is allocated per frame.
 */

/** uniforms shared by every car material (edge light) */
export interface CarFxUniforms {
  uFxGhost: { value: number };
  uFxGhostColor: { value: THREE.Color };
  uFxSweep: { value: number };
  uFxSweepZ: { value: number };
  uFxSweepColor: { value: THREE.Color };
}

export function makeCarFxUniforms(): CarFxUniforms {
  return {
    uFxGhost: { value: 0 },
    uFxGhostColor: { value: new THREE.Color(0x5fd8ff) },
    uFxSweep: { value: 0 },
    uFxSweepZ: { value: -99 },
    uFxSweepColor: { value: new THREE.Color(0x8fe8ff) },
  };
}

/**
 * Adds the edge light to a car material once (compiled with the car; afterwards only uniforms change,
 * so effects never trigger a shader compile mid-race).
 *   ghost: cyan Fresnel rim (Phase Ghost)          sweep: a light band running front → back (pickups)
 */
export function installCarFx(mat: THREE.Material, u: CarFxUniforms) {
  const m = mat as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial || m.userData.xwFx) return;
  m.userData.xwFx = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFxZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFxZ = (modelMatrix * vec4(transformed, 1.0)).z;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vFxZ;\nuniform float uFxGhost; uniform vec3 uFxGhostColor; uniform float uFxSweep; uniform float uFxSweepZ; uniform vec3 uFxSweepColor;',
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          float fxRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.6);
          outgoingLight += uFxGhostColor * fxRim * uFxGhost;
          float fxBand = exp(-pow((vFxZ - uFxSweepZ) / 0.16, 2.0));
          outgoingLight += uFxSweepColor * fxBand * uFxSweep * (0.35 + 0.65 * fxRim);
          diffuseColor.a = min(1.0, diffuseColor.a + 0.5 * fxRim * uFxGhost * (1.0 - diffuseColor.a));
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'xwave-car-fx';
  m.needsUpdate = true;
}

/**
 * SHIELD: a thin luminous shell closely around the car (half ellipsoid standing on the road):
 * bright Fresnel contour + a glowing base line where it meets the road, nearly clear inside,
 * slow pulse. One mesh, additive, no depth write. Lives in the car's pose (follows lane changes,
 * jumps and landings) and fades in / out — it is hidden (not disposed) when inactive and reused.
 */
export class ShieldAura {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  /** 0..1 current visibility */
  k = 0;
  private hit = 0;
  private t = 0;
  /**
   * @param look colour / rim / pulse (Hz) / size factor — default = the shield (RENDER.shield);
   *             Turbo uses RENDER.turboAura (it smashes obstacles too, so it gets the same language)
   */
  private fadeIn: number;
  private fadeOut: number;
  constructor(look: { color: number; rim: number; pulse: number; fadeIn: number; fadeOut: number; size?: number; name?: string } = RENDER.shield) {
    this.fadeIn = look.fadeIn;
    this.fadeOut = look.fadeOut;
    // half-axes chosen from the in-game car box (1.59 × 0.90 × 3.23 m) so no corner pokes through
    const g = new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI * 0.53);
    const c = look;
    const mat = new THREE.ShaderMaterial({
      uniforms: { k: { value: 0 }, t: { value: 0 }, hit: { value: 0 }, color: { value: new THREE.Color(c.color) }, rim: { value: c.rim }, pulse: { value: c.pulse * Math.PI * 2 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          vY = position.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float k; uniform float t; uniform float hit; uniform vec3 color; uniform float rim; uniform float pulse; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float edge = smoothstep(0.9, 0.995, f) * rim * 1.3 + pow(f, 4.0) * 0.12; // thin contour + faint inner glow
          float base = smoothstep(0.07, 0.0, vY) * 0.9;           // luminous line on the road
          float bands = smoothstep(0.92, 1.0, fract(vY * 5.0 - t * 0.35)) * 0.07; // faint rising scan lines
          float pl = 0.86 + 0.14 * sin(t * pulse);
          float a = (edge + base + bands * 0.6 + 0.012) * pl + hit * (0.25 + edge); // near-clear inside (bloom adds the rest)
          if (!gl_FrontFacing) a *= 0.3;                           // the far side reads softer
          gl_FragColor = vec4(color * a * k, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = c.name ?? 'ShieldAura';
    const f = c.size ?? 1;
    this.mesh.scale.set(1.12 * f, 1.28 * f, 2.3 * f);
    this.mesh.position.set(0, 0, 0.09);
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }
  /** shield absorbed a hit: a short bright flash of the whole shell */
  flash() {
    this.hit = 1;
  }
  /** @param level 0 = off … 1 = shield active (gameplay state; a timed shield fades in its last 2 s) */
  update(dt: number, level: number) {
    this.t += dt;
    this.k = approach(this.k, level, this.fadeIn, this.fadeOut, dt);
    if (level <= 0 && this.k < 0.01) this.k = 0;
    this.hit = Math.max(0, this.hit - dt * 3);
    const u = this.mesh.material.uniforms;
    u.k.value = this.k;
    u.t.value = this.t;
    u.hit.value = this.hit;
    this.mesh.visible = this.k > 0 || this.hit > 0;
  }
  reset() {
    this.k = 0;
    this.hit = 0;
    this.mesh.visible = false;
  }
}

/**
 * CRASH: short white/orange impact flash + a small set of pooled shards (white bodywork, satin-black
 * aero pieces, dark glass) that fly off, bounce once or twice and fade. Built once; burst() only
 * re-positions them, clear() hides them. The car itself is never fractured or hidden.
 */
export class CrashFx {
  group = new THREE.Group();
  private parts: { m: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3; t: number }[] = [];
  private paint = new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 0.3, metalness: 0.25, transparent: true });
  private dark = new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.5, metalness: 0.3, transparent: true });
  private glass = new THREE.MeshStandardMaterial({ color: 0x0a1424, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.85 });
  private flash: THREE.Sprite;
  private core: THREE.Sprite;
  private flashT = 99;
  private life = 0;
  private seed = 1;
  constructor() {
    const shard = (pts: [number, number][], depth: number) => {
      // ×1.6: readable from the chase camera (still a handful of small pieces)
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * 1.6, y * 1.6))), { depth, bevelEnabled: false });
      g.translate(0, 0, -depth / 2);
      g.computeBoundingSphere();
      return g;
    };
    const geos = {
      body: [shard([[-0.16, -0.1], [0.2, -0.06], [0.02, 0.16]], 0.018), shard([[-0.12, -0.12], [0.14, -0.08], [0.16, 0.1], [-0.06, 0.12]], 0.018), shard([[-0.2, 0], [0.12, -0.1], [0.08, 0.12]], 0.016)],
      dark: [shard([[-0.18, -0.03], [0.18, -0.03], [0.16, 0.03], [-0.16, 0.04]], 0.03), shard([[-0.1, -0.08], [0.12, -0.04], [0.0, 0.1]], 0.025)],
      glass: [shard([[-0.07, -0.05], [0.08, -0.04], [0.0, 0.08]], 0.008), shard([[-0.05, -0.06], [0.06, -0.02], [0.02, 0.06]], 0.008)],
    };
    const n = RENDER.crash.fragments;
    for (let i = 0; i < n; i++) {
      // ½ bodywork, ¼ dark aero, ¼ glass
      const kind = i % 4 === 1 ? 'dark' : i % 4 === 3 ? 'glass' : 'body';
      const list = geos[kind];
      const m = new THREE.Mesh(list[i % list.length], kind === 'body' ? this.paint : kind === 'dark' ? this.dark : this.glass);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.parts.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 });
    }
    const glowMat = (c: number) => new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.flash = new THREE.Sprite(glowMat(0xffa24a));
    this.core = new THREE.Sprite(glowMat(0xffffff));
    for (const s of [this.flash, this.core]) {
      s.visible = false;
      s.renderOrder = 12;
      this.group.add(s);
    }
  }
  private rnd() {
    // deterministic (repeatable captures), allocation-free
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  /**
   * @param at impact point (world) — the car's nose
   * @param paint body colour of the current colourway
   */
  burst(at: THREE.Vector3, paint: number) {
    this.paint.color.setHex(paint);
    this.seed = 7;
    this.life = RENDER.crash.life;
    for (const p of this.parts) {
      const r = () => this.rnd() * 2 - 1;
      p.m.visible = true;
      p.m.position.set(at.x + r() * 0.5, at.y + 0.1 + this.rnd() * 0.35, at.z + this.rnd() * 0.4);
      p.m.rotation.set(r() * 3, r() * 3, r() * 3);
      // sideways, up, and back toward the camera (the car stopped; the debris carries on a little)
      p.v.set(r() * 4.2, 2.6 + this.rnd() * 3.6, 1.2 + this.rnd() * 3.4 - (this.rnd() < 0.3 ? 3 : 0));
      p.w.set(r() * 11, r() * 11, r() * 11);
      p.t = 0;
    }
    for (const mat of [this.paint, this.dark]) mat.opacity = 1;
    this.glass.opacity = 0.85;
    this.flash.position.copy(at);
    this.core.position.copy(at);
    this.flashT = 0;
    this.flash.visible = this.core.visible = true;
  }
  get active() {
    return this.life > 0 || this.flashT < RENDER.crash.flash;
  }
  update(dt: number) {
    // flash: pops in 0.05 s, fades by RENDER.crash.flash
    if (this.flashT < RENDER.crash.flash) {
      this.flashT += dt;
      const f = Math.min(1, this.flashT / 0.05);
      const a = this.flashT < 0.05 ? 1 : Math.max(0, 1 - (this.flashT - 0.05) / (RENDER.crash.flash - 0.05));
      this.flash.scale.setScalar(0.8 + 2.4 * f);
      this.core.scale.setScalar(0.4 + 1.1 * f);
      (this.flash.material as THREE.SpriteMaterial).opacity = 0.85 * a;
      (this.core.material as THREE.SpriteMaterial).opacity = a;
      if (a <= 0) this.flash.visible = this.core.visible = false;
    }
    if (this.life <= 0) return;
    this.life -= dt;
    const fade = Math.min(1, Math.max(0, this.life / 0.45));
    this.paint.opacity = this.dark.opacity = fade;
    this.glass.opacity = 0.85 * fade;
    for (const p of this.parts) {
      p.t += dt;
      p.v.y -= 14 * dt;
      p.v.multiplyScalar(Math.exp(-0.5 * dt));
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.03) {
        p.m.position.y = 0.03;
        p.v.y = Math.abs(p.v.y) * 0.3;
        p.v.x *= 0.6;
        p.v.z *= 0.6;
        p.w.multiplyScalar(0.6);
      }
      p.m.rotation.x += p.w.x * dt;
      p.m.rotation.y += p.w.y * dt;
      p.m.rotation.z += p.w.z * dt;
    }
    if (this.life <= 0) this.clear();
  }
  /** hide everything (restart / respawn) — nothing stays behind */
  clear() {
    this.life = 0;
    this.flashT = 99;
    for (const p of this.parts) p.m.visible = false;
    this.flash.visible = this.core.visible = false;
  }
  /** number of visible pieces (tests / debug) */
  get visibleCount() {
    let n = 0;
    for (const p of this.parts) if (p.m.visible) n++;
    return n + (this.flash.visible ? 1 : 0) + (this.core.visible ? 1 : 0);
  }
}
