import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Velocity-based motion blur: a zoom blur toward the road's vanishing point, only on the edges
 * of the screen (road sides, buildings, rails). The centre — and the car, which is drawn later in
 * the overlay pass — stay sharp.
 */
const SpeedBlurShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 }, centre: { value: new THREE.Vector2(0.5, 0.62) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform vec2 centre; varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (strength < 0.0005) { gl_FragColor = base; return; }
      vec2 d = vUv - centre;
      float edge = smoothstep(0.18, 0.62, length(d * vec2(1.25, 1.0)));   // 0 in the middle, 1 at the sides
      if (edge < 0.01) { gl_FragColor = base; return; }
      vec4 acc = base;
      for (int i = 1; i < 8; i++) acc += texture2D(tDiffuse, vUv - d * strength * edge * float(i) / 7.0);
      gl_FragColor = acc / 8.0;
    }`,
};

/** objects on this layer skip post-processing and are drawn last, pixel-exact (the car render) */
export const OVERLAY_LAYER = 1;

import { GRAPHICS, type GraphicsQuality } from '../config.ts';
/** v4.2: LOW / MEDIUM / HIGH presets (config GRAPHICS) */
export type Quality = GraphicsQuality;

/**
 * WebGL renderer + optional half-resolution bloom and edge speed blur, per graphics preset
 * (config GRAPHICS: LOW = no post-processing, capped pixel ratio; MEDIUM = bloom; HIGH = bloom +
 * speed blur, full pixel ratio). The game logic is identical on every preset.
 */
export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private speedBlur: ShaderPass | null = null;
  private renderPass: RenderPass | null = null;
  quality: Quality;
  pixelRatio = 1;
  width = 1;
  height = 1;
  /**
   * Dynamic resolution: upper bound for the pixel ratio on HIGH. Starts at 2 and
   * steps down (1.75 → 1.5) on slow devices before bloom is dropped — keeps MSAA
   * and crisp silhouettes instead of jumping straight to LOW.
   */
  scaleCap = 2;
  /** bloom is the first effect to go on weak GPUs (step after the resolution steps) */
  bloomEnabled = true;
  /** max anisotropic filtering supported (road/lane textures stay sharp at grazing angles) */
  maxAniso = 4;

  constructor(private container: HTMLElement, quality: Quality, private camera: THREE.PerspectiveCamera) {
    this.quality = quality;
    this.renderer = this.makeRenderer(quality);
    container.appendChild(this.renderer.domElement);
    this.maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = 0.6;
    pmrem.dispose();
    this.setQuality(quality);
    // v4.2.1 context loss (phones reclaim GPU memory in the background): keep the page alive, skip
    // rendering while lost, rebuild the post-processing chain when the context comes back. Three.js
    // re-uploads geometries / textures by itself (our textures keep their pixel data).
    const cv = this.renderer.domElement as HTMLCanvasElement & { addEventListener?: HTMLCanvasElement['addEventListener'] };
    cv.addEventListener?.('webglcontextlost', (e: Event) => {
      e.preventDefault();
      this.lost = true;
    });
    cv.addEventListener?.('webglcontextrestored', () => {
      this.lost = false;
      this.disposeComposer();
      this.setQuality(this.quality);
    });
  }
  /** the WebGL context is lost (render calls are skipped until it is restored) */
  lost = false;

  private makeRenderer(_q: Quality) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.style.display = 'block';
    r.domElement.style.width = '100%';
    r.domElement.style.height = '100%';
    return r;
  }

  /**
   * v4.2.1: free the post-processing chain. EffectComposer.dispose() only frees its own two targets —
   * the passes keep theirs (UnrealBloomPass: 11 render targets + materials), so every preset switch
   * that rebuilt the chain leaked ~12 GPU textures (measured by scripts/perf/profile.mjs).
   */
  private disposeComposer() {
    if (!this.composer) return;
    for (const p of this.composer.passes) (p as { dispose?: () => void }).dispose?.();
    this.composer.dispose();
    this.composer = null;
    this.bloom = null;
    this.speedBlur = null;
  }

  setQuality(q: Quality) {
    this.quality = q;
    const pr = GRAPHICS[q];
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = Math.min(dpr, pr.dprCap, this.scaleCap);
    this.renderer.setPixelRatio(this.pixelRatio);
    const wantBloom = pr.bloom && this.bloomEnabled;
    const wantBlur = pr.speedBlur;
    const post = wantBloom || wantBlur;
    // rebuild the composer when the set of passes changes (presets are switched rarely, in menus)
    if (this.composer && (!post || !!this.bloom !== wantBloom || !!this.speedBlur !== wantBlur)) this.disposeComposer();
    if (post && !this.composer) {
      // the composer renders into its own target: give it MSAA, otherwise the canvas
      // antialias flag is silently ignored and every edge looks soft/jagged
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.renderer.capabilities.isWebGL2 ? 4 : 0 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(this.renderPass);
      if (wantBloom) {
        // tight, high-threshold bloom: lights glow, silhouettes stay crisp
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.bloomStrength, 0.22, 1.0);
        this.composer.addPass(this.bloom);
      }
      if (wantBlur) {
        this.speedBlur = new ShaderPass(SpeedBlurShader);
        this.composer.addPass(this.speedBlur);
      }
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }
  private bloomStrength = 0.3;

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
      // bloom at half resolution — big win on mobile fill-rate
      this.bloom?.setSize((w * this.pixelRatio) / 2, (h * this.pixelRatio) / 2);
    }
    return w / h;
  }

  /** step dynamic resolution down; returns false when nothing is left to reduce */
  degrade(): boolean {
    if (this.quality === 'low') return false;
    const dpr = window.devicePixelRatio || 1;
    const cap = GRAPHICS[this.quality].dprCap;
    if (this.scaleCap > 1.5 && dpr > 1.5 && cap > 1.5) {
      this.scaleCap = this.scaleCap > 1.75 ? 1.75 : 1.5;
      this.setQuality(this.quality);
      return true;
    }
    if (this.bloomEnabled && GRAPHICS[this.quality].bloom) {
      this.bloomEnabled = false;
      this.setQuality(this.quality);
      return true;
    }
    return false;
  }

  /** 0 … ~0.08: how far the screen edges smear toward the vanishing point (HIGH preset only) */
  setSpeedBlur(strength: number) {
    if (this.speedBlur) this.speedBlur.uniforms.strength.value = strength;
  }

  setBloom(strength: number) {
    this.bloomStrength = strength;
    if (this.bloom) this.bloom.strength = strength;
  }

  render() {
    if (this.lost) return;
    // count every pass of the frame (scene, post-processing, car overlay) in renderer.info
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    // overlay: the car render (layer OVERLAY_LAYER) is drawn last, straight onto the canvas,
    // so tone mapping, bloom and scene lighting never change its pixels (exact studio image)
    const r = this.renderer;
    const auto = r.autoClear;
    r.setRenderTarget(null);
    r.autoClear = false;
    r.clearDepth();
    const bg = this.scene.background;
    this.scene.background = null; // never repaint the sky over the finished frame
    this.camera.layers.set(OVERLAY_LAYER);
    r.render(this.scene, this.camera);
    this.camera.layers.set(0);
    this.scene.background = bg;
    r.autoClear = auto;
  }

  get info() {
    return this.renderer.info;
  }
}
