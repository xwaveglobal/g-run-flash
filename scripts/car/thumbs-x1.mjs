// node scripts/car/thumbs-x1.mjs <outDir>  → <outDir>/<view>-<car>.png (transparent), see thumbs-x1.ts
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const js = (await build({ entryPoints: [join(root, 'scripts/car/thumbs-x1.ts')], bundle: true, format: 'esm', target: 'es2020', write: false, loader: { '.webp': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.glb': 'dataurl', '.css': 'empty' }, logLevel: 'warning' })).outputFiles[0].text;
const srv = createServer((req, res) => {
  if (req.url.startsWith('/p.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); }
  else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html><body style="margin:0"><script type="module" src="/p.js"></script></body></html>'); }
}).listen(0);
let chromium;
try { ({ chromium } = createRequire(join(root, 'package.json'))('playwright')); } catch { ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright')); }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/`);
await page.waitForFunction(() => window.__go, null, { timeout: 60000 });
const shots = await page.evaluate(() => window.__go());
for (const [k, url] of Object.entries(shots)) writeFileSync(join(out, `${k}.png`), Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(shots).length, 'renders →', out);
await browser.close();
srv.close();
