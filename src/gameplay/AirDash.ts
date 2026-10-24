/**
 * Step 06.5 AIR DASH — pure helpers shared by the spawner (placement safety) and the game (runtime
 * landing check). No Three.js / DOM: runs in Node tests.
 */
import { AIR_DASH, CAR_HALF, HEIGHT, LANES } from '../config.ts';
import type { LiveObstacle } from './World.ts';

/** seconds from pickup to touch-down (no extension), when picked up driving on the road */
export const airDashFlightTime = () => AIR_DASH.exec + AIR_DASH.hold + AIR_DASH.recover;
/** the opposite outer lane (the only allowed destination) — null from the centre lane */
export const airDashDest = (lane: number) => (lane === 0 ? 2 : lane === 2 ? 0 : null);

/**
 * Is the destination lane free for a touch-down `tl` seconds from now? Checks every obstacle box that
 * blocks a car driving at NORMAL height in that lane (moving obstacles: over their whole sweep, i.e.
 * conservatively) against the window [tl − clearBehind / v, tl + clearAhead].
 */
export function landingClear(obstacles: readonly LiveObstacle[], lane: number, tl: number, speed: number): boolean {
  const v = Math.max(1, speed);
  const x0 = LANES[lane] - CAR_HALF.x, x1 = LANES[lane] + CAR_HALF.x;
  const y0 = HEIGHT.NORMAL - CAR_HALF.y, y1 = HEIGHT.NORMAL + CAR_HALF.y;
  const t0 = tl - AIR_DASH.clearBehind / v, t1 = tl + AIR_DASH.clearAhead;
  for (const o of obstacles) {
    if (o.smashed) continue;
    const moving = o.spec.lane2 !== undefined;
    const lanes = moving ? [o.spec.lane, o.spec.lane2!] : null;
    for (const b of o.boxes) {
      const xHit = moving ? lanes!.includes(lane) : b.maxX > x0 && b.minX < x1;
      if (!xHit || !(b.maxY > y0 && b.minY < y1)) continue;
      // boxes are already in world z (World.placeObstacle); they move +v and overlap the car's z range
      // while the box is inside [−halfZ, +halfZ]
      const za = b.minZ, zb = b.maxZ;
      const ta = (-CAR_HALF.z - zb) / v, tb = (CAR_HALF.z - za) / v;
      if (tb >= t0 && ta <= t1) return false;
    }
  }
  return true;
}

/**
 * Runtime side of the maneuver (Game + tests): narrowly scoped protection while the dash is in the
 * air plus AIR_DASH.grace seconds after touch-down — never longer — and, while hovering, a bounded
 * hover extension if the landing spot in the destination lane is briefly blocked (moving obstacles).
 */
export class AirDashGuard {
  private active = false;
  private grace = 0;
  /** total extension used by the current / last dash (s) */
  extended = 0;
  reset() {
    this.active = false;
    this.grace = 0;
    this.extended = 0;
  }
  /** @returns true while collisions must be ignored for the dash */
  update(p: { isAirDash: boolean; vphase: string; timeToLand: number; airDashTo: number; extendAirDash(s: number): number }, obstacles: readonly LiveObstacle[], speed: number, dt: number): boolean {
    if (p.isAirDash) {
      if (!this.active) this.extended = 0;
      this.active = true;
      if (p.vphase === 'hold' && !landingClear(obstacles, p.airDashTo, p.timeToLand, speed)) this.extended += p.extendAirDash(dt);
      return true;
    }
    if (this.active) {
      // first frame after touch-down (it happened during the previous step): dt already elapsed
      this.active = false;
      this.grace = AIR_DASH.grace;
    }
    if (this.grace > 0) {
      this.grace -= dt;
      return this.grace >= -1e-9;
    }
    return false;
  }
}
