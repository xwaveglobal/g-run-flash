/**
 * v2 BONUS events (docs/GAME-DESIGN.md §5) — replace the old cups.
 *
 * v4.6 (owner): every hour (local time: 00:00, 01:00, …) a Bonus road opens for 30 minutes and can be
 * played up to 3 times. Each event is a brand-new everyday place (desert → forest → country → sea,
 * rotating), a 5-minute road with a FINISH line (congratulations + the coins earned), coins only. Special items lie on the road and fire
 * by themselves when picked up. Pure logic — no DOM.
 */
import type { BonusWorld } from '../gameplay/Spawner.ts';

export const BONUS = {
  everyHours: 1,
  openMinutes: 30,
  /** plays per event (v4.6) */
  maxPlays: 3,
  /** non-stop minutes from START to FINISH (v2.2: a short 5-minute road, one play per event) */
  raceMinutes: 5,
  /** coins for reaching the finish line (× speed-level coin multiplier) */
  finishCoins: 300,
  themes: ['desert', 'forest', 'country', 'sea'] as BonusWorld[],
};

export const BONUS_NAME: Record<BonusWorld, string> = {
  desert: 'Desert Highway',
  forest: 'Pine Forest',
  country: 'Country Road',
  sea: 'Ocean Causeway',
};

/** section names along each Bonus road (one per ~5 minutes) */
export const BONUS_SECTIONS: Record<BonusWorld, string[]> = {
  desert: ['Dune Gate', 'Cactus Flats', 'Red Mesas', 'Mirage Mile', 'Canyon Run', 'Sunset Straight'],
  forest: ['Pine Gate', 'Fern Valley', 'Old Bridge', 'Misty Hills', 'Ranger Pass', 'Lakeside'],
  country: ['Farm Gate', 'Wheat Fields', 'Windmill Row', 'Hay Bales', 'Barn Bend', 'Village Lane'],
  sea: ['Harbour Gate', 'Palm Islets', 'Sailing Bay', 'Lighthouse Point', 'Coral Reef', 'Sunset Pier'],
};

export interface BonusSlot {
  theme: BonusWorld;
  start: number;
  end: number;
  key: string;
}

/** the slot that contains `now` (open for its first BONUS.openMinutes) */
function slotAt(now: number): BonusSlot {
  const d = new Date(now);
  const h = d.getHours();
  const startH = h - (h % BONUS.everyHours);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), startH, 0, 0, 0).getTime();
  // rotate the theme across days too (the same hour shows a different place tomorrow)
  const dayIdx = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  const idx = dayIdx * (24 / BONUS.everyHours) + startH / BONUS.everyHours;
  const theme = BONUS.themes[((idx % BONUS.themes.length) + BONUS.themes.length) % BONUS.themes.length];
  return { theme, start, end: start + BONUS.openMinutes * 60000, key: `${start}` };
}

/** live event (null when closed) + the next one */
export function bonusState(now = Date.now()) {
  const cur = slotAt(now);
  const live = now < cur.end ? cur : null;
  const next = live ? slotAt(cur.start + BONUS.everyHours * 3600000) : slotAt(cur.start + BONUS.everyHours * 3600000);
  return { live, next };
}

/** plays already used in this event (save.bonusPlays = { key, n }) */
export const bonusPlaysUsed = (rec: { key: string; n: number } | undefined, key: string) => (rec && rec.key === key ? rec.n : 0);

