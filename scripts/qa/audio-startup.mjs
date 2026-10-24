// Step 06.5 audio regression: fresh session, never open Settings, Play → race → pickup → crash → restart.
//   node scripts/qa/audio-startup.mjs <dist> [out.json]
// Records the AudioContext state and every SFX request (with whether it could actually sound) via a probe
// around Audio.play; plus collision-event → SFX-trigger latency (same frame = 0 ms on the main thread).
import { writeFileSync } from 'node:fs';
import { openGame } from './h5.mjs';

const [dist, outFile] = process.argv.slice(2);
const g = await openGame(dist);
const { page } = g;
await page.evaluate(() => {
  const a = window.__xwave.audio;
  window.__sfx = [];
  const orig = a.play.bind(a);
  a.play = (name, opt) => {
    window.__sfx.push({ name, t: performance.now(), state: a.ctx?.state ?? 'none', sfxOn: a.sfxOn, audible: !!a.ctx && a.ctx.state === 'running' && a.sfxOn });
    return orig(name, opt);
  };
});
const st = async (label) => {
  const s = await page.evaluate(() => ({ state: window.__xwave.state, ctx: window.__xwave.audio.ctx?.state ?? 'none', music: window.__xwave.audio.playing }));
  console.log(label.padEnd(26), JSON.stringify(s));
  return s;
};
const res = { steps: {} };
res.steps.load = await st('after load (no gesture)');
await g.startEndless();
res.steps.raceStarted = await st('race started (taps only)');
await page.waitForFunction(() => window.__xwave.state === 'run', null, { timeout: 60000 });
await page.waitForTimeout(1500);
// pickup: drive into the next pickup by forcing one onto the player's lane is game logic; just wait for coins
const before = await page.evaluate(() => window.__sfx.length);
await page.waitForTimeout(3000);
res.sfxDuringRace = await page.evaluate((b) => window.__sfx.slice(b).map((s) => s.name + (s.audible ? '' : '(silent:' + s.state + ')')), before);
console.log('sfx during race', res.sfxDuringRace.join(' '));
// crash: next obstacle hits (autopilot off, no input); measure collision → sfx
const crash = await page.evaluate(async () => {
  const g = window.__xwave;
  const t0 = performance.now();
  const n0 = window.__sfx.length;
  for (let i = 0; i < 600 && !window.__sfx.slice(n0).some((s) => s.name === 'crash' || s.name === 'explode' || s.name === 'shieldBreak'); i++) await new Promise((r) => requestAnimationFrame(r));
  const hit = window.__sfx.slice(n0).find((s) => s.name === 'crash' || s.name === 'explode' || s.name === 'shieldBreak');
  return { hit, state: g.state, waitedMs: Math.round(performance.now() - t0), crashEvent: g.__lastCrashT ?? null };
});
res.crash = crash;
console.log('crash', JSON.stringify(crash));
res.errors = g.errors;
if (outFile) writeFileSync(outFile, JSON.stringify(res, null, 1));
await g.close();
