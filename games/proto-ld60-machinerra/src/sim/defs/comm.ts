/**
 * The Communicator: weapons, the kick, steam, the interaction timings, and the leeway when his oil runs out (revive, winch).
 * Add a weapon: a `WeaponId` and its `WEAPONS` entry.
 */
import type { StatusId } from '../effects';
import type { DamageType } from './base';
import { LOOT } from './loot';

/**
 * Use is one press (Minos, 2026-10-18). A timed action (a ruin searched or decoded, a place's work) starts with the press and runs
 * while the Communicator stays within `zone` times its reach (the press itself needs the plain reach), fighting included; outside
 * it pauses, back inside it goes on, and a hit does not cancel it. The lift and a dungeon's way down ask first: a second press
 * within `confirm` seconds does it.
 */
export const ACTION = { zone: 1.8, confirm: 2 };

export const WEAPON = {
  controller: { dmg: 10, rate: 0.2, speed: 640, range: 420 },
  guard: { dmg: 8, rate: 0.55, speed: 560, range: 230 },
  marksman: { dmg: 22, rate: 1.5, speed: 900, range: 380 },
};

/**
 * The Communicator's weapons, in hand one at a time. They start with the shovel: a melee swing in an arc toward the aim
 * that knocks hornets back. More come later (how they are found is not designed yet); a gun shoots `WEAPON.controller`
 * bolts and spends steam.
 */
export type WeaponId =
  | 'mainBrush' // the Princess's spare (P58)
  | 'oldEarful' // Hob's masterpiece, his gift at the fifth step of his track (P52)
  | 'shovel' | 'steamGun' | 'arcGun' | 'pistonCannon' | 'kettleScalder' | 'censerGun' | 'slingshot' | 'hornetSpear' | 'pipeWrench' | 'tazer' | 'rivetScatter' | 'fangWhip' | 'ectoRepeater' | 'hookhand' | 'megaphone' | 'hemoFlail' | 'iceLance';

/**
 * What a weapon does beyond its hit (crafted weapons, `sim/gear.ts`): `crit` chance of a double hit, `bounce` a critical
 * shot jumps on to the nearest other foe, `chain` a melee hit arcs on to `n` more foes within `range` for `share` of the
 * damage, `pellets` a gun fires `n` bolts in a `spread` cone, `ammo: 'scrap'` a gun spends a scrap a shot instead of steam.
 * `shove` a gun's hit pushes the foe along the shot at that speed (negative: toward the shooter, the harpoon's pull);
 * `rider` a hit puts that status on the foe at that chance (on top of the type's own); `pump` every `hits`th hit heals
 * every ally within `r` (the wielder too) by `heal`.
 */
export interface WeaponExtra {
  crit?: number; bounce?: boolean; chain?: { n: number; range: number; share: number }; pellets?: { n: number; spread: number }; ammo?: 'scrap';
  shove?: number; rider?: { status: StatusId; chance: number; stacks?: number }; pump?: { hits: number; heal: number; r: number };
  /** The Main Brush (P58, `sim/brush.ts`): small foes struck fly outward and crash, loose scrap and copper sweep to his feet. */
  brush?: boolean;
  /** Old Earful (P52): a hit flings the foe (its crashes count), and every shot is loud: it wakes the nearest sleeping hive (`PERK_FX.oldEarful`).
   *  With `fling`, `shove` is the whole volley's: each pellet pushes `shove / n`, so a foe is thrown by the share of the cone that lands on it. */
  fling?: boolean; loud?: boolean;
}

/** `type`: its damage type (sim/effects.ts `DAMAGE_TYPES`); a foe weak to it takes `WEAK` times the hit, one resisting it `RESIST` (`FoeDef.weak`, `resist`). */
export interface MeleeWeapon extends WeaponExtra { kind: 'melee'; name: string; type: DamageType; dmg: number; rate: number; reach: number; arc: number; knock: number }

export interface GunWeapon extends WeaponExtra { kind: 'gun'; name: string; type: DamageType; dmg: number; rate: number; speed: number; range: number }

export const WEAPONS: Record<WeaponId, MeleeWeapon | GunWeapon> = {
  shovel: { kind: 'melee', name: 'Shovel', type: 'impact', dmg: 9, rate: 0.42, reach: 48, arc: 2, knock: 260 },
  // The Princess's spare main brush (P58 B): a full circle round him, short, weak; it makes space and tidies (guesses).
  mainBrush: { kind: 'melee', name: 'Main Brush', type: 'impact', dmg: 5, rate: 0.55, reach: 56, arc: Math.PI * 2, knock: 460, brush: true },
  // Hob's masterpiece (P52): a twin-bore blunderbuss, a close-range blast that throws what it hits (crash fuel); so loud it wakes the nearest hive.
  // Guesses: the range (100: most of the cone lands on a boar at its own range, one pellet in two by 90 px); the shove (1000 = the kick's `KICK.knock`: all seven pellets throw a foe as far as a kick, each pellet that lands a seventh).
  oldEarful: { kind: 'gun', name: 'Old Earful', type: 'impact', dmg: 7, rate: 1.1, speed: 520, range: 100, pellets: { n: 7, spread: 0.9 }, shove: 1000, fling: true, loud: true },
  steamGun: { kind: 'gun', name: 'Steam gun', type: 'pierce', ...WEAPON.controller },
  // The other biomes' shrine guns (`BIOMES.<biome>.shrine`), each aimed at what lives there: the jungle's boars fear shock,
  // the city's commuters break on impact, the Frostspine's bear on steam, and the Wastes' vampires burn.
  arcGun: { kind: 'gun', name: 'Leyden arc-gun', type: 'shock', dmg: 8, rate: 0.26, speed: 620, range: 380, crit: 0.25, bounce: true },
  pistonCannon: { kind: 'gun', name: 'Piston cannon', type: 'impact', dmg: 22, rate: 0.6, speed: 540, range: 420 },
  kettleScalder: { kind: 'gun', name: 'Kettle scalder', type: 'scald', dmg: 4, rate: 0.34, speed: 480, range: 240, pellets: { n: 4, spread: 0.35 } },
  censerGun: { kind: 'gun', name: 'Censer gun', type: 'fire', dmg: 12, rate: 0.28, speed: 600, range: 400, crit: 0.15 },
  // Crafted at the workbench (sim/gear.ts holds their recipes and looks).
  slingshot: { kind: 'gun', name: 'Steam-propelled slingshot', type: 'impact', dmg: 6, rate: 0.3, speed: 700, range: 380, crit: 0.35, bounce: true, ammo: 'scrap' },
  hornetSpear: { kind: 'melee', name: "Hornet's spear", type: 'pierce', dmg: 24, rate: 0.95, reach: 96, arc: 0.7, knock: 620 },
  pipeWrench: { kind: 'melee', name: 'Pipe wrench', type: 'impact', dmg: 14, rate: 0.55, reach: 50, arc: 1.8, knock: 380 },
  tazer: { kind: 'melee', name: 'Heretic tazer', type: 'shock', dmg: 7, rate: 0.3, reach: 42, arc: 1.6, knock: 60, chain: { n: 2, range: 110, share: 0.6 } },
  rivetScatter: { kind: 'gun', name: 'Rivet scatter', type: 'pierce', dmg: 5, rate: 0.7, speed: 560, range: 260, pellets: { n: 5, spread: 0.5 } },
  // Old Rattlejaw's (the desert dungeon's mini-boss, sim/dungeon.ts): its own tail, a wide lash that poisons.
  // Ghost bullets (P44, the Ether): its `dark` bolts land on ghosts with or without the Esteemed Ghost's touch.
  ectoRepeater: { kind: 'gun', name: 'Ecto-repeater', type: 'dark', dmg: 7, rate: 0.24, speed: 600, range: 380, ammo: 'scrap' },
  fangWhip: { kind: 'melee', name: "Rattlejaw's fang whip", type: 'acid', dmg: 11, rate: 0.5, reach: 86, arc: 2.6, knock: 200, crit: 0.1 },
  // The other dungeons' mini-bosses (dungeons.md): Captain Croc's hook reels a foe in, the Mall Cop's megaphone shoves a
  // cone back and Staggers it, the Bishop's flail heals the crew every sixth hit, the Snowcat's auger Chills (three Freeze).
  hookhand: { kind: 'gun', name: 'Hookhand harpoon', type: 'pierce', dmg: 16, rate: 0.8, speed: 640, range: 340, shove: -900 },
  megaphone: { kind: 'gun', name: 'Megaphone blaster', type: 'impact', dmg: 4, rate: 0.8, speed: 520, range: 200, pellets: { n: 6, spread: 0.7 }, shove: 420, rider: { status: 'staggered', chance: 0.5 } },
  hemoFlail: { kind: 'melee', name: 'Hemo-pump flail', type: 'impact', dmg: 13, rate: 0.6, reach: 62, arc: 2.2, knock: 320, pump: { hits: 6, heal: 12, r: 170 } },
  iceLance: { kind: 'melee', name: 'Ice-auger lance', type: 'cold', dmg: 15, rate: 0.75, reach: 104, arc: 0.6, knock: 300, rider: { status: 'chilled', chance: 1 } },
};

/** The kick (F, pad B; no perk needed): a boot in front, little damage, a long shove; its own cooldown, any weapon in hand. The Kicker's line's perks shape it (`kickOf`, sim/perks.ts). */
// The kick itself does no damage (Minos 2026-10-19): what it launches does, by crashing.
// `after` (Minos 2026-10-19: the cooldown by target; the seconds are guesses): a kick that landed on an elite waits this much longer
// for the next, on a mini-boss longer still, on a boss the longest (the heaviest thing it struck counts), so a big one is not kick-spammed.
export const KICK = { dmg: 0, rate: 0.9, reach: 60, arc: 1.7, knock: 1000, after: { elite: 0.6, mini: 1.4, boss: 2.2 } };

/** The Expeditioner's scavenger's eye (`scavenger`): loot pulled from this many times as far, ruins searched this much faster. */
export const SCAVENGER = { magnet: 2, search: 2 };

/** The Communicator's steam: each bolt spends some; it builds back up after a short pause. */
export const STEAM = { max: 100, shot: 8, regen: 26, delay: 0.45 };

/**
 * Fail forward: when the Communicator's oil runs out with no reserve, the Oracle winches them back to the lift. The fee
 * is scrap (`cost` of the scrap carried) and time: `clock` seconds of the mission's day are gone when they land, so each
 * fall brings the night closer.
 */
export const WINCH = { time: 2.5, cost: 0.25, oil: 0.6, clock: 45 };

/**
 * Revive: oil is rare, so the leeway for a slip is built from it. A can picked up beyond what fills the Communicator's
 * bar goes into a reserve (`cans` cans at most, each `LOOT.oil` oil; shown on the HUD). While it holds a can's worth
 * (`cost`), running out of oil means a short downed moment (`time`), then back up in place with `oil` of the bar and a
 * beat of grace; that spends the can. With no reserve the winch above is the fail-forward. `start` is the oil in the
 * reserve at the start of a mission.
 * The moment he is back (Minos: bigger text, a delay, a push, a second of invulnerability, slowed time; only `grace` is his number, the rest are guesses):
 * `stand` s before he acts again, foes within `push.radius` px shoved away at `push.force` px/s (a shove, no damage),
 * time slowed to `slow.factor` for `slow.hold` s then eased back over `slow.ease` s. `stand`, `slow` and `grace` are real seconds (`slowStep` stretches the sim time they take).
 */
export const REVIVE = {
  cans: 3, cap: 3 * LOOT.oil, start: LOOT.oil, cost: LOOT.oil, time: 1.3, oil: 0.35,
  grace: 1,
  stand: 0.4,
  push: { radius: 160, force: 520 },
  slow: { factor: 0.3, hold: 0.35, ease: 0.55 },
};
