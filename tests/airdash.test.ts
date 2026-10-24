/**
 * Step 06.5 AIR DASH (road collectible): outer-lane-only spawning with a safe landing, exact two-lane
 * maneuver with one full sideways roll, bounded protection, controls recover. Pure gameplay (Node).
 */
declare const process: { exit(code: number): never };
import { AIR_DASH, HEIGHT, LANES, ITEM_BALANCE, type SpeedLevel } from '../src/config.ts';
import { Player } from '../src/gameplay/Player.ts';
import { World } from '../src/gameplay/World.ts';
import { Autopilot } from '../src/gameplay/Autopilot.ts';
import { AirDashGuard, airDashDest, airDashFlightTime } from '../src/gameplay/AirDash.ts';
import { PASS_N } from '../src/gameplay/types.ts';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    fails++;
    console.error('  ✗ ' + msg);
  } else console.log('  ✓ ' + msg);
};
const dt = 1 / 120;

// ---------------------------------------------------------------- 1. the maneuver (Player)
const dash = (from: 0 | 2) => {
  const p = new Player();
  p.reset(from);
  for (let i = 0; i < 30; i++) p.update(dt);
  const started = p.airDash();
  const log: { t: number; x: number; y: number; roll: number; lane: number; air: boolean }[] = [];
  let t = 0;
  while ((p.isAirDash || p.vmode === 'up') && t < 4) {
    p.update(dt);
    t += dt;
    log.push({ t, x: p.x, y: p.y, roll: p.airDashRoll, lane: p.lane, air: p.isAirDash });
  }
  for (let i = 0; i < 60; i++) p.update(dt);
  return { p, started, log, t };
};
for (const from of [0, 2] as const) {
  const { p, started, log, t } = dash(from);
  const to = 2 - from;
  const name = from === 0 ? 'left → right' : 'right → left';
  check(started, `${name}: starts from the outer lane`);
  check(p.lane === to && Math.abs(p.x - LANES[to]) < 1e-9, `${name}: lands in the opposite outer lane (lane ${p.lane}, x ${p.x.toFixed(2)})`);
  const xs = log.map((l) => l.x);
  const mono = xs.every((x, i) => i === 0 || (to > from ? x >= xs[i - 1] - 1e-9 : x <= xs[i - 1] + 1e-9));
  check(mono, `${name}: lateral motion is one continuous slide (no teleport, no back-and-forth)`);
  const maxStep = Math.max(...xs.slice(1).map((x, i) => Math.abs(x - xs[i])));
  check(maxStep < 0.25, `${name}: no jump in x between frames (max ${(maxStep * 100).toFixed(1)} cm / ${(dt * 1000).toFixed(1)} ms = ${(maxStep / dt).toFixed(1)} m/s peak, eased)`);
  check(Math.abs(Math.abs(LANES[to] - LANES[from]) - 5.2) < 1e-9 && new Set(log.map((l) => l.lane)).size <= 2, `${name}: exactly two lanes (${LANES[from]} → ${LANES[to]} m), lane state never invalid`);
  const peak = Math.max(...log.map((l) => l.y));
  check(peak > HEIGHT.HIGH - 0.1, `${name}: lifts to HIGH (${peak.toFixed(2)} m)`);
  // roll: 0 → 1 exactly once, passes 90° / 180° / 270° / 360°, ends upright
  const rolls = log.map((l) => l.roll);
  const quarters = [0.25, 0.5, 0.75, 1].map((q) => rolls.findIndex((r) => r >= q - 1e-9));
  check(quarters.every((i, k) => i >= 0 && (k === 0 || i > quarters[k - 1])), `${name}: roll passes 90° → 180° → 270° → 360° in order`);
  const airRolls = log.filter((l) => l.air).map((l) => l.roll);
  check(airRolls.every((r, i) => i === 0 || r >= airRolls[i - 1]) && airRolls[airRolls.length - 1] === 1, `${name}: exactly one roll (progress 0 → 1 once, never goes back)`);
  const landIdx = log.findIndex((l) => !l.air);
  const rollEnd = rolls.findIndex((r) => r >= 1);
  check(rollEnd >= 0 && rollEnd < landIdx, `${name}: roll complete (${log[rollEnd].t.toFixed(2)} s) before touch-down (${log[landIdx].t.toFixed(2)} s)`);
  check(p.airDashRoll === 0 && !p.isAirDash && p.vmode === 'none', `${name}: upright and back to normal driving after landing (no residual roll)`);
  check(t <= airDashFlightTime() + 0.02, `${name}: bounded air time ${t.toFixed(2)} s (≤ ${airDashFlightTime().toFixed(2)} s without extension)`);
  // take-off / landing as smooth as the game's normal jump (same eased curves)
  const dy = Math.max(...log.slice(1).map((l, i) => Math.abs(l.y - log[i].y)));
  const j = new Player();
  j.reset(1);
  j.input('up');
  let jy = j.y, jmax = 0;
  for (let i = 0; i < 240; i++) {
    j.update(dt);
    jmax = Math.max(jmax, Math.abs(j.y - jy));
    jy = j.y;
  }
  check(dy <= jmax + 1e-9, `${name}: take-off / landing as smooth as a normal jump (max ${(dy * 100).toFixed(1)} cm per frame vs jump ${(jmax * 100).toFixed(1)} cm)`);
}
{
  const p = new Player();
  p.reset(1);
  check(!p.airDash() && !p.isAirDash, 'never from the centre lane');
  check(airDashDest(1) === null && airDashDest(0) === 2 && airDashDest(2) === 0, 'destination = the opposite outer lane only');
}
{
  // controls: swipes during the dash are absorbed — never replayed after landing; control returns at once
  const p = new Player();
  p.reset(0);
  p.update(dt);
  p.airDash();
  let absorbed = 0;
  p.events.dashAbsorbed = () => absorbed++;
  for (let i = 0; i < 30; i++) p.update(dt);
  p.input('left');
  p.input('right');
  p.input('up');
  while (p.isAirDash) p.update(dt);
  for (let i = 0; i < 90; i++) p.update(dt);
  check(absorbed === 3 && p.lane === 2 && p.vmode === 'none', `inputs during the dash absorbed (${absorbed}), no delayed lane change after landing (lane ${p.lane})`);
  p.input('left');
  for (let i = 0; i < 60; i++) p.update(dt);
  check(p.lane === 1, 'direct control right after landing (a swipe moves one lane)');
}
{
  // bounded hover extension
  const p = new Player();
  p.reset(0);
  p.update(dt);
  p.airDash();
  let added = 0;
  let t = 0;
  while (p.isAirDash && t < 5) {
    if (p.vphase === 'hold') added += p.extendAirDash(dt);
    p.update(dt);
    t += dt;
  }
  check(Math.abs(added - AIR_DASH.maxExtend) < 1e-6 && t < airDashFlightTime() + AIR_DASH.maxExtend + 0.05, `hover extension is bounded: +${added.toFixed(2)} s max, lands after ${t.toFixed(2)} s (never infinite)`);
}

// ---------------------------------------------------------------- 2. spawning + safe landings in real runs
const levels: SpeedLevel[] = ['easy', 'normal', 'hard'];
let dashes = 0, centre = 0, raised = 0, badLanding = 0, crashesAfter = 0, km = 0, extendedMax = 0, protectedAfter = 0;
for (const level of levels) {
  for (let seed = 201; seed <= 212; seed++) {
    const w = new World(seed);
    w.reset(seed, null, level);
    // spawner check over the generated rows: every dash pickup lane / height / landing rows
    w.spawner.generateUntil(9000);
    for (const pk of w.spawner.pickups) {
      if (pk.kind !== 'dash') continue;
      dashes++;
      if (pk.lane === 1) centre++;
      if (pk.y !== HEIGHT.NORMAL) raised++;
      const dest = airDashDest(pk.lane)!;
      const v = w.spawner.speed(pk.dist);
      const land = pk.dist + v * airDashFlightTime();
      for (const r of w.spawner.rows) if (r.dist >= land - AIR_DASH.clearBehind && r.dist <= land + v * (AIR_DASH.maxExtend + AIR_DASH.clearAhead) && !(r.masks[dest] & PASS_N)) badLanding++;
    }
    // play it: the bot drives, every dash pickup fires the maneuver like the game does
    const w2 = new World(seed);
    w2.reset(seed, null, level);
    const bot = new Autopilot();
    const guard = new AirDashGuard();
    let afterLand = -1;
    while (w2.dist < 6000) {
      const p = w2.player;
      const safe = guard.update(p, w2.obstacles, w2.speed, 1 / 60);
      if (!p.isAirDash) bot.update(w2, 1 / 60, (a) => p.input(a));
      const opt = { invulnerable: safe, smash: false, magnet: false, magnetRadius: 6, speedMul: 1 };
      const was = p.isAirDash;
      let hit = false;
      for (const e of w2.step(1 / 60, opt)) {
        if (e.type === 'pickup' && e.p.spec.kind === 'dash') p.airDash();
        if (e.type === 'hit') hit = true;
      }
      if (was && !p.isAirDash) afterLand = 0;
      if (afterLand >= 0) {
        afterLand += 1 / 60;
        if (safe && afterLand > AIR_DASH.grace + 1 / 60 + 1e-6) protectedAfter++; // ≤ 1 frame granularity
        if (hit && afterLand < 2.5) {
          crashesAfter++;
          console.error(`    ${level} seed ${seed}: crash ${afterLand.toFixed(2)} s after an Air Dash landing @${w2.dist.toFixed(0)} m`);
        }
        if (afterLand > 2.5) afterLand = -1;
      }
      extendedMax = Math.max(extendedMax, guard.extended);
      if (hit) break;
    }
    km += w2.dist / 1000;
  }
}
check(dashes > 20, `Air Dash spawns on Endless (${dashes} in ${levels.length * 12} runs × 9 km generated)`);
check(centre === 0, `never in the centre lane (${centre})`);
check(raised === 0, `always at road height, never on an obstacle trick spot (${raised})`);
check(badLanding === 0, `every landing window keeps the destination lane drivable (${badLanding} violations)`);
check(crashesAfter === 0, `bot runs (${km.toFixed(0)} km): no crash within 2.5 s after any Air Dash landing (${crashesAfter})`);
check(protectedAfter === 0, `protection ends ${AIR_DASH.grace} s after touch-down — no lasting invulnerability (${protectedAfter} frames)`);
check(extendedMax <= AIR_DASH.maxExtend + 1e-9, `runtime hover extension used ≤ ${AIR_DASH.maxExtend} s (max seen ${extendedMax.toFixed(2)} s)`);
check((ITEM_BALANCE.weights.dash ?? 0) < (ITEM_BALANCE.weights.turbo ?? 0), `Air Dash weight ${ITEM_BALANCE.weights.dash} < Turbo ${ITEM_BALANCE.weights.turbo}`);

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
if (fails) process.exit(1);
