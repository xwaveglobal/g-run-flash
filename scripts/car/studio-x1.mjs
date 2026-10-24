// Step 06 studio renders of the XWAVE X1 (neutral light, reference camera angles, masks, wireframe,
// normals, UV checker). Uses scripts/car/x1-studio.ts in headless Chromium (software WebGL is fine).
//
//   node scripts/car/studio-x1.mjs <outDir> <jobs.json>
//
// jobs.json: [{ "src": "builder" | "<path/to/file.glb>", "name": "rear0_after", "view": "rear0",
//               "mode": "shade", "w": 1000, "h": 700, ...render opts, "pose": { "steer": 0.3 },
//               "load": { "detail": "master", "flake": false } }, ...]
// Writes <outDir>/<name>.png and <outDir>/studio.json (projected bounds per shot + model stats).
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const [outDir, jobsFile] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
const js = (
  await build({
    entryPoints: [join(root, 'scripts/car/x1-studio.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    write: false,
    logLevel: 'warning',
  })
).outputFiles[0].text;
const srv = createServer((req, res) => {
  if (req.url.startsWith('/s.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(js);
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><head><style>html,body{margin:0;background:#fff}</style></head><body><script src="/s.js"></script></body></html>');
  }
}).listen(0);
let chromium;
try {
  ({ chromium } = createRequire(join(root, 'package.json'))('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright'));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[page error]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text().slice(0, 300)));
await page.goto(`http://127.0.0.1:${srv.address().port}/`);
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const out = { models: {}, shots: {} };
let loaded = null;
for (const j of jobs) {
  const key = j.src + JSON.stringify(j.load ?? {});
  if (key !== loaded) {
    const b64 = j.src === 'builder' ? undefined : readFileSync(isAbsolute(j.src) ? j.src : join(root, j.src)).toString('base64');
    out.models[key] = await page.evaluate(({ s, b, o }) => window.__studio.load(s === 'builder' ? 'builder' : 'glb', b, o), { s: j.src, b: b64, o: j.load ?? {} });
    loaded = key;
  }
  await page.evaluate((p) => window.__studio.pose(p ?? {}), j.pose);
  const res = await page.evaluate((o) => window.__studio.render(o), j);
  writeFileSync(join(outDir, `${j.name}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
  out.shots[j.name] = { view: j.view, mode: j.mode ?? 'shade', bounds: res.bounds.map((v) => Math.round(v * 10) / 10) };
  console.log('shot', j.name);
}
writeFileSync(join(outDir, 'studio.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.models));
await browser.close();
srv.close();
