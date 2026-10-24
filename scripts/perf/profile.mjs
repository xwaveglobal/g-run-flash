// Step 05 profiling of the real game build (needs `node scripts/build-esbuild.mjs` first).
//
//   node scripts/perf/profile.mjs [outFile.json] [--seconds=6] [--root=dist-esbuild]
//
// Opens the build with ?perf=1&autopilot&noauto in headless Chromium (360 × 640 @2, a phone-sized
// viewport) and, for LOW / MEDIUM / HIGH, drives the game in fixed 1/60 s steps (Game.manual +
// advance) and times every frame: JS update and render (render + gl.finish, so the software GPU work is
// included). Scenarios: normal, nitro, shield, nitro + shield, jump, heavy (the frames with the most
// obstacles on screen during the extended run) and extended (60 s of play). Also: load time to Home,
// draw calls / triangles (all passes), geometry / texture / program counts, JS heap trend, the
// slowest frame right after an effect is switched on (activation spike), and preset-switch leaks.
//
// IMPORTANT: headless Chromium here renders with SwiftShader (software WebGL on the CPU). Its FPS
// and render times are NOT phone numbers — they are a desktop/software baseline for comparing presets
// and builds. For phone numbers open the game on the device with ?perf=1 (see docs/3d-upgrade/step05).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const frames = +arg('frames', 60);
const root = join(here, '../..', arg('root', 'dist-esbuild'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/json' };
const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const buf = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const port = srv.address().port;
let chromium;
try {
  ({ chromium } = createRequire(join(here, '../../package.json'))('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright'));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const results = { note: 'headless Chromium + SwiftShader (software WebGL on a desktop CPU) — not phone FPS', viewport: '360x640 @2', presets: {} };


const sample = (page, n, every = 1) =>
  page.evaluate(
    ({ n, every }) => {
      const g = window.__game;
      const r = g.renderer.renderer;
      const gl = r.getContext();
      const out = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        g.advance(1 / 60);
        const t1 = performance.now();
        if (i % every) continue;
        g.renderer.render();
        gl.finish();
        const t2 = performance.now();
        out.push({ js: t1 - t0, render: t2 - t1, calls: r.info.render.calls, tris: r.info.render.triangles, obs: g.world.obstacles.length, state: g.state });
      }
      return out;
    },
    { n, every },
  );
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))] : 0; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stats = (fr) => {
  const tot = fr.map((f) => f.js + f.render);
  return {
    frames: fr.length,
    cpuFrameMs: { avg: r1(avg(tot)), p50: r1(pct(tot, 0.5)), p95: r1(pct(tot, 0.95)), max: r1(Math.max(...tot)) },
    js: { avg: r1(avg(fr.map((f) => f.js))), p95: r1(pct(fr.map((f) => f.js), 0.95)) },
    render: { avg: r1(avg(fr.map((f) => f.render))), p95: r1(pct(fr.map((f) => f.render), 0.95)) },
    calls: { avg: Math.round(avg(fr.map((f) => f.calls))), max: Math.max(...fr.map((f) => f.calls)) },
    trisK: { avg: r1(avg(fr.map((f) => f.tris)) / 1000), max: r1(Math.max(...fr.map((f) => f.tris)) / 1000) },
    obstacles: { avg: r1(avg(fr.map((f) => f.obs))), max: Math.max(...fr.map((f) => f.obs)) },
    spikeFirst10Ms: r1(Math.max(...tot.slice(0, 10))),
    endedIn: fr.at(-1)?.state,
  };
};
const counters = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const i = g.renderer.renderer.info;
    const m = performance.memory;
    return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0, heapMB: m ? Math.round(m.usedJSHeapSize / 1048576) : null, dpr: g.renderer.pixelRatio, canvas: [g.renderer.renderer.domElement.width, g.renderer.renderer.domElement.height] };
  });

for (const q of ['low', 'medium', 'high']) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?perf=1&autopilot&noauto`);
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
  const loadMs = Date.now() - t0;
  await page.evaluate((qq) => window.__game.applyQuality(qq), q);
  await page.waitForTimeout(500);
  await page.evaluate(() => (window.__game.manual = true));
  const home = stats(await sample(page, 20));
  await page.evaluate(() => (window.__game.manual = false));
  const clickWhen = async (fn) => {
    for (let i = 0; i < 240; i++) {
      if (await page.evaluate(fn)) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  await clickWhen(() => { const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent && /^\s*Play\s*$/.test(e.textContent)); b?.click(); return !!b; });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('button.trskip')?.click());
  await clickWhen(() => { const el = [...document.querySelectorAll('*')].find((e) => e.offsetParent && e.children.length < 4 && /^\s*Endless/.test(e.textContent)); el?.click(); return !!el; });
  await clickWhen(() => { const b = [...document.querySelectorAll('button')].filter((e) => e.offsetParent && /\bGO\b/.test(e.textContent)).at(-1); b?.click(); return !!b; });
  await clickWhen(() => window.__game.state === 'run');
  await page.evaluate(() => { const g = window.__game; g.manual = true; g.advance(3); }); // past the start (autopilot drives; endedIn shows if a crash happened)
  const c0 = await counters(page);
  const scen = {};
  const run = async (name, setup, teardown, n = frames) => {
    if (setup) await page.evaluate(setup);
    scen[name] = stats(await sample(page, n));
    if (teardown) await page.evaluate(teardown);
  };
  await run('normal');
  await run('nitro', () => { window.__game.run.turboT = 30; }, () => { window.__game.run.turboT = 0; });
  await run('shield', () => { const r = window.__game.run; r.shield = true; r.shieldHits = 9; r.shieldT = 0; }, () => { window.__game.run.shield = false; });
  await run('nitro+shield', () => { const r = window.__game.run; r.turboT = 30; r.shield = true; r.shieldHits = 9; r.shieldT = 0; }, () => { const r = window.__game.run; r.turboT = 0; r.shield = false; });
  await run('jump', () => { window.__game.world.player.input('up'); }, null, 72);
  // extended: 60 s of play, every 30th frame rendered (--every); heavy = the 15 % of those frames with the most obstacles
  const ext = await sample(page, 3600, +arg('every', 30));
  scen.extended = { ...stats(ext), playedSeconds: 60 };
  const byObs = [...ext].sort((a, b) => b.obs - a.obs).slice(0, Math.max(5, Math.round(ext.length * 0.15)));
  scen.heavy = stats(byObs);
  const c1 = await counters(page);
  // preset switching: cycle through all presets twice, then compare the counters
  const sw = await page.evaluate(() => {
    const g = window.__game;
    const i = g.renderer.renderer.info;
    const snap = () => [i.memory.geometries, i.memory.textures, i.programs?.length ?? 0];
    const out = [];
    for (let k = 0; k < 2; k++)
      for (const qq of ['low', 'medium', 'high']) {
        g.applyQuality(qq);
        g.advance(1 / 60);
        g.renderer.render();
        out.push([qq, ...snap()]);
      }
    return out;
  });
  await page.evaluate((qq) => window.__game.applyQuality(qq), q);
  results.presets[q] = { loadMs, home, start: c0, end: c1, scenarios: scen, presetSwitch: sw, pageErrors: errors };
  console.log(q, JSON.stringify({ loadMs, normal: scen.normal.cpuFrameMs, js: scen.normal.js, calls: scen.normal.calls, heavy: scen.heavy.cpuFrameMs, c0, c1, sw }));
  await ctx.close();
}
await browser.close();
srv.close();
if (out) await writeFile(out, JSON.stringify(results, null, 1));
