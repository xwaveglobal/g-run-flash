/**
 * XWAVE X1 — procedural 3D model builder (v2 refinement of the XWAVE_Car_3D_v1 blockout).
 *
 * Runs in a browser page (needs <canvas> for the textures and GLTFExporter's Blob path):
 *   node scripts/car/build-x1.mjs     → src/assets/models/xwave-x1.glb
 *
 * Reference priority: 01_authoritative/XWAVE_REAR_0_MASTER_DO_NOT_OVERRIDE.png (rear view). Every rear
 * measurement below was taken from that image (car height 1.165 m ↔ 635 px → 1.835 mm / px, centre
 * x = 603 px, ground y = 870 px on the 1200 px copy). Side / top proportions come from the secondary
 * views, which are AI-generated and not orthographic — treat them as loose.
 *
 * Conventions (same as src/assets/manifest.ts): metres, +Y up, front toward −Z, rear toward +Z,
 * ground at y = 0, origin on the ground between the axles.
 *
 * Node layout (the game drives these by name):
 *   X1
 *   ├─ Body                     everything sprung (paint, glass, lights, diffuser, interior…)
 *   ├─ Wheel_FL / FR / RL / RR  hub pivot (front ones steer around Y)
 *   │   ├─ Spin_xx              rotates around X with road speed: Tyre_xx, Rim_xx, Disc_xx
 *   │   └─ Caliper_xx           does not spin
 *   └─ NitroSocket_L / _R       empties at the nitro exits (+Z = flame direction)
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { x1BadgeCanvas, x1CarbonCanvas, x1TreadCanvas } from '../../src/render/car/x1Textures.ts';

// ------------------------------------------------------------------ dimensions
const Z_NOSE = -2.3;
const Z_TAIL = 2.2;
// v4.1.3: front tyre 0.34 m and a slightly elliptical arch (vf) — the arch used to cut through the
// fender top (paper-thin white edge over the tyre), now the fender keeps ~4 cm above the opening
const AX_F = { z: -1.36, r: 0.34, w: 0.27, x: 0.825, arch: 0.42, xin: 0.64, vf: 0.86 };
const AX_R = { z: 1.3, r: 0.37, w: 0.38, x: 0.855, arch: 0.42, xin: 0.62, vf: 0.98 };

// ------------------------------------------------------------------ curve helpers
/** monotone cubic interpolation through [x, y] keys (no overshoot, C1) */
function curve(keys: [number, number][]) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const ramp = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// ------------------------------------------------------------------ body section functions (of z)
const hw = curve([[-2.3, 0.74], [-2.12, 0.86], [-1.8, 0.94], [-1.36, 0.975], [-0.9, 0.955], [-0.3, 0.925], [0.25, 0.93], [0.8, 0.985], [1.3, 1.02], [1.8, 1.005], [2.05, 0.975], [2.2, 0.94]]);
const yMaxW = curve([[-2.3, 0.36], [-1.36, 0.5], [0, 0.52], [1.3, 0.58], [2.2, 0.58]]);
const shY = curve([[-2.3, 0.46], [-2.0, 0.62], [-1.36, 0.745], [-0.9, 0.72], [-0.3, 0.76], [0.3, 0.79], [1.0, 0.83], [1.4, 0.835], [1.9, 0.79], [2.2, 0.76]]);
const deck = curve([[-2.3, 0.44], [-2.05, 0.56], [-1.6, 0.635], [-1.1, 0.7], [-0.95, 0.71], [1.7, 0.71], [1.9, 0.745], [2.2, 0.745]]);
const sill = curve([[-2.3, 0.2], [-2.0, 0.165], [0, 0.165], [0.8, 0.175], [1.85, 0.3], [2.2, 0.4]]);
const under = curve([[-2.3, 0.2], [-2.0, 0.13], [1.55, 0.13], [1.95, 0.27], [2.2, 0.36]]);
// greenhouse (glass canopy)
const gTop = curve([[-1.05, 0.73], [-0.75, 0.95], [-0.45, 1.12], [-0.15, 1.165], [0.3, 1.15], [0.8, 1.07], [1.3, 0.95], [1.7, 0.84], [1.88, 0.785]]);
const gHalfTop = curve([[-1.05, 0.66], [-0.75, 0.5], [-0.45, 0.405], [-0.15, 0.4], [0.5, 0.39], [1.3, 0.4], [1.88, 0.44]]);
const gHalfBase = curve([[-1.05, 0.68], [-0.6, 0.73], [-0.15, 0.72], [0.25, 0.5], [1.88, 0.48]]);
const gBaseY = curve([[-1.05, 0.72], [-0.6, 0.78], [-0.15, 0.8], [0.25, 1.0], [1.88, 0.76]]);
const G_Z0 = -1.05;
const G_Z1 = 1.88;

/** REAR_OPEN: behind the rear axle the wheel well stays open to the tail (the master shows the whole
 *  lower half of the rear tyres from behind; the body only covers them above this height) */
const REAR_OPEN = 0.44;
function archTop(z: number): { y: number; xin: number } | null {
  for (const a of [AX_F, AX_R]) {
    const dz = Math.abs(z - a.z);
    const y = dz < a.arch ? a.r + Math.sqrt(a.arch * a.arch - dz * dz) * a.vf : 0;
    if (a === AX_R && z > a.z) return { y: Math.max(y, REAR_OPEN), xin: a.xin };
    if (dz < a.arch) return { y, xin: a.xin };
  }
  return null;
}

/** the top-of-side point where the body meets the hood / glass / buttress / rear deck */
function sideTop(z: number): [number, number] {
  const a = ramp(-1.12, -0.98, z);
  const b = ramp(-0.2, 0.25, z);
  const c = ramp(1.75, 1.95, z);
  const hood: [number, number] = [mix(0.4, 0.5, ramp(-2.3, -1.6, z)), deck(z)];
  const cab: [number, number] = [gHalfBase(z) - 0.02, gBaseY(z) - 0.01];
  const but: [number, number] = [gHalfTop(z) + 0.045, gTop(z) - 0.04];
  const rear: [number, number] = [0.6, 0.745];
  const w = [1 - a, a * (1 - b), a * b * (1 - c), a * b * c];
  const pts = [hood, cab, but, rear];
  return [pts.reduce((s, p, i) => s + p[0] * w[i], 0), pts.reduce((s, p, i) => s + p[1] * w[i], 0)];
}

/** Chaikin corner cutting on an open polyline, endpoints kept */
function chaikin(p: [number, number][], it = 2): [number, number][] {
  let pts = p;
  for (let k = 0; k < it; k++) {
    const o: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      if (i > 0) o.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      if (i < pts.length - 2) o.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    o.push(pts[pts.length - 1]);
    pts = o;
  }
  return pts;
}

/** side of the body at z, from the top-of-side point down to the bottom centre (x ≥ 0) */
function sideHalf(z: number): [number, number][] {
  const W = hw(z);
  const arch = archTop(z);
  const bot = Math.max(sill(z), arch?.y ?? 0);
  const xin = arch ? arch.xin : W * 0.86;
  const ub = under(z);
  const sh = shY(z);
  const ym = yMaxW(z);
  if (!arch || arch.y <= sill(z) + 1e-6) {
    const side: [number, number][] = [sideTop(z), [W - 0.13, sh], [W - 0.035, (sh + ym) / 2 + 0.03], [W, ym], [W - 0.01, bot + 0.07], [W - 0.05, bot]];
    return [...chaikin(side, 2), [xin, bot], [xin, ub], [0, ub]];
  }
  // v4.1.3 wheel arch: the side is drawn as if there were no arch (down to the sill), then cut where
  // it crosses the arch line on its way down from the shoulder. Before, the profile ran down to the
  // widest point (below the arch top) and folded back up to it — white flaps around the front tyre.
  const sb = sill(z);
  const full = chaikin([sideTop(z), [W - 0.13, sh], [W - 0.035, (sh + ym) / 2 + 0.03], [W, ym], [W - 0.01, sb + 0.07], [W - 0.05, sb]], 2);
  let top = 0;
  for (let i = 1; i < full.length; i++) if (full[i][1] > full[top][1]) top = i;
  const y = Math.min(arch.y, full[top][1] - 0.03); // keep a fender lip above the opening
  const out: [number, number][] = [];
  let cut: [number, number] | null = null;
  for (let i = 0; i < full.length; i++) {
    if (cut) {
      out.push(cut); // same point count on every section (the loft needs it): collapse onto the cut
      continue;
    }
    const pt = full[i];
    if (i > top && pt[1] < y) {
      const [x0, y0] = full[i - 1];
      const t = (y0 - y) / (y0 - pt[1] || 1);
      cut = [x0 + (pt[0] - x0) * t, y];
      out.push(cut);
    } else out.push(pt);
  }
  return [...out, [xin, y], [xin, ub], [0, ub]];
}
/** top strip between the two top-of-side points (hood / deck, or the inner faces under the glass) */
function topRow(z: number): [number, number][] {
  const [x, y] = sideTop(z);
  const c = deck(z);
  const row: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8; // −x … +x
    const u = Math.abs(t * 2 - 1); // 1 at the edges, 0 at the centre
    row.push([(t * 2 - 1) * x, c + (y - c) * Math.pow(u, 1.6)]);
  }
  return row;
}
/** body side row: left top-of-side → down → bottom centre → up → right top-of-side */
function sideRow(z: number): [number, number][] {
  const h = sideHalf(z);
  return [...h.map(([x, y]) => [-x, y] as [number, number]), ...h.slice(0, -1).reverse()];
}

/** loft rows of (x, y) points along z. flip = which side the triangles face */
function loftRows(zs: number[], row: (z: number) => [number, number][], flip: boolean) {
  const pos: number[] = [];
  const idx: number[] = [];
  let n = 0;
  for (const z of zs) {
    const r = row(z);
    n = r.length;
    for (const [x, y] of r) pos.push(x, y, z);
  }
  for (let k = 0; k < zs.length - 1; k++)
    for (let i = 0; i < n - 1; i++) {
      const a = k * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** flat end cap (fan) closing the body at z; front = faces −z */
function bodyCap(z: number, front: boolean) {
  const top = topRow(z);
  const side = sideRow(z).slice(1, -1).reverse();
  const loop = [...top, ...side];
  const pos: number[] = [];
  const idx: number[] = [];
  let cx = 0;
  let cy = 0;
  for (const [x, y] of loop) {
    pos.push(x, y, z);
    cx += x;
    cy += y;
  }
  const ci = loop.length;
  pos.push(cx / ci, cy / ci, z);
  for (let i = 0; i < ci; i++) {
    const a = i;
    const b = (i + 1) % ci;
    if (front) idx.push(ci, a, b);
    else idx.push(ci, b, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ v4.1.3 front helpers
/** fillet length of the rounded nose (the straight loft ends this far behind the nose tip) */
const NOSE_R = 0.065;
/**
 * Rounded nose: the last section is pulled in toward its centre over NOSE_R while moving forward
 * (a quarter-round fillet), strong on the top edge, gentle at the chin, then closed by a flat face.
 * Replaces the old flat cap, which read as a cut-off box from the front three-quarter view.
 */
function noseFillet() {
  const z0 = Z_NOSE + NOSE_R;
  const loop = [...topRow(z0), ...sideRow(z0).slice(1, -1).reverse()];
  let cx = 0;
  let cy = 0;
  let ymin = Infinity;
  for (const [x, y] of loop) {
    cx += x;
    cy += y;
    ymin = Math.min(ymin, y);
  }
  cx /= loop.length;
  cy /= loop.length;
  const N = 6;
  const pos: number[] = [];
  const idx: number[] = [];
  const n = loop.length;
  const nTop = topRow(z0).length;
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * (Math.PI / 2);
    const dz = NOSE_R * Math.sin(t);
    const inset = NOSE_R * (1 - Math.cos(t));
    for (const [j, [x, y]] of loop.entries()) {
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.hypot(dx, dy) || 1;
      // hood edge (top row): one even radius; down the sides it eases to a small radius at the chin
      const w = j < nTop ? 1 : 0.3 + 0.7 * ramp(ymin, cy + 0.03, y);
      const a = Math.min(inset * w, d * 0.45);
      pos.push(x + (dx / d) * a, y + (dy / d) * a, z0 - dz);
    }
  }
  for (let k = 0; k < N; k++)
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      idx.push(a, a + n, b, b, a + n, b + n);
    }
  // flat face
  const c0 = pos.length / 3;
  let fx = 0;
  let fy = 0;
  for (let i = 0; i < n; i++) {
    fx += pos[(N * n + i) * 3];
    fy += pos[(N * n + i) * 3 + 1];
  }
  pos.push(fx / n, fy / n, Z_NOSE);
  for (let i = 0; i < n; i++) idx.push(c0, N * n + ((i + 1) % n), N * n + i);
  // orient outward: the face must look toward −z
  const fa = new THREE.Vector3(...pos.slice(c0 * 3, c0 * 3 + 3));
  const fb = new THREE.Vector3(...pos.slice((N * n + 1) * 3, (N * n + 1) * 3 + 3));
  const fc = new THREE.Vector3(...pos.slice((N * n) * 3, (N * n) * 3 + 3));
  if (fb.sub(fa).cross(fc.sub(fa)).z > 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** x of the outer body side at height y on the section z (inside the arch: the edge of the cut-out) */
function sideXAt(z: number, y: number) {
  const side = sideHalf(z).slice(0, -3);
  if (y >= side[0][1]) return side[0][0];
  for (let i = 0; i < side.length - 1; i++) {
    const [x0, y0] = side[i];
    const [x1, y1] = side[i + 1];
    if ((y <= y0 && y >= y1) || (y >= y0 && y <= y1)) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0 || 1);
  }
  return side[side.length - 1][0];
}

/** height of the upper body surface (hood / fender top) at (x, z) — for parts that sit on it */
function topY(x: number, z: number) {
  const [xs, ys] = sideTop(z);
  const c = deck(z);
  const ax = Math.abs(x);
  if (ax <= xs) return c + (ys - c) * Math.pow(ax / xs, 1.6);
  const t = Math.min(1, (ax - xs) / Math.max(0.01, hw(z) - 0.13 - xs));
  return ys + (shY(z) - ys) * t;
}

/** a thin strip through 3D points; `across` = unit direction of the strip width at each point */
function ribbon(pts: THREE.Vector3[], across: THREE.Vector3[], width: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  pts.forEach((p, i) => {
    const a = across[i];
    pos.push(p.x - a.x * width / 2, p.y - a.y * width / 2, p.z - a.z * width / 2, p.x + a.x * width / 2, p.y + a.y * width / 2, p.z + a.z * width / 2);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // both faces: the strip is seen from whichever side the surface faces
  const n = idx.length;
  for (let i = 0; i < n; i += 3) idx.push(idx[i], idx[i + 2], idx[i + 1]);
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** the real upper body surface (ray cast straight down onto the built paint), set by buildBody */
let surface: ((x: number, z: number) => number) | null = null;
/** a strip lying on the hood / fender top along a path of (x, z) points */
function topRibbon(path: [number, number][], width: number, lift = 0.0025) {
  // both edges of the strip sit on the surface (it drapes over curvature instead of cutting into it)
  const H = surface ?? topY;
  const pos: number[] = [];
  const idx: number[] = [];
  path.forEach(([x, z], i) => {
    const [xa, za] = path[Math.max(0, i - 1)];
    const [xb, zb] = path[Math.min(path.length - 1, i + 1)];
    let ax = -(zb - za);
    let az = xb - xa;
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    for (const sgn of [-1, 1]) {
      const px = x + (sgn * ax * width) / 2;
      const pz = z + (sgn * az * width) / 2;
      pos.push(px, H(px, pz) + lift, pz);
    }
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3, k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** a seam following the body section at z: the top strip, then down the side(s) to the sill */
function sectionSeam(z: number, width: number, parts: { top: boolean; sides: boolean }, lift = 0.0025) {
  const side = sideHalf(z).slice(0, -3); // sideTop → … → bottom of the side (no inner well / floor)
  const geos: THREE.BufferGeometry[] = [];
  const along = (poly: [number, number][]) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[Math.max(0, i - 1)];
      const b = poly[Math.min(poly.length - 1, i + 1)];
      // outward normal of the (x, y) polyline
      let nx = b[1] - a[1];
      let ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      if (nx * poly[i][0] + ny * (poly[i][1] - 0.45) < 0) {
        nx = -nx;
        ny = -ny;
      }
      pts.push(new THREE.Vector3(poly[i][0] + nx * lift, poly[i][1] + ny * lift, z));
    }
    geos.push(ribbon(pts, pts.map(() => new THREE.Vector3(0, 0, 1)), width));
  };
  if (parts.top) along(topRow(z));
  if (parts.sides) {
    along(side);
    along(side.map(([x, y]) => [-x, y] as [number, number]));
  }
  return geos;
}

function stations(z0: number, z1: number, step: number, extra: number[] = []) {
  const s = new Set<number>();
  for (let z = z0; z < z1 - 1e-6; z += step) s.add(+z.toFixed(4));
  s.add(z1);
  for (const e of extra) if (e > z0 && e < z1) s.add(+e.toFixed(4));
  return [...s].sort((a, b) => a - b);
}

// ------------------------------------------------------------------ materials
const tex = (c: HTMLCanvasElement, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const badgeTex = tex(x1BadgeCanvas());
badgeTex.wrapS = badgeTex.wrapT = THREE.ClampToEdgeWrapping;
const M = {
  // pearl white: warm white base, clearcoat, a faint pearl (thin-film) shift at grazing angles
  paint: new THREE.MeshPhysicalMaterial({ name: 'X1_Paint', color: 0xf3f2ee, metalness: 0.22, roughness: 0.27, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.22, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420] }),
  black: new THREE.MeshPhysicalMaterial({ name: 'X1_GlossBlack', color: 0x0b0c0f, metalness: 0.3, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
  satin: new THREE.MeshPhysicalMaterial({ name: 'X1_SatinBlack', color: 0x0c0d10, metalness: 0.15, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
  carbon: new THREE.MeshStandardMaterial({ name: 'X1_Carbon', color: 0x3a3a3a, map: tex(x1CarbonCanvas()), metalness: 0.35, roughness: 0.42, side: THREE.DoubleSide }),
  chrome: new THREE.MeshStandardMaterial({ name: 'X1_Chrome', color: 0xc8ccd2, metalness: 1, roughness: 0.22 }),
  glass: new THREE.MeshPhysicalMaterial({ name: 'X1_Glass', color: 0x010203, metalness: 0.0, roughness: 0.14, transparent: true, opacity: 0.9, envMapIntensity: 0.12 }),
  liner: new THREE.MeshStandardMaterial({ name: 'X1_WheelLiner', color: 0x08090b, metalness: 0.05, roughness: 0.85, side: THREE.DoubleSide }),
  gap: new THREE.MeshStandardMaterial({ name: 'X1_PanelGap', color: 0x2a2d33, metalness: 0.1, roughness: 0.6 }),
  lightHousing: new THREE.MeshPhysicalMaterial({ name: 'X1_LightHousing', color: 0x050608, metalness: 0.4, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }),
  led: new THREE.MeshStandardMaterial({ name: 'X1_RearLED', color: 0xff0010, emissive: 0xff0010, emissiveIntensity: 1.5, roughness: 0.3 }),
  ledCore: new THREE.MeshStandardMaterial({ name: 'X1_RearLEDCore', color: 0xffc0c0, emissive: 0xff5050, emissiveIntensity: 1.8, roughness: 0.3 }),
  ledSoft: new THREE.MeshStandardMaterial({ name: 'X1_RedMarker', color: 0xff0018, emissive: 0xff0018, emissiveIntensity: 1.3, roughness: 0.3 }),
  ledHousing: new THREE.MeshPhysicalMaterial({ name: 'X1_LEDHousing', color: 0x1a0507, metalness: 0.2, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
  badge: new THREE.MeshStandardMaterial({ name: 'X1_Badge', color: 0xffffff, map: badgeTex, emissive: 0xffffff, emissiveMap: badgeTex, emissiveIntensity: 1.6, transparent: true, alphaTest: 0.05 }),
  head: new THREE.MeshStandardMaterial({ name: 'X1_Headlight', color: 0x9fd8ff, emissive: 0x6cc4ff, emissiveIntensity: 1.6, roughness: 0.2 }),
  headCore: new THREE.MeshStandardMaterial({ name: 'X1_HeadlightCore', color: 0xf2fbff, emissive: 0xe6f6ff, emissiveIntensity: 1.2, roughness: 0.2 }),
  interior: new THREE.MeshStandardMaterial({ name: 'X1_Interior', color: 0x07080a, metalness: 0.1, roughness: 0.75, envMapIntensity: 0.3 }),
  seatTrim: new THREE.MeshStandardMaterial({ name: 'X1_SeatTrim', color: 0xff3a2a, emissive: 0xff2a1a, emissiveIntensity: 1.2, roughness: 0.5 }),
  tyre: new THREE.MeshStandardMaterial({ name: 'X1_Tyre', color: 0xffffff, map: tex(x1TreadCanvas()), metalness: 0, roughness: 0.88 }),
  rim: new THREE.MeshStandardMaterial({ name: 'X1_Rim', color: 0x24272c, metalness: 0.85, roughness: 0.32 }),
  disc: new THREE.MeshStandardMaterial({ name: 'X1_Disc', color: 0x6b6f76, metalness: 0.9, roughness: 0.45 }),
  brake: new THREE.MeshStandardMaterial({ name: 'X1_Brake', color: 0xd0141f, metalness: 0.3, roughness: 0.35 }),
};

// ------------------------------------------------------------------ geometry helpers
/** bring a geometry to a common layout (indexed, position + normal + uv) so parts can be merged */
function norm(g: THREE.BufferGeometry, m?: THREE.Matrix4) {
  if (m) g.applyMatrix4(m);
  if (!g.index) {
    const n = g.getAttribute('position').count;
    g.setIndex([...Array(n).keys()]);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}
const T = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: [number, number, number] = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s));

/** extrude a 2D outline (x, y) along +z by depth, front face at z0 */
function slab(outline: [number, number][], z0: number, depth: number, bevel = 0) {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, z0);
  return g;
}
/** extrude an outline drawn in the (z, y) side plane across x (thickness centred on x0) */
function finYZ(outline: [number, number][], x0: number, thick: number) {
  const sh = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  // shape x → world z, shape y → world y, extrude z → world x
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  g.translate(x0 - thick / 2, 0, 0);
  return g;
}
const mirrorX = (pts: [number, number][]): [number, number][] => [...pts, ...pts.slice().reverse().map(([x, y]) => [-x, y] as [number, number])];
function planarUV(g: THREE.BufferGeometry, axisA: 'x' | 'y' | 'z', axisB: 'x' | 'y' | 'z', scale: number) {
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  const get = (i: number, a: string) => (a === 'x' ? p.getX(i) : a === 'y' ? p.getY(i) : p.getZ(i));
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = get(i, axisA) * scale;
    uv[i * 2 + 1] = get(i, axisB) * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

class Parts {
  map = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  add(name: string, mat: THREE.Material, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    if (!this.map.has(name)) this.map.set(name, { mat, geos: [] });
    this.map.get(name)!.geos.push(norm(g, m));
  }
  meshes() {
    return [...this.map].map(([name, { mat, geos }]) => {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
      mesh.name = name;
      return mesh;
    });
  }
}

// ------------------------------------------------------------------ the body
function buildBody(P: Parts) {
  const extra: number[] = [];
  for (const a of [AX_F, AX_R]) for (let k = -1; k <= 1; k += 0.1) extra.push(a.z + a.arch * k, a.z + a.arch * (k > 0 ? 0.999 : -0.999));
  const zs = stations(Z_NOSE + NOSE_R, Z_TAIL, 0.03, extra);
  P.add('Body_Paint', M.paint, loftRows(zs, sideRow, true));
  // top strip: painted on the hood and the rear deck, dark interior under the glass
  P.add('Body_Paint', M.paint, loftRows(zs.filter((z) => z <= -0.98), topRow, false));
  P.add('Interior', M.interior, loftRows(zs.filter((z) => z >= -0.99 && z <= 1.93), topRow, false));
  P.add('Body_Paint', M.paint, loftRows(zs.filter((z) => z >= 1.92), topRow, false));
  P.add('Body_Paint', M.paint, noseFillet());
  P.add('Body_Paint', M.paint, bodyCap(Z_TAIL, false));

  // greenhouse: glass canopy (windscreen, side windows, roof, fastback glass)
  const gHalf = (z: number): [number, number][] => {
    const b = ramp(-0.2, 0.25, z);
    const top = gTop(z);
    const ht = gHalfTop(z);
    const base: [number, number] = [mix(gHalfBase(z), ht + 0.055, b), mix(gBaseY(z), top - 0.03, b)];
    const pts: [number, number][] = [[0, top + 0.012], [ht - 0.05, top - 0.004], [ht + 0.06, top - 0.05], base];
    return chaikin(pts, 2);
  };
  const gz = stations(G_Z0, G_Z1, 0.03);
  const glassGeo = (() => {
    const pos: number[] = [];
    const idx: number[] = [];
    let n = 0;
    for (const z of gz) {
      const h = gHalf(z);
      const row: [number, number][] = [...h.slice().reverse().map(([x, y]) => [-x, y] as [number, number]), ...h.slice(1)];
      n = row.length;
      for (const [x, y] of row) pos.push(x, y, z);
    }
    for (let k = 0; k < gz.length - 1; k++)
      for (let i = 0; i < n - 1; i++) {
        const a = k * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  P.add('Glass_Canopy', M.glass, glassGeo);
  // glass end at the rear deck (small vertical face) — closes the canopy
  {
    const h = gHalf(G_Z1);
    const out = mirrorX(h.map(([x, y]) => [x, y] as [number, number]).reverse());
    const sh = out.map(([x, y]) => [x, Math.max(y, 0.745)] as [number, number]);
    P.add('Glass_Canopy', M.glass, new THREE.ShapeGeometry(new THREE.Shape(sh.map(([x, y]) => new THREE.Vector2(x, y)))), T(0, 0, G_Z1));
  }

  // ---- rear face (z = Z_TAIL), measured from the master
  const zf = Z_TAIL + 0.003;
  // deck well between the buttresses: the active spoiler (separate node, see buildSpoiler) lies flush
  // in it; when the spoiler rises the well shows black, never body paint
  P.add('Body_GlossBlack', M.black, new THREE.BoxGeometry(0.94, 0.012, 0.36), T(0, 0.742, 2.03));
  // LED housing: smoked long hexagon around the light blade
  P.add('Rear_LEDHousing', M.ledHousing, slab([[-0.88, 0.632], [0.88, 0.632], [0.945, 0.596], [0.92, 0.566], [-0.92, 0.566], [-0.945, 0.596]], zf - 0.02, 0.025, 0.003));
  // continuous LED blade: top line with chevron ends + thin lower return line
  const blade: [number, number][] = [[0.0, 0.621], [0.866, 0.621], [0.938, 0.588], [0.925, 0.573], [0.856, 0.599], [0.0, 0.599]];
  const bl = (pts: [number, number][]) => {
    const right = pts;
    const left = right.map(([x, y]) => [-x, y] as [number, number]);
    // outline: right top → right tip → right bottom → centre → left bottom → left tip → left top
    return [right[1], right[2], right[3], right[4], left[4], left[3], left[2], left[1]];
  };
  P.add('Rear_LED', M.led, slab(bl(blade), zf + 0.006, 0.006));
  // hot inner line along the blade (the master's near-white core)
  P.add('Rear_LEDCore', M.ledCore, slab([[-0.85, 0.6085], [0.85, 0.6085], [0.85, 0.6125], [-0.85, 0.6125]], zf + 0.0125, 0.002));
  P.add('Rear_LED', M.led, slab([[-0.83, 0.5735], [0.83, 0.5735], [0.83, 0.5795], [-0.83, 0.5795]], zf + 0.006, 0.004));
  // black badge panel (trapezoid under the light), XWAVE badge centred on it
  P.add('Rear_BadgePanel', M.black, slab([[-0.56, 0.566], [0.56, 0.566], [0.47, 0.485], [-0.47, 0.485]], zf, 0.012, 0.004));
  const badge = new THREE.PlaneGeometry(0.29, 0.0725);
  P.add('Badge_XWAVE', M.badge, badge, T(0, 0.528, zf + 0.022));
  // ---- lower rear bumper (v3, Tesla-Roadster-inspired integration, XWAVE layout):
  // one solid satin-black body from the white bumper band down, wrapping between the rear tyres,
  // with a recessed diffuser opening. No rods, rails, tubes or fins hanging below it.
  {
    const BUMPER_FACE = Z_TAIL + 0.035;
    const BUMPER_FRONT = 1.8;
    const right: [number, number][] = [[0.84, 0.405], [0.862, 0.39], [0.85, 0.36], [0.8, 0.325], [0.7, 0.26], [0.655, 0.2], [0.635, 0.145], [0.6, 0.12]];
    const outline = [...right.map(([x, y]) => new THREE.Vector2(x, y)), ...right.slice().reverse().map(([x, y]) => new THREE.Vector2(-x, y))];
    const shape = new THREE.Shape(outline);
    // diffuser opening: rounded rectangle, the recess goes 0.1 m into the bumper
    const hole = new THREE.Path();
    const hx = 0.52;
    const y0 = 0.155;
    const y1 = 0.3;
    const rr = 0.035;
    hole.moveTo(-hx + rr, y0);
    hole.lineTo(hx - rr, y0);
    hole.quadraticCurveTo(hx, y0, hx, y0 + rr);
    hole.lineTo(hx, y1 - rr);
    hole.quadraticCurveTo(hx, y1, hx - rr, y1);
    hole.lineTo(-hx + rr, y1);
    hole.quadraticCurveTo(-hx, y1, -hx, y1 - rr);
    hole.lineTo(-hx, y0 + rr);
    hole.quadraticCurveTo(-hx, y0, -hx + rr, y0);
    shape.holes.push(hole);
    const depth = BUMPER_FACE - BUMPER_FRONT;
    const bumper = new THREE.ExtrudeGeometry(shape, { depth: depth - 0.024, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3, curveSegments: 6 });
    bumper.translate(0, 0, BUMPER_FRONT + 0.012);
    P.add('Rear_LowerBumper', M.satin, bumper);
    // recess back wall + three restrained fins joined to the wall, floor and ceiling of the recess
    const back = BUMPER_FACE - 0.1;
    P.add('Diffuser', M.carbon, planarUV(new THREE.PlaneGeometry(hx * 2, y1 - y0), 'x', 'y', 5), T(0, (y0 + y1) / 2, back));
    for (const x of [-0.26, 0, 0.26]) P.add('Diffuser', M.satin, new THREE.BoxGeometry(0.012, y1 - y0, 0.09), T(x, (y0 + y1) / 2, back + 0.045));
    // red markers and the centre brake light on the bumper face
    for (const s of [-1, 1]) P.add('Rear_Markers', M.ledSoft, slab([[0.57 * s, 0.355], [0.77 * s, 0.352], [0.76 * s, 0.37], [0.575 * s, 0.374]], BUMPER_FACE + 0.001, 0.004));
    P.add('Rear_Markers', M.ledSoft, new THREE.BoxGeometry(0.22, 0.014, 0.006), T(0, 0.33, BUMPER_FACE + 0.004));
  }

  // ---- roof stop light (top of the rear glass)
  {
    const z = 0.32;
    const y = gTop(z) + 0.012;
    const slope = Math.atan2(gTop(z + 0.05) - gTop(z - 0.05), 0.1);
    P.add('Body_GlossBlack', M.black, new THREE.BoxGeometry(0.32, 0.016, 0.07), T(0, y, z, -slope));
    P.add('Light_RoofStop', M.led, new THREE.BoxGeometry(0.2, 0.006, 0.035), T(0, y + 0.009, z + 0.005, -slope));
  }

  // ---- front (v4.1.3): integrated lower aero, slim intakes, LED signature, panel seams
  {
    // parts lying on the hood follow the actual paint surface (ray cast), not an approximation
    const paintMesh = new THREE.Mesh(mergeGeometries(P.map.get('Body_Paint')!.geos, false)!, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    paintMesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const hits: THREE.Intersection[] = [];
    surface = (x, z) => {
      ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
      hits.length = 0;
      paintMesh.raycast(ray, hits);
      return hits.length ? Math.max(...hits.map((h) => h.point.y)) : topY(x, z);
    };
    const FACE = Z_NOSE; // flat centre of the rounded nose
    // splitter: a short satin-black lip tucked under the chin (front edge 3 cm behind the nose),
    // following the underside back to the front wheels — no plate sticking out ahead of the car
    const sp: [number, number][] = [];
    for (let z = -2.265; z <= -1.9 + 1e-6; z += 0.025) sp.push([z, Math.max(0.118, under(z) - 0.028)]);
    for (let z = -1.9; z >= -2.265 - 1e-6; z -= 0.025) sp.push([z, under(z) + 0.012]);
    P.add('Front_Splitter', M.satin, finYZ(sp, 0, 1.18));
    // lower intake: wide, slim, gloss frame around a matte recess, one centre vane
    const rr = (x0: number, y0: number, x1: number, y1: number, r: number): [number, number][] => {
      const o: [number, number][] = [];
      const c: [number, number, number][] = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
      for (const [cx, cy, a0] of c) for (let k = 0; k <= 3; k++) o.push([cx + Math.cos(a0 + (k / 3) * (Math.PI / 2)) * r, cy + Math.sin(a0 + (k / 3) * (Math.PI / 2)) * r]);
      return o;
    };
    P.add('Front_Intake', M.black, slab(rr(-0.45, 0.222, 0.45, 0.3, 0.024), FACE - 0.006, 0.008));
    P.add('Front_IntakeRecess', M.liner, slab(rr(-0.43, 0.23, 0.43, 0.292, 0.018), FACE - 0.0075, 0.002));
    P.add('Front_Intake', M.satin, new THREE.BoxGeometry(0.8, 0.006, 0.004), T(0, 0.26, FACE - 0.0085));
    // air curtains: two slim vertical inlets at the bumper corners (subtle, inside the face outline)
    for (const sx of [-1, 1]) {
      const pts: [number, number][] = [[0.585, 0.25], [0.63, 0.252], [0.645, 0.33], [0.605, 0.33]].map(([x, y]) => [x * sx, y] as [number, number]);
      P.add('Front_Intake', M.black, slab(sx < 0 ? pts.slice().reverse() : pts, FACE - 0.006, 0.008));
    }
    // headlights: a slim smoked housing on each front corner of the hood with a thin LED blade and a
    // short down-turned hook at the outer end (XWAVE signature) — light lines, not lamps
    for (const sx of [-1, 1]) {
      const path: [number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        path.push([sx * (0.17 + 0.36 * t), -2.215 + 0.17 * t + 0.07 * t * t]);
      }
      P.add('Light_HeadHousing', M.lightHousing, topRibbon(path, 0.072, 0.003));
      P.add('Light_Head', M.head, topRibbon(path.slice(1, 10), 0.02, 0.0055));
      P.add('Light_HeadCore', M.headCore, topRibbon(path.slice(2, 9), 0.007, 0.0065));
      const hook: [number, number][] = [[sx * 0.5, -2.02], [sx * 0.535, -1.99], [sx * 0.555, -1.95]];
      P.add('Light_Head', M.head, topRibbon(hook, 0.016, 0.0058));
    }
    // panel seams: front bumper cover (across the hood and down both sides), hood edges, doors
    // bumper cover seam right where the rounded nose meets the hood / fenders
    for (const g of sectionSeam(Z_NOSE + NOSE_R + 0.004, 0.0045, { top: true, sides: true })) P.add('Body_PanelGaps', M.gap, g);
    for (const sx of [-1, 1]) {
      const path: [number, number][] = [];
      for (let z = Z_NOSE + NOSE_R + 0.004; z <= -1.13 + 1e-6; z += 0.05) path.push([sx * 0.8 * sideTop(z)[0], z]);
      P.add('Body_PanelGaps', M.gap, topRibbon(path, 0.0045));
    }
    {
      const path: [number, number][] = [];
      const xs = 0.8 * sideTop(-1.13)[0];
      for (let i = 0; i <= 8; i++) path.push([-xs + (2 * xs * i) / 8, -1.13]);
      P.add('Body_PanelGaps', M.gap, topRibbon(path, 0.0045));
    }
    for (const z of [-0.88, 0.16]) for (const g of sectionSeam(z, 0.0045, { top: false, sides: true })) P.add('Body_PanelGaps', M.gap, g);
    surface = null;
  }
  // ---- wheel-arch liners: matte black wells (the white inner panels used to show around the tyres).
  // The liner follows the arch line and ends just inside the body side at every point (never pokes out)
  for (const a of [AX_F, AX_R]) {
    const R = a.arch - 0.006;
    const below = Math.asin(Math.min(0.95, (a.r - sill(a.z) + 0.01) / (R * a.vf)));
    const N = 28;
    for (const sx of [-1, 1]) {
      const pos: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= N; i++) {
        const th = -below + ((Math.PI + 2 * below) * i) / N;
        const y = a.r + R * a.vf * Math.sin(th);
        const z = a.z + R * Math.cos(th);
        const xo = Math.max(a.xin + 0.02, sideXAt(z, y) - 0.014);
        pos.push(sx * a.xin, y, z, sx * xo, y, z);
        if (i > 0) {
          const k = (i - 1) * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      P.add('Wheel_Liners', M.liner, g);
      const back = new THREE.CircleGeometry(R + 0.002, N, -below, Math.PI + 2 * below);
      back.scale(1, a.vf, 1);
      back.rotateY(Math.PI / 2); // (x, y) plane → (z, y) plane, arc above the sill
      P.add('Wheel_Liners', M.liner, back, T(sx * (a.xin + 0.004), a.r, a.z));
    }
  }
}

// ------------------------------------------------------------------ wheels
function wheel(name: string, ax: typeof AX_F, side: -1 | 1, front: boolean) {
  const hub = new THREE.Group();
  hub.name = `Wheel_${name}`;
  hub.position.set(ax.x * side, ax.r, ax.z);
  const spin = new THREE.Group();
  spin.name = `Spin_${name}`;
  hub.add(spin);
  const R = ax.r;
  const w = ax.w;
  const rimR = R - 0.115;
  // tyre: lathe profile (radius, axial), around Y → turned to the X axle
  const prof: THREE.Vector2[] = [];
  const h = w / 2;
  const pts: [number, number][] = [
    [rimR - 0.005, -h + 0.02], [R - 0.07, -h], [R - 0.03, -h + 0.008], [R - 0.008, -h + 0.03], [R, -h + 0.06],
    [R, h - 0.06], [R - 0.008, h - 0.03], [R - 0.03, h - 0.008], [R - 0.07, h], [rimR - 0.005, h - 0.02],
  ];
  for (const [r, a] of pts) prof.push(new THREE.Vector2(r, a));
  const tyre = new THREE.LatheGeometry(prof, 56);
  // UVs: u around the tyre (tread repeats 28×), v across the width
  {
    const uv = tyre.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 28);
  }
  tyre.rotateZ(Math.PI / 2);
  const tm = new THREE.Mesh(norm(tyre), M.tyre);
  tm.name = `Tyre_${name}`;
  spin.add(tm);
  // rim: barrel + lip + 10 split spokes + hub, the face toward the outside
  const out = side; // +x for right wheels
  const parts: THREE.BufferGeometry[] = [];
  parts.push(norm(new THREE.CylinderGeometry(rimR, rimR, w * 0.86, 40, 1, true), T(0, 0, 0, 0, 0, Math.PI / 2)));
  parts.push(norm(new THREE.TorusGeometry(rimR, 0.012, 6, 40), T(out * w * 0.42, 0, 0, 0, Math.PI / 2)));
  parts.push(norm(new THREE.CylinderGeometry(0.065, 0.075, 0.08, 16), T(out * w * 0.32, 0, 0, 0, 0, Math.PI / 2)));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    for (const d of [-0.05, 0.05]) {
      const len = rimR - 0.07;
      const sp = new THREE.BoxGeometry(0.03, len, 0.016);
      sp.translate(0, 0.07 + len / 2, 0);
      parts.push(norm(sp, T(out * (w * 0.33), 0, 0, a + d, 0, 0).multiply(T(0, 0, 0, 0, Math.PI / 2, 0))));
    }
  }
  const rim = new THREE.Mesh(mergeGeometries(parts)!, M.rim);
  rim.name = `Rim_${name}`;
  spin.add(rim);
  const disc = new THREE.Mesh(norm(new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.78, 0.028, 32), T(out * 0.02, 0, 0, 0, 0, Math.PI / 2)), M.disc);
  disc.name = `Disc_${name}`;
  spin.add(disc);
  const cal = new THREE.Mesh(norm(new THREE.BoxGeometry(0.07, 0.14, 0.09), T(out * 0.05, rimR * 0.62, front ? 0.07 : -0.07, front ? 0.45 : -0.45)), M.brake);
  cal.name = `Caliper_${name}`;
  hub.add(cal);
  return hub;
}

// ------------------------------------------------------------------ active spoiler
/** hinge line of the rear-deck spoiler (front edge, flush with the deck) */
export const SPOILER_HINGE = { y: 0.752, z: 1.9 };
/**
 * XWAVE active spoiler: the black rear-deck lip between the buttresses is a flap hinged at its front
 * edge. Closed it is flush with the deck; the game rotates `Spoiler_Pivot` around X (negative =
 * trailing edge up) while nitro runs. No struts: the hinge is the only connection.
 */
function buildSpoiler() {
  const pivot = new THREE.Group();
  pivot.name = 'Spoiler_Pivot';
  pivot.position.set(0, SPOILER_HINGE.y, SPOILER_HINGE.z);
  // aerofoil section in the (z, y) side plane, relative to the hinge
  const sec: [number, number][] = [[0, -0.003], [0.15, 0.011], [0.3, 0.02], [0.335, 0.027], [0.335, 0.013], [0.2, 0.0], [0.02, -0.009]];
  const g = finYZ(sec, 0, 0.92);
  const m = new THREE.Mesh(norm(g), M.black);
  m.name = 'Spoiler';
  pivot.add(m);
  // v4.1.3 pop-up: the flap rises on the deck and tilts. A satin skirt under its front and sides
  // closes the gap (no visible rods or open slot); closed, it sits inside the deck well
  // wedge side plates: exactly the gap between the raised, tilted flap and the deck (+1.5 cm under
  // the deck), so from any angle the raised flap reads as one solid pop-up piece, not a box
  const th = 0.38; // = RENDER.spoilerAngle
  const rise = 0.06; // = RENDER.spoilerRise
  const under = (z: number) => -(rise + z * Math.sin(th)) / Math.cos(th) - 0.015;
  const skirt: THREE.BufferGeometry[] = [];
  skirt.push(norm(new THREE.BoxGeometry(0.9, -under(0), 0.01), T(0, under(0) / 2, 0.012)));
  for (const sx of [-1, 1]) skirt.push(norm(finYZ([[0.006, under(0.006)], [0.29, under(0.29)], [0.29, 0.01], [0.006, -0.002]], sx * 0.452, 0.01)));
  const sk = new THREE.Mesh(mergeGeometries(skirt)!, M.liner);
  sk.name = 'Spoiler_Skirt';
  pivot.add(sk);
  // thin satin-metal accent along the trailing edge: catches the light when the flap is up
  const lip = new THREE.Mesh(norm(new THREE.BoxGeometry(0.9, 0.006, 0.008), T(0, 0.024, 0.329)), M.chrome);
  lip.name = 'Spoiler_Lip';
  pivot.add(lip);
  return pivot;
}

// ------------------------------------------------------------------ body length (v4.1.2)
/**
 * Visual length cut as a fraction of the 4.60 m design length. Only the front half is shortened:
 * 60 % from the nose overhang, 40 % between the front arch and the cabin (shorter hood / wheelbase).
 * The front wheel-arch zone keeps scale 1 so the arches stay round, and everything behind
 * WARP_FIX (the cabin, buttresses, rear end, bumper, spoiler, sockets) is untouched.
 */
export const LENGTH_CUT = 0.08;
const DESIGN_LEN = 4.6;
const WARP_NOSE = -2.4;
const WARP_FIX = 0.0;
const ARCH_A = AX_F.z - 0.45;
const ARCH_B = AX_F.z + 0.45;
function warpFn(cut: number) {
  const c = cut * DESIGN_LEN;
  const lenA = ARCH_A - WARP_NOSE;
  const lenC = WARP_FIX - ARCH_B;
  const kA = (lenA - 0.6 * c) / lenA;
  const kC = (lenC - 0.4 * c) / lenC;
  const bC = WARP_FIX - lenC * kC; // world z of ARCH_B
  const shiftB = bC - ARCH_B; // the arch zone just moves
  const aA = ARCH_A + shiftB; // world z of ARCH_A
  /** world z of a design z, and the local z scale there */
  return (z: number): [number, number] => {
    if (z >= WARP_FIX) return [z, 1];
    if (z >= ARCH_B) return [WARP_FIX - (WARP_FIX - z) * kC, kC];
    if (z >= ARCH_A) return [z + shiftB, 1];
    return [aA - (ARCH_A - z) * kA, kA];
  };
}
/** apply the length warp to a geometry (positions; normals follow the local z scale) */
function warpGeometry(g: THREE.BufferGeometry, W: (z: number) => [number, number]) {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const [z, k] = W(p.getZ(i));
    p.setZ(i, z);
    if (n && k !== 1) {
      v.set(n.getX(i), n.getY(i), n.getZ(i) / k).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
  }
  p.needsUpdate = true;
  if (n) n.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

// ------------------------------------------------------------------ assemble + export
export function buildX1(opts: { cut?: number } = {}): THREE.Group {
  const W = warpFn(opts.cut ?? LENGTH_CUT);
  const root = new THREE.Group();
  root.name = 'X1';
  const body = new THREE.Group();
  body.name = 'Body';
  root.add(body);
  const P = new Parts();
  buildBody(P);
  for (const m of P.meshes()) {
    warpGeometry(m.geometry, W);
    body.add(m);
  }
  const front = { ...AX_F, z: W(AX_F.z)[0] };
  root.add(wheel('FL', front, -1, true), wheel('FR', front, 1, true), wheel('RL', AX_R, -1, false), wheel('RR', AX_R, 1, false));
  body.add(buildSpoiler());
  for (const s of [-1, 1] as const) {
    const n = new THREE.Object3D();
    n.name = s < 0 ? 'NitroSocket_L' : 'NitroSocket_R';
    n.position.set(0.38 * s, 0.2, Z_TAIL + 0.03);
    root.add(n);
  }
  return root;
}

export async function exportX1(opts: { cut?: number } = {}): Promise<ArrayBuffer> {
  const root = buildX1(opts);
  const ex = new GLTFExporter();
  const glb = await ex.parseAsync(root, { binary: true, onlyVisible: false, includeCustomExtensions: false });
  return glb as ArrayBuffer;
}

(window as unknown as { __x1: unknown }).__x1 = { buildX1, exportX1, THREE };
