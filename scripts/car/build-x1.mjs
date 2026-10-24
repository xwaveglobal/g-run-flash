// Builds the XWAVE X1 3D model: scripts/car/x1-builder.ts → src/assets/models/xwave-x1.glb
//
//   node scripts/car/build-x1.mjs
//
// The builder runs in headless Chromium (it needs <canvas> for the badge / carbon / tread textures
// and GLTFExporter's browser path). Needs esbuild (comes with Vite) and Playwright with Chromium
// (`npm i -D playwright && npx playwright install chromium`, or set PLAYWRIGHT_MODULE to an
// existing install). Not part of the game build — run it only when the model changes.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
// options: --cut=0.06 (length cut, default = LENGTH_CUT in the builder), --out=path,
//          --detail=mobile (default: the game model) | master (high-detail master, same silhouette →
//          assets-src/x1/xwave-x1-master.glb unless --out is given)
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const cutArg = arg('cut');
const detail = arg('detail') ?? 'mobile';
const out = arg('out') ?? join(root, detail === 'master' ? 'assets-src/x1/xwave-x1-master.glb' : 'src/assets/models/xwave-x1.glb');

const res = await build({
  entryPoints: [join(root, 'scripts/car/x1-builder.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  logLevel: 'warning',
});
const js = res.outputFiles[0].text;

const req = createRequire(process.env.PLAYWRIGHT_MODULE ?? join(root, 'package.json'));
let chromium;
try {
  ({ chromium } = req('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright'));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: js });
const info = await page.evaluate(async ([cut, detail]) => {
  const x = window.__x1;
  const opts = cut === undefined ? { detail } : { cut: +cut, detail };
  const buf = new Uint8Array(await x.exportX1(opts));
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  // stats from a fresh build
  const r = x.buildX1(opts);
  let tris = 0;
  let meshes = 0;
  r.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  const box = new x.THREE.Box3().setFromObject(r);
  return { b64: btoa(s), tris, meshes, min: box.min.toArray(), max: box.max.toArray() };
}, [cutArg, detail]);
await browser.close();
mkdirSync(dirname(out), { recursive: true });
const bytes = Buffer.from(info.b64, 'base64');
writeFileSync(out, bytes);
const f = (a) => a.map((v) => v.toFixed(3)).join(', ');
console.log(`${out.split('/').pop()}: ${(bytes.length / 1024).toFixed(0)} KB, ${info.meshes} meshes, ${info.tris} triangles, bounds [${f(info.min)}] → [${f(info.max)}]`);
