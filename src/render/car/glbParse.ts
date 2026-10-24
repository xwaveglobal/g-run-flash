import * as THREE from 'three';

/**
 * Minimal binary glTF (GLB) reader for the game's own models.
 *
 * Why not GLTFLoader: the single-file build and the native TikTok build stub GLTFLoader out, and
 * image decoding / XHR differ per platform. This reader needs neither: it builds geometry, node
 * transforms and PBR materials (factors only) straight from the bytes. Image textures in the file
 * are ignored — the caller applies procedural textures by material name (see car/x1Textures.ts).
 *
 * Supported: triangle primitives (POSITION, NORMAL, TEXCOORD_0, indices), node TRS / matrix,
 * pbrMetallicRoughness factors, emissive, alphaMode, doubleSided, KHR_materials_clearcoat,
 * KHR_materials_iridescence (factors only), KHR_materials_emissive_strength. Anything else is skipped.
 */

interface GltfJson {
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }[] }[];
  materials?: {
    name?: string;
    pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number };
    emissiveFactor?: number[];
    alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
    alphaCutoff?: number;
    doubleSided?: boolean;
    extensions?: Record<string, Record<string, number>>;
  }[];
  accessors: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
}

const COMP: Record<number, { ctor: { new (b: ArrayBuffer, o: number, n: number): ArrayLike<number> & { BYTES_PER_ELEMENT: number } } & { BYTES_PER_ELEMENT: number } }> = {
  5120: { ctor: Int8Array },
  5121: { ctor: Uint8Array },
  5122: { ctor: Int16Array },
  5123: { ctor: Uint16Array },
  5125: { ctor: Uint32Array },
  5126: { ctor: Float32Array },
};
const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function parseGlb(data: ArrayBuffer): THREE.Group {
  const dv = new DataView(data);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  let off = 12;
  let json: GltfJson | null = null;
  let bin: ArrayBuffer | null = null;
  while (off < data.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(utf8(new Uint8Array(data, start, len)));
    else if (type === 0x004e4942) bin = data.slice(start, start + len);
    off = start + len;
  }
  if (!json || !bin) throw new Error('GLB without JSON or BIN chunk');
  const g = json;
  const buf = bin;

  const accessor = (i: number) => {
    const a = g.accessors[i];
    const bv = g.bufferViews[a.bufferView ?? 0];
    const { ctor } = COMP[a.componentType];
    const n = SIZE[a.type];
    const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const el = ctor.BYTES_PER_ELEMENT;
    if (bv.byteStride && bv.byteStride !== n * el) {
      // interleaved → copy out
      const out = new (ctor as unknown as { new (n: number): Float32Array })(a.count * n);
      const view = new DataView(buf);
      const get = (o: number) =>
        a.componentType === 5126 ? view.getFloat32(o, true) : a.componentType === 5125 ? view.getUint32(o, true) : a.componentType === 5123 ? view.getUint16(o, true) : view.getUint8(o);
      for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get(base + k * bv.byteStride + c * el);
      return { array: out, itemSize: n };
    }
    // copy so the array is aligned and owns its memory
    const src = new ctor(buf, base, a.count * n) as unknown as Float32Array;
    return { array: src.slice(), itemSize: n };
  };

  const materials = (g.materials ?? []).map((m) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    const cc = m.extensions?.KHR_materials_clearcoat;
    const es = m.extensions?.KHR_materials_emissive_strength;
    const ir = m.extensions?.KHR_materials_iridescence;
    const mat = cc || ir ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
    mat.name = m.name ?? '';
    const bc = pbr.baseColorFactor ?? [1, 1, 1, 1];
    mat.color.setRGB(bc[0], bc[1], bc[2], THREE.LinearSRGBColorSpace);
    mat.metalness = pbr.metallicFactor ?? 1;
    mat.roughness = pbr.roughnessFactor ?? 1;
    if (m.emissiveFactor) mat.emissive.setRGB(m.emissiveFactor[0], m.emissiveFactor[1], m.emissiveFactor[2], THREE.LinearSRGBColorSpace);
    if (es?.emissiveStrength) mat.emissiveIntensity = es.emissiveStrength;
    if (cc && mat instanceof THREE.MeshPhysicalMaterial) {
      mat.clearcoat = cc.clearcoatFactor ?? 0;
      mat.clearcoatRoughness = cc.clearcoatRoughnessFactor ?? 0;
    }
    if (ir && mat instanceof THREE.MeshPhysicalMaterial) {
      mat.iridescence = ir.iridescenceFactor ?? 0;
      mat.iridescenceIOR = ir.iridescenceIor ?? 1.3;
      mat.iridescenceThicknessRange = [ir.iridescenceThicknessMinimum ?? 100, ir.iridescenceThicknessMaximum ?? 400];
    }
    if (m.alphaMode === 'BLEND') {
      mat.transparent = true;
      mat.opacity = bc[3];
      mat.depthWrite = false;
    } else if (m.alphaMode === 'MASK') mat.alphaTest = m.alphaCutoff ?? 0.5;
    mat.side = m.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    return mat;
  });
  const fallback = new THREE.MeshStandardMaterial({ name: 'default' });

  const geoms = (g.meshes ?? []).map((m) =>
    m.primitives
      .filter((p) => (p.mode ?? 4) === 4)
      .map((p) => {
        const geo = new THREE.BufferGeometry();
        const pos = accessor(p.attributes.POSITION);
        geo.setAttribute('position', new THREE.BufferAttribute(pos.array, 3));
        if (p.attributes.NORMAL !== undefined) geo.setAttribute('normal', new THREE.BufferAttribute(accessor(p.attributes.NORMAL).array, 3));
        if (p.attributes.TEXCOORD_0 !== undefined) geo.setAttribute('uv', new THREE.BufferAttribute(accessor(p.attributes.TEXCOORD_0).array, 2));
        if (p.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(accessor(p.indices).array, 1));
        if (!geo.getAttribute('normal')) geo.computeVertexNormals();
        geo.computeBoundingSphere();
        return { geo, mat: p.material !== undefined ? materials[p.material] : fallback };
      }),
  );

  const node = (i: number): THREE.Object3D => {
    const n = g.nodes[i];
    const prims = n.mesh !== undefined ? geoms[n.mesh] : [];
    let o: THREE.Object3D;
    if (prims.length === 1) o = new THREE.Mesh(prims[0].geo, prims[0].mat);
    else {
      o = new THREE.Group();
      for (const p of prims) o.add(new THREE.Mesh(p.geo, p.mat));
    }
    o.name = n.name ?? '';
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    for (const c of n.children ?? []) o.add(node(c));
    return o;
  };

  const root = new THREE.Group();
  for (const i of g.scenes[g.scene ?? 0].nodes) root.add(node(i));
  return root;
}

/** UTF-8 → string without TextDecoder (not every mini-game runtime has it) */
function utf8(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    if (c < 0x80) s += String.fromCharCode(c);
    else if (c < 0xe0) s += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f));
    else if (c < 0xf0) s += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f));
    else {
      const cp = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
      s += String.fromCodePoint(cp);
    }
  }
  return s;
}

/** bytes of a bundled asset: a data: URL is decoded in place (no fetch / atob needed), anything else is fetched */
export async function assetBytes(url: string): Promise<ArrayBuffer> {
  const m = /^data:[^,]*;base64,/.exec(url);
  if (!m) return (await fetch(url)).arrayBuffer();
  const b64 = url.slice(m[0].length);
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const map = new Uint8Array(128);
  for (let i = 0; i < 64; i++) map[T.charCodeAt(i)] = i;
  let n = b64.length;
  while (n > 0 && b64[n - 1] === '=') n--;
  const out = new Uint8Array((n * 3) >> 2);
  let o = 0;
  for (let i = 0; i < n; i += 4) {
    const a = map[b64.charCodeAt(i)];
    const b = map[b64.charCodeAt(i + 1)];
    const c = i + 2 < n ? map[b64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < n ? map[b64.charCodeAt(i + 3)] : 0;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (v >> 16) & 255;
    if (o < out.length) out[o++] = (v >> 8) & 255;
    if (o < out.length) out[o++] = v & 255;
  }
  return out.buffer;
}
