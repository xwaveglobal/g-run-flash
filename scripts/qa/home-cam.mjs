// Home-screen camera check in the real build: shots across the slow orbit (phase 0 … 1 of a full swing).
//   node scripts/qa/home-cam.mjs <dist> <outDir> [query]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openGame } from './h5.mjs';
const [dist, out, query = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const g = await openGame(dist, { w: 390, h: 844, dpr: 1, query });
const { page } = g;
await page.evaluate(() => { window.__xwave.manual = true; });
const H = await page.evaluate(() => ({ ...window.__xwave.rig.constructor.name && {}, speed: 0.22 }));
void H;
// one full yaw swing = 2π / (H.speed) seconds of orbit time; shoot 4 phases + the first frame
const period = await page.evaluate(() => (2 * Math.PI) / 0.22);
for (const [k, t] of [[0, 0], [1, period * 0.25], [2, period * 0.5], [3, period * 0.75]]) {
  await page.evaluate((t) => window.__xwave.advance(t), t - (k ? period * 0.25 * (k - 1) : 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `home_${k}.png`), timeout: 240000 });
}
await g.close();
console.log('ok');
