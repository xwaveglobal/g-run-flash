import type { CareerStats } from '../meta/Career.ts';
/** Persistent player profile in localStorage (wrapped: storage can be blocked). */

/** v1.17 and older car ids → the v1.18 line-up (bought cars map to the tier of what was paid) */
const LEGACY_CAR: Record<string, string> = {
  pearl: 'zenith', midnight: 'volt', aurora: 'volt', solar: 'phantom', wedge: 'phantom',
  muscle: 'inferno', bubble: 'inferno', cyber: 'nexus', legend: 'nexus',
};
function migrateCars(ids: string[]) {
  const out = new Set<string>(['zenith']);
  for (const id of ids) out.add(LEGACY_CAR[id] ?? id);
  return [...out];
}
export interface SaveData {
  best: number;
  bestDistance: number;
  wallet: number;
  totalRuns: number;
  vehicle: string;
  unlocked: string[];
  upgrades: { engine: number; shield: number; magnet: number };
  missions: { active: { id: string; progress: number }[]; completed: number; rank: number };
  settings: { sound: boolean; music: boolean; quality: 'high' | 'medium' | 'low'; gfx3?: boolean; speed: 'easy' | 'normal' | 'hard'; assist?: boolean; comfort?: boolean; autoClaim?: boolean; vibrate?: boolean; lang?: string; /** v4.6 "Camera motion": race camera moves with the car (default off = fixed view) */ camMotion?: boolean };
  /** rewarded "free coins": day key + how many claimed that day */
  adFreeDay?: string;
  adFreeCount?: number;
  /** first-run training finished (or skipped) */
  tutorialDone?: boolean;
  /** last chosen track ('endless' or a course id) */
  track: string;
  /** best stars (0–3) per course id */
  trackStars: Record<string, number>;
  /** best score per track id (incl. 'endless') */
  trackBest: Record<string, number>;
  /** bumped when default settings change, to migrate old saves */
  settingsRev?: number;

  // ---- live-ops / meta
  /** pilot name shown on leaderboards */
  name: string;
  /** stable random id → avatar colour, sample-data seed */
  pid: number;
  /** avatar index (random on first launch, changeable in Settings) */
  avatar: number;
  /** ISO country code (flag on leaderboards); auto-detected until the player picks one */
  country: string;
  countryAuto: boolean;
  /** v1 rank stars — no longer used (v2 rank comes from expBest) */
  bolts: number;
  /** v2: best single-run EXP (= the player's rank, docs/GAME-DESIGN.md) */
  expBest: number;
  /** v2: best run EXP this week (weekly board) */
  expWeek: number;
  /** v2: best run EXP on Track 2 (the only road to S / SS / SSS) */
  exp2Best: number;
  /** v2: old save already converted (retired items/upgrades refunded as coins) */
  v2?: boolean;
  /** v2: cars bought with coins in v1 above the rank were re-locked + refunded */
  carsRelocked?: boolean;
  /** v2: special picked for the next race (one per race) */
  special?: 'super' | 'hyper' | 'escape' | null;
  /** mission rewards waiting for a manual claim (auto-claim off) */
  pendingMissions: { text: string; reward: number }[];
  /** Step 06.5: classes (A and up) whose first-promotion celebration the player has acknowledged */
  classCelebrated?: string[];
  /** v4.6.1: C / B celebrations added — classes already passed were marked as seen (no back-pay) */
  classLowSeen?: boolean;
  /** consumable items (equipped on the track screen, used in a run) */
  items: { super: number; hyper: number; shield: number; escape: number; turbo: number; magnet: number; double: number; life: number };
  /** which owned items are equipped for the next run */
  equip: { super: boolean; hyper: boolean; shield: boolean; escape: boolean; turbo: boolean; magnet: boolean; double: boolean; life: boolean };
  /** best score this week (leaderboard "This week") */
  weekKey: string;
  weekBest: number;
  /** daily check-in: last claimed day + streak (1..7) */
  checkDay: string;
  checkStreak: number;
  /** daily quests: day key + progress per quest id + claimed flags + daily points */
  dailyDay: string;
  dailyProg: Record<string, number>;
  dailyClaimed: string[];
  dailyPts: number;
  dailyChests: number[];
  /** tournaments: per event instance key → best score, claimed prize */
  events: Record<string, { best: number; claimed?: boolean; rank?: number }>;
  trophies: { gold: number; silver: number; bronze: number };
  /** purchases (IAP) */
  noAds: boolean;
  starterBought: boolean;
  passUntil: number;
  passDay: string;
  purchases: number;
  /** last time the game saved (for the welcome-back gift) */
  lastSeen: number;
  /** day the welcome-back gift was given / the daily popup was shown */
  giftDay: string;
  popDay: string;
  /** one-off / daily reward popups (entry, launch, share, invite, rate) */
  perks: { profileSeen?: boolean; avatarPicked?: boolean; entry?: boolean; launch?: boolean; shareDay?: string; inviteDay?: string; invites?: number; rated?: boolean; rateAsked?: boolean; countryDetected?: boolean; kit2?: boolean };
  /** v2.2: key of the Bonus event already played (one play per event) */
  bonusPlayed?: string;
  /** v4.6: plays used in the current Bonus event (key = event start) */
  bonusPlays?: { key: string; n: number };
  /** v2.2 career missions: lifetime counters + tiers paid (src/meta/Career.ts) */
  career?: CareerStats;
  /** danger-hint gestures the player has answered (hint stops after 3) */
  hintsLearned?: Record<string, number>;
}

const SETTINGS_REV = 3;

// storage key kept from the original working title so existing progress carries over
const KEY = 'xwave-sky-rush-v1';

const defaults = (): SaveData => ({
  best: 0,
  bestDistance: 0,
  wallet: 0,
  totalRuns: 0,
  vehicle: 'zenith',
  unlocked: ['zenith'],
  upgrades: { engine: 0, shield: 0, magnet: 0 },
  missions: { active: [], completed: 0, rank: 1 },
  settings: {
    sound: true,
    music: true,
    quality: 'medium', // v4.2: MEDIUM until device benchmarks exist (a slow device still steps down)
    gfx3: true,
    speed: 'normal',
    assist: true,
    comfort: true,
    autoClaim: true,
  },
  settingsRev: SETTINGS_REV,
  track: 'future-city',
  trackStars: {},
  trackBest: {},
  name: '',
  pid: Math.floor(Math.random() * 1e9),
  avatar: Math.floor(Math.random() * 32),
  country: '',
  countryAuto: true,
  bolts: 0,
  expBest: 0,
  expWeek: 0,
  exp2Best: 0,
  v2: true,
  special: 'super',
  pendingMissions: [],
  items: { super: 1, hyper: 0, shield: 0, escape: 0, turbo: 0, magnet: 0, double: 0, life: 0 },
  equip: { super: false, hyper: false, shield: false, escape: false, turbo: false, magnet: false, double: false, life: false },
  weekKey: '',
  weekBest: 0,
  checkDay: '',
  checkStreak: 0,
  dailyDay: '',
  dailyProg: {},
  dailyClaimed: [],
  dailyPts: 0,
  dailyChests: [],
  events: {},
  trophies: { gold: 0, silver: 0, bronze: 0 },
  noAds: false,
  starterBought: false,
  passUntil: 0,
  passDay: '',
  purchases: 0,
  lastSeen: 0,
  giftDay: '',
  popDay: '',
  perks: {},
});

export function loadSave(): SaveData {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<SaveData>;
    // defaults refresh (v1.10): HIGH graphics, music and sound ON — applied once to old saves
    if (p.settingsRev !== SETTINGS_REV && p.settings) {
      p.settings.quality = 'high';
      p.settings.sound = true;
      p.settings.music = true;
    }
    // v4.2 three graphics presets: the old default HIGH becomes MEDIUM once (a stored LOW stays LOW);
    // the player can pick HIGH again in Settings
    if (p.settings && !p.settings.gfx3) {
      if (p.settings.quality === 'high') p.settings.quality = 'medium';
      p.settings.gfx3 = true;
    }
    return {
      ...d,
      ...p,
      upgrades: { ...d.upgrades, ...(p.upgrades ?? {}) },
      missions: { ...d.missions, ...(p.missions ?? {}) },
      settings: { ...d.settings, ...(p.settings ?? {}) },
      trackStars: { ...(p.trackStars ?? {}) },
      trackBest: { ...(p.trackBest ?? {}) },
      items: { ...d.items, ...(p.items ?? {}) },
      equip: { ...d.equip, ...(p.equip ?? {}) },
      events: { ...(p.events ?? {}) },
      perks: { ...(p.perks ?? {}) },
      trophies: { ...d.trophies, ...(p.trophies ?? {}) },
      dailyProg: { ...(p.dailyProg ?? {}) },
      dailyClaimed: Array.isArray(p.dailyClaimed) ? p.dailyClaimed : [],
      dailyChests: Array.isArray(p.dailyChests) ? p.dailyChests : [],
      unlocked: migrateCars(Array.isArray(p.unlocked) && p.unlocked.length ? p.unlocked : d.unlocked),
      vehicle: LEGACY_CAR[p.vehicle as string] ?? (typeof p.vehicle === 'string' ? p.vehicle : d.vehicle),
      // older saves may hold an auto-detected LOW: start on HIGH once, then respect the player's choice
      ...(p.settingsRev !== SETTINGS_REV ? { settingsRev: SETTINGS_REV } : {}),
      // a save written by v1 has no v2 flag → Game converts it once
      v2: p.v2 === true,
    };
  } catch {
    return d;
  }
}

export function writeSave(s: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — progress lives for this session only */
  }
}

/** Local calendar day key (YYYY-MM-DD) — dailies reset at the player's midnight. */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday 00:00 local of the week containing d. */
export function weekStart(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

/** Week key = date of its Monday. */
export function weekKey(d = new Date()) {
  return dayKey(weekStart(d));
}
