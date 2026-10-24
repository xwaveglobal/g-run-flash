// Step 05 no-DOM smoke test: the v4 3D stack inside a Web Worker (no window / document), through a
// shim shaped like the v3 native adapter. NOT a TikTok device test — it proves the render code has no
// hidden DOM / browser-only dependency beyond what the native adapter provides.
//
//   node scripts/native/no-dom-smoke.mjs [out.json]
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const js = (
  await build({
    entryPoints: [join(root, 'scripts/native/no-dom-entry.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2018',
    write: false,
    loader: { '.webp': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.glb': 'dataurl', '.css': 'empty' },
    logLevel: 'warning',
  })
).outputFiles[0].text;
const html = `<!doctype html><html><body><script>
  const w = new Worker('/w.js');
  w.onmessage = (e) => { window.__result = e.data; };
  w.onerror = (e) => { window.__result = { fatal: String(e.message) }; };
</script></body></html>`;
const srv = createServer((req, res) => {
  if (req.url.startsWith('/w.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(js);
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
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
page.on('worker', (w) => w.on('console', (m) => console.log('[worker]', m.text().slice(0, 300))));
page.on('console', (m) => console.log('[page]', m.text().slice(0, 300)));
await page.goto(`http://127.0.0.1:${srv.address().port}/`);
await page.waitForFunction(() => window.__result, null, { timeout: 300000 });
const r = await page.evaluate(() => window.__result);
await browser.close();
srv.close();
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(r, null, 1));
for (const s of r.steps ?? []) console.log(s.ok ? '  ✓' : '  ✗', s.name, s.info ? '— ' + s.info : '');
if (r.errors?.length) console.log('errors:', r.errors);
if (r.fatal) console.log('fatal:', r.fatal);
const failed = r.fatal || (r.steps ?? []).some((s) => !s.ok);
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
