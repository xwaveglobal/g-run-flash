import * as THREE from 'three';
import type { Box } from '../gameplay/types.ts';

/**
 * Development overlay (?debug=collision): wire boxes for
 *   cyan   — the car's visual bounds (solid meshes of the 3D car / rear image plane)
 *   green  — the gameplay hitbox (Player.hitbox)
 *   yellow — each obstacle's visual bounds (solid meshes of its view)
 *   red    — each obstacle's collision boxes (ObstacleRules.hitboxes, as the World uses them)
 * Created only when the URL asks for it; nothing of it exists in a normal session.
 */
export const COLLISION_DEBUG = (() => {
  try {
    return new URLSearchParams(location.search).get('debug') === 'collision';
  } catch {
    return false;
  }
})();

const COL = { car: 0x29d3ff, hit: 0x22e05a, obVis: 0xffd23d, obCol: 0xff3a3a };

const _v = new THREE.Vector3();
/**
 * union of the world-space bounds of the visible, solid meshes under `obj` (no sprites, lines, glows).
 * Vertex-exact (a spinning wheel's rotated AABB would otherwise poke ~12 cm through the road).
 */
export function solidBounds(obj: THREE.Object3D, out: THREE.Box3, parts?: { name: string; box: THREE.Box3 }[]) {
  out.makeEmpty();
  const tmp = new THREE.Box3();
  obj.updateWorldMatrix(true, true);
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(o as THREE.Points).isPoints) {
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material & { blending?: number };
      const glow = mat.blending === THREE.AdditiveBlending || (mat.transparent && mat.opacity < 0.5);
      if (!glow) {
        const pos = m.geometry.getAttribute('position');
        tmp.makeEmpty();
        for (let i = 0; i < pos.count; i++) tmp.expandByPoint(_v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
        out.union(tmp);
        parts?.push({ name: m.name || (mat.name ?? '') || m.parent?.name || '?', box: tmp.clone() });
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(obj);
  return out;
}

export class DebugCollision {
  group = new THREE.Group();
  private geo: THREE.EdgesGeometry;
  private mats = new Map<number, THREE.LineBasicMaterial>();
  private boxes: THREE.LineSegments[] = [];
  private used = 0;
  private tmp = new THREE.Box3();

  constructor() {
    this.geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.group.renderOrder = 50;
  }

  private mat(c: number) {
    let m = this.mats.get(c);
    if (!m) this.mats.set(c, (m = new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true, toneMapped: false })));
    return m;
  }

  private draw(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, c: number) {
    let l = this.boxes[this.used];
    if (!l) {
      l = new THREE.LineSegments(this.geo, this.mat(c));
      l.renderOrder = 50;
      l.frustumCulled = false;
      this.boxes.push(l);
      this.group.add(l);
    }
    this.used++;
    l.material = this.mat(c);
    l.visible = true;
    l.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    l.scale.set(Math.max(1e-3, maxX - minX), Math.max(1e-3, maxY - minY), Math.max(1e-3, maxZ - minZ));
  }

  /**
   * @param hit the car's hitbox (world space)
   * @param car the car's visual object (3D model or rear image), may be null
   * @param obstacles live obstacles: collision boxes (world space) + their view objects
   */
  update(hit: Box, car: THREE.Object3D | null, obstacles: { boxes: Box[]; view: THREE.Object3D | undefined }[]) {
    this.used = 0;
    this.draw(hit.minX, hit.minY, hit.minZ, hit.maxX, hit.maxY, hit.maxZ, COL.hit);
    if (car) {
      const b = solidBounds(car, this.tmp);
      if (!b.isEmpty()) this.draw(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, COL.car);
    }
    for (const o of obstacles) {
      if (o.view && o.view.visible) {
        const b = solidBounds(o.view, this.tmp);
        if (!b.isEmpty()) this.draw(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, COL.obVis);
      }
      for (const h of o.boxes) this.draw(h.minX, h.minY, h.minZ, h.maxX, h.maxY, h.maxZ, COL.obCol);
    }
    for (let i = this.used; i < this.boxes.length; i++) this.boxes[i].visible = false;
  }
}
