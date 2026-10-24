// v4.6 training check in the real build: free control, auto start lanes, every lesson passed without the car
// going through an obstacle (hitbox vs boxes when each row passes the car), Skip always visible, specials re-granted.
//   node scripts/qa/training.mjs <dist> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openGame } from './h5.mjs';
const [dist, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const g = await openGame(dist, { w: 390, h: 844, dpr: 1 });
const { page } = g;
await page.evaluate(() => { const G = window.__xwave; G.manual = true; G.startTutorial(); for (let i = 0; i < 400 && G.state !== 'run'; i++) G.advance(1 / 60); });
const log = [];
let shots = 0;
for (let guard = 0; guard < 80; guard++) {
  const r = await page.evaluate(() => {
    const G = window.__xwave, w = G.world, p = w.player;
    const ev = [];
    // a free swipe before the first lesson (free control must work)
    for (let i = 0; i < 1200; i++) {
      if (!window.__freeTried && w.dist > 20 && !G.tutPrompting) { window.__freeTried = true; const l0 = p.lane; G.onAction('right'); for (let k = 0; k < 30; k++) G.advance(1 / 60); ev.push({ free: { from: l0, to: p.lane } }); }
      if (G.tutPrompting) return { prompt: true, step: G.tutStep, need: G.tut.steps[G.tutStep].need, title: G.tut.steps[G.tutStep].title, lane: p.lane, y: +p.y.toFixed(2), dist: +w.dist.toFixed(1), ev, skip: !!document.querySelector('[data-k="trskip"]') && !document.querySelector('[data-k="trskip"]').hidden };
      if (G.state !== 'run') return { done: true, state: G.state, ev };
      G.advance(1 / 60);
      // every obstacle passing the car: does the hitbox overlap one of its boxes? (training is invulnerable, so check by hand)
      const hb = p.hitbox({});
      for (const o of w.obstacles) {
        if (o.__chk) continue;
        if (o.z > -0.2 && o.z < 1.5) {
          o.__chk = true;
          const hit = o.boxes.some((b) => b.maxX > hb.minX && b.minX < hb.maxX && b.maxY > hb.minY && b.minY < hb.maxY && b.maxZ > hb.minZ && b.minZ < hb.maxZ);
          ev.push({ type: o.spec.type, lane: o.spec.lane, at: +o.row.dist.toFixed(0), carLane: p.lane, y: +p.y.toFixed(2), hit });
        }
      }
    }
    return { timeout: true, ev };
  });
  log.push(r);
  if (r.prompt) {
    if (shots < 8) { await page.screenshot({ path: join(out, `prompt_${r.step}_${r.need}.png`), timeout: 240000 }); shots++; }
    await page.evaluate((need) => { const G = window.__xwave; if (need === 'rocket') G.activateSpecial('MANUAL', 'rocket'); else if (need === 'sos') G.activateSpecial('MANUAL', 'sos'); else G.onAction(need); }, r.need);
  }
  if (r.done || r.timeout) break;
}
writeFileSync(join(out, 'training.json'), JSON.stringify(log, null, 1));
const hits = log.flatMap((l) => l.ev).filter((e) => e.hit);
const prompts = log.filter((l) => l.prompt);
console.log('prompts', prompts.map((p) => `${p.step}:${p.need}@lane${p.lane}${p.skip ? '' : '(no skip!)'}`).join(' '));
console.log('free control', JSON.stringify(log.flatMap((l) => l.ev).find((e) => e.free)));
console.log('obstacle passes', log.flatMap((l) => l.ev).filter((e) => e.type).length, 'through an obstacle:', hits.length, JSON.stringify(hits));
console.log('end', JSON.stringify(log.at(-1)));
await g.close();
