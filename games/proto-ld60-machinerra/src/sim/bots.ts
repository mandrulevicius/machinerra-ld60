/**
 * What the workshop does to bodies, as gear stats the Sim already reads (`Stats`, `sim/gear.ts`): a crew robot's rank
 * (each robot its own, kept in the hub's `roster`, `hub/workshop.ts`) and the Communicator's chassis (the frame under
 * his gear). Plain TS. Add a rank bonus for a new role in `RANK_WORK`; add a chassis part with a `CHASSIS` row.
 */
import { ROLES, type Role } from './defs';
import type { Stats } from './gear';

/** A crew robot's rank: 0 as built, up to `RANK_MAX`. */
export const RANK_MAX = 3;
export const RANK_NAMES = ['As built', 'Tuned', 'Overhauled', 'Masterwork'];
/** Each rank: this share of the role's oil more, this much armour, and the role's work (`RANK_WORK`) this much better (percent). */
export const RANK = { oil: 0.2, armour: 4, work: 15 };
/** What "work" is for each role: the stat a rank raises. */
export const RANK_WORK: Record<Exclude<Role, 'controller'>, (keyof Stats)[]> = {
  gatherer: ['gather'],
  guard: ['dmg'],
  repairer: ['repair'],
  mule: ['magnet', 'speed'],
  marksman: ['dmg', 'range'],
  boilermancer: ['dmg'],
  lamplighter: ['speed'],
  stalker: ['dmg'],
};

/** The stats a robot's rank gives it. */
export function rankStats(role: Role, rank: number): Stats {
  const r = Math.max(0, Math.min(RANK_MAX, Math.floor(rank || 0)));
  if (!r || role === 'controller') return {};
  const out: Stats = { oil: Math.round(ROLES[role].hp * RANK.oil * r), armour: RANK.armour * r };
  for (const k of RANK_WORK[role]) out[k] = (out[k] ?? 0) + RANK.work * r;
  return out;
}

/** The Communicator's chassis: each part has levels, each level adds `per`. */
export type ChassisId = 'tank' | 'boiler' | 'plating' | 'pistons';
export const CHASSIS: Record<ChassisId, { name: string; text: string; per: Stats; max: number }> = {
  tank: { name: 'Oil tank', text: 'A bigger tank: more oil to lose before you go down.', per: { oil: 25 }, max: 3 },
  boiler: { name: 'Boiler', text: 'More steam, and it builds back faster.', per: { steam: 15, steamRegen: 10 }, max: 3 },
  plating: { name: 'Riveted plating', text: 'Plates over the joints: less damage taken.', per: { armour: 5 }, max: 3 },
  pistons: { name: 'Leg pistons', text: 'Longer strides.', per: { speed: 6 }, max: 3 },
};
export const CHASSIS_IDS = Object.keys(CHASSIS) as ChassisId[];

/** The stats of the chassis levels fitted. */
export function chassisStats(levels: Partial<Record<ChassisId, number>>): Stats {
  const out: Stats = {};
  for (const id of CHASSIS_IDS) {
    const n = Math.max(0, Math.min(CHASSIS[id].max, Math.floor(levels[id] ?? 0)));
    for (const [k, v] of Object.entries(CHASSIS[id].per) as [keyof Stats, number][]) if (n) out[k] = (out[k] ?? 0) + v * n;
  }
  return out;
}

/** Two stat sets added. */
export function addStats(a: Stats, b: Stats): Stats {
  const out: Stats = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof Stats, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}
