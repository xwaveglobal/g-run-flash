# Sky Roadster

Sky Roadster (formerly "XWAVE Flying Run") is a high-speed 3D endless runner. Pilot the XWAVE flying car through a neon sky-city: swipe left or right to switch lanes, up to fly over barriers, down to dive under beams. Collect energy coins, grab shields, magnets and turbo boosts, and chain near misses for combo points. Race five tracks from Future City to the XWAVE Megacity, or go Endless and chase your best score.

**Stack:** Three.js r169 · TypeScript · Vite · WebGL · zero runtime CDNs (every model, texture and sound is generated procedurally and can be swapped for real files).

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (also on your LAN; open it on your phone)
```

Production build:

```bash
npm run build        # typecheck + dist/ (static files, host anywhere)
npm run preview      # serve dist/ locally
npm run build:single # dist/index.html with everything inlined (one shareable file)
```

No Vite? `node scripts/build-esbuild.mjs [--single]` builds with esbuild alone (output in `dist-esbuild/`).

Tests:

```bash
npm run test:fairness   # obstacle fairness + movement state-machine tests (Node 22+)
npm run typecheck
```

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Move one lane left / right | swipe ← / → | ← / → or A / D |
| **Fly up** (clear low obstacles) | swipe ↑ | ↑ / W / Space |
| **Fly down** (pass under beams) | swipe ↓ | ↓ / S |
| **Air Dash** (with charges, while airborne): cross 2 lanes with a flip | swipe ← / → in the air | ← / → in the air |
| **Sky Escape** (emergency item) | SOS button | E / Enter |
| Pause | ⏸ button | Esc / P |

Swipes fire the moment your finger passes the threshold (not on release), and one drag can chain gestures (e.g. left, then up).

URL flags: `?debug` (FPS, draw calls, state readout, hitbox wireframes) · `?autopilot` (bot plays; good for demos and soak tests) · `?manual` (time only advances through `window.__xwave.advance(s)`, used by automated browser tests) · `?noauto` (disable automatic quality downgrade).

## Gameplay

- **3 lanes × 3 heights** (LOW / NORMAL / HIGH). Lane changes are allowed at any height.
- **Fly up:** anticipation dip → launch (wings deploy, thrusters swing straight down, engines flare, blue plasma column) → hold → smooth descent.
- **Fly down:** small hop → drop and compress, thrusters tuck back and turn orange → hold → spring back up.
- **Interruption rules:** UP while high extends the hold; DOWN while high is a fast dive (and vice-versa); a second lane swipe mid-slide retargets immediately; inputs during an anticipation are buffered (160 ms).
- **Scoring:** distance, coins, near misses (+50), ring fly-throughs (+100), dodges, combo multiplier (+0.5× every 10 dodges, up to 4×), missions.
- **Speed** ramps from 76 to 166 km/h over distance; obstacle density and pattern complexity rise with it.
- **Worlds** change every 1,000 m through a glowing portal: Future City → Neon Tunnel → Cloud City → Space Zone → XWAVE Megacity → loop.

### Speed levels (home screen)

| Level | For | Speed | Obstacle spacing | Score |
|---|---|---|---|---|
| EASY | new players | ×0.78 (≈ 59–129 km/h) | +20 % | ×0.8 |
| NORMAL | regular players | ×1 (≈ 76–166 km/h) | — | ×1 |
| HARD | experts | ×1.18 (≈ 89–195 km/h) | −8 % | ×1.3 |

Every level passes the same fairness test (no unavoidable patterns). The choice is saved and applies to Endless and every track.

### How the car moves

- **On the road** the four pods stand up as wheels and roll with the speed: the car drives like a car, with a light road vibration and no thruster flames or air columns.
- **Lane changes:** one swipe = exactly one lane. A swipe during a slide is queued and runs once the car has settled, so it never stops between lanes. One touch = one gesture.
- **Wheels:** chrome five-twin-spoke rims with a blue light ring, treaded tyres and a motion-blur disc that fades in with speed.
- **Fly up = one hop:** only possible with the wheels on the road. The pods flip into thrusters and blow air *upward* around the car, it rises, hovers for one beat and lands by itself. UP while airborne is ignored and there is a 0.12 s rest after landing, so spamming UP can't keep the car flying (tested: max 0.97 s airborne under constant spam).
- **Landing:** the pods turn back into wheels and vent smoke and air that rolls out along the road, with an air-release sound.
- **Fly down:** the wheels tuck into the body and the car drops onto its belly, throwing a few sparks.

### First-run training

The first PLAY opens **Pilot Training**: an intro card explaining the moves, then a short scripted practice road. Before each obstacle the game slows almost to a stop and shows an animated swipe prompt (6 steps: left, right, up, down, grab the rocket, Roadster Jump over two walls); only the right gesture continues. The player can't crash, and the result is saved. Settings → *How to play* replays it.

**Advanced training** (same screen, 5 world tiles): a guided tour of every obstacle used in that world — e.g. Neon Tunnel: barrier, low lasers, beam, high lasers, ring, laser wall; Megacity: traffic, mega gate, high lasers, triple wall, laser wall, beam. Each obstacle gets its own slowed-down prompt and explanation. Lessons: `WORLD_LESSONS` in `src/gameplay/Tutorial.ts`.

**Danger arrows** (Settings, on by default): ~0.85 s before an unavoidable hit, a big arrow shows the move that saves you (stay-in-lane moves first: ↓ or ↑, else the open lane; "TAP SOS" when only the Sky Escape can help).

### Game modes

**PLAY** opens the track select screen:

| Track | World | Length | Sections |
|---|---|---|---|
| ∞ Endless | all 5, rotating every 1,000 m | no finish | — |
| 1 Future City | Future City | 3,200 m | Start Area → City Highway → Obstacle Zone → Ring Tunnel → Sky Bridge → Laser Gate → Jump Section → Mega Structure → Final Sprint |
| 2 Neon Tunnel | Neon Tunnel | 2,400 m | Tunnel Entry → Laser Corridor → Ring Run → Overdrive |
| 3 Cloud City | Cloud City | 2,800 m | Cloud Gate → Floating Platforms → Sky Bridges → Drone Swarm |
| 4 Space Zone | Space Zone | 3,000 m | Launch → Asteroid Belt → Orbital Highway → Meteor Storm |
| 5 XWAVE Megacity | XWAVE Megacity | 3,600 m | HQ Approach → Rush Hour → Security Gates → Tower Run → XWAVE Finale |

Tracks run between a START and a FINISH gate. Each section changes the obstacle mix (e.g. Laser Gate = mostly laser gates), later tracks start faster and denser, and the HUD shows section name and progress. Finishing awards up to 3 stars (finish · no lives lost · coin target) and a coin reward; best stars and scores are saved per track. Track definitions live in `src/gameplay/Courses.ts` — add a track by adding an entry. All tracks are open from the start.

### Obstacles

Every obstacle has a bright outline/glow. **Moving obstacles get road guides**: oncoming traffic paints red chevrons in its lane; sweeping drones/platforms paint an amber ⇄ zone with a floating "⇠ ⇢" sign; a **green arrow** marks each lane that is open at driving height (`src/render/Guides.ts`). The hunter drone was rebuilt at hitbox size with a red warning ring, searchlight and a red spot on the road under it.

| Obstacle | How to pass |
|---|---|
| Cargo crate | change lane or fly up |
| Energy barrier | fly up |
| Overhead beam | fly down |
| Drone (sweeps 2 lanes) | change lane or fly up |
| Laser gate (per lane: low / high / full / open) | right lane or right height |
| Flying traffic (oncoming) | change lane |
| Energy ring | fly through the centre (not HIGH): bonus |
| Moving platform (slides 2 lanes) | timing, or fly up |
| Asteroid (Space Zone) | change lane |
| Mechanical gate (one open door) | be in the door lane, not HIGH |

### Power-ups

Energy Coin · **Shield** (absorbs one hit) · **Magnet** (pulls coins) · **Turbo Boost** (×1.55 speed, smashes obstacles, grace period after) · **Double Score** · **Extra Life** (respawn instead of game over, max 3). Each has a 3D pickup, burst VFX, sound and a HUD chip with a countdown ring.

**Roadster Jump** (purple rocket, appears after 250 m, stack max 2): the next swipe UP fires a rocket-assisted super jump to ~5.6 m that clears two rows of obstacles, with a full barrel roll at the apex. The car is invulnerable during the flight + 0.5 s; swipe DOWN cancels it early. Timings: `TIMING.super*`, height: `HEIGHT.SUPER`.

**Air Dash** (teal », road pickup after 150 m, +2 charges, max 3): while airborne a sideways swipe crosses **two lanes** (edge → edge) with a quick flip; the hop is extended until the dash lands. Normal jumps can always shift one lane in the air.

**Sky Escape** (red SOS item, road pickup after 400 m, or from the item inventory): tap the SOS button (or E) at any moment — the car rockets straight up to ~9.6 m, cruises 3 s above every obstacle and glides back down. Landing ends with the same shockwave.

**Car blockade** (Roadster showcase): while you hold a Roadster/HYPER charge, about every 520 m a double wall of cars (a white semi truck flanked by cars) blocks all three lanes, like the stunt reference video — only a rocket jump clears it. A toast warns ~120 m ahead and the danger arrow says ↑. If the charge is gone before you get there, the blockade is removed, so it can never cause an unfair crash. The basic training's last step practises exactly this.

**HYPER JUMP** (mythic, gold rocket — cup prize, check-in day 7, shop): 7.4 m, double barrel roll, golden trail, +1,000 score and +25 coins at the apex. All rocket jumps end in a **landing shockwave** that clears ~26 m of road so the touch-down is always fair.

## Live-ops

| Feature | Where | Notes |
|---|---|---|
| **Daily check-in** | Home → Daily | 7-day calendar (day 7 = HYPER JUMP); missing a day restarts at day 1 |
| **Daily quests** | Home → Daily | 4 per day (same for everyone, seeded by date), points → 3 chests (30/70/100 pts) |
| **Cups (tournaments)** | Home → Cups, live strip on home | back-to-back 72 h cups on a fixed schedule (5 rotating tracks); best score while live counts; prizes: #1 Gold + HYPER ×5 + 5,000 coins … everyone: Roadster ×1 + 150 coins; results are collected on the next home visit |
| **Leaderboard** | Home → Ranks / profile chip | This week / All time; your row is highlighted and pinned with "score X to reach #N" |
| **Boosts** | Track select | equip owned Roadster / HYPER / Sky Escape / Start Shield for the next run |

> **Sample data:** rival pilots on leaderboards and cups are generated deterministically (`src/meta/Leaderboard.ts`, `Events.ts`) so the game feels alive offline; the local player's real scores are ranked against them. A small note says so (`SAMPLE_BOARD_NOTE` in `UI.ts`). Replace `sampleBoard()` with your backend before a public launch.

## In-app purchases

`src/meta/Shop.ts` — products + a `Store` interface. The default **DemoStore** shows a confirmation sheet ("demo — no payment is taken").

| SKU | Price | Content |
|---|---|---|
| `starter_pack` | $1.99 (once) | 3,000 coins, 3 Roadster, 1 HYPER, no interstitials |
| `xwave_pass` | $4.99 / 30 days | daily 300 coins + Roadster, ×2 quest coins, gold name |
| `no_ads` | $2.99 | removes interstitials (rewarded stay optional) |
| `jump_bundle` | $2.99 | 5 Roadster + 2 HYPER |
| `escape_3` | $1.99 | 3 Sky Escapes |
| `hyper_3` | $3.99 | 3 HYPER JUMPs |
| `coins_s/m/l/xl` | $0.99–19.99 | 1,200 – 32,000 coins |

Upsell touchpoints: wallet "+" (everywhere), Continue screen when coins are short, Garage "Need N more · Get coins", Boost tiles with 0 owned. To go live, implement `Store.purchase()` with Google Play Billing / StoreKit (Capacitor plugin) or a web checkout, verify receipts server-side, and grant from the server.

## Ads (rewarded + interstitial)

All ad logic is in `src/ads/Ads.ts` (placements + caps in the `ADS` object). Without an ad SDK a **demo ad overlay** is shown so every placement can be tested.

| Placement | Type | Where | Reward |
|---|---|---|---|
| `continue` | rewarded | "CONTINUE?" overlay after the last life (7 s countdown) | respawn in place, keep score; max 2 per run, or pay coins (300, ×2 each use) |
| `double_coins` | rewarded | Game Over / Track Finish | ×2 coins of the run |
| `free_coins` | rewarded | Home | +100 coins, 5 per day |
| `head_start` | rewarded | Track select | next run starts with Shield + 1 Roadster Jump |
| `between_runs` | interstitial | leaving the results screen | only from run 3, every 3 runs, ≥ 120 s apart, never within 60 s after a rewarded ad, never in the tutorial |

Enable Google H5 Games Ads (AdSense for Games) by adding to `index.html` `<head>`:

```html
<script async data-adbreak-test="on"
  src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
  crossorigin="anonymous"></script>
<script>
  window.adsbygoogle = window.adsbygoogle || [];
  var adBreak = adConfig = function (o) { adsbygoogle.push(o); };
  adConfig({ preloadAdBreaks: 'on', sound: 'on' });
</script>
```

When `window.adBreak` exists the game uses it automatically (remove `data-adbreak-test` for production). For portals (Poki, CrazyGames) or an app-store wrapper (AdMob), implement the small `AdProvider` interface in `Ads.ts`.

### Meta

Garage: 9 cars in 5 body styles (GT Coupe ×4 colourways, Hyper Wedge, Thunder Muscle, Orbit Pod, Cyber Blade, Gold Legend); locked cars are faded in the car strip and shown as a dark silhouette in 3D. Profile: random pilot-helmet avatar (24 designs, change or re-roll in Settings) with a skill-tier badge in the corner (Rookie → Bronze 1k → Silver 3k → Gold 7k → Platinum 15k → Diamond 30k → Legend 50k best score), also shown on leaderboards. Missions (3 active, rewards in coins, pilot rank), Settings (sound, music, danger arrows, graphics, pilot name), Garage (4 colourways, Engine / Shield / Magnet upgrades, 5 levels each), best score and everything else persisted in `localStorage`.

## v4.6.1 — owner decisions: Zenith ice blue, rarity by class, C / B / A rewards, Step 07 closed

- **Zenith** (starter, class D) is painted ice blue, so it no longer looks like Vega's white. Its garage and share pictures were re-rendered from the 3D model.
- **Rarity follows the unlock class**: Zenith Common (D) · Inferno Rare (AA) · Nexus Epic (AAA) · Vega Legendary (S) · Volt Mythic (SS) · Phantom Ultimate (SSS). Only the labels changed; the unlock order is the same.
- **Classes C / B / A** unlock no car. Their first-time promotion screen now gives a reward, paid once when Continue is tapped (`CLASS_REWARD` in `config.ts`):
  - C: +300 coins and 1 Roadster Jump.
  - B: +500 coins and 1 HYPER JUMP.
  - A: +800 coins and 1 SOS.

  Classes already passed before this update are marked as seen, so there is no back-pay and no extra pop-up.
- **Step 07 FINAL closed**: the approved v4.2.0 car (locked by a sha256 test), its runtime +15 % height and the v4.6 fixed camera are final. The experimental `?cam=premium|arcade` camera candidates and the `?pbr=1` material pass were removed (`docs/3d-upgrade/step07-final/README.md`).
- **Step 06.5 QA** was rerun on v4.6 with the updated garage and promotion expectations (`docs/gameplay-upgrade/step06-5/`).

## v4.6.0 — taller 3D car, home camera inside the road, 3D car pictures, ad revive (owner requests)

- Branch `feature/sky-roadster-v4.6-big-update` (owner: big update → own branch), built on v4.5.0.
- The 3D car is drawn **15 % taller** (body only, at runtime — the approved GLB file is unchanged, wheels stay round and on the road) so the DOWN dive reads more clearly. Visual only: hitboxes / timings unchanged (`RENDER.carHeightScale`).
- **Home camera**: the slow orbit stays inside the road (it used to swing out past the right guard rail, so the barrier crossed the whole view).
- **Car pictures** in every panel (Garage cards, celebration, share card, result screen, profile tips) are renders of the in-game 3D X1 in each car's colours (`scripts/car/thumbs-x1.mjs` + `thumbs-pack.py`); locked cars stay black silhouettes.
- **Settings → Camera motion** (default OFF): OFF = a fixed view down the centre of the road — lane changes, jumps and dives never move or tilt the camera (it sits a little further back / higher so the car stays fully on screen in both outer lanes; only Roadster / HYPER / SOS flights still lift it so the car never leaves the screen). ON = the moving chase camera as before.
- **Rewarded-ad revive** no longer adds a heart and shows no heart / life notice — only "REVIVED!" (the next hit still ends the run, as before).
- **More owner requests (2026-10-24)**: special button right under the hearts (smaller); bigger car in the fixed camera view (camera distance fitted to the screen so the car stays whole in the outer lanes); Home / Play buttons without shadows or glow; Garage: AA (Inferno) and AAA (Nexus) cars dark until earned; **Restart** instead of Retry; the game opens on NORMAL; Shop starts with a coins → specials exchange (tap an item to exchange); loading bar always runs ("Loading… NN %"); post-race **weekly rank board** (your row climbs with a glowing frame + RANK UP / CLASS congratulation; Share · Details · Home); Bonus every hour, open 30 min, 3 plays, 5-minute road; training: free control, lessons put the car in their lane, new "hop then drop at once" lesson, no obstacle driven through, specials given back for their lesson, Skip always visible; cleanup: −760 KB of pre-3D car images, unused code removed (bundle 4.59 → 3.56 MB JS, single file 4.82 → 3.79 MB), no per-frame allocations in the camera / car / portal.
- Details: `docs/gameplay-upgrade/v4.6/`.

## v4.5.0 — Step 06.5: Air Dash, airborne-only spoiler, audio + pause fixes, auto special, class unlocks

- **Audio**: sound starts from the first real tap (Play / any button / the road) — Settings is no longer needed; the context is resumed on every tap until it runs (also from the iOS "interrupted" state) and suspended while the app is hidden. The crash sound fires at the collision itself (before any crash visuals; the explosion layer on the audio clock, no timer).
- **Pause** stays paused forever (it used to share the revive countdown and ended the run); Resume continues from the exact state.
- **Air Dash** road item (outer lanes only): fires on pickup — lift, spoiler up, one sideways 360° roll across exactly two lanes, lands in the opposite outer lane. Spawned only where the landing is safe; protected only during the move + 0.25 s.
- **Spoiler** opens only in the air (jumps, Air Dash, Roadster / HYPER / SOS flights) and closes flush on the road — Turbo no longer opens it.
- **Road items** rebalanced per speed level (`ITEM_BALANCE`): more Shields / hearts on EASY, fewer on HARD, Air Dash rarer than Turbo.
- **Last-chance special**: when a hit would end the run and no revive is left, the pre-race Roadster / HYPER / SOS fires by itself through the button's own code (one charge, "… AUTO ACTIVATED!").
- **Magic Bag** auto-equips one random special before a run when the slot is empty (never replaces a pick, never re-rolls, consumes nothing).
- **Crash**: the car drops to the road (never floats) and on the run-ending crash a few real parts (splitter, spoiler, a wheel) break off.
- **Classes**: only AA unlocks a new car (XWAVE Inferno); S / SS / SSS cars are dark silhouettes until earned (owned cars are kept). First-time Class A / AA / AAA / S+ promotion celebration.
- **Buttons** outside Home are flat (no glow, shadows or pulsing). Details + screenshots: `docs/gameplay-upgrade/step06-5/`.

## v4.4.1 — X1 model back to the v4.2.0 car (owner request)

- The in-game 3D car is the v4.2.0 X1 again (the model in the Step 04 screenshots, the owner's favourite): `src/assets/models/xwave-x1.glb`, `scripts/car/x1-builder.ts` and `tests/car.test.ts` restored from `d222b92`.
- Everything else from v4.2.1–v4.4.0 stays: Ring Coins, jump camera, VFX / particle presets, LOW road texture, city variety, `?perf=1`, preset-switch texture-leak fix, context-loss handling.
- The Step 06 and Step 07 cars are kept: `assets-src/x1/rollback/` (GLBs) and git commit `d00b71c` (builder + tools).

## v4.4.0 — shorter rear, gameplay-camera polish (3D upgrade Step 07)

- The X1's rear overhang is 11 cm shorter (0.94 → 0.84 m), compressed only behind the rear wheel arch; wheelbase, cabin and front unchanged.
- Seen from the chase camera: the glass roof is framed by white A-pillars / roof rails, the closed spoiler is body-coloured, the glass is black (nothing visible through it), the rear underside ramps up like a diffuser.
- Smaller front intake with a fine grille; softer pearl sheen.
- Step 06 car kept as rollback (`assets-src/x1/rollback/`). Details: `docs/3d-upgrade/step07/`.

## v4.3.0 — X1 rebuilt against the original rear master (3D upgrade Step 06)

- Cabin, haunches, wheel openings and lower rear reshaped to match the rear master image (silhouette match 0.921 → 0.946 at the same view); rounded C-pillars with a black window frame, roof spoiler, bolder light bar, diffuser fins, rear tyres visible.
- Side / front refinements (roof line, side glass, fenders, raked nose, intake, side skirts, five twin-spoke wheels); mesh fixes (normals, winding, UVs); metallic-flake paint.
- High-detail master model (`assets-src/x1/xwave-x1-master.glb`) from the same generator. Details: `docs/3d-upgrade/step06/`.

## v4.2.1 — readability and performance (3D upgrade Step 05)

- Ring Coins: thin gold ring with an open centre and a short collect animation (coins / mechanics unchanged).
- Jumps: the chase camera rises with the car so the road ahead stays visible.
- Smaller, fewer effect particles (LOW 50 %, MEDIUM 80 %); LOW uses a smaller road texture.
- City: varied tower heights, roof crowns, per-building window patterns, less billboard repetition.
- `?perf=1` on-screen FPS / frame-time readout; WebGL context-loss handling; fixed a GPU texture leak when switching graphics presets. Details: `docs/3d-upgrade/step05/`.

## v4.2.0 — procedural road, night city, graphics presets, Turbo aura (3D upgrade Step 04)

- New road surface: dark asphalt with fine grain and polished tyre tracks, dashed lane dividers, solid edge lines, reflective studs, sealed shoulders, expansion joints and soft light pools under the street lamps; seamless at any speed.
- Future City at night: deep blue-violet sky, violet haze, neon edges on the buildings, XWAVE billboards and roadside signs, distant city lights; steel guard rails and LED street lamps that streak at speed and in Turbo.
- Scenery no longer pops in at the horizon: recycled buildings, lamps and signs fade in from the haze.
- Graphics setting is now LOW / MEDIUM / HIGH (new default MEDIUM; old HIGH saves move to MEDIUM once, LOW stays LOW).
- Turbo wears a lime aura around the car, like the Shield (it smashes obstacles too).
- Gameplay, lanes, speeds, obstacles and hitboxes unchanged. Details and screenshots: `docs/3d-upgrade/step04/`.

## v4.1.3 — front end, pop-up spoiler, premium effects, dive pose (3D upgrade Step 03.2)

- Front of the 3D X1 reworked: rounded nose, splitter tucked under the bumper (no plate sticking out), slim lower intake and corner air curtains, slim LED headlights in smoked housings, hood / bumper / door seams, pearl-white paint, darker glass.
- Front wheels fixed: the body side used to fold back around the tyre (white flaps); the arch is now cut cleanly, with black wheel-well liners and a little more clearance.
- Active spoiler is now a pop-up: it rises and tilts 22° on take-off, stays up in the air and during nitro, and closes smoothly after landing; clearly visible from the chase camera.
- Shield: the grey cloud is gone; the 3D car gets a thin, glowing cyan shell that follows lane changes and jumps and fades out when the shield ends.
- Nitro is a clean twin thrust; Phase Ghost is a translucent car with a cyan edge; power-up pickups send a short light sweep over the car.
- Crashes: impact flash, body jolt and a few shards (white body, black aero, glass); the car stays visible; nothing left over after restart.
- DOWN (dive): the 3D car presses down low and wide, with a glow and sparks underneath, so the dodge reads clearly.
- The car no longer shakes during the start countdown.
- Visual-only alignment: in the air the 3D car's underside never hangs below the hitbox, so jumped crates and barriers no longer cut through it; oncoming-traffic hover pods tucked inside their collision width.
- Developer overlay `?debug=collision`: car and obstacle visual bounds vs collision boxes.
- Gameplay, hitboxes, timings and UI unchanged. Details and screenshots: `docs/3d-upgrade/step03-2/`.

## v4.1.2 — shorter, mirrorless X1; spoiler opens on jumps (3D upgrade Step 03.1)

- Body 8 % shorter (4.60 → 4.25 m), taken from the front overhang and hood only; the rear design is unchanged.
- Side mirrors removed from the model.
- Active spoiler opens on take-off, stays up in the air and retracts after landing; it also stays up during nitro and through jump + nitro.
- Crashes: the 3D nose now meets the obstacle face instead of sinking into it (visual only; collision unchanged).
- Details, renders and frame sequences: `docs/3d-upgrade/step03-1/`.

## v4.1.1 — integrated rear bumper, active spoiler, new cameras (3D upgrade Step 03)

- Rear of the 3D X1 rebuilt: the rods, chrome rail, hanging fins and exposed nitro tubes are gone; one solid satin-black lower bumper with a recessed three-fin diffuser; nitro flames come out of the recess.
- Active rear spoiler: flush deck flap, rises during nitro (Turbo / launch) and retracts after.
- Cameras: Home has its own slow three-quarter orbit, clear of the difficulty panel; races use the BALANCED chase camera (`?cam=low|balanced|high` to compare; HIGH = the old camera).
- The car no longer disappears on crash / Game Over; Phase Ghost makes it translucent.
- Gameplay, hitboxes and UI unchanged. Details and screenshots: `docs/3d-upgrade/step03/`.

## v4.1.0 — 3D XWAVE X1 (3D upgrade Step 02)

- The player car is now a real 3D model (`src/assets/models/xwave-x1.glb`) instead of the studio rear image: spinning wheel assemblies, front-wheel steer, a sprung body that rolls on lane changes and dips on landing, emissive red LED blade / markers / XWAVE badge, nitro flames from the two rear sockets during Turbo and launch.
- Model built by `npm run build:car` (scripts/car/), refined from the XWAVE_Car_3D_v1 blockout against the master rear image; v1 and the master are kept in `assets-src/x1/`.
- Gameplay, hitboxes, camera, road and UI unchanged. `?car=sprite` shows the old rear image for comparison.
- New test `npm run test:car`; preview shots with `npm run preview:car`. Details: `docs/3d-upgrade/05-step02-vehicle.md`.

## v4.0.1 — start of v4 (3D upgrade)

v4 is developed on branch `v4.0.1`, starting from the H5 web game v2.3.0 (same gameplay, UI, accounts and cloud save). Goal: much better 3D graphics. No gameplay changes in this version.

## v2.3.0 changes — accounts & cloud save

- **Settings → Account**: sign in with **Google**, **Apple** or an **email code**. Progress (rank, EXP, coins, specials, cars, missions…) is saved to the account and comes back after a reinstall or on a new phone.
- Every install is a guest account from the first launch; signing in keeps the guest's progress.
- A fresh phone that signs in takes the cloud save automatically; a phone with its own progress shows **"Which progress?"** (rank, EXP, coins, races side by side).
- Auto-sync a few seconds after every change and when the app goes to the background; finished races are queued while offline.
- **EXP is server-verified**: each EXP race is reported and re-computed on the server (distance × rate, impossible speeds rejected); a save can never raise EXP / rank. Pre-cloud progress is imported once.
- Server: `server/index.mjs` (+ `core.mjs`, `schema.sql`, README with the go-live steps). Cloud is off until `CLOUD.api` in `src/config.ts` (or `?api=`) points at it — until then Account says "coming soon".
- `tests/server.test.ts`: server EXP rules stay equal to the game's.

## v2.2.11 changes

- Speed levels each have their own colour: Easy green · Normal gold · Hard red (Home selector and the race HUD tag). Default stays Normal.

## v2.2.10 changes

- Home: the 6 side tiles are equal 50×50 squares; softer (thinner, fainter) borders on the tiles, the speed selector and the bottom row.

## v2.2.9 changes

- Home: side tiles smaller and all the same size (56×60); smaller, balanced type on the tiles, the speed selector and Garage / Shop / Missions.

## v2.2.8 changes

- Home rebuilt to the owner's mock-up: side tiles (icon + label in one glass tile: navy Daily / Ranks, bronze Bonus, teal Share, purple Entry, blue Launch with a rocket), star speed selector with a gold selected tile, deep-blue PLAY with neon rim and » chevrons, navy / purple / bronze Garage · Shop · Missions, gold-rimmed coin pill.

## v2.2.7 changes

- Home buttons back to exactly the owner's reference look (PLAY, Garage / Shop / Missions, top icons); the all-time #rank on the avatar stays. Other screens keep the glossy style.

## v2.2.6 changes

- Every button (result, pause, popups, bag, shop, settings…) uses the glossy 3D candy style of the Home buttons; dark/ghost buttons become glossy navy; round close/share/back buttons are glossy discs.

## v2.2.5 changes

- Home: all-time leaderboard position on the avatar (#N); Garage / Shop / Missions in the same glossy 3D style as the side buttons; bigger PLAY with a glow pulse and light sweep.

## v2.2.4 changes (owner round AA)

- **Retry** always works: the pre-race popups (special pick, Magic Bag, buy, confirm) now sit above the result / pause screens.
- Pause → Home ends the race and shows **its own result screen** (the race counts); old result screens never come back.
- Race HUD redrawn at the start of each race; shows **RACE** rank (this race), **YOU** (your profile rank), BEST and NEXT.
- FINISH card: bigger EXP, glowing "RACE RANK" plate. Share card is drawn in advance so the share sheet opens on tap.
- **EXP road feels like v1 again**: v1 coin lines (skip 18 %, up to 8 coins), road power-ups every 220–360 m, early phases with v1's mix (rings, beams, double blocks from rank D; traffic mixes, lasers, drones from C; gates from B). Bonus ~10 % more coins than the main road.

## v2.2.3 changes (owner round Z)

- **Speed**: the road speed now glides to every new target (level, rank phase, turbo, respawn) — no jolts; the race HUD shows the level (EASY / NORMAL / HARD tag).
- Race HUD: **NEXT** line = next rank + EXP still needed (under BEST).
- Quitting a race half-way → straight Home (never an old result screen, no ad).
- Coins: main road +20 %; Bonus road ~10 % above it, finish +300; fewer items on Bonus; mystery boxes only now and then.
- Bonus finish celebration (banner + coin shower + vibration).
- End-screen ad gives **+20 % coins** (was ×2).
- Brag card uses the transparent in-race car on a glow; Bonus card and leaderboard row spacing fixed.

## v2.2.2 changes (owner round Y)

- Flying through a **ring = double coins** for 8 s (HUD chip "coin ×2"); mystery boxes keep their random rewards.
- Normal and Hard another **+10 % speed** (Normal ×1.21, Hard ×1.5); EXP per metre re-calibrated (labels Easy ×1 · Normal ×1.05 · Hard ×1.7).
- Share card: car drawn from the transparent in-race render (aspect kept, soft glow); preview header fixed; "Save image" hidden inside preview frames (long-press the card).
- Share links work: Add-to-screen tiles (Add / Share / Copy Link / More) and "Share again" share or copy the game link; the link falls back to the page that embeds the game.
- Special pick popup and share popup spacing / cut text fixed.

## v2.2.1 changes

- Fix: opening the Tutorial card from Home and closing it left Home without its buttons (the card now opens over Home and closes back to it).

## v2.2.0 changes (owner fix rounds H–X, `docs/FIXLIST.md`)

- **Training**: no ad after training/practice; no shield or end coin line in basic training; end card with Race / Replay (or Practise again) / **Home**; replay repeats the same practice; HUD shows EXP + rank with a TRAINING tag (nothing saved); a **Skip ›** button during training; first Play opens the training card (Start / Skip).
- **Bonus**: 5-minute road, **one play per event**; normal items as usual; specials are a rare drop and each brings its own **set piece** (car walls, convoy, jam, blocked row, busy stretch, laser zone, tunnel) spawned only after the pickup; **tunnel sections** on every Bonus road (Tunnel Rider only there); finish +500 coins. `tests/bonus.test.ts`.
- **Rings & mystery boxes**: every ring gives a random reward; mystery boxes on the road and at trick spots (hop / duck at the right moment).
- **Beat your best**: best EXP + bar in the race HUD, two short cheers when close, "YOU BEAT YOURSELF!" banner when passed.
- **Roadster jump**: clears 4 car rows; the roll plays in slow motion with a camera swing. Turbo eases back to the chosen speed. Double score → **Double EXP**. Smaller pickup notices. No car outline for Magnet / ×2.
- **Speed levels** +5 % / +10 % / +15 % (Easy / Normal / Hard); EXP per metre re-calibrated (×1 / ×1.15 / ×1.9).
- **END → FINISH**; from rank C a **brag card** (rank shield, big EXP, car, Share). Real **share**: a 1080×1350 card image → share sheet, or a preview to save/copy when sharing is blocked. Entry steps open the profile; Share popup car = tap to share.
- **Leaderboard**: pyramid of bots (few AAA), RANK "#N" pill (top-3 colours), EXP with badge, header RANK · PILOT · EXP, glowing YOU row, "Top x%" for far positions.
- **Rank guide**: RANK · EXP · UNLOCKS (cars, Mega Rush, AAA specials, S/SS/SSS roads); opens on top of the result screen.
- **Magic Bag**: always shows SOS / Roadster / HYPER with counts, "Race without a special", confirm popup before taking one, separate **Buy items** popup; starting kit 1 HYPER + 2 Roadster (+1/+1 once for everyone).
- **Home / profile**: no language button (Settings only), clean profile chip, no Bonus strip / speed line, bigger Play; profile shows a big rank shield + big EXP; avatar effects from rank A (glow → gold pulse → neon ring → flame ring).
- **Missions** are their own screen again: career chains with tiers + pilot level, auto-collect or manual claim / Claim all; **Daily** pool of 15 fun challenges.
- **Garage**: car sits lower, Zenith thumbnail = in-race car, MORE card for S/SS/SSS cars.
- Spacing rhythm for every popup; avatar SVG ids made unique (empty avatars fixed); "Eye comfort" setting explained.

## v2.1.0 changes (owner fix list — all of `docs/FIXLIST.md`)

- **Before every race (Retry too)**: one big SPECIAL button → the Magic Bag opens to pick; "Get with coins" at the bottom. Prices SOS 1,200 · Roadster 1,800 · HYPER 4,000.
- **Hearts**: 1 heart per EXP race, a heart on the road about every 1,000 EXP (max 3); then 2 ad revives; 3rd crash ends the race.
- **Endless never repeats before AAA**: 12-world ladder by EXP (2 per rank): Future City → Neon Harbor → Cloud City → Solar Farms → Neon Tunnel → Crystal Canyon → Space Zone → Asteroid Belt → Megacity → Storm Front → Volcano Core → Aurora Ice; loops after AAA. Each world has its own obstacle looks (same hitboxes).
- **Bonus**: themed props per place (rocks / barrels / pickups, logs / logging trucks, hay / fences / tractors, buoys / crates / boats); showcase specials smash what they pass and pull coins in; Phase Ghost is a steady hologram; a closed Bonus can't be retried.
- **Cars**: new rank-C car **XWAVE Vega** (owner's render, own rear sprite); B+ cars are black silhouettes; v1 coin-bought cars above the rank are re-locked and refunded.
- **UI**: new logo, new emblem avatars, "EXP" pill badge, END screen (EXP + rank reached + leaderboard position), minimal revive popup, Daily = coins only with a 4 + 3 check-in grid (fits 375×640), Near Miss removed, Cups / Trophies / XWAVE Pass leftovers removed, tracks 3–5 open at S / SS / SSS, rival cards show average EXP, shorter texts everywhere, rank-gate strip above the mission strip, rank-up notices jump the queue.

## v2.0.8 changes (v2 step 8 — daily missions & coin balance)

- **Daily + Missions merged**: one daily list (4 missions a day, chests at 30 / 70 / 100 pts) that pays coins; the home "Missions" button opens it. The in-race strip shows the next unfinished daily mission with live progress. The old per-run mission system no longer pays (waiting rewards were moved to the wallet).
- 7-day check-in pays coins 100 → 400, day 7 = 600 coins + 1 Roadster Jump. New missions: "Earn 1,500 EXP in one race", "Use a special" (SOS counts), "Drive 5,000 m"…
- Coin balance (`COIN_LINES` in config): Endless ≈ 25–40 coins / min before the speed-level coin bonus (a special costs 2,000–6,000), Bonus roads ≈ 2× denser.
- XWAVE Pass row hidden; new UI text translated (FR / JA / PT / DE / ES).

## v2.0.7 changes (v2 step 7 — Bonus events replace cups)

- **Bonus** opens every 2 hours (local 00:00, 02:00, …) for 60 minutes, in a new everyday place each time: **Desert Highway · Pine Forest · Country Road · Ocean Causeway** (new daylight scenery: scrolling sand / grass / fields / sea ground, cacti, mesas, pines, barns, windmills, palm islets, boats, a lighthouse). `meta/Bonus.ts`, `BONUS_WORLDS`.
- A Bonus road is a 30-minute course with a FINISH line (length computed from the speed level), coins only (no EXP, no ranking), finish bonus 800 × coin multiplier. HUD shows "BONUS COINS".
- Specials lie on the road and **fire by themselves**: Roadster, HYPER, and the AAA teasers — **Wall Run** (car rides the side wall), **Tunnel Rider** (upside-down on the roof), **Sky Rail** (glides above the road), **Phase Ghost** (flickers through obstacles).
- Home: the cup strip and rail button became **Bonus** (open now / next opening); the Bonus card explains the rules. Old cup results are no longer shown.

## v2.0.6 changes (v2 step 6 — new training)

- First **Play** starts the training straight away (~60 s): left / right / up / down, coins, road power-ups, then the free Roadster Jump from the bag over a car block. Hints explain distance = EXP, coins buy specials, one special per race, ranks and rank gates.
- The end card explains EXP → rank; "Race Endless" goes to the track list. The per-world advanced trainings are gone (special-item practice stays in the Tutorial hub).

## v2.0.5 changes (v2 step 5 — revive & ads)

- **Revive only by rewarded ad, max 2 per race** ("Revives left 2 / 2 · the 3rd crash sends you back to Start"). Coin continues are gone.
- The race-end interstitial now follows every finished race (after the first 2 runs, ≥45 s apart, 30 s grace after a rewarded ad); **Remove Ads** turns it off.

## v2.0.4 changes (v2 step 4 — specials & coins)

- **Specials** (SOS 2,000 · Roadster 3,000 · HYPER 6,000 coins): bought with coins, kept in the Magic Bag, **one per race**, picked in a popup when you tap a track (or "No special"). The special leaves the bag only if you use it. Empty slot → "Out — get one with coins" + Buy (not enough coins → shop). New players get 1 Roadster.
- Teaser specials (Tunnel Rider, Wall Run, Phase Ghost, Sky Rail) shown blurred, "opens at AAA".
- Specials and extra lives no longer appear on the Endless / Track 2 road; Magnet, Shield, Turbo and ×2 coins pickups stay (same strength for everyone, `V2_POWERUPS`).
- **Shop sells only coins** (1,000 $0.99 · 6,000 $4.99 · 13,000 $9.99 · 30,000 $19.99) + Remove Ads. XWAVE Pass, Starter Pack and bundles are gone.
- Old saves: retired items (Shield, Turbo, Magnet, ×2, Extra Life) and garage upgrades are refunded as coins once (`save.v2`).

## v2.0.3 changes (v2 step 3 — tracks & cars)

- Track list: **Endless** (the rank road D→AAA, at the speed level you pick), **Mega Rush** (Track 2, opens at AAA: starts two phases harder, EXP ×1.25, the only road to **S / SS / SSS** = 65,000 / 85,000 / 110,000 EXP), and three "coming soon" teasers. The 20 old courses are retired from the UI.
- Endless is no longer forced to HARD — the speed selector (EXP ×1 / ×1.15 / ×2) applies.
- Player rank = Endless best (capped at AAA) or Track 2 best (S tiers). `playerRank()` in `meta/Rank.ts`, `save.exp2Best`.
- **Cars unlock by rank only** (Zenith D · Volt B · Phantom A · Inferno AA · Nexus AAA), no coin price, no score bonus — they are trophies; the garage no longer shows upgrades.
- Tests: EXP calibration and rank-phase/autopilot tests cover Track 2 (624 km through all gates, 0 crashes).

## v2.0.2 changes (v2 step 2 — difficulty phases & rank gates)

- **Endless difficulty climbs by rank phase** (`PHASES` in `gameplay/Difficulty.ts`), measured in EXP so every speed level meets the same phase at the same minute:
  D single blockers · C two-lane blocks + beams/barriers · B combos, vehicle + blocker, lasers, platforms · A one safe lane, mega gates, road +6 % · AA rhythm chains, road +10 % · AAA everything, road +14 %.
- **Rank gates**: the last 30 s before each new rank is the hardest stretch (next phase's mix, hard tiers ×1.45) with a "RANK GATE" strip + notice on the HUD; 8 s of easier road after it.
- Rank thresholds re-calibrated for the phase speed-ups: AA 26,000 · AAA 40,000 EXP.
- No Roadster car-blockade on Endless (no obstacle there needs a special item).
- Test shortcut: `?rank=B` (C/B/A/AA/AAA) starts Endless just before that rank gate; that run's EXP is not saved.
- `tests/phases.test.ts`: whole ladder D→AAA reachable on all speed levels, difficulty rising phase by phase, gates harder than their phase, autopilot drives 240 km through all gates with 0 crashes.

## v2.0.1 changes (v2 step 1 — EXP & rank)

v2 redesign per `docs/GAME-DESIGN.md` (the old game lives on the `v1` branch).

- **EXP** = distance × speed-level rate (Easy 0.2 · Normal 0.23 · Hard 0.4 per metre, `EXP` in `config.ts`). Player EXP = best single run, never summed. Calibrated by `tests/exp.test.ts`: C/B/A/AA/AAA at 3/7/12/20/30 min on Hard, ×2 Normal, ×3 Easy.
- **Ranks** D→AAA = EXP 0 / 3,000 / 8,000 / 15,000 / 25,000 / 38,000. New shield logo and shield-shaped rank plates (no more star icon).
- HUD shows the run's EXP + the rank it has reached; in-run notice on each new rank and on beating your best.
- Game over, profile, leaderboards (week / all time) and the rank guide all use EXP. Car / track / boost locks read the EXP rank.
- Rank stars (bolts) are no longer awarded; old saves start v2 at rank D. Score/combo pops removed from the HUD.

## v1.19.1 changes

- **Magic Bag** only in Profile (home top bar freed for the avatar chip).
- **Fix**: dying with Turbo / Shield no longer leaves a glow or dome on the car after restart (`Vehicle.resetFx`, FX targets only while racing).
- **Side walls**: glass barrier with light strips and posts on both road edges, scrolling with speed.
- **Rear tyres** (owner's realistic-rotation prompt, done in Three.js): tread layers masked from the original PNG, scroll exactly synced to ground speed / tyre circumference (both wheels identical), blur only on the tread (outline sharp), free spin decay in the air, landing kick, accel/brake pitch, 1–3 px suspension, restrained turbo rumble. Tyre grit removed.

## v1.18 changes

- **Notices**: toasts and section banners share one lane under the HUD (max 2 toasts), long text wraps.
- **Guide modal**: one detail open at a time; header + close button pinned; tap the backdrop to close.
- **Training**: lane-change lessons (Mega Gate, Laser Wall, Traffic, Asteroid) aim the prompt from the car's real lane.
- **Garage**: 5 XWAVE cars (Zenith Common → Nexus Mythic) with rear-view art, stats and a +0–25 % score bonus. Cars unlock in order (class + coins). The next car shows in colour; later cars are black silhouettes with "Reach class X". Old cars map to the new line-up.
- **Tracks**: 20 tracks (5 worlds + 15 harder remixes). Each unlocks by score on the previous track; tracks 11–20 need class A (the Rank A gate). Endless is always HARD.
- **Reward popups**: Entry, Launch, Share, Add to Screen, Revisit Gift, Invite, Rate, No Connection and the 7-day Daily list, redrawn with illustrated SVG art (`src/ui/art.ts`). The Entry button stays after claiming and links to Daily, Shop, Garage, Tutorial, Race and Cups.
- **Wheels**: spoked rear rims with rotational blur. The spin is capped per frame, so it never strobes backwards.
- **Avatars**: 32 new pilot portraits. The rank badge on the home profile chip is no longer duplicated.
- **Country**: auto-detected (IP, then time zone / language), editable in Profile; your flag replaces the star on leaderboards.
- **Magic Bag**: item inventory with rules and which item fits which track; reachable from the home bar, Profile and track select. Big-reward tracks add items to the bag on a 2–3★ finish.
- **Tutorial**: one hub for basics, special-item practice and advanced worlds.
- **Economy**: every item can be bought singly for coins (`ITEM_PRICE`), and bundles are priced to beat coin packs. The shop shows each bundle's coin value. See `docs/ECONOMY.md`.

## v1.17 changes

**ROADSTER button**
- Training: tapping ROADSTER before the blockade no longer does nothing silently. The button gives a small nudge and a toast ("Save it! Tap ROADSTER when the button lights up"), and the charge is kept for the blockade.
- The button lights up (steady purple / gold glow, slightly larger, label "TAP!") whenever a Roadster or HYPER jump is the way through the row ahead. This also covers the training step. Steady glow, no flashing.
- Fixed: the count badge on the ROADSTER and SOS buttons always showed "1". The HUD wrote to `data-h` but the badges only had `data-k`.

**Unused boosts become points**
- When a track is finished, every Roadster Jump, HYPER JUMP and Sky Escape still held is converted to score (`LEFTOVER_POINTS` in `config.ts`: 1,500 / 3,000 / 1,000 × the run's score multiplier). A "+points · UNUSED BOOSTS" pop and a toast show at the line, and the result screen has an "Unused boosts" row.

**Wheels at speed**
- Rear-tyre tread on the X1 render now moves at most `TYRE.maxStep` of a block per frame. Before, it moved about 0.3–0.7 of a block per frame, so the eye read it as standing still or rolling backwards (wagon-wheel effect).
- The extra speed now shows as a longer 5-tap motion smear, brighter streaks, and grit kicked back from both rear tyres (`TYRE` in `config.ts`). The 3D bodies' wheel blur disc is stronger.

## v1.14 changes

**Panels fit the phone**
- Every overlay was measured at 375×640 and now fits on its own; anything still too tall shrinks to fit.
- Settings: 6 toggles in a 2-column grid, a language row and 4 small buttons. Name and avatar moved to the profile.
- Roadster guide, rank guide, pilot training, boost info and profile were all tightened.

**Loading screen**
- Full key-art screen, with the logo kept visible at the top.
- Progress bar sits on a soft bottom gradient.
- Stays up for at least 2.2 s.

**Jump feel**
- A normal hop now rises higher on screen (visual peak 3.35 instead of 2.85). The camera follows the hop only a little, so the car clearly clears the obstacle.
- While it is above the obstacles, the car is drawn over them, so it no longer looks like it passes through.
- Ducking keeps the wheels on the road: the body squashes instead of sinking into the asphalt.

**Wheels and visuals**
- The rear-render tyres roll: tread bands scroll with road speed, plus a light speed sheen.
- The car's brightness gain is lowered, so it no longer blooms or looks soft.

**Languages**
- English, Français, 日本語, Português (BR), Deutsch and Español (`src/ui/i18n.ts`).
- Pick one from the flag button next to Settings, or from Settings ▸ Language.
- Fixed UI labels are translated; dynamic sentences stay in English.

## v1.13 changes

**XWAVE X1 drawn from the studio renders**
- The rear view (`src/assets/images/car/x1-back.webp`) is cut out of the checkerboard.
- 7 more views come from the design sheet (front, back and both sides, plus the four 45° corners), with 2 corner views mirrored.
- The car is a camera-facing billboard that picks the view by viewing angle. Racing always uses the high-res rear view, which banks and barrel-rolls with the car.
- A soft contact shadow sits under the car.
- The other GT colourways recolour the body paint in the shader.

**Home screen**
- Popups now sit above everything, with a dimmed and blurred background.
- Shop moved next to Garage (Garage · Shop · Missions).
- Share took Shop's place at the top of the right rail.

## v1.12 changes: Sky Roadster

**Branding**
- New name: Sky Roadster.
- New logo, with its white background removed.
- Full-screen loading art.
- New app icon (1024 px, plus 512, 192, 180, 32 and maskable sizes).

**Rank** is shown with a gold star.

**No scrolling on phones**
- Every overlay panel shrinks to fit the screen.
- The result screens are compact: one row of 4 stats, a single coins line with its breakdown, a single rank line with the class bar, and chips for week, cup and quests.

**Crash tips**
- After a crash, `CrashTip.ts` works out the move that would have passed: hop, duck, the open lane, or SOS.
- The tip shows on respawn, on the continue screen and on game over.

**Vibration**
- One short pulse on hop, landing, flip, Roadster, HYPER, Sky Escape, turbo and crash.
- Can be switched off in Settings ▸ Vibration.

**Shield**: a soft cloud of light motes hugging the car's shape. No flicker.

**XWAVE X1 v2 car**
- Smooth body lofted from cross-sections, with the wheels inside the fenders.
- Black glass canopy, full-width red light bar, XWAVE rear panel, finned diffuser.
- Wheel spin is readable and the blur is light.
- The hidden fans puff air only on take-off and landing. A continuous jet appears only on rocket flights.

**Popups** (rewards in coins)

| Popup | How it's opened |
|---|---|
| Entry reward (300) | Side button |
| Launch reward (300) | Side button |
| Share (300 per day) | Side button |
| Invite (100) | Link in the Share popup |
| Rate us | Asked once after 8 runs; no reward |
| Add to screen | From Launch, uses the install prompt where supported |
| No connection | When the device goes offline |
| Daily | Unchanged |
| Watch-ad | Unchanged |
| Welcome back | Unchanged |

**Home screen**
- The guide is now a small tutorial icon next to Settings.
- The Free button is removed.
- The speed tooltip floats above the menu.

## v1.11 changes: eye comfort, controls, X rank points, reward popups, player DB

**Nothing flashes, ever.**
- Removed: full-screen flashes, the shield shimmer and blink, the invulnerability blink, turbo/boost glow on the car and bloom spikes, magnet pulse rings, the finish rings, street-lamp glow halos, and every looping CSS pulse/blink.
- Protection now shows as a steady soft bubble that fades smoothly in its last 2 s, plus the HUD chip.

**Controls**
- Landing is responsive. An UP swipe made in the last 0.34 s before touchdown fires the moment the wheels land, with only a 0.03 s rest instead of 0.12 s.
- A lane swipe made just before landing steers on touchdown.
- Training: the car only takes input when a training prompt is on screen.
- The Roadster / HYPER Jump has its own HUD button (keys R or Shift). A swipe UP is always a normal hop.
- If a training step needs a rocket you don't hold, a sheet offers: use one you own, buy one for 250 coins, or retry.
- The small hint arrow sits in the top-right corner whenever a hard moment is coming.

**X-Points (rank)**
- Shown with the XWAVE "X" badge.
- Result screens list every reward: coins, speed bonus, track reward, missions, quests, X-Points with a breakdown, the class progress bar, and rank-ups.
- "How rank works" opens the conversion table.
- Rank can't be bought: no product, pass or ad grants X-Points.

**Speed tiers**

| Level | Rewards (coin bonus, track reward, X-Points) |
|---|---|
| EASY | ×1 |
| NORMAL | ×1.25 |
| HARD | ×1.6 |

Tapping a level shows a tooltip.

**Popups**
- Daily reward (7 days)
- Watch-ad reward
- Welcome-back gift: 200 coins + shield after 12 h away

**Roadster guide**: tap a step for full details.

**Sliding platforms**: no arrows, and they appear much less often.

**Player database**
- `src/net/PlayerStore.ts`: bots and real players share one players/scores model, stored locally today.
- `?api=` switches to the reference server in `/server` (`index.mjs`, `schema.sql`, README).

## v1.10 changes — classes, ⚡ bolts, cups by division

**Rank classes** (`src/meta/Rank.ts`): every pilot starts in **D** and climbs D → C → B → A → AA → AAA with ⚡ bolts (cup points). No demotion.

| Class | D | C | B | A | AA | AAA |
|---|---|---|---|---|---|---|
| ⚡ needed | 0 | 150 | 450 | 1,100 | 2,400 | 4,800 |

**Earning ⚡**: +1 per 1,000 score, +1 per 10 near misses; finishing a track +2 (+1 per star); ×2 while racing in your live cup; cup placement prizes (below) × division multiplier (D 1, C 1.2, B 1.4, A 1.7, AA 2, AAA 2.5).
The ⚡ total sits top-right in the HUD (gold, steady glow — nothing blinks while racing).

**Cups** (`src/meta/Events.ts`): 2 sessions per day at **12:00 and 22:00 US Eastern** (DST-aware), live 3 h. Each session runs one cup per class; a pilot can only enter the cup of their own class. Base prizes: #1 120⚡ + 3,000 coins + HYPER ×3 + gold trophy · #2–3 80⚡ · #4–10 50⚡ · top 100 25⚡ · everyone 10⚡ + Roadster Jump.

**Profile**: tap the home chip → editable name, racing-helmet avatars (24 liveries, re-roll), class progress, stats. Leaderboard/cup rows open a pilot card. Rivals are demo data until an online backend is connected.

**Boosts**: tapping a boost opens its card (what it does / how / when) with Equip and a free **practice road** (`boostScript()` in Tutorial.ts).

**Missions**: auto-collect switch (default ON); OFF keeps finished rewards in a "Ready to collect" list.

**Worlds**: listed easiest → hardest (World 1–5), Endless is World 6, then 3 hidden worlds that reveal at class A / AA / AAA.

**Defaults**: graphics HIGH, music ON, SFX ON (settings migration rev 3). Music is original procedural Web Audio (no samples) → safe for commercial use.

**Difficulty**: triple walls removed; laser rows always keep one open lane with at most one duck lane; after any jump/duck row there is extra landing + reading time (`VERTICAL_RECOVERY`). Road arrows are smaller. Eye comfort: no screen flashes, no pulsing neon, steady lights.

## v1.9 changes

- New default car body **XWAVE X1** (design sheet): low angular hypercar on the same one-lane footprint — wide wheel arches and rear haunches, black panoramic canopy, V-shaped blue LED face with a blue lip, black lower body with blue LED lines, full-width red light bar and glowing blue XWAVE lettering on the rear fascia. The four wheel/thruster pods still spin and flip to thrusters in flight. All GT Coupe colourways use the X1 body.
- The car stays upright and points straight down the road (bank on lane changes cut to a light lean, almost no yaw).
- **One lane per hop**: while airborne the car can change lane once, then it must touch down. Exception: took off from the left/right edge lane holding an **Air Dash** booster → a second swipe in the same direction carries it to the far edge with a 360° flip (consumes the charge). A refused swipe shows "LAND FIRST". The fairness model and the test bot use the same rule (`tests/airlane.test.ts`).

## v1.8 changes

- Obstacles are matte (no neon glow halos / bloom): solid colours, thin non-glowing outlines.
- The hunter drone is removed from the game (no spawns, not in training); the floating ⇠ ⇢ sign is gone (sliding platforms keep their amber zone on the road).
- ~~Air flip on two lane changes without a booster~~ (replaced in v1.9 by the one-lane-per-hop rule).

## Difficulty system (v1.7)

`src/gameplay/Difficulty.ts`

- **Pattern library** — every spawner pattern has an id (P01–P15), tier, solving actions, minimum lead time, recovery time, an "occludes" flag and the worlds it may appear in.
- **Tiers** — T1 easy (weight 1) · T2 normal (2) · T3 hard (4) · T4 expert (7). Examples: crate/barrier/ring = T1; beam, two blockers, oncoming car, slow drone = T2; sliding platform, laser gate, triple wall = T3; mega gate (one door) = T4.
- **MapDifficultyConfig** per world: tier distribution, max fully-blocked lanes, min time gap, reaction slack, max consecutive hard rows, recovery after hard rows, density, moving-obstacle speed, warm-up distance.

| Map | Target | T1 / T2 / T3 / T4 | Notes |
|---|---|---|---|
| Future City | 2/10 | 75 / 25 / 0 / 0 | learning map: no lasers, walls or gates; slow drones |
| Cloud City | 4/10 | 55 / 35 / 10 / 0 | vertical obstacles, platforms rare |
| Neon Tunnel | 6/10 | 35 / 40 / 25 / 0 | lasers + triple walls |
| Space Zone | 8/10 | 20 / 35 / 35 / 10 | asteroids, drones, first gates |
| XWAVE Megacity | 9/10 | 10 / 25 / 45 / 20 | everything, clearly telegraphed |

Endless runs and the track list now follow this ladder (City → Cloud → Tunnel → Space → Megacity).

- **Selection** — tier first (map mix, damped in the first 30 % of a map, slightly raised in the last 25 %, shifted one step by EASY/HARD), then a pattern of that tier.
- **Spacing** — time-based: base curve, floored by the map's min gap × speed level, plus the pattern's own lead time (walls/gates/lasers get time to align) and recovery after T3/T4 rows.
- **No blind traps** — after a wall that hides the road (mega gate) the next row is T1–T2 with recovery spacing; hard streaks are capped per map.
- **Time-aware validation** — `Fairness.step()` tracks every (lane, height) state through each row using the real lane-switch / fly-up / fly-down / re-jump timings, now with a per-map **reaction slack** each forced move must leave. Candidates that fail are rejected and regenerated (reasons are counted).

### Readability & comfort

`src/render/Readability.ts` — one profile per world (lane glow, road tone, reflections, rail glow, hazard outline colour, dark-metal lift, bloom). Colour language: red/orange = danger, yellow = caution, cyan = navigation, green = safe opening, gold = collectible, purple = special. Cloud City lane glow −55 %, Neon Tunnel gets strong orange hazard outlines on lighter obstacle metal, asteroids get rims. **Comfort visuals** (Settings, on by default) lowers bloom, softens full-screen flashes, pulsing and speed lines.

In-world previews: yellow/black caution bar ~30 m before every T3+ row; mega gates paint the closed lanes red-hatched and lead into the door with green arrows; moving obstacles keep their ⇄ zones and green safe-lane arrows.

Guidance overlays: danger hints are a thin, ~34 %-opacity chevron at the screen edge on the side of the move (↑/↓ at the bottom), fade the moment the move is made, and a gesture stops being hinted after the player has answered it 3 times (toggle hints off/on in Settings to reset). Training prompts are a compact card in the sky area under the HUD; section banners are small and high.

### Rendering

The bloom composer now renders into an **MSAA target** (4×, WebGL2) — previously the canvas `antialias` flag was ignored behind post-processing. Pixel ratio cap 2.0 with **dynamic resolution steps** (2 → 1.75 → 1.5, then bloom off, only then LOW) instead of dropping straight to LOW; anisotropic filtering 8×; tighter, high-threshold bloom (0.3 / radius 0.22).

### Debug & tests

`?debug` shows map + target difficulty, speed level, the next row's pattern id / tier / time-to-collision / safe lanes (N/H/L) / reaction margin, the last collision explained, plus hitboxes. `npm test` runs:

- `tests/fairness.test.ts` — static reachability + a physics bot driving 144 km endless, all 5 tracks and 3 speed levels (0 crashes).
- `tests/difficulty.test.ts` — ~30,000 rows in 360 generated sequences (5 maps × 3 levels × 24 seeds): reachable path, allowed tiers per map, no expert in warm-up, min gaps, recovery after walls, no blind traps, hard-streak caps; prints the observed tier mix vs target and rejection reasons.

## Fairness guarantee

The game never generates an unavoidable pattern:

1. Every obstacle's hitboxes **and** the set of heights that pass it are defined once, in `src/gameplay/ObstacleRules.ts`. Runtime collision and the spawner read the same data.
2. The spawner (`src/gameplay/Spawner.ts`) tracks the set of `(lane, height)` states the player can be in, and only accepts a new row if at least one state is reachable in the time available (`src/gameplay/Fairness.ts`, using lane-step and vertical-action budgets from `config.ts`). Rejected patterns are re-rolled; the fallback is always a single dodgeable crate.
3. `npm run test:fairness` checks this statically (15k+ rows over 40 seeds) and dynamically: an autopilot using human inputs drives the real movement physics against the real hitboxes. Last run: **600 km across 40 seeds at up to max speed, 0 crashes.**

## Architecture

```
src/
  config.ts            all tuning: lanes, heights, timings, speed curve, fairness budgets, scoring
  main.ts              bootstrap + WebGL check
  Game.ts              state machine & orchestration (menu → countdown → run → crash/respawn → game over)
  core/                Input (swipe/keys), Save (localStorage), Pool, Rng, math/springs
  gameplay/            PURE LOGIC, no Three.js, runs in Node:
    Player.ts            movement state machine (lanes, LOW/NORMAL/HIGH phases, buffering, hitbox)
    World.ts             scrolling simulation, swept-AABB collision, near-miss, pickups
    Spawner.ts           pattern generator + speed curve + world sequence
    Fairness.ts          reachability model
    ObstacleRules.ts     hitboxes + pass masks (single source of truth)
    Run.ts               score, combo, power-ups, lives
    Missions.ts          mission defs + tracker
    Autopilot.ts         bot (tests / demo)
  render/              Three.js views (read-only consumers of gameplay state)
    Vehicle.ts           procedural XWAVE car + animation rig + skins
    ObstacleViews.ts     pooled obstacle meshes
    PickupViews.ts       instanced coins + power-up meshes
    Track.ts             scrolling road, instanced lamps & pylons
    Scenery.ts           sky, fog, lights, 5 world themes (lazy-built)
    Effects.ts           particles (1 draw call), speed lines, shield, rings, debris, portal
    CameraRig.ts         chase / menu / garage / crash cameras, FOV kick, shake
    Renderer.ts          renderer, tone mapping, half-res bloom (High quality)
    textures.ts          canvas-generated textures
    merge.ts             static-mesh merging for draw-call reduction
  audio/Audio.ts       Web Audio synth SFX + synthwave sequencer
  ui/                  DOM overlay UI (screens, HUD, garage, missions), CSS, inline SVG icons
  assets/              manifest + loader for optional GLB/audio replacements
public/assets/         drop-in folders for replacement files (see below)
tests/                 fairness & movement tests
```

The car is fixed at `z = 0` and the world scrolls toward it, which keeps float precision perfect on very long runs.

## Performance notes

- Target 60 FPS on modern phones. High quality = MSAA + half-resolution bloom, pixel ratio ≤ 2. Low = no bloom/MSAA, pixel ratio ≤ 1.25. The game drops to Low automatically if it can't hold ~42 FPS, and Low is the default on devices with ≤ 4 CPU cores.
- About 130–160 draw calls in a busy scene (Low). Coins, buildings, lamps, pylons and background traffic are instanced; all particles are a single `Points` draw; static parts of the car and obstacles are merged per material.
- Object pools for obstacles and power-ups; modulo-scrolled props (no spawning); world themes built lazily, ~300 m before they're needed.
- Fixed 120 Hz collision sub-steps + swept AABBs, so no tunnelling at top speed or on slow frames.

## Branding assets

- `src/assets/images/xwave-logo.png` / `xwave-mark.png` — XWAVE chrome logo (UI, billboards, car decals, Megacity arch)
- `src/assets/images/tracks/*.jpg` — track-select thumbnails
- `public/icons/` — app icon: `icon-1024.png` (1024×1024 master), 512/192 PNGs, maskable 512, `apple-touch-icon.png` (180), `favicon-32.png`; `public/manifest.webmanifest` makes the game installable ("Add to Home Screen")

## Replacing procedural assets

See `src/assets/manifest.ts`. Each entry lists its procedural builder and an optional `file`. Put a file in the matching `public/assets/<category>/` folder, set `file: 'assets/<category>/<name>.glb'` and it is loaded at boot, falling back to procedural automatically if it's missing. Car GLBs replace the body shell; thruster pods, wings and VFX stay procedural so the animations keep working. Conventions: +Y up, −Z forward, metres.

Audio: set `file` on any SFX id (`coin`, `crash`, `power`, `up`, `down`, `lane`, …) to override the synthesized sound.

## Tuning cheat-sheet (`src/config.ts`)

- `TIMING`: lane-change time, fly up/down phase durations, input buffer windows
- `HEIGHT` / `CAR_HALF`: car heights and hitbox (keep `ObstacleRules.ts` in sync if you change these)
- `SPEED`: start / max speed and ramp distance
- `FAIRNESS`: time budgets the spawner assumes a human needs (raise for an easier game)
- `SCORE`, `POWERUP_DURATION`, `WORLD_LENGTH`

After changing timings, run `npm run test:fairness`.
