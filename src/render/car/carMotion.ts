/**
 * Pure, allocation-free motion helpers for the 3D car (no Three.js, no DOM — unit-tested in Node).
 * Every smoothing step is exact exponential decay, so the result after a given time does not
 * depend on the frame rate.
 */

/** move `cur` toward `target`; rate (1/s) differs for rising and falling */
export function approach(cur: number, target: number, rateUp: number, rateDown: number, dt: number) {
  const rate = target > cur ? rateUp : rateDown;
  return target + (cur - target) * Math.exp(-rate * dt);
}

/** smoothstep easing of a 0..1 value */
export function ease(k: number) {
  const t = k < 0 ? 0 : k > 1 ? 1 : k;
  return t * t * (3 - 2 * t);
}

/** active spoiler: 0 = flush, 1 = fully raised. Raised while nitro runs, retracts after it ends */
export function spoilerStep(k: number, nitro: number, dt: number, up = 5, down = 2.2, threshold = 0.05) {
  return approach(k, nitro > threshold ? 1 : 0, up, down, dt);
}

/** visible wheel rotation this frame (rad): road speed / radius, capped so 10 spokes never strobe */
export function wheelStep(speed: number, radius: number, dt: number, maxStep: number) {
  return Math.min((Math.max(0, speed) * dt) / radius, maxStep);
}

/** spoiler controller state (mutated in place — no per-frame allocation) */
export interface SpoilerState {
  /** 0 = flush … 1 = fully raised */
  k: number;
  /** seconds the spoiler stays up after jump and nitro both ended */
  hold: number;
}

/**
 * Step 06.5 active spoiler — AUTHORITATIVE RULE: it opens only while the car is airborne (gameplay
 * flight state: jump take-off → air → descent, AIR DASH, Roadster / HYPER / SOS flights) and starts
 * closing at ground contact, all the way to flush. Turbo / nitro, Shield, Phase Ghost never open it
 * on the road. `holdTime` (default 0) = optional delay after touch-down.
 */
export function spoilerUpdate(s: SpoilerState, airborne: boolean, dt: number, up = 5, down = 2.2, holdTime = 0) {
  s.hold = airborne ? holdTime : Math.max(0, s.hold - dt);
  // opening: quick ease-out; closing: a steady stroke of 1/down seconds (the hinge angle is ease(k), so
  // it still starts and stops softly) that always ends exactly flush — no residual gap
  if (airborne || s.hold > 0) s.k = approach(s.k, 1, up, down, dt);
  else s.k = Math.max(0, s.k - dt * down);
  return s.k;
}

/** the gameplay flight state the spoiler follows (Player: vmode 'up' or above road height) */
export const isAirborne = (vmode: string, y: number, normal: number) => vmode === 'up' || y > normal + 0.05;

/**
 * Height of the car's visual pose origin (Vehicle.root.y) for a gameplay height y. The visual body
 * underside is `y_root − road` (road = 0.51: wheels on the asphalt at NORMAL).
 *   legacy: LOW → NORMAL the wheels stay on the road (0.3 … 0.51); NORMAL → HIGH a linear climb
 *           to 3.35 (the pre-v4.1.3 mapping, still used by the rear image).
 *   aligned (3D car, v4.1.3): additionally, within `ramp` m of leaving the road the underside is
 *           lifted to at least the hitbox underside (y − halfY), so an obstacle the hitbox has just
 *           cleared is visibly below the car. Continuous, and identical on the road.
 */
export function carHeight(y: number, low: number, normal: number, high: number, halfY: number, aligned: boolean, ramp = 0.45, road = 0.51) {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * (t < 0 ? 0 : t > 1 ? 1 : t);
  let vy = y <= normal ? lerp(0.3, road, (y - low) / (normal - low)) : y <= high ? lerp(road, 3.35, (y - normal) / (high - normal)) : 3.35 + (y - high);
  if (aligned && y > normal) {
    const s = ease((y - normal) / ramp);
    const want = y - halfY + road; // root height that puts the visual underside on the hitbox underside
    if (want > vy) vy += (want - vy) * s;
  }
  return vy;
}
