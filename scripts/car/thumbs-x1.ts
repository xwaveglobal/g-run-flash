/**
 * Owner request (v4.5.1): every car picture in the UI panels = a render of the in-game 3D X1 with that
 * car's colourway (real game code: Vehicle.setSkin + MeshCar, game-like light, transparent background).
 * Bundled + driven by scripts/car/thumbs-x1.mjs → src/assets/images/cars/<id>.webp (cards) and
 * src/assets/images/cars/rear-<id>.webp (share card / result screen).
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Vehicle, SKINS } from '../../src/render/Vehicle.ts';
import { Player } from '../../src/gameplay/Player.ts';

const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setClearColor(0x000000, 0);
r.outputColorSpace = THREE.SRGBColorSpace;
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 1.05;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
(scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.75;
scene.add(new THREE.HemisphereLight(0xcfdcff, 0x40305a, 1.2));
const sun = new THREE.DirectionalLight(0xfff0e0, 2.0);
sun.position.set(-5, 9, 6);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x9fdcff, 1.2);
rim.position.set(6, 4, -6);
scene.add(rim);
const v = new Vehicle();
scene.add(v.root);
const p = new Player();
p.reset(1);
p.x = 0;

const views = {
  // garage cards / celebration: rear three-quarter, a little above (shows the 3D shape)
  card: { w: 1200, h: 1200, az: 0.42, el: 0.2, dist: 8.4, fov: 30, look: [0, 0.55, 0.15] },
  // share card / result screen: straight from behind, slightly above (wide)
  rear: { w: 1600, h: 1000, az: 0, el: 0.13, dist: 9.2, fov: 22, look: [0, 0.6, 0] },
} as const;

(window as unknown as { __go: () => Promise<Record<string, string>> }).__go = async () => {
  for (let i = 0; i < 300; i++) {
    let found = false;
    v.root.traverse((o) => (found ||= o.name === 'X1'));
    if (found) break;
    await new Promise((res) => setTimeout(res, 50));
  }
  const out: Record<string, string> = {};
  for (const skin of SKINS) {
    v.setSkin(skin);
    for (let i = 0; i < 90; i++) v.update(p, 1 / 60, 0, 0); // springs settle, wheels still
    for (const [name, c] of Object.entries(views)) {
      r.setSize(c.w, c.h);
      const cam = new THREE.PerspectiveCamera(c.fov, c.w / c.h, 0.1, 100);
      cam.position.set(Math.sin(c.az) * c.dist * Math.cos(c.el), c.look[1] + Math.sin(c.el) * c.dist, Math.cos(c.az) * c.dist * Math.cos(c.el));
      cam.lookAt(c.look[0], c.look[1], c.look[2]);
      r.render(scene, cam);
      out[`${name}-${skin.id}`] = r.domElement.toDataURL('image/png');
    }
  }
  return out;
};
