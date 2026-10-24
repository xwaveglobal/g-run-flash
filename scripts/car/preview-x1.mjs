// Renders validation shots of the in-game 3D car with the real game code (scripts/car/x1-preview.ts).
//
//   node scripts/car/preview-x1.mjs <outDir> "<query>=<name>" ...
//   e.g. node scripts/car/preview-x1.mjs docs/3d-upgrade/shots "view=rear0=rear_0" "view=chase&pose=lane=lane"
//
// Needs esbuild and Playwright + Chromium (see build-x1.mjs). Software WebGL (SwiftShader) is fine.
// X1_GLB=<path> renders another X1 model (e.g. assets-src/x1/rollback/…) instead of src/assets/models/xwave-x1.glb.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const [outDir, ...jobs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const js = (
  await build({
    entryPoints: [join(root, 'scripts/car/x1-preview.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    write: false,
    loader: { '.webp': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.glb': 'dataurl', '.css': 'empty' },
    logLevel: 'warning',
    // X1_GLB=path/to/other.glb: render another car model (e.g. the rollback) through the same game code
    plugins: process.env.X1_GLB
      ? [{ name: 'x1-glb', setup: (b) => b.onResolve({ filter: /xwave-x1\.glb$/ }, () => ({ path: isAbsolute(process.env.X1_GLB) ? process.env.X1_GLB : join(root, process.env.X1_GLB) })) }]
      : [],
  })
).outputFiles[0].text;
const html = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}canvas{display:block}</style></head><body><script type="module" src="/p.js"></script></body></html>';
const srv = createServer((req, res) => {
  if (req.url.startsWith('/p.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(js);
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  }
}).listen(0);
const port = srv.address().port;
let chromium;
try {
  ({ chromium } = createRequire(join(root, 'package.json'))('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright'));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const job of jobs) {
  const i = job.lastIndexOf('=');
  const query = job.slice(0, i);
  const name = job.slice(i + 1);
  const qs = new URLSearchParams(query);
  const page = await browser.newPage({ viewport: { width: +(qs.get('w') ?? 720), height: +(qs.get('h') ?? 1280) } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text().slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/?${query}`);
  await page.waitForFunction(() => window.__go, null, { timeout: 60000 });
  if (qs.get('measure') || qs.get('selftest')) {
    const m = await page.evaluate(() => (new URLSearchParams(location.search).get('selftest') ? window.__selftest() : window.__measure()));
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(m, null, 1));
    console.log(join(outDir, `${name}.json`));
    await page.close();
    continue;
  }
  if (qs.get('seq')) {
    // frame sequence → <outDir>/<name>/0000.png … + frames.json
    const frames = await page.evaluate(() => window.__seq());
    const dir = join(outDir, name);
    mkdirSync(dir, { recursive: true });
    frames.forEach((f, k) => writeFileSync(join(dir, `${String(k).padStart(4, '0')}.png`), Buffer.from(f.url.split(',')[1], 'base64')));
    writeFileSync(join(dir, 'frames.json'), JSON.stringify(frames.map(({ url, ...rest }) => rest), null, 1));
    console.log(dir, frames.length, 'frames');
    await page.close();
    continue;
  }
  const st = await page.evaluate(() => window.__go());
  const file = join(outDir, `${name}.png`);
  await page.locator('canvas').screenshot({ path: file, timeout: 120000 });
  console.log(file, JSON.stringify(st));
  await page.close();
}
await browser.close();
srv.close();
