/**
 * What the NPC quest lines' perks do in a mission (`PERKS` in `hub/state.ts`, unlocked by `hub/lines.ts`): their numbers
 * and the kick they shape. The Sim reads them where each rule lives (`kickOf` in the controller's step, the rest inline).
 */
import { KICK } from './defs';

export const PERK_FX = {
  /** The Kicker's line: a longer, harder, wider, quicker boot, and the leap. */
  longBoot: { reach: 1.4, knock: 1.3 },
  dashKick: { dist: 96, time: 0.14 },
  /** The Iron Toe doubles crash damage (Minos 2026-10-19; it was the kick's own damage, which is now none). */
  ironToe: { crash: 2 },
  quickBoot: { rate: 0.6 },
  wideBoot: { arc: 1.8 },
  /** The Expeditioner's line: quick hands opens a ruin in `search` seconds and pours back this share of steam (never oil: oil is a life); the working rate and magnet multiply. */
  quickHands: { search: 0.2, steam: 1 },
  prospector: 1.3,
  packMule: 1.5,
  /** The Trader's line: steam regen multiplies; a revive pours this share of oil back. */
  snacks: 1.25,
  goodOil: 0.6,
  /** The Trader's other standing orders: the carry strip holds this many more pieces of old tech (`packSack`); ruins and elites give this much more copper (`wireOrder`). */
  packSack: 2,
  wireOrder: 1.5,
  /** The Princess's docks (P58 H): Moss in the brush, the Main Brush's swing and sweep reach this much farther. */
  mossBrush: 1.25,
  /** Your house: a bed. You land rested, Hasted for this many seconds. */
  homeRest: { haste: 60 },
  /** The Planner's line: barrage shells' damage multiplies. */
  bigShells: 1.5,
  /** The Wanderer's improvements (hub `ZEPPELIN`): call blasts' damage and every call's reach multiply. */
  zepBoilers: 1.4,
  zepMast: 1.5,
  /**
   * The Rising District's city perks (P55 part B, `hub/district.ts`; every number a guess): Pure Copper Wiring (`shockJumps`: a Shock chain jumps this many
   * more), Superheated Steam (`scaldBurst`: a Scalded foe that dies Scalds the foes this many px round it), Pneumatic Post (`lootPull`: px of pull on all loot),
   * Hot Water Mains (the land's tap holds `tap.amount` times as much and mends `tap.rate` times as fast), the Sensei's Hall (`kick`: the kick's cooldown times this),
   * Militia Muster (a Brass Guard goes down with the lift for `militia` seconds). The rest are flags in `Sim.perks`: Smokeless Combustion, the Crow's Nest.
   */
  shockJumps: 2,
  scaldBurst: 60,
  lootPull: 200,
  tap: { amount: 1.5, rate: 2 },
  kick: 0.75,
  militia: 120,
};

/** The kick as the perks shape it. */
export function kickOf(perks: Set<string>) {
  const has = (p: string) => perks.has(p);
  return {
    dmg: KICK.dmg,
    rate: KICK.rate * (has('quickBoot') ? PERK_FX.quickBoot.rate : 1) * (has('senseiHall') ? PERK_FX.kick : 1),
    reach: KICK.reach * (has('longBoot') ? PERK_FX.longBoot.reach : 1),
    arc: KICK.arc * (has('wideBoot') ? PERK_FX.wideBoot.arc : 1),
    knock: KICK.knock * (has('longBoot') ? PERK_FX.longBoot.knock : 1),
  };
}
