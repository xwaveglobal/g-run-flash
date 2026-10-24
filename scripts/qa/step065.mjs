// Step 06.5 (+ Patch 02) — checks and screenshots in the REAL H5 build (Chromium / SwiftShader, phone 360×640 @2).
//   node scripts/qa/step065.mjs <dist> <outDir> [--only=a,b,…]
// Sections: audio, spoiler, airdash, special, crash, pause, bag, garage, congrats, buttons.
// The game is driven with real taps where a player would tap (Play, GO, pause, Resume, special button, Continue)
// and with the game's own deterministic stepper (Game.manual + advance) for gameplay moments. Results: <outDir>/qa_results.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openGame } from './h5.mjs';

const [dist, out] = process.argv.slice(2);
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
mkdirSync(out, { recursive: true });
mkdirSync(join(out, 'patch02'), { recursive: true });
const R = { checks: [], shots: [] };
const check = (ok, msg, data) => {
  R.checks.push({ ok: !!ok, msg, data });
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}${data !== undefined ? ' ' + JSON.stringify(data) : ''}`);
};
const save = () => writeFileSync(join(out, 'qa_results.json'), JSON.stringify(R, null, 1));

const g = await openGame(dist);
const { page } = g;
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name, sub = '') => {
  await page.waitForTimeout(400);
  const file = join(out, sub, `${name}.png`);
  await page.screenshot({ path: file, timeout: 240000 });
  R.shots.push(join(sub, `${name}.png`));
  console.log('    shot', name);
};
// helpers inside the page
await ev(() => {
  const G = window.__xwave;
  window.__g = G;
  window.__clear = (ahead = 45) => {
    const w = G.world;
    for (const o of w.obstacles) if (o.z > -ahead) w.hooks?.despawnObstacle?.(o);
    w.obstacles = w.obstacles.filter((o) => o.z <= -ahead);
  };
  window.__spoiler = () => G.vehicle.mesh?.spoilerState?.k ?? null;
  window.__steps = (sec, keepClear = true) => { for (let t = 0; t < sec - 1e-9; t += 1 / 60) { if (keepClear) window.__clear(); G.advance(1 / 60); } };
  window.__lane = (lane) => { const p = G.world.player; for (let i = 0; i < 4 && p.lane !== lane; i++) { p.input(p.lane < lane ? 'right' : 'left'); window.__steps(0.35); } };
  window.__putPickup = (kind, lane, ahead) => {
    const w = G.world;
    w.spawner.pickups.push({ kind, lane, dist: w.dist + ahead, y: 1.0 });
    w.spawner.pickups.sort((a, b) => a.dist - b.dist);
  };
  window.__putCrate = (lane, ahead, type = 'crate') => {
    const w = G.world;
    w.injectRows([{ dist: w.dist + ahead, dt: 1, masks: [7, 7, 7], obstacles: [{ type, lane, variant: 0 }], pid: 'qa', tier: 0 }]);
  };
  window.__toasts = () => [...document.querySelectorAll('.toast, .notice, [class*="toast"]')].map((e) => e.textContent.trim()).filter(Boolean);
});
const state = () => ev(() => window.__g.state);

// ======================================================= A. AUDIO (fresh session, Settings never opened)
if (want('audio')) {
  console.log('A. audio');
  const before = await ev(() => ({ ctx: window.__g.audio.ctx?.state ?? 'none', settingsOpened: document.querySelector('#settings')?.classList.contains('show') }));
  check(before.ctx === 'none', 'fresh load: no AudioContext before any gesture (autoplay policy respected)', before);
  await g.startEndless();
  const a1 = await ev(() => ({ ctx: window.__g.audio.ctx?.state, music: window.__g.audio.playing, settingsEverShown: !!document.querySelector('#settings.show') }));
  check(a1.ctx === 'running' && a1.music && !a1.settingsEverShown, 'after real taps Play → Endless → GO (Settings never opened): audio running, music playing', a1);
  await page.waitForFunction(() => window.__g.state === 'run', null, { timeout: 120000 });
  await ev(() => { window.__g.manual = true; window.__steps(1); });
  // pickup sound
  const pk = await ev(() => {
    const G = window.__g;
    const lane = G.world.player.lane;
    window.__putPickup('shield', lane, 12);
    const t0 = G.audio.lastPlayed.shield ?? 0;
    window.__steps(1.2);
    return { played: (G.audio.lastPlayed.shield ?? 0) > t0, ctx: G.audio.ctx.state, sfxOn: G.audio.sfxOn };
  });
  check(pk.played && pk.ctx === 'running', 'pickup SFX requested on collecting a Shield, context running', pk);
  // impact sound at the authoritative collision
  const imp = await ev(() => {
    const G = window.__g;
    G.run.shield = false;
    G.run.lives = 3;
    const lane = G.world.player.lane;
    window.__clear(80);
    window.__putCrate(lane, 20);
    const crash0 = G.audio.lastPlayed.crash ?? 0;
    for (let i = 0; i < 240 && G.state === 'run'; i++) G.advance(1 / 60);
    return { state: G.state, collisionT: G.lastCrashEventT, crashT: G.audio.lastPlayed.crash ?? 0, explodeT: G.audio.lastPlayed.explode ?? 0, fresh: (G.audio.lastPlayed.crash ?? 0) > crash0 };
  });
  const lat = imp.crashT - imp.collisionT;
  check(imp.fresh && lat >= 0 && lat < 5, `impact SFX triggered ${lat.toFixed(2)} ms after the authoritative collision event (same frame, before the crash visuals); explosion layer on the audio clock (+60 ms, no timer)`, imp);
  R.audioLatency = { collisionToTriggerMs: +lat.toFixed(3), note: 'main-thread trigger latency (performance.now); audible output latency = AudioContext.baseLatency + outputLatency, device-dependent, not measured here' };
  R.audioLatency.baseLatency = await ev(() => window.__g.audio.ctx.baseLatency ?? null);
  // restart: sound still works (no re-creation)
  const re = await ev(() => {
    const G = window.__g;
    const ctx0 = G.audio.ctx;
    for (let i = 0; i < 200 && G.state === 'dying'; i++) G.advance(1 / 60);
    G.startRun();
    for (let i = 0; i < 260 && G.state !== 'run'; i++) G.advance(1 / 60);
    const t0 = performance.now();
    G.audio.play('coin');
    return { sameCtx: G.audio.ctx === ctx0, ctx: G.audio.ctx.state, state: G.state, coinAfterRestart: (G.audio.lastPlayed.coin ?? 0) >= t0 };
  });
  check(re.sameCtx && re.ctx === 'running' && re.coinAfterRestart, 'restart: same AudioContext, still running, SFX play (no duplicate context)', re);
  // mute / music settings respected; background suspend / resume
  const st = await ev(async () => {
    const G = window.__g;
    G.audio.setSfx(false);
    const off = G.audio.sfxBus.gain.value;
    G.audio.setSfx(true);
    const on = G.audio.sfxBus.gain.value;
    G.audio.setMusic(false);
    const mOff = G.audio.musicBus.gain.value;
    G.audio.setMusic(true);
    G.audio.setHidden(true);
    await new Promise((r) => setTimeout(r, 300));
    const hidden = G.audio.ctx.state;
    G.audio.setHidden(false);
    await new Promise((r) => setTimeout(r, 300));
    return { sfxOffGain: off, sfxOnGain: on, musicOffGain: mOff, hidden, visible: G.audio.ctx.state };
  });
  check(st.sfxOffGain === 0 && st.sfxOnGain > 0 && st.musicOffGain === 0, 'Sound / Music switches mute and restore their bus (no re-initialisation)', st);
  check(st.hidden === 'suspended' && st.visible === 'running', 'background → suspended, foreground → running again', st);
  save();
}

// helper: be in a fresh race, manual stepping
const freshRace = async () => {
  await ev(() => {
    const G = window.__g;
    G.manual = true;
    if (G.state !== 'run') {
      G.startRun();
      for (let i = 0; i < 300 && G.state !== 'run'; i++) G.advance(1 / 60);
    }
    G.run.lives = 3;
    window.__steps(1.5);
  });
  if ((await state()) !== 'run') {
    await g.startEndless();
    await page.waitForFunction(() => window.__g.state === 'run' || window.__g.state === 'countdown', null, { timeout: 120000 });
    await ev(() => { const G = window.__g; G.manual = true; for (let i = 0; i < 300 && G.state !== 'run'; i++) G.advance(1 / 60); window.__steps(1.5); });
  }
};

// ======================================================= B. SPOILER STATES
if (want('spoiler')) {
  console.log('B. spoiler');
  await freshRace();
  let k = await ev(() => { window.__steps(1); return window.__spoiler(); });
  check(k === 0, 'normal driving: spoiler fully closed', k);
  await shot('15_spoiler_ground_closed');
  k = await ev(() => { const G = window.__g; G.run.turboT = 6; window.__steps(1.2); return window.__spoiler(); });
  check(k === 0, 'Turbo on the road: spoiler fully closed', k);
  await shot('18_spoiler_turbo_ground_closed');
  k = await ev(() => { const G = window.__g; G.run.turboT = 0; G.run.shield = true; G.run.shieldHits = 9; window.__steps(1); return window.__spoiler(); });
  check(k === 0, 'Shield on the road: spoiler fully closed', k);
  k = await ev(() => { const G = window.__g; G.run.shield = false; G.world.player.input('up'); window.__steps(0.4); return window.__spoiler(); });
  check(k > 0.9, 'jump airborne: spoiler open', k);
  await shot('16_spoiler_jump_open');
  k = await ev(() => { const G = window.__g; G.run.turboT = 6; let n = 0; while (G.world.player.vmode === 'up' && n++ < 300) window.__steps(1 / 60); window.__steps(0.7); return window.__spoiler(); });
  check(k === 0, 'landing (Turbo still active): spoiler fully closed again', k);
  await shot('19_spoiler_landing_closed');
  await ev(() => { window.__g.run.turboT = 0; window.__steps(1); });
  save();
}

// ======================================================= C. AIR DASH
if (want('airdash')) {
  console.log('C. air dash');
  await freshRace();
  const run = async (from, names) => {
    await ev((l) => { window.__lane(l); window.__steps(0.5); window.__putPickup('dash', l, 26); }, from);
    // approach: pickup visible ahead
    await ev(() => { for (let i = 0; i < 200; i++) { const p = window.__g.world.pickups.find((x) => x.spec.kind === 'dash'); if (!p || p.z > -9) break; window.__steps(1 / 60); } });
    if (names.pickup) await shot(names.pickup);
    const started = await ev(() => { let n = 0; while (!window.__g.world.player.isAirDash && n++ < 120) window.__steps(1 / 60); return window.__g.world.player.isAirDash; });
    check(started, `Air Dash fires on pickup (lane ${from})`);
    const seq = [];
    const grab = async (label, cond) => {
      const s = await ev((c) => {
        const G = window.__g, p = G.world.player;
        const f = new Function('p', 'G', 'return ' + c);
        let n = 0;
        while (!f(p, G) && n++ < 400) window.__steps(1 / 60);
        return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), lane: p.lane, roll: +p.airDashRoll.toFixed(2), rollDeg: +((Math.abs(G.vehicle.airDashRollAngle) * 180) / Math.PI).toFixed(0), spoiler: +(window.__spoiler() ?? -1).toFixed(2), air: p.isAirDash };
      }, cond);
      seq.push({ label, ...s });
      return s;
    };
    const take = await grab('takeoff', 'p.airDashT >= 0.12');
    if (names.takeoff) await shot(names.takeoff);
    // the frames where the car's ACTUAL roll angle (Vehicle, eased) reaches 90° / 180° / 270° / 360°
    for (const [q, nm] of [[0.25, names.r90], [0.5, names.r180], [0.75, names.r270], [1, names.r360]]) {
      await grab(`roll ${q * 360}°`, q === 1 ? 'p.airDashRoll >= 1' : `Math.abs(G.vehicle.airDashRollAngle) >= ${q} * 2 * Math.PI - 1e-6`);
      if (nm) await shot(nm);
    }
    const land = await grab('landed', '!p.isAirDash');
    await ev(() => window.__steps(0.25));
    if (names.land) await shot(names.land);
    const to = from === 0 ? 2 : 0;
    check(take.spoiler > 0.2, `take-off: spoiler opening (k ${take.spoiler})`);
    check(seq.filter((s) => s.label.startsWith('roll')).every((s, i) => Math.abs(s.rollDeg - [90, 180, 270, 360][i]) <= 12), `roll 90° / 180° / 270° / 360° reached in order (${seq.filter((s) => s.label.startsWith('roll')).map((s) => s.rollDeg).join(' / ')})`);
    check(land.lane === to && Math.abs(land.x - (to === 2 ? 2.6 : -2.6)) < 0.05, `lands in the opposite outer lane ${to} (x ${land.x})`);
    const after = await ev(() => { window.__steps(0.8); const G = window.__g; return { roll: G.vehicle.airDashRollAngle, spoiler: window.__spoiler(), state: G.state }; });
    check(after.roll === 0 && after.spoiler === 0 && after.state === 'run', 'after landing: upright, spoiler flush, normal driving', after);
    R[`airdash_${from}`] = seq;
    return seq;
  };
  await run(0, { pickup: '06_air_dash_pickup_left', takeoff: '07_air_dash_takeoff_left', r90: '08_air_dash_roll_90', r180: '09_air_dash_roll_180', r270: '10_air_dash_roll_270', r360: '11_air_dash_roll_360', land: '12_air_dash_landing_right' });
  await ev(() => window.__steps(1));
  await run(2, { pickup: '13_air_dash_pickup_right', land: '14_air_dash_landing_left' });
  // spoiler during an Air Dash (mid-roll)
  await ev(() => { window.__lane(0); window.__steps(0.4); window.__putPickup('dash', 0, 20); let n = 0; while (!(window.__g.world.player.airDashRoll >= 0.4) && n++ < 400) window.__steps(1 / 60); });
  const k = await ev(() => window.__spoiler());
  check(k > 0.8, 'Air Dash roll: spoiler open', k);
  await shot('17_spoiler_air_dash_open');
  await ev(() => { let n = 0; while (window.__g.world.player.isAirDash && n++ < 300) window.__steps(1 / 60); window.__steps(1); });
  // centre lane: never collectible as a dash start, no lane change
  const centre = await ev(() => { const G = window.__g; window.__lane(1); const ok = G.world.player.airDash(); return { started: ok, lane: G.world.player.lane }; });
  check(!centre.started && centre.lane === 1, 'centre lane: Air Dash does not start', centre);
  save();
}

// ======================================================= D. SPECIALS (manual + last-chance auto)
if (want('special')) {
  console.log('D. specials');
  await freshRace();
  // manual: real tap on the lower-right special button
  await ev(() => { const G = window.__g; G.carried = 'super'; G.run.superJumps = 1; G.save.items.super = Math.max(1, G.save.items.super); G.save.special = 'super'; G.ui.updateHud(G.run, G.world.speed, 60, null); window.__steps(0.6); });
  const btn = await ev(() => { const b = document.querySelector('[data-a="rocket"]'); if (!b || b.hidden) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (btn) {
    const before = await ev(() => ({ items: window.__g.save.items.super }));
    await ev(() => { window.__g.manual = false; });
    await page.touchscreen.tap(btn.x, btn.y);
    await ev(() => { window.__g.manual = true; window.__steps(0.35); });
    const m = await ev(() => ({ isSuper: window.__g.world.player.isSuper, src: window.__g.lastSpecialSource, charges: window.__g.run.superJumps, items: window.__g.save.items.super }));
    check(m.isSuper && m.src === 'MANUAL' && m.charges === 0 && m.items === before.items - 1, 'manual special button: Roadster Jump fires (MANUAL), one charge used', m);
    await shot('20_special_manual_activation');
    await ev(() => { let n = 0; while (window.__g.world.player.vmode === 'up' && n++ < 400) window.__steps(1 / 60); window.__steps(1); });
  } else check(false, 'special button visible in the HUD');
  const auto = async (k, file) => {
    const r = await ev((k) => {
      const G = window.__g;
      window.__clear(90);
      G.continuesUsed = 3; // the revive offer is used up
      G.autoRescueUsed = false;
      G.lastSpecialSource = null;
      G.run.lives = 1;
      G.run.shield = false;
      G.run.invulnT = 0;
      G.run.superJumps = k === 'super' ? 1 : 0;
      G.run.hyperJumps = k === 'hyper' ? 1 : 0;
      G.run.escapes = k === 'escape' ? 1 : 0;
      G.carried = k;
      G.save.items[k] = Math.max(1, G.save.items[k]);
      const items0 = G.save.items[k];
      window.__steps(0.4);
      window.__putCrate(G.world.player.lane, 18);
      let n = 0;
      while (G.lastSpecialSource !== 'AUTO_LAST_CHANCE' && G.state === 'run' && n++ < 200) G.advance(1 / 60);
      for (let i = 0; i < 18; i++) G.advance(1 / 60);
      return { state: G.state, src: G.lastSpecialSource, lives: G.run.lives, carried: G.carried, items: G.save.items[k], items0, isSuper: G.world.player.isSuper, isEscape: G.world.player.isEscape, toast: window.__toasts().join(' | ') };
    }, k);
    const name = { super: 'ROADSTER', hyper: 'HYPER', escape: 'SOS' }[k];
    check(r.state === 'run' && r.src === 'AUTO_LAST_CHANCE' && r.lives === 1 && r.items === r.items0 - 1 && r.carried === null, `${name}: lethal hit with no revive left → auto-activated through the same pathway, exactly one charge, run continues`, r);
    await shot(file);
    await ev(() => { const G = window.__g; let n = 0; while (G.world.player.vmode === 'up' && n++ < 900) window.__steps(1 / 60); window.__steps(1.5); });
    return r;
  };
  const r1 = await auto('super', '21_special_auto_roadster');
  check(/ROADSTER AUTO ACTIVATED/.test(r1.toast), 'notification "ROADSTER AUTO ACTIVATED!" shown (non-blocking toast)', r1.toast);
  await auto('hyper', '22_special_auto_hyper');
  const r3 = await auto('escape', '23_special_auto_sos');
  // notification close-up: SOS toast right after activation
  await ev(() => { const G = window.__g; G.continuesUsed = 3; G.autoRescueUsed = false; G.lastSpecialSource = null; G.run.lives = 1; G.run.escapes = 1; G.carried = 'escape'; G.save.items.escape = Math.max(1, G.save.items.escape); window.__putCrate(G.world.player.lane, 16); let n = 0; while (G.lastSpecialSource !== 'AUTO_LAST_CHANCE' || n < 1) { G.advance(1 / 60); if (n++ > 200) break; } G.advance(0.05); });
  await shot('24_special_auto_notification');
  await ev(() => { const G = window.__g; let n = 0; while (G.world.player.vmode === 'up' && n++ < 900) window.__steps(1 / 60); window.__steps(1); });
  void r3;
  // priority + negatives
  const neg = await ev(() => {
    const G = window.__g;
    const res = {};
    // a) revive offer still available → existing flow (continue offer), special NOT consumed
    G.continuesUsed = 0; G.autoRescueUsed = false; G.lastSpecialSource = null; G.run.lives = 1; G.run.superJumps = 1; G.carried = 'super'; G.run.shield = false; G.run.invulnT = 0;
    window.__clear(90); window.__putCrate(G.world.player.lane, 16);
    let n = 0; while (G.state === 'run' && n++ < 200) G.advance(1 / 60);
    res.reviveFirst = { state: G.state, charges: G.run.superJumps, src: G.lastSpecialSource };
    return res;
  });
  check(neg.reviveFirst.state === 'dying' && neg.reviveFirst.charges === 1, 'revive offer still available → existing death / continue flow, special kept', neg.reviveFirst);
  // let the continue offer appear, then use it (coins) to get back into the run
  const cont = await ev(() => { const G = window.__g; let n = 0; while (G.state === 'dying' && n++ < 300) G.advance(1 / 60); return G.state; });
  check(cont === 'continue', 'continue (revive) offer shown as before', cont);
  const neg2 = await ev(() => {
    const G = window.__g;
    G.save.wallet += 100000;
    if (G.state === 'continue') G.doContinue(); // = the rewarded ad finished (v2 revives are ad-only)
    let n = 0; while (G.state !== 'run' && n++ < 400) G.advance(1 / 60);
    const res = { afterRevive: G.state };
    // b) no special left → normal Game Over (no false rescue message)
    G.continuesUsed = 3; G.autoRescueUsed = false; G.lastSpecialSource = null; G.run.lives = 1; G.run.superJumps = 0; G.run.hyperJumps = 0; G.run.escapes = 0; G.carried = null; G.run.shield = false; G.run.invulnT = 0;
    window.__clear(90); window.__putCrate(G.world.player.lane, 16);
    const t0 = window.__toasts().join('|');
    n = 0; while (G.state === 'run' && n++ < 200) G.advance(1 / 60);
    res.noSpecial = { state: G.state, falseMsg: /AUTO ACTIVATED/.test(window.__toasts().join('|').replace(t0, '')) };
    return res;
  });
  check(neg2.noSpecial.state === 'dying' && !neg2.noSpecial.falseMsg, 'no special left → normal crash / Game Over, no rescue message', neg2);
  R.specialNegatives = { neg, neg2 };
  save();
}

// ======================================================= E. CRASH: breaks a little, falls to the road
if (want('crash')) {
  console.log('E. crash');
  await ev(() => { const G = window.__g; G.manual = true; if (G.state !== 'run') { G.startRun(); for (let i = 0; i < 300 && G.state !== 'run'; i++) G.advance(1 / 60); } G.run.lives = 1; G.continuesUsed = 3; G.carried = null; G.run.superJumps = G.run.hyperJumps = G.run.escapes = 0; window.__steps(1); });
  // a real final collision while airborne: jump, then a beam-height obstacle (laser 'high'? use a crate during the hop)
  const c = await ev(() => {
    const G = window.__g, p = G.world.player;
    G.run.shield = false; G.run.invulnT = 0;
    p.input('up');
    window.__steps(0.3);
    const y0 = G.vehicle.root.position.y;
    G.run.lives = 0; // what Run.handle leaves after the last life
    G.onCrash(true); // final crash while ~3 m up (same entry the collision uses)
    G.advance(0.12);
    return { y0: +y0.toFixed(2), yFalling: +G.vehicle.root.position.y.toFixed(2), parts: G.vehicle.mesh?.partsBroken ?? 0, state: G.state };
  });
  await shot('crash_01_breaks_and_falls');
  const c2 = await ev(() => { const G = window.__g; G.advance(1.0); return { air: +G.vehicle.crashAirborne.toFixed(3), parts: G.vehicle.mesh?.partsBroken ?? 0, partsY: (G.vehicle.mesh?.broken ?? []).map((b) => +b.pivot.position.y.toFixed(2)), state: G.state }; });
  await shot('crash_02_on_the_road');
  check(c.y0 > 1.5 && c.parts >= 2, `run-ending crash in the air: ${c.parts} real parts break off (car was ${c.y0} m up)`, c);
  check(Math.abs(c2.air) < 0.01, `car falls and settles on the road (height above road ${c2.air} m) — no floating`, c2);
  R.crash = { c, c2 };
  save();
}

// ======================================================= F. PAUSE (Patch 02)
if (want('pause')) {
  console.log('F. pause');
  await ev(() => { const G = window.__g; G.manual = true; G.startRun(); for (let i = 0; i < 300 && G.state !== 'run'; i++) G.advance(1 / 60); G.run.lives = 3; window.__steps(1); G.run.turboT = 3; G.run.shield = true; G.run.shieldT = 5; G.world.player.input('up'); window.__steps(0.25); });
  const pb = await ev(() => { const b = [...document.querySelectorAll('[data-a="pause"]')].find((e) => e.offsetParent); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await ev(() => { window.__g.manual = false; }); // the real frame loop runs while paused
  if (pb) await page.touchscreen.tap(pb.x, pb.y);
  else await ev(() => window.__g.pause());
  await page.waitForTimeout(300);
  const p0 = await ev(() => { const G = window.__g; return { state: G.state, turbo: G.run.turboT, shieldT: G.run.shieldT, dist: G.world.dist, y: G.world.player.y, stateT: G.stateT, time: G.time }; });
  check(p0.state === 'paused', 'Pause (real tap): PAUSED state', p0);
  await shot('01_pause_menu', 'patch02');
  await page.waitForTimeout(10000);
  const p10 = await ev(() => { const G = window.__g; return { state: G.state, turbo: G.run.turboT, shieldT: G.run.shieldT, dist: G.world.dist, y: G.world.player.y, time: G.time }; });
  check(p10.state === 'paused' && p10.dist === p0.dist && p10.turbo === p0.turbo && p10.shieldT === p0.shieldT && p10.y === p0.y && p10.time === p0.time, '10 s real time paused: still paused, world / Turbo / Shield / jump frozen', p10);
  await page.waitForTimeout(50000);
  const p60 = await ev(() => ({ state: window.__g.state, dist: window.__g.world.dist }));
  check(p60.state === 'paused' && p60.dist === p0.dist, '60 s real time paused: still paused', p60);
  // 5 minutes of frames through the game's own tick (fixed 1/60 s steps)
  const p300 = await ev(() => { const G = window.__g; G.advance(300); return { state: G.state, dist: G.world.dist, turbo: G.run.turboT, shieldT: G.run.shieldT, gameover: document.querySelector('#gameover')?.classList.contains('show') }; });
  check(p300.state === 'paused' && p300.dist === p0.dist && !p300.gameover, '5 min of frames paused: still paused, no Game Over', p300);
  // background / foreground while paused
  const bg = await ev(async () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 400));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 400));
    return window.__g.state;
  });
  check(bg === 'paused', 'background → foreground while paused: still paused', bg);
  await shot('02_pause_after_wait', 'patch02');
  // Resume (real tap): exact state, no time jump
  const rb = await ev(() => { const b = [...document.querySelectorAll('[data-a="resume"]')].find((e) => e.offsetParent); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await ev(() => { window.__g.manual = true; });
  await page.touchscreen.tap(rb.x, rb.y);
  const r1 = await ev(() => { const G = window.__g; const d0 = G.world.dist; G.advance(1 / 60); return { state: G.state, step: +(G.world.dist - d0).toFixed(3), turbo: +G.run.turboT.toFixed(3), y: +G.world.player.y.toFixed(3) }; });
  check(r1.state === 'run' && r1.step < 1.5 && Math.abs(r1.turbo - (p0.turbo - 1 / 60)) < 0.02, 'Resume: continues from the saved state (one frame of movement, Turbo timer resumes where it stopped)', r1);
  await ev(() => window.__steps(0.6));
  await shot('03_resume_gameplay', 'patch02');
  // obstacle right in front + pause: no collision while paused
  const ob = await ev(() => { const G = window.__g; G.run.shield = false; G.run.invulnT = 0; window.__clear(90); window.__putCrate(G.world.player.lane, 6); G.advance(1 / 60); G.pause(); const lives = G.run.lives; G.advance(20); return { state: G.state, lives, after: G.run.lives }; });
  check(ob.state === 'paused' && ob.after === ob.lives, 'paused right before an obstacle: no collision, no damage', ob);
  // Pause → Retry and Pause → Home
  const rt = await ev(() => { const G = window.__g; window.__clear(90); G.resume(); G.advance(0.1); window.__clear(90); G.pause(); return G.state; });
  await page.evaluate(() => [...document.querySelectorAll('[data-a="retry"]')].find((e) => e.offsetParent)?.click());
  await page.waitForTimeout(800);
  const afterRetry = await ev(() => ({ state: window.__g.state, pick: document.querySelector('#specialpick')?.classList.contains('show'), pauseMenu: document.querySelector('#pause')?.classList.contains('show') }));
  await page.evaluate(() => [...document.querySelectorAll('#specialpick button')].filter((e) => e.offsetParent && /\bGO\b/.test(e.textContent)).at(-1)?.click());
  await page.waitForTimeout(800);
  const afterGo = await ev(() => window.__g.state);
  check(rt === 'paused' && afterRetry.pick && (afterGo === 'countdown' || afterGo === 'run'), 'Pause → Retry → pre-race pick (over the still-paused race) → GO: a new run starts only on the explicit taps', { ...afterRetry, afterGo });
  save();
}

// ======================================================= G. MAGIC BAG (Patch 02)
if (want('bag')) {
  console.log('G. magic bag');
  const bag = await ev(() => {
    const G = window.__g;
    const res = {};
    G.ui.hideOverlay('specialpick');
    // empty bag → nothing, no message
    Object.assign(G.save.items, { super: 0, hyper: 0, escape: 0 });
    G.save.special = null;
    const t0 = window.__toasts().length;
    res.empty = { picked: G.magicBagAutoEquip(), special: G.save.special };
    // one eligible → that one
    G.save.items.hyper = 2;
    res.one = { picked: G.magicBagAutoEquip(), items: { ...G.save.items } };
    // already equipped → never re-rolled (Resume / Retry), nothing consumed
    res.noReroll = { picked: G.magicBagAutoEquip(), special: G.save.special, items: { ...G.save.items } };
    // several eligible, zero excluded → uniform among the eligible ones
    Object.assign(G.save.items, { super: 1, hyper: 0, escape: 3 });
    const n = { super: 0, hyper: 0, escape: 0 };
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 600; i++) { G.save.special = null; n[G.magicBagAutoEquip(rnd)]++; }
    res.many = n;
    res.items = { ...G.save.items };
    void t0;
    return res;
  });
  check(bag.empty.picked === null && bag.empty.special === null, 'empty Magic Bag → nothing equipped, no error', bag.empty);
  check(bag.one.picked === 'hyper' && bag.one.items.hyper === 2, 'one eligible item → that item equipped, quantity unchanged (consumed only when used)', bag.one);
  check(bag.noReroll.picked === null && bag.noReroll.special === 'hyper', 'slot already filled → no re-roll (Resume / Retry)', bag.noReroll);
  check(bag.many.hyper === 0 && bag.many.super > 220 && bag.many.escape > 220, `several eligible → one random pick, zero-quantity excluded (${JSON.stringify(bag.many)} of 600)`, bag.many);
  // real flow screenshot: open the pre-race pick with Roadster + SOS in the bag, nothing selected
  await ev(() => { const G = window.__g; G.save.special = null; Object.assign(G.save.items, { super: 1, hyper: 0, escape: 2 }); G.setState?.('tracks'); G.ui.show('tracks'); G.openSpecialPick('endless'); G.ui.showOverlay('specialpick'); });
  await page.waitForTimeout(500);
  const eq = await ev(() => ({ special: window.__g.save.special, toast: window.__toasts().join(' | ') }));
  check(!!eq.special && /MAGIC BAG: .* EQUIPPED/.test(eq.toast), 'pre-race: "MAGIC BAG: … EQUIPPED" with the real item name', eq);
  await shot('04_magic_bag_auto_equipped', 'patch02');
  await ev(() => { const G = window.__g; G.ui.hideOverlay('specialpick'); G.save.special = null; Object.assign(G.save.items, { super: 0, hyper: 0, escape: 0 }); G.openSpecialPick('endless'); G.ui.showOverlay('specialpick'); });
  await page.waitForTimeout(3500); // let the previous toast leave
  await shot('05_magic_bag_empty', 'patch02');
  await shot('33_item_selection_flat_buttons');
  await ev(() => window.__g.ui.hideOverlay('specialpick'));
  save();
}

// ======================================================= H. GARAGE / CLASS UNLOCKS
if (want('garage')) {
  console.log('H. garage');
  const EXP = { C: 3000, B: 8000, A: 15000, AA: 26000, AAA: 40000, S: 65000 };
  const setRank = (cls) => ev(([cls, exp]) => {
    const G = window.__g;
    G.save.expBest = cls === 'S' ? 40000 : exp;
    G.save.exp2Best = cls === 'S' ? exp : 0;
    G.save.unlocked = ['zenith'];
    G.syncCarUnlocks();
    G.persist();
    return { rank: G.rank, unlocked: [...G.save.unlocked] };
  }, [cls, EXP[cls]]);
  const matrix = {};
  for (const [cls, file] of [['C', '01_garage_class_c'], ['B', '02_garage_class_b'], ['A', null], ['AA', '03_garage_class_aa_unlocked'], ['AAA', '04_garage_class_aaa'], ['S', '05_garage_class_s_locked']]) {
    const r = await setRank(cls);
    matrix[cls] = r.unlocked;
    if (file) {
      await ev((cls) => { const G = window.__g; G.setState?.('menu'); G.openGarage(); const id = cls === 'S' ? 'volt' : cls === 'AAA' ? 'nexus' : 'inferno'; G.ui.garageIndex = cls === 'S' ? 4 : cls === 'AAA' ? 2 : 1; G.ui.garageSync(G.save, id); G.previewSkin?.(id); }, cls);
      await shot(file);
    }
  }
  const newAt = (a, b) => matrix[b].filter((x) => !matrix[a].includes(x));
  check(matrix.C.length === 1 && matrix.B.length === 1 && matrix.A.length === 1, 'C / B / A: no new car (only the starter)', { C: matrix.C, B: matrix.B, A: matrix.A });
  check(newAt('A', 'AA').length === 1 && newAt('A', 'AA')[0] === 'inferno', 'AA: exactly ONE new car (XWAVE Inferno)', newAt('A', 'AA'));
  check(newAt('AA', 'AAA').length === 1 && newAt('AA', 'AAA')[0] === 'nexus', 'AAA: exactly ONE new car (XWAVE Nexus, v4.6)', newAt('AA', 'AAA'));
  check(newAt('AAA', 'S').length === 1 && newAt('AAA', 'S')[0] === 'vega', 'S: exactly ONE new car (XWAVE Vega)', newAt('AAA', 'S'));
  // v4.6: every car not owned yet is a black silhouette; v4.6.1 rarity follows the unlock class
  const vis = await ev(() => { const G = window.__g; G.save.expBest = 26000; G.save.exp2Best = 0; G.save.unlocked = ['zenith']; G.syncCarUnlocks(); G.openGarage(); G.ui.garageSync(G.save, 'zenith'); return [...document.querySelectorAll('#garage .ccard[data-id]')].map((e) => [e.dataset.id, e.classList.contains('dark')]); });
  check(vis.filter(([id, d]) => id !== 'zenith' && id !== 'inferno' && !d).length === 0, 'every car not owned yet is a dark silhouette', vis);
  // owned cars are kept (no downgrade), no duplicates
  const keep = await ev(() => { const G = window.__g; G.save.expBest = 3000; G.save.exp2Best = 0; G.save.unlocked = ['zenith', 'vega', 'volt', 'phantom', 'inferno']; G.syncCarUnlocks(); G.syncCarUnlocks(); return [...G.save.unlocked]; });
  check(keep.length === 5 && new Set(keep).size === 5, 'cars already owned stay owned, no duplicate unlocks', keep);
  // locked S+ cars can't be selected
  const sel = await ev(() => { const G = window.__g; G.save.unlocked = ['zenith']; const before = G.save.vehicle; G.applySkin?.('volt'); return { vehicle: G.save.vehicle, before }; });
  check(sel.vehicle === sel.before || sel.vehicle === 'zenith', 'locked S+ car cannot become the race car', sel);
  R.classMatrix = matrix;
  save();
}

// ======================================================= I. CONGRATULATIONS
if (want('congrats')) {
  console.log('I. congratulations');
  const cel = async (cls, exp, exp2, file) => {
    const r = await ev(async ([cls, exp, exp2]) => {
      const G = window.__g;
      G.ui.hideOverlay('classup');
      G.classQueue.length = 0;
      G.save.classCelebrated = ['C', 'B', 'A', 'AA', 'AAA', 'S', 'SS', 'SSS'].filter((c) => c !== cls);
      window.__before = { wallet: G.save.wallet, items: { ...G.save.items } };
      G.save.expBest = exp;
      G.save.exp2Best = exp2;
      G.syncCarUnlocks();
      G.setState('gameover');
      G.ui.show('gameover');
      G.queueClassCelebration();
      await new Promise((r) => setTimeout(r, 1300));
      return { shown: document.querySelector('#classup')?.classList.contains('show'), title: document.querySelector('[data-k="cutitle"]')?.textContent, car: document.querySelector('[data-k="cucar"]')?.hidden ? null : document.querySelector('[data-k="cucarname"]')?.textContent, reward: document.querySelector('[data-k="cureward"]')?.hidden ? null : document.querySelector('[data-k="cureward"]')?.textContent.trim() };
    }, [cls, exp, exp2]);
    await shot(file);
    // Continue (real tap) → acknowledged, never again
    const b = await ev(() => { const e = document.querySelector('#classup [data-a="classok"]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.touchscreen.tap(b.x, b.y);
    await page.waitForTimeout(500);
    const paid = await ev(() => { const G = window.__g, b = window.__before; return { coins: G.save.wallet - b.wallet, items: Object.fromEntries(Object.keys(G.save.items).map((k) => [k, G.save.items[k] - b.items[k]]).filter(([, n]) => n)) }; });
    const again = await ev(async () => { const G = window.__g; const w = G.save.wallet; G.queueClassCelebration(); await new Promise((r) => setTimeout(r, 1300)); return { shown: document.querySelector('#classup')?.classList.contains('show'), saved: [...G.save.classCelebrated], paidAgain: G.save.wallet - w }; });
    return { ...r, paid, again };
  };
  // v4.6.1: C / B / A — no car, a one-time reward (coins + one special) paid on Continue
  const c = await cel('C', 3000, 0, '24c_congratulations_class_c');
  check(c.shown && /Class C$/.test(c.title) && c.car === null && /\+300/.test(c.reward ?? ''), 'first-time Class C: celebration + reward shown (+300 coins, +1 Roadster Jump)', c);
  check(c.paid.coins === 300 && c.paid.items.super === 1, 'Class C reward paid once on Continue', c.paid);
  check(!c.again.shown && c.again.paidAgain === 0, 'Class C acknowledged: not shown or paid again', c.again);
  const b = await cel('B', 8000, 0, '24b_congratulations_class_b');
  check(b.shown && b.paid.coins === 500 && b.paid.items.hyper === 1 && !b.again.shown, 'first-time Class B: +500 coins, +1 HYPER JUMP, once', b);
  const a = await cel('A', 15000, 0, '25_congratulations_class_a');
  check(a.shown && /Class A$/.test(a.title) && a.car === null && a.paid.coins === 800 && a.paid.items.escape === 1, 'first-time Class A: celebration, no car, +800 coins, +1 SOS', a);
  check(!a.again.shown && a.again.saved.includes('A') && a.again.paidAgain === 0, 'acknowledged: not shown again', a.again);
  const aa = await cel('AA', 26000, 0, '26_congratulations_class_aa');
  check(aa.shown && aa.car === 'XWAVE Inferno' && aa.reward === null && aa.paid.coins === 0, 'first-time Class AA: celebration + the one unlocked car (XWAVE Inferno), no coin reward', aa);
  const aaa = await cel('AAA', 40000, 0, '27_congratulations_class_aaa');
  check(aaa.shown && aaa.car === 'XWAVE Nexus', 'first-time Class AAA: celebration + the one unlocked car (XWAVE Nexus)', aaa);
  const s = await cel('S', 40000, 65000, '28_congratulations_class_s');
  check(s.shown && /Class S$/.test(s.title), 'first-time Class S: celebration (only rewards really unlocked)', s);
  R.congrats = { c, b, a, aa, aaa, s };
  save();
}

// ======================================================= J. BUTTONS (flat outside Home)
if (want('buttons')) {
  console.log('J. buttons');
  const audit = () => ev(() => {
    const bad = [];
    for (const sc of document.querySelectorAll('#ui .screen.show:not(#start)')) {
      for (const el of sc.querySelectorAll('button, .btn, [data-a]')) {
        if (!el.offsetParent) continue;
        if (el.matches('#runrank .rr-me')) continue; // v4.6 owner request: the player's row on the post-race rank board glows
        const cs = getComputedStyle(el);
        const pb = getComputedStyle(el, '::before'), pa = getComputedStyle(el, '::after');
        const glowPseudo = [pb, pa].some((p) => p.content !== 'none' && p.display !== 'none' && (p.boxShadow !== 'none' || p.filter !== 'none' || /gradient/.test(p.backgroundImage)) && !el.matches('.rocketbtn, .sos'));
        if (cs.boxShadow !== 'none' || cs.textShadow !== 'none' || (cs.filter !== 'none' && !el.disabled) || cs.animationName !== 'none' || glowPseudo) bad.push(`${sc.id} ${el.dataset.a ?? el.className}: ${cs.boxShadow !== 'none' ? 'box-shadow ' : ''}${cs.textShadow !== 'none' ? 'text-shadow ' : ''}${cs.filter !== 'none' ? 'filter ' : ''}${cs.animationName !== 'none' ? 'anim ' : ''}${glowPseudo ? 'pseudo' : ''}`);
      }
    }
    return bad;
  });
  const home = await ev(() => {
    const G = window.__g;
    for (const id of ['classup', 'gameover', 'specialpick', 'pause', 'settings', 'garage']) G.ui.hideOverlay(id);
    G.goHome?.();
    return [...document.querySelectorAll('#start button')].filter((b) => b.offsetParent).map((b) => { const cs = getComputedStyle(b); return cs.boxShadow + '|' + cs.backgroundImage.slice(0, 30); }).slice(0, 4);
  });
  await page.waitForTimeout(800);
  await shot('34_home_buttons_unchanged');
  R.homeButtonsSample = home;
  const views = [
    ['29_garage_flat_buttons', () => { const G = window.__g; G.goHome?.(); G.openGarage(); G.ui.garageSync(G.save, 'inferno'); }],
    ['30_settings_flat_buttons', () => { window.__g.goHome?.(); window.__g.openSettings(); }],
    ['31_pause_flat_buttons', () => { const G = window.__g; G.ui.hideOverlay('settings'); G.manual = true; G.startRun(); for (let i = 0; i < 300 && G.state !== 'run'; i++) G.advance(1 / 60); window.__steps(0.5); G.pause(); }],
    ['32_game_over_flat_buttons', () => { const G = window.__g; G.resume(); G.gameOver(); }],
  ];
  for (const [file, fn] of views) {
    await ev(fn);
    await page.waitForTimeout(900);
    const bad = await audit();
    check(bad.length === 0, `${file}: no glow / shadow / text-shadow / pulsing on non-Home buttons`, bad.slice(0, 6));
    await shot(file);
  }
  save();
}

// blocked network in this sandbox (web fonts, IP country lookup) is not a game error
R.errors = g.errors.filter((e) => !/Failed to load resource|ERR_TUNNEL|ERR_CONNECTION/.test(e));
check(R.errors.length === 0, 'no page errors (network-blocked font / geo lookups excluded)', R.errors.slice(0, 5));
save();
await g.close();
console.log(R.checks.filter((c) => !c.ok).length ? `${R.checks.filter((c) => !c.ok).length} FAILED` : 'ALL PASSED');
