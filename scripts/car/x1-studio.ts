/**
 * Step 06 studio harness for the XWAVE X1: renders the car (straight from the builder, or any GLB
 * through the game's own parser `parseGlb`) under NEUTRAL studio light from the reference camera
 * angles, plus silhouette masks, wireframe, normals and UV views. Driven by scripts/car/studio-x1.mjs.
 *
 * window.__studio.load(src, glbBase64?)   src = 'builder' | 'glb'
 * window.__studio.render(opts) → PNG data URL + projected bounds
 *   opts.view  rear0 | rl45 | rr45 | side90 | front0 | fl45 | top | chase
 *   opts.mode  shade | mask | wire | normals | uv | flat
 *   opts.w / h, opts.ortho, opts.fov, opts.elev (deg), opts.dist, opts.target y
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { parseGlb } from '../../src/render/car/glbParse.ts';
import { buildX1 } from './x1-builder.ts';
import { x1BadgeCanvas, x1CarbonCanvas, x1FlakeCanvas, x1TreadCanvas } from '../../src/render/car/x1Textures.ts';
import { RENDER } from '../../src/config.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
r.outputColorSpace = THREE.SRGBColorSpace;
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 1.0;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(r);
const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
// neutral studio: soft sky / ground fill, one key, one fill — no coloured or cinematic light
const lights = new THREE.Group();
lights.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d8, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(-4, 8, 6);
lights.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(5, 3, -6);
lights.add(fill);
scene.add(lights);
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0xe4e5e8, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

let car: THREE.Object3D | null = null;
const original = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

function uvChecker() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#2a2f3a' : `hsl(${(x * 45 + y * 20) % 360} 70% 62%)`;
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const MAT = {
  mask: new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }),
  normals: new THREE.MeshNormalMaterial({ side: THREE.FrontSide }),
  uv: new THREE.MeshBasicMaterial({ map: uvChecker(), side: THREE.DoubleSide }),
  flat: new THREE.MeshStandardMaterial({ color: 0xd9dadc, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
  wire: new THREE.MeshBasicMaterial({ color: 0x1d2433, wireframe: true }),
};

function load(src: 'builder' | 'glb', b64?: string, opts: { flake?: boolean; detail?: 'mobile' | 'master'; rear?: number } = {}) {
  if (car) scene.remove(car);
  original.clear();
  if (src === 'builder') car = buildX1({ detail: opts.detail ?? 'mobile', rear: opts.rear });
  else {
    const bin = atob(b64!);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    car = parseGlb(u.buffer);
  }
  // the game does not decode the GLB's images: it puts the same procedural textures back by material
  // name (MeshCar.build) — do the same, and keep the lights untone-mapped like the game
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const done = new Set<THREE.Material>();
  car.traverse((o: any) => {
    const m = o.material as THREE.MeshStandardMaterial | undefined;
    if (!o.isMesh || !m || done.has(m)) return;
    done.add(m);
    {
      if (m.name === 'X1_Badge') {
        const t = tex(x1BadgeCanvas());
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        m.map = m.emissiveMap = t;
        m.transparent = true;
        m.alphaTest = 0.05;
      }
      if (m.name === 'X1_Carbon') m.map = tex(x1CarbonCanvas());
      if (m.name === 'X1_Tyre') m.map = tex(x1TreadCanvas());
    }
    if (m.name === 'X1_Paint' && opts.flake !== false) {
      // same as MeshCar: metallic flake normal map (UVs in metres)
      const t = tex(x1FlakeCanvas());
      t.colorSpace = THREE.NoColorSpace;
      t.repeat.set(RENDER.paintFlakeRepeat, RENDER.paintFlakeRepeat);
      m.normalMap = t;
      m.normalScale.set(RENDER.paintFlake, RENDER.paintFlake);
    }
    if (/LED|Marker|Headlight|Badge|SeatTrim/.test(m.name)) m.toneMapped = false;
    m.needsUpdate = true;
  });
  scene.add(car);
  car.updateMatrixWorld(true);
  let tris = 0;
  let meshes = 0;
  const mats = new Set<THREE.Material>();
  car.traverse((o: any) => {
    if (o.isMesh) {
      meshes++;
      original.set(o, o.material);
      for (const m of [o.material].flat()) mats.add(m);
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    }
  });
  const box = new THREE.Box3().setFromObject(car);
  return { meshes, materials: mats.size, tris, min: box.min.toArray(), max: box.max.toArray() };
}

/** NDC bounds [x0, y0, x1, y1] of the car's vertices seen from cam */
function projBounds(cam: THREE.Camera) {
  cam.updateMatrixWorld();
  const p = new THREE.Vector3();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [m] of original) {
    if (!m.visible) continue;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 2) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(cam);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
  }
  return [x0, y0, x1, y1];
}

/** camera presets: azimuth around the car (0 = straight behind, +90 = car's left side), elevation */
const VIEWS: Record<string, { az: number; elev: number; ortho: boolean; fov: number }> = {
  rear0: { az: 0, elev: 4, ortho: false, fov: 9 },
  // the concept 3/4 views are nearer 30° than 45°: azimuth / elevation estimated by matching the
  // reference silhouette's aspect ratio (scripts/car/compare, Step 06 report) — names kept
  // v4.4 (Step 07): re-calibrated by grid search (scripts/car/compare/calibrate.py: azimuth × elevation ×
  // lens) on the FIXED Step 06 model against concept 01, then frozen — a low, fairly wide-angle shot
  rl45: { az: 34, elev: 3, ortho: false, fov: 38 },
  rr45: { az: -34, elev: 3, ortho: false, fov: 38 },
  side90: { az: 90, elev: 2, ortho: true, fov: 0 },
  front0: { az: 180, elev: 4, ortho: false, fov: 12 },
  fl45: { az: 212, elev: 7, ortho: false, fov: 26 },
  top: { az: 0, elev: 90, ortho: true, fov: 0 },
};

function render(o: any) {
  const w = o.w ?? 1000;
  const h = o.h ?? 700;
  r.setPixelRatio(1);
  r.setSize(w, h);
  const v = { ...VIEWS[o.view ?? 'rear0'], ...o };
  const mode = o.mode ?? 'shade';
  // materials
  for (const [m, mat] of original) {
    m.material = mode === 'shade' ? mat : mode === 'wire' ? mat : (MAT as any)[mode];
  }
  let wire: THREE.Object3D | null = null;
  if (mode === 'wire') {
    wire = new THREE.Group();
    for (const [m] of original) {
      const l = new THREE.LineSegments(new THREE.WireframeGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x1d2433, transparent: true, opacity: 0.55 }));
      m.updateWorldMatrix(true, false);
      l.applyMatrix4(m.matrixWorld);
      wire.add(l);
    }
    scene.add(wire);
    for (const [m] of original) m.material = MAT.flat;
  }
  const silhouette = mode === 'mask';
  scene.background = new THREE.Color(silhouette ? 0xffffff : o.bg ?? 0xf1f2f4);
  scene.environment = silhouette || mode === 'normals' || mode === 'uv' ? null : env;
  (scene as any).environmentIntensity = 0.7;
  r.toneMapping = silhouette || mode === 'normals' || mode === 'uv' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  floor.visible = !silhouette && mode !== 'normals' && mode !== 'uv' && v.elev < 89 && o.floor !== false;
  lights.visible = !silhouette;
  // camera
  const box = new THREE.Box3().setFromObject(car!);
  const ctr = box.getCenter(new THREE.Vector3());
  const target = new THREE.Vector3(0, o.ty ?? ctr.y * 0.9, o.tz ?? ctr.z);
  const az = THREE.MathUtils.degToRad(v.az);
  const el = THREE.MathUtils.degToRad(v.elev);
  const dir = new THREE.Vector3(Math.sin(az) * -1 * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); // az 0 = +z (behind), az 90 = −x (car's left)
  const aspect = w / h;
  let cam: THREE.Camera;
  const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  if (v.ortho) {
    const half = (o.size ?? span * 0.62) / 2;
    const c = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 100);
    c.position.copy(target).addScaledVector(dir, 20);
    if (v.elev >= 89) c.up.set(0, 0, 1);
    c.lookAt(target);
    cam = c;
  } else {
    const c = new THREE.PerspectiveCamera(v.fov, aspect, 0.1, 400);
    // distance so the car spans ~fill of the frame height
    const fill = o.fill ?? 0.62;
    const dist = o.dist ?? (span * 0.5) / Math.tan(THREE.MathUtils.degToRad(v.fov) / 2) / (fill * 1.6);
    c.position.copy(target).addScaledVector(dir, dist);
    c.lookAt(target);
    cam = c;
  }
  (cam as any).updateProjectionMatrix?.();
  // fit: the car's projected bounds fill `fill` of the frame (centred), two passes
  const fillK = o.fill ?? 0.8;
  for (let it = 0; it < (o.fit === false ? 0 : 3); it++) {
    const [bx0, by0, bx1, by1] = projBounds(cam);
    const k = Math.max((bx1 - bx0) / 2, (by1 - by0) / 2) / fillK; // NDC half-extent / fill
    const cx = (bx0 + bx1) / 2;
    const cy = (by0 + by1) / 2;
    if (cam instanceof THREE.OrthographicCamera) {
      const hw = (cam.right - cam.left) / 2;
      const hh = (cam.top - cam.bottom) / 2;
      const ox = (cam.right + cam.left) / 2 + cx * hw;
      const oy = (cam.top + cam.bottom) / 2 + cy * hh;
      cam.left = ox - hw * k;
      cam.right = ox + hw * k;
      cam.bottom = oy - hh * k;
      cam.top = oy + hh * k;
      cam.updateProjectionMatrix();
    } else {
      const c = cam as THREE.PerspectiveCamera;
      // pan in the camera plane to centre, then move along the view axis to scale
      const d = c.position.distanceTo(target);
      const hh = Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * d;
      const right = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 1);
      const pan = right.multiplyScalar(cx * hh * c.aspect).add(up.multiplyScalar(cy * hh));
      c.position.add(pan);
      target.add(pan);
      c.position.sub(target).multiplyScalar(k).add(target);
      c.lookAt(target);
      c.updateProjectionMatrix();
    }
  }
  r.render(scene, cam);
  if (wire) {
    scene.remove(wire);
    wire.traverse((x: any) => x.geometry?.dispose());
  }
  const [x0, y0, x1, y1] = projBounds(cam);
  for (const [m, mat] of original) m.material = mat;
  return { png: r.domElement.toDataURL('image/png'), bounds: [((x0 + 1) / 2) * w, ((1 - y1) / 2) * h, ((x1 + 1) / 2) * w, ((1 - y0) / 2) * h] };
}

/** animate named nodes to check pivots: steer front wheels, spin, raise the spoiler */
function pose(o: { steer?: number; spin?: number; spoiler?: number }) {
  car!.traverse((n: any) => {
    if (/^Wheel_F[LR]$/.test(n.name)) n.rotation.y = o.steer ?? 0;
    if (/^Spin_/.test(n.name)) n.rotation.x = o.spin ?? 0;
    if (n.name === 'Spoiler_Pivot') n.rotation.x = -(o.spoiler ?? 0) * 0.38;
  });
  car!.updateMatrixWorld(true);
}

(window as any).__studio = { load, render, pose, THREE };
(window as any).__ready = true;
