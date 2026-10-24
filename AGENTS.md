# AGENTS.md — read this first

Instructions for any AI assistant (Claude, Cursor, Codex, Copilot, …) working on this repo.
The owner switches between AI accounts and tools, so **this file + `docs/PROGRESS.md` are the shared memory**. Read both (and `docs/GAME-DESIGN.md`, the locked v2 design) before changing anything, and update `docs/PROGRESS.md` before you finish.

## What this is

**Sky Roadster** (formerly "XWAVE Flying Run") — a mobile-first 3D endless runner for the browser (H5).
The player pilots a flying car through a neon sky-city: swipe left/right to change lanes, up to fly over, down to dive under. 5 tracks + Endless, power-ups, missions, garage, shop, leaderboards, live-ops events, rewarded ads.

- Stack: **Three.js 0.169 · TypeScript (strict) · Vite 5**. No runtime CDNs — models, textures and sounds are procedural.
- Current version: see `const VERSION` in `src/Game.ts`.
- Full feature docs and per-version changelog: `README.md`.

## Commands

```bash
npm install
npm run dev            # http://localhost:5173 (also on LAN for phone testing)
npm run typecheck
npm test               # fairness + difficulty + air-lane + EXP calibration + rank-phase + bonus + server-rule tests (Node 22+)
npm run build          # dist/ (multi-file static build)
npm run build:single   # dist/index.html, everything inlined (one shareable file)
node scripts/build-esbuild.mjs [--single]   # fallback build without Vite
```

Before committing a gameplay change: `npm run typecheck && npm test` must pass.

## Architecture (short)

```
src/config.ts        ALL tuning numbers (lanes, heights, timings, speed, scoring, fairness budgets)
src/Game.ts          state machine & orchestration (menu → countdown → run → crash → game over)
src/gameplay/        PURE LOGIC, no Three.js, runs in Node (tests import it directly)
src/render/          Three.js views — read-only consumers of gameplay state
src/render/car/      v4 3D car: glbParse.ts (own GLB reader), MeshCar.ts (wheels, sprung body, pop-up spoiler, nitro, dive pose), CarFx.ts (shield aura, ghost / pickup edge light, crash shards), carMotion.ts (pure, tested), x1Textures.ts
src/render/DebugCollision.ts  ?debug=collision overlay (visual bounds vs hitboxes; dev only)
src/render/roadSurface.ts     v4.2 procedural road tile (pure data, tested in Node) → Track.ts DataTextures; envFx.ts: wrapZ + far fade (no popping)
                     graphics presets LOW / MEDIUM / HIGH: GRAPHICS in config.ts (Renderer, Scenery.setQuality, Track.setQuality)
                     cameras: CAMERA presets (low / balanced / high) + CAMERA.home in config.ts, used by render/CameraRig.ts
scripts/car/         X1 model builder (build-x1.mjs [--detail=master] → src/assets/models/xwave-x1.glb / assets-src/x1/xwave-x1-master.glb), preview shots (preview-x1.mjs),
                     studio + reference matching (studio-x1.mjs, compare/run.sh), real gameplay camera (game-camera.ts) and states (gameplay-states.mjs)
src/core/perf.ts     ?perf=1 frame-time recorder (scripts/perf/profile.mjs = desktop/SwiftShader baseline)
src/ui/              DOM overlay UI, ui.css, i18n.ts (EN/FR/JA/PT-BR/DE/ES), icons, avatars
src/meta/            shop, rank, daily, events, leaderboard
src/net/PlayerStore  local (default) or remote player store (?api=…)
src/net/Cloud.ts     accounts (guest / email / Google / Apple) + cloud save + verified run reports (CLOUD.api)
src/ads/Ads.ts       rewarded + interstitial ads
server/              game server: accounts, cloud save, verified EXP, boards (index.mjs + core.mjs + schema.sql)
builds/              prebuilt single-file HTML snapshots (playable by opening the file)
```

## Rules — do not break these

1. **Fairness**: obstacle hitboxes and pass-heights live ONLY in `src/gameplay/ObstacleRules.ts`. Runtime collision and the spawner both read it. The spawner must never produce an unavoidable row. If you touch Spawner/Fairness/ObstacleRules/Player, run `npm test`.
2. **`gameplay/` stays free of Three.js and the DOM** so tests run in Node.
3. If you change `HEIGHT` / `CAR_HALF` in `config.ts`, keep `ObstacleRules.ts` in sync.
4. Tuning goes in `config.ts`, not as magic numbers in code.
5. New UI text: add it to `src/ui/i18n.ts` for all languages (English fallback is OK for dynamic sentences).
6. Mobile first: every panel must fit a 375×640 screen without scrolling. Target 60 FPS on phones.
7. Saves are in `localStorage` via `src/core/Save.ts` — don't break old saves; migrate fields instead.
8. Never trust the client for EXP / rank: the server re-computes EXP from each run (`server/core.mjs`). If you change EXP rates, ranks or road multipliers in `config.ts`, update `server/core.mjs` too (`npm test` checks).

## Workflow

- **Versions live side by side (one branch each):**
  - `v4.0.1` = **v4** — the 3D upgrade (better 3D graphics). Started at v4.0.1 from the H5 web game v2.3.0 (DOM UI, accounts / cloud save), because the H5 code is the easiest base for 3D work. Work and push here; never merge `main` (v3 native) into it.
  - `main` = **v3** — the native TikTok mini game (+ the web build of the same code). Every push to `main` goes live on the owner's PC.
  - `v2` = the v2 web game frozen at v2.3.0. Fixes: check out `v2`, commit, push `v2`.
  - `v1` = the old game, frozen at v1.19.1. It stays fully playable and can still get improvements: check out `v1`, commit there, push `v1`. Never merge `v1` into another branch (cherry-pick a fix if both need it). The v1 single-file build is `builds/sky-roadster-v1.18.html` on the `v1` branch.
- Branch `main` = always playable. Big or risky work → a branch (`feat/…`, `fix/…`), merge when it works.
- Small, focused commits with clear messages (e.g. `feat: boss lane on Mega City`, `fix: shield timer reset on respawn`).
- When you bump the version: update `VERSION` in `src/Game.ts`, add a changelog section to `README.md`.
- At the end of every session: update `docs/PROGRESS.md` (what changed, what's half-done, what's next).
- The owner runs `SkyRoadster-Dev.bat` on Windows: localhost auto-pulls `main` every 20 s, so **every push to `main` goes live on their PC** — push only playable code to `main`.
- Optional snapshot for sharing: `npm run build:single` then copy `dist/index.html` to `builds/sky-roadster-vX.YY.html`.
