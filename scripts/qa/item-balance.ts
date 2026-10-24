/**
 * Step 06.5 item balance, seeded simulation (Node): road items per 10 km on Endless for each speed level,
 * BEFORE (v4.4 weights: no Air Dash, same for every level) vs AFTER (config ITEM_BALANCE).
 *   node --experimental-transform-types --no-warnings scripts/qa/item-balance.ts [out.json]
 */
declare const process: { argv: string[] };
import { writeFileSync } from 'node:fs';
import { ITEM_BALANCE, type SpeedLevel } from '../../src/config.ts';
import { World } from '../../src/gameplay/World.ts';

const KINDS = ['shield', 'turbo', 'life', 'dash', 'magnet', 'double', 'mystery'];
const AFTER = JSON.parse(JSON.stringify(ITEM_BALANCE));
const BEFORE = { weights: { magnet: 3, shield: 3, turbo: 0.7, mystery: 0.5, double: 2, dash: 0 }, level: { easy: { weights: {}, heartEvery: 1 }, normal: { weights: {}, heartEvery: 1 }, hard: { weights: {}, heartEvery: 1 } } };
const KM = 30, SEEDS = 24;
const run = (cfg: typeof AFTER, level: SpeedLevel) => {
  Object.assign(ITEM_BALANCE.weights, cfg.weights);
  for (const l of ['easy', 'normal', 'hard'] as SpeedLevel[]) {
    ITEM_BALANCE.level[l].weights = { ...cfg.level[l].weights };
    ITEM_BALANCE.level[l].heartEvery = cfg.level[l].heartEvery;
  }
  const n: Record<string, number> = Object.fromEntries(KINDS.map((k) => [k, 0]));
  let dashOuter = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const w = new World(seed);
    w.reset(seed, null, level);
    w.spawner.generateUntil(KM * 1000);
    for (const p of w.spawner.pickups) {
      if (p.dist > KM * 1000) continue;
      if (p.kind in n) n[p.kind]++;
      if (p.kind === 'dash' && p.lane !== 1) dashOuter++;
    }
  }
  const per10 = Object.fromEntries(KINDS.map((k) => [k, +((n[k] / (SEEDS * KM)) * 10).toFixed(2)]));
  return { per10km: per10, dashOuterLane: n.dash ? `${dashOuter}/${n.dash}` : '—' };
};
const out: Record<string, unknown> = { seeds: SEEDS, kmPerSeed: KM, note: 'items per 10 km of Endless, seeded spawner (same seeds before / after)' };
for (const level of ['easy', 'normal', 'hard'] as SpeedLevel[]) {
  const b = run(BEFORE as typeof AFTER, level);
  const a = run(AFTER, level);
  out[level] = { before: b, after: a };
  console.log(level.padEnd(7), 'before', JSON.stringify(b.per10km));
  console.log(''.padEnd(7), 'after ', JSON.stringify(a.per10km), 'dash outer', a.dashOuterLane);
}
run(AFTER, 'normal');
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
