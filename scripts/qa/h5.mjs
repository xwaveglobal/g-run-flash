// Step 06.5 QA helper: serve a built H5 game (dist-esbuild) and open it in Chromium (SwiftShader, phone viewport)
// with the REAL browser autoplay policy (audio needs a user gesture). Taps are real CDP touch / mouse input
// (trusted events = user activation), never synthetic DOM clicks.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/json', '.glb': 'model/gltf-binary' };

export async function openGame(dist, { w = 360, h = 640, dpr = 2, query = '', storage = null } = {}) {
  const srv = createServer((req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const buf = readFileSync(join(dist, p));
      res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end();
    }
  }).listen(0);
  let chromium;
  try {
    ({ chromium } = createRequire(join(here, '../../package.json'))('playwright'));
  } catch {
    ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright'));
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
  if (storage) await ctx.addInitScript((s) => { if (!sessionStorage.__qaInit) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.__qaInit = 1; } }, storage);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/?noauto${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__xwave?.state === 'menu', null, { timeout: 240000 });
  const close = async () => { await browser.close(); srv.close(); };
  /** real tap (touch) on the first visible element matching the selector / text */
  const tap = async (selector, text) => {
    for (let i = 0; i < 120; i++) {
      const box = await page.evaluate(([sel, txt]) => {
        const re = txt ? new RegExp(txt) : null;
        const el = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent && (!re || re.test(e.textContent))).at(-1);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, [selector, text]);
      if (box) {
        await page.touchscreen.tap(box.x, box.y);
        return true;
      }
      await page.waitForTimeout(500);
    }
    throw new Error(`tap: nothing visible for ${selector} ${text ?? ''}`);
  };
  /** Play → (skip training) → Endless → GO, all by real taps */
  const startEndless = async () => {
    await tap('button', '^\\s*Play\\s*$');
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.offsetParent && /Skip/i.test(b.textContent)))) await tap('button', 'Skip');
    await page.waitForTimeout(1200);
    const endless = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => e.offsetParent && e.children.length < 4 && /^\s*Endless/.test(e.textContent));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!endless) throw new Error('no Endless entry');
    await page.touchscreen.tap(endless.x, endless.y);
    await page.waitForTimeout(800);
    await tap('button', '\\bGO\\b');
    await page.waitForFunction(() => window.__xwave.state === 'run' || window.__xwave.state === 'countdown', null, { timeout: 60000 });
  };
  return { page, browser, errors, close, tap, startEndless };
}
