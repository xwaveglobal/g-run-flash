// Renders Step 04 environment shots with the real game code (scripts/env/env-preview.ts).
//
//   node scripts/env/preview-env.mjs <outDir> "<query>=<name>" ...
//   e.g. node scripts/env/preview-env.mjs docs/3d-upgrade/step04 "q=medium=gameplay" "q=low&view=home=home_low"
//   "test=1=env_selftest" writes <outDir>/env_selftest.json (recycling / leak / preset checks)
//
// 360 × 640 CSS px at device pixel ratio 2 (a phone), so each preset's pixel-ratio cap applies.
// Needs esbuild and Playwright + Chromium; software WebGL (SwiftShader) is fine.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const [outDir, ...jobs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const js = (
  await build({
    entryPoints: [join(root, 'scripts/env/env-preview.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    write: false,
    loader: { '.webp': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.glb': 'dataurl', '.css': 'empty' },
    logLevel: 'warning',
  })
).outputFiles[0].text;
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body><script type="module" src="/p.js"></script></body></html>';
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
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: +(qs.get('dpr') ?? 2) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text().slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/?${query}`);
  await page.waitForFunction(() => window.__go, null, { timeout: 60000 });
  if (qs.get('test')) {
    const r = await page.evaluate(() => window.__test());
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(r, null, 1));
    console.log(join(outDir, `${name}.json`), r.passed, 'passed', r.failed, 'failed');
  } else {
    const st = await page.evaluate(() => window.__go());
    const file = join(outDir, `${name}.png`);
    await page.screenshot({ path: file, timeout: 180000 });
    console.log(file, JSON.stringify(st));
  }
  await ctx.close();
}
await browser.close();
srv.close();
